import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-server');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await build({
  entryPoints: [path.join(rootDir, 'server.ts')],
  outfile: path.join(outDir, 'server.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  external: ['vite', 'fsevents', 'bufferutil', 'utf-8-validate'],
  logOverride: {
    'empty-import-meta': 'silent',
  },
});

console.log('Successfully bundled server.ts -> dist-server/server.cjs');
