import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/user.dto';

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
  ) {}

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id }, relations: { roles: true } });
    if (!user) throw AppException.notFound(ErrorCode.NOT_FOUND, 'User not found');
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  async getPasswordHash(id: string): Promise<string> {
    const row = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'User not found');
    return row.passwordHash;
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.users.count({ where: { email: email.toLowerCase() }, withDeleted: true })) > 0;
  }

  async create(data: { email: string; passwordHash: string; firstName: string; lastName?: string | null; timezone?: string }): Promise<User> {
    const defaultRole = await this.roles.findOne({ where: { name: 'user' } });
    const user = this.users.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      timezone: data.timezone ?? 'UTC',
      roles: defaultRole ? [defaultRole] : [],
    });
    return this.users.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.users.update({ id }, dto);
    return this.findById(id);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.update({ id }, { passwordHash });
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  /** Resolves system roles and permissions in a single query. */
  async getAccess(userId: string): Promise<UserAccess> {
    const rows = await this.users.manager.query<{ role: string; permission: string | null }[]>(
      `SELECT r.name AS role, p.\`key\` AS permission
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ?`,
      [userId],
    );
    return {
      roles: [...new Set(rows.map((r) => r.role))],
      permissions: [...new Set(rows.map((r) => r.permission).filter((p): p is string => !!p))],
    };
  }
}
