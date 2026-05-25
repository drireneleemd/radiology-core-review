#!/usr/bin/env python3
"""Query the PA Medicaid PDL Markdown file for drug information."""

import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_latest_md() -> str:
    """Load the most recent .md file from data/."""
    md_files = sorted(DATA_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not md_files:
        print("No Markdown files found in data/. Run `python scripts/fetch_pdl.py` first.")
        sys.exit(1)
    return md_files[0].read_text(encoding="utf-8")


def search(text: str, query: str) -> list[str]:
    """Search for a drug name in the PDL text and return matching context blocks."""
    lines = text.splitlines()
    results = []
    pattern = re.compile(re.escape(query), re.IGNORECASE)

    for i, line in enumerate(lines):
        if pattern.search(line):
            # Grab surrounding context (10 lines before/after)
            start = max(0, i - 10)
            end = min(len(lines), i + 11)
            block = lines[start:end]
            # Find the drug class header (look backwards for a line in ALL CAPS)
            drug_class = ""
            for j in range(i, max(0, i - 50), -1):
                if lines[j].isupper() and len(lines[j]) > 5:
                    drug_class = lines[j].strip()
                    break
            results.append((drug_class, "\n".join(block), i))

    return results


def determine_status(context: str, query: str) -> str:
    """Determine if the drug appears under Preferred or Non-Preferred."""
    lines = context.splitlines()
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    last_header = ""
    for line in lines:
        lower = line.strip().lower()
        if "preferred agents" in lower or "preferred products" in lower:
            if "non-preferred" in lower:
                last_header = "Non-Preferred"
            else:
                last_header = "Preferred"
        if pattern.search(line):
            return last_header or "Unknown"
    return "Unknown"


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/query_pdl.py <drug name>")
        print("Example: python scripts/query_pdl.py Ozempic")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    text = load_latest_md()
    results = search(text, query)

    if not results:
        print(f"No results found for '{query}'")
        sys.exit(0)

    print(f"Found {len(results)} match(es) for '{query}':\n")
    seen_classes = set()
    for drug_class, context, line_num in results:
        if drug_class in seen_classes:
            continue
        seen_classes.add(drug_class)
        status = determine_status(context, query)

        print(f"  Drug Class: {drug_class or 'Unknown'}")
        print(f"  Status:     {status}")

        # Extract the matching line with annotations
        for cline in context.splitlines():
            if re.search(re.escape(query), cline, re.IGNORECASE):
                annotations = []
                if re.search(r'(?<![A-Za-z])PA(?![A-Za-z])|PA,', cline):
                    annotations.append("Prior Authorization required")
                if re.search(r'(?<![A-Za-z])QL(?![A-Za-z])|QL$', cline):
                    annotations.append("Quantity Limit applies")
                if re.search(r'(?<![A-Za-z])AR(?![A-Za-z])|AR,', cline):
                    annotations.append("Age Restriction")
                print(f"  Entry:      {cline.strip()}")
                if annotations:
                    print(f"  Notes:      {', '.join(annotations)}")
                break
        print()


if __name__ == "__main__":
    main()
