// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
//
// Every message a student receives in this flow lives here so the wording
// can be reviewed in one place.

import { config, rules } from './config.js';

const tz = config.timezone;

export function fmtDateTime(d) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(d)).replace(' am', ' AM').replace(' pm', ' PM') + ' IST';
}

export function fmtDate(d) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(d));
}

export function fmtTime(d) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(d)).replace(' am', ' AM').replace(' pm', ' PM');
}

export const messages = {
  eligible: ({ badge }) => ({
    kind: 'eligible',
    title: `You're ready for the ${badge} interview`,
    body: `You've cleared every skill this badge needs. Book a 30-minute live interview from your dashboard. Slots open up to ${rules.bookingWindowDays} days ahead.`,
  }),

  booked: ({ badge, startsAt, interviewer, now = new Date() }) => {
    const cutoff = new Date(new Date(startsAt).getTime() - rules.cancelCutoffHours * 3600e3);
    const change = cutoff > now
      ? `Need to change it? You can reschedule or cancel until ${fmtDateTime(cutoff)}.`
      : `As it is less than ${rules.cancelCutoffHours} hours away, this booking can no longer be changed online.`;
    return {
      kind: 'booked',
      title: `Interview booked: ${fmtDateTime(startsAt)}`,
      body: `Your ${badge} interview is on ${fmtDateTime(startsAt)} with ${interviewer}. The join link opens ${rules.joinOpensMinutes} minutes before. Keep your camera on and your college ID ready. ${change}`,
    };
  },

  cancelledByStudent: ({ badge }) => ({
    kind: 'cancelled',
    title: 'Booking cancelled',
    body: `Your ${badge} interview slot has been released. This does not count as an attempt. Book a new slot whenever you're ready.`,
  }),

  cancelledByInterviewer: ({ badge, startsAt, reason }) => ({
    kind: 'interviewer_cancelled',
    title: 'Your interview needs a new time',
    body: `Sorry, your ${badge} interview on ${fmtDateTime(startsAt)} had to be cancelled by the interview team${reason ? ` (${reason})` : ''}. This does not count as an attempt. Please pick a new slot from your dashboard.`,
  }),

  passed: ({ badge }) => ({
    kind: 'passed',
    title: `You've earned the ${badge} badge`,
    body: `Congratulations, you cleared the interview. The ${badge} badge is now live on your GRIT profile and counts towards your leaderboard standing.`,
  }),

  failed: ({ badge, nextDate, attemptsLeft, notes }) => ({
    kind: 'failed',
    title: `${badge} interview: not cleared this time`,
    body: attemptsLeft > 0
      ? `You didn't clear this attempt, but your skills are still on record. You can book your next interview from ${fmtDate(nextDate)}. You have ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.${notes ? ` Interviewer feedback: "${notes}"` : ''}`
      : `You didn't clear this attempt and have used all ${rules.maxAttempts} attempts for this badge. The interview team will reach out about next steps.${notes ? ` Interviewer feedback: "${notes}"` : ''}`,
  }),

  retake: ({ badge, nextDate, reason }) => ({
    kind: 'retake',
    title: `${badge} interview: we'll continue in another session`,
    body: `Your interviewer has asked for a retake${reason ? ` (${reason})` : ''}. This does not count against your attempts. You can book a new slot from ${fmtDate(nextDate)}.`,
  }),

  noShow: ({ badge, nextDate }) => ({
    kind: 'no_show',
    title: 'We missed you at your interview',
    body: `You didn't join your ${badge} interview, so it has been counted as an attempt. You can book again from ${fmtDate(nextDate)}. If something went wrong, reply to the GRIT support desk within 48 hours.`,
  }),

  revoked: ({ badge }) => ({
    kind: 'revoked',
    title: `${badge} badge withdrawn`,
    body: `Your ${badge} badge has been withdrawn after a malpractice review. It no longer appears on your profile or counts towards your standing. If you believe this is a mistake, write to the GRIT team within 7 days.`,
  }),

  reminder: ({ badge }) => ({
    kind: 'reminder',
    title: `Reminder: book your ${badge} interview`,
    body: `You're eligible for the ${badge} interview but haven't booked yet. Slots fill quickly, so pick one that works for you.`,
  }),
};
