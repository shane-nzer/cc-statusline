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

Colours accept a 256-colour index (`0`–`255`) or hex (`#rrggbb`, needs a truecolour terminal). Invalid values fall back to the default.

**Requires:** Node.js, Claude Code v2.1.80+, Claude Pro/Max subscription.

## Output

```
~/Dev/my-project | ⎇ main (+0,-0)
Ctx: 25% | 5h: ░░░░░░░░░░ 0% (4pm) | Wk: █▋░░░░░░░░ 16% (Tue 12pm)
v2.1.80 | Sonnet 4.6
```
