#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

const RESET        = '\x1b[0m';
const DIM          = '\x1b[2m';
const GREEN        = '\x1b[38;5;34m';
const DARK_YELLOW  = '\x1b[38;5;136m';
const GIT_GREEN    = '\x1b[38;5;28m';
const GIT_RED      = '\x1b[38;5;203m';
const CYAN         = '\x1b[36m';
const TEAL         = '\x1b[38;5;30m';
const BRIGHT_WHITE = '\x1b[97m';
const YELLOW       = '\x1b[33m';
const DARK_GREY    = '\x1b[90m';
const BRIGHT_BLUE  = '\x1b[94m';

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

function formatTokens(n) {
  if (n == null || isNaN(n)) return '--';
  return parseFloat((n / 1000).toFixed(1)) + 'k';
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

  // Line 2: 5hr | Wk rate limits
  let line2 = '';
  const rl = d.rate_limits;
  if (rl) {
    const parts = [];
    for (const [label, window, includeDay] of [['5hr', rl.five_hour, false], ['Wk', rl.seven_day, true]]) {
      if (!window) continue;
      const pct   = Math.round(window.used_percentage || 0);
      const color = usageColor(pct);
      const { filled, empty } = createBar(pct);
      const time  = formatResetTime(window.resets_at, includeDay);
      parts.push(`${BRIGHT_WHITE}${label}: ${color}${filled}${DARK_GREY}${empty}${RESET} ${color}${pct}%${RESET} ${BRIGHT_WHITE}(${time})${RESET}`);
    }
    line2 = parts.join(` ${DIM}|${RESET} `);
  }

  // Line 3: Context usage as progress bar
  let line3 = '';
  const ctx = d.context_window;
  if (ctx) {
    const pct    = Math.round(ctx.used_percentage || 0);
    const { filled, empty } = createBar(pct);
    const cu     = ctx.current_usage;
    const inTok  = cu ? formatTokens(cu.input_tokens) : '--';
    const outTok = cu ? formatTokens(cu.output_tokens) : '--';
    line3 = `${TEAL}Ctx: ${filled}${DARK_GREY}${empty}${RESET} ${TEAL}${pct}% (In: ${inTok} | Out: ${outTok})${RESET}`;
  }

  // Line 4: version | model
  let line4 = '';
  const parts4 = [];
  if (version) parts4.push(`${DIM}v${version}${RESET}`);
  if (model)   parts4.push(`${BRIGHT_BLUE}${model}${RESET}`);
  if (parts4.length) line4 = parts4.join(` ${DIM}|${RESET} `);

  [line1, line2, line3, line4].filter(Boolean).forEach(l => console.log(l));
});
