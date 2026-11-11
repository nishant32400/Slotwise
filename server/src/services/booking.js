// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { rules } from '../config.js';
import { tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { messages } from '../messages.js';
import { getJourney } from './journey.js';
import { audit, notify } from './notify.js';

const MIN = 60e3;
const PG_UNIQUE = '23505';

async function trackFor(db, trackId) {
  const { rows } = await db.query('select * from tracks where id = $1', [trackId]);
  if (!rows[0]) throw notFound('Track not found');
  return rows[0];
}

// Books a slot inside an existing transaction. Two things stop a double
// booking: the row lock on the slot serialises concurrent requests for the
// same slot, and the partial unique index on interviews(slot_id) rejects a
// second live row even if some other code path skips the lock.
export async function bookInTx(db, { studentId, trackId, slotId, now = new Date() }) {
  const track = await trackFor(db, trackId);

  const { rows: slotRows } = await db.query(
    `select s.*, u.name as interviewer_name
       from interview_slots s join users u on u.id = s.interviewer_id
      where s.id = $1
      for update of s`,
    [slotId],
  );
  const slot = slotRows[0];
  if (!slot || slot.cancelled_at) throw conflict('This slot is no longer available.', 'SLOT_GONE');

  const starts = new Date(slot.starts_at);
  if (starts.getTime() - now.getTime() < rules.minLeadMinutes * MIN) {
    throw badRequest(`Slots must be booked at least ${rules.minLeadMinutes / 60} hours ahead.`, 'TOO_LATE');
  }
  if (starts.getTime() - now.getTime() > rules.bookingWindowDays * 24 * 60 * MIN) {
    throw badRequest('That slot is outside the booking window.', 'TOO_EARLY');
  }

  const { rowCount: qualified } = await db.query(
    'select 1 from interviewer_tracks where interviewer_id = $1 and track_id = $2',
    [slot.interviewer_id, trackId],
  );
  if (!qualified) throw badRequest('This interviewer does not take interviews for your track.', 'WRONG_TRACK');

  const journey = await getJourney(db, studentId, trackId, now);
  if (!journey.canBook) {
    throw conflict('You cannot book an interview right now.', 'NOT_BOOKABLE', { state: journey.state });
  }

  const { rowCount: taken } = await db.query(
    `select 1 from interviews where slot_id = $1 and status not in ('cancelled', 'interviewer_cancelled')`,
    [slotId],
  );
  if (taken) throw conflict('Someone just booked this slot. Please pick another time.', 'SLOT_TAKEN');

  const { rowCount: clash } = await db.query(
    `select 1 from interviews i join interview_slots s on s.id = i.slot_id
      where i.student_id = $1 and i.status = 'booked'
        and tstzrange(s.starts_at, s.ends_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [studentId, slot.starts_at, slot.ends_at],
  );
  if (clash) throw conflict('You already have another interview at that time.', 'STUDENT_CLASH');

  let interview;
  try {
    await db.query('savepoint book');
    const { rows } = await db.query(
      `insert into interviews (student_id, track_id, slot_id, attempt_no, meeting_url)
       values ($1, $2, $3, $4, $5) returning *`,
      [studentId, trackId, slotId, journey.attemptsUsed + 1, `https://meet.grit.example/i/${slotId}-${studentId}`],
    );
    await db.query('release savepoint book');
    interview = rows[0];
  } catch (err) {
    await db.query('rollback to savepoint book').catch(() => {});
    if (err.code === PG_UNIQUE && err.constraint === 'interviews_one_active_per_student_track') {
      throw conflict('You already have an interview booked for this badge.', 'ALREADY_BOOKED');
    }
    if (err.code === PG_UNIQUE) {
      throw conflict('Someone just booked this slot. Please pick another time.', 'SLOT_TAKEN');
    }
    throw err;
  }

  await notify(db, studentId, messages.booked({
    badge: track.badge_name, startsAt: slot.starts_at, interviewer: slot.interviewer_name, now,
  }));
  await audit(db, studentId, 'interview.booked', 'interview', interview.id, { slotId });
  return { ...interview, starts_at: slot.starts_at, ends_at: slot.ends_at, interviewer_name: slot.interviewer_name };
}

export function bookSlot(args) {
  return tx((db) => bookInTx(db, args));
}

async function lockOwnInterview(db, interviewId, studentId) {
  const { rows } = await db.query(
    `select i.*, s.starts_at, t.badge_name
       from interviews i
       join interview_slots s on s.id = i.slot_id
       join tracks t on t.id = i.track_id
      where i.id = $1 for update of i`,
    [interviewId],
  );
  const iv = rows[0];
  if (!iv) throw notFound('Interview not found');
  if (iv.student_id !== studentId) throw forbidden();
  if (iv.status !== 'booked') throw conflict('This interview can no longer be changed.', 'NOT_BOOKED');
  return iv;
}

function assertBeforeCutoff(iv, now) {
  const cutoff = new Date(iv.starts_at).getTime() - rules.cancelCutoffHours * 60 * MIN;
  if (now.getTime() > cutoff) {
    throw conflict(
      `Changes close ${rules.cancelCutoffHours} hours before the interview. Please contact the GRIT team.`,
      'PAST_CUTOFF',
    );
  }
}

export function cancelBooking({ interviewId, studentId, now = new Date() }) {
  return tx(async (db) => {
    const iv = await lockOwnInterview(db, interviewId, studentId);
    assertBeforeCutoff(iv, now);
    await db.query(
      `update interviews set status = 'cancelled', cancelled_at = now(), cancel_reason = 'student' where id = $1`,
      [iv.id],
    );
    await notify(db, studentId, messages.cancelledByStudent({ badge: iv.badge_name }));
    await audit(db, studentId, 'interview.cancelled', 'interview', iv.id);
    return { ok: true };
  });
}

// Reschedule is cancel + book in one transaction, so a student never ends up
// with no slot because the new one was taken a moment earlier.
export function rescheduleBooking({ interviewId, studentId, slotId, now = new Date() }) {
  return tx(async (db) => {
    const iv = await lockOwnInterview(db, interviewId, studentId);
    assertBeforeCutoff(iv, now);
    if (iv.slot_id === Number(slotId)) throw badRequest('That is already your slot.');
    await db.query(
      `update interviews set status = 'cancelled', cancelled_at = now(), cancel_reason = 'rescheduled' where id = $1`,
      [iv.id],
    );
    return bookInTx(db, { studentId, trackId: iv.track_id, slotId, now });
  });
}
