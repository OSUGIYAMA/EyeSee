// Minimal static server for previewing public/ without the full EyeSee server.
// usage: node tests/static.mjs [port]   →  http://localhost:5174/dev/models.html?model=heart
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use('/vendor/three', express.static(path.join(root, 'node_modules/three')));
app.use(express.static(path.join(root, 'public')));
const port = +(process.argv[2] || 5174);
app.listen(port, () => console.log(`static preview on http://localhost:${port}`));
