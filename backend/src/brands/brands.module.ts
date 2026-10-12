import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { BrandAccessService } from './brand-access.service';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { Brand } from './entities/brand.entity';
import { BrandMember } from './entities/brand-member.entity';
import { BrandSetting } from './entities/brand-setting.entity';

/** Global so every feature module can enforce brand isolation via BrandAccessService. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Brand, BrandSetting, BrandMember, User])],
  controllers: [BrandsController],
  providers: [BrandsService, BrandAccessService],
  exports: [BrandsService, BrandAccessService],
})
export class BrandsModule {}
