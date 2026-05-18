# Gold Intraday Kline Knowledge Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the precious-metals expert knowledge base with precise intraday chart, candlestick, and pattern-recognition rules that reduce false buy/sell decisions.

**Architecture:** Keep the knowledge base as the single source of trading-domain rules, then map every rule to model features, hard gates, labels, and failure-review fields. The first implementation is documentation-only, but every added concept must be convertible into code and backtest labels.

**Tech Stack:** Markdown knowledge base, TypeScript server strategy/pattern modules, Node test/build pipeline, future walk-forward labeler.

---

### Task 1: Baseline Audit And Source Grounding

**Files:**
- Read: `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`
- Read: `apps/server/src/patterns.ts`
- Read: `apps/server/src/strategy.ts`
- Create: `docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md`

- [ ] **Step 1: Identify current knowledge gaps**

Current gaps to address:

```text
1. 分时图缺少开盘、欧盘、美盘、事件前后、真假突破、回撤反抽的硬规则。
2. K线形态缺少候选、确认、失效、目标、禁止误判条件。
3. 支撑阻力缺少“区域”思维、触达次数、突破后角色互换、波动率容忍带。
4. 没有把形态知识映射到 labels/backtest/finalDecision gates。
5. 容易把“漂亮形态名称”误当成“可交易信号”。
```

- [ ] **Step 2: Ground rules in conservative references**

Use the following source principles:

```text
CME technical analysis: OHLC/candlestick is objective, pattern interpretation is subjective and needs confirmation.
CME support/resistance: support/resistance are zones, not exact prices; moving averages, prior highs/lows, key levels, trend lines matter.
Fidelity support/resistance: support/resistance reflects supply-demand psychology and can reverse roles after breaks.
Park & Irwin review: technical rules can show evidence in futures/FX, but data snooping, ex-post rule selection, risk and transaction costs are major pitfalls.
scikit-learn calibration: predicted probability must be calibrated and checked with reliability curves/Brier-style scoring before being displayed as confidence.
```

- [ ] **Step 3: Save implementation plan**

Expected result:

```text
Plan saved at docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md
```

### Task 2: Add Intraday Time-Sharing Knowledge

**Files:**
- Modify: `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`

- [ ] **Step 1: Add a section under “5. 黄金技术分析体系”**

Add subsections covering:

```text
5.5 分时图读盘框架
5.6 分时趋势判定
5.7 真假突破与假跌破
5.8 交易时段权重
5.9 分时信号禁止强提醒清单
```

- [ ] **Step 2: Ensure every intraday rule has fields**

Each rule must include:

```text
观察对象、候选条件、确认条件、失效条件、禁止误判场景、可量化字段。
```

- [ ] **Step 3: Add implementation mapping**

Each added rule should map to future fields such as:

```text
session_regime
intraday_trend_state
breakout_quality
retest_quality
false_breakout_risk
event_noise_level
```

### Task 3: Add Candlestick And Pattern Hard Definitions

**Files:**
- Modify: `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`

- [ ] **Step 1: Add candidate/confirmed grammar**

Every pattern should be described in the same lifecycle:

```text
无效噪音 -> 候选 -> 确认 -> 交易计划 -> 失效/达标 -> 复盘标签
```

- [ ] **Step 2: Define high-priority patterns**

Add rules for:

```text
双底、双顶、支撑反弹、阻力压制、锤子线、射击之星、看涨吞没、看跌吞没、十字星、头肩顶底、箱体、三角形、旗形、楔形。
```

- [ ] **Step 3: Add anti-misclassification rules**

Required filters:

```text
低样本禁判、无颈线禁判、无失效价禁强提醒、事件第一波禁追、均线强反向禁放大、波动率过低禁突破、波动率过高禁追单。
```

### Task 4: Add Backtest And Decision Mapping

**Files:**
- Modify: `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`

- [ ] **Step 1: Add rule-to-label mapping**

Use path-dependent labels:

```text
entry_triggered
first_barrier_hit
max_favorable_excursion
max_adverse_excursion
net_return_after_spread
time_to_confirmation
pattern_failure_reason
```

- [ ] **Step 2: Add strong decision gates**

Strong reminder must require:

```text
data_health pass
anchor_consensus pass
pattern_confirmation pass
timeframe_confluence pass
risk_reward >= 2.5
event_risk not elevated/critical
historical_bucket usable/robust
failure_learning not adverse
```

- [ ] **Step 3: Add a user-facing explanation contract**

Every final decision must answer:

```text
现在做什么？
为什么？
在哪里确认？
错了在哪里退出？
为什么不能重仓？
```

### Task 5: Verify, Commit, Push

**Files:**
- Verify: `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`
- Verify: `docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md`

- [ ] **Step 1: Run markdown sanity checks**

Run:

```bash
rg -n "100%|稳赚|必赚|一定上涨|一定下跌" docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md
```

Expected:

```text
No unsafe guarantee language except explicit anti-guarantee explanation if present.
```

- [ ] **Step 2: Inspect diff**

Run:

```bash
git diff -- docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md
```

Expected:

```text
Only documentation changes for this task.
```

- [ ] **Step 3: Commit and push**

Run:

```bash
git add docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md docs/superpowers/plans/2026-05-19-gold-intraday-kline-knowledge.md
git commit -m "Expand gold intraday kline knowledge base"
git push origin codex/gold-price-monitor
```
