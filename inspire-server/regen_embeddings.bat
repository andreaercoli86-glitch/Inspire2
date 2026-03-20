@echo off
cd /d "%~dp0"
echo Starting embedding regeneration at %date% %time% > regen_embeddings.log
node -e "const g = require('./build/generate-embeddings'); g.generateAll().then(r => { console.log('Done:', JSON.stringify(r)); process.exit(0); }).catch(e => { console.error('Error:', e.message); process.exit(1); })" >> regen_embeddings.log 2>&1
echo Finished at %date% %time% >> regen_embeddings.log
