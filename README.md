# GRIT Badge Interviews

Interview scheduling for GRIT Track Badges. Eligible students book a live
interview slot. Interviewers publish availability and record the outcome
(pass, fail, retake later or no-show). The interview team sees who has and
hasn't booked, and can withdraw a badge if malpractice is found later.

Built as the Round 1 assignment for the AI Product Engineer role.
The design write-up is in [`WRITEUP.md`](WRITEUP.md) (PDF: [`docs/Writeup.pdf`](docs/Writeup.pdf)).

> **Licence.** This is proprietary code shared for hiring evaluation only.
> It may not be used, copied, deployed for real users or adapted without a
> written licence from the author. See [`LICENSE`](LICENSE).

## What's in the prototype

| Who | Screens |
|---|---|
| Student | Dashboard with journey card, badge shelf, updates and history · Slot booking · Reschedule · Cancel |
| Interviewer | Day schedule with outcome recording and earlier-attempt context · Availability (add blocks, remove slots, cancel a booked slot with a reason) |
| Interview team | Eligible students filtered by booked / not booked / awaiting result / passed / cooldown · Reminders · Malpractice withdrawal · Interviewer load · Demo reset |
| Reviewer | `/guide`: walkthrough, state table, the three key student messages, before/after views |

Demo accounts cover every journey state. The quickest path: book as Aarav,
record a result as Priya, then go back to Aarav.

## Running locally

Needs Node 20+ and PostgreSQL 14+ (or just Docker).

**With Docker**

```bash
cp .env.example .env          # set SESSION_SECRET
docker compose up --build     # http://localhost
```

**Without Docker**

```bash
createdb grit                 # user/password grit/grit, or set DATABASE_URL
cd server && npm install && npm run migrate && npm run seed && npm run dev
cd client && npm install && npm run dev      # http://localhost:5173
```

**Tests** run against a real Postgres because the interesting part is the
concurrency behaviour:

```bash
createdb grit_test
cd server && npm test
```

The suite fires 20 simultaneous bookings at one slot and checks that exactly
one wins. It also covers reschedule atomicity, outcome rules, cooldowns,
retakes, badge withdrawal and overlapping availability.

## Deploying to AWS

See [`docs/DEPLOY_AWS.md`](docs/DEPLOY_AWS.md). The short version for a review link:

```bash
# on a fresh Amazon Linux 2023 EC2 instance, inside the project folder
bash deploy/ec2-setup.sh
```

## Layout

```
server/
  migrations/001_init.sql   schema, constraints, partial indexes
  src/services/journey.js   derives the student's state from rows
  src/services/booking.js   booking, cancel, reschedule (locking + unique index)
  src/services/outcomes.js  pass / fail / retake / no-show, badge withdrawal
  src/services/slots.js     availability blocks and slot removal
  src/messages.js           every message a student receives
  src/license.js            evaluation / licence gate
  scripts/                  migrate, seed
  test/                     node:test suite
client/
  src/pages/student         dashboard, booking
  src/pages/interviewer     day schedule, availability
  src/pages/team            team overview
  src/pages/Guide.jsx       reviewer guide with before/after
docs/                       write-up PDF, AWS guide
deploy/                     EC2 setup script
tools/issue-license.js      author-only licence key issuer
```

## Notes on decisions

- **State is derived, not stored.** `journey.js` computes the state from
  interviews, badges and skill clears, so there is no status column that can
  drift out of sync.
- **Double booking is stopped in the database, not just in code.** A
  `FOR UPDATE` lock on the slot gives a clean error message, and a partial
  unique index on `interviews(slot_id)` is the hard guarantee.
- **Students pick a time, not an interviewer.** The slot grid collapses
  identical times across interviewers.
- **Demo mode** turns on the role switcher and lets interviewers record an
  outcome before the slot time. Turn it off (`DEMO_MODE=false`) behind real SSO.

---

© 2026 Nishant. All rights reserved.
