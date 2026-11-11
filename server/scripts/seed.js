// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Demo data. Every date is relative to "now" so the prototype always has
// something on today's schedule, whenever it is opened.

import { fileURLToPath } from 'node:url';
import { pool, tx } from '../src/db.js';
import { messages } from '../src/messages.js';

const MIN = 60e3;
const DAY = 24 * 60 * MIN;

const istDate = (offsetDays) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * DAY));
const at = (offsetDays, hhmm) => new Date(`${istDate(offsetDays)}T${hhmm}:00+05:30`);

const TRACKS = [
  {
    code: 'FSD', name: 'Full Stack Development', badge: 'Full Stack Developer',
    skills: ['HTML & CSS', 'JavaScript', 'React', 'Node.js & Express', 'SQL'],
  },
  {
    code: 'DA', name: 'Data Analytics', badge: 'Data Analyst',
    skills: ['Excel', 'SQL', 'Python for Data', 'Power BI'],
  },
  {
    code: 'GAI', name: 'Generative AI', badge: 'GenAI Engineer',
    skills: ['Python', 'Prompt Engineering', 'LLM APIs', 'RAG Systems'],
  },
];

const USERS = [
  { name: 'Neha Kulkarni', role: 'admin', college: 'GRIT Interview Team' },
  { name: 'Priya Raman', role: 'interviewer', tracks: ['FSD', 'DA'] },
  { name: 'Vikram Shetty', role: 'interviewer', tracks: ['FSD', 'GAI'] },
  { name: 'Farhan Ali', role: 'interviewer', tracks: ['DA', 'GAI'] },
  { name: 'Aarav Mehta', role: 'student', college: 'NIAT Hyderabad', track: 'FSD', cleared: 'all' },
  { name: 'Diya Sharma', role: 'student', college: 'NIAT Bengaluru', track: 'FSD', cleared: 'all' },
  { name: 'Kabir Singh', role: 'student', college: 'NIAT Pune', track: 'FSD', cleared: 'all' },
  { name: 'Meera Iyer', role: 'student', college: 'NIAT Chennai', track: 'DA', cleared: 'all' },
  { name: 'Rohan Das', role: 'student', college: 'NIAT Hyderabad', track: 'FSD', cleared: 3 },
  { name: 'Sneha Reddy', role: 'student', college: 'NIAT Hyderabad', track: 'DA', cleared: 'all' },
  { name: 'Ishaan Gupta', role: 'student', college: 'NIAT Delhi', track: 'GAI', cleared: 'all' },
  { name: 'Ananya Rao', role: 'student', college: 'NIAT Bengaluru', track: 'FSD', cleared: 'all' },
  { name: 'Arjun Nair', role: 'student', college: 'NIAT Kochi', track: 'DA', cleared: 'all' },
  { name: 'Tanvi Joshi', role: 'student', college: 'NIAT Pune', track: 'FSD', cleared: 'all' },
  { name: 'Karthik Menon', role: 'student', college: 'NIAT Chennai', track: 'FSD', cleared: 'all' },
  { name: 'Pooja Verma', role: 'student', college: 'NIAT Delhi', track: 'DA', cleared: 2 },
];

const AVAILABILITY = {
  'Priya Raman': [['10:00', '12:30'], ['14:30', '17:30']],
  'Vikram Shetty': [['11:00', '13:00'], ['16:00', '18:00']],
  'Farhan Ali': [['09:30', '11:30'], ['18:00', '20:00']],
};

export async function seed() {
  await tx(async (db) => {
    await db.query(`truncate audit_log, notifications, badges, interviews, interview_slots, interviewer_tracks,
      skill_clears, student_tracks, skills, tracks, users restart identity cascade`);

    const track = {};
    for (const t of TRACKS) {
      const { rows } = await db.query(
        'insert into tracks (code, name, badge_name) values ($1, $2, $3) returning *', [t.code, t.name, t.badge],
      );
      track[t.code] = { ...rows[0], skills: [] };
      for (const [i, name] of t.skills.entries()) {
        const { rows: s } = await db.query(
          'insert into skills (track_id, name, position) values ($1, $2, $3) returning id', [rows[0].id, name, i],
        );
        track[t.code].skills.push(s[0].id);
      }
    }

    const user = {};
    for (const u of USERS) {
      const email = `${u.name.toLowerCase().replace(/\s+/g, '.')}@demo.grit`;
      const { rows } = await db.query(
        'insert into users (name, email, role, college) values ($1, $2, $3, $4) returning *',
        [u.name, email, u.role, u.college || null],
      );
      user[u.name] = rows[0];
      for (const code of u.tracks || []) {
        await db.query('insert into interviewer_tracks values ($1, $2)', [rows[0].id, track[code].id]);
      }
      if (u.track) {
        const t = track[u.track];
        await db.query(
          'insert into student_tracks (student_id, track_id, joined_at) values ($1, $2, $3)',
          [rows[0].id, t.id, new Date(Date.now() - 120 * DAY)],
        );
        const n = u.cleared === 'all' ? t.skills.length : u.cleared;
        for (const [i, skillId] of t.skills.slice(0, n).entries()) {
          await db.query(
            'insert into skill_clears (student_id, skill_id, cleared_at) values ($1, $2, $3)',
            [rows[0].id, skillId, new Date(Date.now() - (60 - i * 8) * DAY)],
          );
        }
        if (n === t.skills.length) {
          const m = messages.eligible({ badge: t.badge_name });
          await db.query(
            'insert into notifications (user_id, kind, title, body, created_at, read_at) values ($1,$2,$3,$4,$5,$5)',
            [rows[0].id, m.kind, m.title, m.body, new Date(Date.now() - 25 * DAY)],
          );
        }
      }
    }

    const slot = async (interviewer, startsAt, minutes = 30, cancelled = false) => {
      const { rows } = await db.query(
        `insert into interview_slots (interviewer_id, starts_at, ends_at, cancelled_at)
         values ($1, $2, $3, $4) returning id`,
        [user[interviewer].id, startsAt, new Date(startsAt.getTime() + minutes * MIN), cancelled ? startsAt : null],
      );
      return rows[0].id;
    };

    const note = (student, msg, createdAt) => db.query(
      'insert into notifications (user_id, kind, title, body, created_at) values ($1, $2, $3, $4, $5)',
      [user[student].id, msg.kind, msg.title, msg.body, createdAt],
    );

    const interview = async (student, code, slotId, fields) => {
      const cols = { student_id: user[student].id, track_id: track[code].id, slot_id: slotId, attempt_no: 1, ...fields };
      const keys = Object.keys(cols);
      const { rows } = await db.query(
        `insert into interviews (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
        Object.values(cols),
      );
      return rows[0].id;
    };

    const grid = new Date(Math.floor(Date.now() / (30 * MIN)) * 30 * MIN);
    const priya = user['Priya Raman'].id;

    // Today: one interview that already happened and still needs an outcome.
    const anSlot = await slot('Priya Raman', new Date(grid.getTime() - 90 * MIN));
    await interview('Ananya Rao', 'FSD', anSlot, { meeting_url: 'https://meet.grit.example/i/demo-ananya' });

    // Today: one coming up later.
    const tvStart = new Date(grid.getTime() + 180 * MIN);
    const tvSlot = await slot('Priya Raman', tvStart);
    await interview('Tanvi Joshi', 'FSD', tvSlot, { meeting_url: 'https://meet.grit.example/i/demo-tanvi' });
    await note('Tanvi Joshi', messages.booked({ badge: 'Full Stack Developer', startsAt: tvStart, interviewer: 'Priya Raman' }),
      new Date(Date.now() - 2 * DAY));

    // Tomorrow.
    const dyStart = at(1, '11:00');
    const dySlot = await slot('Priya Raman', dyStart);
    await interview('Diya Sharma', 'FSD', dySlot, { meeting_url: 'https://meet.grit.example/i/demo-diya' });
    await note('Diya Sharma', messages.booked({ badge: 'Full Stack Developer', startsAt: dyStart, interviewer: 'Priya Raman' }),
      new Date(Date.now() - 1 * DAY));

    // Passed five days ago.
    const kbStart = at(-5, '11:00');
    const kb = await interview('Kabir Singh', 'FSD', await slot('Vikram Shetty', kbStart), {
      status: 'completed', outcome: 'pass', outcome_notes: 'Clear explanation of REST design and solid debugging.',
      recorded_by: user['Vikram Shetty'].id, recorded_at: new Date(kbStart.getTime() + 35 * MIN),
    });
    await db.query('insert into badges (student_id, track_id, interview_id, awarded_at) values ($1, $2, $3, $4)',
      [user['Kabir Singh'].id, track.FSD.id, kb, new Date(kbStart.getTime() + 35 * MIN)]);
    await note('Kabir Singh', messages.passed({ badge: 'Full Stack Developer' }), new Date(kbStart.getTime() + 35 * MIN));

    // Failed three days ago, in cooldown.
    const mrStart = at(-3, '10:00');
    const mrNotes = 'Good with SQL joins but struggled to explain the dashboard metrics. Practise walking through your own analysis.';
    await interview('Meera Iyer', 'DA', await slot('Farhan Ali', mrStart), {
      status: 'completed', outcome: 'fail', outcome_notes: mrNotes,
      recorded_by: user['Farhan Ali'].id, recorded_at: new Date(mrStart.getTime() + 40 * MIN),
    });
    await note('Meera Iyer', messages.failed({
      badge: 'Data Analyst', attemptsLeft: 2, notes: mrNotes, nextDate: new Date(mrStart.getTime() + 14 * DAY),
    }), new Date(mrStart.getTime() + 40 * MIN));

    // Passed earlier, badge withdrawn after a malpractice review.
    const snStart = at(-20, '15:00');
    const sn = await interview('Sneha Reddy', 'DA', await slot('Priya Raman', snStart), {
      status: 'completed', outcome: 'pass', recorded_by: priya, recorded_at: new Date(snStart.getTime() + 30 * MIN),
    });
    await db.query(
      `insert into badges (student_id, track_id, interview_id, awarded_at, revoked_at, revoked_by, revoke_reason)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [user['Sneha Reddy'].id, track.DA.id, sn, new Date(snStart.getTime() + 30 * MIN), new Date(Date.now() - 2 * DAY),
        user['Neha Kulkarni'].id, 'Proctoring review found a second person answering during the SQL round.'],
    );
    await note('Sneha Reddy', messages.passed({ badge: 'Data Analyst' }), new Date(snStart.getTime() + 30 * MIN));
    await note('Sneha Reddy', messages.revoked({ badge: 'Data Analyst' }), new Date(Date.now() - 2 * DAY));

    // Retake requested yesterday because the call dropped.
    const isStart = at(-1, '16:00');
    await interview('Ishaan Gupta', 'GAI', await slot('Vikram Shetty', isStart), {
      status: 'completed', outcome: 'retake_later', retake_reason: 'Connection dropped twice',
      outcome_notes: 'We covered prompting and API usage well. Need another 20 minutes for the RAG section.',
      retake_after: istDate(2), recorded_by: user['Vikram Shetty'].id, recorded_at: new Date(isStart.getTime() + 30 * MIN),
    });
    await note('Ishaan Gupta', messages.retake({
      badge: 'GenAI Engineer', nextDate: `${istDate(2)}T00:00:00+05:30`, reason: 'Connection dropped twice',
    }), new Date(isStart.getTime() + 30 * MIN));

    // Interviewer cancelled; student needs to rebook.
    const kmStart = at(2, '12:00');
    await interview('Karthik Menon', 'FSD', await slot('Vikram Shetty', kmStart, 30, true), {
      status: 'interviewer_cancelled', cancelled_at: new Date(Date.now() - 6 * 3600e3), cancel_reason: 'Interviewer unwell',
    });
    await note('Karthik Menon', messages.cancelledByInterviewer({
      badge: 'Full Stack Developer', startsAt: kmStart, reason: 'Interviewer unwell',
    }), new Date(Date.now() - 6 * 3600e3));

    // Open availability for the next ten days.
    for (let d = 0; d <= 10; d++) {
      for (const [name, windows] of Object.entries(AVAILABILITY)) {
        if (d % 7 === 6 && name !== 'Farhan Ali') continue;
        for (const [from, to] of windows) {
          for (let t = at(d, from); t < at(d, to); t = new Date(t.getTime() + 30 * MIN)) {
            if (t.getTime() < Date.now() + 30 * MIN) continue;
            await db.query(
              `insert into interview_slots (interviewer_id, starts_at, ends_at) values ($1, $2, $3)
               on conflict do nothing`,
              [user[name].id, t, new Date(t.getTime() + 30 * MIN)],
            );
          }
        }
      }
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => {
      console.log('seeded demo data');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
