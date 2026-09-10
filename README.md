# cc-statusline

A Claude Code statusline script displaying subscription usage, context window, git info, and [caveman mode](https://github.com/JuliusBrussee/caveman) status.

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

**Requires:** Node.js, Claude Code v2.1.80+, Claude Pro/Max subscription.

## Output

```
~/Dev/my-project | ⎇ main (+0,-0)
Ctx: 25% | 5h: ░░░░░░░░░░ 0% (4pm) | Wk: █▋░░░░░░░░ 16% (Tue 12pm)
v2.1.80 | Sonnet 4.6 | [CAVEMAN]
```

Line 3 shows `[CAVEMAN]` only when [caveman mode](https://github.com/JuliusBrussee/caveman) is active. Supports `[CAVEMAN:LITE]` and `[CAVEMAN:ULTRA]` variants.
