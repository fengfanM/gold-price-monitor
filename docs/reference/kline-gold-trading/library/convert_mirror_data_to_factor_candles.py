from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "standardized-factor-candles"


@dataclass(frozen=True)
class SeriesConfig:
    source_file: str
    symbol: str
    name: str
    source: str
    frequency: str
    date_column: str
    value_column: str
    production_usage: str


SERIES = [
    SeriesConfig(
        source_file="mirror-ivo-fred-CPIAUCSL.csv",
        symbol="CPIAUCSL",
        name="CPI-U All Items",
        source="FRED CSV Gateway mirror of BLS/FRED",
        frequency="monthly",
        date_column="yyyymmdd",
        value_column="cpiaucsl",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-CPILFESL.csv",
        symbol="CPILFESL",
        name="Core CPI",
        source="FRED CSV Gateway mirror of BLS/FRED",
        frequency="monthly",
        date_column="yyyymmdd",
        value_column="cpilfesl",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-dgs10.csv",
        symbol="DGS10",
        name="10Y Treasury yield",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="dgs10",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-DFII10.csv",
        symbol="DFII10",
        name="10Y TIPS real yield",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="dfii10",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-T10YIE.csv",
        symbol="T10YIE",
        name="10Y breakeven inflation",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="t10yie",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-DTWEXBGS.csv",
        symbol="DTWEXBGS",
        name="Broad U.S. Dollar Index",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="dtwexbgs",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-DEXCHUS.csv",
        symbol="DEXCHUS",
        name="USD/CNY exchange rate",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="dexchus",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-ivo-fred-VIXCLS.csv",
        symbol="VIXCLS",
        name="VIX close",
        source="FRED CSV Gateway mirror",
        frequency="daily",
        date_column="yyyymmdd",
        value_column="vixcls",
        production_usage="learning_only_mirror",
    ),
    SeriesConfig(
        source_file="mirror-github-cpiaucsl-1947-2020.csv",
        symbol="CPIAUCSL_GITHUB_SAMPLE",
        name="CPI-U GitHub historical sample",
        source="GitHub mirror sample",
        frequency="monthly",
        date_column="DATE",
        value_column="CPIAUCSL",
        production_usage="offline_sample_production_disabled",
    ),
    SeriesConfig(
        source_file="mirror-datasets-us-10y-monthly.csv",
        symbol="US10Y_MONTHLY_SAMPLE",
        name="US 10Y monthly yield sample",
        source="GitHub datasets mirror sample",
        frequency="monthly",
        date_column="Date",
        value_column="Rate",
        production_usage="offline_sample_production_disabled",
    ),
]


def parse_date(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    for pattern in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern).replace(tzinfo=timezone.utc).date().isoformat()
        except ValueError:
            continue
    return None


def parse_float(value: str) -> float | None:
    value = value.strip()
    if not value or value == ".":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def to_factor_candles(config: SeriesConfig) -> list[dict[str, object]]:
    path = DATA_DIR / config.source_file
    if not path.exists():
        return []

    candles: list[dict[str, object]] = []
    with path.open("r", encoding="utf-8", errors="replace", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            date = parse_date(row.get(config.date_column, ""))
            value = parse_float(row.get(config.value_column, ""))
            if date is None or value is None:
                continue
            candles.append(
                {
                    "symbol": config.symbol,
                    "date": date,
                    "time": f"{date}T00:00:00Z",
                    "frequency": config.frequency,
                    "open": value,
                    "high": value,
                    "low": value,
                    "close": value,
                    "volume": None,
                    "value": value,
                    "kind": "factor_candle",
                    "source": config.source,
                    "productionUsage": config.production_usage,
                }
            )
    return candles


def write_csv(path: Path, candles: Iterable[dict[str, object]]) -> int:
    rows = list(candles)
    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "symbol",
        "date",
        "time",
        "frequency",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "value",
        "kind",
        "source",
        "productionUsage",
    ]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def write_jsonl(path: Path, candles: Iterable[dict[str, object]]) -> int:
    rows = list(candles)
    if not rows:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert mirror macro series into factor_candle OHLC files for backtest alignment."
    )
    parser.add_argument("--format", choices=["csv", "jsonl", "both"], default="both")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR))
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    manifest_rows = []
    for config in SERIES:
        candles = to_factor_candles(config)
        if not candles:
            manifest_rows.append(
                {
                    "symbol": config.symbol,
                    "source_file": config.source_file,
                    "rows": 0,
                    "first_date": "",
                    "last_date": "",
                    "status": "missing_or_empty",
                }
            )
            continue

        stem = config.symbol.lower().replace("/", "_")
        if args.format in {"csv", "both"}:
            write_csv(output_dir / f"{stem}.factor-candles.csv", candles)
        if args.format in {"jsonl", "both"}:
            write_jsonl(output_dir / f"{stem}.factor-candles.jsonl", candles)

        manifest_rows.append(
            {
                "symbol": config.symbol,
                "source_file": config.source_file,
                "rows": len(candles),
                "first_date": candles[0]["date"],
                "last_date": candles[-1]["date"],
                "status": "converted",
            }
        )

    with (output_dir / "conversion-manifest.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["symbol", "source_file", "rows", "first_date", "last_date", "status"])
        writer.writeheader()
        writer.writerows(manifest_rows)

    converted = sum(1 for row in manifest_rows if row["status"] == "converted")
    print(f"converted_series={converted} output_dir={output_dir}")


if __name__ == "__main__":
    main()
