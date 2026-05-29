const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

test('offline gameplay basic flow', async ({ page }) => {
  const fileUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  await page.goto(fileUrl);

  await page.click('#btnPlayOffline');

  // Populate two offline players
  await page.evaluate(() => {
    if (GoA.offlinePlayers && GoA.offlinePlayers.length >= 2) {
      GoA.offlinePlayers[0].name = 'Alice';
      GoA.offlinePlayers[1].name = 'Bob';
    }
  });

  await page.click('#btnStartOffline');

  // Enter initiatives for each offline player by setting GoA.initValue and locking
  await page.evaluate(() => { GoA.initValue = '10'; GoA.updatePad(); });
  await page.click('#btnLock');
  await page.waitForTimeout(100);
  await page.evaluate(() => { GoA.initValue = '12'; GoA.updatePad(); });
  await page.click('#btnLock');

  // Verify we entered the turns phase and there are turns
  const phase = await page.evaluate(() => GoA.state.phase);
  expect(phase).toBe('turns');
  const turnsLen = await page.evaluate(() => (GoA.state.turns || []).length);
  expect(turnsLen).toBeGreaterThan(0);

  // Advance one turn and verify currentTurnIndex increments
  const before = await page.evaluate(() => GoA.state.currentTurnIndex);
  await page.click('#btnEndTurn');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => GoA.state.currentTurnIndex);
  expect(after).toBeGreaterThan(before);
  await page.click('#btnEndTurn');

   // Enter initiatives for each offline player by setting GoA.initValue and locking
  await page.evaluate(() => { GoA.initValue = '10'; GoA.updatePad(); });
  await page.click('#btnLock');
  await page.waitForTimeout(100);
  await page.evaluate(() => { GoA.initValue = '12'; GoA.updatePad(); });
  await page.click('#btnLock');
});
