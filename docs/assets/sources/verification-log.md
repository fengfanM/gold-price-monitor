# 资料验证日志

## 2026-05-19

- 建立 `source-manifest.json`，记录官方公开资料和市场数据入口。
- 建立 `book-locators.csv`，只保留正版/图书馆/出版社/官方入口，不纳入盗版或非授权全文。
- 对 WGC、CFTC、CME、FRED、BLS、BEA、Bridgewater 采用“链接 + 摘要 + 模型字段映射”的方式，仓库不保存全文 PDF。
- 规则落地优先级：事件风控、趋势结构、形态位置、假突破、赔率纪律先进入 `gold-kb-rule-pack-v1`。
- 后续若加入本地已授权 PDF，应在 manifest 中补充 `local_path`、hash、版权状态、允许用途和禁止用途。

