// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Works out where a student is in the interview journey for one track.
// The state is derived from rows rather than stored, so it can never drift
// from the underlying interviews and badges.

import { rules } from '../config.js';

const DAY = 24 * 3600e3;

export const STATES = {
  NOT_ELIGIBLE: 'not_eligible',
  READY: 'ready_to_book',
  BOOKED: 'booked',
  IN_PROGRESS: 'in_progress',
  AWAITING_RESULT: 'awaiting_result',
  PASSED: 'passed',
  COOLDOWN: 'cooldown',
  RETAKE_PENDING: 'retake_pending',
  ATTEMPTS_EXHAUSTED: 'attempts_exhausted',
  BADGE_REVOKED: 'badge_revoked',
};

const startOfDayIST = (dateStr) => new Date(`${dateStr}T00:00:00+05:30`);

export async function loadJourneyData(db, studentId, trackId) {
  const [skills, interviews, badges] = await Promise.all([
    db.query(
      `select s.id, s.name, sc.cleared_at
         from skills s
         left join skill_clears sc on sc.skill_id = s.id and sc.student_id = $1
        where s.track_id = $2
        order by s.position, s.id`,
      [studentId, trackId],
    ),
    db.query(
      `select i.*, s.starts_at, s.ends_at, u.name as interviewer_name
         from interviews i
         join interview_slots s on s.id = i.slot_id
         join users u on u.id = s.interviewer_id
        where i.student_id = $1 and i.track_id = $2
        order by i.created_at desc, i.id desc`,
      [studentId, trackId],
    ),
    db.query(
      `select * from badges where student_id = $1 and track_id = $2 order by awarded_at desc`,
      [studentId, trackId],
    ),
  ]);
  return { skills: skills.rows, interviews: interviews.rows, badges: badges.rows };
}

export function deriveJourney({ skills, interviews, badges }, now = new Date()) {
  const cleared = skills.filter((s) => s.cleared_at).length;
  const counted = interviews.filter(
    (i) => (i.status === 'completed' && i.outcome === 'fail') || i.status === 'no_show',
  );
  const attemptsUsed = counted.length;
  const base = {
    skillsTotal: skills.length,
    skillsCleared: cleared,
    skills,
    attemptsUsed,
    attemptsLeft: Math.max(0, rules.maxAttempts - attemptsUsed),
    canBook: false,
    nextEligibleAt: null,
    active: null,
    last: null,
    badge: null,
    history: interviews,
  };

  const liveBadge = badges.find((b) => !b.revoked_at);
  if (liveBadge) return { ...base, state: STATES.PASSED, badge: liveBadge };

  const revoked = badges.find((b) => b.revoked_at);
  if (revoked) return { ...base, state: STATES.BADGE_REVOKED, badge: revoked };

  if (skills.length === 0 || cleared < skills.length) {
    return { ...base, state: STATES.NOT_ELIGIBLE };
  }

  const active = interviews.find((i) => i.status === 'booked');
  if (active) {
    const starts = new Date(active.starts_at);
    const ends = new Date(active.ends_at);
    let state = STATES.BOOKED;
    if (now >= ends) state = STATES.AWAITING_RESULT;
    else if (now >= starts) state = STATES.IN_PROGRESS;
    return { ...base, state, active };
  }

  if (attemptsUsed >= rules.maxAttempts) {
    return { ...base, state: STATES.ATTEMPTS_EXHAUSTED, last: counted[0] };
  }

  const last = interviews.find((i) => i.status !== 'cancelled');
  if (last) {
    let next = null;
    let state = null;
    if (last.status === 'completed' && last.outcome === 'fail') {
      next = new Date(new Date(last.recorded_at).getTime() + rules.failCooldownDays * DAY);
      state = STATES.COOLDOWN;
    } else if (last.status === 'no_show') {
      next = new Date(new Date(last.recorded_at).getTime() + rules.noShowCooldownDays * DAY);
      state = STATES.COOLDOWN;
    } else if (last.status === 'completed' && last.outcome === 'retake_later' && last.retake_after) {
      next = startOfDayIST(last.retake_after);
      state = STATES.RETAKE_PENDING;
    }
    if (next && now < next) {
      return { ...base, state, last, nextEligibleAt: next.toISOString() };
    }
  }

  return { ...base, state: STATES.READY, canBook: true, last: last || null };
}

export async function getJourney(db, studentId, trackId, now) {
  return deriveJourney(await loadJourneyData(db, studentId, trackId), now);
}
