# Production Deployment

## 目标

这个项目现在支持三种生产运行模式：

- `file`：默认本地 JSON 文件，适合开发和单机 Render 磁盘。
- `sqlite`：推荐轻量生产模式，持久化 `history / marketContext / backtestSnapshots / factors`。
- `postgres`：通过 Postgres HTTP SQL 网关远端持久化，适合 Vercel Serverless 和多实例部署。

## Vercel 环境变量模板

Vercel 推荐使用 `postgres` 远端模式，避免 Serverless 冷启动和临时文件系统丢失状态。

```bash
STORAGE_ADAPTER=postgres
POSTGRES_HTTP_URL=https://your-postgres-gateway.example.com/query
POSTGRES_HTTP_TOKEN=replace-with-strong-token
POSTGRES_HTTP_TIMEOUT_MS=5000
CRON_SECRET=replace-with-strong-cron-secret
BACKFILL_SECRET=replace-with-strong-backfill-secret
INGEST_REFRESH_TTL_MS=60000
BACKFILL_WINDOW_HOURS=72
BACKFILL_MAX_POINTS=5000
FRED_API_KEY=replace-if-available
ZHESHANG_ACCUMULATION_GOLD_URL=https://api.tangdouz.com/a/zsgold.php
GLD_HOLDINGS_CSV_URL=https://your-official-gld-holdings-mirror.csv
LBMA_GOLD_PM_CSV_URL=https://your-lbma-gold-pm.csv
IBA_GOLD_PM_CSV_URL=https://your-iba-authorized-gold-pm.csv
LBMA_GOLD_PM_CSV_AUTH_HEADER="Authorization: Bearer your-token"
WGC_GOLD_ETF_FLOW_CSV_URL=https://your-wgc-etf-flow.csv
WGC_GOLD_ETF_FLOW_API_URL=https://fsapi.gold.org/api/v11/charts/etfv2/revised/flows-chart2?break-cache=11May26
CENTRAL_BANK_GOLD_CSV_URL=https://your-central-bank-gold.csv
CENTRAL_BANK_GOLD_PAGE_URL=https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2025/central-banks
CME_GOLD_OI_CSV_URL=https://your-cme-open-interest.csv
CME_GOLD_OI_OFFICIAL_CSV_URL=https://your-cme-authorized-open-interest.csv
CME_GOLD_OI_CSV_AUTH_HEADER="Authorization: Bearer your-token"
CME_GOLD_VOLUME_CSV_URL=https://your-cme-volume.csv
CME_GOLD_VOLUME_CSV_FILE=/var/data/gold-monitor/cme-volume.csv
GOLD_NEWS_RSS_URLS=https://news.google.com/rss/search?q=gold%20price
GOLD_BLOGGER_RSS_URLS=https://news.google.com/rss/search?q=gold%20analyst%20outlook
```

### Vercel API 与 Cron

已提供以下 serverless API：

- `/api/quote`、`/api/history`、`/api/snapshot`、`/api/health`：行情与基础健康检查。
- `/api/backtest`：读取持久化的 backtest snapshots 并返回回测监控结果。
- `/api/providers/health`：默认探测所有市场数据 provider 并保存健康快照；可用 `?probe=0` 只读历史。
- `/api/cron/ingest`：高频行情采集入口，只刷新 quote/history/backtest，不同步探测 Yahoo/FRED/CME。
- `/api/cron/providers`：低频 provider health 探测入口，保存 provider 健康历史。
- `/api/admin/backfill-history`：受保护历史回填入口，用于导入最近 24-72 小时可信行情，避免新部署后图表从零开始。

`vercel.json` 默认配置：

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/providers",
      "schedule": "17 * * * *"
    }
  ]
}
```

生产必须设置 `CRON_SECRET`。Vercel Cron 自身会携带 `x-vercel-cron: 1`，手动排查时支持 `Authorization: Bearer $CRON_SECRET`、`x-cron-secret` header 或 `?secret=`。需要立即采样可追加 `?force=1`。

如果当前 Vercel 账号不支持 5 分钟级 Cron，部署可能提示计划限制。此时保留 API 入口，用 Render Cron、GitHub Actions、UptimeRobot 或其他外部定时器每 1-5 分钟调用 `/api/cron/ingest`，每 30-60 分钟调用 `/api/cron/providers`。

历史回填示例：

```bash
curl -X POST "https://your-site.vercel.app/api/admin/backfill-history" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $BACKFILL_SECRET" \
  --data @seed-history.json
```

## Render 主服务模板

Render 单实例可以先用 SQLite，后续切 Postgres。

```bash
npm install
npm run build
npm run start --workspace server
```

环境变量：

```bash
NODE_ENV=production
PORT=8787
STORAGE_ADAPTER=sqlite
DATA_DIR=/var/data/gold-monitor
SQLITE_FILE=/var/data/gold-monitor/gold-monitor.sqlite
```

## Postgres HTTP SQL 网关

网关用于让 Vercel/多实例服务通过 HTTP 访问 Postgres。部署为单独 Render Web Service：

```bash
npm install
npm run build --workspace server
npm run start:postgres-gateway --workspace server
```

环境变量：

```bash
DATABASE_URL=postgres://user:password@host:5432/db
POSTGRES_HTTP_TOKEN=replace-with-strong-token
POSTGRES_GATEWAY_PORT=8790
POSTGRES_SSL=1
POSTGRES_GATEWAY_BODY_LIMIT=5mb
POSTGRES_GATEWAY_MAX_ROWS=1000
```

健康检查：

```bash
curl https://your-postgres-gateway.example.com/health
```

查询接口：

```bash
curl -X POST https://your-postgres-gateway.example.com/query \
  -H "Authorization: Bearer replace-with-strong-token" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT 1 AS ok","params":[]}'
```

## 官方数据源约定

CSV 文件默认按“最新行在第一行”解析，至少需要一个日期列和一个数值列。

- `LBMA_GOLD_PM_CSV_URL`：列名可包含 `gold pm`、`usd`、`price`、`value`。
- `IBA_GOLD_PM_CSV_URL`：IBA/LBMA 授权源别名；`LBMA_GOLD_PM_CSV_AUTH_HEADER` 可传 `Authorization: Bearer token` 或其它单个授权 header。
- `WGC_GOLD_ETF_FLOW_CSV_URL`：列名可包含 `flow tonne`、`net flow`、`tonnes`、`value`。
- `WGC_GOLD_ETF_FLOW_API_URL`：未配置 CSV 时默认尝试 World Gold Council gold.org chart API。
- `CENTRAL_BANK_GOLD_CSV_URL`：列名可包含 `central bank`、`official sector`、`net purchase`、`tonnes`、`value`。
- `CENTRAL_BANK_GOLD_PAGE_URL`：未配置 CSV 时默认尝试 World Gold Council 央行购金研究页。
- `CME_GOLD_OI_CSV_URL`：列名可包含 `open interest`、`openinterest`、`oi`、`value`。
- `CME_GOLD_OI_OFFICIAL_CSV_URL`：CME 授权未平仓源别名；`CME_GOLD_OI_CSV_AUTH_HEADER` 可传授权 header。
- `CME_GOLD_VOLUME_CSV_URL` / `CME_GOLD_VOLUME_CSV_FILE`：列名可包含 `volume`、`total volume`、`value`；未配置时不再 fallback 到 Yahoo，避免生产高频采集触发 Yahoo 429。
- `ZHESHANG_ACCUMULATION_GOLD_URL`：浙商积存金参考源。默认使用第三方文本镜像，只参与“银行参考/多源校准”，不替代工银官方报价；若有浙商官方或自建镜像，可配置为 JSON 并用 `ZHESHANG_ACCUMULATION_GOLD_JSON_PATH` 指向价格字段。
- `AU9999_REFERENCE_URL`：可选 AU9999 备用参考源。已有上金所延时页作为核心锚；该项用于官方源不可用时补充校准。

## Chronos-Bolt 外部模型军师

推荐把 `Chronos-Bolt`、`TimesFM` 或 `Moirai` 部署成独立 HTTP 推理服务，不要把 Python 权重直接塞进 Node 主服务。主服务只通过 `EXTERNAL_TS_MODEL_URL` 调用，超时或失败时自动降级。

仓库已提供独立推理服务：

```bash
services/chronos-bolt
```

最简本地启动，不需要注册云平台：

```bash
npm run dev:ai
```

这个命令会自动创建 Python venv、安装依赖、启动 Chronos、等待 `/health` 返回 `chronosLoaded=true`，然后启动主服务和前端。为保证效果等同真实 Chronos，它会强制：

```bash
CHRONOS_REQUIRE_MODEL=1
CHRONOS_ENABLE_FALLBACK=0
```

因此如果模型权重没有真实加载成功，命令会失败退出，不会用 fallback 假装模型可用。

只启动本机 Chronos：

```bash
npm run chronos:local
```

手动本地启动：

```bash
cd services/chronos-bolt
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export CHRONOS_SERVICE_TOKEN=local-chronos-token
export CHRONOS_REQUIRE_MODEL=1
export CHRONOS_ENABLE_FALLBACK=0
uvicorn app:app --host 0.0.0.0 --port 8000
```

Docker 启动：

```bash
docker build -t gold-chronos-bolt services/chronos-bolt
docker run --rm -p 8000:8000 \
  -e CHRONOS_SERVICE_TOKEN=replace-with-strong-token \
  -e CHRONOS_MODEL_ID=amazon/chronos-bolt-base \
  gold-chronos-bolt
```

健康检查：

```bash
curl http://localhost:8000/health
```

`chronosLoaded=true` 才代表真实 Chronos-Bolt 已加载。`chronosLoaded=false` 时服务会用波动率 fallback 保持 HTTP 链路可联调，但不能把 fallback 表现当成真实 Chronos-Bolt 表现。生产环境可设置 `CHRONOS_REQUIRE_MODEL=1` 或 `CHRONOS_ENABLE_FALLBACK=0`，避免误用 fallback。

环境变量：

```bash
EXTERNAL_TS_MODEL_URL=https://your-chronos-bolt-service.example.com/forecast
EXTERNAL_TS_MODEL_TOKEN=replace-with-strong-token
EXTERNAL_TS_MODEL_PROVIDER=chronos
EXTERNAL_TS_MODEL_NAME=amazon/chronos-bolt-base
EXTERNAL_TS_MODEL_TIMEOUT_MS=8000
EXTERNAL_TS_MODEL_HORIZON_MINUTES=60
EXTERNAL_TS_MODEL_CONTEXT_POINTS=256
```

推理服务请求约定：

```json
{
  "task": "gold-price-direction-forecast",
  "horizonMinutes": 60,
  "latestPrice": 1001.34,
  "context": [
    { "timestamp": "2026-05-16T09:00:00.000Z", "price": 1000.1 }
  ],
  "features": {
    "ruleProbability": 0.58,
    "anchorPremiumPercent": 0.001,
    "consensusDeviationPercent": -0.0008
  }
}
```

推理服务响应约定：

```json
{
  "upProbability": 0.64,
  "confidence": 78,
  "forecastPrice": 1008.5,
  "intervalLow": 995,
  "intervalHigh": 1016,
  "rationale": ["Chronos-Bolt zero-shot forecast supports upside"],
  "risks": ["模型未针对工银积存金口径训练，必须经过分桶回测校准"]
}
```

部署建议：

- `Chronos-Bolt` 优先：轻量、概率预测友好，适合先跑 `60m` horizon。
- `TimesFM/Moirai` 第二阶段：用同一套 HTTP schema 并行部署，通过 `provider` 分桶比较谁更适合黄金积存金。
- 服务端必须鉴权：生产环境设置 `EXTERNAL_TS_MODEL_TOKEN`，推理服务校验 `Authorization: Bearer ...`。
- 策略权重受分桶门控：命中弱桶时模型权重为 `0`；同类样本不足也不加分；只有强桶且模型/本地规则共振时才允许小幅加分。

Render Blueprint 已增加 `gold-chronos-bolt` Docker 服务。部署成功后，把主服务的 `EXTERNAL_TS_MODEL_URL` 改成该服务的 `/forecast` 地址，并保持 `EXTERNAL_TS_MODEL_TOKEN` 与 `CHRONOS_SERVICE_TOKEN` 一致。

Render 同步步骤：

```bash
# 1. 在 Render Dashboard 创建 Blueprint，或对现有 Blueprint 点击 Sync。
# 2. 设置 gold-chronos-bolt 的 CHRONOS_SERVICE_TOKEN。
# 3. 设置 gold-price-monitor 的 EXTERNAL_TS_MODEL_TOKEN，值与 CHRONOS_SERVICE_TOKEN 一致。
# 4. 确认 gold-price-monitor 的 EXTERNAL_TS_MODEL_URL 指向：
#    https://gold-chronos-bolt.onrender.com/forecast
```

部署后验证真实模型加载：

```bash
CHRONOS_SERVICE_URL=https://gold-chronos-bolt.onrender.com \
CHRONOS_SERVICE_TOKEN=replace-with-strong-token \
npm run verify:chronos
```

如果脚本报 `chronosLoaded=false`，说明 HTTP 服务可用但真实 Chronos-Bolt 还没加载成功。常见原因是 Render 实例内存不足、模型权重下载失败或 `chronos-forecasting` 依赖安装失败。此时不要让模型权重放大交易信号，可以先设置 `CHRONOS_ENABLE_FALLBACK=0` 让服务显式失败。

## 外部模型样本积累

live 样本是模型能否真正加权的核心。主服务每次刷新行情时会保存 external model 输出和之后价格结果，`/api/backtest` 会按概率、置信度、交易时段、形态、事件窗口、provider 等维度做分桶统计。

10 年历史黄金价格/K线可以用于冷启动，但必须和 live 样本分开：

- `live`：真实上线后逐笔产生，只要样本足够，才允许进入强/弱桶门控。
- `historical`：用 GC=F、XAUUSD、AU9999 或授权 SGE/银行历史 K线离线重放，只能作为先验和模型筛选。
- `synthetic`：任何插值、换算或模拟样本只能用于压力测试，不能参与策略加权。

推荐顺序：

- 先积累 live：`EXTERNAL_TS_MODEL_URL` 配好后，工作日交易时间持续采样，目标先达到每个关键桶 `10-20` 个合格样本。
- 再做历史预热：用最近 10 年日线验证大方向稳定性，用最近 1-2 年小时线/分钟线验证 `60m` horizon；所有历史样本标记 `sampleOrigin=historical`。
- Gate 使用 live 优先：live 样本不足时可以展示 historical 结果，但不允许历史强桶直接放大实盘信号。
- 防未来函数：每个历史样本只能使用该时间点之前的 K线和因子，不能把未来高低点、未来事件结果泄露给模型。

本地 Chronos 跑起来后，可以直接做 10 年黄金历史离线验证：

```bash
npm run validate:historical
```

默认配置：

```bash
HISTORICAL_GOLD_SYMBOL=GC=F
HISTORICAL_GOLD_YEARS=10
HISTORICAL_CONTEXT_POINTS=128
HISTORICAL_HORIZON_DAYS=1
HISTORICAL_SAMPLE_STRIDE=5
HISTORICAL_MAX_SAMPLES=260
CHRONOS_SERVICE_URL=http://127.0.0.1:8000
CHRONOS_SERVICE_TOKEN=local-chronos-token
```

脚本会优先从 Yahoo Chart 拉取 `GC=F` 10 年日线；如果当前网络环境无法访问 Yahoo，会自动切换到 NBP 官方黄金价格 `NBP_GOLD_PLN_G`（PLN/克）继续验证。每个样本只使用该时间点之前的 K 线作为 context 调用 Chronos `/forecast`，输出：

```bash
reports/historical-gold-validation.json
```

报告指标包括：

- `winRate`：模型方向判断胜率。
- `baselineWinRate`：同期黄金自然上涨比例。
- `excessWinRate`：模型相对基准提升。
- `profitFactor`：正收益/负收益绝对值。
- `brierScore`：概率校准误差，越低越好。

注意：该报告是 `sampleOrigin=historical`，只能用于离线筛选和预热，不会写入 live gate，也不会直接放大实盘买点。

## 多模型 Provider 对比

TimesFM 和 Moirai 后续应复用同一套 `/forecast` schema，差异只体现在 `EXTERNAL_TS_MODEL_PROVIDER` 与模型服务内部实现。

后端已支持并行 endpoint 配置：

```bash
EXTERNAL_TS_MODEL_ENDPOINTS='[
  {
    "url": "https://gold-chronos-bolt.onrender.com/forecast",
    "provider": "chronos",
    "name": "amazon/chronos-bolt-base",
    "token": "replace-with-chronos-token",
    "timeoutMs": 8000
  },
  {
    "url": "https://gold-timesfm.onrender.com/forecast",
    "provider": "timesfm",
    "name": "google/timesfm",
    "token": "replace-with-timesfm-token",
    "timeoutMs": 8000
  },
  {
    "url": "https://gold-moirai.onrender.com/forecast",
    "provider": "moirai",
    "name": "salesforce/moirai",
    "token": "replace-with-moirai-token",
    "timeoutMs": 8000
  }
]'
```

设置 `EXTERNAL_TS_MODEL_ENDPOINTS` 后，主服务会并行调用所有 provider。策略评分仍只选择一个主军师低权重参与，所有 provider 结果都会写入 `externalModelCandidates`，随后 `/api/backtest` 用已有 `provider:*` 分桶比较 live 胜率、超额胜率、Profit Factor、Brier 和 MAE。

建议演进：

- 阶段 1：单 Chronos 服务上线，`provider=chronos`，让 live 分桶先从样本不足进入可用。
- 阶段 2：新增 TimesFM/Moirai 独立服务，用相同 payload 和 response schema，分别写入 `provider=timesfm/moirai`。
- 阶段 3：打开 `EXTERNAL_TS_MODEL_ENDPOINTS`，同一轮行情并行调用多个 provider。
- 阶段 4：前端新增 provider 排行榜，按 live 胜率、超额胜率、Profit Factor、Brier、MAE、稳定性选择最适合黄金积存金的军师。

## 验收命令

```bash
npm run test --workspace server
npm run build --workspace server
npm run lint --workspace web
npm run build --workspace web
```
