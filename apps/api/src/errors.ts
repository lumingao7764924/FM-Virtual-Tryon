import type { FieldError } from '@tryon/shared';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: FieldError[]
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: FieldError[]) => new HttpError(400, 'bad_request', message, fields);
export const unauthorized = (message = '请先登录') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = '没有权限') => new HttpError(403, 'forbidden', message);
export const notFound = (message = '不存在') => new HttpError(404, 'not_found', message);
export const gone = (message: string) => new HttpError(410, 'preview_expired', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
