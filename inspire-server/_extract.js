const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const os = require('os');
const prebuild = path.join(os.tmpdir(), 'better-sqlite3-prebuild.tar.gz');
const targetDir = path.join(__dirname, 'node_modules', 'better-sqlite3');
const buildDir = path.join(targetDir, 'build', 'Release');

// Create build/Release if not exists
fs.mkdirSync(buildDir, { recursive: true });

// Extract tar.gz - the prebuild contains build/Release/better_sqlite3.node
try {
    execSync('tar xzf "' + prebuild + '" -C "' + targetDir + '"', { stdio: 'inherit' });
    console.log('Extracted to:', targetDir);
    
    // Check if the binary exists
    const binPath = path.join(buildDir, 'better_sqlite3.node');
    if (fs.existsSync(binPath)) {
        const stats = fs.statSync(binPath);
        console.log('Binary OK:', Math.round(stats.size/1024), 'KB');
    } else {
        // Maybe it extracted to a subfolder
        const files = execSync('dir /s /b "' + targetDir + '\\\\*.node"').toString();
        console.log('Found .node files:', files);
    }
} catch(e) {
    console.error('Error:', e.message);
}
