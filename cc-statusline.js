#!/usr/bin/env node
'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const RESET        = '\x1b[0m';
const DIM          = '\x1b[2m';
const GREEN        = '\x1b[38;5;34m';
const DARK_YELLOW  = '\x1b[38;5;136m';
const GIT_GREEN    = '\x1b[38;5;28m';
const GIT_RED      = '\x1b[38;5;203m';
const CYAN         = '\x1b[36m';
const LABEL        = '\x1b[38;5;245m';
const TIME         = '\x1b[38;5;240m';
const YELLOW       = '\x1b[33m';
const DARK_GREY    = '\x1b[90m';
const PURPLE       = '\x1b[38;5;171m';
const UPDATE       = '\x1b[38;5;214m';
const MARKER       = '\x1b[97m';

// CLI flags: --name=value
const args = Object.fromEntries(
  process.argv.slice(2)
    .map(a => a.match(/^--([^=]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v])
);

// Colour flag value: 256-colour index (0-255) or hex (#rrggbb)
function parseColor(value, fallback) {
  if (/^\d{1,3}$/.test(value || '') && Number(value) <= 255) return `\x1b[38;5;${value}m`;
  const hex = (value || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return `\x1b[38;2;${hex.slice(1).map(h => parseInt(h, 16)).join(';')}m`;
  return fallback;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : fallback;
}

const CTX_OK    = parseColor(args['ctx-ok-color'],   '\x1b[92m');
const CTX_WARN  = parseColor(args['ctx-warn-color'], '\x1b[38;5;214m');
const CTX_CRIT  = parseColor(args['ctx-crit-color'], '\x1b[91m');
const CTX_WARN_AT = parseNumber(args['ctx-warn'], 26);
const CTX_CRIT_AT = parseNumber(args['ctx-crit'], 30);
const FIVE_HOUR_RESET = args['5h-reset'] === 'time' ? 'time' : 'duration';
const USAGE_WARN_AT = parseNumber(args['usage-warn'], 90);
const USAGE_CRIT_AT = parseNumber(args['usage-crit'], 120);

// Context threshold colours: green below warn, orange below crit, red above
function ctxColor(pct) {
  if (pct >= CTX_CRIT_AT) return CTX_CRIT;
  if (pct >= CTX_WARN_AT) return CTX_WARN;
  return CTX_OK;
}

// Fraction of the rate-limit window that has passed (0-1), or null without a reset time
function elapsedFraction(resetsAt, windowSecs) {
  if (!resetsAt) return null;
  const left = resetsAt - Date.now() / 1000;
  return Math.min(Math.max(1 - left / windowSecs, 0), 1);
}

// Usage colours by pace: projected use at reset if the current rate continues.
// Absolute floors catch a nearly full window. Pace is ignored in the first 10%
// of the window, where the projection swings too much to mean anything.
function usageColor(pct, elapsed) {
  const projected = elapsed >= 0.1 ? pct / elapsed : 0;
  if (pct >= 95 || projected >= USAGE_CRIT_AT) return '\x1b[91m';
  if (pct >= 80 || projected >= USAGE_WARN_AT) return '\x1b[93m';
  return '\x1b[92m';
}

// Bar with an optional pace marker on the cell where even-rate usage would end,
// drawn over the fill so it stays visible when usage is ahead of pace
function createBar(pct, color, elapsed = null, length = 10) {
  pct = Math.min(Math.max(pct, 0), 100);
  const halves = Math.round((pct / 100) * length * 2);
  const full = Math.floor(halves / 2);
  const cells = [];
  for (let i = 0; i < length; i++) {
    if (i < full) cells.push(`${color}━`);
    else if (i === full && halves % 2) cells.push(`${color}╸`);
    else cells.push(`${DARK_GREY}─`);
  }
  if (elapsed != null) {
    const i = Math.min(Math.max(Math.round(elapsed * length) - 1, 0), length - 1);
    cells[i] = `${MARKER}│`;
  }
  return cells.join('') + RESET;
}

function formatResetTime(unixSecs, includeDay = false) {
  if (!unixSecs) return '--';
  const reset = new Date(unixSecs * 1000);
  if (reset <= new Date()) return 'soon';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayStr = includeDay ? `${days[reset.getDay()]} ` : '';
  let h = reset.getHours();
  const mins = reset.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const mStr = mins > 0 ? `:${mins.toString().padStart(2, '0')}` : '';
  return `${dayStr}${h}${mStr}${period}`;
}

function formatTimeLeft(unixSecs) {
  if (!unixSecs) return '--';
  const mins = Math.ceil((unixSecs * 1000 - Date.now()) / 60000);
  if (mins <= 0) return 'soon';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

function isNewer(current, candidate) {
  const p = v => v.replace(/[^0-9.]/g, '').split('.').map(Number);
  const [a1, a2, a3] = p(current), [b1, b2, b3] = p(candidate);
  return b1 > a1 || (b1 === a1 && b2 > a2) || (b1 === a1 && b2 === a2 && b3 > a3);
}

let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  let d;
  try { d = JSON.parse(raw); } catch { process.exit(0); }

  // >>> Reign statusline v1 >>>
  // Reign: pass Claude Code's context window to Reign. Does nothing outside a
  // Reign pane. Follows REIGN_MODE so a dev build's panes report to dev Reign
  // (Reign's own snippet is release-only, ~/.reign).
  if (process.env.REIGN_PANE_ID) {
    const reignDir = `${process.env.HOME}/.reign${process.env.REIGN_MODE === 'dev' ? '-dev' : ''}`;
    const reign = spawn(`${reignDir}/hooks/notify`, ['--statusline'], {
      detached: true, stdio: ['pipe', 'ignore', 'ignore'],
    });
    reign.on('error', () => {});
    reign.stdin.on('error', () => {});
    reign.stdin.end(raw);
    reign.unref();
  }
  // <<< Reign statusline <<<

  const cwd     = d.workspace?.current_dir || d.cwd || '';
  const version = d.version || '';
  const model   = d.model?.display_name || '';

  // Line 1: path | ⎇ branch | (+N,-N)
  const home = process.env.HOME || '';
  const displayCwd = home ? cwd.replace(home, '~') : cwd;
  let line1 = `${GREEN}${displayCwd}${RESET}`;
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd });
    const branch = execSync('git branch --show-current', { encoding: 'utf8', cwd }).trim();
    const stat = execSync('git diff HEAD --shortstat', { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'ignore'] });
    const added   = (stat.match(/(\d+) insertion/)  || [, '0'])[1];
    const removed = (stat.match(/(\d+) deletion/)   || [, '0'])[1];
    line1 += ` ${DIM}|${RESET} ${DARK_YELLOW}⎇ ${branch} (${GIT_GREEN}+${added}${DARK_YELLOW},${GIT_RED}-${removed}${DARK_YELLOW})${RESET}`;
  } catch {}

  // Line 2: Ctx % | 5h | Wk rate limits
  let line2 = '';
  const parts = [];

  // Always show Ctx, 5h and Wk; use '--' when Claude Code hasn't sent the value yet
  const ctxPct = d.context_window?.used_percentage;
  if (ctxPct == null) {
    parts.push(`${LABEL}Ctx: ${RESET}${DARK_GREY}--${RESET}`);
  } else {
    const pct = Math.round(ctxPct);
    parts.push(`${LABEL}Ctx: ${RESET}${ctxColor(pct)}${pct}%${RESET}`);
  }

  const rl = d.rate_limits || {};
  const windows = [['5h', rl.five_hour, false, 5 * 3600], ['Wk', rl.seven_day, true, 7 * 86400]];
  for (const [label, window, includeDay, windowSecs] of windows) {
    const time = label === '5h' && FIVE_HOUR_RESET === 'duration'
      ? formatTimeLeft(window?.resets_at)
      : formatResetTime(window?.resets_at, includeDay);
    if (window?.used_percentage == null) {
      parts.push(`${LABEL}${label}: ${RESET}${createBar(0, DARK_GREY)} ${DARK_GREY}--${RESET} ${TIME}(${time})${RESET}`);
      continue;
    }
    const pct     = Math.round(window.used_percentage);
    const elapsed = elapsedFraction(window.resets_at, windowSecs);
    const color   = usageColor(pct, elapsed);
    parts.push(`${LABEL}${label}: ${RESET}${createBar(pct, color, elapsed)} ${color}${pct}%${RESET} ${TIME}(${time})${RESET}`);
  }
  line2 = parts.join(` ${DIM}|${RESET} `);

  // Update badge: check npm registry for newer Claude Code version (cached, 4hr TTL)
  let updateBadge = '';
  try {
    const cachePath = `${process.env.HOME}/.claude/.cc-version-cache`;
    const TTL = 4 * 60 * 60 * 1000;
    let cached = null;
    try { cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}

    if (!cached || Date.now() - cached.checkedAt > TTL) {
      const child = spawn(process.execPath, ['-e', `
        const https = require('https');
        const fs = require('fs');
        https.get('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => {
            try {
              const v = JSON.parse(d).version;
              const tmp = ${JSON.stringify(cachePath + '.tmp')};
              fs.writeFileSync(tmp, JSON.stringify({ latest: v, checkedAt: Date.now() }));
              fs.renameSync(tmp, ${JSON.stringify(cachePath)});
            } catch {}
          });
        }).on('error', () => {});
      `], { detached: true, stdio: 'ignore' });
      child.unref();
    }

    if (cached?.latest && version && isNewer(version, cached.latest)) {
      updateBadge = `${UPDATE}↑ v${cached.latest}${RESET}`;
    }
  } catch {}

  // Line 3: version | model
  let line3 = '';
  const parts3 = [];
  if (version) {
    const upStr = updateBadge ? ` ${UPDATE}(↑ UPDATE AVAILABLE)${RESET}` : '';
    parts3.push(`${DIM}v${version}${RESET}${upStr}`);
  }
  if (model)        parts3.push(`${PURPLE}${model}${RESET}`);
  if (parts3.length) line3 = parts3.join(` ${DIM}|${RESET} `);

  [line1, line2, line3].filter(Boolean).forEach(l => console.log(l));
});
