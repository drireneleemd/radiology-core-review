# Radiology Core Review — AI-Powered Study Tool

Search your Radiographics PDF library and ABR Essentials study guide using natural language.  
Get high-yield, exam-focused summaries for any radiology topic — powered by Claude.

## Project structure

```
radiology-review/
├── data/                                          # Your PDF & Markdown library
│   ├── CertMOC_Study_Guide_Essentials_of_Radiology_.pdf
│   ├── CertMOC_Study_Guide_Essentials_of_Radiology_.md   ← auto-generated
│   ├── Thoracic/
│   │   ├── some-radiographics-article.pdf
│   │   └── some-radiographics-article.md          ← auto-generated
│   ├── Musculoskeletal/
│   ├── Neuroradiology/
│   └── ... (all your subspecialty folders)
├── app.py                  ← Flask web server
├── convert_pdfs.py         ← One-time PDF → Markdown converter
├── templates/
│   └── index.html          ← Web UI
├── requirements.txt
└── README.md
```

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."

# 3. Convert all your PDFs to Markdown (run once, or after adding new PDFs)
python convert_pdfs.py
# If your data/ folder is elsewhere:
python convert_pdfs.py /path/to/your/data

# 4. Start the web app
python app.py
# If data/ is in a custom location:
DATA_DIR=/path/to/your/data python app.py

# 5. Open your browser
open http://localhost:5000
```

## How it works

1. **`convert_pdfs.py`** walks all subfolders under `data/` and converts every PDF to a
   `.md` file (using `markitdown`). This runs once up-front — conversion is skipped if the
   `.md` already exists.

2. **`app.py`** serves the web UI and exposes `/api/query`. When you search:
   - It does a fast regex search across all `.md` files (filtered by subspecialty if chosen)
   - It also pulls the relevant section from the ABR study guide markdown
   - It sends the top matching excerpts to Claude, which returns a structured, exam-focused summary

3. **`templates/index.html`** renders the results — formatted with section headers,
   key findings, pearls, and source citations.

## Adding more PDFs

Just drop new PDFs into the appropriate subspecialty folder under `data/`, then run:

```bash
python convert_pdfs.py
```

Already-converted files are skipped automatically.

## Data directory layout

The app expects subspecialty subfolders directly under `data/`:

```
data/
├── Thoracic/
├── Musculoskeletal/
├── Neuroradiology/
├── Cardiac/
├── Gastrointestinal/
├── Breast Imaging/
├── Pediatrics/
└── ...
```

PDFs at the top level of `data/` (like the ABR guide) are also searched.

## Annotation key (ABR guide)

| Symbol | Meaning |
|--------|---------|
| ⭐     | Classic exam question / high-yield fact |
| 🔑     | Core concept |
| ⚠️     | Pearl or pitfall |
| 🖼️     | Imaging finding |

## License

For educational use only. Radiographics content is copyright RSNA.
ABR study guide is copyright the American Board of Radiology.
