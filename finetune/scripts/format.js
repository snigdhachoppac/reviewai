#!/usr/bin/env node
/**
 * Stage 3: Format for Fine-Tuning
 *
 * Converts filtered examples into the prompt/completion format
 * expected by the training script. Also splits into train/eval sets.
 *
 * Output format (JSONL, one example per line):
 * {
 *   "messages": [
 *     { "role": "system", "content": "..." },
 *     { "role": "user",   "content": "<diff + context>" },
 *     { "role": "assistant", "content": "<structured JSON review>" }
 *   ]
 * }
 *
 * This matches the chat fine-tuning format for CodeLlama-Instruct / Mistral-Instruct.
 *
 * Usage:
 *   node format.js --input data/filtered.jsonl --output data/train.jsonl --split 0.9
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    input:  { type: "string", default: "data/filtered.jsonl" },
    output: { type: "string", default: "data/train.jsonl" },
    eval:   { type: "string", default: "data/eval.jsonl" },
    split:  { type: "string", default: "0.9" },
  },
});

const TRAIN_SPLIT = parseFloat(args.split);

const SYSTEM_PROMPT = `You are ReviewAI, an expert senior software engineer performing code review. You analyse pull request diffs and return a single JSON object with specific, actionable review comments. You focus on security vulnerabilities, architectural anti-patterns, performance bottlenecks, and correctness issues. You never comment on formatting or trivial style. You always return valid JSON matching the provided schema.`;

function buildUserPrompt(ex) {
  return `Review this pull request change and return a JSON review object.

## PR: ${ex.prTitle}
${ex.prBody ? `**Description:** ${ex.prBody}\n` : ""}
## Changed file: ${ex.filePath}

\`\`\`diff
${ex.patch}
\`\`\`

Return JSON matching this schema:
{
  "overallScore": <0-100>,
  "summary": "<1-2 sentence assessment>",
  "comments": [
    {
      "filePath": "${ex.filePath}",
      "line": <integer or null>,
      "category": "<security|architecture|performance|style|correctness>",
      "severity": "<critical|warning|info|suggestion>",
      "title": "<max 8 words>",
      "suggestion": "<actionable 1-4 sentence explanation>",
      "codeExample": "<optional improved code>"
    }
  ]
}`;
}

function buildAssistantResponse(ex) {
  // Infer severity from category and quality score
  const severity =
    ex.category === "security" ? "critical"
    : ex.category === "performance" && ex.qualityScore > 0.8 ? "warning"
    : ex.category === "architecture" ? "warning"
    : ex.qualityScore > 0.8 ? "warning"
    : "info";

  const score = ex.authorAck
    ? Math.max(55, 90 - (ex.category === "security" ? 25 : ex.category === "architecture" ? 15 : 10))
    : 75;

  // Build a short title from the first sentence of the comment
  const firstSentence = ex.reviewComment.split(/[.!?]/)[0].slice(0, 60).trim();

  return JSON.stringify({
    overallScore: score,
    summary: ex.reviewComment.slice(0, 200),
    comments: [
      {
        filePath: ex.filePath,
        line: ex.commentLine || null,
        category: ex.category,
        severity,
        title: firstSentence,
        suggestion: ex.reviewComment,
        codeExample: null,
      },
    ],
  }, null, 2);
}

async function main() {
  const rl = createInterface({ input: createReadStream(args.input) });

  const examples = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { examples.push(JSON.parse(line)); }
    catch { continue; }
  }

  // Shuffle deterministically for reproducibility
  examples.sort(() => 0.5 - Math.sin(examples.length));

  const splitIdx = Math.floor(examples.length * TRAIN_SPLIT);
  const trainSet = examples.slice(0, splitIdx);
  const evalSet  = examples.slice(splitIdx);

  const trainOut = createWriteStream(args.output);
  const evalOut  = createWriteStream(args.eval);

  let trainCount = 0, evalCount = 0;

  for (const ex of trainSet) {
    const formatted = {
      messages: [
        { role: "system",    content: SYSTEM_PROMPT },
        { role: "user",      content: buildUserPrompt(ex) },
        { role: "assistant", content: buildAssistantResponse(ex) },
      ],
      metadata: {
        repo: ex.repo,
        category: ex.category,
        qualityScore: ex.qualityScore,
        authorAck: ex.authorAck,
      },
    };
    trainOut.write(JSON.stringify(formatted) + "\n");
    trainCount++;
  }

  for (const ex of evalSet) {
    const formatted = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildUserPrompt(ex) },
        // No assistant message in eval set — the model generates this
      ],
      expected: buildAssistantResponse(ex),
      metadata: {
        repo: ex.repo,
        category: ex.category,
        qualityScore: ex.qualityScore,
      },
    };
    evalOut.write(JSON.stringify(formatted) + "\n");
    evalCount++;
  }

  trainOut.end();
  evalOut.end();

  console.log(`\n✅ Formatting complete:`);
  console.log(`   Train: ${trainCount} examples → ${args.output}`);
  console.log(`   Eval:  ${evalCount} examples  → ${args.eval}`);
  console.log(`\n   Category distribution in training set:`);

  const cats = {};
  trainSet.forEach((ex) => { cats[ex.category] = (cats[ex.category]||0) + 1; });
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([cat,n]) => {
    const pct = ((n/trainCount)*100).toFixed(1);
    console.log(`   ${cat.padEnd(14)}: ${n} (${pct}%)`);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
