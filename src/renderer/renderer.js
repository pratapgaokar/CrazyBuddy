const reminderDefinitions = {
  hydration: {
    label: 'Hydration',
    message: 'Water time. Did you drink water?',
    notification: 'Water time. Drink water?',
    yesReply: 'Nice. Hydrated and powerful.',
    laterReply: 'Okay... I will remind you again soon.'
  },
  break: {
    label: 'Break',
    message: 'Stretch break?',
    notification: 'Step away for a few minutes.',
    yesReply: 'Good choice. Your body says thanks.',
    laterReply: 'Alright, but I am watching the clock.'
  },
  eyeBreak: {
    label: 'Eye break',
    message: 'Look far away for 20 seconds?',
    notification: 'Rest your eyes for 20 seconds.',
    yesReply: 'Good. Fresh eyes, fresh focus.',
    laterReply: 'Okay, but your eyes still need care.'
  }
};

// Guided breaks: after "Yes" the companion stays and walks you through it.
// steps: [secondsIntoBreak, text]
reminderDefinitions.eyeBreak.guide = {
  seconds: 20,
  steps: [[0, 'Look at something far away. Let your eyes relax.'], [10, 'Now blink slowly a few times.']],
  done: 'Fresh eyes. Nice work!'
};
reminderDefinitions.break.guide = {
  seconds: 60,
  steps: [
    [0, 'Stand up and roll your shoulders back.'],
    [15, 'Slowly tilt your head side to side.'],
    [30, 'Reach both arms up and stretch tall.'],
    [45, 'Take three slow, deep breaths.']
  ],
  done: 'Body says thanks. Nice work!'
};

reminderDefinitions.test = {
  label: 'Test',
  message: 'This is how I will ask next time. Ready?',
  yesReply: 'Perfect. I will celebrate and leave right.',
  laterReply: 'No problem. I will go back quietly.',
  // Short demo so "Test reminder" shows what a guided break looks like.
  guide: { seconds: 6, steps: [[0, 'This is a guided break.'], [3, 'I count it down for you.']], done: 'That is how it works!' }
};

const CHARACTER_PROFILES = Object.freeze({
  cinder: { name: 'Cinder', tagline: 'Focus dragon', avatar: 'dragon', skin: 'original', greeting: 'Cinder is ready to help you focus.' },
  ember: { name: 'Ember', tagline: 'Bright dragon', avatar: 'dragon', skin: 'sunset', greeting: 'Ember brings a little more energy.' },
  tide: { name: 'Tide', tagline: 'Calm dragon', avatar: 'dragon', skin: 'ocean', greeting: 'Tide is keeping things calm.' },
  pip: { name: 'Pip', tagline: 'Friendly buddy', avatar: 'buddy', skin: 'original', greeting: 'Pip is happy to see you.' },
  orbit: { name: 'Orbit', tagline: 'Steady navigator', avatar: 'robo', skin: 'ocean', greeting: 'Orbit is online and steady.' },
  nova: { name: 'Nova', tagline: 'High-energy robo', avatar: 'robo', skin: 'sunset', greeting: 'Nova is ready for a productive run.' }
});

let activeReminder = null;
let lastReminder = null;
let reminderSceneTimer;
let lastActionAt = 0;
let settings;

const character = document.querySelector('#character');
const characterBody = document.querySelector('#characterBody');
const panel = document.querySelector('#panel');
const reminders = document.querySelector('#reminders');
const status = document.querySelector('#status');
const bubble = document.querySelector('#bubble');
const bubbleText = document.querySelector('#bubbleText');
const bubbleActions = document.querySelector('#bubbleActions');
const yesAction = document.querySelector('#yesAction');
const laterAction = document.querySelector('#laterAction');
const saveSettings = document.querySelector('#saveSettings');
const testNotification = document.querySelector('#testNotification');
const hideWindow = document.querySelector('#hideWindow');
const snoozeInput = document.querySelector('#snoozeMinutes');
const loginInput = document.querySelector('#openAtLogin');
const goalInput = document.querySelector('#hydrationGoal');
const quietEnabled = document.querySelector('#quietEnabled');
const quietStart = document.querySelector('#quietStart');
const quietEnd = document.querySelector('#quietEnd');
const waterToday = document.querySelector('#waterToday');
const breakProgress = document.querySelector('#breakProgress');
const breakBar = document.querySelector('#breakBar');
const skipBreak = document.querySelector('#skipBreak');
const guidedInput = document.querySelector('#guidedBreaks');
const calEnabled = document.querySelector('#calEnabled');
const calUrl = document.querySelector('#calUrl');
const calConnect = document.querySelector('#calConnect');
const calDisconnect = document.querySelector('#calDisconnect');
const calStatus = document.querySelector('#calStatus');
const calLead = document.querySelector('#calLead');
const calAtStart = document.querySelector('#calAtStart');
const calInvites = document.querySelector('#calInvites');
const customList = document.querySelector('#customList');
const addCode = document.querySelector('#addCode');
const addCustom = document.querySelector('#addCustom');
const screenToday = document.querySelector('#screenToday');
const streakToday = document.querySelector('#streakToday');
const last7El = document.querySelector('#last7');
const onboardingEl = document.querySelector('#onboarding');
const focusStatus = document.querySelector('#focusStatus');
const focusMinutes = document.querySelector('#focusMinutes');
const skinSelect = document.querySelector('#skinSelect');
const avatarSelect = document.querySelector('#avatarSelect');
const briefingInput = document.querySelector('#morningBriefing');
const devInput = document.querySelector('#devAlerts');
const addBreathing = document.querySelector('#addBreathing');
const addPosture = document.querySelector('#addPosture');
const chimeToggle = document.querySelector('#chimeToggle');
const volumeRange = document.querySelector('#volumeRange');
const ambientSelect = document.querySelector('#ambientSelect');
const testSoundBtn = document.querySelector('#testSound');
const birthdayInput = document.querySelector('#birthdayInput');
const fullscreenToggle = document.querySelector('#fullscreenToggle');
const animSelect = document.querySelector('#animSelect');
const quickActions = document.querySelector('#quickActions');
const dashboardStrip = document.querySelector('#dashboardStrip');
const dashboardFocus = document.querySelector('#dashboardFocus');
const dashboardWater = document.querySelector('#dashboardWater');
const dashboardMeeting = document.querySelector('#dashboardMeeting');
const dashboardMood = document.querySelector('#dashboardMood');
const characterPicker = document.querySelector('#characterPicker');
const characterName = document.querySelector('#characterName');
const characterTagline = document.querySelector('#characterTagline');
const characterSwitch = document.querySelector('#characterSwitch');
const exportDataBtn = document.querySelector('#exportData');
const openDiagnosticsBtn = document.querySelector('#openDiagnostics');
const clearDataBtn = document.querySelector('#clearData');
const dataStatus = document.querySelector('#dataStatus');


function setBubble(text) {
  const quiet = new Set(['Ready when you are.', 'See you soon!', 'Hi! I am here.']).has(text);
  bubbleText.textContent = text;
  status.textContent = text;
  bubble.classList.toggle('is-quiet', quiet);
  status.classList.toggle('is-quiet', quiet);
}

function setCharacterState(...states) {
  character.className = ['character', ...states].join(' ');
}

const interactionApi = window.CompanionInteraction || null;
let interactionState = interactionApi
  ? { ...interactionApi.DEFAULT_STATE, isOnScreen: false }
  : { mood: 'neutral', panelOpen: false, isOnScreen: false, activeReminder: false, guided: false, justDragged: false };
const quickGlyphs = { settings: '⚙', focus: '◷', water: '◒', mood: '✦', sparkles: '✧', moon: '☾' };

function syncInteractionState(patch = {}) {
  interactionState = { ...interactionState, ...patch };
  renderQuickActions();
  renderDashboard();
}

function renderQuickActions() {
  if (!quickActions || !interactionApi) return;
  quickActions.innerHTML = '';
  for (const action of interactionApi.getRadialActions(interactionState)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-action';
    button.dataset.quickAction = action.id;
    button.style.setProperty('--quick-angle', `${action.angleDeg}deg`);
    button.disabled = !action.enabled;
    button.title = action.disabledReason ? `${action.label} (${action.disabledReason})` : action.label;
    button.setAttribute('aria-label', button.title);
    const glyph = document.createElement('span');
    glyph.className = 'quick-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = quickGlyphs[action.icon] || '•';
    const label = document.createElement('span');
    label.className = 'quick-label';
    label.textContent = action.label;
    button.append(glyph, label);
    quickActions.appendChild(button);
  }
}


function currentCharacterId() {
  const requested = settings && settings.appearance && settings.appearance.character;
  if (requested && CHARACTER_PROFILES[requested]) return requested;
  const appearance = (settings && settings.appearance) || {};
  return Object.entries(CHARACTER_PROFILES).find(([, profile]) => profile.avatar === appearance.avatar && profile.skin === appearance.skin)?.[0] || 'cinder';
}

function renderCharacterPicker() {
  if (!characterPicker || !settings) return;
  const selected = currentCharacterId();
  const profile = CHARACTER_PROFILES[selected];
  characterName.textContent = profile.name;
  characterTagline.textContent = profile.tagline;
  characterPicker.innerHTML = '';
  for (const [id, item] of Object.entries(CHARACTER_PROFILES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-option${id === selected ? ' is-selected' : ''}`;
    button.dataset.characterId = id;
    button.setAttribute('aria-pressed', String(id === selected));
    const preview = document.createElement('span');
    preview.className = `character-preview preview-${item.avatar} preview-${item.skin}`;
    preview.setAttribute('aria-hidden', 'true');
    const details = document.createElement('span');
    details.className = 'character-option-copy';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const tagline = document.createElement('small');
    tagline.textContent = item.tagline;
    details.append(name, tagline);
    button.append(preview, details);
    characterPicker.appendChild(button);
  }
}

async function chooseCharacter(id) {
  const profile = CHARACTER_PROFILES[id];
  if (!profile || !settings) return;
  settings.appearance = { ...(settings.appearance || {}), character: id, avatar: profile.avatar, skin: profile.skin };
  settings = await window.companionApi.setSettings(settings);
  renderSettings();
  setBubble(profile.greeting);
  if (characterPicker) characterPicker.hidden = true;
  if (characterSwitch) characterSwitch.setAttribute('aria-expanded', 'false');
}

function renderSettings() {
  reminders.innerHTML = '';

  Object.entries(settings.reminders).forEach(([key, reminder]) => {
    const definition = reminderDefinitions[key];
    const item = document.createElement('article');
    item.className = 'reminder';
    item.innerHTML = `
      <div>
        <strong>${definition.label}</strong>
        <span>Every ${reminder.minutes} minutes</span>
      </div>
      <input class="interval" type="number" min="1" max="720" value="${reminder.minutes}" aria-label="${definition.label} interval">
      <label class="toggle">
        <input type="checkbox" ${reminder.enabled ? 'checked' : ''}>
        Enabled
      </label>
    `;

    const interval = item.querySelector('.interval');
    const enabled = item.querySelector('[type="checkbox"]');
    const summary = item.querySelector('span');

    interval.addEventListener('input', () => {
      settings.reminders[key].minutes = Number(interval.value);
      summary.textContent = `Every ${settings.reminders[key].minutes || 1} minutes`;
    });

    enabled.addEventListener('change', () => {
      settings.reminders[key].enabled = enabled.checked;
    });

    reminders.appendChild(item);
  });

  snoozeInput.value = settings.snoozeMinutes;
  loginInput.checked = !!settings.openAtLogin;
  guidedInput.checked = settings.guidedBreaks !== false;
  goalInput.value = settings.hydrationGoal;
  quietEnabled.checked = !!settings.quietHours.enabled;
  quietStart.value = settings.quietHours.start;
  quietEnd.value = settings.quietHours.end;
  renderWater();
  renderCalendar();
  renderCustom();
  renderFocus();
  applySkin();
  if (briefingInput) briefingInput.checked = settings.morningBriefing !== false;
  if (devInput) devInput.checked = !!settings.devAlerts;
  if (skinSelect) skinSelect.value = (settings.appearance && settings.appearance.skin) || 'original';
  if (onboardingEl) onboardingEl.hidden = settings.onboarded !== false;
  if (chimeToggle) chimeToggle.checked = !settings.sound || settings.sound.chime !== false;
  if (volumeRange) volumeRange.value = Math.round(((settings.sound && settings.sound.volume) ?? 0.7) * 100);
  if (ambientSelect) ambientSelect.value = (settings.sound && settings.sound.ambient) || 'off';
  if (birthdayInput) birthdayInput.value = (settings.profile && settings.profile.birthday) || '';
  if (fullscreenToggle) fullscreenToggle.checked = settings.respectFullscreen !== false;
  if (animSelect) animSelect.value = (settings.appearance && settings.appearance.anim) || 'full';
  if (avatarSelect) avatarSelect.value = (settings.appearance && settings.appearance.avatar) || 'dragon';
  applyAvatar();
  syncAmbient();
  syncInteractionState({ panelOpen: panel.classList.contains('open'), activeReminder: !!activeReminder, guided });
  renderCharacterPicker();
}

/* ---------------------- meetings (calendar link) ---------------------- */

const fmtTime = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function renderCalendar() {
  const c = settings.calendar || {};
  calEnabled.checked = !!c.enabled;
  calLead.value = c.leadMinutes || 5;
  calAtStart.checked = !!c.alertAtStart;
  calInvites.checked = !!c.notifyInvites;
  calUrl.placeholder = c.hasUrl ? 'Connected. Paste another link to add a calendar' : "Paste your calendar's private ICS link";
  calDisconnect.hidden = !c.hasUrl;
  let text = 'Not connected.';
  if (c.hasUrl) {
    const links = c.links > 1 ? ` (${c.links} calendars)` : '';
    if (c.error) text = `Problem: ${c.error}`;
    else if (c.next) text = `Connected${links}. Next: ${c.next.title}, ${fmtTime(c.next.start)}${c.next.hasLink ? ' (join link found)' : ''}`;
    else text = `Connected${links}. No meetings in the next 2 days.`;
  }
  calStatus.textContent = text;
  calStatus.classList.toggle('error', !!(c.hasUrl && c.error));
}

function applyCalendarStatus(status) {
  settings.calendar = {
    ...settings.calendar,
    hasUrl: status.hasUrl, links: status.links, lastSync: status.lastSync, error: status.error, count: status.count, next: status.next
  };
  renderCalendar();
}

calConnect.addEventListener('click', async () => {
  const value = calUrl.value.trim();
  if (!value) { calStatus.textContent = 'Paste the calendar link first.'; calStatus.classList.add('error'); return; }
  calConnect.disabled = true;
  calStatus.classList.remove('error');
  calStatus.textContent = 'Connecting...';
  try {
    const result = await window.companionApi.calendarSetUrl(value);
    if (result.status) applyCalendarStatus(result.status);
    if (result.ok) {
      calUrl.value = '';
      settings.calendar.enabled = true;
      renderCalendar();
    } else {
      calStatus.textContent = `Problem: ${result.error || 'could not connect'}`;
      calStatus.classList.add('error');
    }
  } catch {
    calStatus.textContent = 'Problem: could not connect';
    calStatus.classList.add('error');
  } finally {
    calConnect.disabled = false;
  }
});

calDisconnect.addEventListener('click', async () => {
  applyCalendarStatus(await window.companionApi.calendarClear());
});
calEnabled.addEventListener('change', () => { settings.calendar.enabled = calEnabled.checked; });
calLead.addEventListener('input', () => { settings.calendar.leadMinutes = Number(calLead.value); });
calAtStart.addEventListener('change', () => { settings.calendar.alertAtStart = calAtStart.checked; });
calInvites.addEventListener('change', () => { settings.calendar.notifyInvites = calInvites.checked; });
document.querySelector('#testMeeting').addEventListener('click', () => { window.companionApi.testMeeting(); });

/* ------------------------- custom reminders ------------------------- */

function renderCustom() {
  customList.innerHTML = '';
  const list = settings.custom || (settings.custom = []);
  list.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'custom-item';
    row.innerHTML = `
      <div class="custom-top">
        <input class="c-label" type="text" maxlength="40" aria-label="Reminder name">
        <input class="interval c-min" type="number" min="1" max="720" aria-label="Minutes between reminders">
        <span class="unit">min</span>
        <input class="c-on" type="checkbox" aria-label="Enabled">
        <button class="icon-button c-del" type="button" aria-label="Delete reminder">×</button>
      </div>
      <input class="c-msg" type="text" maxlength="120" aria-label="Message shown in the bubble">
      <div class="custom-sched">
        <select class="c-mode" aria-label="Reminder timing">
          <option value="interval">Every N min</option>
          <option value="schedule">At a time</option>
        </select>
        <input class="c-time" type="time" aria-label="Time of day">
        <span class="c-days"></span>
      </div>`;
    // Values are set as properties (never interpolated into HTML).
    const label = row.querySelector('.c-label');
    const minutes = row.querySelector('.c-min');
    const enabled = row.querySelector('.c-on');
    const message = row.querySelector('.c-msg');
    label.value = item.label;
    minutes.value = item.minutes;
    enabled.checked = item.enabled !== false;
    message.value = item.message;
    const modeSel = row.querySelector('.c-mode');
    const timeIn = row.querySelector('.c-time');
    const daysEl = row.querySelector('.c-days');
    modeSel.value = item.mode === 'schedule' ? 'schedule' : 'interval';
    timeIn.value = item.time || '09:00';
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const daySet = new Set(Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4, 5, 6]);
    dayNames.forEach((name, d) => {
      const lab = document.createElement('label');
      lab.className = 'day-chip';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = daySet.has(d);
      cb.setAttribute('aria-label', `Day ${d}`);
      cb.addEventListener('change', () => {
        const set = new Set(item.days || []);
        if (cb.checked) set.add(d); else set.delete(d);
        item.days = [...set].sort((a, b) => a - b);
      });
      const txt = document.createElement('span');
      txt.textContent = name;
      lab.append(cb, txt);
      daysEl.appendChild(lab);
    });
    const applyMode = () => {
      const sched = modeSel.value === 'schedule';
      timeIn.hidden = !sched;
      daysEl.style.display = sched ? '' : 'none';
      minutes.disabled = sched;
      item.mode = modeSel.value;
    };
    modeSel.addEventListener('change', applyMode);
    timeIn.addEventListener('change', () => { if (timeIn.value) item.time = timeIn.value; });
    applyMode();
    label.addEventListener('input', () => { item.label = label.value; });
    minutes.addEventListener('input', () => { item.minutes = Number(minutes.value); });
    enabled.addEventListener('change', () => { item.enabled = enabled.checked; });
    message.addEventListener('input', () => { item.message = message.value; });
    row.querySelector('.c-del').addEventListener('click', () => {
      list.splice(index, 1);
      renderCustom();
    });
    customList.appendChild(row);
  });
  addCode.disabled = addCustom.disabled = list.length >= 12;
  if (addBreathing) addBreathing.disabled = list.length >= 12;
  if (addPosture) addPosture.disabled = list.length >= 12;
}

function addCustomReminder(item) {
  (settings.custom || (settings.custom = [])).push({ enabled: true, mode: 'interval', time: '09:00', days: [1, 2, 3, 4, 5], ...item });
  renderCustom();
  document.querySelector('#customFold').open = true;
}
addCode.addEventListener('click', () => addCustomReminder({
  label: 'Code break', message: 'Code break! Save your work, stand up and rest your eyes.', minutes: 50, preset: 'code'
}));
addCustom.addEventListener('click', () => addCustomReminder({
  label: 'My reminder', message: 'Time for your reminder.', minutes: 60, preset: null
}));
if (addBreathing) addBreathing.addEventListener('click', () => addCustomReminder({
  label: 'Breathing', message: 'One minute of slow breathing?', minutes: 120, preset: 'breathing'
}));
if (addPosture) addPosture.addEventListener('click', () => addCustomReminder({
  label: 'Posture check', message: 'Quick posture check?', minutes: 90, preset: 'posture'
}));

function renderWater() {
  waterToday.textContent = `Water today: ${settings.hydrationToday || 0} / ${settings.hydrationGoal} glasses`;
  const m = settings.screenTodayMinutes || 0;
  screenToday.textContent = `Screen time today: ${m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`}`;
  renderHistory();
  renderDashboard();
}

function renderHistory() {
  const sum = settings.historySummary;
  if (!sum || !streakToday || !last7El) return;
  streakToday.textContent = sum.streak > 0
    ? `Water goal streak: ${sum.streak} day${sum.streak > 1 ? 's' : ''} · Breaks taken today: ${sum.today.breaksYes || 0} · Focus sessions: ${sum.today.focusSessions || 0}`
    : `Breaks taken today: ${sum.today.breaksYes || 0} · Focus sessions: ${sum.today.focusSessions || 0}`;
  last7El.innerHTML = '';
  for (const d of sum.last7) {
    const col = document.createElement('div');
    col.className = 'day';
    const bar = document.createElement('span');
    bar.className = `bar${d.goalMet ? ' met' : ''}`;
    const goal = settings.hydrationGoal || 8;
    bar.style.height = `${Math.max(8, Math.min(100, (d.water / goal) * 100))}%`;
    bar.title = `${d.date}: ${d.water} glasses`;
    const lab = document.createElement('small');
    lab.textContent = 'SMTWTFS'[new Date(`${d.date}T12:00:00`).getDay()];
    col.append(bar, lab);
    last7El.appendChild(col);
  }
}

function renderFocus() {
  if (!focusStatus) return;
  const f = settings.focus;
  if (f && f.active) {
    const left = Math.max(1, Math.round(f.remainingMs / 60000));
    focusStatus.textContent = `Focusing: ${left} min left. Reminders are held (meetings still come through).`;
  } else {
    focusStatus.textContent = 'Not focusing. While a focus session runs, reminders pause but meeting alerts still arrive.';
  }
  syncAmbient();
  renderDashboard();
}

function renderDashboard() {
  if (!dashboardStrip || !settings) return;
  const focus = settings.focus && settings.focus.active ? `${Math.max(1, Math.round(settings.focus.remainingMs / 60000))}m` : 'Ready';
  const water = `${settings.hydrationToday || 0} / ${settings.hydrationGoal || 8}`;
  const next = settings.calendar && settings.calendar.next;
  const meeting = next ? `${String(next.title || 'Meeting').slice(0, 17)}${next.start ? ` · ${fmtTime(next.start)}` : ''}` : 'None';
  dashboardFocus.textContent = focus;
  dashboardWater.textContent = water;
  dashboardMeeting.textContent = meeting;
  dashboardMood.textContent = `${interactionState.mood[0].toUpperCase()}${interactionState.mood.slice(1)}`;
  dashboardStrip.dataset.sleeping = settings.sleeping ? 'true' : 'false';
}

function applySkin() {
  const skin = (settings.appearance && settings.appearance.skin) || 'original';
  document.body.dataset.skin = skin;
  if (window.CompanionModel) model.set({ autoWink: !settings.appearance || settings.appearance.anim !== 'calm' });
}

/* ------------------------------- sounds ------------------------------- */
const sounds = () => window.CompanionSounds || null;
let previewKind = null;

function syncAmbient() {
  const snd = sounds();
  if (!snd || !settings) return;
  const cfg = settings.sound || {};
  const focusing = !!(settings.focus && settings.focus.active);
  const want = previewKind || (focusing && cfg.ambient && cfg.ambient !== 'off' ? cfg.ambient : null);
  if (want) snd.play(want, cfg.volume);
  else snd.stop();
}

function soundsChime() {
  const snd = sounds();
  if (snd && settings && settings.sound) snd.chime(settings.sound);
}

/* ----------------------------- walking ----------------------------- */
// The companion really walks: position is advanced here at a given px/s and
// the same speed drives the 3D gait phase, so steps match the distance covered.

/* The visible character is rendered by one of two engines behind this
 * facade: the classic dragon (model.js, custom WebGL) or a rigged avatar
 * (model3d.js, Three.js). renderer.js only ever talks to the facade. */
const legacyModel = window.CompanionModel || { set() {}, wink() {}, blink() {} };
let activeEngine = legacyModel;
const model = {
  set: (patch) => activeEngine.set(patch),
  wink: (...args) => { if (activeEngine.wink) activeEngine.wink(...args); },
  blink: () => { if (activeEngine.blink) activeEngine.blink(); },
  celebrate: () => { if (activeEngine.celebrate) activeEngine.celebrate(); else activeEngine.set({ mood: 'happy' }); },
  setProp: (name) => { if (activeEngine.setProp) activeEngine.setProp(name); }
};

const engines3d = {};
let avatarToken = 0;
async function applyAvatar() {
  const gl3d = document.querySelector('#gl3d');
  const legacyCanvas = document.querySelector('#companionModel');
  const avatar = (settings && settings.appearance && settings.appearance.avatar) || 'dragon';
  const token = ++avatarToken;
  if (avatar === 'dragon' || !window.CompanionModel3D || !gl3d) {
    if (activeEngine.setActive) activeEngine.setActive(false);
    activeEngine = legacyModel;
    if (legacyCanvas) legacyCanvas.hidden = false;
    if (gl3d) gl3d.hidden = true;
    return;
  }
  try {
    let eng = engines3d[avatar];
    if (!eng) eng = engines3d[avatar] = window.CompanionModel3D(gl3d, `./assets/${avatar}.glb`);
    await eng.ready;
    if (token !== avatarToken) return;
    if (activeEngine.setActive) activeEngine.setActive(false);
    activeEngine = eng;
    if (legacyCanvas) legacyCanvas.hidden = true;
    gl3d.hidden = false;
    eng.setActive(true);
    const mood = character.classList.contains('is-happy') ? 'happy' : character.classList.contains('is-sad') ? 'sad' : 'neutral';
    eng.set({ mood, walking: false, facing: 0 });
  } catch {
    if (token !== avatarToken) return;
    // Rigged avatar failed to load: fall back to the dragon, never a blank.
    if (activeEngine.setActive) activeEngine.setActive(false);
    activeEngine = legacyModel;
    if (legacyCanvas) legacyCanvas.hidden = false;
    if (gl3d) gl3d.hidden = true;
  }
}
const WALK_SPEED = 240;
const HAPPY_EXIT_SPEED = 320;
const SAD_EXIT_SPEED = 150;

let posX = -9999;
let sceneToken = 0;

const homeX = () => Math.round(window.innerWidth * ((settings && settings.appearance && settings.appearance.homePct) || 0.2));
const isOnScreen = () => posX > -120 && posX < window.innerWidth - 60;

function setX(x) {
  posX = x;
  character.style.transform = `translate3d(${x}px, 0, 0)`;
}

// Resolves true if still the current scene afterwards, false if superseded.
function pause(ms, token) {
  return new Promise((resolve) => {
    reminderSceneTimer = setTimeout(() => resolve(token === sceneToken), ms);
  });
}

function walkTo(target, { speed = WALK_SPEED, mood = 'neutral', settle = false, token }) {
  return new Promise((resolve) => {
    const dir = Math.sign(target - posX);
    if (!dir) {
      model.set({ walking: false, speed: 0 });
      resolve(true);
      return;
    }

    model.set({ walking: true, facing: dir, mood, speed });
    const startedAt = performance.now();
    let last = startedAt;

    function step(now) {
      if (token !== sceneToken) {
        resolve(false);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Short ramp-up from standing, and a slow-down on arrival if asked.
      const ramp = Math.min(1, 0.35 + ((now - startedAt) / 1000) * 1.6);
      const brake = settle ? Math.min(1, 0.3 + Math.abs(target - posX) / 140) : 1;
      const v = speed * ramp * brake;

      const next = posX + dir * v * dt;
      if ((dir > 0 && next >= target) || (dir < 0 && next <= target)) {
        setX(target);
        model.set({ walking: false, speed: 0 });
        resolve(true);
        return;
      }

      setX(next);
      model.set({ speed: v });
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

async function walkIn(token) {
  if (!isOnScreen()) setX(-200);
  setCharacterState('is-walking');
  const arrived = await walkTo(homeX(), { settle: true, token });
  if (!arrived) return false;
  setCharacterState('is-at-reminder');
  syncInteractionState({ isOnScreen: true });
  model.set({ facing: 0, mood: 'neutral' });
  return pause(500, token); // turn to face the user
}

async function walkOff(direction, { mood, speed, token }) {
  setCharacterState(mood === 'happy' ? 'is-happy' : 'is-sad', 'is-walking', direction > 0 ? 'is-exiting-right' : 'is-exiting-left');
  const target = direction > 0 ? window.innerWidth + 220 : -220;
  const gone = await walkTo(target, { speed, mood, token });
  if (!gone) return;
  model.set({ walking: false, speed: 0, mood: 'neutral', facing: 0 });
  setCharacterState('is-off-left');
  // Fully off screen: let go of the mouse and have the (screen-wide, transparent)
  // window hide itself so nothing invisible can sit over the desktop.
  setInteractive(false);
  syncInteractionState({ isOnScreen: false, panelOpen: false });
  window.companionApi.companionAway();
}

// Reminders the main process describes itself (custom reminders, meeting alerts,
// new-invite notices) arrive with a payload; built-in ones are looked up by key.
function definitionFromPayload(p) {
  return {
    kind: p.kind,
    label: p.label,
    message: p.message,
    yesReply: p.yesReply,
    laterReply: p.laterReply,
    guide: p.guide || null,
    yesLabel: p.yesLabel,
    laterLabel: p.laterLabel
  };
}

function setActionLabels(definition) {
  yesAction.textContent = definition.yesLabel || 'Yes';
  laterAction.textContent = definition.laterLabel || 'Remind me later';
  laterAction.hidden = definition.laterLabel === null; // e.g. invites only need "Got it"
}

async function triggerReminder(key, payload) {
  const definition = payload ? definitionFromPayload(payload) : reminderDefinitions[key];
  if (!definition) return;
  soundsChime();
  model.setProp(key === 'water' ? 'glass' : null);
  setActionLabels(definition);
  activeReminder = definition;
  syncInteractionState({ activeReminder: true });
  lastReminder = definition;
  clearTimeout(reminderSceneTimer);
  const token = ++sceneToken;
  bubbleActions.hidden = true;
  panel.classList.remove('open');
  model.set({ mood: 'neutral' });
  setBubble(isOnScreen() ? 'Hey...' : 'Coming in...');

  if (!(await walkIn(token))) return;
  setBubble(definition.message);
  bubbleActions.hidden = false;
}

// Tray "Show Companion": bring the companion back if it has wandered off.
async function summon() {
  if (activeReminder || isOnScreen()) return;
  const token = ++sceneToken;
  setBubble('Hi! I am here.');
  if (!(await walkIn(token))) return;
  model.wink('right'); // cheeky hello
  // Say hi, then head off again, unless the user clicked the companion (that
  // opens the panel and cancels this scene) or a reminder took over.
  if (!(await pause(4000, token))) return;
  if (panel.classList.contains('open')) return;
  leave('See you soon!');
}

let guided = false;
let skipGuide = false;

// Stay and count the break down in the bubble. Resolves 'done', 'skipped' or
// 'cancelled' (something else took over the scene).
async function runGuide(guide, token) {
  guided = true;
  syncInteractionState({ guided: true });
  skipGuide = false;
  breakProgress.hidden = false;
  skipBreak.hidden = false;
  breakBar.style.width = '0%';
  model.set({ mood: 'neutral', facing: 0 });
  setCharacterState('is-at-reminder');
  window.companionApi.holdReminders((guide.seconds + 10) * 1000);

  const started = performance.now();
  let result = 'done';
  let lastText = '';
  for (;;) {
    const elapsed = (performance.now() - started) / 1000;
    if (skipGuide) { result = 'skipped'; break; }
    if (elapsed >= guide.seconds) break;
    const step = [...guide.steps].reverse().find(([t]) => elapsed >= t) || guide.steps[0];
    const text = `${step[1]} (${Math.ceil(guide.seconds - elapsed)}s)`;
    if (text !== lastText) { setBubble(text); lastText = text; }
    breakBar.style.width = `${Math.min(100, (elapsed / guide.seconds) * 100)}%`;
    if (!(await pause(250, token))) { result = 'cancelled'; break; }
  }
  guided = false;
  syncInteractionState({ guided: false });
  breakProgress.hidden = true;
  skipBreak.hidden = true;
  return result;
}

skipBreak.addEventListener('click', (event) => {
  event.stopPropagation();
  skipGuide = true;
});

async function answerReminder(answer) {
  const reminder = activeReminder || lastReminder || {
    yesReply: 'Done. Good job.',
    laterReply: 'Okay, I will remind you later.'
  };

  bubbleActions.hidden = true;
  clearTimeout(reminderSceneTimer);
  const token = ++sceneToken;
  activeReminder = null;
  syncInteractionState({ activeReminder: false });
  const result = window.companionApi.answerReminder(answer);

  if (answer === 'yes') {
    setCharacterState('is-happy', 'is-at-reminder');
    model.set({ mood: 'happy', facing: 0 });
    let reply = reminder.yesReply || 'Done. Good job.';
    if (reminder === reminderDefinitions.hydration) {
      try {
        const next = await result;
        settings = next;
        renderWater();
        reply = `${reply} ${next.hydrationToday} of ${next.hydrationGoal} glasses today.`;
      } catch { /* keep default reply */ }
    }
    setBubble(reply);
    if (!(await pause(1300, token))) return;
    if (reminder.guide && settings.guidedBreaks !== false) {
      const outcome = await runGuide(reminder.guide, token);
      if (outcome === 'cancelled') return;
      model.set({ mood: 'happy', facing: 0 });
      if (outcome === 'done') {
        model.wink('right');
        setBubble(reminder.guide.done);
        if (!(await pause(1500, token))) return;
      }
    }
    await walkOff(1, { mood: 'happy', speed: HAPPY_EXIT_SPEED, token });
  } else {
    const sad = reminder.kind !== 'meeting'; // "In 1 min" is not a sad thing
    setCharacterState(sad ? 'is-sad' : 'is-at-reminder', 'is-at-reminder');
    model.set({ mood: sad ? 'sad' : 'neutral', facing: 0 });
    setBubble(reminder.laterReply || 'Okay, I will remind you later.');
    if (!(await pause(sad ? 1500 : 1000, token))) return;
    await walkOff(-1, { mood: sad ? 'sad' : 'neutral', speed: sad ? SAD_EXIT_SPEED : WALK_SPEED, token });
  }
}

// Main process gave up waiting (no answer): trudge off like "later".
async function dismissReminder() {
  if (!activeReminder) return;
  activeReminder = null;
  syncInteractionState({ activeReminder: false });
  bubbleActions.hidden = true;
  clearTimeout(reminderSceneTimer);
  const token = ++sceneToken;
  setBubble('Okay, I will ask again soon.');
  model.set({ mood: 'sad', facing: 0 });
  if (!(await pause(900, token))) return;
  await walkOff(-1, { mood: 'sad', speed: SAD_EXIT_SPEED, token });
}

function handleReminderAction(action, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const now = Date.now();
  if (now - lastActionAt < 250) return;

  lastActionAt = now;
  answerReminder(action);
}

// Stop wandering off (e.g. the user clicked the companion mid-exit).
function stay() {
  if (!isOnScreen()) return;
  sceneToken += 1;
  clearTimeout(reminderSceneTimer);
  model.set({ walking: false, speed: 0, mood: 'neutral', facing: 0 });
  setCharacterState('is-at-reminder');
  syncInteractionState({ isOnScreen: true });
}

// Say goodbye and walk off. Reminders still arrive; the companion walks back
// in when one fires. Does nothing while a reminder is waiting for an answer.
async function leave(message) {
  model.setProp(null);
  if (activeReminder || !isOnScreen()) return;
  clearTimeout(reminderSceneTimer);
  const token = ++sceneToken;
  bubbleActions.hidden = true;
  setCharacterState('is-happy', 'is-at-reminder');
  model.set({ mood: 'happy', facing: 0 });
  setBubble(message);
  if (!(await pause(1200, token))) return;
  await walkOff(1, { mood: 'happy', speed: HAPPY_EXIT_SPEED, token });
}

function refreshLive() {
  // Refresh the live numbers (water, screen time) without touching the form.
  window.companionApi.getSettings().then((fresh) => {
    settings.hydrationToday = fresh.hydrationToday;
    settings.screenTodayMinutes = fresh.screenTodayMinutes;
    settings.historySummary = fresh.historySummary;
    settings.focus = fresh.focus;
    renderWater();
    renderFocus();
    if (fresh.calendar && settings.calendar) {
      for (const k of ['hasUrl', 'links', 'lastSync', 'error', 'count', 'next']) settings.calendar[k] = fresh.calendar[k];
      renderCalendar();
    }
  }).catch(() => {});
}

function openPanel() {
  stay();
  panel.classList.add('open');
  syncInteractionState({ panelOpen: true });
  model.wink('right', 700); // acknowledge
  refreshLive();
}

/* ---- drag to move + playful clicks ----
   Drag the companion along the bottom of the screen; the spot is saved and
   becomes its home. A plain click still opens the panel (with a little
   wave-hop), and a double-click triggers a celebration. A drag suppresses
   the click that follows it. */
let dragState = null;
let justDragged = false;
let petTimer = null;
let petTriggered = false;

function clearPetTimer() {
  if (petTimer) clearTimeout(petTimer);
  petTimer = null;
}

function openQuickActions() {
  if (!quickActions || interactionState.guided) return;
  renderQuickActions();
  quickActions.hidden = false;
  setInteractive(true);
}

function closeQuickActions() {
  if (!quickActions) return;
  quickActions.hidden = true;
}

async function runQuickAction(actionId) {
  if (!interactionApi) return;
  const decision = interactionApi.decideInteraction(interactionState, { type: 'radial-action', actionId });
  syncInteractionState(decision.nextState);
  if (!decision.accepted) return;
  closeQuickActions();
  if (actionId === 'controls') {
    openPanel();
  } else if (actionId === 'focus') {
    settings = await window.companionApi.focusStart(25);
    renderSettings();
    setBubble('Focus mode is on. I will guard your time.');
  } else if (actionId === 'water') {
    settings = await window.companionApi.addWater();
    renderWater();
    setBubble(`Nice. ${settings.hydrationToday} of ${settings.hydrationGoal} glasses today.`);
  } else if (actionId === 'mood') {
    const mood = interactionState.mood;
    model.set({ mood, facing: 0 });
    setCharacterState(mood === 'neutral' ? 'is-at-reminder' : `is-${mood}`);
    setBubble(mood === 'happy' ? 'Feeling bright!' : mood === 'sad' ? 'A little sleepy today.' : 'Back to neutral.');
  } else if (actionId === 'celebrate') {
    await celebrate();
  } else if (actionId === 'sleep') {
    settings = await window.companionApi.setSleepMode(true);
    setBubble('Sleep mode on. Press Ctrl+Alt+C when you want me back.');
  }
}

if (quickActions) {
  quickActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    runQuickAction(button.dataset.quickAction).catch(() => setBubble('That action did not work.'));
  });
}

if (dashboardStrip) {
  dashboardStrip.addEventListener('click', (event) => {
    const button = event.target.closest('[data-dashboard-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.dashboardAction;
    if (action === 'focus') runQuickAction('focus');
    else if (action === 'water') runQuickAction('water');
    else if (action === 'meetings') {
      document.querySelector('#meetingsFold').open = true;
      setBubble('Here are your upcoming meetings.');
    } else if (action === 'mood') runQuickAction('mood');
  });
}

characterBody.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (quickActions && quickActions.hidden) openQuickActions();
  else closeQuickActions();
});

characterBody.addEventListener('pointerdown', (event) => {
  dragState = { x: event.clientX, pos: posX, moved: false };
  petTriggered = false;
  clearPetTimer();
  petTimer = setTimeout(() => {
    if (!dragState || dragState.moved || activeReminder || guided) return;
    petTriggered = true;
    model.wink('right', 700);
    syncInteractionState({ mood: 'happy', justDragged: true });
    setBubble('That tickles!');
  }, 700);
  try { characterBody.setPointerCapture(event.pointerId); } catch { /* older WebView */ }
});
characterBody.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const dx = event.clientX - dragState.x;
  if (!dragState.moved && Math.abs(dx) > 7) {
    clearPetTimer();
    dragState.moved = true;
    sceneToken += 1;
    clearTimeout(reminderSceneTimer);
    panel.classList.remove('open');
    syncInteractionState({ panelOpen: false, justDragged: true });
    model.set({ walking: false, speed: 0, mood: 'neutral' });
    setCharacterState('is-at-reminder');
  }
  if (dragState.moved) {
    setX(Math.min(window.innerWidth - 150, Math.max(-70, dragState.pos + dx)));
  }
});
function finishPointer() {
  clearPetTimer();
  if (dragState && dragState.moved) {
    justDragged = true;
    const pct = Math.round((posX / window.innerWidth) * 1000) / 1000;
    if (settings) settings.appearance = { ...(settings.appearance || {}), homePct: pct };
    window.companionApi.setHome(pct);
    setBubble('This is my spot now.');
  } else if (petTriggered) {
    justDragged = true;
  }
  syncInteractionState({ justDragged });
  dragState = null;
}
characterBody.addEventListener('pointerup', finishPointer);
characterBody.addEventListener('pointercancel', finishPointer);

function waveHop() {
  if (activeReminder) return;
  syncInteractionState({ mood: 'happy' });
  model.set({ mood: 'happy' });
  setTimeout(() => { if (!activeReminder) { syncInteractionState({ mood: 'neutral' }); model.set({ mood: 'neutral' }); } }, 650);
}

async function celebrate() {
  if (guided || activeReminder) return;
  panel.classList.remove('open');
  syncInteractionState({ panelOpen: false, mood: 'happy' });
  const token = ++sceneToken;
  clearTimeout(reminderSceneTimer);
  setCharacterState('is-happy', 'is-at-reminder');
  model.set({ mood: 'happy', facing: 0 });
  model.celebrate();
  model.wink('right', 900);
  setBubble('Yay! Good to see you.');
  if (!(await pause(1700, token))) return;
  model.set({ mood: 'neutral' });
  setBubble('Ready when you are.');
}
characterBody.addEventListener('dblclick', () => {
  if (!interactionApi) return celebrate();
  const decision = interactionApi.decideInteraction(interactionState, { type: 'double-click' });
  syncInteractionState(decision.nextState);
  if (decision.accepted) celebrate();
});

characterBody.addEventListener('click', () => {
  if (!interactionApi) {
    if (guided) return;
    if (justDragged) { justDragged = false; return; }
    if (panel.classList.contains('open')) { panel.classList.remove('open'); leave('See you later!'); }
    else { waveHop(); openPanel(); }
    return;
  }
  const decision = interactionApi.decideInteraction(interactionState, { type: 'click' });
  syncInteractionState(decision.nextState);
  if (!decision.accepted) { justDragged = false; return; }
  if (decision.effects.includes('wave')) waveHop();
  if (decision.effects.includes('open-panel')) openPanel();
  if (decision.effects.includes('close-panel')) panel.classList.remove('open');
  if (decision.effects.includes('leave')) leave('See you later!');
});

// Global shortcut (Ctrl+Alt+C): call the companion and toggle its panel.
async function togglePanel() {
  if (guided) return;
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    leave('See you later!');
    return;
  }
  if (!isOnScreen()) {
    const token = ++sceneToken;
    setBubble('Hi! You called?');
    if (!(await walkIn(token))) return;
  }
  openPanel();
}

// Use one event path for reminder actions. Multiple pointer/mouse/click
// handlers caused the same action to be processed more than once and made
// the transparent Electron window feel unreliable during animated scenes.
function onReminderActionClick(event) {
  const action = event.currentTarget.dataset.reminderAction;
  handleReminderAction(action, event);
}

yesAction.addEventListener('click', onReminderActionClick);
laterAction.addEventListener('click', onReminderActionClick);

snoozeInput.addEventListener('input', () => {
  settings.snoozeMinutes = Number(snoozeInput.value);
});

goalInput.addEventListener('input', () => {
  settings.hydrationGoal = Number(goalInput.value);
});
quietEnabled.addEventListener('change', () => {
  settings.quietHours.enabled = quietEnabled.checked;
});
quietStart.addEventListener('change', () => {
  if (quietStart.value) settings.quietHours.start = quietStart.value;
});
quietEnd.addEventListener('change', () => {
  if (quietEnd.value) settings.quietHours.end = quietEnd.value;
});

guidedInput.addEventListener('change', () => {
  settings.guidedBreaks = guidedInput.checked;
});

loginInput.addEventListener('change', () => {
  settings.openAtLogin = loginInput.checked;
});

if (briefingInput) briefingInput.addEventListener('change', () => { settings.morningBriefing = briefingInput.checked; });
if (chimeToggle) chimeToggle.addEventListener('change', () => { settings.sound = { ...(settings.sound || {}), chime: chimeToggle.checked }; });
if (volumeRange) volumeRange.addEventListener('input', () => {
  settings.sound = { ...(settings.sound || {}), volume: Number(volumeRange.value) / 100 };
  const snd = sounds();
  if (snd) snd.setVolume(settings.sound.volume);
});
if (ambientSelect) ambientSelect.addEventListener('change', () => {
  settings.sound = { ...(settings.sound || {}), ambient: ambientSelect.value };
  previewKind = null;
  syncAmbient();
});
if (testSoundBtn) testSoundBtn.addEventListener('click', () => {
  const kind = (settings.sound && settings.sound.ambient) || 'off';
  if (previewKind) { previewKind = null; testSoundBtn.textContent = 'Test sound'; }
  else if (kind !== 'off') { previewKind = kind; testSoundBtn.textContent = 'Stop sound'; }
  syncAmbient();
});
if (birthdayInput) birthdayInput.addEventListener('change', () => {
  settings.profile = { ...(settings.profile || {}), birthday: birthdayInput.value.trim() };
});
if (fullscreenToggle) fullscreenToggle.addEventListener('change', () => { settings.respectFullscreen = fullscreenToggle.checked; });
if (animSelect) animSelect.addEventListener('change', () => {
  settings.appearance = { ...(settings.appearance || {}), anim: animSelect.value };
  applySkin();
});
if (devInput) devInput.addEventListener('change', () => { settings.devAlerts = devInput.checked; });
if (skinSelect) skinSelect.addEventListener('change', () => {
  settings.appearance = { ...(settings.appearance || {}), skin: skinSelect.value };
  applySkin();
});

if (avatarSelect) avatarSelect.addEventListener('change', () => {
  settings.appearance = { ...(settings.appearance || {}), avatar: avatarSelect.value };
  applyAvatar();
});

if (characterSwitch) characterSwitch.addEventListener('click', () => {
  if (!characterPicker) return;
  characterPicker.hidden = !characterPicker.hidden;
  characterSwitch.setAttribute('aria-expanded', String(!characterPicker.hidden));
});
if (characterPicker) characterPicker.addEventListener('click', (event) => {
  const button = event.target.closest('[data-character-id]');
  if (!button) return;
  chooseCharacter(button.dataset.characterId).catch(() => setBubble('I could not switch characters.'));
});

document.querySelectorAll('[data-focus-start]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const mins = btn.dataset.focusStart === 'custom' ? Number(focusMinutes.value) || 25 : Number(btn.dataset.focusStart);
    settings = await window.companionApi.focusStart(mins);
    renderSettings();
  });
});
const focusStopBtn = document.querySelector('#focusStop');
if (focusStopBtn) focusStopBtn.addEventListener('click', async () => {
  settings = await window.companionApi.focusStop();
  renderSettings();
});

const onboardDone = document.querySelector('#onboardDone');
if (onboardDone) onboardDone.addEventListener('click', async () => {
  settings.onboarded = true;
  settings = await window.companionApi.setSettings(settings);
  renderSettings();
  setBubble('All set. I will take it from here.');
});

// Panel open/close drives the window height in the main process: small
// (character only) while closed, full height while the panel is open.
new MutationObserver(() => {
  const open = panel.classList.contains('open');
  syncInteractionState({ panelOpen: open });
  window.companionApi.setPanelOpen(open);
}).observe(panel, { attributes: true, attributeFilter: ['class'] });

// Battery: Chromium's Battery API lives in the renderer; the main process
// owns the "low battery" alert and its 4-hour cooldown.
if (navigator.getBattery) {
  navigator.getBattery().then((battery) => {
    let reported = false;
    const check = () => {
      if (battery.charging || battery.level > 0.25) { reported = false; return; }
      if (!reported && battery.level <= 0.2) {
        reported = true;
        window.companionApi.batteryLow(Math.round(battery.level * 100));
      }
    };
    battery.addEventListener('levelchange', check);
    battery.addEventListener('chargingchange', check);
    check();
  }).catch(() => {});
}

saveSettings.addEventListener('click', async () => {
  settings = await window.companionApi.setSettings(settings);
  renderSettings();
  panel.classList.remove('open');
  leave('Saved. I have the new rhythm.');
});

testNotification.addEventListener('click', () => {
  window.companionApi.testReminder();
});

document.querySelector('#quitApp').addEventListener('click', () => {
  window.companionApi.quitApp();
});

if (exportDataBtn) exportDataBtn.addEventListener('click', async () => {
  dataStatus.textContent = 'Choose where to save your export...';
  const result = await window.companionApi.exportData();
  dataStatus.textContent = result.ok ? `Exported to ${result.filePath}` : (result.canceled ? 'Export canceled.' : (result.error || 'Export failed.'));
});
if (openDiagnosticsBtn) openDiagnosticsBtn.addEventListener('click', async () => {
  const result = await window.companionApi.openDiagnostics();
  dataStatus.textContent = result.ok ? 'Opened the local logs folder.' : (result.error || 'Could not open logs folder.');
});
if (clearDataBtn) clearDataBtn.addEventListener('click', async () => {
  if (!window.confirm('Delete settings, history, calendar connections, and focus data from this PC? This cannot be undone.')) return;
  settings = await window.companionApi.clearData();
  renderSettings();
  dataStatus.textContent = 'Local data deleted. Setup has been reset.';
});

// The x only closes the panel. Reminders keep running either way.
hideWindow.addEventListener('click', () => {
  panel.classList.remove('open');
  leave('See you later!');
});

/* ---- click-through: the window is transparent and spans the screen, so
   only capture the mouse while it is over something interactive. ---- */
let interactive = false;
function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  window.companionApi.setInteractive(next);
}

let mouseMoveQueued = false;
let lastMouseEvent = null;
document.addEventListener('mousemove', (event) => {
  lastMouseEvent = event;
  if (mouseMoveQueued) return;
  mouseMoveQueued = true;
  requestAnimationFrame(() => {
    mouseMoveQueued = false;
    if (!lastMouseEvent) return;
    const el = document.elementFromPoint(lastMouseEvent.clientX, lastMouseEvent.clientY);
    setInteractive(!!(el && el.closest('#characterBody, #bubble, #panel, #quickActions, #dashboardStrip')));
    if (!guided && !activeReminder && interactionState.isOnScreen && characterBody) {
      const rect = characterBody.getBoundingClientRect();
      const look = lastMouseEvent.clientX < rect.left + rect.width * 0.38 ? -1
        : lastMouseEvent.clientX > rect.left + rect.width * 0.62 ? 1 : 0;
      model.set({ facing: look });
    }
  });
});
document.addEventListener('pointerdown', (event) => {
  if (quickActions && !quickActions.hidden && !event.target.closest('#quickActions, #characterBody')) closeQuickActions();
});
document.addEventListener('mouseleave', () => setInteractive(false));

window.companionApi.onReminder(triggerReminder);
window.companionApi.onSummon(summon);
window.companionApi.onTogglePanel(togglePanel);
window.companionApi.onDismiss(dismissReminder);
window.companionApi.onSettingsChanged((next) => {
  settings = next;
  renderSettings();
});

window.addEventListener('DOMContentLoaded', async () => {
  settings = await window.companionApi.getSettings();
  renderSettings();
  setX(-200);
  setCharacterState('is-off-left');
  summon(); // walk in on launch
  if (settings.onboarded === false) openPanel(); // first run: 60-second setup
});
