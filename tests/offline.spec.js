const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

test('offline gameplay basic flow', async ({ page }) => {
  const fileUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Wait for GoA to be available on page
  await page.waitForFunction(() => window.GoA && window.GoA.state, { timeout: 5000 });

  // Click play offline button
  await page.click('#btnPlayOffline');

  // Wait for offline setup view to be visible (not just exist, but display: block)
  await page.waitForFunction(() => {
    const el = document.getElementById('viewOfflineSetup');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });

  // Populate two offline players
  await page.evaluate(() => {
    if (GoA.offlinePlayers && GoA.offlinePlayers.length >= 2) {
      GoA.offlinePlayers[0].name = 'Alice';
      GoA.offlinePlayers[1].name = 'Bob';
    }
  });

  await page.click('#btnStartOffline');

  // Wait for initiative phase - check that phase changed and lock button is visible
  await page.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative', { timeout: 5000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('btnLock');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });

  // Enter initiatives for each offline player by setting GoA.initValue and locking
  await page.evaluate(() => { GoA.initValue = '10'; GoA.updatePad(); });
  await page.click('#btnLock');
  await page.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative' && window.GoA.offlineInitIdx === 1, { timeout: 5000 });
  await page.evaluate(() => { GoA.initValue = '12'; GoA.updatePad(); });
  await page.click('#btnLock');

  // Verify we entered the turns phase and there are turns
  await page.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'turns', { timeout: 5000 });
  const phase = await page.evaluate(() => GoA.state.phase);
  expect(phase).toBe('turns');
  const turnsLen = await page.evaluate(() => (GoA.state.turns || []).length);
  expect(turnsLen).toBeGreaterThan(0);

  // Advance one turn and verify currentTurnIndex increments
  const before = await page.evaluate(() => GoA.state.currentTurnIndex);
  await page.waitForFunction(() => {
    const el = document.getElementById('btnEndTurn');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });
  await page.click('#btnEndTurn');
  await page.waitForFunction((expectedValue) => window.GoA && window.GoA.state && window.GoA.state.currentTurnIndex > expectedValue, before, { timeout: 5000 });
  const after = await page.evaluate(() => GoA.state.currentTurnIndex);
  expect(after).toBeGreaterThan(before);
  
  // Continue with another turn
  await page.waitForFunction(() => {
    const el = document.getElementById('btnEndTurn');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });
  await page.click('#btnEndTurn');

   // Wait for phase to return to initiative for next round
  await page.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative', { timeout: 5000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('btnLock');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });

  // Enter initiatives for each offline player by setting GoA.initValue and locking
  await page.evaluate(() => { GoA.initValue = '10'; GoA.updatePad(); });
  await page.click('#btnLock');
  await page.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative' && window.GoA.offlineInitIdx === 1, { timeout: 5000 });
  await page.evaluate(() => { GoA.initValue = '12'; GoA.updatePad(); });
  await page.click('#btnLock');
});
