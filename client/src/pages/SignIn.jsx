// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../App.jsx';
import { initials } from '../format.js';

const HINTS = {
  'Aarav Mehta': 'Eligible, not booked yet. Start here.',
  'Diya Sharma': 'Booked for tomorrow',
  'Kabir Singh': 'Passed, badge earned',
  'Meera Iyer': 'Not cleared, waiting out cooldown',
  'Rohan Das': 'Still clearing skills',
  'Sneha Reddy': 'Badge withdrawn for malpractice',
  'Ishaan Gupta': 'Asked to retake',
  'Ananya Rao': 'Interviewed today, result pending',
  'Arjun Nair': 'Eligible, not booked yet',
  'Tanvi Joshi': 'Interview later today',
  'Karthik Menon': 'Slot cancelled by interviewer',
  'Pooja Verma': 'Still clearing skills',
  'Priya Raman': 'Has interviews on today’s schedule',
  'Neha Kulkarni': 'Sees every eligible student',
};

const GROUPS = [
  ['student', 'Students'],
  ['interviewer', 'Interviewers'],
  ['admin', 'Interview team'],
];

export default function SignIn() {
  const { setUser, meta } = useSession();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!meta.demoMode) return;
    api.get('/api/demo-users').then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, [meta.demoMode]);

  async function signIn(u) {
    const { user } = await api.post('/api/demo-login', { userId: u.id });
    setUser({ ...u, ...user });
    navigate('/');
  }

  if (!meta.demoMode) {
    return <div className="page narrow"><h1>Sign in through GRIT</h1><p>This deployment uses the main GRIT login.</p></div>;
  }

  return (
    <div className="page narrow">
      <div className="intro">
        <h1>Pick someone to sign in as</h1>
        <p className="muted">
          This prototype has demo accounts in different stages of the interview journey.
          A good path: book as <strong>Aarav</strong>, record the result as <strong>Priya</strong>, then go back to Aarav.
          The <Link to="/guide">reviewer guide</Link> has the full walkthrough and the before/after screens.
        </p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {GROUPS.map(([role, label]) => (
        <section key={role} className="signin-group">
          <h3>{label}</h3>
          <div className="signin-grid">
            {users.filter((u) => u.role === role).map((u) => (
              <button key={u.id} className="signin-card" onClick={() => signIn(u)}>
                <span className="avatar">{initials(u.name)}</span>
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.tracks || u.college || ''}</small>
                  {HINTS[u.name] && <em>{HINTS[u.name]}</em>}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
