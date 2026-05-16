# Chronos-Bolt HTTP 推理服务

这个服务把 Chronos-Bolt 封装成独立 HTTP 推理接口，供 Node 主服务通过 `EXTERNAL_TS_MODEL_URL` 调用。接口兼容 `apps/server/src/external-model-advisor.ts`，失败时主服务会自动降级，不会阻塞行情刷新。

## 接口

- `GET /health`：检查服务是否可用，以及 Chronos 模型是否已加载。
- `POST /forecast`：返回黄金方向概率、置信度、预测价和区间。

请求头：

```bash
Authorization: Bearer $CHRONOS_SERVICE_TOKEN
```

生产环境建议必须设置 `CHRONOS_SERVICE_TOKEN`。如果不设置，服务不会鉴权，只适合本地开发。

## 本地运行

最简一键全栈联调，不需要 Render、Railway、Hugging Face 或任何云平台账号：

```bash
npm run dev:ai
```

这个命令会自动：

- 创建 `services/chronos-bolt/.venv`。
- 安装 Chronos-Bolt Python 依赖。
- 以 `CHRONOS_REQUIRE_MODEL=1` 和 `CHRONOS_ENABLE_FALLBACK=0` 启动本机 Chronos 服务。
- 等待 `/health` 返回 `chronosLoaded=true`。
- 启动 Node 主服务，并把 `EXTERNAL_TS_MODEL_URL` 指向 `http://127.0.0.1:8000/forecast`。
- 启动 Vite 前端。

如果真实 Chronos 权重没有加载成功，命令会失败退出，不会用 fallback 假装成功。

只启动 Chronos 服务：

```bash
npm run chronos:local
```

默认本机 token 是 `local-chronos-token`，如需覆盖：

```bash
LOCAL_CHRONOS_TOKEN=your-local-token npm run dev:ai
```

手动运行方式：

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

主服务本地配置：

```bash
EXTERNAL_TS_MODEL_URL=http://127.0.0.1:8000/forecast
EXTERNAL_TS_MODEL_TOKEN=local-chronos-token
EXTERNAL_TS_MODEL_PROVIDER=chronos
EXTERNAL_TS_MODEL_NAME=amazon/chronos-bolt-base
EXTERNAL_TS_MODEL_TIMEOUT_MS=12000
EXTERNAL_TS_MODEL_HORIZON_MINUTES=60
EXTERNAL_TS_MODEL_CONTEXT_POINTS=256
```

## Docker

```bash
docker build -t gold-chronos-bolt services/chronos-bolt
docker run --rm -p 8000:8000 \
  -e CHRONOS_SERVICE_TOKEN=replace-with-strong-token \
  -e CHRONOS_MODEL_ID=amazon/chronos-bolt-base \
  gold-chronos-bolt
```

联调：

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/forecast \
  -H "Authorization: Bearer replace-with-strong-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "amazon/chronos-bolt-base",
    "provider": "chronos",
    "task": "gold-price-direction-forecast",
    "horizonMinutes": 60,
    "symbol": "ICBC_ACCUMULATION_GOLD",
    "unit": "元/克",
    "latestPrice": 1001.34,
    "context": [
      {"timestamp": "2026-05-17T09:00:00.000Z", "price": 998.2},
      {"timestamp": "2026-05-17T09:01:00.000Z", "price": 998.8},
      {"timestamp": "2026-05-17T09:02:00.000Z", "price": 999.1},
      {"timestamp": "2026-05-17T09:03:00.000Z", "price": 999.5},
      {"timestamp": "2026-05-17T09:04:00.000Z", "price": 1000.2},
      {"timestamp": "2026-05-17T09:05:00.000Z", "price": 1000.5},
      {"timestamp": "2026-05-17T09:06:00.000Z", "price": 1000.9},
      {"timestamp": "2026-05-17T09:07:00.000Z", "price": 1001.34}
    ],
    "features": {
      "ruleProbability": 0.58,
      "ruleConfidence": 62,
      "percentChange24h": 0.002,
      "consensusDeviationPercent": -0.0008
    }
  }'
```

## Render 部署

新增一个独立 Web Service：

- Runtime：Docker
- Root Directory：`services/chronos-bolt`
- Dockerfile Path：`services/chronos-bolt/Dockerfile`
- Health Check Path：`/health`

环境变量：

```bash
CHRONOS_SERVICE_TOKEN=replace-with-strong-token
CHRONOS_MODEL_ID=amazon/chronos-bolt-base
CHRONOS_DEVICE=cpu
CHRONOS_TORCH_DTYPE=float32
CHRONOS_ENABLE_FALLBACK=1
```

部署成功后，在主服务配置：

```bash
EXTERNAL_TS_MODEL_URL=https://your-chronos-service.onrender.com/forecast
EXTERNAL_TS_MODEL_TOKEN=replace-with-strong-token
EXTERNAL_TS_MODEL_PROVIDER=chronos
EXTERNAL_TS_MODEL_NAME=amazon/chronos-bolt-base
```

## Fallback 说明

服务启动时会尝试加载 `amazon/chronos-bolt-base`。如果模型依赖或权重下载失败，默认会启用波动率 fallback，便于本地联调 HTTP 链路。

生产验收标准：

- `/health` 返回 `chronosLoaded=true`，才代表真实 Chronos-Bolt 已参与推理。
- 如果只看到 `chronosLoaded=false`，主服务可能变成 `live`，但这只是接口联通，不应把 fallback 表现当作真实模型表现。
- 可以设置 `CHRONOS_REQUIRE_MODEL=1` 或 `CHRONOS_ENABLE_FALLBACK=0`，让生产环境在模型不可用时直接失败，避免误用 fallback。
