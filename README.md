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
5hr: ░░░░░░░░░░ 0% (4pm) | Wk: █▋░░░░░░░░ 16% (Tue 12pm)
Ctx: ██░░░░░░░░ 25% (In: 49.1k | Out: 13.1k)
v2.1.80 | Sonnet 4.6 | [CAVEMAN]
```

Line 4 shows `[CAVEMAN]` only when [caveman mode](https://github.com/JuliusBrussee/caveman) is active. Supports `[CAVEMAN:LITE]` and `[CAVEMAN:ULTRA]` variants.
