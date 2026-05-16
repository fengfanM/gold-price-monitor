# 黄金买卖点模型升级研究

研究日期：`2026-05-17`

本文档仅研究外部模型和验证路线，不修改前端、后端或交易逻辑。结论面向黄金积存金买卖点系统：先把模型当作可校准的概率特征源，再经过严格回测、live gate 和风险约束，最后才允许进入低权重评分。

## 1. 当前预测军师实现方式

当前系统已接入 `Chronos-Bolt`，模型为 `amazon/chronos-bolt-base`，通过本机 HTTP 推理服务 `http://127.0.0.1:8000/forecast` 提供预测。主服务把实时行情上下文、最新价格和特征送入外部模型服务，模型返回：

- `upProbability`：未来窗口上涨概率。
- `confidence`：模型置信度。
- `forecastPrice`：模型给出的预测价格。
- `summary`：面向展示层的简短解释。

当前接入状态是 `chronosLoaded=true`、`fallbackEnabled=false`，说明运行的是真实 Chronos-Bolt，而不是用波动率规则伪装的 fallback。策略层仍把它定位为“观察军师”：展示输出、积累样本、进入分桶统计，但不放大买点。

## 2. 当前原理

Chronos 系列把时间序列转成可被 Transformer 处理的 token 或 patch 表示。当前使用的 Chronos-Bolt 是 Chronos 的 patch-based 变体：先把历史序列分块输入 encoder，再由 decoder 直接生成多步分位数预测。这种 direct multi-step forecasting 比逐步递推更适合生成完整预测区间，也更快、更省内存。

系统层面的原理可以拆成四层：

- 数据层：工银积存金实时价格和本地技术特征形成 context。
- 模型层：Chronos-Bolt 输出短窗口价格分布和方向概率。
- 校准层：把模型输出落入 provider 分桶，统计胜率、超额胜率、Profit Factor、Brier Score、MAE、reliability。
- 策略层：只有当同类 provider 分桶样本足够、指标稳定且与本地规则共振时，才允许低权重加分。

这套设计的优点是把“模型很强”改成“模型在本系统这个口径下是否可靠”。这对黄金买卖点很关键，因为黄金短线信号经常被美元指数、美债收益率、人民币汇率、央行政策和地缘事件同时驱动，单一价格序列模型很容易在 regime 切换时失效。

## 3. 当前短板

当前短板不是“模型没跑通”，而是“证据链还不够支撑交易放大”。

- 口径不完全匹配：历史验证临时使用 NBP 官方黄金 `PLN/g`，不是工银积存金 `CNY/g`，不能直接代表实盘准确率。
- live 样本不足：`liveCoverage=29.4%`，但 `evaluatedSamples=0`，说明还没有达到可评价分桶门槛。
- 方向胜率未击败基准：历史验证 winRate `48.33%`，低于 baseline `55.00%`，excessWinRate 为负。
- 概率校准偏弱：Brier Score `0.258` 接近弱桶风险线，平均置信度 `31.78` 也说明模型自身偏谨慎。
- 输入信息偏单变量：当前主要依赖价格 context 和少量本地特征，还没有系统纳入美元指数、人民币汇率、美债实际利率、ETF 持仓、央行购金、上海金溢价、交易时段等外生变量。
- horizon 单一：当前主要看 60 分钟或 1 天方向，尚未建立 `15m/30m/60m/1d` 多 horizon 一致性评估。
- 缺少模型 ensemble：目前只有 Chronos-Bolt，一个 provider 的偶然偏差无法被交叉验证。

## 4. 可借鉴模型对比

| 模型/框架 | 类型 | 核心能力 | 对黄金系统的适配度 | 主要风险 |
| --- | --- | --- | --- | --- |
| Chronos-Bolt / Chronos-2 | 时间序列基础模型 | 零样本预测、分位数预测；Chronos-2 官方 repo 标注支持多变量和协变量 | 高。当前已跑通 Bolt，下一步优先评估 Chronos-2 的协变量能力 | 仍需本地口径验证，不能直接相信通用 benchmark |
| TimesFM | Google 时序基础模型 | decoder-only/patched 预训练；官方 repo 当前标注 TimesFM 2.5、长上下文、分位数 head、XReg 协变量、LoRA fine-tuning 示例 | 高。适合做第二个零样本军师，与 Chronos 做分桶对照 | 开源版本官方声明不是受支持 Google 产品；金融短线有效性要实测 |
| TimeGPT | Nixtla 商业 API | 零样本预测、fine-tuning、cross-validation、prediction intervals、外生变量 | 中高。适合作为云端强基线和校准参照 | API 成本、数据出境、供应商依赖；模型细节透明度低 |
| Moirai / uni2ts | Salesforce 时序基础模型 | 多频率、任意变量数、概率分布预测；LOTSA 大规模预训练 | 中高。适合多资产、多变量黄金预测 | 本地部署与推理成本需要评估 |
| PatchTST | 监督/自监督 Transformer | patch token、channel independence、长上下文效率好 | 中高。适合用 AU9999/积存金历史数据做本地可控微调 | 需要足够干净的历史样本，过拟合风险高 |
| TFT | 可解释多 horizon 模型 | 静态/历史/已知未来协变量、变量选择、attention 可解释性 | 高。适合解释“为什么今天不买/少买” | 训练和特征工程更重，需要严格防泄漏 |
| NeuralForecast | 模型库/训练框架 | NHITS、NBEATSx、PatchTST、TFT 等，支持外生变量、概率预测、自动调参 | 高。适合作为统一回测实验台 | 不是单一模型，需要工程化实验管理 |
| FinRL | 强化学习交易框架 | 仓位、交易成本、风险偏好、市场约束建模 | 中。适合策略层，不适合先替代预测层 | RL 容易过拟合回测，必须晚于预测校准 |
| FinGPT | 金融 LLM 框架 | 新闻、研报、财报、情绪、RAG、金融文本理解 | 中。适合生成事件/情绪特征，不适合直接给买卖点 | 文本信号延迟和幻觉风险，需要来源和时间戳约束 |

## 5. 推荐升级路线

### 阶段 0：先固化评估口径

目标：让任何新模型进入同一条评估流水线，而不是单独写 demo。

- 固定数据口径：工银积存金 `CNY/g` live，AU9999/上海金 `CNY/g` 历史，国际金 `XAU/USD`，人民币汇率 `USD/CNY`。
- 固定预测目标：`15m`、`30m`、`60m`、`1d` 的方向、收益率、分位数区间。
- 固定评价指标：direction winRate、baselineWinRate、excessWinRate、Brier、ECE、MAE/MAPE、Profit Factor、max drawdown、turnover、交易成本后收益。
- 固定隔离：historical、paper/live、production 三类样本分开，不允许 historical 样本污染 live gate。

### 阶段 1：Chronos-Bolt 继续观察，同时接 Chronos-2

目标：在最小改动下验证“多变量/协变量是否显著改善黄金短线方向”。

- 保留当前 Chronos-Bolt provider，不改变权重。
- 新增候选 provider 名称建议：`chronos2`，只写入外部模型快照和分桶，不进入加分。
- 输入协变量优先级：`XAU/USD`、`USD/CNY`、`AU9999`、上海金溢价、美元指数、美债 10Y 实际利率、VIX、交易时段。
- 通过相同 horizon 对比 `provider:chronos` 与 `provider:chronos2` 的 excessWinRate、Brier、Profit Factor。
- 晋级条件：同 horizon 同场景 `qualifiedSamples >= 30` 且连续两个滚动窗口不触发弱桶。

### 阶段 2：接入 TimesFM 作为独立零样本军师

目标：验证另一个基础模型家族是否能提供互补信号。

- provider 建议：`timesfm`。
- 先用零样本，不急着 fine-tune，避免在数据口径尚未稳定时过拟合。
- 使用分位数输出构造风险特征：上行概率、下行 `p10` 风险、`p90-p10` 预测不确定性、预测方向和本地趋势是否共振。
- 若 TimesFM 与 Chronos 同向且本地规则同向，才作为“共振候选”；若二者冲突，默认降低外部模型权重。

### 阶段 3：用 NeuralForecast 训练本地监督基线

目标：建立可控、可解释、可复现实验台，避免只依赖大模型零样本。

- 第一批模型：`NHITS`、`PatchTST`、`TFT`。
- 训练标签：未来 `h` 窗口收益率方向、最大回撤、是否触发买点后正收益。
- 特征：价格技术指标、跨市场变量、日历/交易时段、波动率状态、央行/ETF 低频特征。
- 严格使用 walk-forward validation，禁止随机切分。
- 输出必须概率化，并经过 isotonic 或 Platt calibration 后才能进 gate。

### 阶段 4：引入 FinGPT 文本特征，不直接输出交易动作

目标：把宏观和事件信息变成有时间戳的弱特征。

- 输入来源：央行购金新闻、FOMC/非农/CPI、地缘事件、黄金 ETF 持仓评论、国内金价溢价新闻。
- 输出特征：事件方向、置信度、影响窗口、来源可信度、是否已被价格消化。
- 严禁让 LLM 直接决定买卖点。LLM 只能生成结构化事件特征，仍交给时序模型和策略 gate 判断。

### 阶段 5：FinRL 只用于仓位和执行仿真

目标：在预测信号稳定后，再研究仓位，不提前用 RL 追逐回测收益。

- 状态：模型概率、预测区间、当前仓位、成本、波动率、最大回撤。
- 动作：不买、小买、正常买、暂停、减仓。
- 奖励：成本后收益、回撤惩罚、换手惩罚、错过极端下跌后的恢复能力。
- 上线条件：必须在从未参与训练的 out-of-time live/paper 样本上跑赢规则策略。

## 6. 数据需求

### 必须补齐

- 工银积存金分钟级/小时级历史价格，至少覆盖 1-2 年。
- AU9999 或上海金人民币口径历史 K 线，至少覆盖 5-10 年。
- 国际金 `XAU/USD` 或 `GC=F`，用于外盘主趋势。
- `USD/CNY` 或 `USDCNH`，用于人民币计价黄金换算。
- 交易成本、点差、最小买入单位、银行报价刷新频率。

### 强烈建议

- 美元指数 `DXY`。
- 美债 10Y 名义利率与实际利率。
- VIX 或宏观风险代理。
- 上海金和国际金折算价差。
- SPDR Gold Shares ETF 持仓、COMEX 持仓、央行购金月度数据。
- 宏观事件日历：CPI、PCE、FOMC、非农、美国零售销售。

### 数据质量要求

- 所有时间戳统一到一个时区，并保留原始交易市场时区。
- 所有外生变量必须保证“预测时刻已经可见”，避免未来函数。
- 低频数据只能 forward-fill 到可见时间之后，不能提前填入发布日期之前。
- 每个样本记录 `sampleOrigin`、`provider`、`horizon`、`dataVersion`、`featureVersion`、`modelVersion`。

## 7. 验证方式

### 离线验证

- 使用 walk-forward，不使用随机切分。
- 按市场 regime 分桶：趋势/震荡、高/低波动、美元强/弱、人民币升/贬、亚洲/欧美交易时段。
- 每个 provider、horizon、regime 至少 `30` 个 qualified samples 才给方向性结论。
- 除胜率外，必须看 Brier/ECE 概率校准和交易成本后收益。

### live paper 验证

- 新 provider 默认只进入 `paper` 或 `observe`，不改生产权重。
- 每次输出写入不可变快照：输入摘要、模型输出、当前价格、未来结算价格、是否命中。
- live gate 必须按 provider+horizon+regime 独立计算，不能把不同模型混在一起。
- 若 `brierScore > 0.26`、`excessWinRate < 0` 或 `profitFactor < 1.05`，即使胜率短期好看也不放大。

### 上线门槛

- `qualifiedSamples >= 50`：允许进入低权重候选。
- `qualifiedSamples >= 100` 且两个滚动窗口稳定：允许小幅策略加分。
- 任一弱桶条件触发：立即回到观察军师。
- 所有模型加分必须有上限，不能覆盖本地风控规则。

## 8. 关键结论

- 当前 Chronos-Bolt 的价值是“可运行的外部模型基线”，不是已经证明有效的交易引擎。
- 黄金系统最需要的不是再接一个炫技模型，而是统一数据口径、严格 walk-forward、概率校准和 provider 分桶。
- 下一步优先级建议：`Chronos-2 协变量评估` > `TimesFM 零样本对照` > `NeuralForecast 本地 PatchTST/TFT 基线` > `FinGPT 文本特征` > `FinRL 仓位策略`。
- 对买卖点系统最有价值的输出不是单点预测价，而是“方向概率 + 不确定性区间 + regime 分桶表现 + 与本地规则是否共振”。
- 在 live 样本不足前，任何外部模型都只能展示和记录，不能宣传为高准确率模型，不能放大买点。

## 9. 参考资料

- Chronos 官方仓库：https://github.com/amazon-science/chronos-forecasting
- Chronos 论文：https://arxiv.org/abs/2403.07815
- TimesFM 官方仓库：https://github.com/google-research/timesfm
- TimesFM 论文：https://arxiv.org/abs/2310.10688
- TimeGPT 论文：https://arxiv.org/abs/2310.03589
- TimeGPT cross-validation 文档：https://nixtlaverse.nixtla.io/nixtla/docs/tutorials/08_cross_validation
- Moirai 官方介绍：https://www.salesforce.com/blog/moirai/
- Moirai 论文：https://arxiv.org/abs/2402.02592
- PatchTST 论文：https://arxiv.org/abs/2211.14730
- TFT 论文：https://arxiv.org/abs/1912.09363
- NeuralForecast 官方仓库：https://github.com/Nixtla/neuralforecast
- FinRL 论文：https://arxiv.org/abs/2111.09395
- FinGPT 论文：https://arxiv.org/abs/2306.06031
- FinGPT 官方站点：https://fingpt.io/
