# Inspire v2 — Architettura Tecnica Completa

> Versione: 2.1 — 9 marzo 2026
> Piattaforme target: Windows 10+ (primaria), macOS 12+ (futura)

## Visione d'Insieme

Inspire v2 evolve da un'app browser-only con verifiche API in tempo reale a un sistema ibrido **locale + server**, dove un database SQLite pre-costruito contiene metadati, trame e embeddings vettoriali per ~150.000+ opere (libri + film). La ricerca semantica multilingue sostituisce completamente la generazione di titoli via LLM.

```
┌───────────────────────────────────────────────────────────────┐
│                    UTENTE                                       │
│                                                                 │
│  Primo avvio:                     Avvii successivi:            │
│  InspireSetup.exe                 Icona desktop "Inspire"      │
│  ├─ Installa server+DB            └─ inspire.exe               │
│  ├─ Pull modello embeddings           ├─ Avvia Ollama          │
│  └─ Crea icona desktop                ├─ Avvia server          │
│                                        └─ Apre browser         │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────┐
│              BROWSER (localhost:3456)                           │
│                            │                                    │
│  ┌─────────────┐    ┌─────┴────────┐    ┌─────────────────┐  │
│  │  Landing     │    │  Inspire UI   │    │   Render         │ │
│  │  (welcome)   │    │  (index.html) │───▶│   Cards          │ │
│  └─────────────┘    └──────┬───────┘    └─────────────────┘  │
│                             │ fetch()                           │
└─────────────────────────────┼─────────────────────────────────┘
                              │ HTTP (localhost:3456/api/*)
┌─────────────────────────────┼─────────────────────────────────┐
│              INSPIRE SERVER (Node.js bundled)                   │
│                             │                                   │
│  ┌──────────────┐    ┌─────┴──────┐    ┌───────────────────┐  │
│  │  /api/search  │    │ /api/plots  │    │  /api/health      │ │
│  │  (semantica)  │    │ (synopses)  │    │  /api/stats       │ │
│  └──────┬───────┘    └──────┬─────┘    └───────────────────┘  │
│         │                   │                                   │
│  ┌──────┴───────────────────┴──────────────────────────────┐   │
│  │              SQLite + sqlite-vec                          │   │
│  │                                                            │   │
│  │  works            plots              vec_works             │   │
│  │  (Wikidata)       (EN + IT trame)    (768-dim embeddings) │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│              OLLAMA (localhost:11434)                           │
│                              │                                  │
│  ┌───────────────────┐    ┌─┴────────────┐                    │
│  │  /api/embed        │    │ /api/generate │                    │
│  │  nomic-embed-text  │    │ (enrichment)  │                    │
│  │  -v2-moe (768d)   │    │              │                     │
│  │  MULTILINGUE       │    └──────────────┘                    │
│  └───────────────────┘                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. Database SQLite — Schema

### Tabella `works` (metadati da Wikidata)

```sql
CREATE TABLE works (
    id          INTEGER PRIMARY KEY,
    wikidata_id TEXT UNIQUE NOT NULL,     -- es. "Q8337"
    type        TEXT NOT NULL,            -- "book" | "movie"
    title_it    TEXT,                     -- titolo italiano (Wikidata label IT)
    title_en    TEXT,                     -- titolo inglese (Wikidata label EN)
    title_orig  TEXT,                     -- titolo originale (P1476)
    creator     TEXT,                     -- autore (P50) o regista (P57)
    year        INTEGER,                 -- anno pubblicazione/uscita (P577)
    genres      TEXT,                     -- generi JSON array
    country     TEXT,                     -- paese d'origine (P495)
    sitelinks   INTEGER DEFAULT 0,       -- conteggio sitelinks (proxy notorietà)
    popularity  REAL DEFAULT 0,          -- score composito
    awards      TEXT,                     -- premi notevoli JSON (P166)
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_works_type ON works(type);
CREATE INDEX idx_works_popularity ON works(popularity DESC);
CREATE INDEX idx_works_year ON works(year);
CREATE INDEX idx_works_wikidata ON works(wikidata_id);
```

### Tabella `plots` (trame da Wikipedia dumps + Tell Me Again!)

```sql
CREATE TABLE plots (
    id              INTEGER PRIMARY KEY,
    work_id         INTEGER NOT NULL REFERENCES works(id),
    source          TEXT NOT NULL,        -- "wikiplots_en" | "wikiplots_it" | "tellmeagain"
    language        TEXT NOT NULL,        -- "en" | "it"
    plot_text       TEXT NOT NULL,        -- trama completa
    plot_short      TEXT,                 -- primi 500 chars (per prompt LLM)
    match_confidence REAL DEFAULT 1.0,   -- 1.0 = match esatto (Wikipedia ID), <1.0 = fuzzy
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plots_work ON plots(work_id);
CREATE INDEX idx_plots_lang ON plots(language);
```

### Tabella `vec_works` (embeddings per ricerca semantica)

```sql
-- sqlite-vec: vettori 768-dim (nomic-embed-text-v2-moe)
CREATE VIRTUAL TABLE vec_works USING vec0(
    work_id INTEGER PRIMARY KEY,
    embedding FLOAT[768]
);
```

### Tabella `search_text` (FTS5 per ricerca testuale fallback)

```sql
CREATE VIRTUAL TABLE search_text USING fts5(
    work_id,
    title_it,
    title_en,
    creator,
    genres,
    plot_short,
    tokenize='unicode61 remove_diacritics 2'
);
```

### Dimensioni stimate

| Componente | Righe | Dimensione |
|---|---|---|
| `works` (metadati) | ~150.000 | ~120 MB |
| `plots` (trame EN + IT) | ~200.000 | ~450 MB |
| `vec_works` (embeddings 768-dim) | ~150.000 | ~460 MB |
| `search_text` (FTS5) | ~150.000 | ~80 MB |
| **Totale DB** | | **~1.1 GB** |
| **Compresso (.gz)** | | **~500 MB** |

> Nota: 768-dim raddoppia rispetto ai 384-dim iniziali, ma la qualità multilingue
> giustifica l'aumento. Si può ridurre a 256-dim con Matryoshka (supportato dal modello)
> per dimezzare il peso vettoriale se necessario.

---

## 2. Modello Embeddings — nomic-embed-text-v2-moe

### Perché questo modello

Il punto critico #2 (query italiane vs trame inglesi) è **risolto nativamente** grazie a un modello di embedding multilingue. `nomic-embed-text-v2-moe` mappa italiano e inglese nello **stesso spazio vettoriale**: la query "rispetto delle regole nel gioco" produce un embedding vicino a "rules, fairness, sportsmanship, game" senza alcuna traduzione.

### Specifiche

| Proprietà | Valore |
|---|---|
| **Ollama pull** | `ollama pull nomic-embed-text-v2-moe` |
| **Dimensioni** | 768 (riduzione Matryoshka: 256, 512) |
| **Parametri** | 475M totali (305M attivi, MoE 8 esperti top-2) |
| **Size download** | 958 MB |
| **Lingue** | ~100, italiano confermato |
| **Contesto** | 512 token |
| **Performance** | State-of-the-art nella classe <500M multilingue |
| **Paper** | arXiv:2502.07972 (febbraio 2025) |
| **Compatibilità** | `/api/embed` Ollama ✓ |

### Alternativa lightweight

Se l'utente ha vincoli di spazio, `paraphrase-multilingual` (variante minilm, **121 MB**) offre supporto multilingue con footprint minimo. Il setup potrebbe offrire la scelta:

```
[*] Quale modello embeddings vuoi usare?
    1. nomic-embed-text-v2-moe (958 MB) — Raccomandato, massima precisione
    2. paraphrase-multilingual  (121 MB) — Leggero, buona precisione
```

### Generazione embeddings nella build pipeline

Per ogni opera nel database:

```
embedding_input = "{title_en}. {genres_en}. {plot_short_first_200_chars}"
```

L'embedding combina titolo, generi e incipit della trama in inglese. Il modello multilingue garantisce che una query italiana produca un vettore vicino nello spazio semantico.

---

## 3. Pipeline Dati — Fonti e Copertura Temporale

### Strategia a 2 livelli (CMU/Kaggle eliminati — copertura già sufficiente)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       BUILD PIPELINE (una tantum)                     │
│                                                                        │
│  LIVELLO 1 — METADATI (source of truth)                              │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  Wikidata SPARQL API                                         │     │
│  │  ~150.000 opere (sitelinks >= 5)                             │     │
│  │  Campi: titolo IT/EN, autore/regista, anno, generi, paese    │     │
│  │  Copertura: AGGIORNATO A OGGI (dati live)                    │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  LIVELLO 2 — TRAME (2 fonti complementari)                          │
│                                                                        │
│  ┌──────────────────────────┐   ┌────────────────────────────────┐  │
│  │  Tell Me Again! (2024)    │   │  WikiPlots rigenerato (2026)   │  │
│  │                            │   │                                │  │
│  │  96.831 trame              │   │  ~140.000+ trame stimate      │  │
│  │  29.505 storie             │   │  Dump enwiki-20260101 (25.9GB)│  │
│  │  5 lingue (IT incluso)    │   │  Dump itwiki-20251201 (4.0GB) │  │
│  │  Wikidata ID incluso      │   │  Estratte via wikiPlots.py    │  │
│  │  Copertura: fino al 2023  │   │  Copertura: fino a gen. 2026  │  │
│  │  Match: JOIN diretto      │   │  Match: Wikipedia ID → Wikidata│  │
│  │  per wikidata_id          │   │                                │  │
│  └──────────────────────────┘   └────────────────────────────────┘  │
│                                                                        │
│  FUSIONE:                                                             │
│  1. Tell Me Again! = fonte primaria (match esatto, multilingue)      │
│  2. WikiPlots rigenerato = colma i gap (opere senza TMA)            │
│  3. Per itwiki: trame "Trama" in italiano → plots con language="it" │
│  4. Dedup per wikidata_id: se opera ha trama da entrambe le fonti,  │
│     si tiene Tell Me Again! (curata) + WikiPlots IT se disponibile   │
│                                                                        │
│  EMBEDDINGS:                                                          │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  Generati con Ollama nomic-embed-text-v2-moe (768-dim)      │     │
│  │  Input: "{title_en}. {genres}. {plot_short_200chars}"        │     │
│  │  ~150.000 vettori → vec_works table                          │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  OUTPUT: inspire.db (~1.1 GB) → inspire.db.gz (~500 MB)             │
└──────────────────────────────────────────────────────────────────────┘
```

### Copertura temporale risultante

| Fonte | Metadati | Trame EN | Trame IT | Aggiornato a |
|---|---|---|---|---|
| **Wikidata** | ✓ (150k+) | — | — | Oggi (live) |
| **Tell Me Again!** | — | ✓ (29k) | ✓ (parziale) | ~2023 |
| **WikiPlots EN rigenerato** | — | ✓ (~140k) | — | Gennaio 2026 |
| **WikiPlots IT rigenerato** | — | — | ✓ (~50k stimate) | Dicembre 2025 |

**Risultato**: metadati completi fino a oggi, trame in inglese fino a gennaio 2026, trame in italiano fino a dicembre 2025. Nessun gap temporale significativo.

### Processo WikiPlots rigenerato

```bash
# 1. Download dump Wikipedia EN (25.9 GB compresso)
wget https://dumps.wikimedia.org/enwiki/20260101/enwiki-20260101-pages-articles-multistream.xml.bz2

# 2. Estrai con wikiextractor (preserva sezioni e header)
python -m wikiextractor.WikiExtractor enwiki-20260101-pages-articles-multistream.xml.bz2 \
    --json --html-safe False --sections --output wiki_extracted/

# 3. Estrai trame con wikiPlots.py (header "Plot", "Plot summary", etc.)
python wikiPlots.py wiki_extracted/ plots_en.txt

# 4. Ripeti per italiano (4.0 GB compresso)
wget https://dumps.wikimedia.org/itwiki/20251201/itwiki-20251201-pages-articles-multistream.xml.bz2
# ... stessa procedura, header "Trama", "Contenuto", "Sinossi"
```

Tempo stimato: ~3-4 ore per EN, ~1 ora per IT. Spazio temporaneo: ~120 GB.
Si esegue UNA VOLTA durante la build del DB, non dall'utente.

---

## 4. Server — Architettura

### Stack tecnologico

| Componente | Tecnologia |
|---|---|
| **Runtime** | Node.js 20 LTS (bundled con nexe → singolo .exe) |
| **Database** | better-sqlite3 + sqlite-vec (binari pre-compilati Windows x64) |
| **HTTP** | Express.js o Fastify (lightweight) |
| **Porta** | localhost:3456 (configurabile) |
| **Serving** | index.html + landing page serviti staticamente |

### Perché HTTP REST e non MCP JSON-RPC

L'app Inspire gira nel browser. Il protocollo MCP standard (stdio/SSE) richiede un client MCP host. Il nostro "client" è JavaScript nel browser via `fetch()`. La struttura interna segue i principi MCP (tools tipizzati, input/output strutturati) ma espone HTTP REST per compatibilità browser.

### Endpoints

#### `POST /api/search` — Ricerca semantica

```json
// Request
{
    "query": "rispetto delle regole nel gioco",
    "type": "book",
    "limit": 12,
    "min_popularity": 5,
    "safe_mode": true,
    "origin": "all"
}

// Response
{
    "results": [
        {
            "id": 4523,
            "wikidata_id": "Q865742",
            "title_it": "Il signore delle mosche",
            "title_en": "Lord of the Flies",
            "creator": "William Golding",
            "year": 1954,
            "genres": ["narrativa", "allegoria"],
            "sitelinks": 89,
            "similarity": 0.847,
            "confidence": 0.82,
            "plot_short": "A group of British boys stranded on an uninhabited island...",
            "plot_it_short": "Un gruppo di ragazzi britannici naufraga su un'isola...",
            "has_plot": true
        }
    ],
    "total_found": 47,
    "search_time_ms": 62
}
```

#### `POST /api/plots` — Trame complete

```json
// Request
{ "work_ids": [4523, 1287, 9012] }

// Response
{
    "plots": {
        "4523": {
            "en": "A group of British boys are stranded on...",
            "it": "Un gruppo di ragazzi britannici naufraga...",
            "source": "wikiplots_en"
        }
    }
}
```

#### `GET /api/stats` — Statistiche database

```json
{
    "total_works": 152340,
    "books": 68420,
    "movies": 83920,
    "with_plots_en": 138650,
    "with_plots_it": 48200,
    "db_version": "2026.03",
    "embedding_model": "nomic-embed-text-v2-moe"
}
```

#### `GET /api/health` — Health check

```json
{ "status": "ok", "ollama": true, "embedding_model": true, "db_loaded": true }
```

---

## 5. Confidence Score e Badge Gialli

### Sistema a 3 fasce

Ogni risultato della ricerca semantica riceve un **confidence score** composito:

```
confidence = (cosine_similarity × 0.50)
           + (popularity_normalized × 0.20)
           + (has_plot × 0.15)
           + (match_confidence × 0.15)
```

Dove:
- `cosine_similarity`: similarità vettoriale query ↔ opera (0.0–1.0)
- `popularity_normalized`: `min(sitelinks / 100, 1.0)` — normalizzato a 1.0
- `has_plot`: 1.0 se trama presente nel DB, 0.0 altrimenti
- `match_confidence`: confidenza del matching trama→opera (1.0 = Wikipedia ID, <1.0 = fuzzy)

### Badge visuali

| Fascia | Condizione | Badge | Significato |
|---|---|---|---|
| **Verde** | confidence ≥ 0.70 | `✓ Verificato` | Opera nel DB, alta corrispondenza, dati completi |
| **Giallo** | 0.45 ≤ confidence < 0.70 | `⚠ Verifica online` | Opera trovata ma match meno sicuro, o dati parziali |
| **Scartato** | confidence < 0.45 | Non mostrato | Pertinenza troppo bassa |

Il badge giallo mostra la scritta **"Verifica online"** (in italiano) / **"Verify online"** (in inglese), educando l'utente a controllare i risultati meno certi. Questa logica è intenzionale: mantenere trasparenza sulla qualità dei risultati e promuovere il pensiero critico verso output generati da AI.

### Quando appare il badge giallo

- Query molto generica (es. "la vita") → molte opere con similarità media
- Opera nota ma senza trama nel DB (post-2026 o nicchia)
- Trama associata via fuzzy match (match_confidence < 1.0)
- Opera con pochi sitelinks (poco nota a livello internazionale)

---

## 6. Traduzione Implicita — Come funziona

### Flusso linguistico

```
Query IT: "Aiutami a spiegare a mio figlio l'importanza del rispetto delle regole"
    │
    ▼
Embedding multilingue (nomic-v2-moe): query IT → vettore 768-dim
    │                                              │
    ▼                                              ▼
Ricerca coseno: vettore query ↔ vettori DB (generati da testi EN)
    │
    ▼
Top 12 risultati con trame EN (+ trame IT se disponibili)
    │
    ▼
LLM Enrichment: riceve trame EN/IT + query originale IT
    │
    ▼
Output: descrizioni why/how in ITALIANO
```

Il modello multilingue elimina la necessità di tradurre la query. L'embedding di "rispetto delle regole" è naturalmente vicino a "rules, fairness, respect" nello spazio vettoriale condiviso.

### Prompt di enrichment

```
You are a book/movie recommendation expert.
The user asked (in Italian): "Aiutami a spiegare a mio figlio..."

Below are VERIFIED real works with their real synopses.
For EACH one, write:
- "why": 2-3 sentences in ITALIAN explaining the connection to the user's need.
  Reference the ACTUAL plot/content from the synopsis provided.
- "how": 2-3 sentences in ITALIAN with warm, practical guidance.

VERIFIED WORKS:
1. "Lord of the Flies" — William Golding (1954)
   Synopsis: A group of British boys stranded on an uninhabited island...
   [Synopsis IT: Un gruppo di ragazzi britannici naufraga su un'isola...]

RULES:
- Base "why" ONLY on the real synopsis. Do NOT invent plot details.
- If both EN and IT synopses are available, prefer the IT one for accuracy.
- If no synopsis available, write a brief generic connection but stay honest.
- Write ALL text in Italian with correct grammar.

Reply with ONLY a JSON array:
[{"why":"...","how":"..."}]
```

Quando la trama italiana è disponibile (da itwiki o Tell Me Again!), il LLM la preferisce. Quando c'è solo l'inglese, rielabora in italiano. Il risultato è sempre in italiano, basato su dati reali.

---

## 7. Struttura File del Progetto

```
InspireMe/
├── index.html                        # App frontend (servita dal server)
├── welcome.html                      # Landing page primo avvio
├── inspire-server/                   # Server (sorgenti)
│   ├── package.json
│   ├── server.js                     # Entry point HTTP + static serving
│   ├── db.js                         # Wrapper SQLite + sqlite-vec
│   ├── search.js                     # Ricerca semantica + confidence score
│   └── build/                        # Script build pipeline (non distribuiti)
│       ├── fetch-wikidata.js         # SPARQL → works table
│       ├── import-tellmeagain.js     # Tell Me Again! → plots table
│       ├── extract-wikiplots.js      # Wikipedia dumps → plots table
│       ├── match-plots.js            # Match plots → works via Wikidata ID
│       ├── generate-embeddings.js    # Ollama embed → vec_works
│       └── build-all.js             # Orchestratore
├── installer/                        # Sorgenti installer
│   ├── inspire-setup.iss             # Inno Setup script
│   ├── inspire.exe                   # Launcher (compilato da launcher.js)
│   └── icon.ico                      # Icona desktop
├── data/
│   └── inspire.db                    # Database SQLite (~1.1 GB, scaricato)
└── README.md
```

---

## 8. Setup Utente — Installer Windows

### InspireSetup.exe (Inno Setup)

L'utente scarica un singolo `InspireSetup.exe` (~80 MB) da GitHub Releases. L'installer:

```
InspireSetup.exe
│
├─ 1. Verifica prerequisiti
│     ├─ Ollama installato? → Se no: apre https://ollama.com, attende
│     └─ Connessione internet? → Se no: errore con istruzioni
│
├─ 2. Installa in C:\Users\{user}\Inspire\
│     ├─ inspire-server.exe    (~80 MB, Node.js bundled via nexe)
│     ├─ inspire.exe           (~1 MB, launcher nativo)
│     ├─ index.html            (app frontend)
│     ├─ welcome.html          (landing page)
│     └─ data\                 (cartella per DB)
│
├─ 3. Download database (solo primo avvio)
│     ├─ inspire.db.gz da GitHub Releases (~500 MB)
│     ├─ Decomprimi → inspire.db (~1.1 GB)
│     ├─ Barra di progresso nell'installer
│     └─ Tempo stimato: 3-8 min (dipende dalla connessione)
│
├─ 4. Pull modello embeddings
│     ├─ ollama pull nomic-embed-text-v2-moe (958 MB)
│     │   OPPURE
│     ├─ ollama pull paraphrase-multilingual (121 MB) — se scelto "leggero"
│     └─ Tempo stimato: 1-3 min
│
├─ 5. Crea icona desktop
│     └─ "Inspire" → C:\Users\{user}\Inspire\inspire.exe
│
└─ 6. Primo avvio automatico
      ├─ Lancia inspire.exe
      ├─ Avvia Ollama + server
      └─ Apre browser su localhost:3456
```

### inspire.exe (Launcher)

Script compilato (~1 MB) che l'utente lancia dall'icona desktop:

```
inspire.exe
│
├─ 1. Ollama in esecuzione?
│     └─ No → start /min ollama serve → attendi 3s
│
├─ 2. Server in esecuzione? (check localhost:3456/api/health)
│     └─ No → start /min inspire-server.exe → attendi 2s
│
├─ 3. Apri browser predefinito
│     └─ start http://localhost:3456
│
└─ 4. Mostra tray icon (opzionale, futuro)
      └─ Click destro → "Chiudi Inspire"
```

### Flusso utente completo

```
PRIMO AVVIO (~5-10 min, una tantum):
1. Scarica InspireSetup.exe da GitHub (~80 MB)
2. Doppio click → installazione guidata
3. Download automatico DB + modello embeddings
4. Icona "Inspire" appare sul desktop
5. Browser si apre, app funzionante

AVVII SUCCESSIVI (~3-5 secondi):
1. Doppio click icona desktop "Inspire"
2. Ollama + server si avviano in background
3. Browser si apre → pronto all'uso
```

---

## 9. Landing Page di Benvenuto (welcome.html)

Quando l'utente apre `index.html` direttamente dal file system (senza server), o al primissimo accesso, vede una landing page:

```
┌─────────────────────────────────────────────┐
│                                               │
│            ✦ INSPIRE ✦                       │
│     Trova ispirazione attraverso le storie    │
│                                               │
│  ─────────────────────────────────────────── │
│                                               │
│  Benvenuto! Per utilizzare Inspire hai        │
│  bisogno di completare l'installazione.       │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │  Passo 1: Installa Ollama               │ │
│  │  Scarica da https://ollama.com           │ │
│  │  [Scarica Ollama ↗]                     │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │  Passo 2: Esegui l'installer            │ │
│  │  Lancia InspireSetup.exe dalla           │ │
│  │  cartella del progetto                    │ │
│  │  [Apri cartella progetto ↗]             │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │  Passo 3: Usa Inspire!                   │ │
│  │  Clicca l'icona "Inspire" sul desktop    │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  Dopo l'installazione, questa pagina non     │
│  apparirà più.                                │
│                                               │
└─────────────────────────────────────────────┘
```

Quando il server è attivo, `localhost:3456` serve direttamente `index.html` (l'app vera). La landing page appare solo se l'utente apre il file HTML senza server attivo (rileva `localhost:3456/api/health` → fallisce → mostra welcome).

---

## 10. Integrazione con index.html — Modifiche

### Cosa cambia

| Funzione attuale | Stato | Sostituzione |
|---|---|---|
| `verifyViaWikidata()` | **Rimossa** | Dati nel DB |
| `verifyBookViaGoogle()` | **Rimossa** | Dati nel DB |
| `verifyMovieViaWikipedia()` | **Rimossa** | Dati nel DB |
| `verifyBook()` | **Rimossa** | `POST /api/search` |
| `verifyMovie()` | **Rimossa** | `POST /api/search` |
| `verifyRecommendations()` | **Rimossa** | `POST /api/search` |
| `fetchWikipediaSynopsis()` | **Rimossa** | Trame nel DB |
| `buildBookTitlesPrompt()` | **Rimossa** | DB trova titoli |
| `buildMoviePrompt()` | **Riscritta** | Prompt enrichment unificato |
| `buildBookEnrichmentPrompt()` | **Evoluta** | Prompt enrichment unificato |
| `getInspiration()` | **Riscritta** | Nuovo flusso 2-fase |
| `similarity()` / `fuzzyWordMatch()` | **Rimosse** | Matching nel DB |
| `STOP_WORDS` / `normalize()` | **Rimosse** | Non necessarie |
| `WD_EXCLUDE_TYPES` | **Rimossa** | Filtraggio nella build pipeline |
| Topic extraction / themes | **Mantenute** | Arricchiscono la query |
| Safe mode / i18n / UI | **Invariate** | Nessuna modifica |
| Badge CSS (verified/unverified) | **Aggiornato** | 3 fasce: verde, giallo, nascosto |

### Nuovo `getInspiration()` (pseudocodice)

```javascript
async function getInspiration() {
    const input = getUserInput();
    const category = getCategory();
    const topic = extractTopic(input);
    const themes = detectThemes(input);
    const model = getSelectedModel();

    // ═══ FASE 1: RICERCA SEMANTICA (MCP Server) ═══
    showLoading(t('searching'));
    const searchQuery = `${topic} ${themes.join(' ')}`;

    const searchResults = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: searchQuery,
            type: category === 'books' ? 'book' : 'movie',
            limit: 12,
            min_popularity: 5,
            safe_mode: safeMode,
            origin: getOriginFilter()
        })
    }).then(r => r.json());

    if (!searchResults.results?.length) {
        showError(t('errNoResults'));
        return;
    }

    // Top 8 per similarity
    const top8 = searchResults.results.slice(0, 8);

    // ═══ FASE 2: ENRICHMENT LLM ═══
    showLoading(t('writingDescriptions'));

    const enrichPrompt = buildEnrichmentPrompt(input, top8);
    const enrichResponse = await callLLM(model, enrichPrompt, { maxTokens: 2500 });
    const descriptions = parseLLMResponse(enrichResponse);

    // ═══ MERGE + CONFIDENCE BADGES ═══
    const finalResults = top8.map((work, i) => ({
        title: work.title_it || work.title_en,
        type: work.type,
        author_or_director: work.creator,
        year: work.year,
        why: descriptions[i]?.why || '',
        how: descriptions[i]?.how || '',
        _verified: work.confidence >= 0.70,
        _needsVerify: work.confidence >= 0.45 && work.confidence < 0.70,
        _confidence: work.confidence
    }));

    renderResults(finalResults);
}
```

### Badge rendering aggiornato

```javascript
// Nel template della card:
${item._verified
    ? '<span class="verified-badge">✓ ' + t('verified') + '</span>'
    : item._needsVerify
        ? '<span class="unverified-badge">⚠ ' + t('verifyOnline') + '</span>'
        : ''
}
```

Nuove stringhe i18n:
```javascript
// Italiano
verifyOnline: 'Verifica online',
// Inglese
verifyOnline: 'Verify online',
```

---

## 11. Vantaggi vs Architettura Attuale

| Aspetto | v1 (attuale) | v2 |
|---|---|---|
| **Precisione titoli** | LLM inventa → verifica spesso fallisce | DB trova titoli reali → verificati |
| **Trame** | Wikipedia API in tempo reale (lenta, spesso mancante) | Pre-caricate nel DB (EN + IT) |
| **Velocità** | 15-25s (LLM + API + LLM) | 4-9s (search DB + LLM) |
| **Offline** | No (Wikidata + Wikipedia + Google Books) | Sì (solo Ollama locale) |
| **Copertura** | Limitata dal LLM (hallucinations) | 150.000+ opere reali |
| **Multilingue** | Wikipedia IT limitata | Embeddings multilingue nativi |
| **Badge gialli** | Frequenti (verifica fallisce) | Solo quando appropriato (bassa confidence) |
| **Dipendenze rete** | Wikidata + Wikipedia + Google Books | Nessuna (dopo setup) |
| **Setup utente** | Nessuno (ma risultati scarsi) | Installer una tantum (~10 min) |
| **Copertura temporale** | Dipende dal LLM | Fino a gennaio 2026 (trame), oggi (metadati) |

---

## 12. Roadmap Implementazione

### Fase 1: Build Pipeline (2 settimane)
- Script SPARQL Wikidata → tabella `works`
- Import Tell Me Again! → tabella `plots`
- Rigenerazione WikiPlots da dump EN/IT → tabella `plots`
- Matching engine (Wikidata ID join + fuzzy fallback)
- Generazione embeddings con nomic-embed-text-v2-moe
- Export inspire.db + compressione

### Fase 2: Server (1 settimana)
- Server HTTP con endpoints /api/search, /api/plots, /api/stats, /api/health
- Integrazione SQLite + sqlite-vec (binari Windows x64)
- Serving statico index.html + welcome.html
- Confidence score computation

### Fase 3: Frontend (1 settimana)
- Riscrittura `getInspiration()` con flusso 2-fase unificato
- Nuovo prompt enrichment (libri + film, stesso template)
- Badge verde/giallo con "Verifica online"
- Rimozione codice verifica API (Wikidata, Google Books, Wikipedia)
- Landing page welcome.html con istruzioni setup
- Test end-to-end

### Fase 4: Packaging Windows (1 settimana)
- nexe → inspire-server.exe (Node.js bundled)
- Launcher inspire.exe
- Inno Setup → InspireSetup.exe
- Download DB + modello embeddings nell'installer
- Icona desktop
- Pubblicazione su GitHub Releases

---

## 13. Requisiti Utente Finale

| Requisito | Dettaglio |
|---|---|
| **OS** | Windows 10+ (x64) |
| **RAM** | 8 GB minimo (4 Ollama + 1 DB + 1 server) |
| **Disco** | ~2.5 GB (DB 1.1GB + server 80MB + embeddings 958MB + LLM) |
| **Software** | Ollama (verificato/installato dal setup) |
| **Rete** | Solo primo avvio (download ~1.5 GB totali) |
| **Browser** | Qualsiasi browser moderno |

---

## 14. Scalabilità e Aggiornamenti

### Espansione titoli

```
sitelinks >= 5  → ~150.000 opere (default)
sitelinks >= 3  → ~300.000 opere
sitelinks >= 1  → ~500.000 opere
```

### Aggiornamento database

- Frequenza: ~1 volta l'anno (o su richiesta)
- Processo: rieseguire build pipeline con dump Wikipedia aggiornati
- Distribuzione: nuova release GitHub con inspire.db.gz aggiornato
- Utente: il launcher check versione → download automatico se disponibile

### Ranking per notorietà

```
popularity = sitelinks × 4 + num_properties × 2 + has_plot × 10
```

A parità di similarità coseno, opere con popularity più alta vengono privilegiate.

---

## Appendice A: Fonti Dati e Licenze

| Fonte | Licenza | Redistribuibile | Note |
|---|---|---|---|
| Wikidata | CC0 | ✓ | Dominio pubblico |
| Wikipedia dumps | CC-BY-SA 3.0 | ✓ | Attribuzione richiesta |
| Tell Me Again! | CC-BY-SA | ✓ | Paper LREC 2024 |
| WikiPlots (rigenerato) | CC-BY-SA | ✓ | Derivato da Wikipedia |

### Attribuzione richiesta nel README

```
Data sources:
- Wikidata (https://www.wikidata.org) — CC0
- Wikipedia (https://www.wikipedia.org) — CC-BY-SA 3.0
- Tell Me Again! dataset (Hatzel et al., LREC 2024) — CC-BY-SA
- nomic-embed-text-v2-moe (Nomic AI) — Apache 2.0
```

## Appendice B: Modelli Embeddings Compatibili

| Modello | Pull command | Dimensioni | Size | Multilingue |
|---|---|---|---|---|
| **nomic-embed-text-v2-moe** (raccomandato) | `ollama pull nomic-embed-text-v2-moe` | 768 | 958 MB | ~100 lingue |
| paraphrase-multilingual (lightweight) | `ollama pull paraphrase-multilingual` | 768 | 563 MB | ~100 lingue |
| paraphrase-multilingual-minilm (ultra-light) | `ollama pull nextfire/paraphrase-multilingual-minilm` | 384 | 121 MB | ~100 lingue |
| bge-m3 (alta precisione) | `ollama pull bge-m3` | 1024 | 1.2 GB | 170+ lingue |
| snowflake-arctic-embed2 (contesto lungo) | `ollama pull snowflake-arctic-embed2` | 1024 | 1.2 GB | ~100 lingue |
