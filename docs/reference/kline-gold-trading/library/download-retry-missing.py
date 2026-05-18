from __future__ import annotations

import csv
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE = Path(__file__).resolve().parent

ITEMS = [
    {
        "local_path": "txt/successful-stock-speculation-gutenberg-26841.txt",
        "source": "Project Gutenberg",
        "type": "public_domain_txt",
        "title": "Successful Stock Speculation",
        "url": "https://www.gutenberg.org/cache/epub/26841/pg26841.txt",
        "use_case": "公版投机原则、风险与交易认知",
    },
    {
        "local_path": "pdf/cme-gold-futures-options-fact-card.pdf",
        "source": "CME Group",
        "type": "official_pdf",
        "title": "Gold Futures and Options Fact Card",
        "url": "https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options-sc.pdf",
        "use_case": "COMEX 黄金期货/期权合约、避险、通胀对冲",
    },
    {
        "local_path": "data/bls-cpi-all-items-timeseries.txt",
        "source": "BLS",
        "type": "official_txt",
        "title": "CPI All Urban Consumers All Items time series",
        "url": "https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems",
        "use_case": "CPI 历史时间序列、通胀事件校验",
    },
    {
        "local_path": "data/fred-gold-macro-series.csv",
        "source": "FRED",
        "type": "official_csv",
        "title": "DGS10 DFII10 T10YIE DTWEXBGS DEXCHUS",
        "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10,DFII10,T10YIE,DTWEXBGS,DEXCHUS",
        "use_case": "实际利率、名义利率、通胀预期、美元、汇率",
    },
]


def download(url: str, path: Path) -> tuple[str, int]:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=180) as response:
            data = response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        return f"failed:{error}", 0
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return "downloaded", len(data)


def main() -> None:
    rows = []
    for item in ITEMS:
        status, size = download(item["url"], BASE / item["local_path"])
        print(f"{status} {size} {item['local_path']}")
        rows.append({**item, "download_status": status, "bytes": size})

    with (BASE / "download-retry-manifest.csv").open("w", newline="", encoding="utf-8") as file:
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
