// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import { useEffect } from 'react';

export const STATE_LABEL = {
  not_eligible: 'Clearing skills',
  ready_to_book: 'Ready to book',
  booked: 'Booked',
  in_progress: 'In progress',
  awaiting_result: 'Awaiting result',
  passed: 'Badge earned',
  cooldown: 'Not cleared',
  retake_pending: 'Retake',
  attempts_exhausted: 'Attempts used',
  badge_revoked: 'Badge withdrawn',
};

const TONE = {
  not_eligible: 'grey',
  ready_to_book: 'blue',
  booked: 'violet',
  in_progress: 'violet',
  awaiting_result: 'amber',
  passed: 'green',
  cooldown: 'red',
  retake_pending: 'amber',
  attempts_exhausted: 'red',
  badge_revoked: 'red',
};

export function StatusPill({ state, children }) {
  return <span className={`pill pill-${TONE[state] || 'grey'}`}>{children || STATE_LABEL[state] || state}</span>;
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Stat({ label, value, active, onClick, tone }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat ${active ? 'is-active' : ''} ${tone ? `stat-${tone}` : ''}`} onClick={onClick}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </Tag>
  );
}
