#!/usr/bin/env node
/** Smoke-play the Clean-Slate Rongwan Haikaze-so build in Chrome Metal (UI, map, orbit, order pickup, 0 errors).
 * node tools/test-morning.mjs [server-base-url]
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const url = new URL('./', process.argv[2] || 'http://127.0.0.1:5173/');
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', res => { if (res.status() >= 400) errors.push(res.status() + ' ' + res.url()); });

  await page.goto(url.href);
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 25000 });

  // 1) Open & close Rongwan Coastal Corner mini-map (M -> Esc)
  await page.keyboard.press('m');
  const map = page.getByRole('dialog', { name: '榕湾海风街角' });
  await map.waitFor({ state: 'visible' });
  assert.equal(await map.locator('#map-pickup').textContent(), '海风拉面');
  await page.keyboard.press('Escape');
  await map.waitFor({ state: 'hidden' });

  // 2) Toggle close-up & test 360-degree pointer orbit drag
  await page.keyboard.press('v');
  await page.locator('#look[aria-pressed="true"]').waitFor();
  const stage = page.locator('#stage');
  const beforeOrbit = await stage.screenshot();
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.44, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(160);
  const afterOrbit = await stage.screenshot();
  assert.notEqual(Buffer.compare(beforeOrbit, afterOrbit), 0, 'pointer drag orbits the camera');
  await page.keyboard.press('v');

  // 3) Expand rider phone & accept Haikaze Ramen 201 order
  await page.keyboard.press('q');
  await page.locator('#phone[data-expanded="true"]').waitFor();
  await page.locator('#phone-main').click();
  await page.locator('#phone[data-expanded="false"]').waitFor();
  await page.locator('#phase', { hasText: '去取拉面' }).waitFor();

  // 4) Dismount scooter with E -> enter walk mode
  await page.keyboard.press('e');
  await page.locator('#keys', { hasText: '步行' }).waitFor({ timeout: 10000 });

  assert.deepEqual(errors, [], 'zero console/page/HTTP errors during playtest');
  console.log('PASS: Chrome Metal playtest (Rongwan map, 360° orbit, phone order accept, dismount, 0 errors).');
} finally {
  await browser.close();
}
