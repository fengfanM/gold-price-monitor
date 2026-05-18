# Architecture

Gold Price Monitor 是一个面向黄金积存金的可解释行情终端。系统目标不是给出黑盒喊单，而是把实时行情、多源校准、宏观因子、技术形态、回测、外部时序模型和风控组合成可审计的观察信号。

## 组件

- `apps/web`：React + Vite 前端，提供行情看板、分时图、K线图、右侧决策 Tab、回测和 provider 健康展示。
- `apps/server`：Express + TypeScript 主服务，负责行情拉取、策略计算、外部模型接入、回测快照和 API。
- `api`：Vercel serverless 入口，复用主服务逻辑输出 quote/history/snapshot/backtest/provider health。
- `services/chronos-bolt`：FastAPI + Chronos-Bolt 独立推理服务，主服务通过 HTTP 调用。
- `scripts`：本地 Chronos 联调、历史验证和服务健康检查脚本。
- `docs`：架构、模型、数据源、研究和迭代文档。

## 数据流

```text
ICBC / SGE / domestic refs / macro providers / RSS
  -> Provider adapters
  -> QuoteService
  -> Data quality and consensus checks
  -> Local strategy and probability model
  -> External model HTTP advisor
  -> Backtest snapshots and bucket monitor
  -> API response
  -> React terminal
```

## 决策流

```text
实时价格
  + 国内多源共识
  + 技术指标和形态
  + 宏观因子
  + 事件风险
  + 心理纪律
  + 本地概率模型
  + 外部时序模型
  + 回测分桶 gate
  -> 买点观察 / 等待确认 / 风险暂避
```

## 外部模型边界

外部模型服务只返回概率和预测区间，不直接决定交易动作。主服务会把模型输出写入快照，再通过分桶指标判断是否可加权。

关键约束：

- 未配置或错误：不参与评分。
- 样本不足：只展示，不加权。
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

## 安全边界

- 不提交真实 `.env`、token、本地数据库、venv、报告或个人路径。
- 所有部署密钥使用平台环境变量。
- 本项目不保存银行登录态，不接触交易账户，不自动下单。
