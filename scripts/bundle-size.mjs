import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'dist', 'textifylib.js');
const targetBytes = 20 * 1024;

const raw = readFileSync(file);
const gzip = gzipSync(raw);

const rawKb = (raw.length / 1024).toFixed(2);
const gzipKb = (gzip.length / 1024).toFixed(2);

console.log(`textifylib.js  ${rawKb} kB  gzip: ${gzipKb} kB`);

if (gzip.length > targetBytes) {
  console.error(`gzip size ${gzipKb} kB exceeds the ${targetBytes / 1024} kB target.`);
  process.exit(1);
}

console.log(`Bundle is within the ${targetBytes / 1024} kB gzip target.`);
