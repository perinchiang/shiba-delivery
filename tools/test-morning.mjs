#!/usr/bin/env node
/** Play one complete morning delivery using only the visible directions and physical keys.
 * node tools/test-morning.mjs [server-base-url] [optional-screenshot-directory]
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const url = new URL('./', process.argv[2] || 'http://127.0.0.1:5173/');
const output = process.argv[3];
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  if (output) {
    // Hold the live pose while Chrome takes a screenshot, even if the GPU is busy.
    await page.addInitScript(() => {
      const nativeFrame = window.requestAnimationFrame.bind(window);
      let previous, gameTime = performance.now(), remaining = Infinity;
      window.limitAnimation = ms => { remaining = ms; };
      window.animationHeld = () => remaining === 0;
      window.requestAnimationFrame = callback => nativeFrame(now => {
        if (now !== previous) {
          const dt = Math.min(now - (previous ?? now), 50, remaining);
          gameTime += dt;
          remaining -= dt;
          previous = now;
        }
        callback(gameTime);
      });
    });
  }
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', res => { if (res.status() >= 400) errors.push(res.status() + ' ' + res.url()); });
  await page.goto(url.href);
  await page.locator('#hud').waitFor({ state: 'visible' });
  const action = page.locator('#action');
  const keyFor = { '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown' };

  async function interact(label) {
    await action.getByText(label, { exact: true }).waitFor();
    await page.keyboard.press('e');
  }

  async function follow(reached) {
    const until = Date.now() + 25000;
    let held = '';
    try {
      while (Date.now() < until) {
        const hud = await page.evaluate(() => ({
          action: document.querySelector('#action').hidden ? '' : document.querySelector('#action-text').textContent,
          directions: document.querySelector('#directions').textContent,
        }));
        if (reached(hud)) return;
        const arrow = hud.directions.match(/[←→↑↓]/)?.[0];
        assert.ok(arrow, 'No direction on the waybill: ' + JSON.stringify(hud));
        const next = keyFor[arrow];
        if (next !== held) {
          if (held) await page.keyboard.up(held);
          await page.keyboard.down(next);
          held = next;
        }
        await page.waitForTimeout(55);
      }
      assert.fail('Destination not reached: ' + await page.locator('#phone-toggle').innerText());
    } finally {
      if (held) await page.keyboard.up(held);
    }
  }

  const shot = async name => {
    if (output) await page.screenshot({ path: join(output, name + '.png') });
  };
  async function sequenceShot(ms, name) {
    if (!output) return;
    await page.evaluate(t => window.limitAnimation(t), ms);
    try {
      await page.waitForFunction(() => window.animationHeld());
      assert.equal(await page.locator('#stage').getAttribute('aria-busy'), 'true');
      await shot(name);
    } finally {
      await page.evaluate(() => window.limitAnimation(Infinity));
    }
  }
  const walkTo = label => follow(hud => hud.action === label);
  async function rideToStop() {
    await page.keyboard.down('ArrowUp');
    try {
      await page.locator('#directions', { hasText: '靠边停车' }).waitFor();
      await page.keyboard.press('e');
    } finally { await page.keyboard.up('ArrowUp'); }
    await page.locator('#keys', { hasText: '步行' }).waitFor({ state: 'attached' });
  }

  await shot('01-street');
  await page.keyboard.press('v');
  await page.locator('#look[aria-pressed="true"]').waitFor();
  await shot('02-shiba');
  await page.keyboard.press('q');
  const phone = page.getByRole('dialog', { name: '骑手手机' });
  const task = page.locator('#phone-toggle');
  const originalTask = await task.elementHandle();
  await phone.waitFor();
  await shot('03-phone');
  await page.keyboard.press('Escape');
  assert.equal(await phone.isVisible(), false);
  assert.equal(await task.getAttribute('aria-expanded'), 'false');
  assert.equal(await action.isVisible(), false);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '接下第一单' }).click();
  await phone.waitFor({ state: 'hidden' });
  assert.equal(await task.locator('#order-kind').innerText(), '当前订单');
  assert.equal(await task.locator('#goal').innerText(), '便民药店');
  assert.equal(await page.evaluate(node => node === document.getElementById('phone-toggle'), originalTask), true);
  assert.equal(await page.locator('#phone-details').evaluate(node => node.inert), true);
  // Steer under throttle in each direction, then straighten using the street navigation.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(280);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => document.getElementById('directions').textContent.includes('向左转'));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => document.getElementById('directions').textContent.includes('沿街直行'));
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await shot('04-chase');
  await rideToStop();
  await walkTo('推门进店');
  await interact('推门进店');
  await page.locator('#place', { hasText: '药店内堂' }).waitFor({ state: 'attached' });
  await interact('推门出去');
  await page.locator('#look').waitFor();
  await walkTo('推门进店');
  await interact('推门进店');
  await page.locator('#place', { hasText: '药店内堂' }).waitFor({ state: 'attached' });
  await walkTo('找兔药师取件');
  await interact('找兔药师取件');
  await shot('05-pharmacy');
  await interact('收好药袋');
  assert.equal(await task.locator('#phase').innerText(), '去送达');
  await walkTo('推门出去');
  await interact('推门出去');
  await sequenceShot(1220, '06-exit');
  await page.locator('#look').waitFor();
  await walkTo('把药袋放进箱子');
  await interact('把药袋放进箱子');
  await sequenceShot(1760, '07-pack');
  await interact('骑上小摩托');
  await rideToStop();
  await walkTo('从箱里取药袋');
  await interact('从箱里取药袋');
  await page.locator('#look').waitFor();
  await walkTo('递给猫婆婆');
  await interact('递给猫婆婆');
  await interact('确认签收');
  assert.equal(await task.locator('#directions').innerText(), '实际到账 ¥0.10');
  await task.click();
  await phone.waitFor();
  assert.deepEqual(await phone.locator('dd').allTextContents(), ['+ ¥3.10', '− ¥3.00', '¥0.10']);
  await shot('08-payout');
  await page.getByRole('button', { name: '再跑一趟' }).click();
  await task.getByText('待接单', { exact: true }).waitFor();
  assert.equal(await page.locator('#clock').textContent(), '07:12');
  assert.equal(await phone.isVisible(), false);
  await task.click();
  await page.getByRole('button', { name: '换成包子单' }).click();
  await page.getByRole('button', { name: '接下包子单' }).click();
  assert.equal(await task.locator('#goal').innerText(), '榕记包子铺');
  // Walk from the starting bike to the actual storefront without using a scene jump.
  await interact('停车下车');
  await page.locator('#keys', { hasText: '步行' }).waitFor({ state: 'attached' });
  await page.locator('#look').waitFor();
  await walkTo('推门进店');
  await interact('推门进店');
  await page.locator('#place', { hasText: '包子铺内堂' }).waitFor({ state: 'attached' });
  await walkTo('找师傅取餐');
  await shot('09-bun-counter');
  await interact('找师傅取餐');
  assert.equal(await page.locator('#speaker').innerText(), '榕记师傅');
  await interact('接过包子');
  await walkTo('推门出去');
  await interact('推门出去');
  await page.locator('#look').waitFor();
  await walkTo('把餐袋放进箱子');
  await interact('把餐袋放进箱子');
  await interact('骑上小摩托');
  await rideToStop();
  await walkTo('从箱里取餐袋');
  await interact('从箱里取餐袋');
  await page.locator('#look').waitFor();
  await walkTo('递给猫婆婆');
  await interact('递给猫婆婆');
  await interact('确认签收');
  assert.equal(await task.locator('#phase').innerText(), '已签收');
  assert.deepEqual(errors, []);
  console.log('PASS: bun order, storefront entry, pickup, exit, stow and delivery.');
  console.log('PASS: phone, steering, braking, door/re-entry, pickup, stow, retrieve, payout and replay.');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await mobile.goto(url.href);
  await mobile.locator('#phone-toggle').tap();
  await mobile.locator('#phone-main').tap();
  const stick = await mobile.locator('#joystick').boundingBox();
  const button = await mobile.locator('#action').boundingBox();
  const leftThumb = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height * .18 };
  const rightThumb = { id: 2, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  const client = await mobile.context().newCDPSession(mobile);
  const touch = (type, touchPoints) => client.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [leftThumb]);
  await mobile.getByRole('button', { name: '减速停车' }).waitFor();
  // End only the second contact. Chrome can omit its native click while the
  // first finger is steering; the action must still brake and dismount once.
  await touch('touchStart', [leftThumb, rightThumb]);
  await touch('touchEnd', [rightThumb]);
  await mobile.locator('#stage[aria-busy="true"]').waitFor();
  assert.equal(await mobile.locator('.stick-thumb').evaluate(node => node.style.transform), '');
  await touch('touchEnd', [leftThumb]);
  await mobile.getByRole('button', { name: '骑上小摩托' }).waitFor();
  console.log('PASS: steering and tapping the action with two thumbs.');
  const scenes = mobile.locator('#scene-debug');
  if (await scenes.isVisible()) {
    async function jump(name) {
      await scenes.locator('summary').tap();
      await scenes.getByRole('button', { name, exact: true }).tap();
      assert.equal(await scenes.getAttribute('open'), null);
    }
    await jump('药店门口');
    await mobile.getByRole('button', { name: '推门进店' }).tap();
    // Interrupt the doorway animation and verify the next scene can act immediately.
    await jump('药店柜台');
    await mobile.getByRole('button', { name: '找兔药师取件' }).tap();
    await jump('猫婆婆家');
    await mobile.getByRole('button', { name: '递给猫婆婆' }).tap();
    await mobile.getByRole('button', { name: '确认签收' }).tap();
    await jump('包子铺门面');
    await jump('包子铺蒸笼');
    await jump('包子铺柜台');
    await mobile.getByRole('button', { name: '找师傅取餐' }).tap();
    await mobile.getByRole('button', { name: '接过包子' }).tap();
    assert.equal(await mobile.locator('#phone').getAttribute('data-phase'), 'delivery');
    await jump('老街起点');
    assert.equal(await mobile.locator('#phone').getAttribute('data-phase'), 'offer');
    console.log('PASS: all scene jumps, interrupted door, counter pickup and customer signature.');
  }
} finally {
  await browser.close();
}
