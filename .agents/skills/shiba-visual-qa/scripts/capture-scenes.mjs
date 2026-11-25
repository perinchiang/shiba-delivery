#!/usr/bin/env node
/**
 * capture-scenes.mjs — Unified Chrome Metal visual QA capturer for Shiba Delivery.
 *
 * Launches Chrome with Metal GPU (same setup as tools/test-morning.mjs), jumps to
 * registered ?scene=<id>&debug=1 views from src/morning/scene-debug.js, optionally
 * samples FPS & draw calls from #scene-perf, captures clean screenshots, collects
 * console/page/HTTP errors, and writes manifest.json + stamp.txt for hash freshness.
 *
 * Usage:
 *   node .agents/skills/shiba-visual-qa/scripts/capture-scenes.mjs [options]
 *
 * Options:
 *   --url <url>             Base URL (e.g. http://127.0.0.1:5173/ or GitHub Pages URL).
 *                           If omitted, starts a temporary local Vite server automatically.
 *   --scenes <id1,id2,...>  Comma-separated scene IDs from src/morning/scene-debug.js.
 *   --preset <name>         Preset group: smoke | street | city | country | buns | all
 *                           (default: smoke when neither --scenes nor --preset is given).
 *   --viewport <spec>       desktop (1280x800) | mobile (844x390 touch) | both | WxH
 *                           (default: desktop).
 *   --out <dir>             Output directory (default: output/qa/<timestamp>).
 *   --wait <ms>             Settle wait in ms after #hud appears (default: 700).
 *   --hold-ms <ms>          Freeze RAF clock after N ms (matches test-morning.mjs).
 *   --query "<k=v&k=v>"     Extra URL query parameters appended to each capture URL.
 *   --no-perf               Skip opening #scene-debug to sample FPS & draw calls.
 *   --stamp <f1,f2,...>     Comma-separated repo file paths to content-hash into stamp.txt.
 *   --list-presets          Print built-in scene presets and exit.
 *   -h, --help              Show this help.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const PRESETS = {
  smoke: ['haikazeHero', 'haikazeShopClose', 'haikazeStairs2F', 'coastalSlope'],
  haikaze: ['haikazeHero', 'haikazeShopClose', 'haikazeStairs2F', 'coastalSlope', 'seawall'],
  shiba: ['shibaFront', 'shibaRide'],
};
PRESETS.all = [...new Set(Object.values(PRESETS).flat())];

function parseArgs(argv) {
  const opts = {
    url: '',
    scenes: [],
    preset: '',
    viewport: 'desktop',
    out: '',
    wait: 700,
    holdMs: null,
    query: [],
    perf: true,
    stamp: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[++i];
    };
    if (a === '-h' || a === '--help') {
      console.log('Run with --scenes street,crossing [--viewport desktop|mobile|both|WxH] [--query "style=a&tod=dusk"] [--out output/qa/run] [--url <url>] [--stamp f1,f2]');
      process.exit(0);
    } else if (a === '--list-presets') {
      for (const [k, v] of Object.entries(PRESETS)) console.log(`${k}: ${v.join(',')}`);
      process.exit(0);
    } else if (a === '--url') opts.url = next();
    else if (a === '--scenes') opts.scenes.push(...next().split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--preset') opts.preset = next().trim();
    else if (a === '--viewport') opts.viewport = next().trim();
    else if (a === '--out') opts.out = next();
    else if (a === '--wait') opts.wait = Number(next());
    else if (a === '--hold-ms') opts.holdMs = Number(next());
    else if (a === '--query') opts.query.push(next());
    else if (a === '--no-perf') opts.perf = false;
    else if (a === '--stamp') opts.stamp.push(...next().split(',').map(s => s.trim()).filter(Boolean));
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (opts.preset) {
    if (!PRESETS[opts.preset]) throw new Error(`Unknown preset "${opts.preset}". Valid: ${Object.keys(PRESETS).join(', ')}`);
    opts.scenes.push(...PRESETS[opts.preset]);
  }
  if (opts.scenes.length === 0) opts.scenes = [...PRESETS.smoke];
  opts.scenes = [...new Set(opts.scenes)];
  if (!Number.isFinite(opts.wait) || opts.wait < 0) throw new Error('Invalid --wait');
  if (opts.holdMs !== null && (!Number.isFinite(opts.holdMs) || opts.holdMs < 0)) throw new Error('Invalid --hold-ms');
  return opts;
}

function resolveViewports(spec) {
  if (spec === 'desktop') return [{ name: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false }];
  if (spec === 'mobile') return [{ name: 'mobile', width: 844, height: 390, isMobile: true, hasTouch: true }];
  if (spec === 'both') return [...resolveViewports('desktop'), ...resolveViewports('mobile')];
  const m = /^(\d+)x(\d+)$/i.exec(spec);
  if (!m) throw new Error(`Invalid --viewport "${spec}". Use desktop, mobile, both, or WxH.`);
  return [{ name: `${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]), isMobile: false, hasTouch: false }];
}

function getFreePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

async function startLocalVite() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const viteBin = resolve('node_modules/.bin/vite');
  const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await waitForHttp(baseUrl);
  } catch (err) {
    child.kill('SIGTERM');
    throw new Error(`${err.message}\n${stderr}`);
  }
  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise(r => setTimeout(r, 300));
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    },
  };
}

function parsePerfText(text) {
  const fps = /(\d+)\s*FPS/i.exec(text);
  const calls = /(\d+)\s*draw\s*calls/i.exec(text);
  return {
    raw: text.trim(),
    fps: fps ? Number(fps[1]) : null,
    drawCalls: calls ? Number(calls[1]) : null,
  };
}

function computeStamps(files) {
  const out = {};
  for (const f of files) {
    const norm = f.replace(/\\/g, '/').replace(/^\.\//, '');
    const hash = execFileSync('git', ['hash-object', '--', norm], { encoding: 'utf8' }).trim();
    out[norm] = hash;
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const viewports = resolveViewports(opts.viewport);
const stampTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(opts.out || join('output', 'qa', stampTag));
await mkdir(outDir, { recursive: true });

let localServer = null;
let baseUrl = opts.url;
if (!baseUrl) {
  localServer = await startLocalVite();
  baseUrl = localServer.baseUrl;
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

const results = [];
let totalErrors = 0;

try {
  for (const vp of viewports) {
    for (let idx = 0; idx < opts.scenes.length; idx++) {
      const scene = opts.scenes[idx];
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      if (opts.holdMs !== null) {
        await page.addInitScript(() => {
          const nativeFrame = window.requestAnimationFrame.bind(window);
          let previous;
          let gameTime = performance.now();
          let remaining = Infinity;
          window.limitAnimation = ms => { remaining = ms; };
          window.animationHeld = () => remaining === 0;
          window.requestAnimationFrame = cb => nativeFrame(now => {
            if (now !== previous) {
              const dt = Math.min(now - (previous ?? now), 50, remaining);
              gameTime += dt;
              remaining -= dt;
              previous = now;
            }
            cb(gameTime);
          });
        });
      }

      const errors = [];
      page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
      page.on('response', res => { if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`); });

      const target = new URL(baseUrl);
      target.searchParams.set('debug', '1');
      target.searchParams.set('scene', scene);
      for (const raw of opts.query) {
        const extra = new URLSearchParams(raw.replace(/^\?/, ''));
        for (const [k, v] of extra.entries()) target.searchParams.set(k, v);
      }

      await page.goto(target.href, { waitUntil: 'domcontentloaded' });
      await page.locator('#hud').waitFor({ state: 'visible', timeout: 25000 });

      if (opts.holdMs !== null) {
        await page.evaluate(ms => window.limitAnimation(ms), opts.holdMs);
        await page.waitForFunction(() => window.animationHeld(), { timeout: 15000 });
      } else {
        await page.waitForTimeout(opts.wait);
      }

      let perf = null;
      if (opts.perf && opts.holdMs === null) {
        const panel = page.locator('#scene-debug');
        if (await panel.isVisible()) {
          await panel.locator('summary').click();
          try {
            await page.waitForFunction(
              () => /\d+\s*FPS/i.test(document.getElementById('scene-perf')?.textContent || ''),
              { timeout: 3000 },
            );
          } catch {}
          const text = await page.locator('#scene-perf').innerText();
          perf = parsePerfText(text);
          await panel.locator('summary').click();
          await page.waitForTimeout(120);
        }
      }

      const prefix = String(idx + 1).padStart(2, '0');
      const filename = viewports.length > 1 ? `${prefix}-${scene}-${vp.name}.png` : `${prefix}-${scene}.png`;
      const shotPath = join(outDir, filename);
      await page.screenshot({ path: shotPath });
      await page.close();

      totalErrors += errors.length;
      results.push({
        scene,
        viewport: `${vp.width}x${vp.height}`,
        mode: vp.name,
        url: target.href,
        screenshot: shotPath,
        perf,
        errors,
      });

      const perfStr = perf && perf.fps !== null ? `${perf.fps} FPS · ${perf.drawCalls} calls` : 'perf N/A';
      const errStr = errors.length ? `ERRORS=${errors.length}` : 'errors=0';
      console.log(`[${vp.name}] ${scene.padEnd(14)} -> ${filename} (${perfStr}, ${errStr})`);
    }
  }
} finally {
  await browser.close();
  if (localServer) await localServer.stop();
}

const stamps = opts.stamp.length ? computeStamps(opts.stamp) : {};
if (opts.stamp.length) {
  const lines = Object.entries(stamps).map(([p, h]) => `Content-Hash: ${p} ${h}`).join('\n') + '\n';
  await writeFile(join(outDir, 'stamp.txt'), lines, 'utf8');
}

const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  totalShots: results.length,
  totalErrors,
  stamps,
  results,
};
const manifestPath = join(outDir, 'manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nManifest: ${manifestPath}`);
if (totalErrors > 0) {
  console.error(`Visual QA captured ${totalErrors} runtime/HTTP error(s). Inspect manifest.json and screenshots.`);
  process.exit(1);
}
