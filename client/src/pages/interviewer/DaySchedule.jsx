// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useSession } from '../../App.jsx';
import { Empty, Stat, StatusPill } from '../../components/bits.jsx';
import { date, isoDay, longDay, shiftDay, time } from '../../format.js';

const RESULTS = [
  { value: 'pass', label: 'Pass', help: 'Badge is awarded straight away.' },
  { value: 'fail', label: 'Fail', help: 'Counts as an attempt. Student can rebook after 14 days.' },
  { value: 'retake_later', label: 'Retake later', help: 'Not the student’s fault (network, time ran out). No attempt used.' },
  { value: 'no_show', label: 'No-show', help: 'Student didn’t join. Counts as an attempt.' },
];

const OUTCOME_LABEL = { pass: 'Passed', fail: 'Not cleared', retake_later: 'Retake requested' };

function slotState(s, now) {
  if (!s.interview_id) return now > new Date(s.ends_at) ? 'past-open' : 'open';
  if (s.status === 'completed') return s.outcome;
  if (s.status === 'no_show') return 'no_show';
  if (now >= new Date(s.starts_at)) return 'due';
  return 'upcoming';
}

function OutcomeForm({ slot, demoMode, onSaved }) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [retakeAfter, setRetakeAfter] = useState(shiftDay(isoDay(), 3));
  const [retakeReason, setRetakeReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const notesRequired = result === 'fail' || result === 'retake_later';

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/interviewer/interviews/${slot.interview_id}/outcome`, {
        result, notes, retakeAfter: result === 'retake_later' ? retakeAfter : undefined, retakeReason,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const early = new Date() < new Date(slot.starts_at);

  return (
    <form className="outcome-form" onSubmit={save}>
      {early && demoMode && (
        <p className="hint">Demo mode: you can record this before the slot time so the full flow can be tried.</p>
      )}
      <div className="result-options" role="radiogroup" aria-label="Result">
        {RESULTS.map((r) => (
          <label key={r.value} className={`result-option result-${r.value} ${result === r.value ? 'is-picked' : ''}`}>
            <input type="radio" name={`result-${slot.interview_id}`} value={r.value}
              checked={result === r.value} onChange={() => setResult(r.value)} />
            <strong>{r.label}</strong>
            <small>{r.help}</small>
          </label>
        ))}
      </div>

      {result === 'retake_later' && (
        <div className="form-row">
          <label>
            Reason
            <select value={retakeReason} onChange={(e) => setRetakeReason(e.target.value)}>
              <option value="">Choose…</option>
              <option>Connection dropped</option>
              <option>Ran out of time</option>
              <option>Student requested a break</option>
              <option>Interviewer had an issue</option>
            </select>
          </label>
          <label>
            Can rebook from
            <input type="date" value={retakeAfter} min={shiftDay(isoDay(), 1)} onChange={(e) => setRetakeAfter(e.target.value)} />
          </label>
        </div>
      )}

      {result && (
        <label className="block">
          Feedback for the student {notesRequired ? '(required)' : '(optional)'}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={notesRequired ? 'What went well, and what they should work on before the next attempt.' : 'Anything worth sharing with the student.'} />
        </label>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!result || busy}>
          {busy ? 'Saving…' : 'Save outcome'}
        </button>
        <span className="hint">The student sees this on their dashboard straight away. It can’t be edited later.</span>
      </div>
    </form>
  );
}

export default function DaySchedule() {
  const { user } = useSession();
  const [day, setDay] = useState(isoDay());
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [interviewers, setInterviewers] = useState([]);
  const [who, setWho] = useState('');
  const [error, setError] = useState(null);
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/api/team/overview').then((d) => {
      setInterviewers(d.interviewers);
      setWho((w) => w || String(d.interviewers[0]?.id || ''));
    });
  }, [isAdmin]);

  const load = useCallback(() => {
    if (isAdmin && !who) return;
    const q = new URLSearchParams({ date: day, ...(isAdmin ? { interviewerId: who } : {}) });
    api.get(`/api/interviewer/schedule?${q}`).then(setData).catch((e) => setError(e.message));
  }, [day, who, isAdmin]);

  useEffect(load, [load]);

  const now = new Date();
  const slots = data?.slots || [];
  const booked = slots.filter((s) => s.interview_id);
  const pending = booked.filter((s) => s.status === 'booked' && now >= new Date(s.ends_at));
  const doneCount = booked.filter((s) => s.status !== 'booked').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{day === isoDay() ? 'Today’s interviews' : longDay(`${day}T12:00:00+05:30`)}</h1>
          <p className="muted">{day === isoDay() ? `${longDay(`${day}T12:00:00+05:30`)} · ` : ''}times in IST</p>
        </div>
        <div className="head-actions">
          {isAdmin && (
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Interviewer">
              {interviewers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
          <div className="day-nav">
            <button className="btn btn-sm" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day">‹</button>
            <button className="btn btn-sm" onClick={() => setDay(isoDay())}>Today</button>
            <button className="btn btn-sm" onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day">›</button>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stats">
        <Stat label="Interviews" value={booked.length} />
        <Stat label="Outcome pending" value={pending.length} tone={pending.length ? 'amber' : undefined} />
        <Stat label="Completed" value={doneCount} />
        <Stat label="Open slots" value={slots.length - booked.length} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && <div className="skeleton" />}
      {data && slots.length === 0 && (
        <Empty title="No slots on this day">
          {isAdmin ? 'This interviewer has not opened any slots here.' : <Link to="/interviewer/availability">Add availability</Link>}
        </Empty>
      )}

      <ol className="timeline">
        {slots.map((s) => {
          const st = slotState(s, now);
          const open = openId === s.slot_id;
          return (
            <li key={s.slot_id} className={`tl-item tl-${st}`}>
              <div className="tl-time">
                <strong>{time(s.starts_at)}</strong>
                <small>{time(s.ends_at)}</small>
              </div>
              <div className="tl-card">
                {!s.interview_id ? (
                  <div className="tl-row">
                    <span className="muted">{st === 'past-open' ? 'Not booked' : 'Open, nobody has booked yet'}</span>
                  </div>
                ) : (
                  <>
                    <div className="tl-row">
                      <div>
                        <strong className="tl-name">{s.student_name}</strong>
                        <span className="muted"> · {s.college} · {s.track_name}</span>
                        <div className="tl-sub">
                          Attempt {s.attempt_no}
                          {s.previous.length > 0 && ` · ${s.previous.length} earlier ${s.previous.length === 1 ? 'attempt' : 'attempts'}`}
                        </div>
                      </div>
                      <div className="tl-right">
                        {st === 'upcoming' && <StatusPill state="booked">Upcoming</StatusPill>}
                        {st === 'due' && <StatusPill state="awaiting_result">Outcome due</StatusPill>}
                        {st === 'pass' && <StatusPill state="passed">Passed</StatusPill>}
                        {st === 'fail' && <StatusPill state="cooldown">Not cleared</StatusPill>}
                        {st === 'retake_later' && <StatusPill state="retake_pending">Retake</StatusPill>}
                        {st === 'no_show' && <StatusPill state="cooldown">No-show</StatusPill>}
                        {s.status === 'booked' && (
                          <>
                            <a className="btn btn-sm" href={s.meeting_url} target="_blank" rel="noreferrer">Open call</a>
                            <button className={`btn btn-sm ${st === 'due' ? 'btn-primary' : ''}`}
                              onClick={() => setOpenId(open ? null : s.slot_id)}>
                              {open ? 'Close' : 'Record outcome'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {s.previous.length > 0 && s.status === 'booked' && (
                      <ul className="prev">
                        {s.previous.map((p) => (
                          <li key={`${p.attempt_no}-${p.recorded_at}`}>
                            <span>{date(p.recorded_at)} · {p.interviewer} · {p.status === 'no_show' ? 'No-show' : OUTCOME_LABEL[p.outcome]}</span>
                            {p.outcome_notes && <em>“{p.outcome_notes}”</em>}
                          </li>
                        ))}
                      </ul>
                    )}

                    {s.status !== 'booked' && s.outcome_notes && <p className="tl-notes">“{s.outcome_notes}”</p>}

                    {open && s.status === 'booked' && (
                      <OutcomeForm slot={s} demoMode={data.demoMode} onSaved={() => { setOpenId(null); load(); }} />
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
