# Security Policy

## Supported Versions

当前项目仍处于快速迭代阶段，默认只维护 `main` 分支最新版本。

## Reporting a Vulnerability

请不要在公开 Issue 中粘贴以下内容：

- API key、Bearer token、数据库连接串、Cookie、个人账号信息。
- 真实交易记录、持仓截图、银行账号、手机号、身份证明。
- 未脱敏的生产日志、`.env` 文件、本地数据库或报告。

推荐通过 GitHub Security Advisory 或私有渠道报告安全问题。报告时请包含：

- 受影响模块。
- 复现步骤。
- 预期影响。
- 已脱敏的日志或截图。
- 建议修复方式。

## Secrets

项目只提交 `.env.production.example` 作为模板。真实密钥必须放在部署平台环境变量中，例如：

- `EXTERNAL_TS_MODEL_TOKEN`
- `CHRONOS_SERVICE_TOKEN`
- `POSTGRES_HTTP_TOKEN`
- `CRON_SECRET`
- `FRED_API_KEY`

## Data Safety

外部模型服务只应接收价格序列、公开市场因子和匿名化策略特征。不要把个人交易账户、真实持仓、身份信息或银行登录信息发送给模型服务。

## Financial Risk

本项目不是投资顾问系统。模型预测、分桶胜率、回测结果和专家团输出都可能失效，不能作为保证收益或自动下单依据。
