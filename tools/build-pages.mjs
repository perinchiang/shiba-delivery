import { build } from 'vite';

// Build split-asset distribution for GitHub Pages so index.html loads instantly
// and large 3D models/fonts stream in parallel with browser caching.
await build({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 4096,
  },
});
console.log('已生成 GitHub Pages 拆包版本 dist/');
