# cc-statusline

A Claude Code statusline script displaying subscription usage, context window, and git info.

## Setup

Point `statusLine.command` in `~/.claude/settings.json` at the script:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline.js"
  }
}
```

Make it executable:

```bash
chmod +x cc-statusline.js
```

## Options

Pass flags after the script path in `statusLine.command`:

```json
"command": "/path/to/cc-statusline.js --ctx-warn=40 --ctx-crit=60 --ctx-ok-color=#5fd75f"
```

| Flag | Default | Description |
| --- | --- | --- |
| `--ctx-ok-color` | bright green | Ctx colour below the warn threshold |
| `--ctx-warn-color` | `214` (orange) | Ctx colour from warn up to crit |
| `--ctx-crit-color` | bright red | Ctx colour at or above crit |
| `--ctx-warn` | `26` | Percentage where the warn colour starts |
| `--ctx-crit` | `30` | Percentage where the crit colour starts |
| `--usage-warn` | `90` | Projected 5h/Wk use (%) where yellow starts |
| `--usage-crit` | `120` | Projected 5h/Wk use (%) where red starts |
| `--5h-reset` | `duration` | 5h reset as time remaining (`duration`, e.g. `in 2h 15m`) or clock time (`time`, e.g. `4pm`) |

Colours accept a 256-colour index (`0`–`255`) or hex (`#rrggbb`, needs a truecolour terminal). Invalid values fall back to the default.

**Requires:** Node.js, Claude Code v2.1.80+, Claude Pro/Max subscription.

## Output

```
~/Dev/my-project | ⎇ main (+0,-0)
Ctx: 25% | 5h: ━━─│────── 20% (in 2h 15m) | Wk: ━╸──│───── 16% (Tue 12pm)
v2.1.80 | Sonnet 4.6
```

The 5h and Wk bars show how much of the limit you've used. The `│` marker shows how far through the window you are: if the fill goes past it, you're using the limit faster than the window allows.

The colour follows pace, not the amount used. It projects your use at reset if the current rate continues: green below `--usage-warn`, yellow from there, red from `--usage-crit`. Usage of 80% or more is always at least yellow, and 95% or more is always red. For the first 10% of each window, only those two floors apply.
