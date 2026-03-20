<div align="center">

# InspireMe²

**A local-first AI-powered book & movie recommendation engine**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black?logo=ollama)](https://ollama.com)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows)](https://www.microsoft.com/windows)

</div>

---

## What is InspireMe²?

InspireMe² is a **fully offline, privacy-first recommendation engine** that helps you find the perfect book or movie based on what you feel, what you need, or what you're curious about.

You don't search by title or genre — you describe an emotion, a goal, or a situation:

> *"Aiutami a superare la paura del buio"*
> *"Vorrei appassionarmi al mondo della scienza"*
> *"I need a story about resilience and starting over"*

InspireMe² understands your intent through a local AI (Qwen via Ollama), searches a database of **24,000+ books and movies** using a hybrid semantic + keyword pipeline, and returns results ranked by relevance — each with an explanation of *why* it fits and *how* it can inspire you.

**No cloud. No accounts. No data collection. Everything runs on your machine.**

---

## Key Features

- 🔒 **100% Local & Private** — runs entirely on your machine, no internet required after setup
- 🧠 **AI-Powered Understanding** — Qwen LLM interprets your natural language intent, not just keywords
- 📚 **24,000+ Works** — books and movies with plots, metadata, and pre-computed inspirational enrichments
- 🔍 **Hybrid Search** — vector similarity + full-text BM25, fused with Reciprocal Rank Fusion (RRF)
- 🌍 **Bilingual** — search in Italian or English, interface available in both languages
- ✅ **Confidence Badges** — each result shows a verified/verify-online quality indicator
- 🛡️ **Safe Mode** — optional filter to prioritize family-friendly content and exclude horror/thriller
- 📖 **Pre-computed Enrichments** — every result comes with "Why it inspires" and "How to use it" texts, generated at build-time by the LLM

---

## Screenshots

> Screenshots coming soon.

---

## Quick Start

### Prerequisites

| Requirement | Details |
|---|---|
| **OS** | Windows 10/11 (macOS/Linux experimental) |
| **RAM** | 8 GB minimum, 16 GB recommended |
| **Disk** | ~5 GB (Ollama + models + database) |
| **GPU** | Not required — CPU inference works, GPU recommended for speed |
| **Node.js** | v18 or higher ([download](https://nodejs.org)) |

### Installation

1. **Download** `InspireMe2-Setup.exe` and `inspire.db` from the [latest Release](https://github.com/andreaercoli86-glitch/Inspire2/releases)
2. **Run the installer** — it installs the application and Node.js dependencies
3. **Place the database** — copy `inspire.db` into the `data\` folder inside the installation directory
4. **Launch InspireMe²** from the desktop icon — the setup wizard will guide you through installing Ollama and downloading the AI models
5. **Open your browser** to [http://localhost:3457](http://localhost:3457)

After first setup, just click the desktop icon — everything starts automatically.

---

## How It Works

```
User Query ──▶ Query Expansion ──▶ Hybrid Search ──▶ RRF Fusion ──▶ Ranked Results
                  (Qwen LLM)        ├─ Vector Search (sqlite-vec, 2560-dim)
                                     ├─ BM25 Full-Text (FTS5)
                                     ├─ Title Mention Search
                                     └─ Plot Keyword Search
```

### The Pipeline

1. **Natural language input** — the user describes what they want in free-form Italian or English
2. **Query expansion** — Qwen 3.5:4b analyzes the intent and generates:
   - Semantic keywords (both Italian and English)
   - Genres to exclude (e.g., Horror for a children's query)
   - Suggested titles that match the intent
3. **Hybrid search** runs four parallel strategies:
   - **Vector similarity** — the query is embedded with `qwen3-embedding:4b` (2560 dimensions) and compared against pre-computed embeddings via `sqlite-vec`
   - **BM25 full-text** — keyword matching via SQLite FTS5 across titles, creators, genres, plots, and enrichment texts
   - **Title mention** — exact title matches from LLM-suggested titles
   - **Plot keyword** — concept-map based keyword matching against plot summaries
4. **Reciprocal Rank Fusion (RRF)** merges all ranked lists into a unified result set (k=60)
5. **Confidence scoring** — weighted formula: `similarity × 0.45 + popularity × 0.20 + RRF × 0.35`
6. **Genre exclusion** — results matching excluded genres are demoted (confidence × 0.4), not removed
7. **Deduplication** — same title + year duplicates collapsed to the highest-confidence version
8. **Enrichment** — each result includes pre-computed "Why it inspires" and "How to use it" texts

### Confidence Badges

| Badge | Meaning | Threshold |
|---|---|---|
| ✅ **Verified** | High-confidence match with strong semantic and keyword alignment | confidence ≥ 0.40 |
| ⚠️ **Verify online** | Plausible match, worth double-checking | confidence ≥ 0.25 |

---

## Technical Components

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                    │
│         Vanilla JS + CSS — no frameworks needed          │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  │
│  │ Search  │  │ Results  │  │Bookmarks│  │  Setup   │  │
│  │  Input  │  │  Cards   │  │  Panel  │  │  Wizard  │  │
│  └────┬────┘  └──────────┘  └─────────┘  └──────────┘  │
│       │                                                  │
└───────┼──────────────────────────────────────────────────┘
        │ HTTP (localhost:3457)
┌───────▼──────────────────────────────────────────────────┐
│                Express Server (server.js)                 │
│                                                           │
│  /api/search   POST  Hybrid search + RRF fusion           │
│  /api/inspire  POST  Async personalized inspire texts     │
│  /api/health   GET   Server + Ollama status check         │
│  /api/stats    GET   Database statistics                  │
│  /api/plots    POST  Fetch plot texts by work IDs         │
│                                                           │
├───────────────────────────────────────────────────────────┤
│              Search Engine (search.js)                     │
│                                                           │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Query        │  │ Concept  │  │ LRU Cache         │   │
│  │ Expansion    │  │ Map      │  │ (100 entries)     │   │
│  │ (Qwen LLM)  │  │ (JSON)   │  │                   │   │
│  └──────┬───────┘  └──────────┘  └───────────────────┘   │
│         │                                                 │
│  ┌──────▼───────────────────────────────────────────┐    │
│  │              Parallel Search                      │    │
│  │  ┌─────────┐ ┌─────┐ ┌───────┐ ┌─────────────┐  │    │
│  │  │ Vector  │ │BM25 │ │ Title │ │Plot Keyword │  │    │
│  │  │(2560-d) │ │FTS5 │ │Mention│ │  Matching   │  │    │
│  │  └────┬────┘ └──┬──┘ └───┬───┘ └──────┬──────┘  │    │
│  │       └─────────┴────────┴─────────────┘         │    │
│  │                    │                              │    │
│  │              RRF Fusion (k=60)                    │    │
│  │                    │                              │    │
│  │         Confidence + Deduplication                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
├───────────────────────────────────────────────────────────┤
│              Database Layer (db.js)                        │
│                                                           │
│  SQLite + sqlite-vec + FTS5                               │
│  ┌──────────┐ ┌──────┐ ┌───────────┐ ┌─────────────┐    │
│  │  works   │ │plots │ │vec_works  │ │search_text  │    │
│  │(metadata)│ │(text)│ │(vectors)  │ │(FTS5 index) │    │
│  └──────────┘ └──────┘ └───────────┘ └─────────────┘    │
│  ┌──────────────┐ ┌──────┐                               │
│  │ enrichments  │ │ meta │                               │
│  │(why/how text)│ │(ver) │                               │
│  └──────────────┘ └──────┘                               │
│                                                           │
├──────────────────────┬────────────────────────────────────┤
│   Ollama (local)     │    Models                          │
│   localhost:11434    │    ├─ qwen3.5:4b (reasoning)       │
│                      │    └─ qwen3-embedding:4b (vectors) │
└──────────────────────┴────────────────────────────────────┘
```

### Component Details

| Component | Technology | Role |
|---|---|---|
| **Express Server** | Node.js + Express 4.x | HTTP API, static file serving, request routing |
| **SQLite Database** | better-sqlite3 | Core data storage — works, plots, enrichments (~375 MB) |
| **sqlite-vec** | sqlite-vec extension | Vector similarity search on 2560-dimensional embeddings |
| **FTS5 Index** | SQLite FTS5 | Full-text BM25 keyword search across titles, plots, genres, enrichments |
| **Qwen 3.5:4b** | Ollama (local LLM) | Query expansion — interprets user intent, generates keywords, excludes genres, suggests titles |
| **qwen3-embedding:4b** | Ollama (embedding model) | Generates 2560-dim dense vectors for semantic similarity search |
| **Concept Map** | JSON lookup table | Maps 90+ Italian conceptual stems to English/Italian plot keywords for cross-lingual matching |
| **LRU Cache** | In-memory (100 entries) | Caches query expansion results to avoid redundant LLM calls |
| **RRF Fusion** | Algorithm (k=60) | Merges vector, BM25, title, and keyword ranked lists into a single score |
| **Enrichments** | Pre-computed LLM texts | "Why it inspires" + "How to use it" — generated at DB build-time, served without runtime LLM |
| **Async Inspire** | Runtime LLM generation | Personalized "How to use it" text for top 3 results, generated asynchronously after search |
| **Frontend** | Vanilla JS + CSS | SPA with search, results, bookmarks, dark/light theme, setup wizard — no build step |
| **Setup Wizard** | In-browser (index.html) | First-run detection: checks Ollama, downloads models, guides user step-by-step |
| **Installer** | Inno Setup (.exe) | Windows installer with wizard, desktop icon, Start Menu entry, npm auto-install |

### Data Pipeline (Build-Time)

| Step | Script | What it does |
|---|---|---|
| 1. Fetch metadata | `fetch-wikidata.js` | Downloads book/movie metadata from Wikidata SPARQL endpoint |
| 2. Extract plots | `extract-wikiplots.js` | Parses Wikipedia dumps for plot summaries (EN + IT) |
| 3. Import datasets | `import-tellmeagain.js` | Imports additional plot data from Tell Me Again! dataset |
| 4. Generate embeddings | `generate-embeddings.js` | Creates 2560-dim vectors via Ollama for all works with plots |
| 5. Generate enrichments | `generate-enrichments.js` | Pre-computes "why/how" inspirational texts via Qwen LLM |
| 6. Build FTS5 index | `rebuild-fts.js` | Indexes titles, creators, genres, plots, enrichments for BM25 |

---

## Environment Variables

All configuration is optional — sensible defaults are built in.

| Variable | Default | Description |
|---|---|---|
| `INSPIRE_PORT` | `3457` | HTTP server port |
| `OLLAMA_BASE` | `http://localhost:11434` | Ollama API base URL |
| `EMBEDDING_MODEL` | `qwen3-embedding:4b` | Model for query embeddings |
| `LLM_MODEL` | `qwen3.5:4b` | Model for query expansion and enrichment |
| `INSPIRE_DB_PATH` | `data/inspire.db` | Path to the SQLite database file |
| `DISABLE_QUERY_EXPANSION` | `0` | Set to `1` to disable LLM-based query expansion |

---

## Project Structure

```
Inspire2/
├── public/                      # Frontend (vanilla JS, CSS, HTML)
│   ├── index.html               # Main app UI + setup wizard overlay
│   ├── app.js                   # Client-side logic (~1000 lines)
│   ├── style.css                # Styles with dark/light theme
│   └── logo.svg                 # Compass rose logo
├── inspire-server/
│   ├── server.js                # Express HTTP server + API endpoints
│   ├── search.js                # Hybrid RAG search engine
│   ├── db.js                    # SQLite wrapper (better-sqlite3 + sqlite-vec)
│   ├── package.json             # Node.js dependencies
│   ├── data/
│   │   ├── inspire.db           # Pre-built database (~375 MB, via Release)
│   │   └── concept-map.json     # Italian concept → plot keyword mappings
│   ├── build/                   # Database build pipeline (for contributors)
│   └── test/                    # Anti-hallucination test suite
├── installer/
│   └── InspireSetup.iss         # Inno Setup script for .exe installer
├── assets/
│   └── inspire.ico              # Application icon
├── InspireMe-Install.bat        # First-time setup wizard (Windows)
├── InspireMe-Start.bat          # Daily launcher (Windows)
├── InspireMe-Start.sh           # Daily launcher (macOS/Linux)
├── README.md                    # This file
├── ARCHITECTURE-v2.md           # Detailed technical architecture
├── SETUP-GUIDE.md               # Full build guide (database from scratch)
└── LICENSE                      # MIT
```

---

## Development Setup

For contributors who want to run from source:

```bash
# Clone the repository
git clone https://github.com/andreaercoli86-glitch/Inspire2.git
cd Inspire2/inspire-server

# Install dependencies
npm install

# Download the database from GitHub Releases
# Place inspire.db in inspire-server/data/

# Start Ollama (in another terminal)
ollama serve

# Start the server
node server.js
```

> **Note:** `better-sqlite3` requires native compilation. On Windows you may need
> [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

The server starts on [http://localhost:3457](http://localhost:3457).

### API Endpoints

```bash
# Health check
curl http://localhost:3457/api/health

# Database stats
curl http://localhost:3457/api/stats

# Search
curl -X POST http://localhost:3457/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"help me overcome fear of the dark","type":"movie","limit":5}'
```

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Credits

- [Wikidata](https://www.wikidata.org/) — structured metadata for books and films
- [Wikipedia](https://www.wikipedia.org/) — plot summaries in English and Italian
- [Ollama](https://ollama.com/) — local LLM inference runtime
- [Qwen](https://qwenlm.github.io/) by Alibaba Cloud — language and embedding models
- [sqlite-vec](https://github.com/asg017/sqlite-vec) by Alex Garcia — vector search extension for SQLite
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — fast, synchronous SQLite driver for Node.js
- [Inno Setup](https://jrsoftware.org/isinfo.php) — Windows installer framework

---

<div align="center">

**Built with local AI. No cloud required.**

*InspireMe² — Find the story that changes yours.*

</div>
