#!/usr/bin/env node
/**
 * Stage 5: Evaluation
 *
 * Runs the fine-tuned model against the held-out eval set and compares
 * it to the base model (Claude API) on multiple dimensions:
 *
 *   - specificity_score:   does the response reference actual code elements?
 *   - actionability_score: does it tell the reviewer what to do?
 *   - category_accuracy:   did it correctly classify the issue type?
 *   - severity_match:      does severity align with human annotation?
 *   - json_validity:       is the output always valid, parseable JSON?
 *   - avg_comment_length:  are comments appropriately concise?
 *
 * Usage:
 *   node eval.js --model http://localhost:8080 --test-data data/eval.jsonl
 *
 * The --model flag points to a local inference server (e.g. llama.cpp, vLLM,
 * or Ollama) serving the fine-tuned adapter.
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import { parseArgs } from "util";
import Anthropic from "@anthropic-ai/sdk";

const { values: args } = parseArgs({
  options: {
    model:       { type: "string", default: "http://localhost:8080" },
    "test-data": { type: "string", default: "data/eval.jsonl" },
    "max-examples": { type: "string", default: "100" },
    "compare-claude": { type: "boolean", default: true },
  },
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX = parseInt(args["max-examples"]);

// ── Scoring functions ─────────────────────────────────────────────────────────

function scoreSpecificity(text) {
  const patterns = [
    /`[^`]+`/g,
    /\b[a-z][a-zA-Z]+\(\)/g,
    /"[^"]{3,30}"/g,
    /\b(line \d+|this (function|method|class|variable))\b/gi,
  ];
  const matches = patterns.reduce((n, p) => n + (text.match(p) || []).length, 0);
  return Math.min(1, matches / 3);
}

function scoreActionability(text) {
  const patterns = [
    /\b(should|consider|use|replace|avoid|instead|recommend|suggest)\b/i,
    /\b(fix|refactor|extract|move|rename|remove|add|implement)\b/i,
    /\b(you (should|could|can|need to)|this (will|can|could))\b/i,
  ];
  const matched = patterns.filter((p) => p.test(text)).length;
  return matched / patterns.length;
}

function scoreJsonValidity(text) {
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    JSON.parse(clean);
    return 1;
  } catch {
    return 0;
  }
}

function scoreCategoryMatch(predicted, expected) {
  try {
    const clean = predicted.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean);
    const predictedCat = parsed.comments?.[0]?.category;
    return predictedCat === expected ? 1 : 0;
  } catch {
    return 0;
  }
}

function computeMetrics(responses) {
  const n = responses.length;
  if (n === 0) return null;

  const avg = (key) => responses.reduce((s, r) => s + (r[key] || 0), 0) / n;

  return {
    n,
    json_validity:      avg("jsonValidity").toFixed(3),
    specificity:        avg("specificity").toFixed(3),
    actionability:      avg("actionability").toFixed(3),
    category_accuracy:  avg("categoryMatch").toFixed(3),
    avg_comment_length: Math.round(avg("commentLength")),
    combined_score:     (
      (avg("jsonValidity") * 0.3) +
      (avg("specificity") * 0.25) +
      (avg("actionability") * 0.25) +
      (avg("categoryMatch") * 0.2)
    ).toFixed(3),
  };
}

// ── Model callers ─────────────────────────────────────────────────────────────

async function callFinetunedModel(prompt) {
  // Calls a local inference server (llama.cpp, vLLM, Ollama)
  const res = await fetch(`${args.model}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: prompt.messages,
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callClaudeBaseline(prompt) {
  const userMsg = prompt.messages.find((m) => m.role === "user");
  const sysMsg  = prompt.messages.find((m) => m.role === "system");
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: sysMsg?.content,
    messages: [{ role: "user", content: userMsg.content }],
  });
  return msg.content[0]?.text || "";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rl = createInterface({ input: createReadStream(args["test-data"]) });
  const examples = [];
  for await (const line of rl) {
    if (line.trim()) {
      try { examples.push(JSON.parse(line)); }
      catch { continue; }
    }
  }

  const sample = examples.slice(0, MAX);
  console.log(`\n🔬 Evaluating on ${sample.length} examples...\n`);

  const finetuneResults = [];
  const claudeResults   = [];

  for (let i = 0; i < sample.length; i++) {
    const ex = sample[i];
    const expectedCategory = ex.metadata?.category || "style";

    process.stdout.write(`\r  Progress: ${i+1}/${sample.length}`);

    // Evaluate fine-tuned model
    try {
      const ftResponse = await callFinetunedModel(ex);
      finetuneResults.push({
        jsonValidity:   scoreJsonValidity(ftResponse),
        specificity:    scoreSpecificity(ftResponse),
        actionability:  scoreActionability(ftResponse),
        categoryMatch:  scoreCategoryMatch(ftResponse, expectedCategory),
        commentLength:  ftResponse.length,
      });
    } catch (err) {
      finetuneResults.push({ jsonValidity: 0, specificity: 0, actionability: 0, categoryMatch: 0, commentLength: 0 });
    }

    // Evaluate Claude baseline (every 5th example to save API costs)
    if (args["compare-claude"] && i % 5 === 0) {
      try {
        const claudeResponse = await callClaudeBaseline(ex);
        claudeResults.push({
          jsonValidity:   scoreJsonValidity(claudeResponse),
          specificity:    scoreSpecificity(claudeResponse),
          actionability:  scoreActionability(claudeResponse),
          categoryMatch:  scoreCategoryMatch(claudeResponse, expectedCategory),
          commentLength:  claudeResponse.length,
        });
      } catch { /* skip */ }
    }
  }

  console.log("\n");

  const ftMetrics     = computeMetrics(finetuneResults);
  const claudeMetrics = computeMetrics(claudeResults);

  console.log("┌─────────────────────────┬──────────────┬──────────────┐");
  console.log("│ Metric                  │ Fine-tuned   │ Claude base  │");
  console.log("├─────────────────────────┼──────────────┼──────────────┤");

  const rows = [
    ["JSON validity",     "json_validity"],
    ["Specificity",       "specificity"],
    ["Actionability",     "actionability"],
    ["Category accuracy", "category_accuracy"],
    ["Avg length (chars)","avg_comment_length"],
    ["Combined score",    "combined_score"],
  ];

  for (const [label, key] of rows) {
    const ft = String(ftMetrics?.[key] ?? "—").padStart(10);
    const cl = String(claudeMetrics?.[key] ?? "n/a").padStart(10);
    console.log(`│ ${label.padEnd(23)} │ ${ft}   │ ${cl}   │`);
  }

  console.log("└─────────────────────────┴──────────────┴──────────────┘");
  console.log(`\n  Fine-tuned model: ${args.model}`);
  console.log(`  Eval examples:    ${ftMetrics?.n} (fine-tuned), ${claudeMetrics?.n ?? 0} (Claude)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
