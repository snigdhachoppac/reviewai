#!/usr/bin/env python3
"""
Stage 4: Fine-Tuning with LoRA

Uses Parameter-Efficient Fine-Tuning (PEFT) with Low-Rank Adaptation (LoRA)
to fine-tune CodeLlama-7B-Instruct on our code review dataset.

LoRA freezes the base model weights and trains small low-rank matrices
injected into the attention layers. This means:
  - 7B parameter model trains on a single A100 (80GB) in ~3 hours
  - The trained adapter is only ~50MB (vs 14GB for the full model)
  - The base model can be swapped without retraining the adapter

Requirements:
  pip install transformers peft accelerate bitsandbytes datasets trl wandb

Usage:
  python train.py \\
    --base-model codellama/CodeLlama-7b-Instruct-hf \\
    --train-data data/train.jsonl \\
    --eval-data data/eval.jsonl \\
    --output-dir models/reviewai-v1 \\
    --lora-r 16 --epochs 3

For smaller GPU (24GB VRAM), add: --load-in-4bit
"""

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--base-model",   default="codellama/CodeLlama-7b-Instruct-hf")
    p.add_argument("--train-data",   default="data/train.jsonl")
    p.add_argument("--eval-data",    default="data/eval.jsonl")
    p.add_argument("--output-dir",   default="models/reviewai-v1")
    p.add_argument("--lora-r",       type=int, default=16,
                   help="LoRA rank. Higher = more capacity but more memory. 8-32 is typical.")
    p.add_argument("--lora-alpha",   type=int, default=32,
                   help="LoRA scaling factor. Usually 2x lora_r.")
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--epochs",       type=int, default=3)
    p.add_argument("--batch-size",   type=int, default=4)
    p.add_argument("--grad-accum",   type=int, default=4,
                   help="Gradient accumulation steps. Effective batch = batch_size * grad_accum.")
    p.add_argument("--lr",           type=float, default=2e-4)
    p.add_argument("--max-seq-len",  type=int, default=2048)
    p.add_argument("--load-in-4bit", action="store_true",
                   help="Use 4-bit quantisation for smaller GPUs (RTX 3090, A10).")
    p.add_argument("--wandb-project", default="reviewai-finetune",
                   help="Weights & Biases project name for experiment tracking.")
    return p.parse_args()


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def format_chat_prompt(example, tokenizer):
    """Convert a messages array to the model's expected chat format."""
    messages = example["messages"]
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=False,
    )


def main():
    args = parse_args()
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    print(f"🚀 ReviewAI Fine-Tuning")
    print(f"   Base model:  {args.base_model}")
    print(f"   Train data:  {args.train_data}")
    print(f"   LoRA rank:   {args.lora_r}")
    print(f"   Epochs:      {args.epochs}")
    print(f"   4-bit:       {args.load_in_4bit}")

    # ── 1. Load tokenizer ──────────────────────────────────────────────────────
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"  # Required for SFT with causal LMs

    # ── 2. Load base model ─────────────────────────────────────────────────────
    if args.load_in_4bit:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )
        model = prepare_model_for_kbit_training(model)
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

    # ── 3. Configure LoRA ──────────────────────────────────────────────────────
    # Target the attention projection matrices — the most impactful layers for
    # style/tone adaptation without changing the model's core knowledge
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=[
            "q_proj", "v_proj",          # Query and value projections (primary)
            "k_proj", "o_proj",          # Key and output projections
            "gate_proj", "up_proj",      # MLP layers (helps with JSON output format)
        ],
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    # Expected output: ~1-2% of parameters trainable (~80-160M of 7B)

    # ── 4. Load and format datasets ────────────────────────────────────────────
    train_raw = load_jsonl(args.train_data)
    eval_raw  = load_jsonl(args.eval_data)

    train_texts = [format_chat_prompt(ex, tokenizer) for ex in train_raw]
    eval_texts  = [format_chat_prompt(ex, tokenizer) for ex in eval_raw]

    train_dataset = Dataset.from_dict({"text": train_texts})
    eval_dataset  = Dataset.from_dict({"text": eval_texts})

    print(f"\n   Train examples: {len(train_dataset)}")
    print(f"   Eval examples:  {len(eval_dataset)}")

    # ── 5. Training arguments ──────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        fp16=True,
        logging_steps=10,
        eval_steps=100,
        save_steps=200,
        evaluation_strategy="steps",
        save_strategy="steps",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        report_to="wandb" if args.wandb_project else "none",
        run_name=f"reviewai-lora-r{args.lora_r}",
        optim="paged_adamw_32bit",       # Memory-efficient optimizer
        dataloader_num_workers=4,
        group_by_length=True,            # Reduces padding, speeds up training ~20%
    )

    # ── 6. SFT Trainer ─────────────────────────────────────────────────────────
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        dataset_text_field="text",
        max_seq_length=args.max_seq_len,
        packing=True,     # Pack multiple short examples into one sequence for efficiency
    )

    # ── 7. Train ───────────────────────────────────────────────────────────────
    print("\n🏋️  Starting training...")
    trainer.train()

    # ── 8. Save the LoRA adapter ───────────────────────────────────────────────
    adapter_path = Path(args.output_dir) / "adapter"
    trainer.model.save_pretrained(adapter_path)
    tokenizer.save_pretrained(adapter_path)

    print(f"\n✅ Training complete!")
    print(f"   Adapter saved to: {adapter_path}")
    print(f"   Adapter size: {sum(f.stat().st_size for f in adapter_path.rglob('*')) / 1e6:.1f} MB")
    print(f"\nTo use the fine-tuned model:")
    print(f"   from peft import PeftModel")
    print(f"   model = AutoModelForCausalLM.from_pretrained('{args.base_model}', ...)")
    print(f"   model = PeftModel.from_pretrained(model, '{adapter_path}')")


if __name__ == "__main__":
    main()
