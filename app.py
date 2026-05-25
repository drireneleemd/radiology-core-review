#!/usr/bin/env python3
"""
Radiology Core Review — Flask backend.
Searches converted Markdown files and uses Google Gemini to generate summaries.

Usage:
    python app.py                        # data/ relative to this file
    DATA_DIR=/path/to/data python app.py # explicit path via env var

Requires:
    export GEMINI_API_KEY="AIza..."
"""

import os
import re
from pathlib import Path
from dotenv import load_dotenv

from flask import Flask, jsonify, render_template, request
from google import genai
from google.genai import types

# ── Config ────────────────────────────────────────────────────────────────────
# Find the exact folder where app.py is sitting right now
BASE_DIR = Path(__file__).resolve().parent

# Force load_dotenv to look at this exact absolute path for the .env file
load_dotenv(dotenv_path=BASE_DIR / ".env")

DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
ABR_GUIDE_PATH = DATA_DIR / "CertMOC_Study_Guide_Essentials_of_Radiology_.md"

app = Flask(__name__)

# Configure Gemini (new google-genai SDK)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("❌ ERROR: GEMINI_API_KEY is still empty inside your .env file!")
    
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-2.5-flash-lite"

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_available_images() -> list[str]:
    """Returns a list of all screenshot paths inside static/images/,
    fully URL-encoded so markdown engines can parse them safely.
    """
    image_dir = BASE_DIR / "static" / "images"
    if not image_dir.exists():
        return []
        
    extensions = ("*.png", "*.jpg", "*.jpeg")
    found_images = []
    
    for ext in extensions:
        for f in image_dir.rglob(ext):
            # Get path relative to the 'static' folder
            relative_path = f.relative_to(BASE_DIR / "static")
            
            # Convert to standard web forward-slashes
            path_str = str(relative_path).replace("\\", "/")
            
            # Crucial: Replace spaces with %20 so marked.js recognizes it as a valid URL
            path_encoded = path_str.replace(" ", "%20")
            
            found_images.append(path_encoded)
            
    return found_images


def search_markdown_files(query: str, context_lines: int = 40) -> list[dict]:
    """Search all .md files globally under DATA_DIR for query term."""
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    results = []
    seen_files: set[Path] = set()

    for md_path in sorted(DATA_DIR.rglob("*.md")):
        if md_path in seen_files:
            continue
        seen_files.add(md_path)

        try:
            text = md_path.read_text(encoding="utf-8")
        except Exception:
            continue

        lines = text.splitlines()
        matched_indices = [i for i, ln in enumerate(lines) if pattern.search(ln)]
        if not matched_indices:
            continue

        i = matched_indices[0]
        start = max(0, i - context_lines // 2)
        end = min(len(lines), i + context_lines)
        context = "\n".join(lines[start:end])

        rel = md_path.relative_to(DATA_DIR)
        sub = rel.parts[0] if len(rel.parts) >= 2 else "General"

        results.append({
            "file": str(md_path),
            "subspecialty": sub,
            "title": md_path.stem.replace("_", " ").replace("-", " "),
            "context": context,
            "match_count": len(matched_indices),
        })

    results.sort(key=lambda r: r["match_count"], reverse=True)
    return results[:8]


def load_abr_context(query: str) -> str:
    """Pull relevant section from the ABR study guide markdown if it exists."""
    if not ABR_GUIDE_PATH.exists():
        candidates = list(DATA_DIR.rglob("*Essentials*Radiology*.md")) + \
                     list(DATA_DIR.rglob("*CertMOC*.md"))
        if not candidates:
            return ""
        abr_path = candidates[0]
    else:
        abr_path = ABR_GUIDE_PATH

    try:
        text = abr_path.read_text(encoding="utf-8")
    except Exception:
        return ""

    pattern = re.compile(re.escape(query), re.IGNORECASE)
    lines = text.splitlines()
    indices = [i for i, ln in enumerate(lines) if pattern.search(ln)]
    if not indices:
        return ""

    i = indices[0]
    start = max(0, i - 5)
    end = min(len(lines), i + 55)
    return "\n".join(lines[start:end])


def build_prompt(query: str, sources: list[dict], abr_context: str) -> str:
    source_blocks = []
    for idx, s in enumerate(sources, 1):
        source_blocks.append(
            f"=== SOURCE {idx}: {s['title']} ({s['subspecialty']}) ===\n{s['context']}\n"
        )

    abr_section = ""
    if abr_context:
        abr_section = f"\n=== ABR ESSENTIALS STUDY GUIDE (relevant excerpt) ===\n{abr_context}\n"

    # Gather available screenshot paths from disk
    available_images = get_available_images()
    image_list_str = ", ".join(available_images) if available_images else "None available right now"

    return f"""You are an expert radiologist and radiology educator helping a trainee study for the ABR Core Exam and Essentials of Radiology Exam.

The trainee is searching for: **{query}**

Below are excerpts from Radiographics review articles and the ABR study guide that are relevant to this topic.
{abr_section}
{''.join(source_blocks)}

=== AVAILABLE LOCAL DIAGNOSTIC IMAGES ===
You have access to the following local image paths on disk: [{image_list_str}]

Please provide a structured, high-yield summary for exam preparation. Format your response EXACTLY as follows. Do not alter the headings.

## {query.title()} — Key Teaching Points

### 🔑 Core Concepts
(3-5 high-yield bullet points of the most important facts a radiologist must know. DO NOT embed any images here.)

### 🖼️ Imaging Findings
(Organized by modality: what to look for on X-ray, CT, MRI, US as applicable. Highlight key diagnostic criteria. DO NOT embed any images here.)

### ⚠️ Pearls & Pitfalls
(Classic teaching points, mimics, distinguishing features, common mistakes. DO NOT embed any images here.)

### 📋 ABR Exam Tips
(What the exam specifically tests on this topic based on the study guide. Emphasize high-yield, tested variants.)

### 📷 High-Yield Visual Gallery
CRITICAL INSTRUCTIONS FOR THIS SECTION:
1. Look at the 'AVAILABLE LOCAL DIAGNOSTIC IMAGES' list. 
2. If any image paths are directly relevant to the pathology or findings discussed in this review, list them here. If none are relevant, omit this section entirely.
3. NEVER duplicate an image path. Each matching image path must appear exactly ONCE.
4. For each relevant image, convert the raw snake_case filename into a standard, clean title capitalization format (e.g., convert 'static/images/Breast Imaging/fine_linear_calcifications.jpeg' to 'Fine-Linear Calcifications').
5. Format each entry exactly like this, placing a neat text caption right under the markdown image tag:
   ![Clean Image Title](/static/exact_path_from_list)
   *Figure: Clean Image Title*

### 📚 Key References
[🔗 View Radiopaedia Reference Cases](https://radiopaedia.org/search?q={query.replace(' ', '+')})
(List the source articles used after the Radiopaedia link.)

Keep the response focused, high-yield, and practical. Use bold for critical findings. If a concept is a classic exam question, flag it with ⭐."""

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/query", methods=["POST"])
def api_query():
    data = request.get_json(force=True)
    query = (data.get("query") or "").strip()

    if not query:
        return jsonify({"error": "Query is required"}), 400

    # Search executed completely globally
    sources = search_markdown_files(query)
    abr_context = load_abr_context(query)

    if not sources and not abr_context:
        return jsonify({
            "query": query,
            "summary": f"No content found for **{query}** in the database. "
                       f"Make sure you have run `python convert_pdfs.py` first, "
                       f"and that the relevant PDFs are in your data/ folder.",
            "sources": [],
            "found": False,
        })

    prompt = build_prompt(query, sources, abr_context)
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=2000,
                temperature=0.3,
            ),
        )
        summary = response.text
    except Exception as e:
        return jsonify({"error": f"Gemini API error: {e}"}), 500

    return jsonify({
        "query": query,
        "summary": summary,
        "sources": [
            {"title": s["title"], "subspecialty": s["subspecialty"], "file": s["file"]}
            for s in sources
        ],
        "found": True,
    })


if __name__ == "__main__":
    if not DATA_DIR.exists():
        print(f"WARNING: data directory not found at {DATA_DIR}")
        print("Set DATA_DIR env variable or place a 'data/' folder next to app.py")
    else:
        print(f"Data directory: {DATA_DIR}")
        print("🚀 Radiology Core Review Engine Ready!")
    app.run(debug=True, port=5000)