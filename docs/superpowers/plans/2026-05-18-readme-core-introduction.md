# README Core Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `README.md` from a feature list into a professional, evidence-chain project introduction covering data calibration, prediction advisors, buy/sell-point logic, model validation, and risk boundaries.

**Architecture:** Keep implementation limited to documentation. Use README-native Markdown and Mermaid diagrams so GitHub can render the architecture without external image assets. Maintain strict separation between implemented capabilities, optional external-model integrations, and research roadmap items.

**Tech Stack:** Markdown, Mermaid, project docs, TypeScript source truth from `apps/server`.

---

### Task 1: Evidence Boundary Review

**Files:**
- Read: `README.md`
- Read: `docs/EXTERNAL_MODEL_ITERATION_LOG.md`
- Read: `docs/GOLD_MODEL_UPGRADE_RESEARCH.md`
- Read: `docs/MODEL_CARD.md`
- Read: `docs/ARCHITECTURE.md`
- Read: `apps/server/src/model.ts`
- Read: `apps/server/src/external-model-advisor.ts`
- Read: `apps/server/src/backtest.ts`
- Read: `apps/server/src/strategy.ts`

- [x] **Step 1: Confirm implemented model claims**

Implemented claims allowed in README:

```text
Local probability model: rules-calibrated-logit-v1.
External advisor: HTTP schema and optional provider endpoints.
External gate: bucket monitor with insufficient/weak/neutral/strong states.
Buy signal: multi-factor rule-and-gate strategy with score caps.
```

- [x] **Step 2: Confirm non-claims**

Claims not allowed in README:

```text
High-accuracy trading model.
Production TimesFM/Moirai deployment.
Automatic trading.
Chronos proven to improve ICBC accumulation gold returns.
Historical NBP PLN/g validation as ICBC CNY/g validation.
```

### Task 2: README Structure

**Files:**
- Modify: `README.md`

- [x] **Step 1: Replace feature-list framing**

Use a research-terminal framing:

```markdown
Gold Price Monitor is an explainable gold decision terminal for ICBC accumulation gold and RMB gold reference prices.
It combines multi-source calibration, local probability scoring, optional external time-series advisors, walk-forward-style bucket validation, and risk-first trade-plan generation.
```

- [x] **Step 2: Add six paper-style figures**

Figures to add:

```text
Fig.1 Explainable decision terminal
Fig.2 Multi-source calibration and health
Fig.3 External advisors as calibrated evidence
Fig.4 Market state to trade plan
Fig.5 Historical/live validation loop
Fig.6 Beginner signal-to-action path
```

### Task 3: Model and Decision Logic Rewrite

**Files:**
- Modify: `README.md`

- [x] **Step 1: Add model taxonomy**

Describe:

```text
Local strategy engine.
Local probability model.
External time-series advisor HTTP interface.
External model bucket gate.
Expert/advisor presentation layer.
```

- [x] **Step 2: Add current evidence state**

Include:

```text
Chronos-Bolt has been verified as an optional local service in one experiment.
Historical validation recorded 48.33% direction win rate vs 55.00% baseline on an NBP PLN/g fallback dataset.
Live bucket samples are insufficient, so external advisors are currently evidence only, not trade amplifiers.
```

### Task 4: Verification

**Files:**
- Verify: `README.md`
- Verify: `docs/superpowers/plans/2026-05-18-readme-core-introduction.md`

- [x] **Step 1: Render sanity**

Run:

```bash
npx markdown-link-check README.md
```

Expected:

```text
All internal links resolve, or document unavailable optional external links if the tool is absent.
```

- [x] **Step 2: Repository status**

Run:

```bash
git diff --check
git status --short
```

Expected:

```text
No whitespace errors; only README/plan documentation changes are present.
```
