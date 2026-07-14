import { OffsetPaginationQueryDto } from '../dto/offset-pagination-query.dto';

export type NormalizedPagination = {
  page: number;
  pageSize: number;
  skip: number;
};

export function normalizeOffsetPagination(
  pagination: OffsetPaginationQueryDto,
  defaults: { page?: number; pageSize?: number } = {},
): NormalizedPagination {
  const page = pagination.page ?? defaults.page ?? 1;
  const pageSize = pagination.pageSize ?? defaults.pageSize ?? 20;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}
