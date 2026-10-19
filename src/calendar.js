'use strict';
// Calendar helpers for meeting alerts. Pure functions (no Electron), so they can
// be tested on their own. Works on a calendar's private ICS link:
//   Google Calendar: Settings > your calendar > "Secret address in iCal format"
//   Outlook / Teams: Settings > Calendar > Shared calendars > Publish a calendar > ICS link
const ICAL = require('ical.js');

// Only these meeting hosts are ever extracted, and only https links. Calendar
// text is written by whoever sent the invite, so nothing else is ever opened.
const LINK_PATTERNS = [
  /https:\/\/meet\.google\.com\/[a-z0-9-]+(?:\?[^\s"'<>)]*)?/i,
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>)]+/i,
  /https:\/\/teams\.microsoft\.com\/meet\/[^\s"'<>)]+/i,
  /https:\/\/teams\.live\.com\/meet\/[^\s"'<>)]+/i,
  /https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/[jw]\/[^\s"'<>)]+/i,
  /https:\/\/(?:[a-z0-9-]+\.)?webex\.com\/[^\s"'<>)]+/i
];

const MAX_ICS_BYTES = 8 * 1024 * 1024;
const MAX_OCCURRENCES_PER_EVENT = 5000;

// Accepts https:// or webcal:// links. Returns a clean https URL or null.
function normalizeUrl(input) {
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (!text || text.length > 2048) return null;
  text = text.replace(/^webcal:\/\//i, 'https://');
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function findLink(text) {
  if (!text) return null;
  for (const pattern of LINK_PATTERNS) {
    const match = String(text).match(pattern);
    if (match) return match[0].replace(/[.,;>\]]+$/, '');
  }
  return null;
}

// Look in the places calendars put the join link, most reliable first.
function extractJoinUrl(vevent) {
  const props = ['x-google-conference', 'x-microsoft-skypeteamsmeetingurl', 'location', 'url', 'description'];
  for (const name of props) {
    const link = findLink(vevent.getFirstPropertyValue(name));
    if (link) return link;
  }
  return null;
}

// Returns meetings that overlap [fromMs, toMs], recurring events expanded.
// [{ id, uid, title, start, end, url }]  (start/end are epoch ms)
function parseEvents(icsText, fromMs, toMs) {
  if (typeof icsText !== 'string' || icsText.length > MAX_ICS_BYTES) throw new Error('Calendar file is empty or too large');
  if (!/BEGIN:VCALENDAR/i.test(icsText)) throw new Error('That link did not return a calendar (ICS) file');

  ICAL.TimezoneService.reset();
  const root = new ICAL.Component(ICAL.parse(icsText));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* ignore a bad zone */ }
  }

  const groups = new Map();
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (!event.uid) continue;
    if (!groups.has(event.uid)) groups.set(event.uid, []);
    groups.get(event.uid).push(event);
  }

  const out = [];
  const add = (event, startTime, endTime) => {
    if (!startTime || startTime.isDate) return; // all-day: no "starts in 5 minutes"
    const vevent = event.component;
    if (String(vevent.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    const start = startTime.toJSDate().getTime();
    const end = (endTime || startTime).toJSDate().getTime();
    if (start > toMs || end < fromMs) return;
    out.push({
      id: `${event.uid}|${start}`,
      uid: event.uid,
      title: String(event.summary || '(no title)').slice(0, 80),
      start,
      end: Math.max(end, start),
      url: extractJoinUrl(vevent)
    });
  };

  for (const events of groups.values()) {
    const master = events.find((e) => !e.isRecurrenceException());
    const exceptions = events.filter((e) => e.isRecurrenceException());
    if (!master) { exceptions.forEach((e) => add(e, e.startDate, e.endDate)); continue; }

    if (!master.isRecurring()) { add(master, master.startDate, master.endDate); continue; }

    exceptions.forEach((e) => { try { master.relateException(e); } catch { /* ignore */ } });
    const it = master.iterator();
    let next;
    let count = 0;
    while ((next = it.next()) && count++ < MAX_OCCURRENCES_PER_EVENT) {
      if (next.toJSDate().getTime() > toMs) break;
      const details = master.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate);
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

// Download a calendar. Never logs or echoes the URL (it is a private link).
async function fetchIcs(url, { timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  const clean = normalizeUrl(url);
  if (!clean) throw new Error('Calendar link must start with https:// or webcal://');
  const response = await fetchImpl(clean, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Calendar link returned ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_ICS_BYTES) throw new Error('Calendar file is too large');
  return response.text();
}

module.exports = { normalizeUrl, findLink, extractJoinUrl, parseEvents, fetchIcs, MAX_ICS_BYTES };
