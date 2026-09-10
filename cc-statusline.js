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
const BRIGHT_BLUE  = '\x1b[94m';
const PURPLE       = '\x1b[38;5;171m';
const CAVEMAN      = '\x1b[38;5;172m';
const UPDATE       = '\x1b[38;5;214m';

// Context threshold colours: green to 15%, orange 16-19%, red above
function ctxColor(pct) {
  if (pct >= 20) return '\x1b[91m';
  if (pct >= 16) return '\x1b[38;5;214m';
  return '\x1b[92m';
}

// Usage threshold colours (for filled bar + percentage)
function usageColor(pct) {
  if (pct >= 90) return '\x1b[91m';
  if (pct >= 70) return '\x1b[93m';
  return '\x1b[92m';
}

function createBar(pct, length = 10) {
  const eighths = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const total = Math.round((pct / 100) * length * 8);
  const full = Math.floor(total / 8);
  const rem = total % 8;
  const partial = rem > 0 ? eighths[rem] : '';
  const empty = length - full - (partial ? 1 : 0);
  return { filled: '█'.repeat(full) + partial, empty: '░'.repeat(empty) };
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

  const ctx = d.context_window;
  if (ctx) {
    const pct = Math.round(ctx.used_percentage || 0);
    parts.push(`${LABEL}Ctx: ${RESET}${ctxColor(pct)}${pct}%${RESET}`);
  }

  const rl = d.rate_limits;
  if (rl) {
    for (const [label, window, includeDay] of [['5h', rl.five_hour, false], ['Wk', rl.seven_day, true]]) {
      if (!window) continue;
      const pct   = Math.round(window.used_percentage || 0);
      const color = usageColor(pct);
      const { filled, empty } = createBar(pct);
      const time  = formatResetTime(window.resets_at, includeDay);
      parts.push(`${LABEL}${label}: ${RESET}${color}${filled}${DARK_GREY}${empty}${RESET} ${color}${pct}%${RESET} ${TIME}(${time})${RESET}`);
    }
  }
  if (parts.length) line2 = parts.join(` ${DIM}|${RESET} `);

  // Caveman badge
  let cavemanBadge = '';
  try {
    const flagFile = `${process.env.HOME}/.claude/.caveman-active`;
    if (fs.existsSync(flagFile)) {
      const mode = fs.readFileSync(flagFile, 'utf8').trim();
      const suffix = (!mode || mode === 'full') ? '' : `:${mode.toUpperCase()}`;
      cavemanBadge = `${BRIGHT_BLUE}[CAVEMAN${suffix}]${RESET}`;
    }
  } catch {}

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
  if (cavemanBadge) parts3.push(cavemanBadge);
  if (parts3.length) line3 = parts3.join(` ${DIM}|${RESET} `);

  [line1, line2, line3].filter(Boolean).forEach(l => console.log(l));
});
