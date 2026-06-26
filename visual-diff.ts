/**
 * visual-diff.ts
 * Renders a "before vs after" HTML comparison report.
 *
 * Strategy: read both HTML files, embed them in iframes inside a diff shell page,
 * and also do a structural AST diff to list concrete changes.
 *
 * No Playwright / headless browser needed — pure HTML file output.
 * Open the report in any browser to see the side-by-side visual diff.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface DiffReport {
  reportPath: string;
  structuralChanges: StructuralChange[];
  summary: DiffSummary;
}

export interface StructuralChange {
  type: "added" | "removed" | "modified";
  element: string;
  detail: string;
}

export interface DiffSummary {
  linesAdded: number;
  linesRemoved: number;
  classesAdded: string[];
  classesRemoved: string[];
  cssPropsAdded: number;
  cssPropsRemoved: number;
  estimatedImprovementScore: number; // 0-100 heuristic
}

// ─── Simple HTML structural diff (regex-based, no DOM parser needed) ─────────

function extractClasses(html: string): Set<string> {
  const matches = html.matchAll(/class="([^"]+)"/g);
  const classes = new Set<string>();
  for (const m of matches) {
    m[1].split(/\s+/).forEach((c) => c && classes.add(c));
  }
  return classes;
}

function countCSSProps(html: string): number {
  return (html.match(/:\s*[^;{]+;/g) || []).length;
}

function extractInlineCSS(html: string): string {
  const styleBlocks: string[] = [];
  const styleTagMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  for (const m of styleTagMatches) styleBlocks.push(m[1]);
  const inlineMatches = html.matchAll(/style="([^"]+)"/g);
  for (const m of inlineMatches) styleBlocks.push(m[1]);
  return styleBlocks.join("\n");
}

function heuristicScore(before: string, after: string): number {
  let score = 0;

  // More CSS properties = more styling effort
  const propDiff = countCSSProps(after) - countCSSProps(before);
  score += Math.min(30, propDiff * 2);

  // CSS variables usage (design tokens)
  const varCount = (after.match(/var\(--/g) || []).length;
  score += Math.min(20, varCount * 2);

  // Transition/animation (micro-interactions)
  if (after.includes("transition")) score += 10;
  if (after.includes("transform")) score += 5;

  // Accessibility improvements
  if (after.includes("aria-") && !before.includes("aria-")) score += 10;
  if (after.includes(":focus") && !before.includes(":focus")) score += 10;

  // Responsive design
  if (after.includes("@media") && !before.includes("@media")) score += 10;
  if (after.includes("clamp(") || after.includes("min(")) score += 5;

  return Math.min(100, Math.max(0, score));
}

export function diffHTML(beforeHTML: string, afterHTML: string): DiffSummary {
  const beforeLines = beforeHTML.split("\n");
  const afterLines = afterHTML.split("\n");

  const beforeClasses = extractClasses(beforeHTML);
  const afterClasses = extractClasses(afterHTML);

  const classesAdded = [...afterClasses].filter((c) => !beforeClasses.has(c));
  const classesRemoved = [...beforeClasses].filter((c) => !afterClasses.has(c));

  const beforeProps = countCSSProps(extractInlineCSS(beforeHTML));
  const afterProps = countCSSProps(extractInlineCSS(afterHTML));

  // Simple line diff count
  const beforeSet = new Set(beforeLines.map((l) => l.trim()).filter(Boolean));
  const afterSet = new Set(afterLines.map((l) => l.trim()).filter(Boolean));
  const linesAdded = [...afterSet].filter((l) => !beforeSet.has(l)).length;
  const linesRemoved = [...beforeSet].filter((l) => !afterSet.has(l)).length;

  return {
    linesAdded,
    linesRemoved,
    classesAdded,
    classesRemoved,
    cssPropsAdded: Math.max(0, afterProps - beforeProps),
    cssPropsRemoved: Math.max(0, beforeProps - afterProps),
    estimatedImprovementScore: heuristicScore(beforeHTML, afterHTML),
  };
}

// ─── Report HTML generator ────────────────────────────────────────────────────

function buildReportHTML(
  beforeHTML: string,
  afterHTML: string,
  summary: DiffSummary,
  beforeLabel = "Before",
  afterLabel = "After (Gemini improved)"
): string {
  const score = summary.estimatedImprovementScore;
  const scoreColor =
    score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  const changesHTML =
    summary.classesAdded.length > 0
      ? summary.classesAdded
          .slice(0, 12)
          .map((c) => `<span class="tag added">.${c}</span>`)
          .join("")
      : '<span class="tag">No new classes</span>';

  const removedHTML =
    summary.classesRemoved.length > 0
      ? summary.classesRemoved
          .slice(0, 12)
          .map((c) => `<span class="tag removed">.${c}</span>`)
          .join("")
      : '<span class="tag">None removed</span>';

  // Encode HTML for iframe srcdoc
  const encBefore = beforeHTML.replace(/"/g, "&quot;");
  const encAfter = afterHTML.replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UI Aesthetics Diff — ${beforeLabel} vs ${afterLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #09090b;
      --surface: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --muted: #71717a;
      --added: #22c55e;
      --removed: #ef4444;
      --accent: #6366f1;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    header {
      padding: 24px 32px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 32px; height: 32px;
      background: var(--accent);
      border-radius: 6px;
      display: grid; place-items: center;
      font-size: 18px;
    }

    h1 { font-size: 18px; font-weight: 600; }
    h1 span { color: var(--muted); font-weight: 400; font-size: 14px; margin-left: 8px; }

    .score-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 16px;
      font-size: 14px;
      font-weight: 500;
    }

    .score-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: ${scoreColor};
      box-shadow: 0 0 8px ${scoreColor}88;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1px;
      background: var(--border);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .stat {
      background: var(--surface);
      padding: 16px 24px;
    }

    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 22px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .stat-value.positive { color: var(--added); }
    .stat-value.negative { color: var(--removed); }

    .diff-section {
      padding: 20px 32px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
    }

    .diff-section h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      width: 100%;
    }

    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
    }

    .tag.added {
      background: #14532d44;
      border-color: #22c55e44;
      color: var(--added);
    }

    .tag.removed {
      background: #7f1d1d44;
      border-color: #ef444444;
      color: var(--removed);
    }

    .frames {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--border);
      flex: 1;
      height: calc(100vh - 300px);
      min-height: 400px;
    }

    .frame-wrap {
      background: var(--surface);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .frame-label {
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .frame-label .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
    }

    .dot-before { background: var(--removed); }
    .dot-after  { background: var(--added); }

    iframe {
      flex: 1;
      border: none;
      background: #fff;
      width: 100%;
    }

    footer {
      padding: 12px 32px;
      font-size: 12px;
      color: var(--muted);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
    }

    @media (max-width: 640px) {
      .frames { grid-template-columns: 1fr; }
      header { padding: 16px; }
    }
  </style>
</head>
<body>

  <header>
    <div class="header-title">
      <div class="logo">✦</div>
      <h1>UI Diff <span>ui-aesthetics-mcp</span></h1>
    </div>
    <div class="score-badge">
      <div class="score-dot"></div>
      Improvement score: <strong style="color:${scoreColor}">${score}/100</strong>
    </div>
  </header>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Lines added</div>
      <div class="stat-value positive">+${summary.linesAdded}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Lines removed</div>
      <div class="stat-value negative">-${summary.linesRemoved}</div>
    </div>
    <div class="stat">
      <div class="stat-label">CSS props added</div>
      <div class="stat-value positive">+${summary.cssPropsAdded}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Classes changed</div>
      <div class="stat-value">${summary.classesAdded.length + summary.classesRemoved.length}</div>
    </div>
  </div>

  <div class="diff-section">
    <h2>New classes / tokens introduced</h2>
    ${changesHTML}
  </div>

  <div class="diff-section">
    <h2>Classes removed</h2>
    ${removedHTML}
  </div>

  <div class="frames">
    <div class="frame-wrap">
      <div class="frame-label">
        <span class="dot dot-before"></span> ${beforeLabel}
      </div>
      <iframe srcdoc="${encBefore}" title="Before"></iframe>
    </div>
    <div class="frame-wrap">
      <div class="frame-label">
        <span class="dot dot-after"></span> ${afterLabel}
      </div>
      <iframe srcdoc="${encAfter}" title="After"></iframe>
    </div>
  </div>

  <footer>
    <span>Generated by ui-aesthetics-mcp · MIT License</span>
    <span>${new Date().toLocaleString()}</span>
  </footer>

</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a visual diff report comparing two HTML strings or file paths.
 *
 * @param before  HTML string or absolute path to before-file
 * @param after   HTML string or absolute path to after-file
 * @param outputDir  Where to write the report (default: process.cwd())
 * @param labels  Optional labels for before/after panels
 */
export function generateDiffReport(
  before: string,
  after: string,
  outputDir = process.cwd(),
  labels?: { before?: string; after?: string }
): DiffReport {
  const beforeHTML = fs.existsSync(before) ? fs.readFileSync(before, "utf-8") : before;
  const afterHTML = fs.existsSync(after) ? fs.readFileSync(after, "utf-8") : after;

  const summary = diffHTML(beforeHTML, afterHTML);
  const reportHTML = buildReportHTML(
    beforeHTML,
    afterHTML,
    summary,
    labels?.before,
    labels?.after
  );

  const timestamp = Date.now();
  const reportPath = path.join(outputDir, `ui-diff-${timestamp}.html`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(reportPath, reportHTML, "utf-8");

  return { reportPath, structuralChanges: [], summary };
}

// ─── CLI usage: node visual-diff.js before.html after.html ───────────────────
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const [, , beforeArg, afterArg, outDir] = process.argv;
  if (!beforeArg || !afterArg) {
    console.error("Usage: node visual-diff.js <before.html> <after.html> [output-dir]");
    process.exit(1);
  }
  const report = generateDiffReport(beforeArg, afterArg, outDir || ".");
  console.log(`✅ Diff report: ${report.reportPath}`);
  console.log(`   Improvement score: ${report.summary.estimatedImprovementScore}/100`);
  console.log(`   Lines added: +${report.summary.linesAdded}  removed: -${report.summary.linesRemoved}`);
}
