# ReviewAI Fine-Tuning Pipeline

This pipeline collects real code review data from public GitHub repositories,
formats it as supervised fine-tuning (SFT) examples, and fine-tunes a base model
to produce higher-quality, more domain-specific reviews than a general-purpose model.

## Pipeline stages

```
Stage 1: collect.js   — Scrape accepted PR review comments from public repos
Stage 2: filter.js    — Quality-filter: remove trivial, duplicate, or low-signal comments
Stage 3: format.js    — Convert to prompt/completion pairs matching our review schema
Stage 4: train.py     — Fine-tune using LoRA on CodeLlama-7B or Mistral-7B
Stage 5: eval.js      — Evaluate the fine-tuned model vs. the base model on a held-out set
```

## Why fine-tune?

The base Claude model gives excellent general code review. Fine-tuning on real review
data from high-quality open source projects (React, Rails, Linux kernel, etc.) teaches
the model:

- The *tone* of senior engineers: terse, precise, non-patronising
- Domain-specific patterns your team actually cares about
- When NOT to comment (a fine-tuned model learns to skip trivial nits)
- Your team's own historical accepted/rejected suggestions (after collecting enough data)

## Quick start

```bash
# Install Python deps
pip install -r requirements.txt

# 1. Collect data (~2hrs for 10k examples)
node scripts/collect.js --repos rails/rails,facebook/react,torvalds/linux --output data/raw.jsonl

# 2. Filter for quality
node scripts/filter.js --input data/raw.jsonl --output data/filtered.jsonl --min-score 0.7

# 3. Format for training
node scripts/format.js --input data/filtered.jsonl --output data/train.jsonl --split 0.9

# 4. Fine-tune (requires GPU — use RunPod, Lambda Labs, or Google Colab A100)
python scripts/train.py \
  --base-model codellama/CodeLlama-7b-Instruct-hf \
  --train-data data/train.jsonl \
  --eval-data data/eval.jsonl \
  --output-dir models/reviewai-v1 \
  --lora-r 16 \
  --epochs 3

# 5. Evaluate against base model
node scripts/eval.js --model models/reviewai-v1 --test-data data/eval.jsonl
```
