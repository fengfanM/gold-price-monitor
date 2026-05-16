# 外部模型迭代记录

本文档用于持续记录 Chronos-Bolt、TimesFM、Moirai 等外部时序模型在黄金积存金系统中的接入状态、验证指标、预测准确率、分桶表现和策略权重结论。

## 当前结论

- 当前主力外部模型：`Chronos-Bolt`
- 当前模型名称：`amazon/chronos-bolt-base`
- 当前 provider：`chronos`
- 当前运行方式：本机 HTTP 推理服务 `http://127.0.0.1:8000/forecast`
- 当前模型状态：已跑通真实 Chronos，`chronosLoaded=true`
- 当前 fallback 状态：`fallbackEnabled=false`，未使用波动率 fallback 冒充模型
- 当前策略权重：观察军师，不放大买点
- 当前 gate 结论：live 同类分桶样本仍不足，暂不参与评分放大
- 当前风险判断：历史验证偏谨慎，不能宣传为“高准确率模型”，必须继续积累 live 样本
- 最新研究文档：`docs/GOLD_MODEL_UPGRADE_RESEARCH.md`

## 当前预测军师实现总结

当前预测军师采用“外部时序模型 + 本地 gate”的两段式设计：

- 模型层：本机 Chronos-Bolt HTTP 服务接收价格上下文和本地特征，返回 `upProbability`、`confidence`、`forecastPrice` 和解释摘要。
- 接入层：主服务读取外部模型输出，把 provider、模型状态和方向概率写入 backtest/live snapshots。
- 评估层：按 provider、horizon 和场景分桶，观察胜率、超额胜率、Profit Factor、Brier Score、MAE 和 reliability。
- 策略层：当前只展示和记录，不允许单独放大买点；只有样本充足、强桶成立且与本地规则共振时，才考虑低权重加分。

核心原理：

- Chronos 原始模型把时间序列缩放、量化成 token，再用语言模型式架构学习序列分布。
- Chronos-Bolt 是 patch-based 变体，把历史序列切成 patch，经 encoder 表示后直接生成多步分位数预测，适合做概率区间和方向概率。
- 系统没有直接相信模型输出，而是把模型当作“候选概率特征源”，通过 live gate 判断它在黄金积存金口径下是否真的有效。

当前短板：

- 历史验证口径仍非工银积存金 `CNY/g`，NBP `PLN/g` 只能做离线预热。
- live 分桶样本仍不足，当前 `evaluatedSamples=0`，不能给 provider 强弱结论。
- 历史方向胜率 `48.33%` 低于基准 `55.00%`，暂未证明方向优势。
- Brier Score `0.258` 接近弱桶风险线，概率校准还不够稳。
- 输入仍偏单变量，尚未系统纳入 `XAU/USD`、`USD/CNY`、AU9999、美元指数、美债实际利率、上海金溢价、宏观事件等外生变量。
- 目前缺少 TimesFM、Moirai、TimeGPT、本地 PatchTST/TFT 等独立军师对照，无法判断 Chronos 输出是否具有模型家族稳定性。

## 运行快照

记录时间：`2026-05-16T18:32:05.074Z`

Chronos 服务验证：

```json
{
  "ok": true,
  "health": {
    "ok": true,
    "provider": "chronos",
    "model": "amazon/chronos-bolt-base",
    "chronosLoaded": true,
    "fallbackEnabled": false
  },
  "forecast": {
    "upProbability": 0.5901,
    "confidence": 52,
    "forecastPrice": 1001.7906,
    "summary": "Chronos-Bolt 给出 60 分钟方向概率 59%。"
  }
}
```

主服务接入验证：

```text
status: live
provider: chronos
upProbability: 0.5064
```

说明：

- `0.5901` 来自验证脚本的固定测试 payload。
- `0.5064` 来自主服务实时行情上下文，代表当前工银积存金场景下的 Chronos 输出。
- 两者不同是正常的，因为输入 context、latestPrice 和 features 不同。

## Live 分桶状态

当前 `/api/backtest` 的 `externalModel` 摘要：

```json
{
  "sampleSize": 500,
  "evaluatedSamples": 0,
  "liveCoverage": 0.294,
  "summary": "外部模型 live 样本 147/500，但分桶样本仍不足，继续积累后再评估权重。"
}
```

当前观察结论：

- `liveCoverage=29.4%` 表示历史 backtest snapshots 中已有一部分外部模型 live 输出。
- `evaluatedSamples=0` 表示按当前 horizon 和分桶规则，尚未形成足够可评价的 provider 分桶样本。
- `provider:chronos` 目前还不能判强桶或弱桶。
- 在 `provider:chronos` 同类场景达到 `10-20` 个 qualified samples 前，Chronos 只展示、不放大。

## 历史验证

历史验证报告路径：

```text
reports/historical-gold-validation.json
```

历史数据源：

```json
{
  "provider": "nbp-official-gold",
  "symbol": "NBP_GOLD_PLN_G",
  "unit": "PLN/g",
  "years": 10,
  "candles": 2521,
  "firstTimestamp": "2016-05-16T00:00:00.000Z",
  "lastTimestamp": "2026-05-15T00:00:00.000Z"
}
```

说明：

- 脚本优先尝试 Yahoo `GC=F`。
- 当前网络环境下 Yahoo 返回 `403`，因此自动切换到 NBP 官方黄金价格。
- NBP 是官方黄金价格序列，但口径是 `PLN/g`，不是工银积存金 `CNY/g`，所以只能做离线预热，不可直接代表实盘准确率。

历史验证配置：

```json
{
  "contextPoints": 128,
  "stride": 5,
  "maxSamples": 60,
  "horizonDays": 1
}
```

历史验证指标：

```json
{
  "sampleSize": 60,
  "winRate": 0.48333333333333334,
  "baselineWinRate": 0.55,
  "excessWinRate": -0.06666666666666671,
  "averageReturn": 0.0011915143032371004,
  "profitFactor": 1.4422841994631415,
  "brierScore": 0.2577112058333333,
  "averageConfidence": 31.783333333333335
}
```

历史验证解读：

- 方向胜率 `48.33%`，低于同期自然上涨基准 `55.00%`。
- 超额胜率 `-6.67%`，说明在该历史口径和参数下，Chronos 方向判断没有击败基准。
- Profit Factor `1.44`，说明盈亏结构并非完全无效，但不能抵消方向胜率不足的问题。
- Brier Score `0.258`，接近弱桶风险线，概率校准需要继续观察。
- 平均置信度 `31.78`，说明模型自身输出偏谨慎，短期不应提升权重。

历史验证结论：

- 不能把当前历史验证结果解释为“模型已显著提高买卖点准确率”。
- 当前应把 Chronos 定位为观察军师和候选特征源，而不是交易放大器。
- 后续需要用工银积存金 live 样本、AU9999/人民币黄金口径历史样本继续复核。

## 强弱桶规则

强桶候选条件：

- `qualifiedSamples >= 20`
- `reliability >= 55`
- `excessWinRate >= 0`
- `profitFactor >= 1.05`
- 当前模型看多且本地规则也看多

弱桶拦截条件：

- `qualifiedSamples >= 10`
- `reliability < 45`，或
- `excessWinRate < 0`，或
- `profitFactor < 1.05`，或
- `brierScore > 0.26`

当前策略动作：

- 样本不足：`weightMultiplier=0`
- 弱桶：`weightMultiplier=0`
- 中性桶：最多 `0.35x` 低权重参考
- 强桶且本地共振：允许低权重小幅加分

## 观察清单

每日或每次长时间运行后检查：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8788/api/backtest
```

重点看：

- `externalModel.liveCoverage`
- `externalModel.evaluatedSamples`
- `externalModel.buckets` 中 `provider:chronos`
- `externalModel.bestBuckets`
- `externalModel.weakBuckets`
- `winRate`
- `baselineWinRate`
- `excessWinRate`
- `profitFactor`
- `brierScore`
- `mae`
- `reliability`

## 迭代计划

短期：

- 保持本机 Chronos 服务运行，继续积累 live snapshots。
- 观察 `provider:chronos` 是否进入可评价分桶。
- 不允许 Chronos 单独放大买点。
- 继续记录历史验证和 live 分桶变化。

中期：

- 接入更贴近交易口径的数据源：AU9999、人民币黄金、银行积存金历史 K 线。
- 将历史验证按 `sampleOrigin=historical` 固定隔离，不写入 live gate。
- 将 live 样本和 historical 样本分开展示，避免历史拟合污染实盘判断。

长期：

- 并行接入 `TimesFM` 和 `Moirai`。
- 通过 `provider:chronos`、`provider:timesfm`、`provider:moirai` 分桶比较稳定性。
- 用 live 胜率、超额胜率、Profit Factor、Brier、MAE 和最大回撤筛选最适合黄金积存金的军师。

## 外部模型升级路线摘要

完整研究见：`docs/GOLD_MODEL_UPGRADE_RESEARCH.md`

优先级建议：

1. `Chronos-2` 协变量评估：官方仓库已标注 Chronos-2 支持 univariate、multivariate 和 covariate-informed forecasting，适合在当前 Chronos-Bolt 服务旁边开新 provider 做同口径对照。
2. `TimesFM` 零样本对照：Google Research 官方仓库标注 TimesFM 2.5 支持长上下文、分位数预测和 XReg 协变量，可作为第二个基础模型军师。
3. `NeuralForecast` 本地监督基线：用 `NHITS`、`PatchTST`、`TFT` 在 AU9999/积存金历史数据上做 walk-forward，对照零样本模型是否真有优势。
4. `TimeGPT` 云端强基线：适合作为 cross-validation、prediction intervals 和 fine-tuning 参照，但要评估 API 成本、数据出境和供应商依赖。
5. `FinGPT` 只做文本事件特征：可提取央行购金、FOMC、CPI、地缘风险等事件方向，不能直接输出交易动作。
6. `FinRL` 放到最后：只在预测概率已经稳定后，用于仓位、交易成本和回撤约束仿真，不提前用 RL 追求回测收益。

适合黄金买卖点系统的目标输出：

- 不以单点预测价为核心，而以 `方向概率 + 分位数区间 + 不确定性 + regime 分桶表现 + 本地规则共振` 为核心。
- 任一新 provider 默认 `observe/paper`，不参与生产加分。
- 每个 provider+horizon+regime 至少 `30` 个 qualified samples 才给研究结论，`50` 个以上才允许低权重候选，`100` 个以上且两个滚动窗口稳定才考虑小幅策略加分。
- 弱桶条件仍优先于短期收益：`excessWinRate < 0`、`profitFactor < 1.05`、`brierScore > 0.26` 任一触发即回观察。

## 迭代日志

### 2026-05-16 - Chronos-Bolt 本机真实模型跑通

- 完成 `services/chronos-bolt` 本机服务启动。
- 修复 Python 3.9 兼容问题。
- 修复 `numpy` 版本约束问题。
- 确认 `chronosLoaded=true`。
- 确认 `fallbackEnabled=false`。
- 主服务 `8788` 成功接入 Chronos `/forecast`。
- 前端通过 `VITE_API_PROXY_TARGET=http://localhost:8788` 指向 Chronos live 主服务。
- 新增 10 年历史验证脚本 `npm run validate:historical`。
- 完成 60 个 historical 样本离线验证。
- 当前结论：历史验证偏谨慎，Chronos 短期只做观察军师，不放大交易权重。

### 2026-05-17 - 外部模型升级研究与路线收敛

- 梳理当前预测军师实现：Chronos-Bolt 本机服务作为外部概率特征源，主服务负责接入、快照、分桶和 gate。
- 明确当前短板：live 可评价样本不足、历史口径不匹配、方向胜率未跑赢基准、概率校准偏弱、外生变量不足。
- 研究并对比 TimeGPT、Chronos/Chronos-2、TimesFM、Moirai、PatchTST、TFT、NeuralForecast、FinRL、FinGPT。
- 新增研究文档 `docs/GOLD_MODEL_UPGRADE_RESEARCH.md`，记录模型对比、数据需求、验证方式和可落地路线。
- 结论：短期不改生产权重，优先做 Chronos-2 协变量评估和 TimesFM 零样本对照；中期用 NeuralForecast 建本地 PatchTST/TFT 基线；FinGPT/FinRL 只放在特征层和策略层后置验证。
