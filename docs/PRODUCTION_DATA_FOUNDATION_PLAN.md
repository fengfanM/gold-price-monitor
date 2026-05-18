# 生产数据底座开发计划

## 目标

让线上 Vercel 站点从“可打开演示”升级为“可持续积累 live 样本”的生产数据底座，解决分时/K线只能从最新开始画、回测样本不足、provider health 无历史、外部模型 gate 无法评估的问题。

## 依赖顺序

1. 持久化存储：先配置 `STORAGE_ADAPTER=postgres`、`POSTGRES_HTTP_URL`、`POSTGRES_HTTP_TOKEN`，否则 Vercel `/tmp` 会在冷启动或部署后丢失历史。
2. Cron 拆分：主行情高频采集只写 quote/history/backtest；provider health 低频探测，避免 Yahoo/FRED/CME 被高频打爆。
3. 历史回填：上线初期通过受保护接口导入最近 24-72 小时可信行情，避免图表从零开始。
4. 宏观源补齐：配置 `FRED_API_KEY`、`CME_GOLD_VOLUME_CSV_URL` 等真实数据源。
5. 外部模型：部署公网 Chronos/TimesFM/Moirai 服务后，再配置 `EXTERNAL_TS_MODEL_URL` 或 `EXTERNAL_TS_MODEL_ENDPOINTS`。

## 模块分派

| 模块 | 交付物 | 验收标准 |
| --- | --- | --- |
| Storage | Postgres HTTP storage adapter and env docs | `/api/snapshot` 多实例读写同一份 history |
| Quote Cron | `/api/cron/ingest` | 不再触发 provider probe，只采主行情和 backtest snapshot |
| Provider Cron | `/api/cron/providers` | 独立低频保存 provider health history |
| Backfill | `/api/admin/backfill-history` | 能导入、校验、去重、排序最近历史点 |
| Deployment | `vercel.json` and docs | Cron 路由和函数超时配置完整 |
| Validation | tests/build/online checks | server tests、build、diagnostics、线上 health 全通过 |

## 当前已落地

- `/api/cron/ingest` 已拆成主行情采集，不再同步探测 Yahoo/FRED/CME。
- `/api/cron/providers` 已新增，用于低频 provider health 探测。
- `/api/admin/backfill-history` 已新增，用于受保护历史种子导入。
- `history-backfill` 纯函数已新增，负责校验、规范化、去重、排序和窗口限制。
- `vercel.json` 已保留 Vercel Hobby 可部署的每日 quote ingest 保底 Cron；高频 quote ingest 和低频 provider probe 通过已新增 API 入口交给外部定时器或 Vercel Pro Cron。

## 待外部配置

- `POSTGRES_HTTP_URL`：Postgres HTTP SQL gateway 地址。
- `POSTGRES_HTTP_TOKEN`：Postgres gateway 鉴权 token。
- `CRON_SECRET`：Cron/手动采样鉴权。
- `BACKFILL_SECRET`：历史回填鉴权，可与 `CRON_SECRET` 不同。
- `FRED_API_KEY`：FRED 官方 JSON API key。
- `CME_GOLD_VOLUME_CSV_URL`：CME 成交量 CSV。
- `EXTERNAL_TS_MODEL_URL` / `EXTERNAL_TS_MODEL_TOKEN`：公网外部模型服务。

## 历史回填格式

```json
{
  "windowHours": 72,
  "points": [
    {
      "timestamp": "2026-05-18T10:00:00.000Z",
      "price": 1000.5,
      "activePrice": 1000.5,
      "regularPrice": 1000.3,
      "sellPrice": 999.8,
      "dayLow": 998.9,
      "dayHigh": 1002.1,
      "sourceKind": "official"
    }
  ]
}
```

调用示例：

```bash
curl -X POST "https://gold-price-monitor-gray.vercel.app/api/admin/backfill-history" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $BACKFILL_SECRET" \
  --data @seed-history.json
```

## 风险边界

- historical/backfill 样本只用于图表初始化和冷启动缓冲；是否进入模型 gate 必须继续标记样本来源并防止污染 live 评估。
- provider probe 不应高频运行；Yahoo 仍只适合作为国际金低频 fallback。
- 如果 Vercel 账号不支持高频 Cron，需要用外部定时器调用 `/api/cron/ingest`，并低频调用 `/api/cron/providers`。
