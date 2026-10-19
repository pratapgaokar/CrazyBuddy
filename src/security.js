'use strict';

// Keep renderer navigation and external link decisions pure and small so they
// can be tested without starting Electron. Meeting links are the only external
// URLs the companion is expected to open.
const MEETING_HOSTS = new Set([
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com',
  'zoom.us',
  'webex.com'
]);

function isAllowedMeetingUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return false;
  let url;
  try { url = new URL(input.trim()); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;

  const host = url.hostname.toLowerCase();
  const hostAllowed = MEETING_HOSTS.has(host)
    || host.endsWith('.zoom.us')
    || host.endsWith('.webex.com');
  if (!hostAllowed) return false;

  if (host === 'meet.google.com') return /^\/[a-z0-9-]+$/i.test(url.pathname);
  if (host === 'teams.microsoft.com') return /^\/(?:l\/meetup-join|meet)\//i.test(url.pathname);
  if (host === 'teams.live.com') return /^\/meet\//i.test(url.pathname);
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return /^\/[jw]\//i.test(url.pathname);
  return host === 'webex.com' || host.endsWith('.webex.com');
}

function isAllowedNavigation(input, expectedFile) {
  if (typeof input !== 'string' || typeof expectedFile !== 'string') return false;
  try {
    const url = new URL(input);
    if (url.protocol !== 'file:') return false;
    const { fileURLToPath } = require('node:url');
    return fileURLToPath(url) === expectedFile;
  } catch {
    return false;
  }
}

module.exports = { isAllowedMeetingUrl, isAllowedNavigation };
