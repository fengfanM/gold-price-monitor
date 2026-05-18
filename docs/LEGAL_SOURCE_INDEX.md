# 合法资料索引与版权边界

> 目标：为黄金行情、K 线策略、宏观因子、资金流和回测校准建立可追溯资料底座。仓库只保存官方公开链接、公开数据索引、正版入口、样章入口和可落地摘要；不保存盗版或非授权书籍全文。

## 使用原则

| 原则 | 项目执行 |
| --- | --- |
| 官方优先 | WGC、CFTC、CME、FRED、BLS、BEA、Bridgewater 官方页面优先。 |
| 链接优先 | 对版权归属明确但再分发不确定的 PDF/网页，只保存 URL 与摘要，不把全文放入仓库。 |
| 书籍合规 | 技术分析、交易心理、宏观交易书籍只记录正版入口、目录、公开样章、作者访谈和可落地规则。 |
| 数据可复核 | 每个来源记录 URL、访问方式、检索日期、版权状态和映射到模型的字段。 |
| 模型可审计 | 来源不会直接产生买卖建议，必须先转化为可测试规则、特征和回测标签。 |

## 官方资料与公开数据

| ID | 来源 | 用途 | 版权状态 | 项目映射 |
| --- | --- | --- | --- | --- |
| `wgc-research` | [World Gold Council Research](https://www.gold.org/goldhub/research) | ETF、央行购金、黄金需求、长期配置框架 | 官方公开网页，链接引用 | `macroAlignmentScore`、资金流解释、长期背景 |
| `cftc-cot` | [CFTC Commitments of Traders](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) | COMEX 黄金投机/商业持仓拥挤度 | 美国监管公开数据 | 资金流拥挤、趋势延续/反转风险 |
| `cme-gold` | [CME Gold Futures](https://www.cmegroup.com/markets/metals/precious/gold.html) | 期货合约、成交量、OI、交易制度 | 官方公开页面，数据使用需遵守 CME 条款 | 成交量/OI 健康检查 |
| `cme-ta` | [CME Technical Analysis Education](https://www.cmegroup.com/education/courses/trading-and-analysis/technical-analysis.html) | 趋势线、支撑阻力、技术分析教育 | 官方教育资料，链接引用 | `trendStructureScore`、`supportResistanceQuality` |
| `cme-sr` | [CME Support and Resistance](https://www.cmegroup.com/education/courses/trading-and-analysis/support-and-resistance.html) | 支撑阻力确认与失效 | 官方教育资料，链接引用 | 支撑/阻力质量、假突破过滤 |
| `fred` | [FRED Economic Data](https://fred.stlouisfed.org/) | 实际利率、美元、通胀预期、VIX、宏观状态 | 公开数据服务，需注明来源 | 宏观顺逆风、事件环境 |
| `bls-cpi` | [BLS CPI](https://www.bls.gov/cpi/) | CPI 事件与通胀窗口 | 美国政府公开页面 | 事件风控、宏观解释 |
| `bea-pce` | [BEA PCE Price Index](https://www.bea.gov/data/personal-consumption-expenditures-price-index) | PCE/核心 PCE 通胀窗口 | 美国政府公开页面 | 事件风控、宏观解释 |
| `bridgewater-debt-crises` | [Principles for Navigating Big Debt Crises](https://www.bridgewater.com/research-and-insights/the-big-debt-crises) | 债务周期、货币信用、黄金大周期 | 官方公开入口，链接引用 | 长周期背景，不直接触发短线买点 |

## 版权书籍处理

书籍只作为理论来源和规则启发，不下载、不提交、也不整理非授权全文。若需要深度读书笔记，应使用正版购买、图书馆借阅、出版社样章、作者公开访谈或用户提供的合法本地文件。

| 主题 | 合法处理方式 | 可落地到模型的部分 |
| --- | --- | --- |
| 技术分析经典教材 | 正版入口、出版社样章、公开目录 | 趋势、形态、指标不能孤立使用，必须配合确认与失效 |
| K 线蜡烛图 | 正版入口、公开样章、作者资料 | 单根 K 线仅给候选，不允许直接强提醒 |
| 交易系统与心理 | 正版入口、作者访谈、合法摘要 | 风险收益比、仓位、连续失败冷却、反追高 |
| 海龟/趋势系统 | 正版入口、公开访谈 | ATR/突破/仓位纪律、样本外验证 |
| 全球宏观/债务周期 | 官方公开材料、作者公开文章 | 黄金长周期背景，短线需服从数据与事件门控 |

## 仓库文件

| 文件 | 作用 |
| --- | --- |
| `docs/assets/sources/source-manifest.json` | 结构化来源清单，供后续自动同步和审计。 |
| `docs/assets/sources/book-locators.csv` | 版权书籍正版入口和允许用途索引。 |
| `docs/assets/sources/verification-log.md` | 资料检索、版权状态和下载/不下载决策记录。 |
| `docs/GOLD_TRADING_THEORY_DIGEST.md` | 从合法资料中提炼的可量化交易规则。 |

