import type { ApiErrorBody, FieldError } from '@tryon/shared';

const CSRF_COOKIE = 'tryon_csrf';
let redirectingToLogin = false;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** 会话失效：回登录页（登录页本身 / 登录接口不跳） */
function handleUnauthorized(path: string) {
  if (path.startsWith('/api/auth/')) return;
  if (window.location.pathname.startsWith('/login')) return;
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
}

export async function apiFetch<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const csrf = getCookie(CSRF_COOKIE);
  if (csrf) headers.set('x-csrf-token', csrf);
  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.json);
  }

  const res = await fetch(path, { ...options, headers, body, credentials: 'include' });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path);
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      res.status,
      err.error ?? 'error',
      err.message || (res.status === 401 ? '登录已失效，请重新登录' : `请求失败（${res.status}）`),
      err.fields ?? [],
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
