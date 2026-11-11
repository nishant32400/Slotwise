// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Runs against a real Postgres. Point TEST_DATABASE_URL at a throwaway DB.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://grit:grit@localhost:5432/grit_test';
process.env.DEMO_MODE = 'true';

const { pool, query } = await import('../src/db.js');
const { migrate } = await import('../scripts/migrate.js');
const { seed } = await import('../scripts/seed.js');
const { bookSlot, cancelBooking, rescheduleBooking } = await import('../src/services/booking.js');
const { recordOutcome, revokeBadge } = await import('../src/services/outcomes.js');
const { addAvailability } = await import('../src/services/slots.js');
const { getJourney, deriveJourney, STATES } = await import('../src/services/journey.js');

const db = { query };
let FSD;
let priya;
let admin;

async function eligibleStudents(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await query(
      `insert into users (name, email, role) values ($1, $2, 'student') returning id`,
      [`Racer ${i}`, `racer${i}.${Date.now()}@test`],
    );
    const id = rows[0].id;
    await query('insert into student_tracks (student_id, track_id) values ($1, $2)', [id, FSD]);
    await query(
      'insert into skill_clears (student_id, skill_id) select $1, id from skills where track_id = $2',
      [id, FSD],
    );
    ids.push(id);
  }
  return ids;
}

async function openSlots(count) {
  const { rows } = await query(
    `select s.id from interview_slots s
      where s.interviewer_id = $1 and s.cancelled_at is null and s.starts_at > now() + interval '1 day'
        and not exists (select 1 from interviews i where i.slot_id = s.id)
      order by s.starts_at limit $2`,
    [priya, count],
  );
  return rows.map((r) => r.id);
}

before(async () => {
  await migrate();
});

beforeEach(async () => {
  await seed();
  FSD = (await query(`select id from tracks where code = 'FSD'`)).rows[0].id;
  priya = (await query(`select id from users where name = 'Priya Raman'`)).rows[0].id;
  admin = (await query(`select * from users where role = 'admin'`)).rows[0];
});

after(() => pool.end());

describe('booking', () => {
  test('twenty students racing for one slot: exactly one wins', async () => {
    const students = await eligibleStudents(20);
    const [slotId] = await openSlots(1);

    const results = await Promise.allSettled(
      students.map((studentId) => bookSlot({ studentId, trackId: FSD, slotId })),
    );
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');

    assert.equal(won.length, 1);
    assert.equal(lost.length, 19);
    for (const r of lost) assert.equal(r.reason.code, 'SLOT_TAKEN');

    const { rows } = await query(`select count(*)::int as n from interviews where slot_id = $1`, [slotId]);
    assert.equal(rows[0].n, 1);
  });

  test('one student firing two bookings at once only keeps one', async () => {
    const [studentId] = await eligibleStudents(1);
    const [a, b] = await openSlots(2);
    const results = await Promise.allSettled([
      bookSlot({ studentId, trackId: FSD, slotId: a }),
      bookSlot({ studentId, trackId: FSD, slotId: b }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const { rows } = await query(`select count(*)::int as n from interviews where student_id = $1 and status = 'booked'`, [studentId]);
    assert.equal(rows[0].n, 1);
  });

  test('student who has not cleared every skill cannot book', async () => {
    const rohan = (await query(`select id from users where name = 'Rohan Das'`)).rows[0].id;
    const [slotId] = await openSlots(1);
    await assert.rejects(bookSlot({ studentId: rohan, trackId: FSD, slotId }), { code: 'NOT_BOOKABLE' });
  });

  test('cancelling frees the slot for someone else', async () => {
    const [s1, s2] = await eligibleStudents(2);
    const [slotId] = await openSlots(1);
    const iv = await bookSlot({ studentId: s1, trackId: FSD, slotId });
    await cancelBooking({ interviewId: iv.id, studentId: s1 });
    const iv2 = await bookSlot({ studentId: s2, trackId: FSD, slotId });
    assert.equal(iv2.slot_id, slotId);
  });

  test('reschedule moves the booking atomically', async () => {
    const [s1, s2] = await eligibleStudents(2);
    const [a, b] = await openSlots(2);
    const iv = await bookSlot({ studentId: s1, trackId: FSD, slotId: a });
    await bookSlot({ studentId: s2, trackId: FSD, slotId: b });

    // Target is taken, so the old booking must survive.
    await assert.rejects(rescheduleBooking({ interviewId: iv.id, studentId: s1, slotId: b }), { code: 'SLOT_TAKEN' });
    const { rows } = await query('select status from interviews where id = $1', [iv.id]);
    assert.equal(rows[0].status, 'booked');
  });

  test('cannot book inside the minimum lead time', async () => {
    const [studentId] = await eligibleStudents(1);
    const soon = new Date(Date.now() + 30 * 60e3);
    const { rows } = await query(
      `insert into interview_slots (interviewer_id, starts_at, ends_at)
       values ($1, $2, $3) on conflict do nothing returning id`,
      [priya, soon, new Date(soon.getTime() + 15 * 60e3)],
    );
    if (!rows[0]) return; // overlapped a seeded slot; nothing to assert
    await assert.rejects(bookSlot({ studentId, trackId: FSD, slotId: rows[0].id }), { code: 'TOO_LATE' });
  });
});

describe('outcomes', () => {
  async function bookedInterview() {
    const [studentId] = await eligibleStudents(1);
    const [slotId] = await openSlots(1);
    const iv = await bookSlot({ studentId, trackId: FSD, slotId });
    return { studentId, iv };
  }

  test('pass awards the badge and cannot be recorded twice', async () => {
    const { studentId, iv } = await bookedInterview();
    await recordOutcome({ interviewId: iv.id, actor: { id: priya, role: 'interviewer' }, result: 'pass' });
    const j = await getJourney(db, studentId, FSD);
    assert.equal(j.state, STATES.PASSED);
    await assert.rejects(
      recordOutcome({ interviewId: iv.id, actor: { id: priya, role: 'interviewer' }, result: 'fail', notes: 'changed my mind' }),
      { code: 'ALREADY_RECORDED' },
    );
  });

  test('fail puts the student in cooldown and counts an attempt', async () => {
    const { studentId, iv } = await bookedInterview();
    await recordOutcome({
      interviewId: iv.id, actor: { id: priya, role: 'interviewer' }, result: 'fail', notes: 'Needs more practice with React state.',
    });
    const j = await getJourney(db, studentId, FSD);
    assert.equal(j.state, STATES.COOLDOWN);
    assert.equal(j.attemptsUsed, 1);
    assert.ok(new Date(j.nextEligibleAt) > new Date(Date.now() + 13 * 86400e3));
  });

  test('retake later does not use an attempt', async () => {
    const { studentId, iv } = await bookedInterview();
    await recordOutcome({
      interviewId: iv.id, actor: { id: priya, role: 'interviewer' }, result: 'retake_later',
      notes: 'Audio kept cutting out, could not finish.', retakeReason: 'Audio issues',
    });
    const j = await getJourney(db, studentId, FSD);
    assert.equal(j.state, STATES.RETAKE_PENDING);
    assert.equal(j.attemptsUsed, 0);
  });

  test('another interviewer cannot record the outcome', async () => {
    const { iv } = await bookedInterview();
    const vikram = (await query(`select id from users where name = 'Vikram Shetty'`)).rows[0].id;
    await assert.rejects(
      recordOutcome({ interviewId: iv.id, actor: { id: vikram, role: 'interviewer' }, result: 'pass' }),
      { code: 'FORBIDDEN' },
    );
  });

  test('revoking a badge moves the student to badge_revoked', async () => {
    const { studentId, iv } = await bookedInterview();
    await recordOutcome({ interviewId: iv.id, actor: { id: priya, role: 'interviewer' }, result: 'pass' });
    const badge = (await query('select id from badges where interview_id = $1', [iv.id])).rows[0];
    await revokeBadge({ badgeId: badge.id, actor: admin, reason: 'Plagiarised project found during audit.' });
    const j = await getJourney(db, studentId, FSD);
    assert.equal(j.state, STATES.BADGE_REVOKED);
  });
});

describe('availability', () => {
  test('overlapping slots for the same interviewer are skipped', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 15 * 86400e3));
    const first = await addAvailability({ interviewerId: priya, block: { date, from: '20:00', to: '21:00', minutes: 30 } });
    assert.equal(first.created, 2);
    const second = await addAvailability({ interviewerId: priya, block: { date, from: '20:30', to: '21:30', minutes: 30 } });
    assert.equal(second.created, 1);
    assert.equal(second.skipped, 1);
  });
});

describe('journey rules', () => {
  const skills = [{ cleared_at: new Date() }, { cleared_at: new Date() }];
  const failed = (daysAgo) => ({
    status: 'completed', outcome: 'fail', recorded_at: new Date(Date.now() - daysAgo * 86400e3),
  });

  test('three counted attempts lock the journey', () => {
    const j = deriveJourney({ skills, badges: [], interviews: [failed(1), failed(30), failed(60)] });
    assert.equal(j.state, STATES.ATTEMPTS_EXHAUSTED);
  });

  test('cooldown ends after fourteen days', () => {
    const j = deriveJourney({ skills, badges: [], interviews: [failed(15)] });
    assert.equal(j.state, STATES.READY);
    assert.equal(j.attemptsLeft, 2);
  });
});
