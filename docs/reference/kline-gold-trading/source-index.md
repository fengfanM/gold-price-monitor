# K线理论与黄金交易实践资料索引

> 本索引只收录合法入口、官方来源、公开教育页、正版书籍入口和资料摘要。疑似盗版 PDF、未授权扫描件和侵权全文不保存。

## 1. 官方与半官方黄金资料

| 来源 | URL | 类型 | 重点吸收 | 入库用途 |
| --- | --- | --- | --- | --- |
| World Gold Council Goldhub | `https://www.gold.org/goldhub` | 官方研究中心 | 黄金供需、央行购金、ETF、投资需求 | 宏观解释、周/月频因子 |
| WGC Gold Demand Trends | `https://www.gold.org/goldhub/research/gold-demand-trends` | 官方报告 | 季度黄金需求、ETF、央行、金饰、科技用金 | 黄金基本面背景 |
| WGC Gold Outlook 2026 | `https://www.gold.org/goldhub/research/gold-outlook-2026` | 官方展望 | 2026 年黄金走势、央行购金、地缘与宏观风险 | 长线配置评分 |
| WGC Q1 2026 Central Banks | `https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-q1-2026/central-banks` | 官方专题 | 央行购金量、储备结构、地缘不确定性 | `official_sector_support` |
| WGC China Q1 2026 | `https://china.gold.org/news/press-releases/2026/04/29/19611` | 官方中文资料 | 高金价下需求结构变化、央行支撑 | 中文解释素材 |
| CME COMEX Gold Futures | `https://www.cmegroup.com/markets/metals/precious/gold.html` | 官方合约页 | GC 合约、交易活跃度、期货定价锚 | CME 数据源配置 |
| CME Gold Futures 中文介绍 | `https://www.cmegroup.com/cn-s/trading/why-futures/welcome-to-comex-gold-futures.html` | 官方教育页 | COMEX 黄金期货用途、避险、通胀对冲 | 小白解释 |
| CME Volume & OI | `https://www.cmegroup.com/market-data/volume-open-interest.html` | 官方市场数据 | 成交量、未平仓合约 | `futures_participation_score` |
| CFTC COT | `https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm` | 官方持仓报告 | 非商业净多、商业套保、拥挤度 | `cot_positioning_score` |
| FRED DGS10 | `https://fred.stlouisfed.org/series/DGS10` | 官方宏观数据 | 10 年美债名义利率 | 实际利率、机会成本 |
| FRED DFII10 | `https://fred.stlouisfed.org/series/DFII10` | 官方宏观数据 | 10 年 TIPS 实际利率 | `real_rate_score` |
| FRED T10YIE | `https://fred.stlouisfed.org/series/T10YIE` | 官方宏观数据 | 10 年通胀预期 | `inflation_support_score` |
| FRED DTWEXBGS | `https://fred.stlouisfed.org/series/DTWEXBGS` | 官方美元指数替代 | 美元广义指数 | `dxy_pressure_score` |
| FRED DEXCHUS | `https://fred.stlouisfed.org/series/DEXCHUS` | 官方汇率数据 | 美元兑人民币 | 国内金价校准 |
| BLS CPI | `https://www.bls.gov/news.release/cpi.htm` | 官方通胀发布 | CPI 公布、事件冲击 | 事件风控 |
| BLS CPI FAQ | `https://www.bls.gov/cpi/questions-and-answers.htm` | 官方解释 | CPI 含义、口径 | 小白解释 |
| BEA PCE | `https://www.bea.gov/data/personal-consumption-expenditures-price-index` | 官方通胀数据 | PCE、核心 PCE | 美联储政策预期 |

## 2. K线与技术分析公开教育资料

| 来源 | URL | 类型 | 重点吸收 | 风险提示 |
| --- | --- | --- | --- | --- |
| CME K线/条形图教育页 | `https://www.cmegroup.cn/knowledge/1339.htm` | 公开教育 | OHLC、实体、上下影线、位置决定意义 | 只适合作为基础解释 |
| CFA Institute Technical Analysis | `https://www.cfainstitute.org/en/membership/professional-development/refresher-readings/technical-analysis` | 专业教育 | 均线、趋势过滤、技术分析框架 | 偏概念，需转回测 |
| Fidelity Technical Indicator Guide | `https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/overview?filter=Trend` | 公开教育 | 趋势指标、EMA、Aroon、Ichimoku 等 | 非黄金专属 |
| Fidelity Moving Average | `https://www.fidelity.com/viewpoints/active-investor/moving-averages` | 公开教育 | 均线、交叉、趋势信号 | 需过滤震荡假信号 |
| Investopedia Candlestick Patterns | `https://www.investopedia.com/articles/active-trading/092315/5-most-powerful-candlestick-patterns.asp` | 公开教育 | 强 K 线组合、吞没、星线等 | 不可直接等同胜率 |
| Investopedia Bullish Candlesticks | `https://www.investopedia.com/articles/active-trading/062315/using-bullish-candlestick-patterns-buy-stocks.asp` | 公开教育 | 看涨吞没、锤子、晨星等 | 需结合位置 |
| Investopedia Bollinger Bands | `https://www.investopedia.com/terms/b/bollingerbands.asp` | 公开教育 | 布林带、波动率、上下轨 | 趋势市不能机械反向 |
| Turtle Trading System 概览 | `https://turtlesignals.com/the-turtle-trading-system/` | 公开教育 | ATR/N、突破、单位仓位 | 需避免盗版规则全文 |
| Quantified Strategies Candlestick Backtest | `https://www.quantifiedstrategies.com/candlestick-patterns-ranked-by-backtest/` | 量化经验 | 用回测评价 K 线形态 | 不同市场需重测 |
| FuturesHive Candlestick Guide | `https://www.futureshive.com/blog/candlestick-patterns-trading-guide-2025` | 网络教育 | 形态 + 支撑阻力 + VWAP/成交量确认 | 非权威，作为经验参考 |
| Candle Range Theory 概览 | `https://traderfactor.com/what-is-the-candle-range-theory-strategy/` | 网络经验 | 累积、操纵、派发、假突破 | 需严防玄学化 |

## 3. 正版书籍入口与吸收点

| 书籍 | 合法入口/检索词 | 重点吸收 | 不保存内容 |
| --- | --- | --- | --- |
| Steve Nison《Japanese Candlestick Charting Techniques》 | `https://www.penguin.co.nz/books/japanese-candlestick-charting-techniques-9780735201811` | 蜡烛图历史、心理、反转/持续形态 | 不保存扫描 PDF |
| Steve Nison《The Candlestick Course》 | `https://www.wiley.com/en-be/The+Candlestick+Course-p-9780471464884` | K线训练课程、识别与确认 | 不保存全文 |
| Steve Nison《Strategies for Profiting with Japanese Candlestick Charts》 | `https://www.wiley.com/en-ie/Strategies+for+Profiting+with+Japanese+Candlestick+Charts-p-9781592804542` | 蜡烛图策略化应用 | 不保存全文 |
| John Murphy《Technical Analysis of the Financial Markets》 | `https://www.barnesandnoble.com/w/technical-analysis-of-the-financial-markets-john-j-murphy/1100183747` | 趋势、形态、指标、跨市场 | 不保存盗版 PDF |
| Al Brooks《Reading Price Charts Bar by Bar》 | `https://www.wiley.com/en-us/Reading+Price+Charts+Bar+by+Bar:+The+Technical+Analysis+of+Price+Action+for+the+Serious+Trader-p-9780470443958` | Price Action、逐 K 分析 | 不保存全文 |
| Al Brooks《Trading Price Action Trends》 | `https://www.wiley.com/en-ca/Trading+Price+Action+Trends%3A+Technical+Analysis+of+Price+Charts+Bar+by+Bar+for+the+Serious+Trader-p-9781118066515` | 趋势行情、回撤、通道 | 不保存全文 |
| Al Brooks《Trading Price Action Reversals》 | `https://www.wiley.com/en-ca/Trading+Price+Action+Reversals:+Technical+Analysis+of+Price+Charts+Bar+by+Bar+for+the+Serious+Trader-p-9781118172308` | 反转、失败突破、二次入场 | 不保存全文 |
| Thomas Bulkowski《Encyclopedia of Chart Patterns, 3rd Edition》 | `https://www.wiley.com/en-br/Encyclopedia+of+Chart+Patterns,+3rd+Edition-p-9781119739685` | 形态统计、失败率、突破后表现 | 不保存盗版 PDF |
| Thomas Bulkowski《Encyclopedia of Candlestick Charts》 | 检索 `Thomas Bulkowski Encyclopedia of Candlestick Charts Wiley` | K线形态统计、位置和表现 | 不保存盗版 PDF |
| 《黄金投资必读》 | 检索 `上海黄金交易所 黄金投资必读` | 国内黄金市场规则、上金所机制 | 不保存未授权电子书 |
| Jonathan Spall《Investing in Gold》 | 检索 `Investing in Gold Jonathan Spall` | 黄金作为配置资产和交易资产 | 不保存全文 |
| Peter L. Bernstein《The Power of Gold》 | 检索 `The Power of Gold Peter Bernstein` | 黄金历史、货币地位、长期认知 | 不保存全文 |

## 4. 网络经验资料的使用等级

| 等级 | 来源类型 | 可用方式 | 禁止方式 |
| --- | --- | --- | --- |
| A | 官方数据/官方报告 | 可进入数据源和因子 | 不可忽略延迟和口径 |
| B | 专业教育/出版社页 | 可进入理论解释 | 不可直接给胜率 |
| C | 回测类文章 | 可启发回测设计 | 不可照搬结论 |
| D | 博客/社媒/交易经验 | 只作候选经验 | 不可提高强信号等级 |
| E | 盗版/未授权全文 | 不保存、不引用 | 不可下载 |

## 5. 下载与保存清单

- 已保存：资料索引、公开资料学习笔记、综合报告。
- 未保存：受版权保护的书籍全文、疑似盗版 PDF、扫描件、需要登录或授权的付费内容。
- 后续可补：如果用户提供已购买的合法电子书或授权资料，可在本目录内生成“读书摘要”和“系统规则提取”，但不提交原文。
