# Model Card

本文档说明 Gold Price Monitor 当前预测军师、买卖点判断逻辑、事件风控、概率显示治理和模型晋级边界。

## 模型定位

当前系统不是单一预测模型，而是多层决策系统：

- 本地规则模型：负责数据质量、技术指标、形态、估值、事件风险、心理纪律和交易计划。
- 本地概率模型：把短线特征校准成 TP1 先达倾向和置信度。
- 外部时序模型：通过 HTTP 接入 Chronos-Bolt，后续可并行 TimesFM、Moirai 等 provider。
- 回测分桶 gate：用完整 triple-barrier live 样本验证模型在同类场景下是否真的提升胜率和赔率。
- 决策证据包：用 `decision-evidence-v4` 统一前端口令、状态机、概率展示、数据源健康和关键价。

外部模型当前定位为观察军师和 shadow evidence，不是自动交易模型，也不能覆盖数据健康、事件窗口、赔率和止损纪律。

## 当前外部模型

- Provider：`chronos`
- Model：`amazon/chronos-bolt-base`
- Service：`services/chronos-bolt`
- API：`POST /forecast`
- 主服务配置：`EXTERNAL_TS_MODEL_URL`

输出字段：

- `upProbability`
- `downProbability`
- `confidence`
- `forecastPrice`
- `intervalLow`
- `intervalHigh`
- `summary`
- `rationale`
- `risks`

## 输入特征

当前外部模型主要使用：

- 近期价格序列。
- 最新工银积存金价格。
- 本地规则概率和置信度。
- 24 小时涨跌、回撤、高低点。
- 国内多源锚点偏离和共识偏离。

当前最终策略还会使用，但不一定全部直接喂给 Chronos：

- MA、BOLL、RSI、MACD。
- K线形态和多周期共振。
- 上金所、AU9999、银行参考源。
- 美元、利率、通胀、VIX、ETF、COT、央行购金等宏观因子。
- 新闻和观点因子。
- 事件风险、心理纪律、仓位和止损规则。

## 评估指标

模型评估和前端展示分成两层：内部可以记录细粒度概率，前端只有在校准和样本门槛通过时才允许显示精确数字。外部模型分桶回测使用：

- `qualifiedSamples`
- `completeSamples`
- `incompleteSampleRate`
- `winRate`
- `baselineWinRate`
- `excessWinRate`
- `averageReturn`
- `profitFactor`
- `maxDrawdown`
- `mae`
- `mfe`
- `brierScore`
- `calibrationError`
- `reliability`

关键分桶维度：

- 模型概率区间。
- 模型置信度。
- 模型与本地规则是否共振。
- 交易时段。
- K线形态。
- 事件窗口。
- 宏观环境。
- 估值水位。
- 数据源健康。
- horizon。
- provider。

## Probability Display Policy

页面不把未校准概率包装成“胜率”。以下任一条件成立时，全站隐藏精确概率，只展示“样本不足 / 概率隐藏 / 方向倾向”：

- 完整 triple-barrier 样本少于 30。
- `complete=false` 或 `timeout` 样本比例过高。
- Brier score、校准误差或 Profit Factor 未达最低门槛。
- 事件第一波、关键源异常、主交易价 stale、参考源偏离不可解释。
- 触发价已错过、TP1/止损无效、赔率不足或形态仍是 candidate。

这条规则牺牲了“看起来很聪明”的数字密度，换来更低的误导风险。

## 当前已知结果

首轮 historical 验证使用 NBP 官方黄金价格口径，结果偏谨慎：

- 方向胜率：`48.33%`
- 基准胜率：`55.00%`
- 超额胜率：`-6.67%`
- Profit Factor：`1.44`
- Brier Score：`0.258`

该结果不能代表工银积存金实盘准确率，只能说明当前 Chronos-Bolt 不能直接放大交易权重。

## Gate 规则

强桶候选和模型晋级：

- `qualifiedSamples >= 30`
- `completeSamples >= 30`
- `reliability >= 55`
- `excessWinRate >= 0`
- `profitFactor >= 1.05`
- 模型看多且本地规则也看多

弱桶拦截：

- `qualifiedSamples >= 10` 且表现可判定，或
- `reliability < 45`，或
- `excessWinRate < 0`，或
- `profitFactor < 1.05`，或
- `brierScore > 0.26`

状态解释：

| Status | Meaning | Strategy use |
| --- | --- | --- |
| `shadow` | 新模型、低样本或未校准 | 展示和记录，不加权 |
| `blocked` | 同类桶表现弱或风险指标失败 | 权重为 0 |
| `low_weight` | 没有明显反证但证据不足 | 低权重参考 |
| `promoted` | 样本、校准、PF、回撤和本地共振通过 | 允许小幅加分，仍不能覆盖风控 |

## Decision Output Semantics

| Output | Meaning |
| --- | --- |
| `singleCommand` | 用户 3 秒内应读懂的一句话动作 |
| `executionState=trigger_missed` | 机会已错过，不追，等待回踩或新结构 |
| `actionAllowed=false` | 当前只允许观察/复核，不允许包装成可执行买点 |
| `validatedLevels` | 只有通过当前价和方向校验的关键价才可绘制 |
| `blockedReasons` | 明确告诉用户是数据、事件、赔率、样本、形态还是心理纪律在否决 |

## 风险和限制

- 通用时序基础模型没有针对工银积存金交易口径训练。
- 历史数据、live 数据和生产信号必须隔离。
- 短线黄金受宏观事件、流动性、汇率和交易时段影响显著。
- 回测胜率可能因样本不足、幸存者偏差、数据源延迟和未来函数而失真。
- RSS 情绪、估算事件和离线镜像只做解释/降级，不构成实时交易依据。
- GLD、LBMA、CME 等专业数据在未配置官方/授权源时必须保持 unavailable，不能用网页抓取结果冒充生产证据。
- 模型输出只用于观察和研究，不构成投资建议或收益承诺。
