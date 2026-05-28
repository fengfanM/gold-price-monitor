# Documentation

这里集中存放 Gold Price Monitor 的架构、模型、数据源、部署和研究文档。

## 核心文档

- [Architecture](./ARCHITECTURE.md)：系统架构、数据流、服务边界和部署形态。
- [Model Card](./MODEL_CARD.md)：预测军师、外部模型、回测指标和风险边界。
- [External Model Iteration Log](./EXTERNAL_MODEL_ITERATION_LOG.md)：Chronos-Bolt、TimesFM、Moirai 等模型迭代记录。
- [Gold Model Upgrade Research](./GOLD_MODEL_UPGRADE_RESEARCH.md)：模型升级路线与候选模型对比。
- [Gold Precious Metals Expert Knowledge Base](./GOLD_PRECIOUS_METALS_EXPERT_KNOWLEDGE_BASE.md)：黄金贵金属知识库和策略原则。
- [Data Source Provider Audit](./DATA_SOURCE_PROVIDER_AUDIT.md)：数据源健康、字段、fallback 和校准审计。
- [Changelog](../CHANGELOG.md)：面向发布的能力变更、验证和安全边界。

## 当前 v4 决策终端主线

- `DecisionEvidencePacket`：所有行动文案、概率显示、关键价和禁用原因的唯一可信口径。
- `Source SLA Ledger`：区分可交易源、参考源、离线镜像和禁用源，缺失专业源时透明降级。
- `Event Intelligence`：CPI、PCE、FOMC、非农、Fed 和地缘风险进入事件阶段；第一波默认不追。
- `Probability Display Policy`：样本不足、回测未完成、Brier 不达标或数据源异常时隐藏精确概率。
- `Signal Journal`：记录信号证据、纸面计划、路径结果和失败归因，为后续校准服务。

## 运维与部署

- [Production Deployment](../PRODUCTION_DEPLOYMENT.md)：Vercel、Render、Docker、Postgres Gateway 和 Chronos 服务部署。
- [Production Data Foundation Plan](./PRODUCTION_DATA_FOUNDATION_PLAN.md)：Postgres 持久化、Cron 拆分、历史回填和线上样本积累计划。
- [Development Plan](../DEVELOPMENT_PLAN.md)：开发阶段和路线。
- [Reference Research Plan](../REFERENCE_RESEARCH_PLAN.md)：参考项目研究和能力迁移计划。

## 文档维护原则

- 不记录真实 token、API key、账号、交易记录或个人路径。
- 模型准确率必须带样本口径、时间范围、基准和风险解释。
- 任何“买点”描述必须保留观察/风控语义，不写成确定性投资建议。
