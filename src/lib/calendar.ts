import type { Wager } from '../types';

function fmtDate(d: Date): string {
  // YYYYMMDDTHHmmssZ  (Zulu / UTC)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildGoogleCalendarUrl(wager: Wager): string {
  const start = new Date(wager.deadline);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // +1 h
  const stakeLabel = wager.stakeType === 'money' && wager.monetaryValue
    ? `₪${wager.monetaryValue} — ${wager.stake}`
    : wager.stake;
  const params = new URLSearchParams({
    action:  'TEMPLATE',
    text:    `BetBuddy: ${wager.title}`,
    dates:   `${fmtDate(start)}/${fmtDate(end)}`,
    details: `Condition: ${wager.condition}\nStake: ${stakeLabel}\n\nTracked via BetBuddy`,
    sf:      'true',
    output:  'xml',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICS(wager: Wager): void {
  const start = new Date(wager.deadline);
  const end   = new Date(start.getTime() + 60 * 60 * 1000);
  const stakeLabel = wager.stakeType === 'money' && wager.monetaryValue
    ? `₪${wager.monetaryValue} — ${wager.stake}`
    : wager.stake;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BetBuddy//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${fmtDate(start)}`,
    `DTEND:${fmtDate(end)}`,
    `SUMMARY:BetBuddy: ${wager.title}`,
    `DESCRIPTION:Condition: ${wager.condition}\\nStake: ${stakeLabel}`,
    `UID:${wager.id}@betbuddy`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `betbuddy-wager.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
