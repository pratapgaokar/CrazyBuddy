'use strict';
// Pure settings helpers (no Electron), extracted from main.js so they can be
// unit-tested. The renderer is never trusted: every settings object that
// reaches the store is rebuilt here from a clean whitelist.

const SKINS = ['original', 'sunset', 'ocean'];
const AVATARS = ['dragon', 'buddy', 'robo'];
const CHARACTERS = ['cinder', 'ember', 'tide', 'pip', 'orbit', 'nova'];
const AMBIENTS = ['off', 'rain', 'storm', 'birds', 'sea', 'forest', 'cafe'];
const ANIMS = ['full', 'calm'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function clampMinutes(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeCalendar(input, current, defaults) {
  const src = input && typeof input === 'object' ? input : {};
  const cur = { ...defaults, ...(current || {}) };
  const bool = (key) => (typeof src[key] === 'boolean' ? src[key] : !!cur[key]);
  return {
    enabled: bool('enabled'),
    leadMinutes: clampMinutes(src.leadMinutes, cur.leadMinutes, 1, 60),
    alertAtStart: bool('alertAtStart'),
    notifyInvites: bool('notifyInvites')
  };
}

// Custom reminders: [{ id, label, message, minutes, enabled, preset }]
function sanitizeCustom(input, current, presetKeys = []) {
  if (!Array.isArray(input)) return Array.isArray(current) ? current : [];
  const seen = new Set();
  const out = [];
  for (const item of input.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    let id = typeof item.id === 'string' && /^[a-z0-9]{4,16}$/.test(item.id) ? item.id : '';
    if (!id || seen.has(id)) id = Math.random().toString(36).slice(2, 10);
    seen.add(id);
    const label = String(item.label ?? '').trim().slice(0, 40) || 'Reminder';
    const daysIn = Array.isArray(item.days) ? [...new Set(item.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : null;
    out.push({
      id,
      label,
      message: String(item.message ?? '').trim().slice(0, 120) || `${label}?`,
      minutes: clampMinutes(item.minutes, 60, 1, 720),
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      preset: typeof item.preset === 'string' && presetKeys.includes(item.preset) ? item.preset : null,
      // 'interval' = every N minutes of screen time. 'schedule' = wall clock:
      // at `time` (HH:MM) on `days` (0 = Sunday .. 6 = Saturday).
      mode: item.mode === 'schedule' ? 'schedule' : 'interval',
      time: typeof item.time === 'string' && TIME_RE.test(item.time) ? item.time : '09:00',
      days: daysIn && daysIn.length ? daysIn.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6]
    });
  }
  return out;
}

function sanitizeSettings(input, current, defaults, reminderKeys, presetKeys = []) {
  const src = input && typeof input === 'object' ? input : {};
  const cur = current && typeof current === 'object' ? current : {};
  const reminders = {};
  for (const key of reminderKeys) {
    const incoming = (src.reminders && src.reminders[key]) || {};
    const base = (cur.reminders && cur.reminders[key]) || defaults.reminders[key];
    reminders[key] = {
      enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : !!base.enabled,
      minutes: clampMinutes(incoming.minutes, base.minutes, 1, 720)
    };
  }
  const qIn = src.quietHours || {};
  const qCur = cur.quietHours || defaults.quietHours;
  const validTime = (v, fb) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fb);
  const boolWith = (srcVal, curVal, defVal) =>
    (typeof srcVal === 'boolean' ? srcVal : typeof curVal === 'boolean' ? curVal : defVal);
  const skinIn = src.appearance && typeof src.appearance === 'object' ? src.appearance.skin : undefined;
  const skinCur = cur.appearance && typeof cur.appearance === 'object' ? cur.appearance.skin : undefined;
  const appIn = src.appearance && typeof src.appearance === 'object' ? src.appearance : {};
  const appCur = cur.appearance && typeof cur.appearance === 'object' ? cur.appearance : {};
  const character = CHARACTERS.includes(appIn.character) ? appIn.character : CHARACTERS.includes(appCur.character) ? appCur.character : 'cinder';
  const pct = (v) => (Number.isFinite(Number(v)) ? Math.min(0.9, Math.max(0.02, Number(v))) : null);
  const sndIn = src.sound && typeof src.sound === 'object' ? src.sound : {};
  const sndCur = cur.sound && typeof cur.sound === 'object' ? cur.sound : {};
  const vol = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : null);
  const profIn = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const profCur = cur.profile && typeof cur.profile === 'object' ? cur.profile : {};
  return {
    reminders,
    hydrationGoal: clampMinutes(src.hydrationGoal, cur.hydrationGoal ?? defaults.hydrationGoal, 1, 30),
    quietHours: {
      enabled: typeof qIn.enabled === 'boolean' ? qIn.enabled : !!qCur.enabled,
      start: validTime(qIn.start, qCur.start),
      end: validTime(qIn.end, qCur.end)
    },
    snoozeMinutes: clampMinutes(src.snoozeMinutes, cur.snoozeMinutes ?? defaults.snoozeMinutes, 1, 120),
    openAtLogin: boolWith(src.openAtLogin, cur.openAtLogin, defaults.openAtLogin),
    guidedBreaks: boolWith(src.guidedBreaks, cur.guidedBreaks, defaults.guidedBreaks),
    calendar: sanitizeCalendar(src.calendar, cur.calendar, defaults.calendar),
    custom: sanitizeCustom(src.custom, cur.custom, presetKeys),
    onboarded: boolWith(src.onboarded, cur.onboarded, !!defaults.onboarded),
    morningBriefing: boolWith(src.morningBriefing, cur.morningBriefing, defaults.morningBriefing !== false),
    devAlerts: boolWith(src.devAlerts, cur.devAlerts, !!defaults.devAlerts),
    respectFullscreen: boolWith(src.respectFullscreen, cur.respectFullscreen, defaults.respectFullscreen !== false),
    sound: {
      volume: vol(sndIn.volume) ?? vol(sndCur.volume) ?? 0.7,
      chime: boolWith(sndIn.chime, sndCur.chime, true),
      ambient: AMBIENTS.includes(sndIn.ambient) ? sndIn.ambient : AMBIENTS.includes(sndCur.ambient) ? sndCur.ambient : 'off'
    },
    profile: {
      birthday: typeof profIn.birthday === 'string' && BIRTHDAY_RE.test(profIn.birthday) ? profIn.birthday
        : typeof profCur.birthday === 'string' && BIRTHDAY_RE.test(profCur.birthday) ? profCur.birthday : ''
    },
    appearance: {
      character,
      avatar: AVATARS.includes(appIn.avatar) ? appIn.avatar : AVATARS.includes(appCur.avatar) ? appCur.avatar : 'dragon',
      skin: SKINS.includes(skinIn) ? skinIn : SKINS.includes(skinCur) ? skinCur : 'original',
      homePct: pct(appIn.homePct) ?? pct(appCur.homePct) ?? 0.2,
      anim: ANIMS.includes(appIn.anim) ? appIn.anim : ANIMS.includes(appCur.anim) ? appCur.anim : 'full'
    }
  };
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function inQuietHours(quiet, date = new Date()) {
  if (!quiet || !quiet.enabled) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKeyOf(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }

// Is a scheduled custom reminder due at `date`, given the { id: dateKey } map
// of when each scheduled reminder last fired? The tick runs every 15s, so a
// reminder is due for the whole minute it is scheduled in.
function scheduledDue(item, date, fired = {}) {
  if (!item || item.mode !== 'schedule' || item.enabled === false) return false;
  if (!Array.isArray(item.days) || !item.days.includes(date.getDay())) return false;
  if (item.time !== `${pad2(date.getHours())}:${pad2(date.getMinutes())}`) return false;
  return fired[item.id] !== dateKeyOf(date);
}

module.exports = { SKINS, AVATARS, CHARACTERS, AMBIENTS, ANIMS, clampMinutes, sanitizeCalendar, sanitizeCustom, sanitizeSettings, toMinutes, inQuietHours, scheduledDue, dateKeyOf };
