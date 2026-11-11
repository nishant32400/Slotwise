// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { Router } from 'express';
import { endSession, startSession } from '../auth.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { forbidden, notFound, wrap } from '../errors.js';
import { licenseStatus } from '../license.js';

const router = Router();

router.get('/meta', (req, res) => {
  res.json({ license: licenseStatus(), demoMode: config.demoMode, timezone: config.timezone });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

// Prototype sign-in. In production this is replaced by the existing GRIT
// login, which already knows who the student is.
router.get('/demo-users', wrap(async (req, res) => {
  if (!config.demoMode) throw forbidden('Demo sign-in is disabled.');
  const { rows } = await query(
    `select u.id, u.name, u.role, u.college, string_agg(t.name, ', ') as tracks
       from users u
       left join student_tracks st on st.student_id = u.id
       left join tracks t on t.id = st.track_id
      group by u.id order by u.role desc, u.id`,
  );
  res.json({ users: rows });
}));

router.post('/demo-login', wrap(async (req, res) => {
  if (!config.demoMode) throw forbidden('Demo sign-in is disabled.');
  const { rows } = await query('select id, name, role from users where id = $1', [Number(req.body?.userId)]);
  if (!rows[0]) throw notFound('User not found');
  startSession(res, rows[0].id);
  res.json({ user: rows[0] });
}));

router.post('/logout', (req, res) => {
  endSession(res);
  res.json({ ok: true });
});

export default router;
