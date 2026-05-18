# 参考项目研究与最强投资网站升级计划

## 克隆结果

参考仓库已统一克隆到：

```text
../reference-investment-repos
```

本轮 15 个仓库均已成功 clone：

- `fortune`
- `gold-dashboard`
- `FinanceNote`
- `a-great-fund-valuation-system`
- `HammerAI_Agent`
- `gold-price`
- `gold_sent_analyze`
- `gold-insight`
- `gold-price-monitor`
- `-WOA-RF-MIP-LSTM-LSTM-MAP-`
- `996Quant`
- `mfm_learner`
- `alphalab`
- `qstock`
- `learn_backtrader`

## 核心吸收结论

### 1. 黄金宏观因子体系

主要参考：`gold-dashboard`、`gold-insight`、`FinanceNote`

可迁移能力：

- FRED 宏观因子：`DFII10` 10Y TIPS 实际利率、`DGS10` 10Y 名义利率、`T10YIE` 通胀预期、`VIXCLS` VIX、`DFF` 联邦基金利率、`WALCL` 美联储资产负债表、`T10Y2Y` 收益率曲线。
- 黄金核心驱动：实际利率下行、美元走弱、通胀预期上行、VIX 避险升温、收益率曲线倒挂、流动性扩张。
- 资金与仓位：CFTC COT 投机净多头、GLD ETF 资金流、金银比、GDX/金矿股相对表现。
- 规则库：18 条黄金看多/看空规则、6 轴雷达、风险矩阵、短中长期走势预期。

对当前网站的价值：

- 把“工银积存金买点”从单一价格/K线，升级为“人民币黄金报价 + 国际黄金 + 利率 + 美元 + 通胀 + 避险 + 资金仓位”的多因子系统。
- 页面可新增“黄金宏观驾驶舱”，解释买点背后的宏观支撑或压制。

### 2. 多周期预测与 Walk-forward 验证

主要参考：`fortune`

可迁移能力：

- 1/5/20 日三周期预测，避免只看单一时间尺度。
- 三周期组合模式，例如 `101` 假突破做多、`001` 下跌中继、`111` 一致看涨、`000` 一致看跌。
- Walk-forward 验证，不用训练集漂亮数据欺骗自己。
- 市场情绪过滤器：极端弱势环境下降低交易频率或提高阈值。
- 透明性能监控：准确率、IC、Rank IC、夏普、最大回撤、盈亏比、失败样本。

对当前网站的价值：

- 专家团建议必须带“历史命中率/样本数/最大回撤”，不能只有主观文案。
- 买点信号需要按短线、中线、配置维度分别给出，而不是一个总分打天下。

### 3. 异常检测与风控

主要参考：`fortune`、`qstock`、`mfm_learner`

可迁移能力：

- Z-Score 异常检测：价格、成交量、波动率偏离均值。
- Isolation Forest 多维离群点检测。
- 胜率、Sortino、IR、最大回撤、回撤持续期等专业回测指标。
- 风控优先级高于买点：数据异常、外部宏观压制、回测失败时必须降级。

对当前网站的价值：

- 当前已有异常报价过滤，可升级为“市场异常雷达”：异常下跌是否是抄底机会，异常上涨是否追高风险。
- 专家团中的“风控总监”需要输出止损、分批、仓位和失败场景。

### 4. 数据源与多源校准

主要参考：`gold-price`、`qstock`、`a-great-fund-valuation-system`、`gold-insight`

可迁移能力：

- 金投网 `quote.cngold.org` 可作为贵金属国内/国际价格备用源，支持黄金、白银、铂金与历史数据。
- 东方财富/同花顺类接口可用于新闻、全球指数、盘口异动、商品行情补充。
- AKShare/qstock 的数据思想：统一封装数据源，不让业务层感知上游差异。
- TimescaleDB/PostgreSQL/Redis 架构适合长期时序存储与高速快照。

对当前网站的价值：

- 当前 `market-context` 只接 Yahoo 部分因子，下一步应做 `data-provider` 层：Yahoo/FRED/金投网/上金所/工行/东方财富各自适配。
- 公网长期 K 线和回测必须上数据库，Vercel 临时存储不够。

### 5. 机器学习与预测模型

主要参考：`fortune`、`-WOA-RF-MIP-LSTM-LSTM-MAP-`、`alphalab`

可迁移能力：

- CatBoost/随机森林特征选择，用于非线性因子组合。
- LSTM-MAP、RF-MIP-LSTM、注意力机制，可作为离线实验，不直接承诺线上准确预测。
- WOA 超参数优化思想可用于离线训练参数搜索。
- 模型必须配套 Walk-forward、失败样本、最大回撤，不允许只展示预测线。

对当前网站的价值：

- 第一阶段不急着上线深度学习，先做可解释因子模型和回测。
- 第二阶段训练“黄金方向概率模型”，输出 `1h/1d/5d/20d` 方向概率和置信区间。

### 6. 新闻情绪与博主可信度

主要参考：`gold_sent_analyze`、`gold-insight`、`HammerAI_Agent`

可迁移能力：

- 财经新闻聚合，按利多/利空/中性打分。
- 文本情绪与黄金价格关系建模。
- 博主观点不能直接采信，需要可信度：历史命中率、观点一致性、极端喊单惩罚、来源权重。
- RAG 知识库用于解释宏观概念、复盘事件、生成可读报告。

对当前网站的价值：

- 当前新闻/博主因子是占位，下一步可上线“新闻情绪雷达”和“观点可信度面板”。
- 买卖建议应展示“新闻是否支持”“大 V 是否一致”“可信度是否足够”，而不是盲目引用。

### 7. 多 Agent 工作流

主要参考：`HammerAI_Agent`、`alphalab`、`UZI-Skill` 思路

可迁移能力：

- 意图分类器 + 职能 Agent：数据解析、技术面、宏观面、情绪面、风控、报告生成。
- Agent 之间共享上下文，最后由协调 Agent 汇总。
- 可扩展 skill/agent 体系，每个专家都有输入、输出、置信度、失败条件。

对当前网站的价值：

- 当前专家团已是规则 agent，下一步升级为标准 `Agent Runtime`。
- 每个 agent 输出必须结构化，前端展示可解释，不做黑盒喊单。

## 总体架构目标

目标不是“一个行情页”，而是：

```text
实时行情终端
  + 多源行情校准
  + 黄金宏观因子库
  + 新闻/博主情绪系统
  + 专业 K 线与指标
  + 可回测买卖点策略
  + 多 Agent 专家团
  + 风险与仓位管理
  + 透明性能监控
```

## Worktree / Subagent 分派计划

当前环境没有真实 subagent 调度器，执行方式为“隔离 worktree + 功能泳道 + 验收合格后合并回收”。

### A. `data-agent`

职责：

- 建立统一 `MarketDataProvider` 接口。
- 接入 FRED CSV/JSON、Yahoo Finance、金投网、上金所、工行、东方财富新闻。
- 做请求超时、限频、缓存、字段级 fallback。

依赖：

- 无前置，优先级最高。

验收：

- 单个源失败不影响 `/api/snapshot`。
- 每个因子都有 `status/source/updatedAt/confidence`。
- 有 provider 单测和降级测试。

### B. `storage-agent`

职责：

- 落地 TimescaleDB/Postgres/SQLite 可替换存储。
- 保存分钟报价、日线宏观、新闻、观点、信号、回测结果。
- 提供数据迁移和 Vercel/Render 环境配置。

依赖：

- 与 `data-agent` 并行，但最终要接收 provider 输出。

验收：

- 冷启动后可恢复历史 K 线。
- 24h/7d/30d/1y 查询稳定。
- 本地 JSON 仍可作为 fallback。

### C. `macro-factor-agent`

职责：

- 实现黄金宏观因子库。
- 计算实际利率、美元、通胀、VIX、COT、GLD、金银比、收益率曲线、流动性。
- 生成 6 轴雷达、18 条看多/看空信号、短中长期方向。

依赖：

- 依赖 `data-agent` 的宏观数据。

验收：

- 每条规则有透明公式、阈值、贡献分、风险解释。
- 前端能展示宏观雷达和信号明细。

### D. `backtest-agent`

职责：

- 建立信号回放框架。
- 输出 5m/15m/60m/1d/5d/20d 后续收益、胜率、最大回撤、盈亏比、失败样本。
- 支持 Walk-forward 验证。

依赖：

- 依赖 `storage-agent` 的历史数据。

验收：

- 每个强提醒必须带样本数和历史表现。
- 防未来函数，测试覆盖时间切片。

### E. `strategy-agent`

职责：

- 把当前规则专家团升级为标准策略引擎。
- 支持三周期模式、宏观过滤、异常检测、情绪过滤、仓位建议。
- 生成“买入观察/等待确认/分批低吸/暂避风险”建议。

依赖：

- 依赖 `macro-factor-agent`、`backtest-agent`。

验收：

- 强买点不能只由价格触发，必须满足数据质量、宏观、技术、回测至少三类共振。
- 风控冲突时必须降级。

### F. `sentiment-agent`

职责：

- 聚合新闻和博主观点。
- 做去重、来源可信度、利多利空分类、事件标签。
- 建立观点命中率与可信度评分。

依赖：

- 依赖 `data-agent` 新闻源，后续可接 RAG。

验收：

- 未接真实源时不能影响强信号。
- 每条观点必须带来源、时间、可信度和摘要。

### G. `ml-agent`

职责：

- 离线训练黄金方向概率模型。
- 先做 CatBoost/RandomForest，再评估 LSTM/attention。
- 输出特征重要性、Walk-forward、失败样本。

依赖：

- 依赖 `storage-agent` 和 `macro-factor-agent`。

验收：

- 未通过 Walk-forward 前不得影响线上强提醒，只能作为“实验因子”展示。

### H. `ui-agent`

职责：

- 升级前端为专业金融终端。
- 增加宏观驾驶舱、新闻情绪、回测卡片、专家争议、仓位建议。
- 保持移动端卡片化和图表可读性。

依赖：

- 可并行，接 API schema mock。

验收：

- 手机/桌面无横向异常滚动。
- 强提醒、风险、专家分歧清晰可读。

### I. `ops-agent`

职责：

- 增加调度、监控、数据质量看板。
- 部署数据库、定时采集、错误报警。
- 建立部署前自动验收脚本。

依赖：

- 依赖 `data-agent`、`storage-agent`。

验收：

- 每次部署前自动跑 test/lint/build。
- 数据源失败有日志和前端提示。

## 开发里程碑

### M1：多源数据底座

- `data-agent` + `storage-agent`
- 完成 FRED、金投网、Yahoo、工行、上金所统一 provider。
- 建立可持久化历史行情。

### M2：黄金宏观驾驶舱

- `macro-factor-agent` + `ui-agent`
- 上线实际利率、美元、通胀、VIX、COT、GLD、金银比、收益率曲线。
- 上线 6 轴雷达和 18 条看多/看空规则。

### M3：回测与信号可信度

- `backtest-agent` + `strategy-agent`
- 每个买点输出历史胜率、后续收益、最大回撤、失败样本。
- 加入 Walk-forward 验证。

### M4：新闻情绪和博主可信度

- `sentiment-agent` + `ui-agent`
- 接新闻源，做情绪与事件分类。
- 接观点源，做可信度和历史命中率。

### M5：专业策略引擎

- `strategy-agent`
- 专家团从规则展示升级为可插拔 agent runtime。
- 强买点需要技术、宏观、情绪、回测、数据质量共振。

### M6：机器学习预测实验室

- `ml-agent`
- CatBoost/RandomForest 黄金方向概率模型。
- LSTM/attention 只做实验模块，未通过验证不进入强建议。

### M7：生产级运维

- `ops-agent`
- 定时采集、监控、报警、部署验收。
- 自定义域名/更稳定公网部署。

## 风险边界

- 任何“买卖建议”必须明确为观察信号，不承诺收益。
- 未接真实数据源的因子只能显示为 `待接入`，不能参与强提醒加分。
- ML 模型必须先通过 Walk-forward 和失败样本审计，不能直接上线喊单。
- 数据源抓取必须尊重频率限制和降级策略。
