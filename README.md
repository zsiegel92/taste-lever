# TasteLever - Extremely Minimal Prompt Optimization For Single-Token Classification or Scoring Tasks

If you have some labeled data and want to align an LLM to score targets like this:
```json
{
	data: {
		...
	},
	target: {
		myScore: 1
	}
}
```
where the value of `myScore` consists of a single token (e.g. any digit, or `Yes`, `No`, `True`, `False`, etc.), then this library is for you.

## Features
- Dead-simple prompt template (believe me this is all you need) consisting of:
    - system prompt
    - instructions that precede few-shot examples
    - instructions that follow few-shot examples but precede the test case
    - instructions that follow the test case
- Few-shot examples selected strategically using LLM confidence (using log probabilities on logits corresponding to target class token)
- JSON schema generated dynamically and referened in final prompt artifacts, which are stored as `.json` files (JSON prompt artifacts are linted in your IDE using JSON Schema `$schema: ` references to `file://` URIs generated in your workspace).

## Usage

```bash
npm i
npm run script app/main.ts
```

This compiles prompts using training/test data from `datasets/` and outputs optimized prompts to `test-results/`.