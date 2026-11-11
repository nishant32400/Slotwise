// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Modal } from '../../components/bits.jsx';
import JourneyCard from '../../components/JourneyCard.jsx';
import ProfileStrip from '../../components/ProfileStrip.jsx';
import { dateTime, relative } from '../../format.js';

const OUTCOME_TEXT = {
  pass: 'Passed',
  fail: 'Not cleared',
  retake_later: 'Retake requested',
};

function statusText(h) {
  if (h.status === 'completed') return OUTCOME_TEXT[h.outcome];
  return {
    booked: 'Booked',
    no_show: 'Missed',
    cancelled: h.cancelReason === 'rescheduled' ? 'Rescheduled' : 'Cancelled by you',
    interviewer_cancelled: 'Cancelled by GRIT',
  }[h.status];
}

export default function StudentHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/student/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function cancel() {
    setBusy(true);
    try {
      await api.post(`/api/student/interviews/${confirmCancel.id}/cancel`);
      setConfirmCancel(null);
      load();
    } catch (e) {
      setError(e.message);
      setConfirmCancel(null);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="page"><div className="skeleton" /></div>;

  const unread = data.notifications.filter((n) => !n.read_at).length;

  return (
    <div className="page">
      <ProfileStrip user={data.user} tracks={data.tracks} />

      <div className="student-grid">
        <div className="stack">
          {data.tracks.map(({ track, journey }) => (
            <JourneyCard
              key={track.id}
              track={track}
              journey={journey}
              rules={data.rules}
              onBook={() => navigate(`/student/book/${track.id}`)}
              onReschedule={() => navigate(`/student/book/${track.id}?reschedule=${journey.active.id}`)}
              onCancel={() => setConfirmCancel(journey.active)}
            />
          ))}

          {data.tracks.some((t) => t.journey.history.length > 0) && (
            <section className="panel">
              <h3 className="panel-title">Interview history</h3>
              <table className="table">
                <thead>
                  <tr><th>When</th><th>Interviewer</th><th>Attempt</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.tracks.flatMap(({ journey }) => journey.history).map((h) => (
                    <tr key={h.id}>
                      <td>{dateTime(h.startsAt)}</td>
                      <td>{h.interviewer}</td>
                      <td>{['completed', 'no_show', 'booked'].includes(h.status) ? h.attemptNo : '–'}</td>
                      <td>{statusText(h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="panel updates">
          <div className="panel-title-row">
            <h3 className="panel-title">Updates {unread > 0 && <span className="count">{unread}</span>}</h3>
            {unread > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => api.post('/api/student/notifications/read').then(load)}>
                Mark all read
              </button>
            )}
          </div>
          {data.notifications.length === 0 && <p className="muted">Nothing yet.</p>}
          <ul className="feed">
            {data.notifications.map((n) => (
              <li key={n.id} className={`feed-item feed-${n.kind} ${n.read_at ? '' : 'unread'}`}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{relative(n.created_at)}</small>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {confirmCancel && (
        <Modal
          title="Cancel this booking?"
          onClose={() => setConfirmCancel(null)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmCancel(null)}>Keep it</button>
              <button className="btn btn-danger" disabled={busy} onClick={cancel}>Yes, cancel</button>
            </>
          )}
        >
          <p>
            Your slot on <strong>{dateTime(confirmCancel.startsAt)}</strong> with {confirmCancel.interviewer} will be released
            for other students. Cancelling doesn’t count as an attempt, and you can book again straight away.
          </p>
        </Modal>
      )}
    </div>
  );
}
