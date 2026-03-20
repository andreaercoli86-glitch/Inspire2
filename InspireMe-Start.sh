#!/bin/bash
#
# Inspire v2 — Local launcher
# Starts Ollama + Inspire server and opens the browser.
#

export OLLAMA_ORIGINS="*"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ========================================"
echo "   INSPIRE v2 — Starting..."
echo "  ========================================"
echo ""

# Detect OS for open command
open_browser() {
    local url="http://localhost:3457"
    sleep 2
    case "$(uname -s)" in
        Darwin*)  open "$url" ;;
        Linux*)   xdg-open "$url" 2>/dev/null || sensible-browser "$url" 2>/dev/null || echo "  Open $url in your browser" ;;
        *)        echo "  Open $url in your browser" ;;
    esac
}

# 1. Check/start Ollama
echo "  [1/3] Verifico Ollama..."
if ! pgrep -x "ollama" > /dev/null 2>&1; then
    echo "  [INFO] Avvio Ollama..."
    ollama serve &>/dev/null &
    sleep 3
else
    echo "  [OK] Ollama già in esecuzione."
fi

# 2. Start Inspire server
echo "  [2/3] Avvio server Inspire..."
cd "$SCRIPT_DIR/inspire-server"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "  [INFO] Prima esecuzione — installazione dipendenze..."
    npm install
fi

# Check if database exists
if [ ! -f "data/inspire.db" ]; then
    echo ""
    echo "  [ATTENZIONE] Database non trovato."
    echo "  Esegui prima: npm run build:all"
    echo "  Oppure scarica il database pre-costruito."
    echo ""
fi

# 3. Open browser
echo "  [3/3] Apertura browser..."
open_browser &

echo ""
echo "  ========================================"
echo "   Inspire in esecuzione: http://localhost:3457"
echo "   Premi Ctrl+C per fermare il server."
echo "  ========================================"
echo ""

node server.js
