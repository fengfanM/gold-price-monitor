# 多源数据真实性与 Provider Health 审计

审计日期：2026-05-16

## 1. 结论

现有 provider 不能简单按“能 fetch 到数据”视为同等可靠。建议分为四级使用：

| 等级 | 用途 | 当前源 | 强信号规则 |
| --- | --- | --- | --- |
| critical | 直接影响黄金方向和人民币报价校准 | `GC=F`、FRED `DTWEXBGS`、FRED `DEXCHUS`、`DFII10` | 失败时禁止强买/强卖，只允许观察或降级 |
| core | 决定中期资金、基准和拥挤度 | COT、GLD、LBMA、WGC ETF、CME OI | 失败超过 1 个时强信号降级 |
| supporting | 补充风险偏好、国内外辅助行情 | VIX、金投网、央行购金、CME volume | 失败时降低解释可信度，不单独否决 |
| experimental | 文本情绪和观点聚合 | 新闻 RSS、博主 RSS | 只能做解释和提示，不可单独驱动交易 |

## 2. Provider 逐项风险

| Provider | 真实性 | 授权/反爬风险 | 延迟/频率风险 | 落地建议 |
| --- | --- | --- | --- | --- |
| Yahoo `query1/query2.finance.yahoo.com` | 可快速拿到期货代理行情，但不是稳定官方授权 API | 高。端点未承诺稳定，可能 403、429 限流、Cookie/crumb 变化 | 只适合低频 fallback，不适合生产高频采集 | 保留为国际金免费代理源；美元指数/汇率已切到 FRED |
| FRED API/CSV | 官方宏观源，适合美元广义指数、美元/人民币、实际利率、通胀预期、VIX、美债 | 低。JSON API 需要 `FRED_API_KEY`，CSV fallback 更宽松但不应高频撞源 | 宏观数据日频/低频，非实时 | 配置 `FRED_API_KEY`；按小时或日缓存 |
| 金投网/金价号 | 国内贵金属辅助报价，适合作为备用和交叉验证 | 中高。JSONP 接口偏网页内部调用，可能反爬或字段变化 | 适合辅助，不宜做唯一价格锚 | 限频、缓存；只作为 supporting 源 |
| CFTC COT / Nasdaq Data Link 风格 CSV | 官方 CFTC 是源头，当前默认 URL 是第三方镜像/旧 Quandl 风格 | 中。第三方 CSV 可能停用；官方 CFTC 可下载但字段可能变化 | 周频，通常滞后到报告日 | 配置 `COT_GOLD_NET_URL` 指向可控 CSV；长期切官方 CFTC public reporting/export |
| GLD holdings | GLD/SPDR 是合理源头，但当前需配置 CSV/URL 才稳定 | 中。官网 HTML 易变；CSV 最好走用户自管或授权源 | 日频，非秒级 | 配置 `GLD_HOLDINGS_CSV_URL`，字段固定为 Date + Tonnes |
| LBMA/IBA Gold PM | 权威基准价 | 高。LBMA Gold Price 由 IBA 管理，估值/定价/交易用途通常涉及许可 | 日内两次定盘，不是实时行情 | 生产必须使用授权 CSV 或内部合规数据，不抓公开页替代 |
| WGC ETF flow | WGC 数据权威，当前 public chart API 是网页依赖，不是稳定产品 API | 中。API 路径和 break-cache 参数可能变化 | 周/月频，适合中期资金流 | 优先配置 `WGC_GOLD_ETF_FLOW_CSV_URL` 或可控下载表 |
| WGC central bank page | 内容权威，但当前是 HTML 文本解析 | 中。页面结构变化会误解析 | 季度/月度，低频 | 配置 `CENTRAL_BANK_GOLD_CSV_URL`，不要依赖 regex 长期运行 |
| CME OI/volume | CME 官方数据权威，但 OI/volume 都必须配置 CSV 或本地文件 | 高。官方实时/统计数据通常有许可 | OI/volume 日频，字段需稳定 | 配置 `CME_GOLD_OI_CSV_URL`、`CME_GOLD_VOLUME_CSV_URL` 或 `CME_GOLD_VOLUME_CSV_FILE` |
| Google News RSS / 自定义 RSS | 可做新闻线索，不等于原文或情绪真值 | 中。RSS 搜索结果会去重、聚合、重排，源质量不一致 | 高频标题噪声大，易重复 | 配置可信媒体 RSS，情绪只做 experimental |

## 3. 已落地的 health 质量维度

- `sourceTier`：区分 `critical`、`core`、`supporting`、`experimental`，供策略层决定是否允许强信号。
- `latencyQuality` 与 `latencyWeight`：把 fetch 延迟映射为 `fast`、`normal`、`slow`、`timed_out`，慢源会被降权。
- `failureStreak` 与 `cooldownUntil`：连续失败后进入短冷却，避免反复撞反爬源、慢源或临时限流。
- `qualityScore`：综合源等级、通断、延迟和连续失败，输出 0-100 质量分。
- `reliabilityRisk`：输出 `low`、`medium`、`high`，方便前端、模型和专家解释层统一展示风险。

## 4. 模型 worker 可直接使用的特征建议

| 特征 | 类型 | 建议方向 |
| --- | --- | --- |
| `critical_provider_live_ratio` | 0-1 | 低于 0.75 时禁止强信号 |
| `core_provider_live_ratio` | 0-1 | 低于 0.6 时降低宏观/资金流权重 |
| `min_critical_quality_score` | 0-100 | 低于 70 时触发数据健康门控 |
| `avg_scoring_latency_weight` | 0-1 | 低于 0.75 时说明探测慢，信号置信度折扣 |
| `provider_failure_streak_max` | integer | 大于等于 2 时展示“上游连续失败”风险 |
| `experimental_sentiment_available` | boolean | 仅影响解释丰富度，不提高强信号等级 |
| `official_csv_coverage_ratio` | 0-1 | GLD/LBMA/WGC/CME/COT 已配置比例，作为生产可信度指标 |

## 5. 需要用户配置

- `FRED_API_KEY`：提高宏观源稳定性。
- `GLD_HOLDINGS_CSV_URL`：GLD 持仓吨数官方或可控 CSV。
- `LBMA_GOLD_PM_CSV_URL` 或 `IBA_GOLD_PM_CSV_URL`：合规授权的伦敦金定盘 CSV。
- `WGC_GOLD_ETF_FLOW_CSV_URL`：WGC ETF flow 固定 CSV，替代网页 API。
- `CENTRAL_BANK_GOLD_CSV_URL`：央行购金固定 CSV，替代 HTML 文本解析。
- `CME_GOLD_OI_CSV_URL`、`CME_GOLD_VOLUME_CSV_URL`、`CME_GOLD_VOLUME_CSV_FILE`：CME OI/volume 授权或内部清洗 CSV。
- `COT_GOLD_NET_URL`：可控 COT 黄金非商净多头 CSV，字段至少含日期、非商业多头、非商业空头。
- `GOLD_NEWS_RSS_URLS`、`GOLD_BLOGGER_RSS_URLS`：可信新闻和观点源列表。

## 6. 外部依据

- [FRED observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) 支持 `series_id`、`api_key`、`file_type=json/csv` 等参数，适合宏观序列。
- [CFTC COT 官方说明](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) 显示 COT 用于公开理解市场动态，并支持 CSV/TSV/XML 等下载格式。
- [LBMA Gold Price](https://www.lbma.org.uk/prices-and-data/lbma-gold-price) 说明 Gold Price 由 IBA 管理，估值、定价、交易和金融产品用途需要 IBA 使用许可。
- [WGC Gold ETFs holdings and flows](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows) 覆盖全球实物支持黄金 ETF，网站披露周/月更新节奏和吨/USD 单位。
- [CME futures and options data](https://www.cmegroup.com/market-data/browse-data/catalog/futures-and-options-data.html) 说明官方期货/期权数据和 API 需要许可，包含 volume、open interest 等统计。
