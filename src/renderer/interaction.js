(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompanionInteraction = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MOODS = Object.freeze(['neutral', 'happy', 'sad']);
  const RADIAL_ACTIONS = Object.freeze([
    { id: 'controls', label: 'Controls', icon: 'settings', angleDeg: 0, intent: 'open-panel', blockedWhen: ['guided'] },
    { id: 'focus', label: 'Focus 25m', icon: 'focus', angleDeg: 60, intent: 'start-focus', blockedWhen: ['guided', 'activeReminder'] },
    { id: 'water', label: 'Add water', icon: 'water', angleDeg: 120, intent: 'add-water', blockedWhen: ['guided', 'activeReminder'] },
    { id: 'mood', label: 'Change mood', icon: 'mood', angleDeg: 180, intent: 'cycle-mood', blockedWhen: ['guided', 'activeReminder'] },
    { id: 'celebrate', label: 'Celebrate', icon: 'sparkles', angleDeg: 240, intent: 'celebrate', blockedWhen: ['guided', 'activeReminder'] },
    { id: 'sleep', label: 'Sleep mode', icon: 'moon', angleDeg: 300, intent: 'sleep', blockedWhen: ['guided', 'activeReminder'] }
  ]);
  const DEFAULT_STATE = Object.freeze({
    mood: 'neutral',
    panelOpen: false,
    isOnScreen: true,
    activeReminder: false,
    guided: false,
    justDragged: false
  });

  function safeMood(mood) { return MOODS.includes(mood) ? mood : 'neutral'; }
  function cycleMood(mood, step = 1) {
    if (!MOODS.includes(mood)) return 'neutral';
    const index = MOODS.indexOf(mood);
    const amount = Number.isFinite(Number(step)) ? Math.trunc(Number(step)) : 1;
    return MOODS[(index + amount + MOODS.length * 10) % MOODS.length];
  }

  function getRadialActions(state = {}) {
    const current = { ...DEFAULT_STATE, ...(state || {}) };
    return RADIAL_ACTIONS.map((action) => {
      let disabledReason = null;
      if (current.guided) disabledReason = 'guided';
      else if (current.activeReminder && action.id !== 'controls') disabledReason = 'activeReminder';
      return { ...action, enabled: !disabledReason, disabledReason };
    });
  }

  function result(state, accepted, reason, effects, nextState) {
    return { accepted, reason: reason || null, effects: [...effects], nextState: { ...state, ...nextState } };
  }

  function decideInteraction(inputState = {}, intent = {}) {
    const state = { ...DEFAULT_STATE, ...(inputState || {}) };
    const type = intent && intent.type;
    if (type === 'click') {
      if (state.guided) return result(state, false, 'guided-break', [], {});
      if (state.justDragged) return result(state, false, 'drag-suppressed', [], { justDragged: false });
      return state.panelOpen
        ? result(state, true, null, ['close-panel', 'leave'], { panelOpen: false })
        : result(state, true, null, ['wave', 'open-panel'], { panelOpen: true });
    }
    if (type === 'double-click') {
      if (state.guided) return result(state, false, 'guided-break', [], {});
      if (state.activeReminder) return result(state, false, 'active-reminder', [], {});
      return result(state, true, null, ['close-panel', 'celebrate'], { panelOpen: false, mood: 'happy' });
    }
    if (type === 'toggle-panel') {
      if (state.guided) return result(state, false, 'guided-break', [], {});
      if (state.panelOpen) return result(state, true, null, ['close-panel', 'leave'], { panelOpen: false });
      return state.isOnScreen
        ? result(state, true, null, ['open-panel'], { panelOpen: true })
        : result(state, true, null, ['summon', 'open-panel'], { panelOpen: true });
    }
    if (type === 'radial-action') {
      const action = RADIAL_ACTIONS.find((item) => item.id === intent.actionId);
      if (!action) return result(state, false, 'unknown-action', [], {});
      const enabled = getRadialActions(state).find((item) => item.id === action.id).enabled;
      if (!enabled) return result(state, false, state.guided ? 'guided-break' : 'active-reminder', [], {});
      if (action.intent === 'open-panel') return result(state, true, null, ['open-panel'], { panelOpen: true });
      if (action.intent === 'cycle-mood') return result(state, true, null, ['set-mood'], { mood: cycleMood(state.mood) });
      if (action.intent === 'celebrate') return result(state, true, null, ['close-panel', 'celebrate'], { panelOpen: false, mood: 'happy' });
      if (action.intent === 'sleep') return result(state, true, null, ['close-panel', 'sleep'], { panelOpen: false, isOnScreen: false });
      if (action.intent === 'start-focus') return result(state, true, null, ['start-focus'], {});
      if (action.intent === 'add-water') return result(state, true, null, ['add-water'], {});
    }
    return result(state, false, 'unknown-intent', [], {});
  }

  return { MOODS, RADIAL_ACTIONS, DEFAULT_STATE, cycleMood, getRadialActions, decideInteraction };
});
