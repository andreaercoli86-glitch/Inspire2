# Inspire v2 — Guida Setup Completa

## Prerequisiti

- **Windows 10+** (x64)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Ollama** — [ollama.com/download](https://ollama.com/download)
- ~**4GB** spazio disco per modelli Ollama
- ~**30GB** spazio disco temporaneo per dump Wikipedia (eliminabili dopo la build)
- ~**500MB** per il database finale `inspire.db`

---

## Step 1: Installa Ollama e i modelli

```bash
# Dopo aver installato Ollama, apri un terminale:
ollama pull gemma3:4b              # LLM per raccomandazioni (~2.7GB)
ollama pull nomic-embed-text-v2-moe  # Embeddings multilingue (~958MB)
```

Verifica:
```bash
ollama list
# Dovresti vedere entrambi i modelli
```

---

## Step 2: Installa le dipendenze Node.js

```bash
cd inspire-server
npm install
```

> **Nota:** `better-sqlite3` richiede compilazione nativa. Su Windows potrebbe servire
> [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
> In alternativa: `npm install --global windows-build-tools`

---

## Step 3: Prepara i dati sorgente

### 3a. Tell Me Again! (dataset principale — 96k trame)

1. Scarica il dataset da: https://huggingface.co/datasets/tell-me-again (o dal paper LREC 2024)
2. Il file sarà un JSONL o CSV
3. Mettilo in: `inspire-server/data/tellmeagain/`

### 3b. Wikipedia dumps (trame aggiornate al 2026)

Scarica i dump Wikipedia in formato "articles" (bz2):

```bash
# Inglese (~25.9GB compresso)
wget https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles.xml.bz2

# Italiano (~4.0GB compresso)
wget https://dumps.wikimedia.org/itwiki/latest/itwiki-latest-pages-articles.xml.bz2
```

Poi estrai le pagine con [WikiExtractor](https://github.com/attardi/wikiextractor):

```bash
pip install wikiextractor

# Inglese
wikiextractor enwiki-latest-pages-articles.xml.bz2 -o wiki_out_en --json --sections

# Italiano
wikiextractor itwiki-latest-pages-articles.xml.bz2 -o wiki_out_it --json --sections
```

---

## Step 4: Costruisci il database

### Opzione A: Pipeline completa (raccomandato)

```bash
cd inspire-server

npm run build:all -- \
  --wikiplots-en ../wiki_out_en \
  --wikiplots-it ../wiki_out_it \
  --tellmeagain ./data/tellmeagain/dataset.jsonl
```

Tempo stimato: **30-90 minuti** (dipende da CPU e connessione per Wikidata).

### Opzione B: Step singoli (per debug)

```bash
# 1. Scarica metadati da Wikidata (~20 min, richiede internet)
npm run build:wikidata

# 2. Importa trame da Tell Me Again!
npm run build:tellmeagain -- --input ./data/tellmeagain/dataset.jsonl

# 3. Estrai trame da Wikipedia dumps
npm run build:wikiplots -- --input ../wiki_out_en --lang en
npm run build:wikiplots -- --input ../wiki_out_it --lang it

# 4. Genera embeddings con Ollama (~60 min per 150k opere)
npm run build:embeddings

# 5. Ricostruisci indice FTS5
npm run build:fts
```

### Opzione C: Salta step già completati

```bash
npm run build:all -- --skip-wikidata --skip-wikiplots
```

---

## Step 5: Avvia Inspire

```bash
# Windows
start.bat

# macOS/Linux
chmod +x start.sh
./start.sh
```

Si aprirà il browser su **http://localhost:3456**

---

## Step 6: Verifica

1. Apri http://localhost:3456
2. L'overlay di setup dovrebbe scomparire automaticamente
3. Seleziona "Libri" o "Film"
4. Prova: "Aiutami a spiegare a mio figlio l'importanza delle regole"
5. Dovresti vedere risultati con badge verdi (✓ Verificato) e gialli (⚠ Verifica online)

### Health check API

```bash
curl http://localhost:3456/api/health
# → {"status":"ok","ollama":true,"database":true,"works":150234,"embeddings":150234}

curl http://localhost:3456/api/stats
# → {"works":150234,"books":87654,"films":62580,"plots":198345,"embeddings":150234}
```

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| `better-sqlite3` non compila | Installa Visual Studio Build Tools, poi `npm rebuild` |
| `sqlite-vec` non trovato | Verifica che l'estensione sia nel path `node_modules/sqlite-vec/` |
| Ollama non risponde | Verifica con `curl http://localhost:11434/api/tags` |
| Embedding lento | Normale: ~150k opere a ~50/batch = ~50 minuti su GPU |
| Database vuoto | Esegui `npm run build:all` con i percorsi corretti |
| FTS5 non funziona | Esegui `npm run build:fts` per ricostruire l'indice |

---

## Struttura file finale

```
InspireMe/
├── index.html              ← App principale
├── welcome.html            ← Landing page di setup
├── start.bat / start.sh    ← Launcher
├── ARCHITECTURE-v2.md      ← Architettura tecnica
├── SETUP-GUIDE.md          ← Questa guida
├── inspire-server/
│   ├── package.json
│   ├── server.js           ← Server Express (porta 3456)
│   ├── db.js               ← SQLite wrapper
│   ├── search.js           ← Ricerca semantica + scoring
│   ├── test-pipeline.js    ← Test di integrazione
│   ├── data/
│   │   └── inspire.db      ← Database generato (~500MB)
│   └── build/
│       ├── build-all.js    ← Orchestratore pipeline
│       ├── fetch-wikidata.js
│       ├── extract-wikiplots.js
│       ├── import-tellmeagain.js
│       └── generate-embeddings.js
└── installer/
    ├── InspireSetup.iss    ← Script Inno Setup
    └── build-exe.js        ← Bundling nexe
```
