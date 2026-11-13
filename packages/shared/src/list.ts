/**
 * 列表接口统一分页约定（与 VOC 一致）。
 * Query：page（1-based，默认 1）、pageSize（默认 20）、q（模糊搜索）+ 各接口自己的筛选项。
 * Response：{ items, total, page, pageSize }
 */
export interface ListPageQuery {
  page: number;
  pageSize: number;
  q: string;
}

export interface PaginatedListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_PAGE_SIZE = 20;
export const LIST_MAX_PAGE_SIZE = 200;
