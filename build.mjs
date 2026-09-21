import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const catalog = JSON.parse(read('src/catalog.json'));
const source = read('src/index.html').replace('/* APP_STYLES */', () => read('src/styles.css'))
  .replace('/* APP_DATA */', () => `globalThis.AI_CATALOG = ${JSON.stringify(catalog).replace(/</g, '\\u003c')};`)
  .replace('/* APP_ENGINE */', () => read('src/engine.js')).replace('/* APP_UI */', () => read('src/app.js'));
if (/\/\* APP_/.test(source)) throw new Error('Unresolved build marker');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), source);
fs.writeFileSync(path.join(root, 'Compute Compass.html'), source);
console.log(`Built self-contained offline app: ${Buffer.byteLength(source).toLocaleString()} bytes`);
