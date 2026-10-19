'use strict';
// Pure daily-history helpers (no Electron). History shape:
//   { 'YYYY-MM-DD': { water, breaksYes, breaksLater, meetings, focusSessions, focusMs, screenMs } }
// Only per-day aggregates are kept (no timestamps, no content) and entries
// older than 90 days are pruned on every write.

const FIELDS = ['water', 'breaksYes', 'breaksLater', 'meetings', 'focusSessions', 'focusMs', 'screenMs'];
const KEEP_DAYS = 90;

function emptyDay() {
  return { water: 0, breaksYes: 0, breaksLater: 0, meetings: 0, focusSessions: 0, focusMs: 0, screenMs: 0 };
}

function shiftKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function record(history, dateKey, increments = {}) {
  const out = { ...(history && typeof history === 'object' ? history : {}) };
  const day = { ...emptyDay(), ...(out[dateKey] || {}) };
  for (const field of FIELDS) {
    const add = Number(increments[field]) || 0;
    if (add) day[field] += add;
  }
  out[dateKey] = day;
  const cutoff = shiftKey(dateKey, -(KEEP_DAYS - 1));
  for (const key of Object.keys(out)) if (key < cutoff) delete out[key];
  return out;
}

function summarize(history, today, goal) {
  const h = history && typeof history === 'object' ? history : {};
  const day = (key) => ({ ...emptyDay(), ...(h[key] || {}) });
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const key = shiftKey(today, -i);
    const d = day(key);
    last7.push({
      date: key,
      water: d.water,
      breaksYes: d.breaksYes,
      focusSessions: d.focusSessions,
      screenMinutes: Math.floor(d.screenMs / 60000),
      goalMet: goal > 0 && d.water >= goal
    });
  }
  // Streak of days meeting the water goal. Today counts if already met;
  // otherwise the streak is measured up to yesterday (today is still open).
  let streak = 0;
  let cursor = day(today).water >= goal && goal > 0 ? today : shiftKey(today, -1);
  while (goal > 0 && day(cursor).water >= goal) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  const t = day(today);
  return { streak, last7, today: { ...t, screenMinutes: Math.floor(t.screenMs / 60000) } };
}

module.exports = { emptyDay, record, summarize, shiftKey, KEEP_DAYS };
