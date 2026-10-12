export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class PaginatedResult<T> {
  readonly meta: PaginationMeta;

  constructor(
    readonly items: T[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.meta = { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
  }
}
