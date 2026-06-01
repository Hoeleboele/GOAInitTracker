const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

test('debug offline setup', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  const fileUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  
  // Manually call render to see what happens
  const renderTest = await page.evaluate(() => {
    console.log('About to call render()...');
    try {
      window.GoA.render();
      console.log('render() completed successfully');
    } catch(e) {
      console.log('ERROR in render():', e.message, e.stack);
    }
    const view = window.GoA.$('viewOfflineSetup');
    console.log('View display after manual render():', view.style.display);
    return { display: view.style.display };
  });
  
  console.log('Manual render result:', renderTest);
  
  // Now test with the button click
  console.log('\n=== Testing with button click ===');
  
  // Set up error handler
  await page.evaluate(() => {
    window.testErrors = [];
    window.onerror = (msg, url, line, col, err) => {
      window.testErrors.push({ msg, line, col, err: err?.message });
      console.log('WINDOW ERROR:', msg, 'at line', line);
    };
  });
  
  await page.click('#btnPlayOffline');
  await page.waitForTimeout(100);
  
  // Check for errors and state
  const result = await page.evaluate(() => {
    const view = window.GoA.$('viewOfflineSetup');
    return { 
      phase: window.GoA.state.phase,
      display: view.style.display,
      errors: window.testErrors || []
    };
  });
  
  console.log('After button click:', result);
  expect(result.phase).toBe('offline-setup');
  expect(result.display).toBe('block');
});



