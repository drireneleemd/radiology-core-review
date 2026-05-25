#!/usr/bin/env python3
"""
Convert all radiology PDFs in subspecialty subfolders to Markdown.
Run this once (or whenever you add new PDFs) before starting the web app.

Usage:
    python convert_pdfs.py                        # converts data/ relative to this script
    python convert_pdfs.py /path/to/your/data     # explicit path
"""

import sys
from pathlib import Path

try:
    from markitdown import MarkItDown
except ImportError:
    print("ERROR: markitdown not installed. Run: pip install 'markitdown[pdf]'")
    sys.exit(1)


def convert_all(data_dir: Path):
    pdfs = list(data_dir.rglob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found under {data_dir}")
        return

    print(f"Found {len(pdfs)} PDF(s) under {data_dir}\n")
    md = MarkItDown()
    ok = skip = err = 0

    for pdf in sorted(pdfs):
        md_path = pdf.with_suffix(".md")
        rel = pdf.relative_to(data_dir)
        if md_path.exists():
            print(f"  [SKIP] {rel}  (markdown already exists)")
            skip += 1
            continue
        try:
            print(f"  [CONV] {rel} ...", end=" ", flush=True)
            result = md.convert(str(pdf))
            md_path.write_text(result.text_content, encoding="utf-8")
            kb = md_path.stat().st_size // 1024
            print(f"→ {kb} KB")
            ok += 1
        except Exception as e:
            print(f"ERROR: {e}")
            err += 1

    print(f"\nDone — converted: {ok}, skipped: {skip}, errors: {err}")


def main():
    if len(sys.argv) > 1:
        data_dir = Path(sys.argv[1])
    else:
        # Default: data/ folder sibling to this script
        data_dir = Path(__file__).resolve().parent / "data"

    if not data_dir.exists():
        print(f"ERROR: data directory not found: {data_dir}")
        print("Pass the path as an argument: python convert_pdfs.py /path/to/data")
        sys.exit(1)

    convert_all(data_dir)


if __name__ == "__main__":
    main()
