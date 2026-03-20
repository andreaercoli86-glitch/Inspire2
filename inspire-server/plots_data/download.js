const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const url = 'https://www.dropbox.com/s/24pa44w7u7wvtma/plots.zip?dl=1';
const dest = path.join(__dirname, 'plots.zip');

function download(url, dest, redirects) {
    redirects = redirects || 0;
    if (redirects > 5) { console.log('Too many redirects'); process.exit(1); }
    
    const proto = url.startsWith('https') ? https : http;
    console.log('Downloading: ' + url.substring(0, 80) + '...');
    
    proto.get(url, {headers: {'User-Agent': 'Mozilla/5.0'}}, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log('Redirect ' + res.statusCode + ' -> ' + res.headers.location.substring(0, 60) + '...');
            download(res.headers.location, dest, redirects + 1);
            return;
        }
        
        if (res.statusCode !== 200) {
            console.log('Error: HTTP ' + res.statusCode);
            process.exit(1);
        }
        
        const total = parseInt(res.headers['content-length'] || '0');
        console.log('Content-Length: ' + total + ' bytes (' + (total/1024/1024).toFixed(1) + ' MB)');
        
        const file = fs.createWriteStream(dest);
        let downloaded = 0;
        
        res.on('data', (chunk) => {
            downloaded += chunk.length;
            file.write(chunk);
            if (downloaded % (1024*1024*5) < chunk.length) {
                console.log('  ' + (downloaded/1024/1024).toFixed(1) + ' MB downloaded...');
            }
        });
        
        res.on('end', () => {
            file.end();
            console.log('Download complete: ' + (downloaded/1024/1024).toFixed(1) + ' MB');
        });
    }).on('error', (err) => {
        console.log('Error: ' + err.message);
        process.exit(1);
    });
}

download(url, dest);
