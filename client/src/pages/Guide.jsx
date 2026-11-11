// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Reviewer guide: how to walk the prototype, the state model, the three key
// student messages and before/after views of every screen the result changes.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../components/bits.jsx';
import JourneyCard from '../components/JourneyCard.jsx';
import ProfileStrip from '../components/ProfileStrip.jsx';
import { date, dateTime } from '../format.js';

const DAY = 86400e3;
const now = new Date();
const track = { id: 1, code: 'FSD', name: 'Full Stack Development', badgeName: 'Full Stack Developer' };
const user = { name: 'Aarav Mehta', college: 'NIAT Hyderabad' };
const skills = ['HTML & CSS', 'JavaScript', 'React', 'Node.js & Express', 'SQL'].map((name, id) => ({ id, name, cleared: true }));

const interview = {
  id: 1, attemptNo: 1, interviewer: 'Priya Raman', status: 'booked',
  startsAt: new Date(now - 2 * 3600e3).toISOString(), endsAt: new Date(now - 1.5 * 3600e3).toISOString(),
};

const base = { skills, skillsTotal: 5, skillsCleared: 5, attemptsUsed: 0, attemptsLeft: 3, canBook: false, history: [] };

const SCENARIOS = {
  pass: {
    label: 'Pass',
    journey: {
      ...base, state: 'passed',
      badge: { awardedAt: now.toISOString() },
      history: [{ ...interview, status: 'completed', outcome: 'pass', notes: 'Strong on React state and clear about trade-offs in your API design.' }],
    },
    feed: ['passed', 'You\'ve earned the Full Stack Developer badge'],
    team: { state: 'passed', note: 'Badge awarded · Flag malpractice' },
  },
  fail: {
    label: 'Fail',
    journey: {
      ...base, state: 'cooldown', attemptsUsed: 1, attemptsLeft: 2,
      nextEligibleAt: new Date(+now + 14 * DAY).toISOString(),
      last: { ...interview, status: 'completed', outcome: 'fail', notes: 'Good fundamentals, but struggled to debug the failing API call. Practise reading network errors end to end.' },
    },
    feed: ['failed', 'Full Stack Developer interview: not cleared this time'],
    team: { state: 'cooldown', note: `Can rebook ${date(+now + 14 * DAY)} · 1/3 attempts` },
  },
  retake: {
    label: 'Retake later',
    journey: {
      ...base, state: 'retake_pending',
      nextEligibleAt: new Date(+now + 3 * DAY).toISOString(),
      last: { ...interview, status: 'completed', outcome: 'retake_later', retakeReason: 'Connection dropped', notes: 'We covered most of it. Need 15 more minutes for the SQL section.' },
    },
    feed: ['retake', 'Full Stack Developer interview: we\'ll continue in another session'],
    team: { state: 'retake_pending', note: `Can rebook ${date(+now + 3 * DAY)} · 0/3 attempts` },
  },
  revoked: {
    label: 'Later flagged for malpractice',
    journey: { ...base, state: 'badge_revoked', badge: { awardedAt: new Date(+now - 20 * DAY).toISOString(), revokedAt: now.toISOString() } },
    feed: ['revoked', 'Full Stack Developer badge withdrawn'],
    team: { state: 'badge_revoked', note: 'Withdrawn just now' },
  },
};

const BEFORE = { ...base, state: 'awaiting_result', active: interview };

const STATES = [
  ['not_eligible', 'Some skills for the track are still not cleared', 'Last skill cleared → Ready to book'],
  ['ready_to_book', 'Eligible, no live booking', 'Books a slot → Booked'],
  ['booked', 'Holds a future slot', 'Slot starts → In progress · Student cancels/reschedules (≥12h before) → Ready · Interviewer cancels → Ready (no attempt used)'],
  ['in_progress', 'Slot has started', 'Slot ends → Awaiting result · Outcome recorded early → result state'],
  ['awaiting_result', 'Slot is over, no outcome yet', 'Pass → Passed · Fail/No-show → Cooldown · Retake → Retake'],
  ['passed', 'Badge is live', 'Malpractice confirmed → Badge withdrawn'],
  ['cooldown', 'Fail or no-show, attempt used, 14/7 day wait', 'Wait ends → Ready · 3rd counted attempt → Attempts used'],
  ['retake_pending', 'Interviewer asked for retake, no attempt used', 'Retake date reached → Ready'],
  ['attempts_exhausted', 'Three counted attempts', 'Team decides outside the system'],
  ['badge_revoked', 'Badge withdrawn after malpractice', 'Terminal unless the team reinstates on appeal'],
];

function Feed({ items }) {
  return (
    <ul className="feed feed-mini">
      {items.map(([kind, title]) => (
        <li key={title} className={`feed-item feed-${kind} unread`}><strong>{title}</strong><small>just now</small></li>
      ))}
    </ul>
  );
}

function TeamRow({ state, slotText, note }) {
  return (
    <table className="table table-mini">
      <tbody>
        <tr>
          <td><strong>Aarav Mehta</strong><small className="block muted">NIAT Hyderabad</small></td>
          <td><StatusPill state={state} />{note && <small className="block muted">{note}</small>}</td>
          <td>{slotText}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function Guide() {
  const [pick, setPick] = useState('pass');
  const after = SCENARIOS[pick];

  return (
    <div className="page guide">
      <h1>Reviewer guide</h1>
      <p className="lead">
        This prototype covers the GRIT badge interview flow end to end: students book, interviewers manage availability
        and record outcomes, and the interview team tracks who has and hasn’t booked.
      </p>

      <section className="panel">
        <h3 className="panel-title">Try the full flow in two minutes</h3>
        <ol className="walk">
          <li><Link to="/sign-in">Sign in</Link> as <strong>Aarav Mehta</strong> (student). He’s eligible but hasn’t booked. Book any slot.</li>
          <li>Switch user to <strong>Neha Kulkarni</strong> (interview team). Aarav has moved from “Eligible, not booked” to “Booked”.</li>
          <li>Switch to <strong>Priya Raman</strong> (interviewer). Go to the day of Aarav’s interview and record an outcome. Demo mode allows this before the slot time.</li>
          <li>Switch back to Aarav. His dashboard, badge shelf and updates now show the result.</li>
          <li>Other accounts are parked in every other state: cooldown, retake, withdrawn badge, cancelled by interviewer, and so on. Neha can reset the demo data at any time.</li>
        </ol>
      </section>

      <section className="panel">
        <h3 className="panel-title">Before and after the result</h3>
        <p className="muted">Pick an outcome to see how each screen changes. These are the same components the live screens use.</p>
        <div className="seg">
          {Object.entries(SCENARIOS).map(([k, s]) => (
            <button key={k} className={k === pick ? 'is-active' : ''} onClick={() => setPick(k)}>{s.label}</button>
          ))}
        </div>

        <h4 className="ba-title">Student home</h4>
        <div className="ba">
          <div className="ba-col">
            <span className="ba-tag">Before</span>
            <ProfileStrip user={user} tracks={[{ track, journey: BEFORE }]} />
            <JourneyCard track={track} journey={BEFORE} />
          </div>
          <div className="ba-col">
            <span className="ba-tag ba-tag-after">After: {after.label}</span>
            <ProfileStrip user={user} tracks={[{ track, journey: after.journey }]} />
            <JourneyCard track={track} journey={after.journey} />
          </div>
        </div>

        <h4 className="ba-title">Updates feed</h4>
        <div className="ba">
          <div className="ba-col"><span className="ba-tag">Before</span><Feed items={[['booked', `Interview booked: ${dateTime(interview.startsAt)} IST`]]} /></div>
          <div className="ba-col"><span className="ba-tag ba-tag-after">After</span><Feed items={[after.feed, ['booked', `Interview booked: ${dateTime(interview.startsAt)} IST`]]} /></div>
        </div>

        <h4 className="ba-title">Interview team view</h4>
        <div className="ba">
          <div className="ba-col"><span className="ba-tag">Before</span><TeamRow state="awaiting_result" slotText={`${dateTime(interview.startsAt)} · Priya Raman`} /></div>
          <div className="ba-col"><span className="ba-tag ba-tag-after">After</span><TeamRow state={after.team.state} note={after.team.note} slotText={`${dateTime(interview.startsAt)} · Priya Raman`} /></div>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">The three messages that matter most</h3>
        <div className="msgs">
          <div className="msg">
            <span className="msg-label">1 · Booking confirmed</span>
            <strong>Interview booked: Sat, 14 Nov, 4:30 PM IST</strong>
            <p>Your Full Stack Developer interview is on Sat, 14 Nov, 4:30 PM IST with Priya Raman. The join link opens 10 minutes before. Keep your camera on and your college ID ready. Need to change it? You can reschedule or cancel until Sat, 14 Nov, 4:30 AM IST.</p>
          </div>
          <div className="msg msg-green">
            <span className="msg-label">2 · Passed</span>
            <strong>You’ve earned the Full Stack Developer badge</strong>
            <p>Congratulations, you cleared the interview. The Full Stack Developer badge is now live on your GRIT profile and counts towards your leaderboard standing.</p>
          </div>
          <div className="msg msg-red">
            <span className="msg-label">3 · Not cleared</span>
            <strong>Full Stack Developer interview: not cleared this time</strong>
            <p>You didn’t clear this attempt, but your skills are still on record. You can book your next interview from 28 Nov 2026. You have 2 attempts left. Interviewer feedback: “Good fundamentals, but struggled to debug the failing API call.”</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Student journey states</h3>
        <table className="table">
          <thead><tr><th>State</th><th>Meaning</th><th>Moves on when</th></tr></thead>
          <tbody>
            {STATES.map(([s, meaning, next]) => (
              <tr key={s}><td><StatusPill state={s} /></td><td>{meaning}</td><td>{next}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
