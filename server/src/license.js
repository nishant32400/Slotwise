// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Licence gate for this build.
//
// Without a licence key the app runs as an evaluation build: it shows an
// evaluation watermark on every screen and stops serving after EVAL_ENDS.
// A licence key is an Ed25519-signed token issued by the author. Only the
// author holds the private key, so keys cannot be minted by anyone else.
// A licensed build is pinned to the hostnames written into the key.

import crypto from 'node:crypto';
import { config } from './config.js';

export const AUTHOR = 'Nishant';
export const PRODUCT = 'GRIT Interview Scheduling';
const EVAL_ENDS = '2027-01-31T23:59:59+05:30';

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEACjvVoRLMh4Ekn0YRZZZuE/72gyWClGdLdQIKxYl7f28=
-----END PUBLIC KEY-----`;

function decode(token) {
  const [body, sig] = String(token).trim().split('.');
  if (!body || !sig) return null;
  const ok = crypto.verify(
    null,
    Buffer.from(body),
    crypto.createPublicKey(PUBLIC_KEY),
    Buffer.from(sig, 'base64url'),
  );
  if (!ok) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function resolve() {
  if (config.licenseKey) {
    const payload = decode(config.licenseKey);
    if (payload) {
      return {
        mode: 'licensed',
        licensee: payload.licensee,
        hosts: payload.hosts || [],
        expiresAt: payload.expiresAt || null,
      };
    }
    console.warn('[licence] LICENSE_KEY is invalid, falling back to evaluation mode');
  }
  return { mode: 'evaluation', licensee: null, hosts: [], expiresAt: EVAL_ENDS };
}

export const license = resolve();

export function licenseStatus(now = new Date()) {
  const expired = license.expiresAt && now > new Date(license.expiresAt);
  return {
    mode: license.mode,
    licensee: license.licensee,
    expiresAt: license.expiresAt,
    expired: Boolean(expired),
    author: AUTHOR,
    product: PRODUCT,
  };
}

function hostAllowed(hostname) {
  if (license.mode !== 'licensed' || license.hosts.length === 0) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return license.hosts.some((h) => h === hostname || (h.startsWith('*.') && hostname.endsWith(h.slice(1))));
}

export function licenseGate(req, res, next) {
  res.set('X-Built-By', `${AUTHOR}; ${PRODUCT}; ${license.mode}`);
  if (req.path === '/api/meta' || req.path === '/healthz') return next();

  const status = licenseStatus();
  if (status.expired) {
    return res.status(403).json({
      error: 'LICENCE_EXPIRED',
      message: `This ${license.mode} build of ${PRODUCT} has expired. Contact ${AUTHOR} for a licence.`,
    });
  }
  if (!hostAllowed(req.hostname)) {
    return res.status(403).json({
      error: 'LICENCE_HOST',
      message: `This build is not licensed for ${req.hostname}.`,
    });
  }
  next();
}
