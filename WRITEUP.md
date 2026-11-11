# GRIT Badge Interviews: Scheduling Design

**Nishant** · AI Product Engineer, Round 1 · Live prototype: `<your link>` · Walkthrough: `/guide` on the prototype

## 1. States of a student's interview journey (per track)

The state is never stored. It is **derived** every time from skill clears, interview rows and badge rows, so it cannot drift out of sync with them.

| State | What it means | What moves it on |
|---|---|---|
| **Clearing skills** | Some skills for the badge are still not cleared | Last skill cleared → *Ready to book* |
| **Ready to book** | Eligible, with no live booking | Books a slot → *Booked* |
| **Booked** | Holds a future slot | Slot starts → *In progress*. Student cancels or reschedules (≥12h before) → *Ready* / new slot. Interviewer cancels → *Ready* (no attempt used) |
| **In progress** | Slot time has started | Slot ends → *Awaiting result* |
| **Awaiting result** | Interview over, outcome not recorded yet | **Pass** → *Badge earned*. **Fail** → *Cooldown* (14 days). **No-show** → *Cooldown* (7 days). **Retake later** → *Retake* |
| **Badge earned** | Badge live on profile and leaderboard | Malpractice confirmed by the team → *Badge withdrawn* |
| **Cooldown** | Fail or no-show; an attempt was used | Cooldown ends → *Ready*. Third counted attempt → *Attempts used* |
| **Retake** | Interviewer asked for a retake (network, time ran out). No attempt used | Retake date reached → *Ready* |
| **Attempts used** | 3 counted attempts (fail or no-show) | The interview team handles it off-platform |
| **Badge withdrawn** | Badge withdrawn after malpractice. Terminal | The team can reinstate on appeal (out of scope) |

## 2. Edge cases handled, and assumptions

**Handled in the prototype**

- **Two students, one slot.** A row lock plus a database constraint (see §3). Tested with 20 concurrent bookings: exactly one succeeds, and the other 19 get "Someone just booked this slot".
- **One student, double-click or two tabs.** A unique index allows at most one live booking per student per track. A student booked on two tracks can't hold overlapping times.
- **Reschedule is one transaction** (cancel + book). If the new slot was just taken, the old booking stays.
- **Interviewer cancels a booked slot.** A reason is required, the student is notified immediately, and no attempt is used. The team view flags them as "needs to rebook".
- **Interviewer overlaps their own slots.** Blocked by an exclusion constraint. Overlapping parts of a new block are skipped, not rejected as a whole.
- **Late changes.** Booking needs ≥2h lead time. Cancel or reschedule closes 12h before. Booking window is 21 days.
- **Outcome rules.** Only the slot's interviewer (or the team) can record it, only once, and only after the slot starts (relaxed in demo mode). Fail and retake need written feedback.
- **No-show** counts as an attempt (7-day cooldown). **Retake later** does not count.
- **Malpractice found later.** The team withdraws the badge with an internal reason. The student sees a neutral message with a 7-day appeal window. The row is kept for audit, not deleted.
- **Not booked yet.** The team filters eligible students who haven't booked and can send a reminder, at most one per 24h.
- **Every action is written to `audit_log`.** All times are stored in UTC and shown in IST.

**Assumptions / questions for the GRIT team**

1. Interviews are 30 min, one student per slot, and any qualified interviewer can take any eligible student (students pick a time, not a person).
2. Max 3 counted attempts per badge. Cooldowns are 14 days after a fail and 7 after a no-show. *Are these the right numbers?*
3. A withdrawn badge is terminal in the product, and reinstatement is a manual team decision. *Can a flagged student re-attempt later?*
4. Outcomes can't be edited once saved. Corrections go through the team. *Is a 24h edit window needed?*
5. Login uses GRIT's existing auth. The prototype's role switcher is demo-only.
6. Eligibility updates the moment the last skill contest is cleared. A student's later skill contest results don't affect an interview already booked.

## 3. Data model

| Table | Key fields |
|---|---|
| `users` | id, name, email, role (student / interviewer / admin), college |
| `tracks`, `skills` | track: code, name, badge_name · skill: track_id, position |
| `student_tracks`, `skill_clears` | enrolment; (student_id, skill_id, cleared_at). Eligibility = all skills of the track cleared |
| `interviewer_tracks` | which badges each interviewer may assess |
| `interview_slots` | interviewer_id, starts_at, ends_at, cancelled_at |
| `interviews` | student_id, track_id, slot_id, attempt_no, status (booked / completed / no_show / cancelled / interviewer_cancelled), outcome (pass / fail / retake_later), outcome_notes, retake_after, recorded_by, recorded_at, cancel_reason |
| `badges` | student_id, track_id, interview_id, awarded_at, revoked_at, revoked_by, revoke_reason |
| `notifications`, `audit_log` | student messages; who did what, when |

A slot has no "booked" flag. It counts as booked when a non-cancelled interview points at it, so a slot can be freed and rebooked while full history is kept.

**Preventing double booking: three layers.**

1. **Row lock.** Booking runs in a transaction that does `SELECT … FROM interview_slots WHERE id = $1 FOR UPDATE`. Concurrent requests for the same slot queue up. The second one then sees the first's booking and gets a clean "slot taken" error.
2. **Partial unique index (the real guarantee):**
   `CREATE UNIQUE INDEX ON interviews(slot_id) WHERE status NOT IN ('cancelled','interviewer_cancelled')`.
   Even if a code path skips the lock, Postgres rejects a second live row for the slot. The API maps that error to the same message.
3. **Related guards.** `UNIQUE (student_id, track_id) WHERE status = 'booked'` (one live booking per student), `UNIQUE (student_id, track_id) WHERE revoked_at IS NULL` on badges, and `EXCLUDE USING gist (interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` so an interviewer can't publish overlapping slots.

## 4–6. Prototype, messages, before/after

The live prototype has the **student** dashboard and booking screens (date tabs, time slots, confirm, reschedule, cancel), the **interviewer** day schedule with outcome recording plus availability management, and the **interview team** view (booked vs not booked, awaiting result, reminders, malpractice withdrawal, interviewer load). Demo accounts are parked in every state. **The three key student messages** (booking confirmed, passed, not cleared) and **before/after views** of the student home, badge shelf, updates feed and team row are on `/guide`, built from the same components as the live screens.

**The three most important student messages (exact copy):**

1. **Interview booked: Sat, 14 Nov, 4:30 PM IST.** Your Full Stack Developer interview is on Sat, 14 Nov, 4:30 PM IST with Priya Raman. The join link opens 10 minutes before. Keep your camera on and your college ID ready. Need to change it? You can reschedule or cancel until Sat, 14 Nov, 4:30 AM IST.
2. **You've earned the Full Stack Developer badge.** Congratulations, you cleared the interview. The Full Stack Developer badge is now live on your GRIT profile and counts towards your leaderboard standing.
3. **Full Stack Developer interview: not cleared this time.** You didn't clear this attempt, but your skills are still on record. You can book your next interview from 28 Nov 2026. You have 2 attempts left. Interviewer feedback: "Good fundamentals, but struggled to debug the failing API call."

**Stack:** React + Vite · Node/Express · PostgreSQL · Docker, deployable to AWS (EC2 + Compose, or Elastic Beanstalk + RDS).

<small>© 2026 Nishant. Proprietary, submitted for hiring evaluation only. See LICENSE.</small>
