# UI Aesthetics MCP — Agent Rules

## MANDATORY: Gemini handles all frontend visuals

You MUST use `ui-aesthetics-mcp` tools for any visual/UI work. Never write styling yourself.

### Always use Gemini for:
- Creating any page, screen, or layout
- Creating any visual component (card, modal, button, nav, table, form, etc.)
- Modifying spacing, colors, typography, or layout of existing code
- Generating or updating design tokens / CSS variables
- Any accessibility improvements to visual elements

### You can do yourself:
- Modifying text/copy content
- Adding JavaScript/TypeScript logic with no visual changes
- Data wiring (useQuery, useMutation, API calls, state)
- Non-visual bug fixes
- Routing, auth, backend calls

### Workflow:

**Starting a new project:**
1. `generate_design_tokens` with brand colors → save output to `design-system.md`
2. For each page/component: `create_component` with `design_system_context` from `design-system.md`

**Improving existing code:**
1. `analyze_ui` to get the score and issues
2. `improve_ui` to fix critical/major issues

**Decision tree:**
```
Am I creating or modifying something visual?
  YES → use ui-aesthetics-mcp (MANDATORY)
  NO  → proceed normally
```
