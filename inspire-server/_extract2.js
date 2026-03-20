const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const prebuild = path.join(process.env.TEMP, 'better-sqlite3-prebuild.tar.gz');
const bsDir = path.join(__dirname, 'node_modules', 'better-sqlite3');
const releaseDir = path.join(bsDir, 'build', 'Release');

fs.mkdirSync(releaseDir, { recursive: true });

// Read and decompress gzip
const gz = fs.readFileSync(prebuild);
const tar = zlib.gunzipSync(gz);

// Simple tar parser - find better_sqlite3.node
let offset = 0;
while (offset < tar.length - 512) {
    const header = tar.slice(offset, offset + 512);
    const name = header.slice(0, 100).toString('utf8').replace(/\0/g, '').trim();
    if (!name) break;
    
    const sizeOctal = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
    const size = parseInt(sizeOctal, 8) || 0;
    
    offset += 512; // skip header
    
    if (name.endsWith('better_sqlite3.node')) {
        const data = tar.slice(offset, offset + size);
        const outPath = path.join(releaseDir, 'better_sqlite3.node');
        fs.writeFileSync(outPath, data);
        console.log('Extracted: ' + outPath + ' (' + Math.round(size/1024) + ' KB)');
    }
    
    // Advance to next 512-byte boundary
    offset += Math.ceil(size / 512) * 512;
}

// Verify
const binPath = path.join(releaseDir, 'better_sqlite3.node');
if (fs.existsSync(binPath)) {
    const buf = fs.readFileSync(binPath);
    const isMZ = buf[0] === 0x4D && buf[1] === 0x5A;
    console.log('Valid Windows PE: ' + isMZ);
    console.log('Size: ' + Math.round(buf.length/1024) + ' KB');
} else {
    console.log('ERROR: binary not found after extraction');
}
