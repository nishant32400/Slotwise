// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { AppError, forbidden } from './errors.js';

const COOKIE = 'grit_sid';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function startSession(res, userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE_MS })).toString('base64url');
  res.cookie(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd && process.env.COOKIE_SECURE !== 'false',
    maxAge: MAX_AGE_MS,
  });
}

export function endSession(res) {
  res.clearCookie(COOKIE);
}

function readSession(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw) return null;
  const [body, mac] = raw.split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return null;
  }
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return data.exp > Date.now() ? data : null;
}

export async function loadUser(req, _res, next) {
  try {
    const session = readSession(req);
    if (session) {
      const { rows } = await query('select id, name, email, role, college from users where id = $1', [session.uid]);
      req.user = rows[0] || null;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in.'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
