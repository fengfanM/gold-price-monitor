# 金融武装学习库

本目录用于保存 K 线理论、黄金交易实践、宏观因子和官方/镜像数据的合法参考资料。

## 1. 目录结构

| 路径 | 内容 | 说明 |
| --- | --- | --- |
| `LEGAL_LIBRARY_INDEX.md` | 合法资料索引 | 汇总 TXT、PDF、数据文件、合规边界 |
| `data/` | 官方数据、镜像数据、CME 快照 | 被 `.gitignore` 忽略，保留在本地学习库 |
| `pdf/` | 官方/公开教育 PDF | 被 `.gitignore` 忽略 |
| `txt/` | 公版 TXT 电子书 | 被 `.gitignore` 忽略 |
| `standardized-factor-candles/` | 转换后的因子 K 线 | 由转换脚本生成 |
| `download-legal-library.py` | 第一批合法资料下载脚本 | 下载官方/公版资料 |
| `download-retry-missing.py` | 官方源重试脚本 | 重试 CME、BLS、FRED |
| `convert_mirror_data_to_factor_candles.py` | 因子 K 线转换脚本 | 把镜像宏观序列转为回测对齐格式 |

## 2. CME 快照

- 文件：`data/cme-comex-gold-futures-official-snapshot.md`
- 来源：CME Group 中文官方页面。
- 核心信息：`GC` 合约、`100` 金衡盎司、每盎司最小跳动 `0.10` 美元、每跳 `10` 美元、CME Globex 近 24 小时交易。
- 使用边界：可用于学习、合约说明和交易规则解释；不能替代实时成交量、OI、结算价、保证金或官方公告。

## 3. 替代数据源

- 文件：`data/ALTERNATIVE_DATA_SOURCES.md`
- BLS：优先 BLS Public API；直连失败时可用 FRED CPI 镜像 `CPIAUCSL`、`CPILFESL` 做离线学习。
- FRED：生产优先 `FRED_API_KEY`；当前学习库已用 FRED CSV Gateway 镜像补齐 `DGS10`、`DFII10`、`T10YIE`、`DTWEXBGS`、`DEXCHUS`、`VIXCLS`。
- CME：生产优先 CME DataMine、官方 Volume/OI、授权 CSV 或人工校验 CSV；非官方数据不能作为强信号唯一依据。

## 4. 因子 K 线转换

镜像宏观数据不是黄金价格 K 线。转换脚本输出的是 `factor_candle`，用于与黄金价格 K 线按日期对齐做因子回测。

特点：

- `open/high/low/close` 都等于该期宏观因子值。
- `volume` 为 `null`。
- `kind` 固定为 `factor_candle`。
- `productionUsage` 标记是否仅限学习或生产禁用。

运行：

```bash
python3 docs/reference/kline-gold-trading/library/convert_mirror_data_to_factor_candles.py
```

输出：

```text
docs/reference/kline-gold-trading/library/standardized-factor-candles/
```

## 5. 使用边界

- 学习库资料可以用于研究、规则提炼、离线回测和字段设计。
- 镜像数据只适合离线学习、格式验证、临时回测，不应作为生产强信号关键源。
- 生产系统必须优先使用官方 API、授权数据源或人工校验后的 CSV。
- 任何资料观点进入交易系统前，都必须转成可定义、可回测、可复盘、可风控的字段和门控规则。

## 6. 已落地到网站的宏观 regime 规则

当前服务端会读取 `standardized-factor-candles/conversion-manifest.csv` 和对应 `*.factor-candles.csv`，生成 `MacroRegimeEvidence`。这层证据只做“慢频背景”和“强提醒降级”，不直接替代价格 K 线或实时行情。

### 6.1 数据用途分层

| 用途状态 | 允许做什么 | 禁止做什么 |
| --- | --- | --- |
| `production_eligible` | 作为生产候选源进入宏观背景评分；仍需 freshness 校验 | 单独触发买入、卖出或强提醒 |
| `learning_only_mirror` | 离线校准、历史分桶、解释宏观顺逆风 | 放大 1m/5m 强提醒、替代官方实时源 |
| `production_disabled` | 保留索引、做资料状态样本或离线反例 | 进入评分、模型训练、页面交易依据 |

### 6.2 已转成可执行门控的规则

- 压力组合：`DFII10` 实际利率上行 + `DTWEXBGS` 美元走强 + `CPILFESL` 核心 CPI 粘性/再加速 + `VIXCLS` 低位，会把买点强提醒降级。
- 支持组合：实际利率回落 + 美元走弱 + `DEXCHUS` 对人民币金价有支撑 + VIX 温和避险，只能作为中期背景支持；若来源是镜像，`scoreImpact=0`，不能放大实时强提醒。
- CME 质量：`CME_GOLD_OI` 与 `CME_GOLD_VOLUME` 同向支持时才解释为突破质量较好；未配置或不确认时不补分。
- 回测分桶：新增 `macro_regime`、`inflation_phase`、`real_rate_trend`、`usd_cny_alignment`、`cme_breakout_quality`，低样本桶只能展示，不得加权。
- 页面解释：前端必须把镜像数据标成“离线校准参考”，并提示它不是实时交易依据。
