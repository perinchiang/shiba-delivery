import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';

// Package the game as a single HTML file that can also open directly from disk.
const { output } = await build({
  base: './',
  build: {
    target: 'es2022',
    write: false,
    modulePreload: false,
    assetsInlineLimit: () => true,
  },
});
const scripts = output.filter(file => file.type === 'chunk');
const styles = output.filter(file => file.fileName.endsWith('.css'));
assert.equal(scripts.length, 1);
assert.equal(styles.length, 1);

const entry = output.find(file => file.fileName === 'index.html').source;
const scriptTag = /<script\b[^>]*type="module"[^>]*src="[^"]+"[^>]*><\/script>/;
const styleTag = /<link\b[^>]*rel="stylesheet"[^>]*>/;
assert.match(entry, scriptTag);
assert.match(entry, styleTag);

const notices = await Promise.all([
  ['Three.js', 'node_modules/three/LICENSE'],
  ['Animal Island UI', 'node_modules/animal-island-ui/LICENSE'],
  ['React, React DOM and Scheduler', 'node_modules/react/LICENSE'],
  ['classnames', 'node_modules/classnames/LICENSE'],
  ['Noto Sans SC', 'src/morning/fonts/OFL-NotoSansSC.txt'],
].map(async ([name, path]) => name + '\n' + (await readFile(path, 'utf8')).trim()));
const js = scripts[0].code.replace(/<\/script/gi, '<\\/script');
const html = entry
  .replace(scriptTag, () => '<script type="module">' + js + '</script>')
  .replace(styleTag, () => '<style>' + styles[0].source + '</style>')
  .replace('</head>', () => '<!--\n' + notices.join('\n\n') + '\n-->\n</head>');

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log('已生成单文件试玩 dist/index.html');
