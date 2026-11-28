/**
 * Pagination, tri et recherche insensibles aux accents.
 *
 * Toutes les listes exposées par l’API (glossaire, bibliothèque, projets,
 * classement) passent par ce module : une seule grammaire de paramètres
 * (`?page=2&size=24&q=thévenin&sort=title&order=asc`), des bornes strictes et
 * une enveloppe de réponse homogène.
 */

export interface PageQuery {
  page: number;
  size: number;
  offset: number;
  q: string;
  sort: string | null;
  order: 'asc' | 'desc';
}

export interface PageResult<T> {
  rows: T[];
  page: number;
  size: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
  q: string;
  sort: string | null;
  order: 'asc' | 'desc';
}

const DEFAULT_SIZE = 24;
const MAX_SIZE = 100;

function toInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export function parsePageQuery(
  query: Record<string, string>,
  options: { defaultSize?: number; maxSize?: number; defaultSort?: string; defaultOrder?: 'asc' | 'desc' } = {},
): PageQuery {
  const maxSize = Math.min(options.maxSize ?? MAX_SIZE, MAX_SIZE);
  const size = Math.min(Math.max(toInt(query.size ?? query.limit, options.defaultSize ?? DEFAULT_SIZE), 1), maxSize);
  const page = Math.max(toInt(query.page, 1), 1);
  const rawOrder = (query.order ?? options.defaultOrder ?? 'asc').toLowerCase();
  return {
    page,
    size,
    offset: (page - 1) * size,
    q: (query.q ?? '').trim().slice(0, 120),
    sort: (query.sort ?? options.defaultSort ?? null) || null,
    order: rawOrder === 'desc' ? 'desc' : 'asc',
  };
}

/** Minuscules, sans accents, sans ponctuation : « Thévenin » → « thevenin ». */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchesQuery<T>(item: T, q: string, fields: (item: T) => Array<string | undefined>): boolean {
  if (!q) return true;
  const needle = fold(q);
  if (!needle) return true;
  const haystack = fields(item)
    .filter(Boolean)
    .map((value) => fold(String(value)))
    .join(' ');
  return needle.split(/\s+/).every((token) => haystack.includes(token));
}

export function sortItems<T>(items: T[], field: string | null, order: 'asc' | 'desc', get: (item: T, field: string) => unknown): T[] {
  if (!field) return items;
  const factor = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = get(a, field);
    const right = get(b, field);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left ?? '').localeCompare(String(right ?? ''), 'fr') * factor;
  });
}

export function paginate<T>(
  items: T[],
  query: PageQuery,
  options: { filter?: (item: T) => boolean } = {},
): PageResult<T> {
  const filtered = options.filter ? items.filter(options.filter) : items;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(query.page, pages);
  const offset = (page - 1) * query.size;
  return {
    rows: filtered.slice(offset, offset + query.size),
    page,
    size: query.size,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
    q: query.q,
    sort: query.sort,
    order: query.order,
  };
}

/** Applique recherche, tri et pagination en une passe. */
export function queryPage<T>(
  items: T[],
  query: PageQuery,
  config: {
    search: (item: T) => Array<string | undefined>;
    sort?: (item: T, field: string) => unknown;
    extraFilter?: (item: T) => boolean;
  },
): PageResult<T> {
  const searched = query.q ? items.filter((item) => matchesQuery(item, query.q, config.search)) : items;
  const sorted = query.sort && config.sort ? sortItems(searched, query.sort, query.order, config.sort) : searched;
  return paginate(sorted, query, { filter: config.extraFilter });
}

/** En-têtes de pagination pour les clients qui préfèrent les en-têtes au corps. */
export function pageHeaders<T>(result: PageResult<T>): Record<string, string> {
  return {
    'X-Total-Count': String(result.total),
    'X-Page': String(result.page),
    'X-Page-Size': String(result.size),
    'X-Page-Count': String(result.pages),
  };
}
