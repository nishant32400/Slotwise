// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { badRequest, conflict, forbidden, wrap } from '../errors.js';
import { messages } from '../messages.js';
import { deriveJourney, loadJourneyData, STATES } from '../services/journey.js';
import { audit, notify } from '../services/notify.js';
import { revokeBadge } from '../services/outcomes.js';
import { seed } from '../../scripts/seed.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/overview', wrap(async (req, res) => {
  const trackId = req.query.trackId ? Number(req.query.trackId) : null;
  const { rows: tracks } = await query('select id, code, name, badge_name from tracks order by id');
  const { rows: enrolments } = await query(
    `select st.student_id, st.track_id, u.name, u.email, u.college, t.name as track_name, t.badge_name
       from student_tracks st
       join users u on u.id = st.student_id
       join tracks t on t.id = st.track_id
      where ($1::int is null or st.track_id = $1)
      order by u.name`,
    [trackId],
  );

  const now = new Date();
  const students = await Promise.all(enrolments.map(async (e) => {
    const j = deriveJourney(await loadJourneyData({ query }, e.student_id, e.track_id), now);
    const latest = j.active || j.history.find((h) => h.status !== 'cancelled') || null;
    return {
      studentId: e.student_id,
      name: e.name,
      email: e.email,
      college: e.college,
      trackId: e.track_id,
      track: e.track_name,
      badgeName: e.badge_name,
      state: j.state,
      skillsCleared: j.skillsCleared,
      skillsTotal: j.skillsTotal,
      attemptsUsed: j.attemptsUsed,
      nextEligibleAt: j.nextEligibleAt,
      badgeId: j.badge?.id || null,
      badgeRevokedAt: j.badge?.revoked_at || null,
      slot: latest && {
        interviewId: latest.id,
        startsAt: latest.starts_at,
        interviewer: latest.interviewer_name,
        status: latest.status,
        outcome: latest.outcome,
      },
    };
  }));

  const counts = students.reduce((acc, s) => {
    acc[s.state] = (acc[s.state] || 0) + 1;
    return acc;
  }, {});

  const { rows: interviewers } = await query(
    `select u.id, u.name,
            count(s.id) filter (where s.starts_at > now() and i.id is null)::int as open_slots,
            count(s.id) filter (where s.starts_at > now() and i.id is not null)::int as upcoming,
            count(s.id) filter (where i.status = 'booked' and s.ends_at <= now())::int as pending_outcomes
       from users u
       left join interview_slots s on s.interviewer_id = u.id and s.cancelled_at is null
       left join interviews i on i.slot_id = s.id and i.status not in ('cancelled', 'interviewer_cancelled')
      where u.role = 'interviewer'
      group by u.id order by u.name`,
  );

  res.json({ tracks, students, counts, interviewers, demoMode: config.demoMode });
}));

router.post('/badges/:id/revoke', wrap(async (req, res) => {
  res.json(await revokeBadge({ badgeId: Number(req.params.id), actor: req.user, reason: req.body?.reason }));
}));

router.post('/reminders', wrap(async (req, res) => {
  const studentId = Number(req.body?.studentId);
  const trackId = Number(req.body?.trackId);
  if (!studentId || !trackId) throw badRequest('studentId and trackId are required');

  await tx(async (db) => {
    const j = deriveJourney(await loadJourneyData(db, studentId, trackId));
    if (j.state !== STATES.READY) throw conflict('Only students who can book right now get reminders.', 'NOT_READY');
    const { rows } = await db.query(
      `select 1 from notifications where user_id = $1 and kind = 'reminder' and created_at > now() - interval '24 hours'`,
      [studentId],
    );
    if (rows.length) throw conflict('A reminder was already sent in the last 24 hours.', 'RECENTLY_REMINDED');
    const { rows: t } = await db.query('select badge_name from tracks where id = $1', [trackId]);
    await notify(db, studentId, messages.reminder({ badge: t[0].badge_name }));
    await audit(db, req.user.id, 'reminder.sent', 'user', studentId, { trackId });
  });
  res.json({ ok: true });
}));

router.post('/demo/reset', wrap(async (req, res) => {
  if (!config.demoMode) throw forbidden('Demo reset is disabled.');
  await seed();
  res.json({ ok: true });
}));

export default router;
