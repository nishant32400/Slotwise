// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { date, initials } from '../format.js';

export default function ProfileStrip({ user, tracks }) {
  const earned = tracks.filter((t) => t.journey.state === 'passed');
  return (
    <section className="profile">
      <span className="avatar avatar-lg">{initials(user.name)}</span>
      <div className="profile-text">
        <h1>Hi, {user.name.split(' ')[0]}</h1>
        <p className="muted">{user.college}</p>
      </div>
      <div className="shelf" aria-label="Track badges">
        {tracks.map(({ track, journey }) => {
          const state = journey.state === 'passed' ? 'earned' : journey.state === 'badge_revoked' ? 'revoked' : 'locked';
          return (
            <div key={track.id} className={`shelf-badge shelf-${state}`}
              title={state === 'earned' ? `Earned ${date(journey.badge.awardedAt)}` : state}>
              <span className="shelf-icon">{track.code}</span>
              <span className="shelf-name">{track.badgeName}</span>
              <small>{state === 'earned' ? 'Earned' : state === 'revoked' ? 'Withdrawn' : 'Locked'}</small>
            </div>
          );
        })}
        <div className="shelf-count">
          <strong>{earned.length}</strong>
          <small>{earned.length === 1 ? 'badge' : 'badges'}</small>
        </div>
      </div>
    </section>
  );
}
