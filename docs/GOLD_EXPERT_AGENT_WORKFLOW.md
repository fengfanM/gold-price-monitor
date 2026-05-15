# 黄金贵金属专家系统 Agent 工作流

> 用途：把长期知识库拆解为可并行推进的开发工作流。每个 agent 交付后必须验收，通过后才进入主系统。

## 1. Agent 总览

| Agent | 目标 | 主要文件/模块 | 验收标准 |
| --- | --- | --- | --- |
| data-agent | 接入权威数据源并监控健康 | `market-providers.ts`、`market-context.ts` | 数据真实、状态透明、失败可降级 |
| macro-agent | 构建黄金宏观周期模型 | `market-context.ts`、docs | 实际利率/美元/通胀/央行购金可解释 |
| pattern-agent | 图表形态识别 | `patterns.ts`、`App.tsx` | 形态有确认条件、失效价和测试 |
| strategy-agent | 买卖评分和专家团 | `strategy.ts` | 强信号有门槛、风险、解释 |
| backtest-agent | 回测和归因 | `backtest.ts` | 胜率、基准、PF、回撤、分桶 |
| risk-agent | 仓位、止损、停盘规则 | `strategy.ts`、新风控模块 | 单笔亏损、仓位、事件风险可控 |
| event-agent | 事件驱动模型 | 新事件模块 | CPI/FOMC/非农窗口可降级 |
| ui-agent | 专业终端 UI | `App.tsx`、`App.css` | 小白能看懂，专业用户能验证 |
| review-agent | 复盘系统 | 新复盘模块 | 日/周/月复盘指标完整 |

## 2. 当前优先队列

### P0：知识库入库

- 已完成：核心知识库 `GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`。
- 已完成：模型集成计划 `GOLD_TRADING_MODEL_INTEGRATION_PLAN.md`。
- 已完成：机器记忆 `gold_precious_metals_expert_memory.json`。

### P1：M5.2 K 线形态库

- 新增锤子线、倒锤子、吞没、十字星、启明星、黄昏星。
- 每个形态输出：方向、置信度、确认条件、失效价。
- 加入单元测试和图表 marker。

### P2：M6 多周期共振

- 计算 1m/5m/15m/60m 趋势、动量、形态状态。
- 输出共振矩阵和冲突解释。
- 小周期逆大周期时自动降权。

### P3：M9 分桶回测

- 按形态、周期、行情状态、时段、事件窗口分桶。
- 输出合格信号胜率、基准胜率、Profit Factor、MAE/MFE。
- 样本不足禁止放大强信号。

### P4：M8 交易计划助手

- 输出入场区、止损、TP1、TP2、失效条件、仓位。
- 加入风险收益比和账户亏损红线。

### P5：M7 事件模型

- 接 CPI、PCE、非农、FOMC、地缘事件。
- 大事件前后动态调整仓位、止损和信号等级。

## 3. 每次开发前必须读取的记忆

- `memory/gold_precious_metals_expert_memory.json`
- `docs/GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md`
- `docs/GOLD_TRADING_MODEL_INTEGRATION_PLAN.md`
- `DATA_SOURCE_AUDIT.md`
- `REFERENCE_RESEARCH_PLAN.md`

## 4. 强信号验收清单

- 是否有权威数据源支持。
- 是否有宏观因子解释。
- 是否与大周期趋势冲突。
- 是否有形态/技术确认。
- 是否有选择性回测胜率。
- 是否有基准胜率对照。
- 是否有止损、止盈和失效条件。
- 是否满足至少 2:1，优先 3:1 的风险收益比。
- 是否避开重大事件高风险窗口。
- 是否在关键数据源失败时降级。

## 5. 禁止事项

- 禁止为了让页面好看虚增胜率。
- 禁止无样本强行给高可信度。
- 禁止没有止损的买点。
- 禁止只凭单一指标触发强提醒。
- 禁止把长线保值逻辑套用到短线投机。
- 禁止忽略实际利率、美元和美债。

## 6. 后续开发验证命令

```bash
npm run test --workspace server
npm run build --workspace server
npm run lint --workspace web
npm run build --workspace web
```

