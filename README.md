# Gold Price Monitor

Gold Price Monitor 是一个面向工银积存金和人民币黄金交易口径的实时行情、模型验证和风险决策终端。项目把多源行情校准、专业图表、宏观因子、本地概率模型、Chronos-Bolt 外部时序军师、分桶回测和交易计划放在同一套可解释框架里，目标是辅助观察买卖点，而不是输出黑盒喊单。

> 本项目仅用于行情观察、模型研究和风险提示，不构成投资建议、收益承诺或自动交易指令。

## Highlights

- 工银积存金实时行情，官方异步接口优先，公开页面 fallback。
- 上金所 Au99.99 / Au(T+D)、金投网国内黄金、浙商积存金等多源校准。
- 工作日交易时段 freshness、共识价偏离和异常报价拦截。
- React 金融终端 UI：分时、K线、MA、BOLL、RSI、MACD、支撑/压力、预测区间和右侧 `决策 / 计划 / 风控 / 依据 / 验证` Tab。
- 本地买卖点策略：技术面、形态、宏观、估值、数据质量、事件风险、心理纪律、交易计划和回测共同参与。
- Chronos-Bolt HTTP 推理服务：通过 `EXTERNAL_TS_MODEL_URL` 接入外部时序基础模型。
- 外部模型分桶回测：按概率、置信度、交易时段、形态、事件、宏观、source health、horizon、provider 统计胜率和校准。
- 强弱桶 gate：样本不足只展示，弱桶权重为 0，强桶且本地共振才允许低权重小幅加分。
- provider 对比预留：Chronos、TimesFM、Moirai 可用同一套 HTTP schema 和分桶指标比较稳定性。
- 本地 10 年黄金历史验证脚本，historical 样本与 live 样本隔离。

## Screens and Workflow

核心使用路径：

```text
实时行情
  -> 多源校准
  -> 图表和技术指标
  -> 本地买点模型
  -> 外部模型军师
  -> 回测和分桶 gate
  -> 交易计划与风控提示
```

右侧 5 Tab：

- `决策`：当前是否值得观察、信号等级、专家团摘要。
- `计划`：入场区、触发价、止损、止盈、最大仓位和失败场景。
- `风控`：事件窗口、数据质量、心理纪律、追高/抄底风险。
- `依据`：宏观因子、技术形态、多源校准、专家分歧。
- `验证`：长期回测、分桶表现、外部模型 live 覆盖率和弱桶提示。

## Prediction and Advisor Models

项目不是单一模型，而是“本地多因子系统 + 外部时序军师 + 回测门控”的组合。

### Local Strategy Engine

本地策略引擎负责把可解释因子组合成买点观察信号：

- 数据质量：官方源/fallback、staleness、异常值、国内多源共识偏离。
- 技术指标：MA、BOLL、RSI、MACD、24h 涨跌、回撤、高低点。
- K线与形态：双底/双顶、支撑压力、形态成功率和失效价。
- 多周期共振：短线与更高周期是否冲突。
- 宏观环境：美元、利率、通胀、VIX、ETF、COT、央行购金等 provider 框架。
- 事件风险：CPI、FOMC、非农等事件窗口。
- 心理纪律：追高、急跌、连续失败、仓位冲动。
- 交易计划：触发价、止损、止盈、风险收益比和最大仓位。

### Local Probability Model

本地概率模型输出方向概率和置信度，进入专家团和图表信号：

- 输出上涨/下跌概率。
- 输出置信度和解释。
- 受回测、数据质量和风险门控约束。
- 不单独构成买入建议。

### External Time-Series Advisor

外部时序模型通过独立 HTTP 服务接入，默认优先 Chronos-Bolt：

```bash
EXTERNAL_TS_MODEL_URL=http://127.0.0.1:8000/forecast
EXTERNAL_TS_MODEL_PROVIDER=chronos
EXTERNAL_TS_MODEL_NAME=amazon/chronos-bolt-base
EXTERNAL_TS_MODEL_HORIZON_MINUTES=60
EXTERNAL_TS_MODEL_CONTEXT_POINTS=256
```

当前外部模型输出：

- `upProbability`
- `confidence`
- `forecastPrice`
- `intervalLow`
- `intervalHigh`
- `rationale`
- `risks`

安全降级规则：

- 未配置：显示 `unconfigured`，不参与评分。
- 服务错误：显示错误原因，不阻塞行情刷新。
- 样本不足：只展示，不加权。
- 命中弱桶：权重降为 0。
- 命中强桶且本地规则共振：允许低权重小幅加分。

## Buy/Sell Point Logic

买点判断不是“价格跌了就买”，而是分层门控：

```text
数据源健康
  + 国内多源共识
  + 技术面企稳
  + 估值/回撤位置
  + 宏观环境
  + 事件风险
  + 心理纪律
  + 回测样本
  + 外部模型分桶
  -> 买点观察 / 等待确认 / 风险暂避
```

强信号必须满足：

- 数据源新鲜且未发生 critical anomaly。
- 国内参考价和主报价偏离可解释。
- 技术面有支撑、形态或多周期共振。
- 风险收益比合理，止损和失效价明确。
- 事件窗口不过度危险。
- 同类历史或 live 分桶没有明显弱桶。

## External Model Backtest Buckets

外部模型分桶指标：

- `winRate`
- `baselineWinRate`
- `excessWinRate`
- `profitFactor`
- `brierScore`
- `mae`
- `mfe`
- `maxDrawdown`
- `reliability`
- `qualifiedSamples`

分桶维度：

- 模型概率区间。
- 模型置信度。
- 模型与本地规则共振。
- 交易时段。
- K线形态。
- 事件风险。
- 宏观环境。
- 估值水位。
- 数据源健康。
- 预测 horizon。
- provider：`chronos`、`timesfm`、`moirai`、`custom`。

当前原则：

- `historical` 样本用于预热和模型筛选。
- `live` 样本用于实盘 gate。
- historical 结果不能直接放大 production 信号。

## Project Structure

```text
.
├── api/                         # Vercel serverless API
├── apps/
│   ├── server/                  # Express + TypeScript backend
│   └── web/                     # React + Vite frontend
├── docs/                        # Architecture, model card, research and logs
├── scripts/                     # Local AI, Chronos verification and historical validation
├── services/
│   └── chronos-bolt/            # FastAPI Chronos-Bolt inference service
├── .env.production.example      # Production env template with placeholders only
├── PRODUCTION_DEPLOYMENT.md     # Deployment guide
└── render.yaml                  # Render blueprint
```

## Quick Start

```bash
npm install
npm run dev:server
npm run dev:web
```

默认：

- Web：`http://localhost:5173`
- API：`http://localhost:8787`

生产模式：

```bash
npm run build
npm start
```

## Run With Chronos-Bolt Locally

最简全栈真实模型联调：

```bash
npm run dev:ai
```

这个命令会：

- 创建 `services/chronos-bolt/.venv`。
- 安装 Chronos-Bolt Python 依赖。
- 启动 `http://127.0.0.1:8000/forecast`。
- 强制真实模型模式：`CHRONOS_REQUIRE_MODEL=1`、`CHRONOS_ENABLE_FALLBACK=0`。
- 等待 `/health` 返回 `chronosLoaded=true`。
- 启动主服务并配置 `EXTERNAL_TS_MODEL_URL`。
- 启动前端。

验证 Chronos：

```bash
CHRONOS_SERVICE_URL=http://127.0.0.1:8000 \
CHRONOS_SERVICE_TOKEN=local-chronos-token \
npm run verify:chronos
```

## Historical Validation

运行 10 年黄金历史离线验证：

```bash
npm run validate:historical
```

默认会优先尝试 Yahoo `GC=F`，网络不可用时切换到 NBP 官方黄金价格。报告输出到本地 `reports/`，该目录默认不提交。

## Scripts

```bash
npm run dev:web
npm run dev:server
npm run dev:ai
npm run chronos:local
npm run verify:chronos
npm run validate:historical
npm run test --workspace server
npm run lint --workspace web
npm run build
```

## Deployment

支持：

- Node/Docker 单实例。
- Vercel serverless API。
- Render blueprint。
- SQLite 单实例持久化。
- Postgres HTTP SQL gateway。
- 独立 Chronos-Bolt HTTP 推理服务。

详见 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)。

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Model Card](./docs/MODEL_CARD.md)
- [External Model Iteration Log](./docs/EXTERNAL_MODEL_ITERATION_LOG.md)
- [Gold Model Upgrade Research](./docs/GOLD_MODEL_UPGRADE_RESEARCH.md)
- [Data Source Provider Audit](./docs/DATA_SOURCE_PROVIDER_AUDIT.md)
- [Chronos-Bolt Service](./services/chronos-bolt/README.md)

## Privacy and Security

- 不提交真实 `.env`。
- 不提交 token、API key、数据库连接串、Cookie、个人交易记录或本地数据库。
- 不提交 `services/chronos-bolt/.venv`、`reports/`、`apps/server/data`。
- `.env.production.example` 只保留占位符。
- 外部模型服务只接收公开行情和匿名化特征，不应接收个人账户或真实持仓数据。

## License

MIT. See [LICENSE](./LICENSE).

## Disclaimer

本项目仅用于行情观察、模型研究和风险提示。所有预测、回测、胜率、买点观察、仓位建议和专家团输出都可能失效，不构成投资建议、收益承诺、买入指令或自动交易依据。使用者应自行承担投资风险。
