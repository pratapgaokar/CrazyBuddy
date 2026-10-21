'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const interaction = require('../src/renderer/interaction');

const base = { ...interaction.DEFAULT_STATE };

test('interaction helper exports stable radial actions', () => {
  assert.deepEqual(Object.keys(interaction).sort(), ['DEFAULT_STATE', 'MOODS', 'RADIAL_ACTIONS', 'cycleMood', 'decideInteraction', 'getRadialActions'].sort());
  assert.equal(new Set(interaction.RADIAL_ACTIONS.map((a) => a.id)).size, 6);
  assert.equal(new Set(interaction.RADIAL_ACTIONS.map((a) => a.angleDeg)).size, 6);
});

test('cycleMood wraps forward, backward, and invalid values safely', () => {
  assert.equal(interaction.cycleMood('neutral'), 'happy');
  assert.equal(interaction.cycleMood('happy'), 'sad');
  assert.equal(interaction.cycleMood('sad'), 'neutral');
  assert.equal(interaction.cycleMood('neutral', -1), 'sad');
  assert.equal(interaction.cycleMood('unknown'), 'neutral');
});

test('radial action availability reflects guided breaks and reminders', () => {
  assert.ok(interaction.getRadialActions(base).every((action) => action.enabled));
  assert.ok(interaction.getRadialActions({ ...base, guided: true }).every((action) => !action.enabled && action.disabledReason === 'guided'));
  const active = interaction.getRadialActions({ ...base, activeReminder: true });
  assert.equal(active.find((a) => a.id === 'controls').enabled, true);
  assert.ok(active.filter((a) => a.id !== 'controls').every((a) => !a.enabled && a.disabledReason === 'activeReminder'));
});

test('click and double-click decisions preserve input state', () => {
  const state = { ...base };
  const opened = interaction.decideInteraction(state, { type: 'click' });
  assert.deepEqual(opened.effects, ['wave', 'open-panel']);
  assert.equal(opened.nextState.panelOpen, true);
  assert.equal(state.panelOpen, false);
  const celebrated = interaction.decideInteraction({ ...base, panelOpen: true }, { type: 'double-click' });
  assert.deepEqual(celebrated.effects, ['close-panel', 'celebrate']);
  assert.equal(celebrated.nextState.mood, 'happy');
});

test('drag and guided states block normal clicks', () => {
  const dragged = interaction.decideInteraction({ ...base, justDragged: true }, { type: 'click' });
  assert.equal(dragged.accepted, false);
  assert.equal(dragged.reason, 'drag-suppressed');
  assert.equal(dragged.nextState.justDragged, false);
  const guided = interaction.decideInteraction({ ...base, guided: true }, { type: 'click' });
  assert.equal(guided.accepted, false);
  assert.equal(guided.reason, 'guided-break');
});

test('toggle summons off-screen and radial actions produce deterministic effects', () => {
  const toggled = interaction.decideInteraction({ ...base, isOnScreen: false }, { type: 'toggle-panel' });
  assert.deepEqual(toggled.effects, ['summon', 'open-panel']);
  const mood = interaction.decideInteraction(base, { type: 'radial-action', actionId: 'mood' });
  assert.deepEqual(mood.effects, ['set-mood']);
  assert.equal(mood.nextState.mood, 'happy');
  const sleep = interaction.decideInteraction(base, { type: 'radial-action', actionId: 'sleep' });
  assert.deepEqual(sleep.effects, ['close-panel', 'sleep']);
  const unknown = interaction.decideInteraction(base, { type: 'radial-action', actionId: 'nope' });
  assert.equal(unknown.reason, 'unknown-action');
});
