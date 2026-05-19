# 金融武装知识参考与学习库下载索引

> 生成日期：2026-05-19
>
> 本目录只保存合法可下载资料：公版 TXT、官方公开 PDF、公开教育 PDF、官方数据 TXT/CSV。疑似盗版书籍、扫描件、破解 PDF、未授权全文不保存。

## 1. 已下载公版 TXT 电子书

| 文件 | 来源 | 合规类型 | 学习用途 |
| --- | --- | --- | --- |
| `txt/reminiscences-of-a-stock-operator-gutenberg-60979.txt` | Project Gutenberg | Public domain TXT | 交易心理、趋势、试仓、坐住盈利、纪律 |
| `txt/studies-in-tape-reading-gutenberg-68583.txt` | Project Gutenberg | Public domain TXT；资料污染，生产禁用 | 仅保留合规来源记录；不进入模型、评分或知识库规则 |
| `txt/successful-stock-speculation-gutenberg-26841.txt` | Project Gutenberg | Public domain TXT | 投机原则、趋势、风险、交易认知 |

## 2. 已下载 PDF 资料

| 文件 | 来源 | 合规类型 | 学习用途 |
| --- | --- | --- | --- |
| `pdf/wgc-gold-demand-trends-q1-2026-exec-summary.pdf` | World Gold Council | Official PDF | 黄金需求、ETF、央行购金、2026 Q1 需求结构 |
| `pdf/wgc-gold-market-primer-cn-2023.pdf` | World Gold Council China | Official PDF | 黄金市场规模、结构、库存、交易中心 |
| `pdf/fidelity-getting-started-technical-analysis.pdf` | Fidelity | Public education PDF | 技术分析入门、均线、趋势、指标 |
| `pdf/fidelity-identifying-chart-patterns-transcript.pdf` | Fidelity | Public education PDF | 图表形态、趋势线、支撑阻力 |
| `pdf/bea-nipa-handbook-chapter-05-pce.pdf` | BEA | Official PDF | PCE 口径、美国消费支出、通胀数据解释 |

## 3. 已下载官方数据文件

| 文件 | 来源 | 合规类型 | 学习用途 |
| --- | --- | --- | --- |
| `data/cftc-current-futures-only-legacy.txt` | CFTC | Official TXT | 传统 COT 持仓、黄金投机情绪、拥挤度 |
| `data/cftc-current-disaggregated-futures-only.txt` | CFTC | Official TXT | 细分 COT 持仓、管理基金/商业/掉期商结构 |
| `data/fred-dexchus-usdcny-cache.csv` | FRED 本地缓存 | Official CSV cache | `DEXCHUS` 美元兑人民币历史数据 |
| `data/fred-dtwexbgs-dollar-index-cache.csv` | FRED 本地缓存 | Official CSV cache | `DTWEXBGS` 美元广义指数历史数据 |

## 4. 本轮未能下载的官方源

| 资料 | 原因 | 后续处理 |
| --- | --- | --- |
| CME Gold Futures and Options Fact Card PDF | 当前网络连接 `www.cmegroup.com:443` 超时 | 保留脚本，换网络后重跑 |
| BLS CPI PDF / time series | 当前网络返回 `403 Forbidden` | 可浏览器下载后放入 `pdf/` 或 `data/` |
| FRED 宏观 CSV | 当前网络 HTTP/2 或连接超时 | 可换网络重跑，或用项目 provider/API 拉取 |

## 4.1 手动重试和替代源说明

- `data/MANUAL_DOWNLOAD_LOG.md`：记录 CME、BLS、FRED 手动下载尝试、失败原因和代理重跑方式。
- `data/ALTERNATIVE_DATA_SOURCES.md`：整理 BLS API、FRED/ALFRED、CME DataMine、CME Volume/OI 等替代方案。

## 5. 下载脚本

- `download-legal-library.py`：第一批合法资料下载脚本。
- `download-retry-missing.py`：失败资料的官方备用 URL 重试脚本。
- `download-manifest.csv`：第一批下载结果清单。
- `download-retry-manifest.csv`：重试下载结果清单。

重跑命令：

```bash
python3 docs/reference/kline-gold-trading/library/download-legal-library.py
python3 docs/reference/kline-gold-trading/library/download-retry-missing.py
```

## 6. 使用原则

- 公版 TXT 可以全文学习、摘录和二次整理，但引用时仍保留来源。
- `studies-in-tape-reading-gutenberg-68583.txt` 标记为资料污染：即使版权状态可用，也不代表适合黄金 K 线生产规则；本项目只允许它作为离线反例/资料状态样本，不进入评分、强提醒、模型训练或页面建议。
- 官方 PDF 可作为研究参考和数据口径依据，不应擅自去除版权声明或再分发给第三方。
- 公开教育 PDF 可用于学习和规则转译，不直接复制大段原文进产品。
- 受版权保护的现代交易书籍只保存正版入口和读书摘要，不保存全文。
- 所有资料观点进入交易系统前必须转成可回测字段、阈值、样本统计和风控门控。
