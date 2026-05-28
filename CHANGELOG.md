# Changelog

All notable changes to this project are documented here.

## 0.2.0 - 2026-05-28

### Added

- `decision-evidence-v4` 单一决策证据包，统一当前动作、执行状态、概率显示、关键价、数据源健康、事件状态、模型评分榜和复盘预览。
- `event-intelligence-v4` 事件智能接口，支持配置事件、估算 CPI/PCE/FOMC/NFP 窗口、来源边界和第一波禁追语义。
- `Source SLA Ledger`，把工银主交易价、AU9999/AuTD/浙商/国内金/国际金/宏观镜像分为可交易源、参考源、离线学习源和禁用源。
- `Model Registry / Scorecard`，为本地规则、Chronos 和后续 TimesFM/Moirai 等军师建立 shadow/promoted/blocked 治理边界。
- `Signal Journal` 纸面复盘结构，记录证据快照、交易计划、triple-barrier 结果和失败归因。
- Vercel serverless v4 API：`/api/decision-evidence`、`/api/event-intelligence`、`/api/events`、`/api/source-ledger`、`/api/model-registry`、`/api/model-scorecard`、`/api/signal-journal`、`/api/journal`。
- K 线三态形态：candidate / confirmed / failed，并补充晨星、黄昏星、孕线、红三兵、三鸦、失败冷却和禁用条件。

### Changed

- 右侧决策面板改为小白/专业双层语义，优先展示“一句话口令、触发/止损/赔率、复核条件、事件/宏观播报”。
- 图表和形态卡只展示通过当前价、方向、TP1、止损和赔率校验的有效关键价，错过机会时明确提示“不追”。
- RSS 新闻/博主情绪改为并行多源抓取，单个源超时不拖垮整体，并过滤 Google News 查询伪标题。
- 事件/宏观播报在普通时段也展示未来 14 天观察清单，不再出现“既无核心事件又无观察事件”的空白状态。
- 概率和回测展示受 `Probability Display Policy` 约束：完整样本不足、Brier 不合格、事件第一波或关键源异常时隐藏精确概率。
- 文档同步更新 v4 决策证据、数据源边界、事件智能、模型晋级和隐私发布策略。

### Fixed

- 修复工作日交易时段误判为休市的问题，13:20 中国时间属于工银监控有效时段。
- 修复右侧面板滚动、左右高度不齐、依据 Tab 白屏、事件/宏观卡片低密度竖排等体验问题。
- 修复 `/api/event-intelligence` 普通时段无 `items` 导致前端只能显示“暂无核心事件窗口”的问题。
- 修复新闻情绪源超时显示 `This operation was aborted` 且整体不可用的问题。

### Security

- `.gitignore` 明确排除 `.trae/`、嵌套仓库、个人研究目录、本地脚本产物和无关项目，避免隐私文件或个人上下文误提交。
- 继续禁止提交真实 `.env`、token、Cookie、本地数据库、交易记录和银行登录态。

## 0.1.0 - 2026-05-18

### Added

- 工银积存金实时行情监控，支持官方异步接口优先和页面 fallback。
- 上金所 Au99.99 / Au(T+D)、金投网国内黄金、浙商积存金等多源校准。
- 工作日交易时段 freshness 和多源共识偏离检查。
- React 专业终端 UI，包含分时、K 线、MA、BOLL、RSI、MACD、关键价位、预测区间和右侧 5 Tab。
- 本地概率模型、专家团、交易计划、事件风控、心理纪律和回测监控。
- Chronos-Bolt HTTP 推理服务，支持 `EXTERNAL_TS_MODEL_URL` 接入。
- 外部模型分桶回测、强弱桶 gate 和 provider 维度。
- Chronos/TimesFM/Moirai 并行 provider 预留配置。
- 10 年历史黄金离线验证脚本，历史样本与 live 样本隔离。
- GitHub 标准文档、License、安全策略、贡献指南和模板。

### Changed

- 图表时间轴改为本地时间展示，避免 UTC 时间造成误读。
- 分时/K线默认展示最新点或最新 K 线信息。
- K线图合并最新 quote 到最后一根 candle，提升实时一致性。

### Security

- `.gitignore` 排除本地 venv、报告、缓存和数据目录。
- 文档使用占位 token，不提交真实密钥。
