#!/usr/bin/env node
// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Issues a licence key for this software. Only the author can run this,
// because it needs the author's private key, which is never committed.
//
//   node tools/issue-license.js --key ~/keys/grit-owner-private.pem \
//     --licensee "Acme Pvt Ltd" --hosts interviews.acme.com,*.acme.in --expires 2027-12-31

import crypto from 'node:crypto';
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);

if (!args.key || !args.licensee) {
  console.error('usage: issue-license.js --key <private.pem> --licensee <name> [--hosts a.com,b.com] [--expires YYYY-MM-DD]');
  process.exit(1);
}

const payload = {
  licensee: args.licensee,
  hosts: args.hosts ? args.hosts.split(',').map((h) => h.trim()).filter(Boolean) : [],
  expiresAt: args.expires ? `${args.expires}T23:59:59+05:30` : null,
  issuedAt: new Date().toISOString(),
};

const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const privateKey = crypto.createPrivateKey(fs.readFileSync(args.key));
const sig = crypto.sign(null, Buffer.from(body), privateKey).toString('base64url');

console.log(`${body}.${sig}`);
