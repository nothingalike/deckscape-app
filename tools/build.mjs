import { build } from 'esbuild';
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import './dependency-notices.mjs';

await mkdir('dist/renderer', { recursive: true });
const theme = await postcss([tailwindcss()]).process(await readFile('src/renderer/theme.css', 'utf8'), {
  from: 'src/renderer/theme.css', to: 'dist/renderer/theme.css',
});
await writeFile('dist/renderer/theme.css', theme.css);
await copyFile('src/renderer/ui/LICENSE.shadcn.txt', 'dist/LICENSE.shadcn.txt');
await Promise.all([
  build({ entryPoints: ['src/main.ts', 'src/service.ts', 'src/preload.ts'], bundle: true,
    platform: 'node', format: 'cjs', outdir: 'dist', outExtension: { '.js': '.cjs' }, external: ['electron'], sourcemap: true }),
  build({ entryPoints: ['src/renderer/index.tsx'], bundle: true, platform: 'browser', format: 'esm',
    outfile: 'dist/renderer/renderer.js', jsx: 'automatic', sourcemap: true, minify: true,
    define: { 'process.env.NODE_ENV': '"production"' } }),
  copyFile('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('src/deckscape/public/simulator', 'dist/renderer/simulator', { recursive: true }),
]);
console.log('Built main, preload, local service, and renderer.');
