import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole } from '../common/enums';
import { Brand } from './entities/brand.entity';
import { BrandMember } from './entities/brand-member.entity';

const ROLE_RANK: Record<BrandRole, number> = {
  [BrandRole.VIEWER]: 1,
  [BrandRole.EDITOR]: 2,
  [BrandRole.ADMIN]: 3,
  [BrandRole.OWNER]: 4,
};

export interface BrandAccess {
  brand: Brand;
  role: BrandRole;
}

/**
 * Tenant isolation: every brand-scoped operation goes through here.
 * Non-members get BRAND_NOT_FOUND (not 403) so brand ids cannot be probed.
 */
@Injectable()
export class BrandAccessService {
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(BrandMember) private readonly members: Repository<BrandMember>,
  ) {}

  async assert(userId: string, brandId: string, minRole: BrandRole = BrandRole.VIEWER): Promise<BrandAccess> {
    const membership = await this.members.findOne({
      where: { brandId, userId },
      relations: { brand: true },
    });
    if (!membership?.brand || membership.brand.deletedAt) {
      throw AppException.notFound(ErrorCode.BRAND_NOT_FOUND, 'Brand not found');
    }
    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw AppException.forbidden(
        ErrorCode.BRAND_ACCESS_DENIED,
        `This action requires the "${minRole}" role on this brand`,
      );
    }
    return { brand: membership.brand, role: membership.role };
  }

  /** Brand ids the user can access (for cross-brand list queries). */
  async accessibleBrandIds(userId: string): Promise<string[]> {
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin('m.brand', 'b')
      .where('m.user_id = :userId', { userId })
      .andWhere('b.deleted_at IS NULL')
      .select('m.brand_id', 'brandId')
      .getRawMany<{ brandId: string }>();
    return rows.map((r) => r.brandId);
  }

  static hasRole(role: BrandRole, minRole: BrandRole): boolean {
    return ROLE_RANK[role] >= ROLE_RANK[minRole];
  }
}
