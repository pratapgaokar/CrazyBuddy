const { contextBridge, ipcRenderer } = require('electron');

// Subscribe helper that returns an unsubscribe function.
function on(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('companionApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  companionAway: () => ipcRenderer.invoke('companion:away'),
  testMeeting: () => ipcRenderer.invoke('meeting:test'),
  setPanelOpen: (open) => ipcRenderer.invoke('window:set-panel', !!open),
  focusStart: (minutes) => ipcRenderer.invoke('focus:start', Number(minutes) || 25),
  focusStop: () => ipcRenderer.invoke('focus:stop'),
  batteryLow: (percent) => ipcRenderer.invoke('battery:low', Number(percent) || 0),
  setHome: (pct) => ipcRenderer.invoke('appearance:home', Number(pct) || 0),
  calendarSetUrl: (url) => ipcRenderer.invoke('calendar:set-url', String(url || '')),
  calendarClear: () => ipcRenderer.invoke('calendar:clear'),
  calendarSync: () => ipcRenderer.invoke('calendar:sync'),
  holdReminders: (ms) => ipcRenderer.invoke('reminders:hold', Number(ms) || 0),
  onTogglePanel: (callback) => on('companion:toggle-panel', callback),
  setInteractive: (interactive) => ipcRenderer.invoke('window:set-interactive', !!interactive),
  answerReminder: (answer) => ipcRenderer.invoke('reminder:answer', answer),
  testReminder: () => ipcRenderer.invoke('reminder:test'),
  onReminder: (callback) => on('reminder:fire', callback),
  onDismiss: (callback) => on('reminder:dismiss', callback),
  onSummon: (callback) => on('companion:summon', callback),
  onSettingsChanged: (callback) => on('settings:changed', callback)
});
