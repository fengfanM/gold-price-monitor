# Model Card

本文档说明 Gold Price Monitor 当前预测军师和买卖点判断逻辑的输入、输出、评估指标和风险边界。

## 模型定位

当前系统不是单一预测模型，而是多层决策系统：

- 本地规则模型：负责数据质量、技术指标、形态、估值、事件风险、心理纪律和交易计划。
- 本地概率模型：把短线特征校准成上涨概率和置信度。
- 外部时序模型：通过 HTTP 接入 Chronos-Bolt，后续可并行 TimesFM、Moirai 等 provider。
- 回测分桶 gate：用 live 样本验证模型在同类场景下是否真的提升胜率。

外部模型当前定位为观察军师，不是自动交易模型。

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

外部模型分桶回测使用：

- `qualifiedSamples`
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

## 当前已知结果

首轮 historical 验证使用 NBP 官方黄金价格口径，结果偏谨慎：

- 方向胜率：`48.33%`
- 基准胜率：`55.00%`
- 超额胜率：`-6.67%`
- Profit Factor：`1.44`
- Brier Score：`0.258`

该结果不能代表工银积存金实盘准确率，只能说明当前 Chronos-Bolt 不能直接放大交易权重。

## Gate 规则

强桶候选：

- `qualifiedSamples >= 20`
- `reliability >= 55`
- `excessWinRate >= 0`
- `profitFactor >= 1.05`
- 模型看多且本地规则也看多

弱桶拦截：

- `qualifiedSamples >= 10`
- `reliability < 45`，或
- `excessWinRate < 0`，或
- `profitFactor < 1.05`，或
- `brierScore > 0.26`

## 风险和限制

- 通用时序基础模型没有针对工银积存金交易口径训练。
- 历史数据、live 数据和生产信号必须隔离。
- 短线黄金受宏观事件、流动性、汇率和交易时段影响显著。
- 回测胜率可能因样本不足、幸存者偏差、数据源延迟和未来函数而失真。
- 模型输出只用于观察和研究，不构成投资建议或收益承诺。
