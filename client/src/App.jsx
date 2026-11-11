// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Shell from './components/Shell.jsx';
import Guide from './pages/Guide.jsx';
import SignIn from './pages/SignIn.jsx';
import BookSlot from './pages/student/BookSlot.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import Availability from './pages/interviewer/Availability.jsx';
import DaySchedule from './pages/interviewer/DaySchedule.jsx';
import TeamOverview from './pages/team/TeamOverview.jsx';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const HOME = { student: '/student', interviewer: '/interviewer', admin: '/team' };

function RoleRoute({ role, children }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/" replace />;
  if (![].concat(role).includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return children;
}

function Locked({ license }) {
  return (
    <div className="locked">
      <h1>This build is no longer active</h1>
      <p>
        {license.product} was shared as an evaluation build by {license.author}. The evaluation period has ended.
        Please contact the author for access.
      </p>
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    const { user } = await api.get('/api/me').catch(() => ({ user: null }));
    setUser(user);
    return user;
  }, []);

  useEffect(() => {
    api.get('/api/meta').then(setMeta).catch(() => setMeta({ license: { mode: 'unknown' } }));
    refresh();
  }, [refresh]);

  if (!meta || user === undefined) return <div className="boot">Loading…</div>;
  if (meta.license?.expired) return <Locked license={meta.license} />;

  return (
    <SessionContext.Provider value={{ user, setUser, refresh, meta, home: user ? HOME[user.role] : '/' }}>
      <Shell>
        <Routes>
          <Route path="/" element={user ? <Navigate to={HOME[user.role]} replace /> : <SignIn />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/student" element={<RoleRoute role="student"><StudentHome /></RoleRoute>} />
          <Route path="/student/book/:trackId" element={<RoleRoute role="student"><BookSlot /></RoleRoute>} />
          <Route path="/interviewer" element={<RoleRoute role={['interviewer', 'admin']}><DaySchedule /></RoleRoute>} />
          <Route path="/interviewer/availability" element={<RoleRoute role="interviewer"><Availability /></RoleRoute>} />
          <Route path="/team" element={<RoleRoute role="admin"><TeamOverview /></RoleRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </SessionContext.Provider>
  );
}
