import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/paginated-result';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Hashtag } from './entities/hashtag.entity';

@Injectable()
export class HashtagsService {
  constructor(@InjectRepository(Hashtag) private readonly hashtags: Repository<Hashtag>) {}

  /** Upserts usage counters for the brand's hashtag library. */
  async recordUsage(brandId: string, tags: string[]): Promise<void> {
    const unique = [...new Set(tags.map((t) => t.replace(/^#+/, '').toLowerCase().slice(0, 150)).filter(Boolean))];
    for (const tag of unique) {
      await this.hashtags.query(
        `INSERT INTO hashtags (id, brand_id, tag, usage_count, last_used_at, created_at, updated_at)
         VALUES (UUID(), ?, ?, 1, NOW(3), NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE usage_count = usage_count + 1, last_used_at = NOW(3), updated_at = NOW(3)`,
        [brandId, tag],
      );
    }
  }

  async list(brandId: string, query: PaginationQueryDto): Promise<PaginatedResult<Hashtag>> {
    const qb = this.hashtags
      .createQueryBuilder('h')
      .where('h.brand_id = :brandId', { brandId })
      .orderBy('h.usage_count', 'DESC')
      .addOrderBy('h.last_used_at', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    if (query.search) qb.andWhere('h.tag LIKE :s', { s: `${query.search.replace(/^#/, '').toLowerCase()}%` });
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }
}
