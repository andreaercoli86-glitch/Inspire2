/**
 * Inspire v2 — Frontend Application
 */

'use strict';

// ═══════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════
const OLLAMA_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3.5:4b';
const INSPIRE_SERVER = window.location.origin;

let isConnected = false;
let currentAbort = null;
let setupPollingId = null;
let currentLang = 'it';
let currentTheme = 'dark';
let allVerifiedResults = [];
let visibleCount = 5;
let loadingPhraseInterval = null;
let hiddenTitles = new Set();
let isGenerating = false;
let bookmarksPanelOpen = false;
let safeMode = true;
let _renderedItems = [];

// ═══════════════════════════════════════════
// i18n
// ═══════════════════════════════════════════
const i18n = {
    it: {
        heroTitle: 'Cosa ti ispira oggi?',
        heroSub: 'Trova libri e film che accendono passione e curiosità',
        books: 'Libri',
        movies: 'Film',
        tagline: 'Qui è dove ti aiuto a trovare l\'ispirazione che cercavi',
        placeholder: 'es. Aiutami a spiegare a mio figlio quanto sia importante rispettare le regole di un gioco\nes. Voglio motivarmi per perdere peso\nes. Cerca l\'ispirazione per un viaggio di coppia',
        submit: 'Trova Ispirazione',
        connecting: 'Connessione...',
        connected: 'Connesso',
        offline: 'Offline',
        noModels: 'Nessun modello',
        footer: 'Funziona 100% in locale. I tuoi dati non lasciano mai il tuo computer.',
        resultsTitle: 'Le tue ispirazioni',
        loading: 'Sto creando raccomandazioni personalizzate...',
        whyLabel: 'Perché ispira',
        howLabel: 'Come usarlo per ispirare',
        errNoConnect: 'Ollama non è connesso. Assicurati che sia in esecuzione.',
        errNoInput: 'Descrivi cosa vuoi ispirare.',
        errNoCat: 'Seleziona una categoria: Libri o Film.',
        errParse: 'Non riesco a interpretare la risposta. Riprova o cambia modello.',
        errNoResults: 'Nessuna raccomandazione generata. Prova a riformulare la richiesta.',
        verifying: 'Verifico che i titoli esistano davvero...',
        fetchingDetails: 'Recupero informazioni sui libri...',
        writingDescriptions: 'Creo le descrizioni...',
        verified: 'Verificato',
        notVerified: 'Non verificato',
        stop: 'Ferma',
        loadMore: 'Scopri di più',
        bookmarksTitle: 'I tuoi salvati',
        bookmarksEmpty: 'Nessun titolo salvato ancora. Usa il ♥ per salvare i tuoi preferiti.',
        bookmarkSave: 'Salva',
        bookmarkRemove: 'Rimuovi',
        thumbsDown: 'Non pertinente',
        safeModeOn: 'Safe Mode attivo — contenuti adatti a tutte le età',
        safeModeOff: 'Safe Mode disattivato',
        errSafeMode: 'Questa ricerca contiene termini non appropriati. Safe Mode è attivo per garantire contenuti adatti a tutte le età.',
        searching: 'Cerco nel database locale...',
        enriching: 'Arricchisco i risultati con il LLM...',
        verifyOnline: 'Verifica online',
        serverOffline: 'Il server Inspire non è raggiungibile. Assicurati che sia in esecuzione.',
    },
    en: {
        heroTitle: 'What inspires you today?',
        heroSub: 'Find books & movies that spark passion and curiosity',
        books: 'Books',
        movies: 'Movies',
        tagline: 'This is where I help you find the inspiration you were looking for',
        placeholder: 'e.g. Help me explain to my child why respecting the rules of a game matters\ne.g. I want to motivate myself to lose weight\ne.g. Find inspiration for a romantic trip',
        submit: 'Find Inspiration',
        connecting: 'Connecting...',
        connected: 'Connected',
        offline: 'Offline',
        noModels: 'No models',
        footer: 'Runs 100% locally. Your data never leaves your machine.',
        resultsTitle: 'Your Inspirations',
        loading: 'Generating personalized recommendations...',
        whyLabel: 'Why this inspires',
        howLabel: 'How to use it to inspire',
        errNoConnect: 'Ollama is not connected. Make sure it is running.',
        errNoInput: 'Please describe what you want to inspire.',
        errNoCat: 'Select a category: Books or Movies.',
        errParse: 'Could not parse AI response. Try again or switch model.',
        errNoResults: 'No recommendations generated. Try rephrasing your request.',
        verifying: 'Verifying that titles actually exist...',
        fetchingDetails: 'Fetching book details...',
        writingDescriptions: 'Writing descriptions...',
        verified: 'Verified',
        notVerified: 'Not verified',
        stop: 'Stop',
        loadMore: 'Discover more',
        bookmarksTitle: 'Your saved',
        bookmarksEmpty: 'No saved titles yet. Use the ♥ to save your favorites.',
        bookmarkSave: 'Save',
        bookmarkRemove: 'Remove',
        thumbsDown: 'Not relevant',
        safeModeOn: 'Safe Mode on — age-appropriate content only',
        safeModeOff: 'Safe Mode off',
        errSafeMode: 'This search contains inappropriate terms. Safe Mode is active to ensure age-appropriate content.',
        searching: 'Searching local database...',
        enriching: 'Enriching results with LLM...',
        verifyOnline: 'Verify online',
        serverOffline: 'Inspire server is not reachable. Make sure it is running.',
    }
};

function t(key) { return i18n[currentLang]?.[key] || i18n.en[key] || key; }

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function normalize(s) {
    return (s || '').toLowerCase().trim();
}

// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.getElementById('themeIcon').textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('inspire-theme', currentTheme);
}

(function restoreTheme() {
    const saved = localStorage.getItem('inspire-theme');
    if (saved === 'light') {
        currentTheme = 'light';
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();

// ═══════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════
function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('inspire-bookmarks') || '[]'); } catch { return []; }
}

function saveBookmarks(bk) {
    localStorage.setItem('inspire-bookmarks', JSON.stringify(bk));
    updateBookmarksBadge();
}

function toggleBookmark(title, author, year, type, why, how) {
    let bk = getBookmarks();
    const key = normalize(title);
    const idx = bk.findIndex(b => normalize(b.title) === key);
    if (idx >= 0) {
        bk.splice(idx, 1);
    } else {
        bk.push({ title, author, year, type, why, how, savedAt: Date.now() });
    }
    saveBookmarks(bk);
    if (allVerifiedResults.length > 0) {
        renderResults(allVerifiedResults.slice(0, visibleCount), visibleCount < allVerifiedResults.length && visibleCount < 9);
    }
    if (document.getElementById('bookmarksPanel').classList.contains('visible')) {
        renderBookmarksPanel();
    }
}

function isBookmarked(title) {
    return getBookmarks().some(b => normalize(b.title) === normalize(title));
}

function updateBookmarksBadge() {
    const count = getBookmarks().length;
    const badge = document.getElementById('bookmarksBadge');
    if (count > 0) {
        badge.style.display = 'flex';
        badge.textContent = count;
    } else {
        badge.style.display = 'none';
    }
}

function toggleBookmarksPanel() {
    bookmarksPanelOpen = !bookmarksPanelOpen;
    const panel = document.getElementById('bookmarksPanel');
    if (bookmarksPanelOpen) {
        panel.classList.add('visible');
        renderBookmarksPanel();
    } else {
        panel.classList.remove('visible');
    }
}

function renderBookmarksPanel() {
    const bk = getBookmarks();
    const content = document.getElementById('bookmarksContent');
    document.getElementById('bookmarksPanelTitle').textContent = t('bookmarksTitle');

    if (bk.length === 0) {
        content.innerHTML = `<div class="bookmarks-empty">${t('bookmarksEmpty')}</div>`;
        return;
    }

    const bookIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
    const movieIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4v4M10 4v4M14 4v4M18 4v4"/></svg>';

    let html = '';
    bk.forEach((item, i) => {
        const isBook = (item.type || '').toLowerCase().includes('book') || (item.type || '').toLowerCase().includes('libr');
        const badgeClass = isBook ? 'book' : 'movie';
        const typeLabel = isBook ? (currentLang === 'it' ? 'Libro' : 'Book') : (currentLang === 'it' ? 'Film' : 'Movie');
        const typeIconHtml = isBook ? bookIcon : movieIcon;

        html += `
            <div class="result-card" style="animation-delay:${i * 0.06}s">
                <div class="card-top">
                    <span class="type-badge ${badgeClass}">${typeIconHtml} ${typeLabel}</span>
                    <span class="card-meta">${esc(item.author || '')}${item.year ? '<br>' + item.year : ''}</span>
                </div>
                <div class="card-title">${esc(item.title)}</div>
                <div class="card-section">
                    <div class="section-label why">${t('whyLabel')}</div>
                    <div class="section-text">${esc(item.why || '')}</div>
                </div>
                <hr class="card-divider">
                <div class="card-section">
                    <div class="section-label how">${t('howLabel')}</div>
                    <div class="section-text">${esc(item.how || '')}</div>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn active-bookmark" onclick="bookmarkFromPanel(${i})">
                        ♥ ${t('bookmarkRemove')}
                    </button>
                </div>
            </div>
        `;
    });
    content.innerHTML = html;
}

function bookmarkFromPanel(idx) {
    const bk = getBookmarks();
    const item = bk[idx];
    if (!item) return;
    toggleBookmark(item.title, item.author || '', item.year || '', item.type || '', item.why || '', item.how || '');
}

updateBookmarksBadge();

// ═══════════════════════════════════════════
// LOADING PHRASES
// ═══════════════════════════════════════════
function startLoadingPhrases() {
    const phrases_it = [
        'Qwen sta analizzando la tua richiesta...',
        'Comprendo il contesto e i temi...',
        'Espando la ricerca con parole chiave correlate...',
        'Cerco tra migliaia di titoli...',
        'Analizzo connessioni tematiche...',
        'Seleziono i più rilevanti...',
        'Verifico che i titoli esistano davvero...',
        'Quasi pronto...'
    ];
    const phrases_en = [
        'Qwen is analyzing your request...',
        'Understanding context and themes...',
        'Expanding search with related keywords...',
        'Searching through thousands of titles...',
        'Analyzing thematic connections...',
        'Selecting the most relevant...',
        'Verifying titles actually exist...',
        'Almost ready...'
    ];
    const phrases = currentLang === 'it' ? phrases_it : phrases_en;
    let idx = 0;

    loadingPhraseInterval = setInterval(() => {
        idx = (idx + 1) % phrases.length;
        const el = document.getElementById('loadingText');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.textContent = phrases[idx];
                el.style.opacity = '1';
            }, 200);
        }
    }, 3000);
}

function stopLoadingPhrases() {
    if (loadingPhraseInterval) {
        clearInterval(loadingPhraseInterval);
        loadingPhraseInterval = null;
    }
}

// ═══════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════
function thumbsDown(title) {
    hiddenTitles.add(normalize(title));
    const filtered = allVerifiedResults.filter(r => !hiddenTitles.has(normalize(r.title)));
    allVerifiedResults = filtered;
    visibleCount = Math.min(visibleCount, filtered.length);
    if (visibleCount < 5 && filtered.length >= visibleCount) visibleCount = Math.min(5, filtered.length);
    renderResults(filtered.slice(0, visibleCount), visibleCount < filtered.length && visibleCount < 9);
}

// ═══════════════════════════════════════════
// SUBMIT / STOP TOGGLE
// ═══════════════════════════════════════════
function handleSubmitClick() {
    if (isGenerating) {
        stopGeneration();
    } else {
        getInspiration();
    }
}

function setButtonToStop() {
    isGenerating = true;
    const btn = document.getElementById('submitBtn');
    const label = document.getElementById('submitLabel');
    btn.classList.remove('loading');
    btn.classList.add('is-stop');
    btn.disabled = false;
    label.textContent = '■  ' + t('stop');
}

function setButtonToSubmit() {
    isGenerating = false;
    const btn = document.getElementById('submitBtn');
    const label = document.getElementById('submitLabel');
    btn.classList.remove('loading', 'is-stop');
    btn.disabled = false;
    label.textContent = t('submit');
}

function stopGeneration() {
    if (currentAbort) {
        currentAbort.abort();
        currentAbort = null;
    }
    stopLoadingPhrases();
    setButtonToSubmit();
    document.getElementById('results').innerHTML = '';
}

// ═══════════════════════════════════════════
// LANGUAGE SWITCH
// ═══════════════════════════════════════════
function switchLang(lang) {
    currentLang = lang;
    document.getElementById('heroTitle').textContent = t('heroTitle');
    document.getElementById('heroSub').textContent = t('heroSub');
    document.getElementById('catBooksLabel').textContent = t('books');
    document.getElementById('catMoviesLabel').textContent = t('movies');
    document.getElementById('promptInput').placeholder = t('placeholder');
    document.getElementById('submitLabel').textContent = t('submit');
    document.getElementById('footerText').textContent = t('footer');
    const dot = document.getElementById('statusDot');
    if (dot.classList.contains('connected')) {
        document.getElementById('statusText').textContent = t('connected');
    } else if (dot.classList.contains('checking')) {
        document.getElementById('statusText').textContent = t('connecting');
    } else {
        document.getElementById('statusText').textContent = t('offline');
    }
}

// ═══════════════════════════════════════════
// OS DETECTION
// ═══════════════════════════════════════════
function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';
    if (ua.includes('mac') || platform.includes('mac')) return 'mac';
    if (ua.includes('win') || platform.includes('win')) return 'windows';
    return 'linux';
}

function getOllamaDownloadUrl(os) {
    switch (os) {
        case 'mac': return 'https://ollama.com/download/mac';
        case 'windows': return 'https://ollama.com/download/windows';
        default: return 'https://ollama.com/download/linux';
    }
}

function getOSLabel(os) {
    switch (os) {
        case 'mac': return '🍎 macOS';
        case 'windows': return '🪟 Windows';
        default: return '🐧 Linux';
    }
}

// ═══════════════════════════════════════════
// SETUP WIZARD
// ═══════════════════════════════════════════
async function initSetup() {
    if (window.location.protocol === 'file:') {
        showFileProtocolError();
        return;
    }

    const serverOk = await checkInspireServer();
    if (!serverOk) {
        console.warn('Inspire server not reachable at', INSPIRE_SERVER);
    }

    const status = await probeOllama();
    if (status === 'ready') {
        document.getElementById('setupOverlay').classList.add('hidden');
        initMainApp();
        return;
    }

    const os = detectOS();
    document.getElementById('osBadge').textContent = getOSLabel(os);
    document.getElementById('downloadBtn').href = getOllamaDownloadUrl(os);

    if (status === 'running_no_models') {
        goToStep(3);
    } else {
        goToStep(1);
    }
    startSetupPolling();
}

function showFileProtocolError() {
    const os = detectOS();
    document.getElementById('osBadgeError').textContent = getOSLabel(os);
    document.querySelector('.steps-indicator').style.display = 'none';
    document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
    document.getElementById('stepFileError').classList.add('active');

    const instr = document.getElementById('launchInstructions');
    if (os === 'windows') {
        instr.innerHTML = `
            <div style="margin-bottom:8px;">1. Apri la cartella <strong style="color:var(--text);">Inspire</strong></div>
            <div style="margin-bottom:8px;">2. Fai doppio click su <code style="background:var(--bg);padding:2px 8px;border-radius:4px;color:var(--accent);font-weight:600;">start.bat</code></div>
            <div>3. Il browser si aprirà automaticamente</div>`;
    } else {
        instr.innerHTML = `
            <div style="margin-bottom:8px;">1. Apri il Terminale nella cartella <strong style="color:var(--text);">Inspire</strong></div>
            <div style="margin-bottom:8px;">2. Esegui: <code style="background:var(--bg);padding:2px 8px;border-radius:4px;color:var(--accent);font-weight:600;">./start.sh</code></div>
            <div>3. Il browser si aprirà automaticamente</div>`;
    }
}

async function probeOllama() {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        const models = data.models || [];
        if (models.length > 0) return 'ready';
        return 'running_no_models';
    } catch {
        return 'offline';
    }
}

function goToStep(n) {
    document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
    for (let i = 1; i <= 3; i++) {
        const num = document.getElementById(`sNum${i}`);
        num.classList.remove('active', 'done');
        if (i < n) { num.classList.add('done'); num.innerHTML = '✓'; }
        else if (i === n) { num.classList.add('active'); }
    }
    document.getElementById('sLine1').classList.toggle('done', n > 1);
    document.getElementById('sLine2').classList.toggle('done', n > 2);

    if (n <= 3) {
        document.getElementById(`step${n}`).classList.add('active');
    } else {
        for (let i = 1; i <= 3; i++) {
            const num = document.getElementById(`sNum${i}`);
            num.classList.remove('active'); num.classList.add('done'); num.innerHTML = '✓';
        }
        document.getElementById('sLine1').classList.add('done');
        document.getElementById('sLine2').classList.add('done');
        document.getElementById('stepDone').classList.add('active');
    }
}

function startSetupPolling() {
    if (setupPollingId) return;
    setupPollingId = setInterval(async () => {
        const status = await probeOllama();
        const currentStep = document.querySelector('.setup-step.active');
        if (!currentStep) return;
        const stepId = currentStep.id;

        if ((stepId === 'step1' || stepId === 'step2') && status === 'running_no_models') goToStep(3);
        if ((stepId === 'step1' || stepId === 'step2') && status === 'ready') { stopSetupPolling(); goToStep(4); }
        if (stepId === 'step3' && status === 'ready') { stopSetupPolling(); goToStep(4); }
    }, 3000);
}

function stopSetupPolling() {
    if (setupPollingId) { clearInterval(setupPollingId); setupPollingId = null; }
}

// ═══════════════════════════════════════════
// MODEL PULL
// ═══════════════════════════════════════════
async function startModelPull() {
    const pullBtn = document.getElementById('pullBtn');
    const pullProgress = document.getElementById('pullProgress');
    const pullBar = document.getElementById('pullBar');
    const pullText = document.getElementById('pullText');

    pullBtn.disabled = true;
    pullBtn.textContent = 'Download in corso...';
    pullProgress.style.display = 'block';
    pullBar.style.width = '0%';
    pullText.textContent = 'Avvio download...';

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: DEFAULT_MODEL, stream: true })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.total && json.completed) {
                        const pct = Math.round((json.completed / json.total) * 100);
                        pullBar.style.width = pct + '%';
                        const mbDone = (json.completed / 1e6).toFixed(0);
                        const mbTotal = (json.total / 1e6).toFixed(0);
                        pullText.textContent = `${json.status || 'Download'} — ${mbDone} MB / ${mbTotal} MB (${pct}%)`;
                    } else if (json.status) {
                        pullText.textContent = json.status;
                        if (json.status === 'success') pullBar.style.width = '100%';
                    }
                } catch {}
            }
        }

        pullBar.style.width = '100%';
        pullBar.style.background = 'var(--success)';
        pullText.textContent = 'Download completato!';
        pullBtn.textContent = 'Fatto!';

        setTimeout(() => { stopSetupPolling(); goToStep(4); }, 1200);
    } catch (err) {
        pullText.textContent = `Errore: ${err.message}. Assicurati che Ollama sia in esecuzione.`;
        pullBtn.disabled = false;
        pullBtn.textContent = 'Riprova Download';
    }
}

function finishSetup() {
    document.getElementById('setupOverlay').classList.add('hidden');
    stopSetupPolling();
    initMainApp();
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
function initMainApp() {
    checkConnection();
    setInterval(checkConnection, 30000);
}

async function checkConnection() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const select = document.getElementById('modelSelect');

    dot.className = 'dot checking';
    text.textContent = t('connecting');

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        const models = data.models || [];

        if (models.length === 0) {
            dot.className = 'dot';
            text.textContent = t('noModels');
            isConnected = false;
            return;
        }

        select.innerHTML = models.map(m =>
            `<option value="${m.name}">${m.name}</option>`
        ).join('');
        select.disabled = false;

        const preferred = ['qwen3.5:4b', 'qwen3.5', 'qwen', 'llama3.1', 'llama3.2', 'mistral', 'gemma2', 'deepseek-r1:14b', 'deepseek-r1:8b', 'deepseek-r1'];
        for (const p of preferred) {
            const match = models.find(m => m.name.startsWith(p));
            if (match) { select.value = match.name; break; }
        }

        dot.className = 'dot connected';
        text.textContent = t('connected');
        isConnected = true;

        const warmModel = select.value;
        if (warmModel) {
            fetch(`${OLLAMA_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: warmModel, messages: [{ role: 'user', content: 'hi' }], stream: false, think: false, options: { num_predict: 1 } })
            }).catch(() => {});
        }
    } catch (e) {
        dot.className = 'dot';
        text.textContent = t('offline');
        isConnected = false;
    }
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.add('visible');
}

function hideError() {
    document.getElementById('errorMsg').classList.remove('visible');
}

// ═══════════════════════════════════════════
// SAFE MODE
// ═══════════════════════════════════════════
(function restoreSafeMode() {
    const saved = localStorage.getItem('inspire-safemode');
    if (saved === 'false') safeMode = false;
})();

function toggleSafeMode() {
    safeMode = !safeMode;
    localStorage.setItem('inspire-safemode', safeMode);
    const icon = document.getElementById('safeModeIcon');
    if (icon) icon.textContent = safeMode ? '🛡️' : '🔓';
    const btn = document.getElementById('safeModeToggle');
    if (btn) btn.title = safeMode ? t('safeModeOn') : t('safeModeOff');
}

const BLOCKED_PATTERNS_IT = [
    /\b(porn|porno|pornograf|xxx|hentai|erotico|erotismo|sesso esplicito)\b/i,
    /\b(droga|drogarsi|cocaina|eroina|metanfetamina|crack)\b/i,
    /\b(suicid|autolesion|tagliarsi le vene)\b/i,
    /\b(armi da fuoco|come costruire|come fabbricare|esplosiv)\b/i,
    /\b(tortura|gore|snuff|violenza estrema|violenza grafica)\b/i,
];

const BLOCKED_PATTERNS_EN = [
    /\b(porn|pornograph|xxx|hentai|explicit sex|erotic)\b/i,
    /\b(drug use|cocaine|heroin|methamphetamine|crack)\b/i,
    /\b(suicid|self.harm|cutting yourself)\b/i,
    /\b(firearms|how to build|how to make|explosiv)\b/i,
    /\b(torture|gore|snuff|extreme violence|graphic violence)\b/i,
];

function checkSafeMode(input) {
    if (!safeMode) return true;
    const patterns = currentLang === 'it' ? BLOCKED_PATTERNS_IT : BLOCKED_PATTERNS_EN;
    for (const p of patterns) {
        if (p.test(input)) return false;
    }
    return true;
}

// ═══════════════════════════════════════════
// INSPIRE SERVER INTEGRATION
// ═══════════════════════════════════════════
async function checkInspireServer() {
    try {
        const res = await fetch(`${INSPIRE_SERVER}/api/health`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch { return false; }
}

// ═══════════════════════════════════════════
// MAIN ACTION
// ═══════════════════════════════════════════
async function getInspiration() {
    hideError();

    if (!isConnected) { showError(t('errNoConnect')); return; }

    const input = document.getElementById('promptInput').value.trim();
    if (!input) { showError(t('errNoInput')); return; }

    if (!checkSafeMode(input)) { showError(t('errSafeMode')); return; }

    const category = document.getElementById('catBooks').checked ? 'books' : 'movies';
    const resultsDiv = document.getElementById('results');

    setButtonToStop();
    hiddenTitles.clear();
    if (bookmarksPanelOpen) toggleBookmarksPanel();

    resultsDiv.innerHTML = `
        <div class="loading-indicator active">
            <div class="loading-spinner"></div>
            <p id="loadingText" style="transition:opacity 0.2s;">${t('searching')}</p>
        </div>
    `;
    startLoadingPhrases();

    try {
        if (currentAbort) currentAbort.abort();
        currentAbort = new AbortController();

        const searchPayload = {
            query: input,
            type: category === 'books' ? 'book' : category === 'movies' ? 'movie' : 'all',
            limit: 10,
            safe_mode: safeMode
        };

        const searchRes = await fetch(`${INSPIRE_SERVER}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchPayload),
            signal: currentAbort.signal
        });

        if (!searchRes.ok) {
            throw new Error(t('serverOffline'));
        }

        const searchData = await searchRes.json();
        let works = searchData.results || [];

        if (works.length === 0) {
            showError(t('errNoResults'));
            resultsDiv.innerHTML = '';
            return;
        }

        const finalResults = works.map(w => ({
            id: w.id,
            title: w.title_it || w.title_en || '',
            title_it: w.title_it || '',
            title_en: w.title_en || '',
            type: w.type || category.replace(/s$/, ''),
            author_or_director: w.creator || '',
            year: w.year || '',
            why: w.why || (currentLang === 'it' ? 'Un titolo rilevante per la tua ricerca.' : 'A relevant title.'),
            how: w.how || (currentLang === 'it' ? 'Scopri questa opera per lasciarti ispirare.' : 'Discover this work to get inspired.'),
            themes: w.themes || [],
            _confidence: w.badge || 'verified',
            _score: w.rrf_score || 0
        }));

        allVerifiedResults = finalResults;
        visibleCount = 5;

        const bannerDiv = document.getElementById('queryExpansionBanner');
        if (searchData.expanded_query) {
            const expanded = searchData.expanded_query.replace(input, '').trim();
            if (expanded.length > 10) {
                bannerDiv.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:0.82rem;color:var(--text-muted);line-height:1.5;">
                    <span style="color:var(--accent);font-weight:600;">🧠 Qwen ha interpretato:</span> ${esc(expanded.substring(0, 250))}${expanded.length > 250 ? '...' : ''}
                </div>`;
                bannerDiv.style.display = 'block';
            } else {
                bannerDiv.style.display = 'none';
            }
        } else {
            bannerDiv.style.display = 'none';
        }

        renderResults(allVerifiedResults.slice(0, visibleCount), allVerifiedResults.length > visibleCount);

        // Async: generate personalized inspire texts for top 3 results
        fetchInspireTexts(input, finalResults.slice(0, 3));
    } catch (err) {
        if (err.name === 'AbortError') return;
        showError(`Error: ${err.message}`);
        resultsDiv.innerHTML = '';
    } finally {
        stopLoadingPhrases();
        setButtonToSubmit();
    }
}

/**
 * Fetch personalized "how to inspire" texts from LLM (async, non-blocking).
 * Shows loading animation on top 3 cards, then swaps text with fade.
 */
async function fetchInspireTexts(query, topResults) {
    // Add loading state to top 3 how-text elements
    topResults.forEach(r => {
        const section = document.querySelector(`[data-how-id="${r.id}"]`);
        if (section) {
            const textEl = section.querySelector('.how-text');
            if (textEl) textEl.classList.add('loading');
        }
    });

    try {
        const payload = {
            query,
            results: topResults.map(r => ({
                id: r.id,
                title_it: r.title_it,
                title_en: r.title_en,
                year: r.year
            }))
        };

        const res = await fetch(`${INSPIRE_SERVER}/api/inspire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            removeLoadingState(topResults);
            return;
        }
        const data = await res.json();
        const inspireMap = data.inspire || {};

        // Update DOM elements with fade
        for (const [workId, text] of Object.entries(inspireMap)) {
            const section = document.querySelector(`[data-how-id="${workId}"]`);
            if (!section) continue;
            const textEl = section.querySelector('.how-text');
            if (!textEl) continue;

            // Update the data in allVerifiedResults too (for bookmarks)
            const resultItem = allVerifiedResults.find(r => String(r.id) === String(workId));
            if (resultItem) resultItem.how = text;

            // Fade out, swap text, fade in
            textEl.classList.remove('loading');
            textEl.style.opacity = '0';
            setTimeout(() => {
                textEl.textContent = text;
                textEl.style.opacity = '1';
            }, 300);
        }

        // Remove loading from any cards that didn't get a personalized text
        removeLoadingState(topResults);
    } catch (err) {
        console.warn('[inspire] Async update failed:', err.message);
        removeLoadingState(topResults);
    }
}

function removeLoadingState(topResults) {
    topResults.forEach(r => {
        const section = document.querySelector(`[data-how-id="${r.id}"]`);
        if (section) {
            const textEl = section.querySelector('.how-text');
            if (textEl) textEl.classList.remove('loading');
        }
    });
}

function loadMoreResults() {
    visibleCount = Math.min(visibleCount + 2, 9, allVerifiedResults.length);
    renderResults(allVerifiedResults.slice(0, visibleCount), visibleCount < allVerifiedResults.length && visibleCount < 9);
}

// ═══════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════
const ICONS = {
    book: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    movie: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4v4M10 4v4M14 4v4M18 4v4"/></svg>'
};

function renderResults(items, showLoadMore) {
    const resultsDiv = document.getElementById('results');
    _renderedItems = items;

    if (!items || items.length === 0) {
        resultsDiv.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:32px 0;">${t('errNoResults')}</p>`;
        return;
    }

    let html = `<div class="results-header">${t('resultsTitle')}</div>`;

    items.forEach((item, i) => {
        const isBook = (item.type || '').toLowerCase().includes('book') || (item.type || '').toLowerCase().includes('libr');
        const badgeClass = isBook ? 'book' : 'movie';
        const typeIcon = isBook ? ICONS.book : ICONS.movie;
        const typeLabel = isBook
            ? (currentLang === 'it' ? 'Libro' : 'Book')
            : (currentLang === 'it' ? 'Film' : 'Movie');

        const isSaved = isBookmarked(item.title);
        const heartClass = isSaved ? 'active-bookmark' : '';
        const heartLabel = isSaved ? t('bookmarkRemove') : t('bookmarkSave');

        html += `
            <div class="result-card" style="animation-delay:${i * 0.08}s">
                ${i === 0 ? '<div class="rank-badge">★ Top Match</div>' : `<div class="rank-badge" style="background:var(--surface);color:var(--text-muted);border:1px solid var(--border);">#${i + 1}</div>`}
                <div class="card-top">
                    <span class="type-badge ${badgeClass}">${typeIcon} ${typeLabel}</span>
                    <span class="card-meta">${esc(item.author_or_director || '')}${item.year ? '<br>' + item.year : ''}${item._confidence === 'verified' ? '<br><span class="verified-badge">✓ ' + t('verified') + '</span>' : item._confidence === 'verify_online' ? '<br><span class="verify-online-badge">⚠ ' + t('verifyOnline') + '</span>' : ''}</span>
                </div>
                <div class="card-title">${esc(item.title || 'Untitled')}</div>
                <div class="card-section">
                    <div class="section-label why">${t('whyLabel')}</div>
                    <div class="section-text">${esc(item.why || '')}</div>
                </div>
                <hr class="card-divider">
                <div class="card-section" data-how-id="${item.id || ''}">
                    <div class="section-label how">${t('howLabel')}</div>
                    <div class="section-text how-text">${esc(item.how || '')}</div>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn ${heartClass}" onclick="bookmarkFromCard(${i})">
                        ♥ ${heartLabel}
                    </button>
                    <span class="card-action-spacer"></span>
                    <button class="card-action-btn" onclick="thumbsDown(_renderedItems[${i}].title)">
                        👎 ${t('thumbsDown')}
                    </button>
                </div>
            </div>
        `;
    });

    if (showLoadMore) {
        html += `<button class="load-more-btn" onclick="loadMoreResults()">${t('loadMore')}</button>`;
    }

    resultsDiv.innerHTML = html;
}

function bookmarkFromCard(idx) {
    const item = _renderedItems[idx];
    if (!item) return;
    toggleBookmark(item.title, item.author_or_director || '', item.year || '', item.type || '', item.why || '', item.how || '');
}

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('themeIcon').textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    document.getElementById('safeModeIcon').textContent = safeMode ? '🛡️' : '🔓';
    document.getElementById('safeModeToggle').title = safeMode ? (i18n[currentLang]?.safeModeOn || 'Safe Mode on') : (i18n[currentLang]?.safeModeOff || 'Safe Mode off');

    document.getElementById('downloadBtn').addEventListener('click', () => {
        document.getElementById('waitingOllama').classList.add('active');
    });
    document.getElementById('alreadyInstalled').addEventListener('click', () => { goToStep(2); });

    document.getElementById('promptInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            getInspiration();
        }
    });

    localStorage.removeItem('inspire-history');
    initSetup();
});
