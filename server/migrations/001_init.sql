-- GRIT Interview Scheduling
-- Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.

create extension if not exists btree_gist;

create table users (
  id          serial primary key,
  name        text not null,
  email       text not null unique,
  role        text not null check (role in ('student', 'interviewer', 'admin')),
  college     text,
  created_at  timestamptz not null default now()
);

create table tracks (
  id          serial primary key,
  code        text not null unique,
  name        text not null,
  badge_name  text not null
);

create table skills (
  id        serial primary key,
  track_id  int not null references tracks(id) on delete cascade,
  name      text not null,
  position  int not null default 0
);

create table student_tracks (
  student_id  int not null references users(id) on delete cascade,
  track_id    int not null references tracks(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (student_id, track_id)
);

create table skill_clears (
  student_id  int not null references users(id) on delete cascade,
  skill_id    int not null references skills(id) on delete cascade,
  cleared_at  timestamptz not null default now(),
  primary key (student_id, skill_id)
);

create table interviewer_tracks (
  interviewer_id  int not null references users(id) on delete cascade,
  track_id        int not null references tracks(id) on delete cascade,
  primary key (interviewer_id, track_id)
);

-- One row per bookable window. A slot is "open" when it is not cancelled and
-- has no live interview row pointing at it.
create table interview_slots (
  id              serial primary key,
  interviewer_id  int not null references users(id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  -- an interviewer cannot publish two overlapping live slots
  exclude using gist (
    interviewer_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (cancelled_at is null)
);

create index interview_slots_starts_idx on interview_slots (starts_at) where cancelled_at is null;

create table interviews (
  id              serial primary key,
  student_id      int not null references users(id),
  track_id        int not null references tracks(id),
  slot_id         int not null references interview_slots(id),
  attempt_no      int not null,
  status          text not null default 'booked'
                  check (status in ('booked', 'completed', 'no_show', 'cancelled', 'interviewer_cancelled')),
  outcome         text check (outcome in ('pass', 'fail', 'retake_later')),
  outcome_notes   text,
  retake_reason   text,
  retake_after    date,
  recorded_by     int references users(id),
  recorded_at     timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  meeting_url     text,
  created_at      timestamptz not null default now(),
  check ((status = 'completed') = (outcome is not null))
);

-- The double-booking guard. Only one non-cancelled interview may point at a
-- slot. Cancelled rows are kept for history, so this has to be partial.
create unique index interviews_one_per_slot
  on interviews (slot_id)
  where status not in ('cancelled', 'interviewer_cancelled');

-- A student holds at most one upcoming booking per track.
create unique index interviews_one_active_per_student_track
  on interviews (student_id, track_id)
  where status = 'booked';

create index interviews_student_idx on interviews (student_id, track_id, created_at desc);

create table badges (
  id             serial primary key,
  student_id     int not null references users(id),
  track_id       int not null references tracks(id),
  interview_id   int not null references interviews(id),
  awarded_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     int references users(id),
  revoke_reason  text
);

create unique index badges_one_live_per_track
  on badges (student_id, track_id)
  where revoked_at is null;

create table notifications (
  id          serial primary key,
  user_id     int not null references users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);

create table audit_log (
  id          bigserial primary key,
  actor_id    int references users(id),
  action      text not null,
  entity      text not null,
  entity_id   int,
  data        jsonb,
  created_at  timestamptz not null default now()
);
