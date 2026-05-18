from __future__ import annotations

import csv
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE = Path(__file__).resolve().parent

ITEMS = [
    {
        "local_path": "txt/reminiscences-of-a-stock-operator-gutenberg-60979.txt",
        "source": "Project Gutenberg",
        "type": "public_domain_txt",
        "title": "Reminiscences of a Stock Operator",
        "url": "https://www.gutenberg.org/files/60979/60979-0.txt",
        "use_case": "公版交易心理、趋势、试仓与纪律",
    },
    {
        "local_path": "txt/studies-in-tape-reading-gutenberg-68583.txt",
        "source": "Project Gutenberg",
        "type": "public_domain_txt",
        "title": "Studies in Tape Reading",
        "url": "https://www.gutenberg.org/files/68583/68583-0.txt",
        "use_case": "公版盘口、价格行为、短线读盘",
    },
    {
        "local_path": "txt/successful-stock-speculation-gutenberg-26841.txt",
        "source": "Project Gutenberg",
        "type": "public_domain_txt",
        "title": "Successful Stock Speculation",
        "url": "https://www.gutenberg.org/files/26841/26841-0.txt",
        "use_case": "公版投机原则、风险与交易认知",
    },
    {
        "local_path": "pdf/wgc-gold-demand-trends-q1-2026-exec-summary.pdf",
        "source": "World Gold Council",
        "type": "official_pdf",
        "title": "Gold Demand Trends Q1 2026 Executive Summary",
        "url": "https://www.gold.org/download/file/20774/GDT-Q1-2026-Exec-Summary.pdf",
        "use_case": "黄金需求、ETF、央行购金",
    },
    {
        "local_path": "pdf/wgc-gold-market-primer-cn-2023.pdf",
        "source": "World Gold Council China",
        "type": "official_pdf",
        "title": "黄金市场入门指南：市场规模与结构",
        "url": "https://china.gold.org/download/file/18222/%E9%BB%84%E9%87%91%E5%B8%82%E5%9C%BA%E5%85%A5%E9%97%A8%E6%8C%87%E5%8D%97.pdf",
        "use_case": "黄金市场结构、库存、交易中心",
    },
    {
        "local_path": "pdf/cme-gold-futures-options-fact-card.pdf",
        "source": "CME Group",
        "type": "official_pdf",
        "title": "Gold Futures and Options Fact Card",
        "url": "https://www.cmegroup.com/cn-t/education/files/fact-card-gold-futures-options.pdf",
        "use_case": "COMEX 黄金期货/期权合约、避险、通胀对冲",
    },
    {
        "local_path": "pdf/fidelity-getting-started-technical-analysis.pdf",
        "source": "Fidelity",
        "type": "public_education_pdf",
        "title": "Getting Started with Technical Analysis",
        "url": "https://www.fidelity.com/bin-public/600_Fidelity_Com_English/documents/atp-classroom/slides/investments-webinar-getting-started-technical-analysis.pdf",
        "use_case": "均线、趋势、技术分析入门",
    },
    {
        "local_path": "pdf/fidelity-identifying-chart-patterns-transcript.pdf",
        "source": "Fidelity",
        "type": "public_education_pdf",
        "title": "Identifying Chart Patterns Transcript",
        "url": "https://media.fidelity.com/assets/Fidelity.com_VMS/904/347/TA_Session_3_Transcript.pdf",
        "use_case": "图表形态定义、趋势线、支撑阻力",
    },
    {
        "local_path": "pdf/bls-cpi-latest-release.pdf",
        "source": "BLS",
        "type": "official_pdf",
        "title": "Consumer Price Index latest release",
        "url": "https://www.bls.gov/news.release/pdf/cpi.pdf",
        "use_case": "CPI 事件、通胀口径",
    },
    {
        "local_path": "pdf/bea-nipa-handbook-chapter-05-pce.pdf",
        "source": "BEA",
        "type": "official_pdf",
        "title": "NIPA Handbook Chapter 5 Personal Consumption Expenditures",
        "url": "https://www.bea.gov/resources/methodologies/nipa-handbook/pdf/chapter-05.pdf",
        "use_case": "PCE 口径、消费支出、通胀数据",
    },
    {
        "local_path": "data/fred-gold-macro-series.csv",
        "source": "FRED",
        "type": "official_csv",
        "title": "DGS10 DFII10 T10YIE DTWEXBGS DEXCHUS",
        "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10,DFII10,T10YIE,DTWEXBGS,DEXCHUS",
        "use_case": "实际利率、名义利率、通胀预期、美元、汇率",
    },
    {
        "local_path": "data/cftc-current-futures-only-legacy.txt",
        "source": "CFTC",
        "type": "official_txt",
        "title": "Current legacy futures-only COT report",
        "url": "https://www.cftc.gov/dea/newcot/deafut.txt",
        "use_case": "COT 持仓、投机情绪、拥挤度",
    },
    {
        "local_path": "data/cftc-current-disaggregated-futures-only.txt",
        "source": "CFTC",
        "type": "official_txt",
        "title": "Current disaggregated futures-only COT report",
        "url": "https://www.cftc.gov/dea/newcot/f_disagg.txt",
        "use_case": "管理基金、生产商/商业、掉期商持仓",
    },
]


def download(url: str, path: Path) -> tuple[str, int]:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=120) as response:
            data = response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        return f"failed:{error}", 0
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return "downloaded", len(data)


def main() -> None:
    rows = []
    for item in ITEMS:
        path = BASE / item["local_path"]
        status, size = download(item["url"], path)
        print(f"{status} {size} {item['local_path']}")
        rows.append({**item, "download_status": status, "bytes": size})

    with (BASE / "download-manifest.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "local_path",
                "source",
                "type",
                "title",
                "url",
                "use_case",
                "download_status",
                "bytes",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
