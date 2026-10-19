'use strict';
// Tiny rotating file logger (no dependencies). Writes one line per entry to
// <dir>/companion.log, rotating to companion.log.1 at ~1 MB. Logging must
// never break the app: every failure is swallowed and falls back to console.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 1024 * 1024;

function createLogger(dir) {
  let file = null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'companion.log');
  } catch {
    file = null;
  }
  function write(level, args) {
    const line = `${new Date().toISOString()} [${level}] ${args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
    }).join(' ')}`;
    try {
      if (file) {
        try {
          if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
        } catch { /* first write */ }
        fs.appendFileSync(file, `${line}\n`);
      }
    } catch { /* never let logging crash the app */ }
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
  }
  return {
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
    file: () => file
  };
}

module.exports = { createLogger };
