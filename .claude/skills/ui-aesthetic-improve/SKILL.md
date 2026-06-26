---
name: ui-aesthetic-improve
description: "Claude Code as manager + agy (Gemini) as frontend designer. Use when the user asks to beautify, improve styling, redesign a UI component, or make any visual change. Claude Code analyzes the file, constrains the scope, calls the ui-aesthetics-mcp tools through worktree isolation, reviews the diff, and only merges after user approval."
---

# UI Aesthetic Improve Skill

**Roles:**
- **Claude Code (Sonnet)** = Project Manager — understands the codebase, protects logic, constructs precise prompts
- **agy / Gemini 3.5 Flash** = Frontend Designer — handles visual improvements only

**Golden Rule:** Never write styling directly. Always delegate to `ui-aesthetics-mcp`.

## Trigger

Activate when the user asks about:
- "美化", "improve the UI", "make this look better", "redesign", "fix the styling"
- Any visual change to HTML, CSS, JSX, Vue, Svelte components
- Design token generation, color scheme changes, spacing fixes

## Workflow

### Step 1: Analyze the Target File

Read the file. Categorize every section as:
- **VISUAL** — classNames, style attributes, CSS imports, layout structure
- **PROTECTED** — event handlers, state management, API calls, imports/exports, TypeScript types, business logic

Output a brief analysis:
```
File: <path>
Visual parts: className="...", style="...", layout structure
Protected parts: onClick handlers, useState/useEffect, API calls, imports
Safe scope: only change className, style, layout — never touch handlers or state
```

### Step 2: Pre-Analysis with `analyze_ui`

Call the `analyze_ui` MCP tool with the file content.
- Pass `framework` appropriately: `react-tsx`, `react-jsx`, `vue`, `svelte`, `html-css`, `tailwind`
- This gives a score (0-100) and a list of specific issues

### Step 3: Negotiation Loop (if needed)

If the score is below 70, or issues are critical:
1. Construct a precise prompt for `improve_ui` that tells agy:
   - EXACTLY what to change (e.g., "fix the padding on .card-header from 3px to 16px")
   - EXACTLY what NOT to touch (e.g., "do not modify the onClick handler or useState declarations")
2. Call `improve_ui` MCP tool
3. Review the returned code — if something looks wrong, iterate:
   - "The hover animation on the button feels too aggressive, make it subtler"
   - "Keep the same layout but fix the color contrast on the primary button"
4. Repeat until the result is acceptable

### Step 4: Worktree Isolation

Before applying any changes:

```bash
WORKTREE_BRANCH="ui-aesthetic-$(date +%s)"
git worktree add ".claude/worktrees/$WORKTREE_BRANCH" HEAD
```

If no git repo exists, skip worktree and warn the user.

### Step 5: Apply Changes in Worktree

1. Write the improved code into the worktree path
2. Run `review-diff.sh` to validate no logic was broken
3. If review fails → reject and report which lines are problematic
4. If review passes → show diff to user

### Step 6: Show Diff & Get Approval

Display the diff summary:
```
✅ Changes in <file>:
   +12 lines added (styles, spacing, hover states)
   -8 lines removed (old inline styles, hardcoded values)
   ⚠️  No logic changes detected

Changes applied in worktree: ui-aesthetic-<timestamp>
Ready to merge? (yes/no)
```

Wait for user confirmation before merging.

### Step 7: Merge & Cleanup

On user approval:

```bash
git checkout main  # or current branch
git merge --no-ff "ui-aesthetic-$(date +%s)" -m "chore: improve UI aesthetics via Gemini"
git worktree remove ".claude/worktrees/ui-aesthetic-<timestamp>"
git branch -D "ui-aesthetic-<timestamp>"
```

## Safety Rules (see references/safety-rules.md for details)

When constructing the prompt for agy, ALWAYS include:
```
PROTECTED ZONE — DO NOT MODIFY:
- Any event handlers (onClick, onSubmit, onChange, onKeyDown, etc.)
- Any state management (useState, useEffect, useContext, reducers)
- Any imports/exports
- Any TypeScript interfaces/types
- Any API calls or data fetching
- Any conditional rendering logic
- Any component props interface

ONLY MODIFY:
- className attributes
- style attributes (inline or extracted to CSS)
- Layout structure (divs, spans, flex/grid containers)
- Visual text content (copy, headings, labels)
- Color, spacing, typography, shadows, borders
- Hover/focus/active states
- Responsive breakpoints
```

## Framework Detection

Auto-detect framework from file extension:
- `.tsx` → `react-tsx`
- `.jsx` → `react-jsx`
- `.vue` → `vue`
- `.svelte` → `svelte`
- `.css` / `.scss` / `.less` → `html-css`
- `.html` → `html-css`

## Style Direction

Default: `modern-minimal`
Override when user specifies a style:
- "neo-brutalist" → `neo-brutalist`
- "glassmorphism" → `glassmorphism`
- "dark/premium" or "dark mode" → `dark-premium`
- "soft/neumorphic" → `soft-ui`
- "corporate/professional" → `corporate-clean`

## Visual Diff (Optional)

After improvements, call `visual_diff` MCP tool to generate a side-by-side report:
```
1. Save original code as <file>.before.html (or extract relevant portion)
2. Call visual_diff(before=<original>, after=<improved>)
3. Open the generated report in browser for comparison
```

## Error Handling

- If agy returns empty/error → report to user, do NOT apply changes
- If diff review detects logic changes → reject, explain which lines are problematic
- If git worktree fails (not a git repo) → apply directly but warn the user
- If user declines merge → discard worktree, keep original file unchanged
