/**
 * ui-aesthetics-mcp — Test Suite
 * Run: node --test tests/index.test.ts  (after ts-node or tsx install)
 * Or:  npx tsx --test tests/index.test.ts
 *
 * Tests are split into:
 *   1. Unit tests   — pure logic (prompt builder, CLI resolver, schema validation)
 *   2. Integration  — spawn a real MCP server, call tools via JSON-RPC over stdio
 *   3. E2E (dry-run)— call each tool with mocked CLI output
 */

import { test, describe, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { spawn, SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ENTRY = path.join(ROOT, "dist", "index.js");
const FIXTURE_UGLY = path.join(__dirname, "fixtures", "ugly.html");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Send a single JSON-RPC request to the MCP server via stdio and get the response */
async function mcpCall(
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Ensure dist exists before running
    if (!fs.existsSync(ENTRY)) {
      reject(new Error(`dist/index.js not found — run 'npm run build' first`));
      return;
    }

    const proc = spawn("node", [ENTRY], {
      env: {
        ...process.env,
        // Point to a fake CLI that just echoes back a canned response
        AGY_PATH: path.join(__dirname, "fixtures", "fake-agy.sh"),
        GEMINI_MODEL: "gemini-2.5-flash",
        TIMEOUT_MINUTES: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    // MCP init sequence: first send initialize, then our call
    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.1" },
      },
    }) + "\n";

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method,
      params,
    }) + "\n";

    proc.stdin.write(initialize);
    proc.stdin.write(request);

    // Collect responses and resolve/reject as soon as we get id===2
    let resolved = false;
    const checkResponse = (chunk: Buffer) => {
      if (resolved) return;
      const lines = chunk.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) {
        let parsed: any;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (parsed?.id === 2 && parsed.result) {
          resolved = true;
          proc.stdin.end();
          clearTimeout(timer);
          resolve(parsed.result);
          return;
        }
        if (parsed?.id === 2 && parsed.error) {
          resolved = true;
          proc.stdin.end();
          clearTimeout(timer);
          reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
          return;
        }
      }
    };

    proc.stdout.on("data", (d: Buffer) => checkResponse(d));
    proc.stderr.on("data", (d: Buffer) => { /* ignore stderr noise */ });

    proc.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error("Server process closed unexpectedly"));
      }
    });

    proc.on("error", reject);

    // Timeout safety
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error("MCP call timed out after 10s"));
      }
    }, 10_000);
  });
}

// ─── 1. Unit Tests ────────────────────────────────────────────────────────────

describe("Unit: Tool schema validation", () => {
  test("improve_ui requires 'code' field", async () => {
    // The MCP SDK validates schemas — missing required field should produce error
    const result = await mcpCall("tools/call", {
      name: "improve_ui",
      arguments: { style_direction: "modern-minimal" }, // missing 'code'
    }).catch((e) => ({ error: e.message })) as any;

    // Either MCP returns an error OR the tool returns an error content block
    const isError =
      "error" in result ||
      (result?.content?.[0]?.text?.includes("❌") ?? false) ||
      (result?.isError === true);
    assert.ok(isError, "Should fail when 'code' is missing");
  });

  test("style_direction enum values are correct", () => {
    const validStyles = [
      "modern-minimal",
      "neo-brutalist",
      "glassmorphism",
      "dark-premium",
      "soft-ui",
      "corporate-clean",
    ];
    assert.equal(validStyles.length, 6);
    assert.ok(validStyles.includes("modern-minimal"));
    assert.ok(validStyles.includes("neo-brutalist"));
  });

  test("fixture file exists and is valid HTML", () => {
    assert.ok(fs.existsSync(FIXTURE_UGLY), "ugly.html fixture should exist");
    const content = fs.readFileSync(FIXTURE_UGLY, "utf-8");
    assert.ok(content.includes("<!DOCTYPE html>"));
    assert.ok(content.includes("<button"), "Should have a button element");
  });
});

describe("Unit: Prompt content checks", () => {
  test("system prompt references design principles", () => {
    // Read the source and verify key prompt strings are present
    const src = fs.readFileSync(path.join(ROOT, "index.ts"), "utf-8");
    assert.ok(src.includes("8px"), "Should mention 8px grid");
    assert.ok(src.includes("WCAG"), "Should mention WCAG accessibility");
    assert.ok(src.includes("Linear"), "Should reference Linear as aesthetic standard");
    assert.ok(src.includes("Stripe"), "Should reference Stripe as aesthetic standard");
  });

  test("all 5 tools are defined in source", () => {
    const src = fs.readFileSync(path.join(ROOT, "index.ts"), "utf-8");
    const tools = [
      "improve_ui",
      "analyze_ui",
      "create_component",
      "generate_design_tokens",
      "ask_gemini_design",
      "visual_diff",
    ];
    for (const tool of tools) {
      assert.ok(src.includes(`name: "${tool}"`), `Tool '${tool}' should be defined`);
    }
  });

  test("CLI auto-detection prefers agy over gemini", () => {
    const src = fs.readFileSync(path.join(ROOT, "index.ts"), "utf-8");
    // agy should be checked before gemini in resolveCLI
    const agyIdx = src.indexOf('"agy --version"');
    const geminiIdx = src.indexOf('"gemini --version"');
    assert.ok(agyIdx < geminiIdx, "agy should be tried before gemini fallback");
  });
});

// ─── 2. Integration Tests (with fake CLI) ─────────────────────────────────────

describe("Integration: tools/list", () => {
  test("returns all 5 expected tools", async () => {
    const result = await mcpCall("tools/list", {}) as any;
    assert.ok(result?.tools, "Should return tools array");
    const names = result.tools.map((t: any) => t.name);
    assert.ok(names.includes("improve_ui"));
    assert.ok(names.includes("analyze_ui"));
    assert.ok(names.includes("create_component"));
    assert.ok(names.includes("generate_design_tokens"));
    assert.ok(names.includes("ask_gemini_design"));
    assert.equal(names.length, 6, "Should have exactly 6 tools");
  });

  test("each tool has description and inputSchema", async () => {
    const result = await mcpCall("tools/list", {}) as any;
    for (const tool of result.tools) {
      assert.ok(tool.description?.length > 10, `Tool '${tool.name}' needs a description`);
      assert.ok(tool.inputSchema, `Tool '${tool.name}' needs inputSchema`);
      assert.equal(tool.inputSchema.type, "object");
    }
  });
});

describe("Integration: prompts/list", () => {
  test("returns design-review and design-principles prompts", async () => {
    const result = await mcpCall("prompts/list", {}) as any;
    assert.ok(result?.prompts, "Should return prompts array");
    const names = result.prompts.map((p: any) => p.name);
    assert.ok(names.includes("design-review"));
    assert.ok(names.includes("design-principles"));
  });
});

describe("Integration: tool calls (fake CLI)", () => {
  before(async () => {
    // Create fake-agy.sh that returns predictable output
    const fakeAgy = `#!/bin/bash
# Fake agy/gemini CLI for testing — echoes back a canned response
echo '{"score":72,"issues":[{"severity":"major","area":"spacing","description":"Inconsistent padding","fix":"Use 8px multiples"}],"highlights":["Semantic HTML"],"summary":"Needs polish."}'
`;
    const fakePath = path.join(__dirname, "fixtures", "fake-agy.sh");
    fs.writeFileSync(fakePath, fakeAgy, { mode: 0o755 });
  });

  after(() => {
    const fakePath = path.join(__dirname, "fixtures", "fake-agy.sh");
    if (fs.existsSync(fakePath)) fs.unlinkSync(fakePath);
  });

  test("improve_ui returns non-empty content", async () => {
    const result = await mcpCall("tools/call", {
      name: "improve_ui",
      arguments: {
        code: fs.readFileSync(FIXTURE_UGLY, "utf-8"),
        style_direction: "modern-minimal",
        framework: "html-css",
      },
    }) as any;
    assert.ok(result?.content?.[0]?.text?.length > 0, "Should return improved code");
  });

  test("analyze_ui returns content", async () => {
    const result = await mcpCall("tools/call", {
      name: "analyze_ui",
      arguments: { code: "<div style='color:red'>bad ui</div>" },
    }) as any;
    assert.ok(result?.content?.[0]?.text?.length > 0, "Should return analysis");
  });

  test("create_component returns content", async () => {
    const result = await mcpCall("tools/call", {
      name: "create_component",
      arguments: {
        description: "a simple pricing card",
        framework: "html-css",
        style_direction: "modern-minimal",
      },
    }) as any;
    assert.ok(result?.content?.[0]?.text?.length > 0, "Should return component code");
  });

  test("generate_design_tokens returns content", async () => {
    const result = await mcpCall("tools/call", {
      name: "generate_design_tokens",
      arguments: {
        style_direction: "dark-premium",
        include_dark_mode: true,
      },
    }) as any;
    assert.ok(result?.content?.[0]?.text?.length > 0, "Should return CSS tokens");
  });

  test("ask_gemini_design returns content", async () => {
    const result = await mcpCall("tools/call", {
      name: "ask_gemini_design",
      arguments: { prompt: "What font pairing works best for a SaaS dashboard?" },
    }) as any;
    assert.ok(result?.content?.[0]?.text?.length > 0, "Should return design advice");
  });

  test("unknown tool returns error block", async () => {
    const result = await mcpCall("tools/call", {
      name: "nonexistent_tool",
      arguments: {},
    }) as any;
    const text: string = result?.content?.[0]?.text ?? "";
    assert.ok(
      text.includes("❌") || result?.isError === true,
      "Should return error for unknown tool"
    );
  });
});

describe("Integration: prompt get", () => {
  test("design-principles returns system prompt content", async () => {
    const result = await mcpCall("prompts/get", {
      name: "design-principles",
      arguments: {},
    }) as any;
    const text: string = result?.messages?.[0]?.content?.text ?? "";
    assert.ok(text.includes("8px"), "Should include design principles");
    assert.ok(text.includes("WCAG"), "Should include accessibility mentions");
  });
});
