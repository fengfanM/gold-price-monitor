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
INGEST_REFRESH_TTL_MS=60000
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
GOLD_NEWS_RSS_URLS=https://news.google.com/rss/search?q=gold%20price
GOLD_BLOGGER_RSS_URLS=https://news.google.com/rss/search?q=gold%20analyst%20outlook
```

### Vercel API 与 Cron

已提供以下 serverless API：

- `/api/quote`、`/api/history`、`/api/snapshot`、`/api/health`：行情与基础健康检查。
- `/api/backtest`：读取持久化的 backtest snapshots 并返回回测监控结果。
- `/api/providers/health`：默认探测所有市场数据 provider 并保存健康快照；可用 `?probe=0` 只读历史。
- `/api/cron/ingest`：定时入口，刷新行情快照、通过既有 `QuoteService` 持久化历史和训练样本，并保存 provider health。

`vercel.json` 默认配置：

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 0 * * *"
    }
  ]
}
```

生产必须设置 `CRON_SECRET`。Vercel Cron 会以 `Authorization: Bearer $CRON_SECRET` 调用；手动排查时也支持 `x-cron-secret` header 或 `?secret=`。需要立即采样可追加 `?force=1`。

当前 Vercel Hobby 账号只允许每日 Cron，所以仓库默认使用每日保底采集。若要实现 5 分钟级或更高频率采集，请升级 Vercel Pro，或用 Render/外部定时器调用 `/api/cron/ingest`。

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
- `CME_GOLD_VOLUME_CSV_URL`：列名可包含 `volume`、`total volume`、`value`；未配置时用 Yahoo `GC=F` 日成交量作短线活跃度代理。
- `ZHESHANG_ACCUMULATION_GOLD_URL`：浙商积存金参考源。默认使用第三方文本镜像，只参与“银行参考/多源校准”，不替代工银官方报价；若有浙商官方或自建镜像，可配置为 JSON 并用 `ZHESHANG_ACCUMULATION_GOLD_JSON_PATH` 指向价格字段。
- `AU9999_REFERENCE_URL`：可选 AU9999 备用参考源。已有上金所延时页作为核心锚；该项用于官方源不可用时补充校准。

## 验收命令

```bash
npm run test --workspace server
npm run build --workspace server
npm run lint --workspace web
npm run build --workspace web
```
