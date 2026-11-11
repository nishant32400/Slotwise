// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.

const TZ = 'Asia/Kolkata';

const fmt = (opts) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts });
const upper = (s) => s.replace(' am', ' AM').replace(' pm', ' PM');

export const time = (d) => upper(fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(d)));
export const day = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
export const longDay = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
export const date = (d) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
export const dateTime = (d) => `${day(d)}, ${time(d)}`;

export const isoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
export const shiftDay = (iso, n) => isoDay(new Date(new Date(`${iso}T12:00:00+05:30`).getTime() + n * 86400e3));

export function relative(d, now = new Date()) {
  const diff = new Date(d) - now;
  const mins = Math.round(diff / 60e3);
  const abs = Math.abs(mins);
  const unit = abs < 60 ? [mins, 'minute'] : abs < 60 * 36 ? [Math.round(mins / 60), 'hour'] : [Math.round(mins / 1440), 'day'];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(unit[0], unit[1]);
}

export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
