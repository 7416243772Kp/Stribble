
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.join(__dirname, 'public', 'js', 'lib');

// Ensure directory exists
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`Created directory: ${targetDir}`);
}

const files = [
    { 
        url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js', 
        path: path.join(targetDir, 'pdf.min.js') 
    },
    { 
        url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js', 
        path: path.join(targetDir, 'pdf.worker.min.js') 
    }
];

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url} to ${dest}...`);
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`✅ Success: ${path.basename(dest)}`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {}); // cleanup
            reject(err);
        });
    });
}

async function run() {
    try {
        await Promise.all(files.map(f => downloadFile(f.url, f.path)));
        console.log("All downloads complete.");
    } catch (error) {
        console.error("Download failed:", error);
    }
}

run();
