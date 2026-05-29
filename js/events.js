// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Events module — all DOM event listener wiring and bootstrap

window.GoA = window.GoA || {};

// ── Landing buttons ────────────────────────────────────────────────────────
GoA.$('btnHost').addEventListener('click', () => {
  const name = (GoA.$('nameInput').value || '').trim();
  if (!name) {
    GoA.$('nameInput').focus();
    GoA.$('nameInput').placeholder = 'Enter your name first!';
    return;
  }
  if (!GoA.myTeam) { GoA.toast('Select your team (Blue or Orange) first!'); return; }
  if (!GoA.myCharacter) { GoA.toast('Pick a character first!'); return; }
  GoA.setStatus('Creating room…');
  GoA.createRoom();
});

GoA.$('btnShowJoin').addEventListener('click', () => {
  const name = (GoA.$('nameInput').value || '').trim();
  if (!name) {
    GoA.$('nameInput').focus();
    GoA.$('nameInput').placeholder = 'Enter your name first!';
    return;
  }
  if (!GoA.myTeam) { GoA.toast('Select your team (Blue or Orange) first!'); return; }
  if (!GoA.myCharacter) { GoA.toast('Pick a character first!'); return; }
  GoA.$('landingMain').style.display = 'none';
  GoA.$('joinForm').style.display = 'flex';
  GoA.$('codeInput').focus();
});

GoA.$('btnPlayOnline').addEventListener('click', () => {
  GoA.$('landingMode').style.display = 'none';
  GoA.$('landingMain').style.display = 'flex';
});

GoA.$('btnBackToMode').addEventListener('click', () => {
  GoA.$('landingMain').style.display = 'none';
  GoA.$('landingMode').style.display = 'flex';
});

GoA.$('btnReconnect').addEventListener('click', GoA.doReconnect);

// Show reconnect button if a previous session is saved
GoA.updateReconnectButton();

// Persist last entered player name across visits
(function initLastName() {
  const el = GoA.$('nameInput');
  if (!el) return;
  try {
    const saved = (localStorage.getItem(GoA.LAST_NAME_KEY) || '').trim();
    if (saved) el.value = saved;
  } catch (_) {}
  el.addEventListener('input', () => {
    try { localStorage.setItem(GoA.LAST_NAME_KEY, (el.value || '').trim()); } catch (_) {}
  });
})();

// ── Offline mode ───────────────────────────────────────────────────────────
GoA.$('btnPlayOffline').addEventListener('click', () => {
  GoA.gameMode = 'offline';
  GoA.myId = GoA.genId();
  GoA.offlineTokenChoice = 'blue';
  GoA.offlinePlayers = [
    { id: GoA.genId(), name: '', team: 'blue', character: '' },
    { id: GoA.genId(), name: '', team: 'orange', character: '' },
  ];
  GoA.offlineInitIdx = 0;
  GoA.state = { phase: 'offline-setup', players: {}, turns: [], currentTurnIndex: 0,
    initiativeToken: 'blue', mixedTies: {}, reverseInitiative: false };
  GoA.$('statusBadge').textContent = 'offline';
  GoA.$('statusBadge').className = 'badge badge-offline';
  GoA.showApp();
  GoA.render();
});

GoA.$('btnAddOfflinePlayer').addEventListener('click', () => {
  GoA.offlinePlayers.push({ id: GoA.genId(), name: '', team: 'blue', character: '' });
  GoA.renderOfflineSetup();
});

GoA.$('btnOfflineTokenBlue').addEventListener('click', () => {
  GoA.offlineTokenChoice = 'blue';
  GoA.$('btnOfflineTokenBlue').classList.add('selected');
  GoA.$('btnOfflineTokenOrange').classList.remove('selected');
});

GoA.$('btnOfflineTokenOrange').addEventListener('click', () => {
  GoA.offlineTokenChoice = 'orange';
  GoA.$('btnOfflineTokenOrange').classList.add('selected');
  GoA.$('btnOfflineTokenBlue').classList.remove('selected');
});

GoA.$('btnStartOffline').addEventListener('click', () => {
  GoA.offlinePlayers = GoA.offlinePlayers.filter(p => p.name.trim());
  if (GoA.offlinePlayers.length < 1) { GoA.toast('Add at least one player first!'); return; }
  GoA.offlinePlayers.forEach(p => { p.initiative = undefined; });
  GoA.offlineInitIdx = 0;
  GoA.state.initiativeToken = GoA.offlineTokenChoice;
  GoA.state.phase = 'initiative';
  GoA.resetInitPad();
  GoA.render();
});

// ── Join session ───────────────────────────────────────────────────────────
GoA.$('btnCancelJoin').addEventListener('click', () => {
  GoA.$('joinForm').style.display = 'none';
  GoA.$('landingMain').style.display = 'flex';
  GoA.setStatus('');
});

function doJoin() {
  const code = GoA.$('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { GoA.$('codeInput').focus(); return; }
  GoA.joinGame(code);
}

GoA.$('btnJoin').addEventListener('click', doJoin);
GoA.$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
GoA.$('codeInput').addEventListener('input', () => {
  GoA.$('codeInput').value = GoA.$('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

GoA.$('btnCopyCode').addEventListener('click', () => {
  navigator.clipboard.writeText(GoA.sessionCode)
    .then(() => GoA.toast('Code copied!'))
    .catch(() => GoA.toast('Copy failed — select the code manually'));
});

// ── Game play ──────────────────────────────────────────────────────────────
GoA.$('btnStartGame').addEventListener('click', () => {
  GoA.sendAction('start_game', { initiativeToken: GoA.tokenChoice });
});

GoA.$('btnLeave').addEventListener('click', () => {
  try { GoA.saveReconnectData(); } catch (_) {}
  if (GoA.gameMode === 'player' && GoA.state.hostPlayerId === GoA.myId) {
    if (!confirm('Close room and remove it for all players?')) return;
    GoA.sendAction('close_room', {});
  }
  GoA.cleanup({ keepReconnect: true });
  GoA.showLanding();
});

// Host manage players panel
if (GoA.$('btnManagePlayers')) {
  GoA.$('btnManagePlayers').addEventListener('click', () => {
    GoA.$('hostManagePanel').style.display = 'block';
    GoA.renderPlayers('hostManageList', Object.values(GoA.state.players));
  });
}
if (GoA.$('btnCloseManage')) GoA.$('btnCloseManage').addEventListener('click', () => { GoA.$('hostManagePanel').style.display = 'none'; });
if (GoA.$('btnCloseManage2')) GoA.$('btnCloseManage2').addEventListener('click', () => { GoA.$('hostManagePanel').style.display = 'none'; });

// ── Team & token selection ─────────────────────────────────────────────────
GoA.$('btnTeamBlue').addEventListener('click', () => {
  GoA.myTeam = 'blue';
  GoA.$('btnTeamBlue').classList.add('selected');
  GoA.$('btnTeamOrange').classList.remove('selected');
});

GoA.$('btnTeamOrange').addEventListener('click', () => {
  GoA.myTeam = 'orange';
  GoA.$('btnTeamOrange').classList.add('selected');
  GoA.$('btnTeamBlue').classList.remove('selected');
});

GoA.$('btnTokenBlue').addEventListener('click', () => {
  GoA.tokenChoice = 'blue';
  GoA.$('btnTokenBlue').classList.add('selected');
  GoA.$('btnTokenOrange').classList.remove('selected');
});

GoA.$('btnTokenOrange').addEventListener('click', () => {
  GoA.tokenChoice = 'orange';
  GoA.$('btnTokenOrange').classList.add('selected');
  GoA.$('btnTokenBlue').classList.remove('selected');
});

// Any player (or offline) can flip the initiative token by clicking the token banner
const tokenBannerEl = GoA.$('tokenBanner');
if (tokenBannerEl) {
  tokenBannerEl.addEventListener('click', () => {
    if (GoA.gameMode === 'offline') {
      GoA.state.initiativeToken = GoA.state.initiativeToken === 'blue' ? 'orange' : 'blue';
      GoA.toast(GoA.state.initiativeToken === 'blue' ? '💎 Initiative token: Blue' : '🔥 Initiative token: Orange');
      GoA.render();
    } else if (GoA.gameMode === 'player') {
      GoA.sendAction('flip_token', {});
    }
  });
}

// ── Initiative pad buttons ────────────────────────────────────────────────
document.querySelectorAll('.pad-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (GoA.initLocked) return;
    if (GoA.initValue.length >= 2) return;
    const next = GoA.initValue + btn.dataset.val;
    if (+next > 99) return;
    GoA.initValue = next;
    GoA.updatePad();
  });
});

GoA.$('padBack').addEventListener('click', () => {
  if (GoA.initLocked) return;
  GoA.initValue = GoA.initValue.slice(0, -1);
  GoA.updatePad();
});

GoA.$('btnLock').addEventListener('click', () => {
  if (!GoA.initValue || GoA.initLocked) return;
  GoA.initLocked = true;
  document.querySelectorAll('.pad-btn').forEach(b => b.disabled = true);

  if (GoA.gameMode === 'offline') {
    // Store initiative for current offline player and advance
    if (GoA.$('abilityReverseTime').style.display !== 'none' && GoA.$('chkReverseTime').checked) {
      GoA.state.reverseInitiative = true;
    }
    GoA.offlinePlayers[GoA.offlineInitIdx].initiative = +GoA.initValue;
    GoA.offlineInitIdx++;
    if (GoA.offlineInitIdx >= GoA.offlinePlayers.length) {
      // All done — populate state.players and reveal turns
      GoA.state.players = {};
      GoA.offlinePlayers.forEach(p => {
        GoA.state.players[p.id] = {
          id: p.id, peerId: p.id, name: p.name, team: p.team, character: p.character || '',
          initiative: p.initiative, submissionStatus: 'locked', isConnected: true,
        };
      });
      GoA.revealTurns();
    } else {
      GoA.resetInitPad();
      GoA.render();
    }
    return;
  }
  GoA.$('btnLock').style.display = 'none';
  GoA.$('btnEdit').style.display = 'block';
  GoA.$('lockStatus').textContent = '✓ Locked in — waiting for others';
  const reverseTime = GoA.$('abilityReverseTime').style.display !== 'none' && GoA.$('chkReverseTime').checked;
  GoA.sendAction('lock_initiative', { playerId: GoA.myId, initiative: +GoA.initValue, reverseTime });
});

GoA.$('btnEdit').addEventListener('click', () => {
  GoA.initLocked = false;
  document.querySelectorAll('.pad-btn').forEach(b => b.disabled = false);
  GoA.$('btnLock').style.display = 'block';
  GoA.$('btnEdit').style.display = 'none';
  GoA.$('lockStatus').textContent = '';
  if (GoA.state.players[GoA.myId]) {
    GoA.state.players[GoA.myId] = { ...GoA.state.players[GoA.myId], submissionStatus: 'not-submitted' };
  }
  GoA.updatePad();
  GoA.render();
});

// ── Initiative password toggle (eye icon) ─────────────────────────────────
GoA.$('btnToggleInitiativeVis').addEventListener('mousedown', () => {
  GoA.initiativeShowPassword = true;
  const pwdField = GoA.$('initiativePasswordField');
  const displayEl = GoA.$('initiativeDisplay');
  // Update display with actual value before showing
  displayEl.textContent = GoA.initValue;
  displayEl.classList.remove('is-placeholder');
  pwdField.style.display = 'none';
  displayEl.style.display = 'block';
});

GoA.$('btnToggleInitiativeVis').addEventListener('mouseup', () => {
  GoA.initiativeShowPassword = false;
  const pwdField = GoA.$('initiativePasswordField');
  const displayEl = GoA.$('initiativeDisplay');
  pwdField.style.display = 'block';
  displayEl.style.display = 'none';
});

GoA.$('btnToggleInitiativeVis').addEventListener('mouseleave', () => {
  GoA.initiativeShowPassword = false;
  const pwdField = GoA.$('initiativePasswordField');
  const displayEl = GoA.$('initiativeDisplay');
  pwdField.style.display = 'block';
  displayEl.style.display = 'none';
});

// ── End turn / new round ───────────────────────────────────────────────────
GoA.$('btnEndTurn').addEventListener('click', () => {
  if (GoA.gameMode === 'offline') {
    GoA.endTurnOffline();
    return;
  }
  GoA.sendAction('end_turn', { playerId: GoA.myId });
});

GoA.$('btnNewRound').addEventListener('click', () => {
  if (GoA.gameMode === 'offline') {
    GoA.startNewRound();
    return;
  }
  GoA.sendAction('start_new_round', {});
});

// ── Character picker buttons ───────────────────────────────────────────────
GoA.$('btnPickChar').addEventListener('click', GoA.showCharPicker);
GoA.$('btnBackFromCharPick').addEventListener('click', GoA.hideCharPicker);

// ── Ability cancellation ───────────────────────────────────────────────────
GoA.$('btnCancelHurryUp').addEventListener('click', () => {
  GoA.$('hurryUpPanel').style.display = 'none';
});

GoA.$('btnCancelPoison').addEventListener('click', () => {
  GoA.$('poisonPanel').style.display = 'none';
});

GoA.$('btnCancelTakahide').addEventListener('click', () => {
  GoA.$('takahidePanel').style.display = 'none';
});

GoA.$('btnCancelTali').addEventListener('click', () => {
  GoA.$('taliPanel').style.display = 'none';
});

// ── Boot ────────────────────────────────────────────────────────────────────
GoA.showLanding();
