# Gold Price Monitor

面向工银积存金的实时行情监控网页，提供专业分时图、K 线视图、上金所延时行情校准、24 小时急跌提醒和“绝佳买点观察”信号。

## 功能

- 工银积存金官方异步行情优先，工行页面解析兜底。
- 上海黄金交易所延时行情作为参考锚，过滤无效价格后参与校准。
- 15 秒前端自动刷新，服务端维护 24 小时历史窗口。
- 支持分时图和 1/5/15/60 分钟 K 线切换，带十字光标读数。
- 当 24 小时跌幅或回撤过大时突出告警。
- 基于回撤位置、数据健康、锚点折溢价、短线企稳等规则生成买点观察信号。

## 本地运行

```bash
npm install
npm run dev:server
npm run dev:web
```

默认前端开发服务由 Vite 启动，通常运行在 `http://localhost:5173`；后端 API 运行在 `http://localhost:8787`，前端已将 `/api` 代理到该端口。

生产模式下执行 `npm run build && npm start` 后，后端会在 `http://localhost:8787` 同时托管 API 和前端静态文件。

## 构建与检查

```bash
npm run build
npm run lint --workspace web
```

## 部署

本项目已包含 Vercel serverless 适配，直接使用：

```bash
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

Vercel 生产环境建议配置持久化和定时采集：

```bash
STORAGE_ADAPTER=postgres
POSTGRES_HTTP_URL=https://your-postgres-gateway.example.com/query
POSTGRES_HTTP_TOKEN=replace-with-strong-token
CRON_SECRET=replace-with-strong-cron-secret
```

`/api/cron/ingest` 已在 `vercel.json` 中配置为每日保底执行一次，用于刷新行情快照、保存回测训练样本并记录 provider health。当前 Vercel Hobby 账号只允许每日 Cron；如需 5 分钟级高频采集，请升级 Vercel Pro，或用 Render/外部定时器调用该 endpoint。`/api/backtest` 与 `/api/providers/health` 也支持 Vercel serverless 访问。

也包含 `render.yaml` 和 `Dockerfile`，可部署到支持 Node 服务的环境。

## 免责声明

页面中的买点信号仅用于行情观察和风险提示，不构成投资建议、收益承诺或买入指令。
