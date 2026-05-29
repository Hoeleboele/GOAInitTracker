const { test, expect, chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'Server');
const INDEX_HTML = path.join(ROOT, 'index.html');

function waitForStdout(proc, re, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout waiting for stdout')), timeout);
    const onData = (d) => {
      const s = String(d);
      if (re.test(s)) {
        clearTimeout(to);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        resolve(s);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
  });
}

test.describe('2-player online session', () => {
  let serverProc;

  test.beforeAll(async () => {
    serverProc = spawn('node', ['server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, ORIGIN: '*', PORT: '3000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForStdout(serverProc, /Server listening on port/ , 15000);
  });

  test.afterAll(async () => {
    if (serverProc && !serverProc.killed) serverProc.kill();
  });

  test('host and player join, run one round, then host closes room', async () => {
    const browser = await chromium.launch();

    // Host context
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    await host.goto(pathToFileURL(INDEX_HTML).href);
    // Ensure client connects to our local server
    await host.evaluate(() => { window.GoA = window.GoA || {}; GoA.SERVER_URL = 'http://localhost:3000'; });
    // Pick a character so the UI allows creating a room
    await host.evaluate(() => { GoA.myCharacter = 'hanu'; });

    // Create room as host
    await host.click('#btnPlayOnline');
    await host.fill('#nameInput', 'Host');
    await host.click('#btnTeamBlue');
    await host.click('#btnHost');
    await host.waitForSelector('#lobbyCode');
    const code = await host.$eval('#lobbyCode', el => el.textContent.trim());
    expect(code).toBeTruthy();

    // Player context
    const playerContext = await browser.newContext();
    const player = await playerContext.newPage();
    await player.goto(pathToFileURL(INDEX_HTML).href);
    await player.evaluate(() => { window.GoA = window.GoA || {}; GoA.SERVER_URL = 'http://localhost:3000'; });
    // Pick a character for the joining player
    await player.evaluate(() => { GoA.myCharacter = 'tali'; });

    // Player joins room
    await player.click('#btnPlayOnline');
    await player.fill('#nameInput', 'Player');
    await player.click('#btnTeamOrange');
    await player.click('#btnShowJoin');
    await player.fill('#codeInput', code);
    await player.click('#btnJoin');

    // Wait for host to see player in lobby
    await host.waitForFunction((name) => {
      const el = document.getElementById('lobbyPlayers');
      return el && el.textContent && el.textContent.indexOf(name) !== -1;
    }, 'Player', { timeout: 5000 });

    // Start the game as host
    await host.click('#btnStartGame');

    // Wait for initiative phase
    await host.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative', null, { timeout: 5000 });

    // Lock initiatives for both players via direct socket actions
    const hostId = await host.evaluate(() => GoA.myId);
    const playerId = await player.evaluate(() => GoA.myId);

    await host.evaluate(() => {
      GoA.socket.emit('game_action', { code: GoA.sessionCode, action: { type: 'lock_initiative', payload: { playerId: GoA.myId, initiative: 9 } } });
    });
    await player.evaluate(() => {
      GoA.socket.emit('game_action', { code: GoA.sessionCode, action: { type: 'lock_initiative', payload: { playerId: GoA.myId, initiative: 5 } } });
    });

    // Wait until turns are revealed (turns phase)
    await host.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'turns', null, { timeout: 5000 });

    // End each turn in order to finish the round
    const turns = await host.evaluate(() => (GoA.state.turns || []).map(t => (t.players || []).map(p => p.id)));
    // Flatten and call end_turn for each player id
    const ids = turns.flat();
    for (const id of ids) {
      await host.evaluate((pid) => {
        GoA.socket.emit('game_action', { code: GoA.sessionCode, action: { type: 'end_turn', payload: { playerId: pid } } });
      }, id);
    }

    // Wait for server to start a new round (phase -> 'initiative')
    await host.waitForFunction(() => window.GoA && window.GoA.state && window.GoA.state.phase === 'initiative', null, { timeout: 5000 });

    // Close the room as host
    await host.evaluate(() => GoA.sendAction('close_room', {}));

    // Host UI should return to landing (session closed)
    await host.waitForFunction(() => document.getElementById('landing') && document.getElementById('landing').style.display !== 'none', null, { timeout: 5000 });

    //await browser.close();
  });
});
