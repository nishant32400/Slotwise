// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../App.jsx';
import { initials } from '../format.js';

const NAV = {
  student: [['/student', 'My dashboard']],
  interviewer: [['/interviewer', 'Today'], ['/interviewer/availability', 'Availability']],
  admin: [['/team', 'Interview team'], ['/interviewer', 'Schedules']],
};

const ROLE_LABEL = { student: 'Student', interviewer: 'Interviewer', admin: 'Interview team' };

export default function Shell({ children }) {
  const { user, setUser, meta, home } = useSession();
  const navigate = useNavigate();
  const evaluation = meta?.license?.mode !== 'licensed';

  async function switchUser() {
    await api.post('/api/logout');
    setUser(null);
    navigate('/sign-in');
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to={home} className="brand">
          <span className="brand-mark">G</span>
          <span>GRIT <em>Badge Interviews</em></span>
        </Link>
        {user && (
          <nav className="nav">
            {NAV[user.role].map(([to, label]) => (
              <NavLink key={to} to={to} end>{label}</NavLink>
            ))}
          </nav>
        )}
        <div className="topbar-right">
          <Link to="/guide" className="link-muted">Reviewer guide</Link>
          {user && (
            <div className="who">
              <span className="avatar">{initials(user.name)}</span>
              <span className="who-text">
                <strong>{user.name}</strong>
                <small>{ROLE_LABEL[user.role]}</small>
              </span>
              {meta.demoMode && <button className="btn btn-ghost btn-sm" onClick={switchUser}>Switch user</button>}
            </div>
          )}
        </div>
      </header>

      <main className="main">{children}</main>

      <footer className="footer">
        <span>
          © 2026 {meta.license.author}. {meta.license.product} prototype.
          {evaluation ? ' Evaluation build for hiring review only, not licensed for use or redistribution.' : ` Licensed to ${meta.license.licensee}.`}
        </span>
      </footer>
      {evaluation && <div className="watermark" aria-hidden="true">EVALUATION BUILD · {meta.license.author.toUpperCase()}</div>}
    </div>
  );
}
