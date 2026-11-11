// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.

export class AppError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (msg, code = 'BAD_REQUEST') => new AppError(400, code, msg);
export const forbidden = (msg = 'Not allowed', code = 'FORBIDDEN') => new AppError(403, code, msg);
export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new AppError(404, code, msg);
export const conflict = (msg, code = 'CONFLICT', extra) => new AppError(409, code, msg, extra);

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'BAD_JSON', message: 'Request body is not valid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong on our side.' });
}

// Express 4 does not catch rejected promises from handlers.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
