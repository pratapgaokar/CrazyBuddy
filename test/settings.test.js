'use strict';
const test = require('node:test');
const assert = require('node:assert');
const settings = require('../src/settings');

const DEFAULTS = {
  reminders: {
    hydration: { enabled: true, minutes: 60 },
    break: { enabled: true, minutes: 90 },
    eyeBreak: { enabled: true, minutes: 30 }
  },
  snoozeMinutes: 10,
  openAtLogin: false,
  guidedBreaks: true,
  onboarded: false,
  morningBriefing: true,
  devAlerts: false,
  appearance: { skin: 'original' },
  calendar: { enabled: true, leadMinutes: 5, alertAtStart: true, notifyInvites: true },
  custom: [],
  hydrationGoal: 8,
  quietHours: { enabled: false, start: '22:00', end: '08:00' }
};
const KEYS = Object.keys(DEFAULTS.reminders);
const PRESETS = ['code', 'breathing', 'posture'];
const clean = (input, current = {}) => settings.sanitizeSettings(input, current, DEFAULTS, KEYS, PRESETS);

test('clampMinutes falls back and clamps', () => {
  assert.strictEqual(settings.clampMinutes('abc', 60, 1, 720), 60);
  assert.strictEqual(settings.clampMinutes(0, 60, 1, 720), 1);
  assert.strictEqual(settings.clampMinutes(9999, 60, 1, 720), 720);
  assert.strictEqual(settings.clampMinutes(45.6, 60, 1, 720), 46);
});

test('sanitizeSettings keeps defaults for empty input', () => {
  const out = clean({});
  assert.strictEqual(out.reminders.hydration.minutes, 60);
  assert.strictEqual(out.hydrationGoal, 8);
  assert.strictEqual(out.appearance.skin, 'original');
  assert.strictEqual(out.onboarded, false);
});

test('sanitizeSettings clamps hostile values and rejects unknown skin', () => {
  const out = clean({
    hydrationGoal: 500,
    snoozeMinutes: -3,
    appearance: { skin: 'evil' },
    reminders: { hydration: { enabled: 'yes', minutes: 100000 } }
  });
  assert.strictEqual(out.hydrationGoal, 30);
  assert.strictEqual(out.snoozeMinutes, 1);
  assert.strictEqual(out.appearance.skin, 'original');
  assert.strictEqual(out.reminders.hydration.minutes, 720);
  assert.strictEqual(out.reminders.hydration.enabled, true); // non-boolean ignored, default kept
});

test('sanitizeCustom caps at 12, dedupes ids, validates presets', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: 'same1', label: `R${i}`, message: 'm', minutes: 30, preset: i === 0 ? 'breathing' : 'nope'
  }));
  const out = settings.sanitizeCustom(items, [], PRESETS);
  assert.strictEqual(out.length, 12);
  assert.strictEqual(new Set(out.map((o) => o.id)).size, 12);
  assert.strictEqual(out[0].preset, 'breathing');
  assert.strictEqual(out[1].preset, null);
});

test('quiet hours: overnight range wraps midnight', () => {
  const q = { enabled: true, start: '22:00', end: '08:00' };
  assert.strictEqual(settings.inQuietHours(q, new Date('2026-10-16T23:30:00')), true);
  assert.strictEqual(settings.inQuietHours(q, new Date('2026-10-16T03:00:00')), true);
  assert.strictEqual(settings.inQuietHours(q, new Date('2026-10-16T12:00:00')), false);
  assert.strictEqual(settings.inQuietHours({ ...q, enabled: false }, new Date('2026-10-16T23:30:00')), false);
  assert.strictEqual(settings.inQuietHours({ enabled: true, start: '09:00', end: '09:00' }, new Date('2026-10-16T09:30:00')), false);
});

test('sanitizeCustom: schedule mode keeps time/days, fixes bad values', () => {
  const [a] = settings.sanitizeCustom([
    { id: 'sched1', label: 'Meds', message: 'Take meds', mode: 'schedule', time: '08:30', days: [1, 3, 3, 9, -1] }
  ], [], PRESETS);
  assert.strictEqual(a.mode, 'schedule');
  assert.strictEqual(a.time, '08:30');
  assert.deepStrictEqual(a.days, [1, 3]);
  const [b] = settings.sanitizeCustom([
    { id: 'sched2', label: 'X', message: 'm', mode: 'schedule', time: '25:99' }
  ], [], PRESETS);
  assert.strictEqual(b.time, '09:00');
  assert.deepStrictEqual(b.days, [0, 1, 2, 3, 4, 5, 6]);
  const [c] = settings.sanitizeCustom([{ id: 'intv1', label: 'Y', message: 'm' }], [], PRESETS);
  assert.strictEqual(c.mode, 'interval');
});

test('scheduledDue: exact minute, chosen days, once per day', () => {
  const item = { id: 's1', mode: 'schedule', enabled: true, time: '09:30', days: [5] }; // Friday
  const fri = new Date('2026-10-16T09:30:00'); // a Friday
  assert.strictEqual(fri.getDay(), 5);
  assert.strictEqual(settings.scheduledDue(item, fri, {}), true);
  assert.strictEqual(settings.scheduledDue(item, fri, { s1: '2026-10-16' }), false); // already fired
  assert.strictEqual(settings.scheduledDue(item, new Date('2026-10-16T09:31:00'), {}), false); // minute passed
  assert.strictEqual(settings.scheduledDue(item, new Date('2026-10-17T09:30:00'), {}), false); // Saturday not chosen
  assert.strictEqual(settings.scheduledDue({ ...item, mode: 'interval' }, fri, {}), false);
  assert.strictEqual(settings.scheduledDue({ ...item, enabled: false }, fri, {}), false);
});

test('sanitizeSettings: sound, birthday, home position, anim', () => {
  const out = clean({
    sound: { volume: 4, chime: false, ambient: 'rain' },
    profile: { birthday: '08-15' },
    appearance: { skin: 'ocean', homePct: 0.55, anim: 'calm' },
    respectFullscreen: false
  });
  assert.strictEqual(out.sound.volume, 1);
  assert.strictEqual(out.sound.chime, false);
  assert.strictEqual(out.sound.ambient, 'rain');
  assert.strictEqual(out.profile.birthday, '08-15');
  assert.strictEqual(out.appearance.homePct, 0.55);
  assert.strictEqual(out.appearance.anim, 'calm');
  assert.strictEqual(out.respectFullscreen, false);

  const bad = clean({ sound: { ambient: 'lava' }, profile: { birthday: '15-08' }, appearance: { homePct: 7, anim: 'wild' } });
  assert.strictEqual(bad.sound.ambient, 'off');
  assert.strictEqual(bad.profile.birthday, '');
  assert.strictEqual(bad.appearance.homePct, 0.9);
  assert.strictEqual(bad.appearance.anim, 'full');
  assert.strictEqual(bad.respectFullscreen, true); // default on
});

test('sanitizeSettings: avatar whitelist', () => {
  assert.strictEqual(clean({ appearance: { avatar: 'robo' } }).appearance.avatar, 'robo');
  assert.strictEqual(clean({ appearance: { avatar: 'hacker' } }).appearance.avatar, 'dragon');
  assert.strictEqual(clean({}).appearance.avatar, 'dragon');
});


test('sanitizeSettings keeps a whitelisted character preset', () => {
  const selected = clean({ appearance: { character: 'orbit' } });
  assert.strictEqual(selected.appearance.character, 'orbit');
  const fallback = clean({ appearance: { character: 'unknown-character' } });
  assert.strictEqual(fallback.appearance.character, 'cinder');
});
