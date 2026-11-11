// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { rules } from '../config.js';
import { query } from '../db.js';
import { badRequest } from '../errors.js';
import { wrap } from '../errors.js';
import { bookSlot, cancelBooking, rescheduleBooking } from '../services/booking.js';
import { getJourney } from '../services/journey.js';

const router = Router();
router.use(requireRole('student'));

function publicInterview(i) {
  if (!i) return null;
  return {
    id: i.id,
    status: i.status,
    outcome: i.outcome,
    notes: i.outcome_notes,
    retakeAfter: i.retake_after,
    retakeReason: i.retake_reason,
    attemptNo: i.attempt_no,
    startsAt: i.starts_at,
    endsAt: i.ends_at,
    interviewer: i.interviewer_name,
    meetingUrl: i.meeting_url,
    recordedAt: i.recorded_at,
    cancelReason: i.cancel_reason,
  };
}

export function serializeJourney(j) {
  return {
    state: j.state,
    canBook: j.canBook,
    nextEligibleAt: j.nextEligibleAt,
    attemptsUsed: j.attemptsUsed,
    attemptsLeft: j.attemptsLeft,
    skillsTotal: j.skillsTotal,
    skillsCleared: j.skillsCleared,
    skills: j.skills.map((s) => ({ id: s.id, name: s.name, cleared: Boolean(s.cleared_at) })),
    active: publicInterview(j.active),
    last: publicInterview(j.last),
    badge: j.badge && {
      id: j.badge.id,
      awardedAt: j.badge.awarded_at,
      revokedAt: j.badge.revoked_at,
      revokeReason: j.badge.revoke_reason,
    },
    history: j.history.map(publicInterview),
  };
}

router.get('/dashboard', wrap(async (req, res) => {
  const { rows: tracks } = await query(
    `select t.* from student_tracks st join tracks t on t.id = st.track_id
      where st.student_id = $1 order by st.joined_at`,
    [req.user.id],
  );
  const journeys = await Promise.all(tracks.map(async (t) => ({
    track: { id: t.id, code: t.code, name: t.name, badgeName: t.badge_name },
    journey: serializeJourney(await getJourney({ query }, req.user.id, t.id)),
  })));
  const { rows: notes } = await query(
    `select id, kind, title, body, read_at, created_at from notifications
      where user_id = $1 order by created_at desc, id desc limit 20`,
    [req.user.id],
  );
  res.json({ user: req.user, tracks: journeys, notifications: notes, rules });
}));

router.get('/slots', wrap(async (req, res) => {
  const trackId = Number(req.query.trackId);
  if (!trackId) throw badRequest('trackId is required');
  const { rows } = await query(
    `select s.id, s.starts_at, s.ends_at, u.name as interviewer
       from interview_slots s
       join users u on u.id = s.interviewer_id
       join interviewer_tracks it on it.interviewer_id = s.interviewer_id and it.track_id = $1
      where s.cancelled_at is null
        and s.starts_at >= now() + make_interval(mins => $2)
        and s.starts_at <= now() + make_interval(days => $3)
        and not exists (
          select 1 from interviews i
           where i.slot_id = s.id and i.status not in ('cancelled', 'interviewer_cancelled')
        )
      order by s.starts_at`,
    [trackId, rules.minLeadMinutes, rules.bookingWindowDays],
  );
  res.json({ slots: rows.map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, interviewer: r.interviewer })) });
}));

router.post('/bookings', wrap(async (req, res) => {
  const { slotId, trackId } = req.body || {};
  if (!slotId || !trackId) throw badRequest('slotId and trackId are required');
  const { rowCount } = await query(
    'select 1 from student_tracks where student_id = $1 and track_id = $2',
    [req.user.id, trackId],
  );
  if (!rowCount) throw badRequest('You are not enrolled in this track.');
  const interview = await bookSlot({ studentId: req.user.id, trackId: Number(trackId), slotId: Number(slotId) });
  res.status(201).json({ interview: publicInterview(interview) });
}));

router.post('/interviews/:id/cancel', wrap(async (req, res) => {
  res.json(await cancelBooking({ interviewId: Number(req.params.id), studentId: req.user.id }));
}));

router.post('/interviews/:id/reschedule', wrap(async (req, res) => {
  const slotId = Number(req.body?.slotId);
  if (!slotId) throw badRequest('slotId is required');
  const interview = await rescheduleBooking({ interviewId: Number(req.params.id), studentId: req.user.id, slotId });
  res.json({ interview: publicInterview(interview) });
}));

router.post('/notifications/read', wrap(async (req, res) => {
  await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
  res.json({ ok: true });
}));

export default router;
