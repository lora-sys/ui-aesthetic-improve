#!/usr/bin/env node
/**
 * ui-aesthetics-mcp
 * Open-source MCP server — routes UI/frontend tasks to Gemini (via Antigravity CLI / agy)
 * and returns production-ready, aesthetically polished code.
 *
 * Works with: Claude Code · Codex · Cursor · VS Code · any MCP-compatible agent
 * License: MIT
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnSync, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateDiffReport } from "./visual-diff.js";

// ─── Resolve backend CLI (agy > gemini fallback) ────────────────────────────
function resolveCLI(): { bin: string; isAgy: boolean } {
  // Ensure HOME is set — GUI-launched processes may have it empty/incorrect,
  // which breaks agy's auth token file resolution (~/.gemini/antigravity-cli/)
  if (!process.env.HOME) {
    try {
      process.env.HOME = execSync("eval echo ~$(whoami)", { encoding: "utf-8" }).trim();
    } catch {
      // If whoami fails, try os.homedir() as last resort
      process.env.HOME = os.homedir() || "/tmp";
    }
  }

  const customPath = process.env.AGY_PATH || process.env.GEMINI_PATH;
  if (customPath && fs.existsSync(customPath)) {
    const isAgy = customPath.includes("agy");
    return { bin: customPath, isAgy };
  }
  try { execSync("agy --version", { stdio: "ignore" }); return { bin: "agy", isAgy: true }; } catch {}
  try { execSync("gemini --version", { stdio: "ignore" }); return { bin: "gemini", isAgy: false }; } catch {}
  throw new Error(
    "Neither `agy` (Antigravity CLI) nor `gemini` CLI found.\n" +
    "Install Antigravity CLI: curl -fsSL https://antigravity.google/cli/install.sh | bash"
  );
}

const CLI = resolveCLI();
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MINUTES || "5") * 60_000;

// ─── Prompt library (built-in professional prompts) ──────────────────────────
const PROMPTS = {
  system: `You are a world-class UI/UX designer and frontend engineer.
Your aesthetic references: Linear, Vercel, Stripe, Raycast, Arc Browser.
Design principles you always follow:
  • 8px base grid — all spacing is a multiple of 4 or 8
  • Typography hierarchy: clear visual weight difference between heading / body / caption
  • Color: max 3 accent colors, careful contrast ratios (WCAG AA minimum)
  • Whitespace is a design element — use it generously
  • Micro-interactions: subtle hover states, smooth transitions (150-250ms ease)
  • Mobile-first responsive design with sensible breakpoints
  • Semantic HTML, accessible ARIA labels where needed
  • Prefer CSS custom properties for theming

You output ONLY code. No prose explanation unless asked.
When modifying existing code, preserve all logic/data-wiring — only touch visuals.`,

  analyze: `Analyze the following frontend code as a senior designer reviewing a PR.
Return a JSON object with this exact structure:
{
  "score": <0-100>,
  "issues": [{ "severity": "critical|major|minor", "area": "spacing|color|typography|layout|accessibility|animation", "description": "...", "fix": "..." }],
  "highlights": ["things done well"],
  "summary": "one-sentence overall verdict"
}`,

  improve: `Improve the aesthetic quality of the following frontend code.
Apply all design principles. Return ONLY the improved code, no explanation.
Changes to make:
  1. Fix spacing inconsistencies (enforce 8px grid)
  2. Improve color usage and contrast
  3. Enhance typography hierarchy
  4. Add subtle hover/focus states
  5. Ensure responsive behavior
  6. Improve accessibility (aria, focus rings)`,

  create: `Create a new frontend component/page with premium aesthetics.
Requirements:
  • Production-ready, no placeholder content
  • Fully responsive (mobile-first)
  • Smooth micro-interactions
  • Accessible (keyboard nav, ARIA)
  • Clean, maintainable code structure
  • Use CSS variables for all colors/spacing so it's themeable`,

  theme: `Generate a complete design token / CSS variable system for this project.
Output a single :root {} block with variables for:
  colors: primary, secondary, accent, background (main/subtle/muted), text (primary/secondary/muted), border, error/warning/success
  spacing: --space-1 through --space-16 (4px base)
  typography: font families, sizes (xs/sm/base/lg/xl/2xl/3xl), weights, line-heights
  radius: --radius-sm/md/lg/full
  shadow: --shadow-sm/md/lg
  transition: --transition-fast/normal/slow
  z-index: --z-dropdown/modal/tooltip`,
};

// ─── Run CLI helper ───────────────────────────────────────────────────────────
function runGemini(prompt: string, files: string[] = []): string {
  const fileArgs = files.flatMap((f) => ["@" + f]);
  const fullPrompt = fileArgs.length
    ? `${fileArgs.join(" ")} ${prompt}`
    : prompt;

  const args = CLI.isAgy
    ? ["-p", fullPrompt, "--model", MODEL]
    : ["-p", fullPrompt, "--model", MODEL];

  const result = spawnSync(CLI.bin, args, {
    timeout: TIMEOUT_MS,
    encoding: "utf-8",
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw new Error(`CLI error: ${result.error.message}`);
  const out = (result.stdout || "") + (result.stderr || "");
  if (!out.trim()) throw new Error("Empty response from Gemini CLI");
  return out.trim();
}

// ─── MCP Server setup ─────────────────────────────────────────────────────────
const server = new Server(
  { name: "ui-aesthetics-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

// ─── Tool definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "improve_ui",
      description:
        "Sends frontend code to Gemini for aesthetic improvement. " +
        "Fixes spacing, typography, color, accessibility, micro-interactions. " +
        "Returns improved code only — preserves all logic/data.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "The frontend code to improve (HTML/CSS/JSX/Vue/Svelte)" },
          style_direction: {
            type: "string",
            description: "Aesthetic direction hint",
            enum: ["modern-minimal", "neo-brutalist", "glassmorphism", "dark-premium", "soft-ui", "corporate-clean"],
            default: "modern-minimal",
          },
          framework: {
            type: "string",
            description: "Framework/language of the code",
            enum: ["html-css", "react-jsx", "react-tsx", "vue", "svelte", "tailwind"],
            default: "html-css",
          },
          file_path: { type: "string", description: "Optional: absolute path to the file (uses @ syntax)" },
        },
        required: ["code"],
      },
    },
    {
      name: "analyze_ui",
      description:
        "Ask Gemini to review frontend code aesthetics and return a structured JSON report " +
        "with a score (0-100), issues list, and actionable fixes.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Frontend code to analyze" },
          file_path: { type: "string", description: "Optional: path to file" },
        },
        required: ["code"],
      },
    },
    {
      name: "create_component",
      description:
        "Ask Gemini to create a brand-new UI component or page from a description. " +
        "Always produces production-ready, accessible, responsive code.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "What to create (e.g. 'a pricing table with 3 tiers')" },
          framework: {
            type: "string",
            enum: ["html-css", "react-jsx", "react-tsx", "vue", "svelte", "tailwind"],
            default: "react-tsx",
          },
          style_direction: {
            type: "string",
            enum: ["modern-minimal", "neo-brutalist", "glassmorphism", "dark-premium", "soft-ui", "corporate-clean"],
            default: "modern-minimal",
          },
          design_system_context: {
            type: "string",
            description: "Optional: paste your design-system.md or CSS variables so Gemini stays consistent",
          },
        },
        required: ["description"],
      },
    },
    {
      name: "generate_design_tokens",
      description:
        "Generate a complete CSS variable / design token system for a project. " +
        "Returns a :root{} block with colors, spacing, typography, shadows, etc.",
      inputSchema: {
        type: "object",
        properties: {
          brand_colors: { type: "string", description: "e.g. 'primary: #6366f1, accent: #f59e0b'" },
          style_direction: {
            type: "string",
            enum: ["modern-minimal", "neo-brutalist", "glassmorphism", "dark-premium", "soft-ui", "corporate-clean"],
            default: "modern-minimal",
          },
          include_dark_mode: { type: "boolean", default: true },
        },
      },
    },
    {
      name: "ask_gemini_design",
      description:
        "Free-form design question to Gemini. Use for anything UI/UX/design-system related " +
        "that doesn't fit the other tools. Gemini's full context window is available.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Your design question or request" },
          file_paths: {
            type: "array",
            items: { type: "string" },
            description: "Optional file paths to include as context via @ syntax",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "visual_diff",
      description:
        "Generate a side-by-side HTML visual diff report comparing before/after UI code. " +
        "Opens in any browser — no Playwright needed. Shows improvement score, CSS stats, " +
        "and class-level changes. Use AFTER improve_ui to verify changes visually.",
      inputSchema: {
        type: "object",
        properties: {
          before: { type: "string", description: "BEFORE HTML string or absolute path to .html file" },
          after:  { type: "string", description: "AFTER HTML string or absolute path to .html file" },
          output_dir: { type: "string", description: "Directory to save diff report (default: cwd)" },
          label_before: { type: "string", description: "Label for before panel" },
          label_after:  { type: "string", description: "Label for after panel" },
        },
        required: ["before", "after"],
      },
    },
  ],
}));

// ─── Tool handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, any>;

  try {
    let result: string;

    if (name === "improve_ui") {
      const direction = a.style_direction || "modern-minimal";
      const framework = a.framework || "html-css";
      const prompt =
        `${PROMPTS.system}\n\n${PROMPTS.improve}\n\n` +
        `Style direction: ${direction}\nFramework: ${framework}\n\n` +
        `CODE TO IMPROVE:\n\`\`\`\n${a.code}\n\`\`\``;
      const files = a.file_path ? [a.file_path] : [];
      result = await runGemini(prompt, files);

    } else if (name === "analyze_ui") {
      const prompt =
        `${PROMPTS.system}\n\n${PROMPTS.analyze}\n\n` +
        `CODE TO ANALYZE:\n\`\`\`\n${a.code}\n\`\`\``;
      const files = a.file_path ? [a.file_path] : [];
      result = await runGemini(prompt, files);

    } else if (name === "create_component") {
      const direction = a.style_direction || "modern-minimal";
      const framework = a.framework || "react-tsx";
      const dsContext = a.design_system_context
        ? `\n\nDESIGN SYSTEM CONTEXT (use these tokens):\n${a.design_system_context}`
        : "";
      const prompt =
        `${PROMPTS.system}\n\n${PROMPTS.create}\n\n` +
        `Style direction: ${direction}\nFramework: ${framework}${dsContext}\n\n` +
        `CREATE: ${a.description}`;
      result = await runGemini(prompt);

    } else if (name === "generate_design_tokens") {
      const brandColors = a.brand_colors ? `Brand colors: ${a.brand_colors}\n` : "";
      const darkMode = a.include_dark_mode !== false ? "Include a [data-theme='dark'] block too." : "";
      const prompt =
        `${PROMPTS.system}\n\n${PROMPTS.theme}\n\n` +
        `Style direction: ${a.style_direction || "modern-minimal"}\n${brandColors}${darkMode}`;
      result = await runGemini(prompt);

    } else if (name === "ask_gemini_design") {
      const files = (a.file_paths as string[]) || [];
      const prompt = `${PROMPTS.system}\n\n${a.prompt}`;
      result = await runGemini(prompt, files);

    } else if (name === "visual_diff") {
      const outDir = a.output_dir || process.cwd();
      const report = generateDiffReport(
        a.before,
        a.after,
        outDir,
        { before: a.label_before, after: a.label_after }
      );
      const { summary } = report;
      const text = [
        `✅ Diff report saved: ${report.reportPath}`,
        ``,
        `📊 Improvement score: ${summary.estimatedImprovementScore}/100`,
        `   Lines added:    +${summary.linesAdded}`,
        `   Lines removed:  -${summary.linesRemoved}`,
        `   CSS props added: +${summary.cssPropsAdded}`,
        `   New classes: ${summary.classesAdded.slice(0, 8).join(", ") || "none"}`,
        ``,
        `Open the report in any browser to see the side-by-side visual diff.`,
      ].join("\n");
      return { content: [{ type: "text", text }] };

    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: result }] };

  } catch (err: any) {
    return {
      content: [{ type: "text", text: `❌ ui-aesthetics-mcp error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Prompt shortcuts (slash commands) ────────────────────────────────────────
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "design-review",
      description: "Full aesthetic review of a component file",
      arguments: [{ name: "file", description: "Path to the file", required: true }],
    },
    {
      name: "design-principles",
      description: "Show the built-in design principles used by this MCP",
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "design-review") {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Use the analyze_ui tool on the file: ${args?.file}\nThen use improve_ui to fix all critical and major issues.`,
        },
      }],
    };
  }
  if (name === "design-principles") {
    return {
      messages: [{
        role: "user",
        content: { type: "text", text: PROMPTS.system },
      }],
    };
  }
  throw new Error(`Unknown prompt: ${name}`);
});

// ─── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  const backend = CLI.isAgy ? "Antigravity CLI (agy)" : "Gemini CLI";
  process.stderr.write(`[ui-aesthetics-mcp] Using backend: ${backend} | model: ${MODEL}\n`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[ui-aesthetics-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
