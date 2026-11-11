// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { messages } from '../messages.js';
import { audit, notify } from './notify.js';

const PG_EXCLUSION = '23P01';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ist = (date, time) => new Date(`${date}T${time}:00+05:30`);

// Splits a block of availability (e.g. 14:00-17:00 in 30 minute chunks)
// into individual bookable slots.
export function splitBlock({ date, from, to, minutes }) {
  if (!DATE.test(date || '')) throw badRequest('Pick a date.');
  if (!TIME.test(from || '') || !TIME.test(to || '')) throw badRequest('Times must be HH:MM.');
  minutes = Number(minutes);
  if (![30, 45, 60].includes(minutes)) throw badRequest('Slot length must be 30, 45 or 60 minutes.');

  const start = ist(date, from);
  const end = ist(date, to);
  if (end <= start) throw badRequest('End time must be after start time.');

  const out = [];
  for (let t = start.getTime(); t + minutes * 60e3 <= end.getTime(); t += minutes * 60e3) {
    out.push({ starts_at: new Date(t), ends_at: new Date(t + minutes * 60e3) });
  }
  if (out.length === 0) throw badRequest('That window is shorter than one slot.');
  if (out.length > 24) throw badRequest('Add at most 24 slots at a time.');
  return out;
}

export function addAvailability({ interviewerId, block, now = new Date() }) {
  const slots = splitBlock(block);
  if (slots[0].starts_at < now) throw badRequest('You can only add slots in the future.');

  return tx(async (db) => {
    const created = [];
    for (const s of slots) {
      try {
        await db.query('savepoint s');
        const { rows } = await db.query(
          'insert into interview_slots (interviewer_id, starts_at, ends_at) values ($1, $2, $3) returning *',
          [interviewerId, s.starts_at, s.ends_at],
        );
        await db.query('release savepoint s');
        created.push(rows[0]);
      } catch (err) {
        await db.query('rollback to savepoint s');
        if (err.code !== PG_EXCLUSION) throw err;
      }
    }
    if (created.length === 0) throw conflict('Those times overlap slots you have already published.', 'OVERLAP');
    await audit(db, interviewerId, 'slots.added', 'interview_slot', null, { count: created.length, block });
    return { created: created.length, skipped: slots.length - created.length };
  });
}

export function removeSlot({ slotId, actor, reason }) {
  return tx(async (db) => {
    const { rows } = await db.query('select * from interview_slots where id = $1 for update', [slotId]);
    const slot = rows[0];
    if (!slot || slot.cancelled_at) throw notFound('Slot not found');
    if (actor.role !== 'admin' && slot.interviewer_id !== actor.id) throw forbidden();

    const { rows: live } = await db.query(
      `select i.*, t.badge_name from interviews i join tracks t on t.id = i.track_id
        where i.slot_id = $1 and i.status not in ('cancelled', 'interviewer_cancelled') for update of i`,
      [slotId],
    );
    const iv = live[0];
    if (iv && iv.status !== 'booked') throw conflict('This interview already has an outcome.', 'HAS_OUTCOME');
    if (iv && !(reason || '').trim()) {
      throw badRequest('A student has booked this slot. Give a short reason so we can tell them.', 'REASON_REQUIRED');
    }

    if (iv) {
      await db.query(
        `update interviews set status = 'interviewer_cancelled', cancelled_at = now(), cancel_reason = $2 where id = $1`,
        [iv.id, reason.trim()],
      );
      await notify(db, iv.student_id, messages.cancelledByInterviewer({
        badge: iv.badge_name, startsAt: slot.starts_at, reason: reason.trim(),
      }));
    }
    await db.query('update interview_slots set cancelled_at = now() where id = $1', [slotId]);
    await audit(db, actor.id, 'slot.removed', 'interview_slot', slot.id, { hadBooking: Boolean(iv), reason });
    return { ok: true, studentNotified: Boolean(iv) };
  });
}
