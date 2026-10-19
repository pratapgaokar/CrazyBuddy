const { app, BrowserWindow, crashReporter, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, safeStorage, screen, shell, Tray } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { Worker } = require('node:worker_threads');
const { execFile } = require('node:child_process');
const Store = require('electron-store');
const calendar = require('./calendar');
const settingsMod = require('./settings');
const historyMod = require('./history');
const { createLogger } = require('./log');

// Local crash dumps only (never uploaded anywhere). Helps diagnose public
// installs; the dumps stay in the app's crashDumps folder on the user's PC.
try {
  crashReporter.start({ productName: 'CerebraQ Companion', companyName: 'CerebraQ', uploadToServer: false, ignoreSystemCrashHandler: true });
} catch { /* crash reporting is best-effort */ }

// Replaced with a file logger in userData/logs once the app is ready.
let log = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a), error: (...a) => console.error(...a), file: () => null };

const APP_ID = 'com.cerebraq.companion';
const TICK_MS = 15 * 1000;
const AWAY_RESET_MS = 5 * 60 * 1000; // screen off / locked this long = a real break -> restart the clocks
const ANSWER_TIMEOUT_MS = 3 * 60 * 1000; // ignored reminder counts as "later"
const GAP_AFTER_ANSWER_MS = 20 * 1000; // breathing room between queued reminders
const SHORTCUT = 'CommandOrControl+Alt+C'; // call the companion / open its panel
const CALENDAR_SYNC_MS = 5 * 60 * 1000;
const MEETING_LATE_MS = 10 * 60 * 1000; // still alert up to 10 min after a meeting started
const MEETING_SNOOZE_MS = 60 * 1000; // "In 1 min"
const CALENDAR_HORIZON_MS = 60 * 24 * 60 * 60 * 1000; // look 60 days ahead (new-invite detection)

// Extras for custom reminders created from a preset (see the panel's "+ Code break").
const CUSTOM_PRESETS = {
  code: {
    guide: {
      seconds: 60,
      steps: [
        [0, 'Save your work (and commit if you can).'],
        [15, 'Stand up. Look away from the code.'],
        [30, 'Roll your wrists and stretch your neck.'],
        [45, 'Take three deep breaths. Think about the next step.']
      ],
      done: 'Back to it. Nice work!'
    }
  },
  breathing: {
    guide: {
      seconds: 60,
      steps: [
        [0, 'Breathe in slowly... 2... 3... 4.'],
        [15, 'Hold... 2... 3... 4.'],
        [30, 'Breathe out slowly... 2... 3... 4.'],
        [45, 'Once more. In... hold... and let it go.']
      ],
      done: 'Calm and reset. Nice work!'
    }
  },
  posture: {
    guide: {
      seconds: 60,
      steps: [
        [0, 'Sit tall. Feet flat on the floor.'],
        [15, 'Drop your shoulders away from your ears.'],
        [30, 'Unclench your jaw. Relax your hands.'],
        [45, 'Roll your shoulders back, then settle.']
      ],
      done: 'Posture reset. Nice work!'
    }
  }
};

const REMINDERS = {
  hydration: { label: 'Hydration', notification: 'Water time. Drink water?' },
  break: { label: 'Break', notification: 'Step away for a few minutes.' },
  eyeBreak: { label: 'Eye break', notification: 'Rest your eyes for 20 seconds.' }
};

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
  respectFullscreen: true,
  sound: { volume: 0.7, chime: true, ambient: 'off' },
  profile: { birthday: '' },
  appearance: { skin: 'original', homePct: 0.2, anim: 'full' },
  calendar: { enabled: true, leadMinutes: 5, alertAtStart: true, notifyInvites: true },
  custom: [],
  hydrationGoal: 8,
  quietHours: { enabled: false, start: '22:00', end: '08:00' }
};

// Windows toast notifications and taskbar grouping need this.
app.setAppUserModelId(APP_ID);

// Only one companion at a time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const store = new Store({ name: 'cerebraq-companion-settings', defaults: DEFAULTS });

let mainWindow;
let tray;

/* ---------------------------- settings ---------------------------- */

const PRESET_KEYS = Object.keys(CUSTOM_PRESETS);
const clampMinutes = settingsMod.clampMinutes;

// Never trust the renderer: rebuild a clean settings object (see settings.js).
function sanitizeSettings(input) {
  return settingsMod.sanitizeSettings(input, store.store, DEFAULTS, Object.keys(REMINDERS), PRESET_KEYS);
}

/* ---------------- hydration counter + quiet hours ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }
function todayKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function hydrationToday() {
  const h = store.get('hydration');
  return h && h.date === todayKey() ? h.count : 0;
}

function screenTodayMs() {
  const s = store.get('screenTime');
  const stored = s && s.date === todayKey() ? s.ms : 0;
  return stored + (pendingScreenDate === todayKey() ? pendingScreenMs : 0);
}

function flushScreenTime() {
  if (pendingScreenMs <= 0) { lastScreenFlush = Date.now(); return; }
  const date = pendingScreenDate;
  const s = store.get('screenTime');
  const base = s && s.date === date ? s.ms : 0;
  store.set('screenTime', { date, ms: base + pendingScreenMs });
  recordHistory({ screenMs: pendingScreenMs }, date);
  pendingScreenMs = 0;
  lastScreenFlush = Date.now();
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/* ------------------------- daily history ------------------------- */
// Per-day aggregates only (water, breaks, meetings, focus, screen minutes).
// Kept for 90 days; drives streaks and the 7-day panel view.
function recordHistory(increments, dateKey = todayKey()) {
  try {
    store.set('history', historyMod.record(store.get('history') || {}, dateKey, increments));
  } catch (err) {
    log.warn('history record failed', err);
  }
}

function focusState() {
  if (!focusSession) return { active: false };
  const remainingMs = focusSession.endsAt - Date.now();
  if (remainingMs <= 0) return { active: false, justEnded: true };
  return { active: true, endsAt: focusSession.endsAt, minutes: focusSession.minutes, remainingMs };
}

function publicSettings() {
  // The calendar links are private: they never leave the main process.
  const { calendarUrl, calendarUrls, calendarSeen, meetingAlerted, history, focusSession: _fs, lastBriefing, lastBatteryAlert, scheduledFired, ...rest } = store.store;
  return {
    ...rest,
    calendar: { ...rest.calendar, ...calendarStatus() },
    hydrationToday: hydrationToday(),
    screenTodayMinutes: Math.floor(screenTodayMs() / 60000),
    historySummary: historyMod.summarize(history || {}, todayKey(), store.get('hydrationGoal') || DEFAULTS.hydrationGoal),
    focus: focusState()
  };
}

function addGlass() {
  store.set('hydration', { date: todayKey(), count: hydrationToday() + 1 });
  recordHistory({ water: 1 });
  updateTrayTooltip();
  buildTrayMenu();
  if (mainWindow) mainWindow.webContents.send('settings:changed', publicSettings());
}

function inQuietHours(date = new Date()) {
  return settingsMod.inQuietHours(store.get('quietHours'), date);
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(`CerebraQ Companion - water ${hydrationToday()}/${store.get('hydrationGoal')} - screen time ${fmtDuration(screenTodayMs())}`);
}

function applyLoginItem() {
  if (!app.isPackaged) return; // don't register the dev electron.exe
  app.setLoginItemSettings({ openAtLogin: !!store.get('openAtLogin') });
}

/* ---------------------------- scheduler ---------------------------- */
// All timing lives here (not in the renderer) so it survives throttling,
// knows about sleep/lock/idle, and reminders can be queued one at a time.

// Reminders count SCREEN time: minutes the screen is on and unlocked, whether or
// not you touch the mouse or keyboard (video, reading, a call all count).
// Sleep and lock pause the clock; being away >= AWAY_RESET_MS counts as a break.
const screenMs = {}; // key -> screen-on ms since the last answer
// Screen time is accumulated in memory and flushed to disk at most every
// 5 minutes (and on lock/suspend/quit), instead of a store write per tick.
let pendingScreenMs = 0;
let pendingScreenDate = todayKey();
let lastScreenFlush = Date.now();
let focusSession = store.get('focusSession') || null; // { endsAt, minutes } | null
let pendingFocusDone = null;
let pendingBriefing = false;
let pendingPostMeeting = 0; // minutes of back-to-back meetings that just ended
let pendingBattery = 0; // battery percent when the low alert was raised
let pendingGreeting = false;
let pendingNotify = null;
let meetingBlockStart = null;
let lastTick = Date.now();
let awaySince = null;
let active = null; // { key, timer }
let cooldownUntil = 0;
let pausedUntil = 0;
let suspended = false;
let locked = false;

const customList = () => store.get('custom') || [];
const customKey = (id) => `custom:${id}`;
const findCustom = (key) => customList().find((c) => customKey(c.id) === key);
// Reminders that run on screen time: the built-in ones plus custom ones.
const reminderKeys = () => [...Object.keys(REMINDERS), ...customList().filter((c) => c.mode !== 'schedule').map((c) => customKey(c.id))];
const isScreenKey = (key) => !!REMINDERS[key] || !!findCustom(key);
function isEnabled(key) {
  if (REMINDERS[key]) return !!store.get(`reminders.${key}.enabled`);
  const c = findCustom(key);
  return !!(c && c.enabled);
}

function intervalMs(key) {
  if (REMINDERS[key]) return store.get(`reminders.${key}.minutes`) * 60 * 1000;
  const c = findCustom(key);
  return (c ? c.minutes : 60) * 60 * 1000;
}

function resetAllTimers() {
  for (const key of reminderKeys()) screenMs[key] = 0;
}

function screenOff() { if (awaySince === null) awaySince = Date.now(); }
function screenOn() {
  const wasAway = awaySince === null ? 0 : Date.now() - awaySince;
  awaySince = null;
  lastTick = Date.now(); // don't count the time we were away
  if (wasAway >= AWAY_RESET_MS) resetAllTimers();
  if (wasAway >= 30 * 60 * 1000) pendingGreeting = true; // "Welcome back" once per long absence
}

function showCompanion({ focus = false } = {}) {
  if (!mainWindow) return;
  if (focus) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('companion:summon');
  } else {
    mainWindow.showInactive(); // don't steal focus from what the user is typing
  }
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

// payload (optional) describes reminders the renderer has no built-in text for
// (custom reminders, meetings, invites): { kind, label, message, yesLabel, laterLabel,
// yesReply, laterReply, guide }.
function fireReminder(key, { test = false, payload = null, title = null, body = null, meta = null } = {}) {
  if (active) return false;
  let def;
  if (test) def = { label: 'Test', notification: 'CerebraQ Companion is ready.' };
  else if (REMINDERS[key]) def = REMINDERS[key];
  else if (payload) def = { label: payload.label, notification: payload.message };
  else return false;
  active = {
    key: test ? 'test' : key,
    meta,
    timer: setTimeout(() => finishReminder('later', { auto: true }), ANSWER_TIMEOUT_MS)
  };
  showCompanion();
  mainWindow.webContents.send('reminder:fire', active.key, payload || undefined);
  notify(title || `CerebraQ Companion: ${def.label}`, body || def.notification);
  return true;
}

function finishReminder(answer, { auto = false } = {}) {
  if (!active) return;
  const { key, timer, meta } = active;
  clearTimeout(timer);
  active = null;
  cooldownUntil = Date.now() + GAP_AFTER_ANSWER_MS;

  if (answer === 'yes' && key === 'hydration') addGlass();

  if (key.startsWith('meeting:')) {
    if (answer === 'yes') {
      // Join. The link came from our own whitelist of meeting hosts (calendar.js),
      // and is checked again here; nothing the renderer sends is ever opened.
      if (meta && meta.url && calendar.findLink(meta.url) === meta.url) shell.openExternal(meta.url);
    } else if (meta) {
      // "In 1 min" (or ignored): come back soon, until the meeting is well underway.
      delete alerted[meta.alertId];
      meetingSnooze[meta.alertId] = Date.now() + MEETING_SNOOZE_MS;
      saveAlerted();
    }
  } else if (isScreenKey(key)) {
    if (!auto) recordHistory(answer === 'yes' ? { breaksYes: 1 } : { breaksLater: 1 });
    // Yes: full interval again. Later: come back after the snooze, in screen time.
    screenMs[key] = answer === 'yes'
      ? 0
      : Math.max(0, intervalMs(key) - store.get('snoozeMinutes') * 60 * 1000);
  }
  if (auto && mainWindow) mainWindow.webContents.send('reminder:dismiss', answer);
}

/* ------------------------- custom reminders ------------------------- */

function customPayload(c) {
  const preset = c.preset && CUSTOM_PRESETS[c.preset];
  return {
    kind: 'custom',
    label: c.label,
    message: c.message,
    yesReply: 'Nice. Back to it!',
    laterReply: 'Okay, I will ask again soon.',
    guide: preset ? preset.guide : null
  };
}

/* ------------------------- calendar / meetings ------------------------- */
// Reads the calendar's private ICS link (Google Calendar "Secret address in iCal
// format", or Outlook/Teams "Publish calendar" ICS). The link is stored encrypted
// (Windows DPAPI via safeStorage) and never sent to the window.

let meetings = []; // upcoming meeting instances from the last sync
let seenUids = new Set(store.get('calendarSeen') || []);
let calendarPrimed = store.get('calendarSeen') != null; // false until the first sync finishes
const calState = { lastSync: null, error: null, count: 0 };
const alerted = store.get('meetingAlerted') || {}; // alertId -> epoch ms
const meetingSnooze = {}; // alertId -> epoch ms
let pendingInvites = [];

function saveAlerted() {
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  for (const id of Object.keys(alerted)) if (alerted[id] < cutoff) delete alerted[id];
  store.set('meetingAlerted', alerted);
}

function encryptText(text) {
  return safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(text).toString('base64')}`
    : `raw:${Buffer.from(text, 'utf8').toString('base64')}`; // no OS key store: obfuscated only
}

function decryptText(value) {
  if (typeof value !== 'string') return null;
  try {
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    if (value.startsWith('raw:')) return Buffer.from(value.slice(4), 'base64').toString('utf8');
  } catch { /* unreadable (e.g. other Windows user): treat as no link */ }
  return null;
}

// Multiple calendars are supported: links are stored as one encrypted JSON
// list. A legacy single `calendarUrl` (<= 0.6.0) is migrated on first read.
function loadCalendarUrls() {
  const packed = decryptText(store.get('calendarUrls'));
  if (packed) {
    try {
      const list = JSON.parse(packed);
      if (Array.isArray(list)) return list.filter((u) => typeof u === 'string' && u);
    } catch { /* fall through to legacy */ }
  }
  const legacy = decryptText(store.get('calendarUrl'));
  return legacy ? [legacy] : [];
}

function saveCalendarUrls(urls) {
  store.set('calendarUrls', encryptText(JSON.stringify(urls.slice(0, 4))));
  store.delete('calendarUrl');
}

function addCalendarUrl(url) {
  const urls = loadCalendarUrls();
  if (!urls.includes(url)) urls.push(url);
  saveCalendarUrls(urls);
  store.delete('calendarSeen');
  seenUids = new Set();
  calendarPrimed = false;
  pendingInvites = [];
}

function calendarStatus() {
  const now = Date.now();
  const next = meetings.find((m) => m.start > now);
  return {
    hasUrl: loadCalendarUrls().length > 0,
    links: loadCalendarUrls().length,
    lastSync: calState.lastSync,
    error: calState.error,
    count: meetings.filter((m) => m.start > now - 3600e3 && m.start < now + 2 * 24 * 3600e3).length,
    next: next ? { title: next.title, start: next.start, hasLink: !!next.url } : null
  };
}

function fmtWhen(ms) {
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

// One sync at a time. A request that arrives while one is running waits for it
// and then runs once more, so it always sees the latest link and settings.
let syncPromise = null;
let resync = false;
function syncCalendar() {
  if (syncPromise) { resync = true; return syncPromise; }
  syncPromise = (async () => {
    try {
      let status;
      do { resync = false; status = await doSyncCalendar(); } while (resync);
      return status;
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

// ICS parsing runs in a worker thread (see calendar-worker.js); if the
// worker cannot start, fall back to parsing here so alerts never stop.
let calWorker = null;
let calReqId = 0;
const calPending = new Map();
function parseEventsAsync(text, fromMs, toMs) {
  return new Promise((resolve, reject) => {
    try {
      if (!calWorker) {
        calWorker = new Worker(path.join(__dirname, 'calendar-worker.js'));
        calWorker.on('message', (m) => {
          const entry = calPending.get(m.id);
          if (!entry) return;
          calPending.delete(m.id);
          if (m.error) entry.reject(new Error(m.error));
          else entry.resolve(m.events);
        });
        calWorker.on('error', (err) => {
          for (const entry of calPending.values()) entry.reject(err);
          calPending.clear();
          calWorker = null;
        });
      }
      const id = ++calReqId;
      calPending.set(id, { resolve, reject });
      calWorker.postMessage({ id, text, fromMs, toMs });
    } catch {
      try { resolve(calendar.parseEvents(text, fromMs, toMs)); } catch (err) { reject(err); }
    }
  });
}

async function doSyncCalendar() {
  const cfg = store.get('calendar');
  const urls = loadCalendarUrls();
  if (!cfg.enabled || !urls.length) { meetings = []; calState.error = null; return calendarStatus(); }
  try {
    const now = Date.now();
    const parsedAll = [];
    const errors = [];
    for (const url of urls) {
      try {
        const text = await calendar.fetchIcs(url);
        parsedAll.push(...await parseEventsAsync(text, now - 2 * 3600e3, now + CALENDAR_HORIZON_MS));
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length && errors.length === urls.length) throw errors[0];
    if (errors.length) log.warn('one calendar link failed to sync; continuing with the others');
    parsedAll.sort((a, b) => a.start - b.start);
    const seenIds = new Set();
    const parsed = parsedAll.filter((m) => (seenIds.has(m.id) ? false : (seenIds.add(m.id), true)));
    meetings = parsed;

    // New invites: events whose id we have never seen. The first sync only
    // records what is already there, so you are not told about your whole calendar.
    const uids = new Set(parsed.map((m) => m.uid));
    if (calendarPrimed && cfg.notifyInvites) {
      const fresh = [];
      for (const m of parsed) {
        if (!seenUids.has(m.uid) && m.start > now && !fresh.some((f) => f.uid === m.uid)) fresh.push(m);
      }
      pendingInvites.push(...fresh);
    }
    seenUids = seenUids.size + uids.size > 5000 ? uids : new Set([...seenUids, ...uids]);
    store.set('calendarSeen', [...seenUids]);
    calendarPrimed = true;
    calState.lastSync = now;
    calState.error = null;
  } catch (err) {
    const message = err && err.name === 'TimeoutError' ? 'The calendar link timed out'
      : err && /^(Calendar|That link)/.test(err.message || '') ? err.message
      : 'Could not read the calendar link';
    calState.error = urls.reduce((acc, u) => acc.split(u).join('(link)'), message);
  }
  return calendarStatus();
}

// The next meeting alert that is due (or null). Two alerts per meeting: N minutes
// before, and (optionally) at the start. Late catch-up for 10 minutes covers sleep.
function meetingAlertDue(now) {
  const cfg = store.get('calendar');
  if (!cfg.enabled) return null;
  const lead = cfg.leadMinutes * 60 * 1000;
  const snoozed = (id) => (meetingSnooze[id] || 0) > now;
  for (const m of meetings) {
    if (now >= m.start + MEETING_LATE_MS || now >= m.end) continue;
    const startId = `${m.id}|start`;
    const leadId = `${m.id}|lead`;
    if (cfg.alertAtStart && now >= m.start && !alerted[startId] && !snoozed(startId)) return { m, kind: 'start', alertId: startId };
    if (now >= m.start - lead && !alerted[leadId] && !alerted[startId] && !snoozed(leadId)) {
      return { m, kind: now >= m.start ? 'start' : 'lead', alertId: leadId };
    }
  }
  return null;
}

function meetingPayload(due, now) {
  const { m, kind } = due;
  const mins = Math.max(1, Math.round((m.start - now) / 60000));
  const message = kind === 'start' ? `${m.title} is starting now.` : `${m.title} starts in ${mins} min.`;
  return {
    message,
    payload: {
      kind: 'meeting',
      label: 'Meeting',
      message,
      yesLabel: m.url ? 'Join' : 'Got it',
      laterLabel: 'In 1 min',
      yesReply: m.url ? 'Opening your meeting. Good luck!' : 'Good luck!',
      laterReply: 'I will nudge you again in a minute.'
    }
  };
}

function fireMeetingAlert(due, now) {
  // Meetings come first: a waiting built-in/custom reminder is put back on its snooze.
  if (active && !active.key.startsWith('meeting:')) finishReminder('later', { auto: true });
  if (active) return false;
  const { message, payload } = meetingPayload(due, now);
  const ok = fireReminder(`meeting:${due.m.id}`, {
    payload,
    title: due.kind === 'start' ? 'Meeting starting' : 'Meeting soon',
    body: message,
    meta: { alertId: due.alertId, url: due.m.url }
  });
  if (ok) {
    alerted[due.alertId] = now;
    if (due.kind === 'start') alerted[`${due.m.id}|lead`] = now;
    saveAlerted();
    recordHistory({ meetings: 1 });
  }
  return ok;
}

function firePayload(key, payload, title, body) {
  return fireReminder(key, { payload, title, body });
}

function fireFocusDone() {
  const minutes = pendingFocusDone.minutes;
  const ok = firePayload('focus:done', {
    kind: 'focus', label: 'Focus complete',
    message: `${minutes} minutes of focus complete. Nice work - take a breath.`,
    yesLabel: 'Great', laterLabel: null, yesReply: 'Enjoy the break!', laterReply: ''
  }, 'Focus complete', `${minutes} minutes of focus complete.`);
  if (ok) pendingFocusDone = null;
  return ok;
}

function isBirthdayToday() {
  const b = store.get('profile.birthday');
  return !!b && b === todayKey().slice(5);
}

function needsBriefing() {
  if (store.get('lastBriefing') === todayKey()) return false;
  if (isBirthdayToday()) return true; // once a year, even if briefings are off
  if (store.get('morningBriefing') === false) return false;
  // With a calendar connected, wait until today's first sync has happened so
  // the briefing can name the day's meetings.
  if (loadCalendarUrls().length && (!calState.lastSync || todayKey(new Date(calState.lastSync)) !== todayKey())) return false;
  return true;
}

function fireBriefing(now) {
  const todays = meetings.filter((m) => todayKey(new Date(m.start)) === todayKey() && m.end > now);
  const goal = store.get('hydrationGoal') || DEFAULTS.hydrationGoal;
  const md = todayKey().slice(5);
  const special = isBirthdayToday() ? 'Happy birthday! ' : md === '01-01' ? 'Happy New Year! ' : md === '12-25' ? 'Merry Christmas! ' : '';
  const base = todays.length
    ? `Good morning. ${todays.length} meeting${todays.length > 1 ? 's' : ''} today - first is "${todays[0].title}" (${fmtWhen(todays[0].start)}). Water goal: ${goal} glasses.`
    : `Good morning. No meetings on your calendar today. Water goal: ${goal} glasses.`;
  const message = special + base;
  const ok = firePayload('briefing:today', {
    kind: 'briefing', label: 'Morning briefing', message,
    yesLabel: 'Got it', laterLabel: null, yesReply: 'Have a good day!', laterReply: ''
  }, 'Good morning', message);
  if (ok) store.set('lastBriefing', todayKey());
  return ok;
}

function firePostMeeting() {
  const mins = pendingPostMeeting;
  const ok = firePayload('postmeeting:1', {
    kind: 'postmeeting', label: 'Post-meeting break',
    message: `You were in meetings for about ${mins} minutes straight. Take a short break?`,
    yesLabel: 'Take a break', laterLabel: 'Later',
    yesReply: 'Good call.', laterReply: 'Okay, I will ask again soon.',
    guide: CUSTOM_PRESETS.posture.guide
  }, 'Time for a break', 'Long stretch of meetings - take a short break?');
  if (ok) pendingPostMeeting = 0;
  return ok;
}

function fireBattery() {
  const ok = firePayload('battery:low', {
    kind: 'battery', label: 'Battery low',
    message: `Battery is at ${pendingBattery}%. Plug in soon so I do not lose you.`,
    yesLabel: 'Got it', laterLabel: null, yesReply: 'Thanks for plugging in!', laterReply: ''
  }, 'Battery low', `Battery is at ${pendingBattery}%.`);
  if (ok) pendingBattery = 0;
  return ok;
}

function fireGreeting() {
  const ok = firePayload('greeting:back', {
    kind: 'greeting', label: 'Welcome back', message: 'Welcome back. Ready when you are.',
    yesLabel: 'Hi', laterLabel: null, yesReply: 'Good to see you too!', laterReply: ''
  }, 'Welcome back', 'Welcome back.');
  if (ok) pendingGreeting = false;
  return ok;
}

function fireNotify() {
  const n = pendingNotify;
  const ok = firePayload('notify:dev', {
    kind: 'notify', label: n.title, message: n.message,
    yesLabel: 'Got it', laterLabel: null, yesReply: 'Noted!', laterReply: ''
  }, n.title, n.message);
  if (ok) pendingNotify = null;
  return ok;
}

/* ------------- fullscreen / presentation quiet (Windows) ------------- */
// SHQueryUserNotificationState tells us when a fullscreen app, a Direct3D
// fullscreen session or presentation mode is active (it also covers most
// fullscreen video calls). While it is, the companion does not walk in and
// no notifications are sent; everything simply waits until it lifts.
// Polled at most every 30s in a short-lived PowerShell process (the only
// way to reach this Win32 API from Electron without native modules).
// Fails open (not quiet) on any error and on non-Windows platforms.
let userQuiet = false;
let fsCheckRunning = false;
let fsCheckFailedLogged = false;
const FS_PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class UserState {
  [DllImport("shell32.dll")]
  public static extern int SHQueryUserNotificationState(out int state);
}
"@
$state = 0
$result = [UserState]::SHQueryUserNotificationState([ref]$state)
Write-Output $state
`;
function checkUserNotificationState() {
  if (process.platform !== 'win32' || fsCheckRunning) return;
  fsCheckRunning = true;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FS_PS_SCRIPT],
    { timeout: 6000, windowsHide: true }, (err, stdout) => {
      fsCheckRunning = false;
      if (err) {
        if (!fsCheckFailedLogged) { fsCheckFailedLogged = true; log.warn('fullscreen detection unavailable; staying active', err.message); }
        userQuiet = false;
        return;
      }
      const state = parseInt(String(stdout).trim(), 10);
      // 2 = busy (fullscreen app), 3 = running D3D fullscreen, 4 = presentation mode
      const quiet = state === 2 || state === 3 || state === 4;
      if (quiet !== userQuiet) log.info(quiet ? 'fullscreen/presentation detected: going quiet' : 'fullscreen ended: active again');
      userQuiet = quiet;
    });
}
let lastFsCheck = 0;

function fireInvite() {
  const first = pendingInvites[0];
  const many = pendingInvites.length > 3;
  const message = many
    ? `${pendingInvites.length} new events on your calendar.`
    : `New on your calendar: ${first.title} (${fmtWhen(first.start)}).`;
  const ok = fireReminder(`invite:${first.uid}`, {
    payload: { kind: 'invite', label: 'New invite', message, yesLabel: 'Got it', laterLabel: null, yesReply: 'Noted!', laterReply: '' },
    title: 'New calendar event',
    body: message
  });
  if (ok) pendingInvites = many ? [] : pendingInvites.slice(1);
}

function tick() {
  const now = Date.now();
  const delta = Math.min(now - lastTick, TICK_MS * 4); // a long gap (sleep) is never counted
  lastTick = now;

  // Sleep or lock: the screen is not being looked at, so nothing counts.
  if (suspended || locked) { flushScreenTime(); return; }

  // Total screen time today: accumulate in memory, flush to disk at most
  // every 5 minutes (the panel/tray read the in-memory total).
  if (pendingScreenDate !== todayKey()) { flushScreenTime(); pendingScreenDate = todayKey(); }
  pendingScreenMs += delta;
  if (now - lastScreenFlush >= 5 * 60 * 1000) flushScreenTime();
  updateTrayTooltip();

  // Track continuous meeting blocks for the post-meeting break suggestion.
  const inMeeting = meetings.some((m) => now >= m.start && now < m.end);
  if (inMeeting && meetingBlockStart === null) meetingBlockStart = now;
  if (!inMeeting && meetingBlockStart !== null) {
    const blockMin = Math.round((now - meetingBlockStart) / 60000);
    meetingBlockStart = null;
    if (blockMin >= 60) pendingPostMeeting = blockMin;
  }

  // Fullscreen / presentation: stay completely out of the way. State is
  // polled in the background; reminders and meetings wait until it lifts.
  if (store.get('respectFullscreen') !== false && now - lastFsCheck > 30 * 1000) {
    lastFsCheck = now;
    checkUserNotificationState();
  }
  if (userQuiet) return;

  // Meetings come first and ignore pause / quiet hours / the gap between reminders.
  const meetingDue = meetingAlertDue(now);
  if (meetingDue && fireMeetingAlert(meetingDue, now)) return;

  // Focus mode: a finished session reports once; while one is running, all
  // non-meeting reminders are held (that is the point of focusing).
  if (focusSession && now >= focusSession.endsAt) {
    recordHistory({ focusSessions: 1, focusMs: focusSession.minutes * 60 * 1000 });
    pendingFocusDone = { minutes: focusSession.minutes };
    focusSession = null;
    store.delete('focusSession');
    buildTrayMenu();
  }
  if (focusSession) return;

  if (now < pausedUntil) { resetAllTimers(); return; } // paused from the tray

  // Quiet hours: stay silent, and keep the clocks at zero so the first
  // reminder arrives a full interval after quiet hours end.
  if (inQuietHours(new Date(now))) { resetAllTimers(); return; }

  for (const key of reminderKeys()) screenMs[key] = (screenMs[key] || 0) + delta;
  if (active || now < cooldownUntil) return;

  // One-at-a-time queue for the newer alert kinds, most valuable first.
  if (pendingFocusDone && fireFocusDone()) return;
  if (needsBriefing() && fireBriefing(now)) return;
  if (pendingPostMeeting && firePostMeeting()) return;
  if (pendingBattery && fireBattery()) return;
  if (pendingGreeting && fireGreeting()) return;
  if (pendingNotify && fireNotify()) return;

  // Scheduled custom reminders: at a set time, on chosen days (wall clock).
  const firedMap = store.get('scheduledFired') || {};
  const sched = customList().find((c) => settingsMod.scheduledDue(c, new Date(now), firedMap));
  if (sched && fireReminder(customKey(sched.id), { payload: customPayload(sched) })) {
    store.set('scheduledFired', { ...firedMap, [sched.id]: settingsMod.dateKeyOf(new Date(now)) });
    return;
  }

  if (pendingInvites.length) { fireInvite(); return; }

  const due = reminderKeys()
    .filter((key) => isEnabled(key) && screenMs[key] >= intervalMs(key))
    .sort((a, b) => (screenMs[b] - intervalMs(b)) - (screenMs[a] - intervalMs(a)));

  if (!due.length) return;
  const custom = findCustom(due[0]);
  if (custom) fireReminder(due[0], { payload: customPayload(custom) });
  else fireReminder(due[0]);
}

function pauseFor(minutes) {
  pausedUntil = Date.now() + minutes * 60 * 1000;
  resetAllTimers();
  buildTrayMenu();
}

function resumeNow() {
  pausedUntil = 0;
  resetAllTimers();
  buildTrayMenu();
}

/* ------------------------------ window ------------------------------ */

let panelOpen = false;

// The transparent window spans the screen width (the companion walks across
// it), but its HEIGHT follows the panel: ~280px is enough for the character
// and bubble, so the OS composites a much smaller surface while the panel is
// closed. Opening the panel grows it to the full 680px.
function layoutWindow() {
  if (!mainWindow) return;
  const { workArea } = screen.getPrimaryDisplay();
  const height = Math.min(panelOpen ? 680 : 280, workArea.height);
  mainWindow.setBounds({
    x: workArea.x,
    y: workArea.y + workArea.height - height,
    width: workArea.width,
    height
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // keep the walk smooth while another app has focus
    }
  });

  layoutWindow();
  mainWindow.setAlwaysOnTop(true, 'floating');
  // The window spans the screen bottom but is mostly empty. Let clicks fall
  // through to apps underneath; the renderer turns interaction back on only
  // while the cursor is over the character, bubble or panel.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.showInactive());

  // NOTE: do not block 'close'. The NSIS installer/updater asks a running app
  // to close (WM_CLOSE) before replacing its files; if the app swallows that
  // and just hides itself, the installer waits forever. There is no title bar,
  // so the only ways to get a 'close' are Alt+F4 / the installer / Task
  // Manager - all of which should really quit. Hiding goes through the tray
  // or the panel's x button (mainWindow.hide()).
}

/* ------------------------------- tray ------------------------------- */

function buildTrayMenu() {
  if (!tray) return;
  const paused = Date.now() < pausedUntil;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Companion  (Ctrl+Alt+C opens the panel)', click: () => showCompanion({ focus: true }) },
    { label: 'Hide until next reminder', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: `Water today: ${hydrationToday()} / ${store.get('hydrationGoal')}`, enabled: false },
    { label: 'Test reminder', click: () => fireReminder('test', { test: true }) },
    { label: 'Test meeting alert', click: () => testMeetingAlert() },
    focusSession
      ? { label: `Stop focus (${Math.max(1, Math.round((focusSession.endsAt - Date.now()) / 60000))} min left)`, click: () => stopFocus() }
      : {
          label: 'Start focus',
          submenu: [
            { label: '25 minutes', click: () => startFocus(25) },
            { label: '50 minutes', click: () => startFocus(50) },
            { label: '90 minutes', click: () => startFocus(90) }
          ]
        },
    paused
      ? { label: 'Resume reminders', click: resumeNow }
      : {
          label: 'Pause reminders',
          submenu: [
            { label: 'For 30 minutes', click: () => pauseFor(30) },
            { label: 'For 1 hour', click: () => pauseFor(60) },
            { label: 'For 2 hours', click: () => pauseFor(120) }
          ]
        },
    {
      label: 'Launch at startup',
      type: 'checkbox',
      checked: !!store.get('openAtLogin'),
      enabled: app.isPackaged,
      click: (item) => {
        store.set('openAtLogin', item.checked);
        applyLoginItem();
        mainWindow.webContents.send('settings:changed', publicSettings());
      }
    },
    { type: 'separator' },
    { label: 'Check for updates', click: () => checkForUpdates(true) },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', process.platform === 'win32' ? 'tray.ico' : 'tray.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  updateTrayTooltip();
  buildTrayMenu();
  // Click = bring the companion back (it walks in if it was away).
  tray.on('click', () => showCompanion({ focus: true }));
}

/* ------------------------------- IPC ------------------------------- */

ipcMain.handle('settings:get', () => publicSettings());

ipcMain.handle('settings:set', (_event, nextSettings) => {
  store.set(sanitizeSettings(nextSettings));
  applyLoginItem();
  resetAllTimers();
  buildTrayMenu();
  updateTrayTooltip();
  syncCalendar(); // settings may have changed what we alert on
  return publicSettings();
});

ipcMain.handle('window:hide', () => mainWindow.hide());

ipcMain.handle('window:set-panel', (_event, open) => {
  panelOpen = !!open;
  layoutWindow();
});

function startFocus(minutes) {
  const mins = clampMinutes(minutes, 25, 5, 180);
  focusSession = { endsAt: Date.now() + mins * 60 * 1000, minutes: mins };
  store.set('focusSession', focusSession);
  buildTrayMenu();
  if (mainWindow) mainWindow.webContents.send('settings:changed', publicSettings());
  return publicSettings();
}

function stopFocus() {
  focusSession = null;
  store.delete('focusSession');
  buildTrayMenu();
  if (mainWindow) mainWindow.webContents.send('settings:changed', publicSettings());
  return publicSettings();
}

// Dragging the companion saves its home spot (a fraction of screen width).
// Deliberately not a full settings save: that would reset every timer.
ipcMain.handle('appearance:home', (_event, pct) => {
  const v = Number(pct);
  if (Number.isFinite(v)) store.set('appearance.homePct', Math.min(0.9, Math.max(0.02, v)));
});

ipcMain.handle('focus:start', (_event, minutes) => startFocus(minutes));
ipcMain.handle('focus:stop', () => stopFocus());

// Battery reports from the renderer (Chromium's Battery API lives there).
// Main owns the cooldown so a flapping charger cannot spam alerts.
ipcMain.handle('battery:low', (_event, percent) => {
  const pct = Math.round(Number(percent));
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) return;
  const last = store.get('lastBatteryAlert') || 0;
  if (Date.now() - last < 4 * 60 * 60 * 1000) return;
  store.set('lastBatteryAlert', Date.now());
  pendingBattery = pct;
});

// A guided break is running: keep other reminders from interrupting it.
ipcMain.handle('reminders:hold', (_event, ms) => {
  const hold = Math.min(5 * 60 * 1000, Math.max(0, Number(ms) || 0));
  cooldownUntil = Math.max(cooldownUntil, Date.now() + hold + GAP_AFTER_ANSWER_MS);
});

// The companion has walked off screen. The window spans the whole bottom of the
// screen, so hide it completely: a hidden window cannot block clicks, whatever
// state the click-through toggling is in. It is shown again for the next
// reminder or from the tray (showCompanion). Never hide while a reminder is waiting.
ipcMain.handle('companion:away', () => {
  if (!mainWindow || active) return;
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.hide();
});

ipcMain.handle('app:quit', () => {
  app.isQuiting = true;
  app.quit();
});

ipcMain.handle('window:set-interactive', (_event, interactive) => {
  if (interactive) mainWindow.setIgnoreMouseEvents(false);
  else mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.handle('reminder:answer', (_event, answer) => {
  finishReminder(answer === 'yes' ? 'yes' : 'later');
  return publicSettings();
});

ipcMain.handle('reminder:test', () => fireReminder('test', { test: true }));

function testMeetingAlert() {
  fireReminder('meeting:test', {
    payload: {
      kind: 'meeting', label: 'Meeting', message: 'Team sync starts in 5 min.',
      yesLabel: 'Got it', laterLabel: 'In 1 min', yesReply: 'Good luck!', laterReply: 'I will nudge you again in a minute.'
    },
    title: 'Meeting soon', body: 'Team sync starts in 5 min.', meta: { alertId: 'test', url: null }
  });
}
ipcMain.handle('meeting:test', () => testMeetingAlert());

// Calendar link (private): set, clear, re-sync. The link itself is never returned.
ipcMain.handle('calendar:set-url', async (_event, url) => {
  const clean = calendar.normalizeUrl(url);
  if (!clean) return { ok: false, error: 'Paste the full calendar link (it starts with https:// or webcal://).' };
  addCalendarUrl(clean); // connecting another link ADDS a calendar (max 4)
  store.set('calendar.enabled', true);
  const status = await syncCalendar();
  return { ok: !status.error, status, error: status.error };
});
ipcMain.handle('calendar:clear', () => {
  store.delete('calendarUrl');
  store.delete('calendarUrls');
  store.delete('calendarSeen');
  seenUids = new Set();
  calendarPrimed = false;
  meetings = [];
  pendingInvites = [];
  calState.lastSync = null;
  calState.error = null;
  return calendarStatus();
});
ipcMain.handle('calendar:sync', () => syncCalendar());

/* --------------------------- auto-update --------------------------- */
// Needs a `build.publish` target in package.json (see README). Without one,
// or when running from source, this quietly does nothing.

let updater = null;

function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) notify('CerebraQ Companion', 'Updates are checked in the installed app, not when running from source.');
    return;
  }
  if (!updater) { if (manual) notify('CerebraQ Companion', 'The update channel is not configured yet.'); return; }
  updater.checkForUpdates().catch(() => {});
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    updater = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => log.warn('auto-update check failed', err && err.message));
    autoUpdater.on('update-available', (info) => {
      notify('CerebraQ Companion update', `Version ${info.version} is downloading in the background.`);
    });
    autoUpdater.on('update-downloaded', (info) => {
      notify('CerebraQ Companion update', `Version ${info.version} is ready and installs when you quit the app.`);
    });
    checkForUpdates();
    setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
  } catch (err) {
    log.warn('auto-update unavailable', err);
  }
}

/* ------------------------- developer webhook ------------------------- */
// Loopback-only POST /notify for build/CI/test alerts (e.g. a failed build
// script POSTs { "title": "Build failed", "message": "..." }). Off unless the
// user enables "Developer alerts" in the panel. Binds 127.0.0.1 only.
const DEV_PORT = 17341;
function startDevServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/notify') { res.writeHead(404).end(); return; }
    if (!store.get('devAlerts')) { res.writeHead(403, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'Developer alerts are off in the companion panel.' })); return; }
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        pendingNotify = {
          title: String(data.title ?? 'Notification').slice(0, 40) || 'Notification',
          message: String(data.message ?? '').slice(0, 120) || 'You have a notification.'
        };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'Body must be JSON.' }));
      }
    });
  });
  server.on('error', (err) => log.warn(`developer webhook unavailable on port ${DEV_PORT}`, err && err.message));
  server.listen(DEV_PORT, '127.0.0.1');
}

/* ----------------------------- lifecycle ----------------------------- */

app.on('second-instance', () => {
  if (mainWindow) showCompanion({ focus: true });
});

app.whenReady().then(() => {
  if (!gotLock) return;
  try { log = createLogger(path.join(app.getPath('userData'), 'logs')); } catch { /* keep console logger */ }
  log.info(`CerebraQ Companion ${app.getVersion()} starting`);
  createWindow();
  createTray();
  startDevServer();
  applyLoginItem();
  resetAllTimers();
  setInterval(tick, TICK_MS);
  setTimeout(syncCalendar, 4000);
  setInterval(syncCalendar, CALENDAR_SYNC_MS);
  setupAutoUpdate();

  // Global shortcut: summon the companion and toggle its panel from anywhere.
  const ok = globalShortcut.register(SHORTCUT, () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.webContents.send('companion:toggle-panel');
  });
  if (!ok) log.warn(`could not register ${SHORTCUT}; another app is using it`);

  screen.on('display-metrics-changed', layoutWindow);
  screen.on('display-added', layoutWindow);
  screen.on('display-removed', layoutWindow);

  powerMonitor.on('suspend', () => { suspended = true; flushScreenTime(); screenOff(); });
  powerMonitor.on('resume', () => { suspended = false; if (!locked) { screenOn(); syncCalendar(); } });
  powerMonitor.on('lock-screen', () => { locked = true; flushScreenTime(); screenOff(); });
  powerMonitor.on('unlock-screen', () => { locked = false; if (!suspended) { screenOn(); syncCalendar(); } });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  flushScreenTime();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  app.quit();
});
