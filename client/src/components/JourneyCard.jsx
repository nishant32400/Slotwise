// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// The main card on the student dashboard. One card per track, and its
// content depends entirely on journey.state.

import { date, dateTime, longDay, relative, time } from '../format.js';
import { StatusPill } from './bits.jsx';

const DEFAULT_RULES = { maxAttempts: 3, cancelCutoffHours: 12, joinOpensMinutes: 10 };

function Steps({ journey }) {
  const { state } = journey;
  const skillsDone = state !== 'not_eligible';
  const interviewDone = ['passed', 'badge_revoked'].includes(state);
  const interviewActive = skillsDone && !interviewDone;
  const steps = [
    { label: 'Clear skills', sub: `${journey.skillsCleared}/${journey.skillsTotal}`, done: skillsDone, active: !skillsDone },
    { label: 'Live interview', sub: interviewDone ? 'Done' : interviewActive ? 'Now' : 'Locked', done: interviewDone, active: interviewActive },
    {
      label: 'Track badge',
      sub: state === 'passed' ? 'Earned' : state === 'badge_revoked' ? 'Withdrawn' : 'Locked',
      done: state === 'passed',
      bad: state === 'badge_revoked',
    },
  ];
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s.label} className={`${s.done ? 'done' : ''} ${s.active ? 'active' : ''} ${s.bad ? 'bad' : ''}`}>
          <span className="step-dot">{s.done ? '✓' : s.bad ? '!' : i + 1}</span>
          <span className="step-text">
            <strong>{s.label}</strong>
            <small>{s.sub}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SkillList({ skills }) {
  return (
    <ul className="skill-list">
      {skills.map((s) => (
        <li key={s.id} className={s.cleared ? 'cleared' : ''}>
          <span className="tick">{s.cleared ? '✓' : ''}</span>
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Feedback({ interview }) {
  if (!interview?.notes) return null;
  return (
    <blockquote className="feedback">
      <span>Feedback from {interview.interviewer}</span>
      {interview.notes}
    </blockquote>
  );
}

function AttemptMeter({ used, max }) {
  return (
    <div className="attempts" title={`${used} of ${max} attempts used`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < used ? 'used' : ''} />)}
      <small>{max - used} of {max} attempts left</small>
    </div>
  );
}

function Body({ track, journey, rules, now, onBook, onCancel, onReschedule }) {
  const badge = track.badgeName;
  const a = journey.active;
  const last = journey.last;

  switch (journey.state) {
    case 'not_eligible': {
      const left = journey.skillsTotal - journey.skillsCleared;
      return (
        <>
          <h2>Clear {left} more {left === 1 ? 'skill' : 'skills'} to unlock your interview</h2>
          <p className="muted">The {badge} interview opens once every skill below is cleared.</p>
          <SkillList skills={journey.skills} />
        </>
      );
    }

    case 'ready_to_book':
      return (
        <>
          {last?.status === 'interviewer_cancelled' && (
            <div className="alert alert-warn">
              Your interview on {dateTime(last.startsAt)} was cancelled by the interview team
              {last.cancelReason ? ` (${last.cancelReason.toLowerCase()})` : ''}. It doesn't count as an attempt. Please pick a new time.
            </div>
          )}
          <h2>You’re ready for the {badge} interview</h2>
          <p className="muted">
            A 30-minute live interview with a GRIT interviewer. Pick any open slot in the next three weeks.
            {journey.attemptsUsed > 0 && ` This will be attempt ${journey.attemptsUsed + 1} of ${rules.maxAttempts}.`}
          </p>
          {journey.attemptsUsed > 0 && <AttemptMeter used={journey.attemptsUsed} max={rules.maxAttempts} />}
          <div className="card-actions">
            <button className="btn btn-primary" onClick={onBook}>Book interview slot</button>
          </div>
        </>
      );

    case 'booked':
    case 'in_progress': {
      const starts = new Date(a.startsAt);
      const joinOpen = now >= new Date(starts.getTime() - rules.joinOpensMinutes * 60e3);
      const cutoff = new Date(starts.getTime() - rules.cancelCutoffHours * 3600e3);
      const canChange = now < cutoff && journey.state === 'booked';
      return (
        <>
          <p className="eyebrow">{journey.state === 'in_progress' ? 'Happening now' : `Your interview is ${relative(starts, now)}`}</p>
          <div className="slot-hero">
            <div className="slot-date">
              <span>{longDay(starts)}</span>
              <strong>{time(starts)} – {time(a.endsAt)} <small>IST</small></strong>
            </div>
            <div className="slot-meta">
              <span>Interviewer</span>
              <strong>{a.interviewer}</strong>
            </div>
            <div className="slot-meta">
              <span>Attempt</span>
              <strong>{a.attemptNo} of {rules.maxAttempts}</strong>
            </div>
          </div>
          <ul className="checklist">
            <li>Join from a laptop with camera on. The link opens {rules.joinOpensMinutes} minutes before.</li>
            <li>Keep your college ID ready for a quick check at the start.</li>
            <li>Screen sharing will be needed for the hands-on part.</li>
          </ul>
          <div className="card-actions">
            <a className={`btn btn-primary ${joinOpen ? '' : 'is-disabled'}`} href={joinOpen ? a.meetingUrl : undefined}
              target="_blank" rel="noreferrer" aria-disabled={!joinOpen}>
              {joinOpen ? 'Join interview' : `Join opens at ${time(new Date(starts.getTime() - rules.joinOpensMinutes * 60e3))}`}
            </a>
            {onReschedule && (
              <>
                <button className="btn" disabled={!canChange} onClick={onReschedule}>Reschedule</button>
                <button className="btn btn-ghost" disabled={!canChange} onClick={onCancel}>Cancel booking</button>
              </>
            )}
          </div>
          {!canChange && journey.state === 'booked' && (
            <p className="hint">Changes close {rules.cancelCutoffHours} hours before the interview. For emergencies, write to the GRIT team.</p>
          )}
        </>
      );
    }

    case 'awaiting_result':
      return (
        <>
          <h2>Interview done. Your result is on its way</h2>
          <p className="muted">
            You interviewed with {a.interviewer} on {dateTime(a.startsAt)}. Results are usually posted within 24 hours,
            and you’ll see them right here.
          </p>
        </>
      );

    case 'passed':
      return (
        <div className="badge-win">
          <div className="medal">
            <span>{track.code}</span>
          </div>
          <div>
            <p className="eyebrow">Badge earned · {date(journey.badge.awardedAt)}</p>
            <h2>You’re a GRIT {badge}</h2>
            <p className="muted">The badge is live on your profile and counts towards your leaderboard standing.</p>
            <Feedback interview={journey.history.find((h) => h.outcome === 'pass')} />
          </div>
        </div>
      );

    case 'cooldown': {
      const noShow = last?.status === 'no_show';
      return (
        <>
          <h2>{noShow ? 'You missed your interview' : 'Not cleared this time'}</h2>
          <p className="muted">
            {noShow
              ? 'It has been counted as an attempt. '
              : 'Your skills are still on record, and you only need to redo the interview. '}
            You can book again from <strong>{date(journey.nextEligibleAt)}</strong>.
          </p>
          <AttemptMeter used={journey.attemptsUsed} max={rules.maxAttempts} />
          <Feedback interview={last} />
          <div className="card-actions">
            <button className="btn" disabled>Booking opens {date(journey.nextEligibleAt)}</button>
          </div>
        </>
      );
    }

    case 'retake_pending':
      return (
        <>
          <h2>Your interviewer has asked for a retake</h2>
          <p className="muted">
            {last.retakeReason ? `${last.retakeReason}. ` : ''}This doesn’t count against your attempts.
            Book a new slot from <strong>{date(journey.nextEligibleAt)}</strong>.
          </p>
          <Feedback interview={last} />
          <div className="card-actions">
            <button className="btn" disabled>Booking opens {date(journey.nextEligibleAt)}</button>
          </div>
        </>
      );

    case 'attempts_exhausted':
      return (
        <>
          <h2>All {rules.maxAttempts} attempts used</h2>
          <p className="muted">The interview team will contact you about next steps for the {badge} badge.</p>
          <AttemptMeter used={journey.attemptsUsed} max={rules.maxAttempts} />
          <Feedback interview={last} />
        </>
      );

    case 'badge_revoked':
      return (
        <>
          <h2>Your {badge} badge has been withdrawn</h2>
          <p className="muted">
            It was withdrawn on {date(journey.badge.revokedAt)} after a malpractice review and no longer shows on your
            profile. If you think this is a mistake, write to the GRIT team within 7 days of the decision.
          </p>
        </>
      );

    default:
      return null;
  }
}

export default function JourneyCard({ track, journey, rules = DEFAULT_RULES, now = new Date(), ...handlers }) {
  return (
    <article className={`journey journey-${journey.state}`}>
      <header className="journey-head">
        <div>
          <span className="track-code">{track.code}</span>
          <h3>{track.name}</h3>
        </div>
        <StatusPill state={journey.state} />
      </header>
      <Steps journey={journey} />
      <div className="journey-body">
        <Body track={track} journey={journey} rules={rules} now={now} {...handlers} />
      </div>
    </article>
  );
}
