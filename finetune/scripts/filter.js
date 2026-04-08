#!/usr/bin/env node
/**
 * Stage 2: Quality Filtering
 *
 * Scores each raw example on multiple dimensions and filters out
 * low-quality training data. Bad training data is worse than no data —
 * it teaches the model to produce shallow, vague, or incorrect reviews.
 *
 * Scoring dimensions:
 *   - specificity:    does the comment reference specific code (variable names, patterns)?
 *   - actionability: does it suggest what to do, not just what's wrong?
 *   - signal:        was the comment acknowledged or reacted to?
 *   - length:        long enough to be substantive but not rambling?
 *   - category:      can we infer a category (security > style)?
 *
 * Usage:
 *   node filter.js --input data/raw.jsonl --output data/filtered.jsonl --min-score 0.65
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    input:      { type: "string", default: "data/raw.jsonl" },
    output:     { type: "string", default: "data/filtered.jsonl" },
    "min-score": { type: "string", default: "0.65" },
    stats:      { type: "boolean", default: false },
  },
});

const MIN_SCORE = parseFloat(args["min-score"]);

// Patterns that suggest a comment is actionable
const ACTIONABLE_PATTERNS = [
  /\b(should|consider|use|replace|avoid|instead|better to|recommend|suggest)\b/i,
  /\b(this (will|can|could|might)|you (should|could|can|need to))\b/i,
  /\b(fix|refactor|extract|move|rename|remove|add|implement)\b/i,
];

// Patterns that suggest a comment is specific (references code elements)
const SPECIFIC_PATTERNS = [
  /`[^`]+`/,              // backtick code references
  /\b[a-z][a-zA-Z]+\(\)/, // function call pattern
  /\b(line \d+|here|this (function|method|variable|class|file))\b/i,
  /"[^"]{3,30}"/,         // quoted identifiers
];

// Security/architecture comments are higher value than style
const HIGH_VALUE_PATTERNS = [
  /\b(sql injection|xss|csrf|race condition|memory leak|deadlock)\b/i,
  /\b(authentication|authorization|privilege|secret|token|password)\b/i,
  /\b(n\+1|query|index|cache|performance|complexity|O\(n\))\b/i,
  /\b(coupling|cohesion|solid|srp|separation of concerns|abstraction)\b/i,
  /\b(vulnerability|cve|security|unsafe|exploit)\b/i,
];

const LOW_VALUE_PATTERNS = [
  /^(nit|nitpick|minor)[:\s]/i,
  /^(lgtm|looks good|nice|great job)\.?$/i,
  /\b(formatting|whitespace|indentation|typo|spelling)\b/i,
];

function scoreExample(ex) {
  const text = ex.reviewComment;
  let score = 0;
  const reasons = [];

  // Length: 50-400 chars is ideal
  const len = text.trim().length;
  if (len < 30) { score -= 0.5; reasons.push("too_short"); }
  else if (len < 80) { score += 0.1; }
  else if (len <= 400) { score += 0.25; reasons.push("good_length"); }
  else if (len <= 700) { score += 0.15; }
  else { score -= 0.1; reasons.push("too_long"); } // Wall of text

  // Actionability
  const actionable = ACTIONABLE_PATTERNS.some((p) => p.test(text));
  if (actionable) { score += 0.2; reasons.push("actionable"); }

  // Specificity
  const specific = SPECIFIC_PATTERNS.filter((p) => p.test(text)).length;
  score += Math.min(specific * 0.1, 0.25);
  if (specific > 0) reasons.push("specific");

  // High-value category
  const highValue = HIGH_VALUE_PATTERNS.some((p) => p.test(text));
  if (highValue) { score += 0.3; reasons.push("high_value"); }

  // Low-value patterns are penalised
  const lowValue = LOW_VALUE_PATTERNS.some((p) => p.test(text));
  if (lowValue) { score -= 0.4; reasons.push("low_value"); }

  // Author signal: was this acknowledged?
  if (ex.authorAck) { score += 0.2; reasons.push("author_ack"); }

  // Community signal: reactions (thumbs up, etc.)
  if (ex.reactions >= 3) { score += 0.15; reasons.push("reactions"); }
  else if (ex.reactions >= 1) { score += 0.05; }

  // Association: OWNER/MEMBER comments are higher signal
  if (["OWNER", "MEMBER", "COLLABORATOR"].includes(ex.commentAuthorAssociation)) {
    score += 0.1; reasons.push("trusted_author");
  }

  // Penalise if the comment has a patch but the comment doesn't reference any code
  if (ex.patch && !SPECIFIC_PATTERNS.some((p) => p.test(text))) {
    score -= 0.1;
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function inferCategory(text) {
  if (/\b(sql|inject|xss|csrf|auth|secret|token|password|vuln|cve|unsafe)\b/i.test(text)) return "security";
  if (/\b(n\+1|query|cache|index|O\(n\)|performance|slow|memory)\b/i.test(text)) return "performance";
  if (/\b(coupling|srp|solid|abstraction|architect|design pattern|layer)\b/i.test(text)) return "architecture";
  if (/\b(null|undefined|error|exception|edge case|race|deadlock)\b/i.test(text)) return "correctness";
  return "style";
}

async function main() {
  const rl = createInterface({ input: createReadStream(args.input) });
  const out = createWriteStream(args.output);

  let total = 0, kept = 0;
  const categoryCount = {};
  const scoreDistribution = { "0.0-0.3": 0, "0.3-0.5": 0, "0.5-0.65": 0, "0.65-0.8": 0, "0.8-1.0": 0 };

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let ex;
    try { ex = JSON.parse(line); }
    catch { continue; }

    const { score, reasons } = scoreExample(ex);

    // Track distribution
    if (score < 0.3) scoreDistribution["0.0-0.3"]++;
    else if (score < 0.5) scoreDistribution["0.3-0.5"]++;
    else if (score < 0.65) scoreDistribution["0.5-0.65"]++;
    else if (score < 0.8) scoreDistribution["0.65-0.8"]++;
    else scoreDistribution["0.8-1.0"]++;

    if (score < MIN_SCORE) continue;

    kept++;
    const category = inferCategory(ex.reviewComment);
    categoryCount[category] = (categoryCount[category] || 0) + 1;

    out.write(JSON.stringify({ ...ex, qualityScore: score, qualityReasons: reasons, category }) + "\n");
  }

  out.end();

  console.log(`\n📊 Filter results:`);
  console.log(`   Input:  ${total} examples`);
  console.log(`   Output: ${kept} examples (${((kept/total)*100).toFixed(1)}% kept)`);
  console.log(`   Min score threshold: ${MIN_SCORE}`);
  console.log(`\n   Score distribution:`);
  Object.entries(scoreDistribution).forEach(([range, count]) => {
    const bar = "█".repeat(Math.round(count / total * 40));
    console.log(`   ${range}: ${bar} ${count}`);
  });
  console.log(`\n   Category breakdown:`);
  Object.entries(categoryCount).sort((a,b)=>b[1]-a[1]).forEach(([cat, count]) => {
    console.log(`   ${cat.padEnd(14)}: ${count}`);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
