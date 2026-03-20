<div align="center">

# InspireMe²

**A local-first AI-powered book & movie recommendation engine**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black?logo=ollama)](https://ollama.com)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows)](https://www.microsoft.com/windows)

Describe what you want to inspire — a love for reading, a passion for sports, curiosity about science — and get personalized book and movie recommendations with detailed explanations of *why* each one works and *how* to use it.

**Fully offline. Fully private. No cloud, no accounts, no data collection.**

[Quick Start](#-quick-start) · [How It Works](#-how-it-works) · [Tech Stack](#-tech-stack) · [Troubleshooting](#-what-if-troubleshooting) · [Contributing](#-development-setup)

</div>

---

## Key Features

- **100% Local** — runs entirely on your machine, no internet required after setup
- **Powered by Qwen LLM** — local AI inference via [Ollama](https://ollama.com), no API keys needed
- **150,000+ works** — books and movies with plots, metadata, and pre-computed enrichments
- **Hybrid search** — vector similarity (sqlite-vec) + full-text BM25 (FTS5), fused with Reciprocal Rank Fusion (RRF)
- **Bilingual** — search in Italian or English, interface available in both languages
- **Confidence badges** — each result shows a verified/verify-online confidence indicator

---

## Screenshots

> Screenshots coming soon.

![App Screenshot](docs/screenshot-search.png)
![Results Screenshot](docs/screenshot-results.png)

---

## Quick Start

### Prerequisites

| Requirement | Details |
|---|---|
| **OS** | Windows 10/11 (macOS/Linux experimental) |
| **RAM** | 8 GB minimum, 16 GB recommended |
| **Disk** | ~5 GB (Ollama + models + database) |
| **GPU** | Not required — CPU inference works fine, GPU recommended for speed |

### Installation

1. **Download** the latest release from [GitHub Releases](https://github.com/user/InspireMe2-Qwen/releases)
2. **Run the installer:**
   - Windows: `InspireSetup.exe`
   - macOS/Linux: `./InspireMe-Start.sh`
3. **Follow the setup wizard** — it will guide you through:
   - Installing Ollama (if not already present)
   - Downloading the Qwen models
   - Downloading the pre-built database
4. **Open your browser** to [http://localhost:3457](http://localhost:3457)

After the first setup, just launch InspireMe and you are ready to go.

---

## How It Works

```
User query ──> Query Expansion ──> Hybrid Search ──> RRF Fusion ──> Ranked Results
                  (Qwen LLM)       ├─ Vector (sqlite-vec)
                                    └─ BM25 (FTS5)
```

1. **You type a natural language query** in Italian or English (e.g., *"Help me inspire my child to love reading"* or *"Aiutami a spiegare l'importanza delle regole"*)
2. **Qwen LLM expands the query** with semantic keywords to improve recall
3. **Hybrid search** runs in parallel:
   - **Vector similarity** — the query is embedded with `qwen3-embedding:4b` and compared against 150,000+ pre-computed work embeddings using `sqlite-vec`
   - **Full-text BM25** — keyword matching via SQLite FTS5 across titles, creators, genres, and plot summaries
4. **Reciprocal Rank Fusion (RRF)** merges both ranked lists into a single, balanced result set
5. **Confidence badges** indicate match quality:
   - **Verified** — high-confidence match with strong semantic and keyword alignment
   - **Verify online** — plausible match, worth double-checking

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express |
| **Database** | SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) (vector search) + FTS5 (full-text) |
| **LLM Inference** | [Ollama](https://ollama.com) (local) |
| **Reasoning Model** | [Qwen 3.5:4b](https://ollama.com/library/qwen3.5) — query expansion and enrichment generation |
| **Embedding Model** | [qwen3-embedding:4b](https://ollama.com/library/qwen3-embedding) — multilingual semantic embeddings |
| **Frontend** | Vanilla JS, CSS — no frameworks, no build step |
| **Data Sources** | Wikidata (metadata), Wikipedia (plot summaries) |

---

## What If (Troubleshooting)

| Problem | Solution |
|---|---|
| **"Ollama not found"** | Download Ollama from [ollama.com](https://ollama.com), install it, and restart your terminal. |
| **"Model not found"** | Pull the required models manually: `ollama pull qwen3.5:4b` and `ollama pull qwen3-embedding:4b` |
| **"Port 3457 already in use"** | Kill the existing process using port 3457, or set a custom port: `set INSPIRE_PORT=3460` (Windows) / `export INSPIRE_PORT=3460` (Linux/macOS) |
| **"Database not found"** | Download the pre-built database from [GitHub Releases](https://github.com/user/InspireMe2-Qwen/releases) and place it in `inspire-server/data/` |
| **"Search returns no results"** | Verify Ollama is running (`ollama list`), and that the embedding model is loaded. Try restarting the server. |
| **"Slow responses"** | The first query after launch is slow because models are loading into memory. Subsequent queries are much faster. A GPU significantly improves speed. |

---

## Development Setup

For contributors who want to run from source:

```bash
# Clone the repository
git clone https://github.com/user/InspireMe2-Qwen.git
cd InspireMe2-Qwen/inspire-server

# Install dependencies
npm install

# Start the server
node server.js
```

> **Note:** `better-sqlite3` requires native compilation. On Windows you may need
> [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

The server will start on [http://localhost:3457](http://localhost:3457) and serve the frontend from the `public/` directory.

### Health Check

```bash
curl http://localhost:3457/api/health
# {"status":"ok","ollama":true,"database":true, ...}

curl http://localhost:3457/api/stats
# {"total_works":150234,"books":87654,"films":62580, ...}
```

---

## Environment Variables

All configuration is optional — sensible defaults are built in.

| Variable | Default | Description |
|---|---|---|
| `INSPIRE_PORT` | `3457` | HTTP server port |
| `OLLAMA_BASE` | `http://localhost:11434` | Ollama API base URL |
| `EMBEDDING_MODEL` | `qwen3-embedding:4b` | Ollama model used for generating query embeddings |
| `LLM_MODEL` | `qwen3.5:4b` | Ollama model used for query expansion and enrichment |
| `INSPIRE_DB_PATH` | `inspire-server/data/inspire.db` | Path to the SQLite database file |
| `DISABLE_QUERY_EXPANSION` | `0` | Set to `1` to disable LLM-based query expansion |

---

## Project Structure

```
InspireMe2-Qwen/
├── public/                  # Frontend (vanilla JS, CSS, HTML)
│   ├── index.html           # Main application UI
│   ├── style.css            # Styles
│   └── app.js               # Client-side logic
├── inspire-server/
│   ├── server.js            # Express HTTP server
│   ├── search.js            # Hybrid RAG search engine (vector + BM25 + RRF)
│   ├── db.js                # SQLite wrapper (better-sqlite3 + sqlite-vec)
│   ├── data/
│   │   └── inspire.db       # Pre-built database (~1 GB)
│   └── build/               # Database build pipeline scripts
├── InspireMe-Install.bat    # First-time setup wizard (Windows)
├── InspireMe-Start.bat      # Daily launcher (Windows)
├── InspireMe-Start.sh       # Daily launcher (macOS/Linux)
├── ARCHITECTURE-v2.md       # Technical architecture documentation
├── SETUP-GUIDE.md           # Full setup guide (database build)
└── LICENSE                  # MIT
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

---

<div align="center">

Built with local AI. No cloud required.

</div>
