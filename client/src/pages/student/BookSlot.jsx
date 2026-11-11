// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty, Modal } from '../../components/bits.jsx';
import { dateTime, day, isoDay, longDay, time } from '../../format.js';

function bucket(hour) {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export default function BookSlot() {
  const { trackId } = useParams();
  const [params] = useSearchParams();
  const rescheduleId = params.get('reschedule');
  const navigate = useNavigate();

  const [dash, setDash] = useState(null);
  const [slots, setSlots] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function loadSlots() {
    const d = await api.get(`/api/student/slots?trackId=${trackId}`);
    setSlots(d.slots);
    return d.slots;
  }

  useEffect(() => {
    api.get('/api/student/dashboard').then(setDash).catch((e) => setError(e.message));
    loadSlots().catch((e) => setError(e.message));
  }, [trackId]);

  const days = useMemo(() => {
    if (!slots) return [];
    const map = new Map();
    for (const s of slots) {
      const key = isoDay(s.startsAt);
      if (!map.has(key)) map.set(key, new Map());
      // Students pick a time, not a person. Keep one slot per start time.
      const times = map.get(key);
      if (!times.has(s.startsAt)) times.set(s.startsAt, s);
    }
    return [...map.entries()].map(([key, times]) => ({ key, slots: [...times.values()] }));
  }, [slots]);

  useEffect(() => {
    if (days.length && !days.some((d) => d.key === activeDay)) setActiveDay(days[0].key);
  }, [days, activeDay]);

  const entry = dash?.tracks.find((t) => String(t.track.id) === trackId);
  const current = entry?.journey.active;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = rescheduleId
        ? await api.post(`/api/student/interviews/${rescheduleId}/reschedule`, { slotId: picked.id })
        : await api.post('/api/student/bookings', { slotId: picked.id, trackId: Number(trackId) });
      setDone(res.interview);
      setPicked(null);
    } catch (e) {
      setPicked(null);
      setError(e.message);
      if (e.code === 'SLOT_TAKEN' || e.code === 'SLOT_GONE') await loadSlots();
    } finally {
      setBusy(false);
    }
  }

  if (!dash || !slots) return <div className="page"><div className="skeleton" /></div>;
  if (!entry) return <div className="page"><div className="alert alert-error">Track not found.</div></div>;

  const rules = dash.rules;

  if (done) {
    const cutoff = new Date(new Date(done.startsAt).getTime() - rules.cancelCutoffHours * 3600e3);
    return (
      <div className="page narrow">
        <div className="success-card">
          <div className="success-tick">✓</div>
          <h1>You’re booked</h1>
          <p className="lead">
            Your {entry.track.badgeName} interview is on <strong>{dateTime(done.startsAt)} IST</strong> with {done.interviewer}.
          </p>
          <p className="muted">
            The join link opens {rules.joinOpensMinutes} minutes before. Keep your camera on and your college ID ready.
            {cutoff > new Date()
              ? ` Need to change it? You can reschedule or cancel until ${dateTime(cutoff)}.`
              : ` As it is less than ${rules.cancelCutoffHours} hours away, this booking can no longer be changed online.`}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/student')}>Back to dashboard</button>
        </div>
      </div>
    );
  }

  if (!rescheduleId && !entry.journey.canBook) {
    return (
      <div className="page narrow">
        <Empty title="Booking isn’t open for you right now">
          <Link to="/student">Go back to your dashboard</Link> to see why.
        </Empty>
      </div>
    );
  }

  const today = days.find((d) => d.key === activeDay);
  const groups = today
    ? today.slots.reduce((acc, s) => {
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date(s.startsAt)));
      (acc[bucket(h)] ||= []).push(s);
      return acc;
    }, {})
    : {};

  return (
    <div className="page">
      <Link to="/student" className="back">← Dashboard</Link>
      <div className="page-head">
        <div>
          <h1>{rescheduleId ? 'Pick a new time' : 'Book your interview'}</h1>
          <p className="muted">
            {entry.track.badgeName} badge · 30 minutes · live on video. All times are IST.
          </p>
        </div>
      </div>

      {rescheduleId && current && (
        <div className="alert alert-info">
          Currently booked for <strong>{dateTime(current.startsAt)}</strong>. Your current slot is kept until the new one is confirmed.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {days.length === 0 ? (
        <Empty title="No open slots right now">
          Interviewers add new slots every week. We’ll keep this page updated, so check back tomorrow.
        </Empty>
      ) : (
        <div className="booker">
          <div className="day-tabs" role="tablist">
            {days.map((d) => (
              <button key={d.key} role="tab" aria-selected={d.key === activeDay}
                className={`day-tab ${d.key === activeDay ? 'is-active' : ''}`} onClick={() => setActiveDay(d.key)}>
                <span>{day(`${d.key}T12:00:00+05:30`).split(',')[0]}</span>
                <strong>{Number(d.key.slice(8))}</strong>
                <small>{d.slots.length} open</small>
              </button>
            ))}
          </div>

          {today && (
            <div className="slot-panel">
              <h3>{longDay(`${today.key}T12:00:00+05:30`)}</h3>
              {['Morning', 'Afternoon', 'Evening'].filter((g) => groups[g]).map((g) => (
                <div key={g} className="slot-group">
                  <span className="slot-group-label">{g}</span>
                  <div className="slot-grid">
                    {groups[g].map((s) => (
                      <button key={s.id} className="slot-btn" onClick={() => setPicked(s)}>{time(s.startsAt)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {picked && (
        <Modal
          title={rescheduleId ? 'Move your interview?' : 'Confirm your slot'}
          onClose={() => setPicked(null)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setPicked(null)}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={confirm}>
                {busy ? 'Booking…' : rescheduleId ? 'Move to this slot' : 'Confirm booking'}
              </button>
            </>
          )}
        >
          <dl className="confirm-list">
            <div><dt>Badge</dt><dd>{entry.track.badgeName}</dd></div>
            <div><dt>When</dt><dd>{longDay(picked.startsAt)}, {time(picked.startsAt)} – {time(picked.endsAt)} IST</dd></div>
            <div><dt>Interviewer</dt><dd>{picked.interviewer}</dd></div>
          </dl>
          <p className="hint">
            You can reschedule or cancel up to {rules.cancelCutoffHours} hours before. Missing the interview counts as an attempt.
          </p>
        </Modal>
      )}
    </div>
  );
}
