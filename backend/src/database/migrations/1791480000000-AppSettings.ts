import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin-editable platform settings (AI provider keys/models) + the permission to manage them. */
export class AppSettings1791480000000 implements MigrationInterface {
  name = 'AppSettings1791480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `app_settings` (`key` varchar(100) NOT NULL, `value` text NULL, `encrypted` tinyint NOT NULL DEFAULT 0, `updated_by` varchar(36) NULL, `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (`key`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      "INSERT INTO `permissions` (`id`, `key`, `description`) SELECT UUID(), 'settings.manage', 'Manage platform settings (AI provider keys)' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `key` = 'settings.manage')",
    );
    await queryRunner.query(
      "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`) SELECT r.`id`, p.`id` FROM `roles` r JOIN `permissions` p ON p.`key` = 'settings.manage' WHERE r.`name` = 'admin'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM `permissions` WHERE `key` = 'settings.manage'");
    await queryRunner.query('DROP TABLE `app_settings`');
  }
}
