import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('idx_audit_logs_user', ['userId', 'createdAt'])
@Index('idx_audit_logs_brand', ['brandId', 'createdAt'])
@Index('idx_audit_logs_entity', ['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ name: 'brand_id', type: 'varchar', length: 36, nullable: true })
  brandId: string | null;

  /** e.g. auth.login, brand.create, post.publish, social_account.connect */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', name: 'entity_type', length: 50, nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', name: 'entity_id', length: 191, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', name: 'ip_address', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 500, nullable: true })
  userAgent: string | null;

  /** Never contains secrets/tokens. */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;
}
