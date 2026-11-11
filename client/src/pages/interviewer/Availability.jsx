// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Empty, Modal } from '../../components/bits.jsx';
import { isoDay, longDay, shiftDay, time } from '../../format.js';

export default function Availability() {
  const [form, setForm] = useState({ date: shiftDay(isoDay(), 1), from: '14:00', to: '16:00', minutes: 30 });
  const [slots, setSlots] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [tracks, setTracks] = useState([]);

  const load = useCallback(() => {
    api.get(`/api/interviewer/availability?from=${isoDay()}&days=21`).then((d) => setSlots(d.slots));
  }, []);

  useEffect(() => {
    load();
    api.get('/api/interviewer/me').then((d) => setTracks(d.tracks));
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const s of slots || []) {
      const k = isoDay(s.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return [...map.entries()];
  }, [slots]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const r = await api.post('/api/interviewer/availability', form);
      setNotice(`Added ${r.created} ${r.created === 1 ? 'slot' : 'slots'}${r.skipped ? `. ${r.skipped} skipped because they overlap existing slots.` : '.'}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setError(null);
    try {
      const r = await api.del(`/api/interviewer/slots/${removing.slot_id}`, { reason });
      setNotice(r.studentNotified ? 'Slot removed. The student has been told and asked to rebook.' : 'Slot removed.');
      setRemoving(null);
      setReason('');
      load();
    } catch (err) {
      setError(err.message);
      setRemoving(null);
    }
  }

  const now = new Date();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Availability</h1>
          <p className="muted">
            Students eligible for {tracks.map((t) => t.badge_name).join(' or ') || 'your tracks'} see these slots.
            Times are IST.
          </p>
        </div>
      </div>

      <div className="avail-grid">
        <form className="panel" onSubmit={add}>
          <h3 className="panel-title">Open new slots</h3>
          <label className="block">Date
            <input type="date" value={form.date} min={isoDay()} onChange={set('date')} required />
          </label>
          <div className="form-row">
            <label>From<input type="time" value={form.from} step={900} onChange={set('from')} required /></label>
            <label>To<input type="time" value={form.to} step={900} onChange={set('to')} required /></label>
          </div>
          <label className="block">Slot length
            <select value={form.minutes} onChange={set('minutes')}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </label>
          <button className="btn btn-primary">Add slots</button>
          <p className="hint">Overlapping times are skipped automatically, so you can’t double-book yourself.</p>
          {notice && <div className="alert alert-ok">{notice}</div>}
          {error && <div className="alert alert-error">{error}</div>}
        </form>

        <section className="panel">
          <h3 className="panel-title">Next three weeks</h3>
          {slots && byDay.length === 0 && <Empty title="No slots yet">Add a block on the left.</Empty>}
          {byDay.map(([k, list]) => (
            <div key={k} className="avail-day">
              <div className="avail-day-head">
                <strong>{longDay(`${k}T12:00:00+05:30`)}</strong>
                <small>{list.filter((s) => s.interview_id).length} booked · {list.filter((s) => !s.interview_id).length} open</small>
              </div>
              <div className="chip-row">
                {list.map((s) => {
                  const past = new Date(s.starts_at) < now;
                  const locked = past || (s.interview_id && s.status !== 'booked');
                  return (
                    <span key={s.slot_id} className={`chip ${s.interview_id ? 'chip-booked' : ''} ${past ? 'chip-past' : ''}`}
                      title={s.student_name ? `${s.student_name} · ${s.track_name}` : 'Open'}>
                      {time(s.starts_at)}
                      {s.student_name && <em>{s.student_name.split(' ')[0]}</em>}
                      {!locked && <button type="button" aria-label="Remove slot" onClick={() => setRemoving(s)}>×</button>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {removing && (
        <Modal
          title={removing.interview_id ? 'Cancel a booked interview?' : 'Remove this slot?'}
          onClose={() => setRemoving(null)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setRemoving(null)}>Keep</button>
              <button className="btn btn-danger" disabled={removing.interview_id && reason.trim().length < 3} onClick={remove}>
                Remove slot
              </button>
            </>
          )}
        >
          {removing.interview_id ? (
            <>
              <p>
                <strong>{removing.student_name}</strong> has booked {time(removing.starts_at)} on {longDay(removing.starts_at)}.
                They’ll be notified straight away and asked to pick a new time. It won’t count as one of their attempts.
              </p>
              <label className="block">Reason shown to the student
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Interviewer unwell" autoFocus />
              </label>
            </>
          ) : (
            <p>{time(removing.starts_at)} on {longDay(removing.starts_at)} will no longer be offered to students.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
