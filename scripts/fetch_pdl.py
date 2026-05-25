#!/usr/bin/env python3
"""Fetch the latest PA Medicaid Preferred Drug List PDF and convert to Markdown."""

import re
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

from bs4 import BeautifulSoup
from markitdown import MarkItDown

PDL_PAGE = "https://www.papdl.com/preferred-drug-list.html"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def find_latest_pdf_url() -> str:
    """Scrape the PDL page for the current (latest) PDF link."""
    html = urlopen(PDL_PAGE).read().decode()
    soup = BeautifulSoup(html, "html.parser")
    for li in soup.find_all("li"):
        text = li.get_text()
        if "(current)" in text:
            a = li.find("a", href=True)
            if a:
                href = a["href"]
                if not href.startswith("http"):
                    href = "https://www.papdl.com" + href
                return href
    raise RuntimeError("Could not find current PDL PDF link on page")


def download(url: str) -> Path:
    """Download PDF to data/ and return the local path."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    filename = url.split("/")[-1]
    dest = DATA_DIR / filename
    if dest.exists():
        print(f"  Already exists: {dest}")
        return dest
    print(f"  Downloading {url} ...")
    data = urlopen(url).read()
    dest.write_bytes(data)
    print(f"  Saved to {dest} ({len(data) / 1024:.0f} KB)")
    return dest


def convert_to_markdown(pdf_path: Path) -> Path:
    """Convert PDF to Markdown using markitdown."""
    md_path = pdf_path.with_suffix(".md")
    print(f"  Converting to Markdown ...")
    md = MarkItDown()
    result = md.convert(str(pdf_path))
    md_path.write_text(result.text_content, encoding="utf-8")
    print(f"  Saved to {md_path}")
    return md_path


def main():
    print("1. Finding latest PDL PDF ...")
    url = find_latest_pdf_url()
    print(f"  Found: {url}")

    print("2. Downloading PDF ...")
    pdf = download(url)

    print("3. Converting to Markdown ...")
    md = convert_to_markdown(pdf)

    print(f"\nDone! Files in {DATA_DIR}/")
    print(f"  PDF: {pdf.name}")
    print(f"  MD:  {md.name}")


if __name__ == "__main__":
    main()
