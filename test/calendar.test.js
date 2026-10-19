'use strict';
const test = require('node:test');
const assert = require('node:assert');
const calendar = require('../src/calendar');

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:once-1',
  'DTSTART:20261016T100000Z',
  'DTEND:20261016T103000Z',
  'SUMMARY:Team sync',
  'LOCATION:https://meet.google.com/abc-defg-hij',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:daily-1',
  'DTSTART:20261014T040000Z',
  'DTEND:20261014T041500Z',
  'RRULE:FREQ=DAILY;COUNT=5',
  'SUMMARY:Standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled-1',
  'DTSTART:20261016T120000Z',
  'DTEND:20261016T123000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Should not appear',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday-1',
  'DTSTART;VALUE=DATE:20261016',
  'DTEND;VALUE=DATE:20261017',
  'SUMMARY:All day thing',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const FROM = Date.UTC(2026, 9, 16, 0, 0, 0);
const TO = Date.UTC(2026, 9, 17, 0, 0, 0);

test('parseEvents: single event with join link', () => {
  const events = calendar.parseEvents(ICS, FROM, TO);
  const sync = events.find((e) => e.uid === 'once-1');
  assert.ok(sync, 'one-off event present');
  assert.strictEqual(sync.title, 'Team sync');
  assert.strictEqual(sync.url, 'https://meet.google.com/abc-defg-hij');
});

test('parseEvents: recurring events are expanded into the window', () => {
  const events = calendar.parseEvents(ICS, FROM, TO);
  assert.ok(events.some((e) => e.uid === 'daily-1'), 'daily standup occurrence on Oct 16 present');
});

test('parseEvents: cancelled and all-day events are skipped', () => {
  const events = calendar.parseEvents(ICS, FROM, TO);
  assert.ok(!events.some((e) => e.uid === 'cancelled-1'));
  assert.ok(!events.some((e) => e.uid === 'allday-1'));
});

test('findLink only accepts whitelisted meeting hosts', () => {
  assert.strictEqual(calendar.findLink('join https://evil.example.com/meet now'), null);
  assert.ok(calendar.findLink('https://teams.microsoft.com/l/meetup-join/abc123'));
  assert.ok(calendar.findLink('https://acme.zoom.us/j/123456789'));
  assert.strictEqual(calendar.findLink('http://meet.google.com/abc-defg-hij'), null); // https only
});

test('normalizeUrl accepts webcal and https only', () => {
  assert.ok(calendar.normalizeUrl('webcal://example.com/cal.ics').startsWith('https://'));
  assert.strictEqual(calendar.normalizeUrl('http://example.com/cal.ics'), null);
  assert.strictEqual(calendar.normalizeUrl('not a url'), null);
  assert.strictEqual(calendar.normalizeUrl(''), null);
});

test('parseEvents rejects non-ICS and oversize input', () => {
  assert.throws(() => calendar.parseEvents('<html>nope</html>', FROM, TO));
});
