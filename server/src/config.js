// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}

export const config = {
  isProd,
  port: Number(env.PORT || 8080),
  databaseUrl: env.DATABASE_URL || 'postgres://grit:grit@localhost:5432/grit',
  databaseSsl: env.DATABASE_SSL === 'true',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  // Demo mode exposes the role switcher and lets interviewers record an
  // outcome before the slot time so reviewers can walk the full flow.
  demoMode: env.DEMO_MODE !== 'false',
  licenseKey: env.LICENSE_KEY || '',
  timezone: 'Asia/Kolkata',
};

export const rules = {
  maxAttempts: 3,
  failCooldownDays: 14,
  noShowCooldownDays: 7,
  retakeDefaultDays: 3,
  minLeadMinutes: 120,
  cancelCutoffHours: 12,
  bookingWindowDays: 21,
  joinOpensMinutes: 10,
};
