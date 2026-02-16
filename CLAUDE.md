# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

whoishiring-insight collects recruitment data from ruanyf/weekly's "谁在招人" GitHub issues, parses them with AI into structured data, and renders interactive visualizations. Data pipeline: **fetch → parse → aggregate → frontend**.

## Commands

```bash
pnpm dev            # Astro dev server
pnpm build          # Static site build (output: dist/)
pnpm preview        # Preview built site locally

pnpm run fetch      # Stage 1: GitHub API → data/raw/ (needs GITHUB_TOKEN)
pnpm run parse      # Stage 2: AI parse → data/parsed/ (needs ZHIPU_API_KEY)
pnpm run aggregate  # Stage 3: Normalize & aggregate → src/data/
pnpm run update     # Run all 3 stages sequentially

pnpm cf:preview     # Cloudflare Pages local preview
```

Environment variables for data pipeline (set in `.env`):
- `GITHUB_TOKEN` — GitHub API access
- `ZHIPU_API_KEY` — AI model provider key
- `AI_MODEL` — Model identifier (default: `zhipu:glm-4-flash`)

## Architecture

### Data Pipeline (`scripts/`)

Three independent stages, each reads the previous stage's output:

1. **fetch.ts** — Octokit GraphQL pulls comments from ruanyf/weekly issues. Incremental: skips closed issues, only fetches new comments. Output: `data/raw/{issueNumber}.json`

2. **parse.ts** — Vercel AI SDK (`ai` v6) with multi-provider support. Batch processes 5 comments per API call. Classifies each as `hiring`/`job_seeking`/`other` and extracts structured fields. Incremental: skips already-parsed comments, auto-retries errors. Output: `data/parsed/{issueNumber}.json`

3. **aggregate.ts** — Heavy normalization (300+ tech synonyms, 700+ noise terms, city district→city mapping, salary text→buckets). Generates 6 JSON files to `src/data/` for the frontend.

### Frontend

**Stack:** Astro 5 (static output) + Svelte 5 + ECharts 6 + Tailwind CSS 4

Single-page layout (`src/pages/index.astro`) with 5 sections: Overview, Trends, Cities, Tech Stack, Companies. Navigation uses anchor links with `IntersectionObserver` for active section highlighting.

**Chart component pattern** (`src/components/charts/*.svelte`):
- Svelte 5 runes: `$props()`, `$derived()`, `$effect()`
- ECharts initialized in `onMount`, auto-resized via `ResizeObserver`
- Dark mode reactivity via `MutationObserver` on `document.documentElement`
- Only the overview chart uses `client:load`; all others use `client:visible` for lazy loading

**TimeRangeFilter** dispatches a global `CustomEvent('timerange-change')` — trend charts listen to this DOM event. No chart component modifications needed when adding/removing the filter.

### Deployment

Cloudflare Pages via GitHub Actions. Two workflows:
- `deploy.yml` — Triggers on push to main, builds and deploys
- `weekly-update.yml` — Scheduled every Friday 09:00 CST, runs full pipeline then deploys

## Key Technical Decisions

- **AI model choice:** Use non-reasoning models (e.g. `glm-4-flash`) for JSON extraction. Reasoning models (GLM-4.7/5) waste tokens on `reasoning_content`.
- **Vercel AI SDK v6 + third-party OpenAI-compatible APIs:** Must use `provider.chat(modelName)` to hit `/chat/completions` endpoint. The default `provider(modelName)` uses `/responses` which third-party APIs don't support.
- **Normalization in aggregate.ts** is the data quality layer. `TECH_SYNONYMS` (lowercase key → canonical name), `NOISE_TERMS` (filtered out), `normalizeCity()` (district/province → city), and a 4+ Chinese character heuristic filter. Changes here require re-running `pnpm run aggregate`.
- **ruanyf's own comments** are HTML summary tables that cause model output overflow — filtered in parse.ts.
- **`.env` loading in shell:** Use inline extraction `ZHIPU_API_KEY=$(grep '^ZHIPU_API_KEY=' .env | cut -d= -f2-)` rather than `source .env`.
