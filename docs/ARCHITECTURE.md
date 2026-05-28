# Architecture

Gold Price Monitor 是一个面向黄金积存金的可解释行情终端。系统目标不是给出黑盒喊单，而是把实时行情、多源校准、宏观因子、技术形态、回测、外部时序模型和风控组合成可审计的观察信号。

## 组件

- `apps/web`：React + Vite 前端，提供行情看板、分时图、K线图、右侧决策 Tab、回测和 provider 健康展示。
- `apps/server`：Express + TypeScript 主服务，负责行情拉取、策略计算、外部模型接入、回测快照和 API。
- `api`：Vercel serverless 入口，复用主服务逻辑输出 quote/history/snapshot/backtest/provider health，并补齐 v4 证据接口。
- `services/chronos-bolt`：FastAPI + Chronos-Bolt 独立推理服务，主服务通过 HTTP 调用。
- `scripts`：本地 Chronos 联调、历史验证和服务健康检查脚本。
- `docs`：架构、模型、数据源、研究和迭代文档。

## 数据流

```text
ICBC / SGE / domestic refs / macro providers / RSS / event calendar
  -> Provider adapters
  -> QuoteService
  -> Source SLA ledger
  -> Data quality and consensus checks
  -> Event intelligence and macro regime
  -> Local strategy and probability model
  -> External model HTTP advisor
  -> Complete triple-barrier labels and bucket monitor
  -> DecisionEvidencePacket v4
  -> API response
  -> React terminal
```

## 决策流

```text
实时价格
  + 主交易价 freshness
  + 国内多源共识与偏离解释
  + 技术指标和三态形态
  + 宏观 regime 和资金流
  + 事件阶段与第一波禁追
  + 心理纪律和追价保护
  + 本地概率模型
  + 外部时序模型评分榜
  + 完整路径回测分桶 gate
  + 有效关键价与赔率校验
  -> no_trade / watch_only / waiting_for_trigger / trigger_missed / invalidated
```

## v4 单一决策口径

`DecisionEvidencePacket` 是前端唯一可信决策源。组件可以展示图表、形态、宏观或回测细节，但不能绕过证据包自行推断“可以买”“胜率是多少”或“强提醒是否成立”。

核心字段：

- `singleCommand`：交易员口令卡，给出一句话动作。
- `executionState`：交易状态机，处理等待、触发、错过、失效和减仓。
- `validatedLevels`：经过当前价、方向、TP1、止损和赔率校验后的关键价。
- `probabilityPolicy`：控制是否允许展示精确概率。
- `sourceLedger`：主交易源、参考源、镜像源和禁用源的统一健康结论。
- `eventState`：普通时段、事件前、事件第一波、事件后二次确认。
- `modelScorecard`：本地规则、Chronos 等外部军师的 shadow/promoted 状态。
- `journalPreview`：当前信号进入复盘闭环时的证据摘要。

## API Surface

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `/api/snapshot` | 前端主快照：quote、history、opportunity、marketContext | 向后兼容旧字段 |
| `/api/decision-evidence` | v4 单一决策证据包 | 前端决策类组件应优先消费 |
| `/api/event-intelligence` | 事件阶段、估算/配置日历、来源边界 | 估算事件不冒充官方日历 |
| `/api/source-ledger` | 数据源 SLA、偏离、可用于强信号资格 | 缺专业源时必须透明显示 |
| `/api/model-registry` / `/api/model-scorecard` | 模型注册、校准、晋级状态 | 低样本模型只 shadow |
| `/api/signal-journal` / `/api/journal` | 信号记录、结果标签和复盘入口 | 当前用于纸面复盘 |
| `/api/backtest` | triple-barrier 回测与分桶监控 | incomplete 样本单独统计 |
| `/api/providers/health` | provider 探测和错误原因 | 用于运维诊断 |

## Event and News Intelligence

事件引擎由三层组成：

- `configured`：用户通过 `ECONOMIC_EVENT_CALENDAR_JSON` 配置的明确事件，可进入生产事件风控。
- `estimated`：按常规发布时间生成的 CPI/PCE/NFP/FOMC 观察窗口，只用于提前提醒和保守降级。
- `rss` / `mirror`：新闻、博主观点和离线镜像，只能解释、降级或生成复盘特征。

新闻情绪使用并行 RSS 抓取和标题清洗：单个源超时不会拖垮整体；Google News 查询标题等伪标题会被过滤。情绪分只能说明信息环境，不允许单独触发强买点。

## Source Trust Boundaries

| Source class | Examples | Production rule |
| --- | --- | --- |
| `tradeable_source` | 工银积存金主交易价 | 新鲜且无异常时可作为页面主价 |
| `reference_source` | AU9999、AuTD、浙商、国内金、国际金、汇率 | 用于校准、偏离解释和强信号否决 |
| `learning_only_mirror` | CPI、实际利率、VIX、美元指数镜像 CSV | 用于离线学习、分桶和解释，不放大实时强信号 |
| `disabled_source` | 未授权、未配置、字段不可解析或反爬失败源 | 不参与生产评分 |

GLD、LBMA、CME OI/Volume 等专业源需要官方/授权 CSV、API 或内部合规镜像。系统宁愿显示 unavailable，也不把不可靠抓取伪装成实时证据。

## 外部模型边界

外部模型服务只返回概率和预测区间，不直接决定交易动作。主服务会把模型输出写入快照，再通过模型注册表、校准指标和分桶表现判断是否可加权。

关键约束：

- 未配置或错误：不参与评分。
- 样本不足或完整路径样本少于 30：只展示，不加权，不显示精确胜率。
- 弱桶：权重降为 0。
- 中性桶：最多低权重参考。
- 强桶且本地共振：允许小幅加分。

## 存储模式

- `file`：本地开发默认模式。
- `sqlite`：单实例部署推荐模式。
- `postgres`：Vercel serverless 和多实例部署推荐模式，通过 HTTP SQL gateway 访问。

## 时间和样本

- `updatedAt`：上游行情时间，可能带本地时区。
- `fetchedAt`：系统抓取时间，使用 ISO UTC。
- `sampleOrigin=live`：实盘或纸面实时样本，可用于 live gate。
- `sampleOrigin=historical`：历史离线验证样本，只能用于预热和模型筛选，不允许直接放大实盘买点。

## Privacy and Repository Hygiene

发布到 GitHub 时只提交源代码、测试、公开文档、示例配置和合法公开资料索引。以下内容不应进入仓库：

- `.env`、token、Cookie、数据库连接串、真实账号和交易记录。
- `apps/server/data`、本地回测快照、SQLite/Postgres dump。
- `apps/*/dist`、venv、缓存、日志、临时报告。
- `.trae/`、个人工作流目录、嵌套仓库或与本项目无关的研究目录。

## 安全边界

- 不提交真实 `.env`、token、本地数据库、venv、报告或个人路径。
- 所有部署密钥使用平台环境变量。
- 本项目不保存银行登录态，不接触交易账户，不自动下单。
