# 数据源真实性审计

## 结论

当前系统已经把数据源接入到统一 provider 和多源策略引擎，但“是否真实可参考”取决于运行环境是否能访问对应上游，以及生产环境变量是否配置。

页面现在会按三类展示：

- `实时`：本次请求拿到真实上游数据，参与评分。
- `本地推演`：由真实历史/行情派生，例如金银比、规则雷达、回测。
- `未配置/不可用`：上游失败或环境变量未配置，只按中性/降权处理，不会放大强买点。

## 已内置抓取或可直接降级

- 工行积存金：主报价源，用于核心价格。
- 工行公开页：备用报价源。
- 上金所延时行情：国内锚点，用于校准工行价格。
- Yahoo：国际黄金期货免费代理源；生产需限频、缓存或替换为授权行情。
- FRED：美元指数广义指数、美元/人民币、实际利率、通胀预期、VIX、联邦基金利率、10Y 美债、收益率曲线。
- 金投网：国内黄金、国际黄金、国际白银备用源。
- COT：默认尝试 Nasdaq Data Link / Quandl 风格 CSV，也支持 `COT_GOLD_NET_URL`。
- Google News RSS：新闻情绪与博主/分析师观点的默认兜底 RSS。

## 已补默认真实/代理接入，但生产建议配置稳定源

- `WGC_ETF_FLOW`：默认尝试 World Gold Council 的 gold.org 图表 API，生产可用 `WGC_GOLD_ETF_FLOW_CSV_URL` 或 `WGC_GOLD_ETF_FLOW_API_URL` 固定数据源。
- `CENTRAL_BANK_GOLD`：默认尝试 World Gold Council 央行购金研究页，解析最新公开季度净购金；生产建议用 `CENTRAL_BANK_GOLD_CSV_URL` 固化表格。
- `CME_GOLD_VOLUME`：不再默认使用 Yahoo `GC=F` 日成交量代理；生产需配置 `CME_GOLD_VOLUME_CSV_URL` 或 `CME_GOLD_VOLUME_CSV_FILE`。

## 生产必须配置才算真实官方源

- `GLD_HOLDINGS_CSV_URL` 或 `GLD_HOLDINGS_URL`：GLD ETF 持仓吨数。
- `LBMA_GOLD_PM_CSV_URL`：LBMA 伦敦金 PM 定盘。
- `CME_GOLD_OI_CSV_URL`：CME 黄金未平仓合约。
- `GOLD_NEWS_RSS_URLS`：正式新闻源列表，建议配置 Reuters、CNBC、MarketWatch 等 RSS。
- `GOLD_BLOGGER_RSS_URLS`：可信博主/分析师 RSS 或内部观点聚合源。

## 评分原则

- 买点/卖点建议不会只看单个价格或 24h 区间。
- 主评分综合：24h 水位、多周期估值、Sharpe/Sortino/IR、最大回撤、MA/RSI/MACD、上金所锚点、宏观因子、资金流、新闻/博主情绪、Walk-forward 回测。
- 专家团会引用关键支撑因子和压力因子，并把不可用源作为降权风险。
- 未配置官方源不会被伪装成“已接入”，页面会显示未配置/不可用。

## 小白读法

- 看“数据源真实性审计”：确认实时源数量是否足够。
- 看“多源策略雷达”：确认支撑项和压力项谁更多。
- 展开每个因子的“看懂这个指标”：理解它是什么、越高/越低意味着什么、对黄金有什么影响。
- 最后看“量化专家建议团”：如果专家团仍是等待/暂避，说明不能只因为价格跌了就买。
