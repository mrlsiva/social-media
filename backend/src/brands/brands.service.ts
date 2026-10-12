import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, UsageMetric } from '../common/enums';
import { UsageService } from '../subscriptions/usage.service';
import { User } from '../users/entities/user.entity';
import { BrandAccessService } from './brand-access.service';
import {
  AddBrandMemberDto,
  BrandQueryDto,
  BrandResponseDto,
  BrandSettingsDto,
  CreateBrandDto,
  UpdateBrandDto,
  UpdateBrandMemberDto,
} from './dto/brand.dto';
import { Brand } from './entities/brand.entity';
import { BrandMember } from './entities/brand-member.entity';
import { BrandSetting } from './entities/brand-setting.entity';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 150) || 'brand';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(BrandSetting) private readonly settings: Repository<BrandSetting>,
    @InjectRepository(BrandMember) private readonly members: Repository<BrandMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: BrandAccessService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: BrandQueryDto): Promise<PaginatedResult<BrandResponseDto>> {
    const qb = this.members
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.brand', 'b')
      .leftJoinAndSelect('b.settings', 's')
      .where('m.user_id = :userId', { userId })
      .andWhere('b.deleted_at IS NULL')
      .orderBy('b.name', 'ASC')
      .skip(query.skip)
      .take(query.limit);
    if (query.search) qb.andWhere('b.name LIKE :search', { search: `%${query.search}%` });

    const [rows, total] = await qb.getManyAndCount();
    return new PaginatedResult(
      rows.map((m) => this.toResponse(m.brand, m.role)),
      total,
      query.page,
      query.limit,
    );
  }

  async get(userId: string, brandId: string): Promise<BrandResponseDto> {
    const { role } = await this.access.assert(userId, brandId);
    const brand = await this.brands.findOneOrFail({ where: { id: brandId }, relations: { settings: true } });
    return this.toResponse(brand, role);
  }

  async create(userId: string, dto: CreateBrandDto): Promise<BrandResponseDto> {
    await this.usage.assertWithinLimit(userId, UsageMetric.BRANDS);
    const slug = await this.uniqueSlug(userId, dto.name);

    const brand = await this.brands.manager.transaction(async (em) => {
      const created = await em.save(
        em.create(Brand, {
          ownerId: userId,
          name: dto.name,
          slug,
          description: dto.description ?? null,
          website: dto.website ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          primaryColor: dto.primaryColor ?? '#0078B8',
          secondaryColor: dto.secondaryColor ?? '#F57AA8',
        }),
      );
      await em.save(em.create(BrandSetting, { brandId: created.id, ...this.settingsPatch(dto.settings) }));
      await em.save(em.create(BrandMember, { brandId: created.id, userId, role: BrandRole.OWNER }));
      return created;
    });

    await this.audit.log({ action: 'brand.create', userId, brandId: brand.id, entityType: 'brand', entityId: brand.id });
    return this.get(userId, brand.id);
  }

  async update(userId: string, brandId: string, dto: UpdateBrandDto): Promise<BrandResponseDto> {
    await this.access.assert(userId, brandId, BrandRole.ADMIN);
    const { settings, ...fields } = dto;
    await this.brands.manager.transaction(async (em) => {
      if (Object.keys(fields).length > 0) await em.update(Brand, { id: brandId }, fields);
      if (settings) await this.applySettings(em.getRepository(BrandSetting), brandId, settings);
    });
    await this.audit.log({ action: 'brand.update', userId, brandId, entityType: 'brand', entityId: brandId, metadata: { fields: Object.keys(dto) } });
    return this.get(userId, brandId);
  }

  async updateSettings(userId: string, brandId: string, dto: BrandSettingsDto): Promise<BrandResponseDto> {
    await this.access.assert(userId, brandId, BrandRole.ADMIN);
    await this.applySettings(this.settings, brandId, dto);
    return this.get(userId, brandId);
  }

  async remove(userId: string, brandId: string): Promise<void> {
    await this.access.assert(userId, brandId, BrandRole.OWNER);
    await this.brands.softDelete({ id: brandId });
    await this.audit.log({ action: 'brand.delete', userId, brandId, entityType: 'brand', entityId: brandId });
  }

  async setLogo(brandId: string, mediaId: string | null, logoUrl: string | null): Promise<void> {
    await this.brands.update({ id: brandId }, { logoMediaId: mediaId, logoUrl });
  }

  // ---------------------------------------------------------------- members

  async listMembers(userId: string, brandId: string) {
    await this.access.assert(userId, brandId);
    const rows = await this.members.find({ where: { brandId }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      avatarUrl: m.user.avatarUrl,
      joinedAt: m.createdAt,
    }));
  }

  async addMember(userId: string, brandId: string, dto: AddBrandMemberDto) {
    const { brand } = await this.access.assert(userId, brandId, BrandRole.ADMIN);
    const invitee = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });
    if (!invitee) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'No account exists with this email. Ask them to register first.');
    }
    if (await this.members.exists({ where: { brandId, userId: invitee.id } })) {
      throw AppException.conflict(ErrorCode.CONFLICT, 'This user is already a member of the brand');
    }
    await this.usage.assertWithinLimit(brand.ownerId, UsageMetric.TEAM_MEMBERS);
    await this.members.save(this.members.create({ brandId, userId: invitee.id, role: dto.role }));
    await this.audit.log({ action: 'brand.member_add', userId, brandId, entityType: 'user', entityId: invitee.id, metadata: { role: dto.role } });
    return this.listMembers(userId, brandId);
  }

  async updateMember(userId: string, brandId: string, memberId: string, dto: UpdateBrandMemberDto) {
    await this.access.assert(userId, brandId, BrandRole.ADMIN);
    const member = await this.members.findOne({ where: { id: memberId, brandId } });
    if (!member) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Member not found');
    if (member.role === BrandRole.OWNER) throw AppException.forbidden(ErrorCode.FORBIDDEN, 'The owner role cannot be changed');
    await this.members.update({ id: memberId }, { role: dto.role });
    return this.listMembers(userId, brandId);
  }

  async removeMember(userId: string, brandId: string, memberId: string) {
    await this.access.assert(userId, brandId, BrandRole.ADMIN);
    const member = await this.members.findOne({ where: { id: memberId, brandId } });
    if (!member) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Member not found');
    if (member.role === BrandRole.OWNER) throw AppException.forbidden(ErrorCode.FORBIDDEN, 'The brand owner cannot be removed');
    await this.members.delete({ id: memberId });
    await this.audit.log({ action: 'brand.member_remove', userId, brandId, entityType: 'user', entityId: member.userId });
  }

  // ---------------------------------------------------------------- helpers

  private async applySettings(repo: Repository<BrandSetting>, brandId: string, dto: BrandSettingsDto): Promise<void> {
    const existing = await repo.findOne({ where: { brandId } });
    const patch = this.settingsPatch(dto);
    if (existing) {
      if (dto.aiSettings) patch.aiSettings = { ...(existing.aiSettings ?? {}), ...dto.aiSettings };
      await repo.save(repo.merge(existing, patch));
    } else {
      await repo.save(repo.create({ brandId, ...patch }));
    }
  }

  private settingsPatch(dto?: BrandSettingsDto): Partial<BrandSetting> {
    if (!dto) return {};
    const patch: Partial<BrandSetting> = {};
    if (dto.defaultLanguage !== undefined) patch.defaultLanguage = dto.defaultLanguage;
    if (dto.defaultTone !== undefined) patch.defaultTone = dto.defaultTone;
    if (dto.defaultCta !== undefined) patch.defaultCta = dto.defaultCta;
    if (dto.timezone !== undefined) patch.timezone = dto.timezone;
    if (dto.defaultHashtags !== undefined) patch.defaultHashtags = dto.defaultHashtags.map((t) => t.replace(/^#/, ''));
    if (dto.aiSettings !== undefined) patch.aiSettings = { ...dto.aiSettings };
    return patch;
  }

  private async uniqueSlug(ownerId: string, name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; await this.brands.exists({ where: { ownerId, slug }, withDeleted: true }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  toResponse(brand: Brand, role: BrandRole): BrandResponseDto {
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      description: brand.description,
      website: brand.website,
      phone: brand.phone,
      email: brand.email,
      address: brand.address,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      role,
      settings: brand.settings
        ? {
            defaultLanguage: brand.settings.defaultLanguage,
            defaultTone: brand.settings.defaultTone,
            defaultCta: brand.settings.defaultCta ?? undefined,
            timezone: brand.settings.timezone,
            defaultHashtags: brand.settings.defaultHashtags ?? [],
            aiSettings: brand.settings.aiSettings ?? {},
          }
        : undefined,
      createdAt: brand.createdAt,
    };
  }
}
