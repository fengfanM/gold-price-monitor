# Gold Price Monitor Web

React + Vite 前端应用，负责展示黄金积存金行情终端、分时图、K线、右侧决策 Tab、回测监控和外部模型军师状态。

## 功能范围

- 分时图与 `1/5/15/60` 分钟聚合展示。
- K线图与 MA、BOLL、RSI、MACD 指标。
- 多源校准价、支撑压力、预测区间和关键价位。
- 右侧 `决策 / 计划 / 风控 / 依据 / 验证` 信息架构。
- Chronos/TimesFM/Moirai 外部模型状态和分桶回测展示。
- provider health、长期回测和失败样本透明化。

## 本地运行

```bash
npm run dev --workspace web
```

默认代理 `/api` 到 `http://localhost:8787`。如需指向另一个本地主服务：

```bash
VITE_API_PROXY_TARGET=http://localhost:8788 npm run dev --workspace web
```

## 构建

```bash
npm run lint --workspace web
npm run build --workspace web
```

## 设计原则

- 图表周期只控制展示粒度，不等于独立交易信号周期。
- 顶部信号来自全局策略和回测 gate，必须明确标注来源。
- 未悬停时默认展示最新点或最新 K 线，避免用户误以为数据为空。
- 所有买卖点文案保持“观察/风险提示”语义，不写成确定性指令。
