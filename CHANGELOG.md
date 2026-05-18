# Changelog

All notable changes to this project are documented here.

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
