'use strict';
// Worker thread for ICS parsing, so a large calendar (60-day horizon,
// thousands of recurrences) never stalls the main process / tray / window.
// Protocol: in { id, text, fromMs, toMs } -> out { id, events } or { id, error }.
const { parentPort } = require('node:worker_threads');
const calendar = require('./calendar');

parentPort.on('message', ({ id, text, fromMs, toMs }) => {
  try {
    const events = calendar.parseEvents(text, fromMs, toMs);
    parentPort.postMessage({ id, events });
  } catch (err) {
    parentPort.postMessage({ id, error: err && err.message ? err.message : 'Calendar parse failed' });
  }
});
