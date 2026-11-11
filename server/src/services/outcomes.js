// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { config, rules } from '../config.js';
import { tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { messages } from '../messages.js';
import { getJourney } from './journey.js';
import { audit, notify } from './notify.js';

const DAY = 24 * 3600e3;
const RESULTS = ['pass', 'fail', 'retake_later', 'no_show'];

function todayIST(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(now);
}

function addDaysIST(now, days) {
  return todayIST(new Date(now.getTime() + days * DAY));
}

export function recordOutcome({ interviewId, actor, result, notes, retakeAfter, retakeReason, now = new Date() }) {
  if (!RESULTS.includes(result)) throw badRequest('Unknown result.');
  notes = (notes || '').trim();
  if ((result === 'fail' || result === 'retake_later') && notes.length < 10) {
    throw badRequest('Please add at least a line of feedback for the student.', 'NOTES_REQUIRED');
  }

  return tx(async (db) => {
    const { rows } = await db.query(
      `select i.*, s.starts_at, s.interviewer_id, t.badge_name
         from interviews i
         join interview_slots s on s.id = i.slot_id
         join tracks t on t.id = i.track_id
        where i.id = $1 for update of i`,
      [interviewId],
    );
    const iv = rows[0];
    if (!iv) throw notFound('Interview not found');
    if (actor.role !== 'admin' && iv.interviewer_id !== actor.id) throw forbidden('This is not your interview.');
    if (iv.status !== 'booked') throw conflict('An outcome has already been recorded for this interview.', 'ALREADY_RECORDED');
    if (!config.demoMode && now < new Date(iv.starts_at)) {
      throw conflict('You can record the outcome once the interview has started.', 'NOT_STARTED');
    }

    const badge = iv.badge_name;
    let msg;

    if (result === 'pass') {
      await db.query(
        `update interviews set status = 'completed', outcome = 'pass', outcome_notes = $2,
                recorded_by = $3, recorded_at = $4 where id = $1`,
        [iv.id, notes || null, actor.id, now],
      );
      await db.query(
        'insert into badges (student_id, track_id, interview_id, awarded_at) values ($1, $2, $3, $4)',
        [iv.student_id, iv.track_id, iv.id, now],
      );
      msg = messages.passed({ badge });
    } else if (result === 'fail') {
      await db.query(
        `update interviews set status = 'completed', outcome = 'fail', outcome_notes = $2,
                recorded_by = $3, recorded_at = $4 where id = $1`,
        [iv.id, notes, actor.id, now],
      );
      const journey = await getJourney(db, iv.student_id, iv.track_id, now);
      msg = messages.failed({
        badge,
        notes,
        attemptsLeft: journey.attemptsLeft,
        nextDate: new Date(now.getTime() + rules.failCooldownDays * DAY),
      });
    } else if (result === 'retake_later') {
      const earliest = addDaysIST(now, 1);
      const date = retakeAfter || addDaysIST(now, rules.retakeDefaultDays);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < earliest) {
        throw badRequest('Retake date must be tomorrow or later.', 'BAD_RETAKE_DATE');
      }
      await db.query(
        `update interviews set status = 'completed', outcome = 'retake_later', outcome_notes = $2,
                retake_after = $3, retake_reason = $4, recorded_by = $5, recorded_at = $6 where id = $1`,
        [iv.id, notes, date, retakeReason || null, actor.id, now],
      );
      msg = messages.retake({ badge, nextDate: `${date}T00:00:00+05:30`, reason: retakeReason });
    } else {
      await db.query(
        `update interviews set status = 'no_show', outcome_notes = $2, recorded_by = $3, recorded_at = $4
          where id = $1`,
        [iv.id, notes || null, actor.id, now],
      );
      msg = messages.noShow({ badge, nextDate: new Date(now.getTime() + rules.noShowCooldownDays * DAY) });
    }

    await notify(db, iv.student_id, msg);
    await audit(db, actor.id, `interview.${result}`, 'interview', iv.id, { notes });
    return { ok: true };
  });
}

export function revokeBadge({ badgeId, actor, reason }) {
  reason = (reason || '').trim();
  if (reason.length < 10) throw badRequest('Describe the malpractice finding in a sentence or two.', 'REASON_REQUIRED');
  return tx(async (db) => {
    const { rows } = await db.query(
      `select b.*, t.badge_name from badges b join tracks t on t.id = b.track_id where b.id = $1 for update of b`,
      [badgeId],
    );
    const badge = rows[0];
    if (!badge) throw notFound('Badge not found');
    if (badge.revoked_at) throw conflict('This badge has already been withdrawn.', 'ALREADY_REVOKED');
    await db.query(
      'update badges set revoked_at = now(), revoked_by = $2, revoke_reason = $3 where id = $1',
      [badge.id, actor.id, reason],
    );
    await notify(db, badge.student_id, messages.revoked({ badge: badge.badge_name }));
    await audit(db, actor.id, 'badge.revoked', 'badge', badge.id, { reason });
    return { ok: true };
  });
}
