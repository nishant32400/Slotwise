// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Modal, Stat, StatusPill } from '../../components/bits.jsx';
import { date, dateTime, relative } from '../../format.js';

const FILTERS = [
  { key: 'not_booked', label: 'Eligible, not booked', states: ['ready_to_book'], tone: 'blue' },
  { key: 'booked', label: 'Booked', states: ['booked', 'in_progress'] },
  { key: 'awaiting', label: 'Awaiting result', states: ['awaiting_result'], tone: 'amber' },
  { key: 'passed', label: 'Passed', states: ['passed'], tone: 'green' },
  { key: 'retry', label: 'Cooldown / retake', states: ['cooldown', 'retake_pending', 'attempts_exhausted'] },
  { key: 'all', label: 'All students', states: null },
];

function SlotCell({ s }) {
  if (s.state === 'not_eligible') return <span className="muted">{s.skillsCleared}/{s.skillsTotal} skills cleared</span>;
  if (!s.slot) return <span className="muted">Not booked</span>;
  if (s.state === 'ready_to_book' && s.slot.status === 'interviewer_cancelled') {
    return <span className="warn-text">Slot cancelled by interviewer, needs to rebook</span>;
  }
  if (s.state === 'ready_to_book') return <span className="muted">Not booked</span>;
  return (
    <span>
      {dateTime(s.slot.startsAt)}
      <small className="block muted">{s.slot.interviewer}</small>
    </span>
  );
}

export default function TeamOverview() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('not_booked');
  const [trackId, setTrackId] = useState('');
  const [search, setSearch] = useState('');
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/team/overview${trackId ? `?trackId=${trackId}` : ''}`).then(setData).catch((e) => setError(e.message));
  }, [trackId]);

  useEffect(load, [load]);

  const eligible = useMemo(() => (data?.students || []).filter((s) => s.state !== 'not_eligible'), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.key === filter);
    const q = search.trim().toLowerCase();
    return data.students
      .filter((s) => !f.states || f.states.includes(s.state))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.college || '').toLowerCase().includes(q));
  }, [data, filter, search]);

  const countFor = (f) => (f.states ? data.students.filter((s) => f.states.includes(s.state)).length : data.students.length);

  async function remind(s) {
    setError(null);
    try {
      await api.post('/api/team/reminders', { studentId: s.studentId, trackId: s.trackId });
      setFlash(`Reminder sent to ${s.name}.`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function revoke() {
    setError(null);
    try {
      await api.post(`/api/team/badges/${revoking.badgeId}/revoke`, { reason });
      setFlash(`${revoking.name}'s ${revoking.badgeName} badge has been withdrawn.`);
      setRevoking(null);
      setReason('');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function resetDemo() {
    if (!window.confirm('Reset all demo data to its starting state?')) return;
    await api.post('/api/team/demo/reset');
    setFlash('Demo data reset.');
    load();
  }

  if (!data) return <div className="page"><div className="skeleton" />{error && <div className="alert alert-error">{error}</div>}</div>;

  const notBooked = eligible.filter((s) => s.state === 'ready_to_book').length;
  const bookedPct = eligible.length ? Math.round(((eligible.length - notBooked) / eligible.length) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Interview team</h1>
          <p className="muted">
            {eligible.length} eligible students · {bookedPct}% have booked or finished their interview
          </p>
        </div>
        <div className="head-actions">
          <select value={trackId} onChange={(e) => setTrackId(e.target.value)} aria-label="Track">
            <option value="">All tracks</option>
            {data.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {data.demoMode && <button className="btn btn-ghost btn-sm" onClick={resetDemo}>Reset demo data</button>}
        </div>
      </div>

      <div className="stats">
        {FILTERS.map((f) => (
          <Stat key={f.key} label={f.label} value={countFor(f)} tone={f.tone}
            active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
      </div>

      {flash && <div className="alert alert-ok" onAnimationEnd={() => setFlash(null)}>{flash}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="panel-title-row">
          <h3 className="panel-title">{FILTERS.find((f) => f.key === filter).label}</h3>
          <input className="search" placeholder="Search name or campus" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table className="table">
          <thead>
            <tr><th>Student</th><th>Track</th><th>Status</th><th>Interview</th><th>Attempts</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted center">Nobody here.</td></tr>}
            {rows.map((s) => (
              <tr key={`${s.studentId}-${s.trackId}`}>
                <td><strong>{s.name}</strong><small className="block muted">{s.college}</small></td>
                <td>{s.track}</td>
                <td>
                  <StatusPill state={s.state} />
                  {s.nextEligibleAt && <small className="block muted">Can rebook {date(s.nextEligibleAt)}</small>}
                  {s.state === 'passed' && <small className="block muted">Badge awarded</small>}
                  {s.badgeRevokedAt && <small className="block muted">Withdrawn {relative(s.badgeRevokedAt)}</small>}
                </td>
                <td><SlotCell s={s} /></td>
                <td>{s.state === 'not_eligible' ? '–' : `${s.attemptsUsed}/3`}</td>
                <td className="right">
                  {s.state === 'ready_to_book' && <button className="btn btn-sm" onClick={() => remind(s)}>Send reminder</button>}
                  {s.state === 'passed' && (
                    <button className="btn btn-sm btn-ghost danger-text" onClick={() => setRevoking(s)}>Flag malpractice</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3 className="panel-title">Interviewers</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Open slots ahead</th><th>Upcoming interviews</th><th>Outcomes pending</th></tr></thead>
          <tbody>
            {data.interviewers.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong></td>
                <td>{i.open_slots}</td>
                <td>{i.upcoming}</td>
                <td>{i.pending_outcomes > 0 ? <span className="warn-text">{i.pending_outcomes}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {revoking && (
        <Modal
          title="Withdraw badge for malpractice"
          onClose={() => setRevoking(null)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setRevoking(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={reason.trim().length < 10} onClick={revoke}>Withdraw badge</button>
            </>
          )}
        >
          <p>
            <strong>{revoking.name}</strong> will lose the {revoking.badgeName} badge. It disappears from their profile and the
            leaderboard, and they’re notified with the reason kept on record.
          </p>
          <label className="block">What was found (kept internally, not shown to the student)
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Proctoring review showed a second person answering during the coding round." />
          </label>
        </Modal>
      )}
    </div>
  );
}
