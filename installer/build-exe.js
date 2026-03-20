#!/usr/bin/env node
/**
 * Inspire v2 — Build standalone .exe via nexe
 *
 * Prerequisites:
 *   npm install -g nexe
 *
 * Usage:
 *   node build-exe.js
 *
 * Output:
 *   installer/bin/inspire-server.exe
 */

const { compile } = require('nexe');
const path = require('path');

async function build() {
    console.log('🔨 Building inspire-server.exe...\n');

    await compile({
        input: path.join(__dirname, '..', 'inspire-server', 'server.js'),
        output: path.join(__dirname, 'bin', 'inspire-server'),
        target: 'windows-x64-18.18.0', // Node.js 18 LTS
        resources: [
            path.join(__dirname, '..', 'inspire-server', '*.js'),
            path.join(__dirname, '..', 'index.html'),
            path.join(__dirname, '..', 'welcome.html'),
        ],
        // native modules (better-sqlite3, sqlite-vec) need to be alongside .exe
        // They cannot be embedded — document this for the build process
    });

    console.log('\n✅ Build completato: installer/bin/inspire-server.exe');
    console.log('');
    console.log('⚠  NOTA: I moduli nativi (better-sqlite3, sqlite-vec) devono');
    console.log('   essere copiati nella cartella bin/ insieme all\'eseguibile.');
    console.log('   Esegui: npm run build:native-copy per copiarli.');
}

build().catch(err => {
    console.error('❌ Build fallito:', err.message);
    process.exit(1);
});
