// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { badRequest, wrap } from '../errors.js';
import { recordOutcome } from '../services/outcomes.js';
import { addAvailability, removeSlot } from '../services/slots.js';

const router = Router();
router.use(requireRole('interviewer', 'admin'));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());

function whoseSchedule(req) {
  if (req.user.role === 'admin' && req.query.interviewerId) return Number(req.query.interviewerId);
  return req.user.id;
}

const SLOT_SELECT = `
  select s.id as slot_id, s.starts_at, s.ends_at,
         i.id as interview_id, i.status, i.outcome, i.outcome_notes, i.attempt_no,
         i.retake_after, i.meeting_url, i.recorded_at,
         st.id as student_id, st.name as student_name, st.college, st.email as student_email,
         t.name as track_name, t.badge_name
    from interview_slots s
    left join interviews i on i.slot_id = s.id and i.status not in ('cancelled', 'interviewer_cancelled')
    left join users st on st.id = i.student_id
    left join tracks t on t.id = i.track_id`;

router.get('/me', wrap(async (req, res) => {
  const { rows } = await query(
    `select t.id, t.name, t.badge_name from interviewer_tracks it join tracks t on t.id = it.track_id
      where it.interviewer_id = $1 order by t.name`,
    [req.user.id],
  );
  res.json({ user: req.user, tracks: rows, demoMode: config.demoMode });
}));

router.get('/schedule', wrap(async (req, res) => {
  const date = req.query.date || todayIST();
  if (!DATE.test(date)) throw badRequest('date must be YYYY-MM-DD');
  const interviewerId = whoseSchedule(req);

  const { rows } = await query(
    `${SLOT_SELECT}
      where s.interviewer_id = $1 and s.cancelled_at is null
        and s.starts_at >= ($2::date)::timestamp at time zone 'Asia/Kolkata'
        and s.starts_at < ($2::date + 1)::timestamp at time zone 'Asia/Kolkata'
      order by s.starts_at`,
    [interviewerId, date],
  );

  // Earlier attempts give the interviewer context before they start.
  const studentIds = [...new Set(rows.filter((r) => r.student_id).map((r) => r.student_id))];
  let previous = [];
  if (studentIds.length) {
    ({ rows: previous } = await query(
      `select i.student_id, i.attempt_no, i.status, i.outcome, i.outcome_notes, i.recorded_at, u.name as interviewer
         from interviews i
         join interview_slots s on s.id = i.slot_id
         join users u on u.id = s.interviewer_id
        where i.student_id = any($1) and i.status in ('completed', 'no_show')
        order by i.recorded_at desc`,
      [studentIds],
    ));
  }

  res.json({
    date,
    demoMode: config.demoMode,
    slots: rows.map((r) => ({
      ...r,
      previous: previous.filter((p) => p.student_id === r.student_id && r.interview_id),
    })),
  });
}));

router.get('/availability', wrap(async (req, res) => {
  const from = req.query.from || todayIST();
  if (!DATE.test(from)) throw badRequest('from must be YYYY-MM-DD');
  const days = Math.min(Number(req.query.days) || 14, 31);
  const { rows } = await query(
    `${SLOT_SELECT}
      where s.interviewer_id = $1 and s.cancelled_at is null
        and s.starts_at >= ($2::date)::timestamp at time zone 'Asia/Kolkata'
        and s.starts_at < ($2::date + $3::int)::timestamp at time zone 'Asia/Kolkata'
      order by s.starts_at`,
    [whoseSchedule(req), from, days],
  );
  res.json({ from, days, slots: rows });
}));

router.post('/availability', wrap(async (req, res) => {
  const result = await addAvailability({ interviewerId: req.user.id, block: req.body || {} });
  res.status(201).json(result);
}));

router.delete('/slots/:id', wrap(async (req, res) => {
  res.json(await removeSlot({ slotId: Number(req.params.id), actor: req.user, reason: req.body?.reason }));
}));

router.post('/interviews/:id/outcome', wrap(async (req, res) => {
  const { result, notes, retakeAfter, retakeReason } = req.body || {};
  res.json(await recordOutcome({
    interviewId: Number(req.params.id), actor: req.user, result, notes, retakeAfter, retakeReason,
  }));
}));

export default router;
