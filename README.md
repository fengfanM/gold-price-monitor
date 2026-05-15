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

默认前端运行在 `http://localhost:8787`，后端运行在 `http://localhost:3001`。

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

也包含 `render.yaml` 和 `Dockerfile`，可部署到支持 Node 服务的环境。

## 免责声明

页面中的买点信号仅用于行情观察和风险提示，不构成投资建议、收益承诺或买入指令。
