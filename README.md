# ui-aesthetics-mcp

> **Open-source** MCP server that delegates frontend UI tasks to **Gemini** (via Antigravity CLI / `agy`), giving any AI coding agent a professional design sense — completely free, no API key required.

Works with: **Claude Code · Codex · Cursor · VS Code · Windsurf · Antigravity IDE · any MCP client**

---

## Why?

Gemini is exceptional at visual/aesthetic reasoning for frontend code. Other AI agents (Claude, Codex, etc.) are better at logic and architecture. This MCP lets you combine them:

```
You / Claude Code / Codex
        ↓  (MCP call)
ui-aesthetics-mcp server
        ↓  (spawns CLI)
Antigravity CLI (agy) → Gemini 3.5 Flash
        ↓
Aesthetically improved code written back to your file
```

Everything goes through **official Google CLI** — no reverse engineering, no unofficial APIs, 100% above board.

---

## Prerequisites

Install Antigravity CLI (Google's official successor to Gemini CLI):

```bash
# macOS / Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Windows (PowerShell)
irm https://antigravity.google/cli/install.ps1 | iex
```

Authenticate once:
```bash
agy  # follow the Google login prompt
```

That's it. Free tier is very generous.

---

## Installation

### Via npx (no install needed)

```bash
# Claude Code
claude mcp add ui-aesthetics-mcp -- npx -y ui-aesthetics-mcp

# Codex
codex mcp add -- npx -y ui-aesthetics-mcp
```

### Manual (claude_mcp_config.json / mcp_config.json)

```json
{
  "mcpServers": {
    "ui-aesthetics-mcp": {
      "command": "npx",
      "args": ["-y", "ui-aesthetics-mcp"],
      "env": {
        "GEMINI_MODEL": "gemini-3.5-flash"
      }
    }
  }
}
```

### Config file locations

| Tool | Config file |
|------|------------|
| Claude Code | `~/.claude/claude_desktop_config.json` or via `claude mcp add` |
| Codex | `~/.codex/config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Antigravity IDE | `~/.gemini/config/mcp_config.json` |
| Antigravity CLI | `~/.gemini/config/mcp_config.json` |
| VS Code | `.vscode/mcp.json` |

---

## Claude Code Skill (Manager + Designer Pattern)

This repo ships a **Claude Code skill** that orchestrates the MCP server as a "Claude Code = manager, Gemini = frontend designer" workflow:

```bash
# Install skill globally (one-time)
ln -s $(pwd)/.claude/skills/ui-aesthetic-improve \
  ~/.claude/skills/ui-aesthetic-improve
```

The skill automatically:
1. **Analyzes** your component (separates visual vs logic)
2. **Calls** `analyze_ui` → gets Gemini's design score
3. **Negotiates** with Gemini if score is low
4. **Creates a worktree** for safe isolation
5. **Reviews the diff** — ensures no logic was broken
6. **Shows you the changes** before merging

See `.claude/skills/ui-aesthetic-improve/SKILL.md` for the full protocol.

---

## Tools

### `improve_ui`
Sends your frontend code to Gemini for a full aesthetic overhaul. Preserves all logic.

```
Fixes: spacing (8px grid), typography hierarchy, color contrast,
       hover states, responsive layout, accessibility (ARIA/focus)
```

**Parameters:**
- `code` *(required)* — your HTML/CSS/JSX/Vue/Svelte code
- `style_direction` — `modern-minimal` | `neo-brutalist` | `glassmorphism` | `dark-premium` | `soft-ui` | `corporate-clean`
- `framework` — `html-css` | `react-jsx` | `react-tsx` | `vue` | `svelte` | `tailwind`
- `file_path` — absolute path to file (uses Gemini's `@` syntax for direct file reading)

**Usage in Claude Code:**
```
use improve_ui on my src/components/Header.tsx with style "dark-premium"
```

---

### `analyze_ui`
Returns a structured JSON design review with score and actionable fixes.

```json
{
  "score": 62,
  "issues": [
    { "severity": "critical", "area": "spacing", "description": "...", "fix": "..." },
    { "severity": "major", "area": "color", "description": "...", "fix": "..." }
  ],
  "highlights": ["Good font choice", "Clean component structure"],
  "summary": "Functional but needs visual polish in spacing and color hierarchy."
}
```

---

### `create_component`
Creates a brand-new component or page from a text description.

```
"a pricing table with 3 tiers, monthly/annual toggle, and a highlighted recommended plan"
"a dashboard sidebar with navigation, user avatar, and collapse button"
"a file upload dropzone with drag-and-drop and progress indicator"
```

Pass `design_system_context` (your CSS variables) to keep it consistent with your existing project.

---

### `generate_design_tokens`
Generates a complete CSS variable system `:root {}` block for your project.

Covers: colors (with dark mode), spacing scale, typography, border-radius, shadows, transitions, z-index.

---

### `ask_gemini_design`
Free-form — ask Gemini anything about UI/UX/design. Include file paths for context.

---

### `visual_diff`
Generate a side-by-side HTML visual diff report comparing before/after UI code.

---

## Slash Commands (Antigravity / Gemini CLI)

```bash
/design-review file:/path/to/Component.tsx   # analyze + improve in one shot
/design-principles                            # show the built-in design system prompt
```

---

## Architecture

```
┌──────────────┐     MCP call      ┌──────────────────┐
│  Claude Code │ ────────────────► │  ui-aesthetics-   │
│  (Manager)   │                   │  mcp server       │
└──────────────┘                   └────────┬─────────┘
                                            │ spawnSync
                                            ▼
                                   ┌──────────────────┐
                                   │  agy (Antigravity│
                                   │       CLI)       │
                                   └────────┬─────────┘
                                            │ Google OAuth
                                            ▼
                                   ┌──────────────────┐
                                   │  Gemini 3.5 Flash  │
                                   │  (Frontend Design) │
                                   └──────────────────┘
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_MODEL` | `gemini-3.5-flash` | Model to use |
| `AGY_PATH` | auto-detected | Path to `agy` binary |
| `GEMINI_PATH` | auto-detected | Path to `gemini` binary (fallback) |
| `TIMEOUT_MINUTES` | `5` | Max time per Gemini call |

---

## Contributing

PRs welcome! Especially:
- More style directions
- Better built-in prompts
- Framework-specific improvements (Next.js App Router, Nuxt, SvelteKit)
- Screenshot/visual diff tool integration

---

## License

MIT — free forever, no strings attached.
