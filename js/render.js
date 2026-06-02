// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Render module — all DOM rendering functions

window.GoA = window.GoA || {};
// Track cycling intervals for mixed slot icons
GoA.mixedIconCycles = {};
// ── Main render dispatcher ────────────────────────────────────────────────
GoA.render = function() {
  const players = Object.values(GoA.state.players);
  var isHost = GoA.gameMode === 'offline' || GoA.state.hostPlayerId === GoA.myId;
  if (GoA.gameMode === 'offline') {
    GoA.$('btnLeave').textContent = 'Quit';
  } else {
    GoA.$('btnLeave').textContent = isHost ? 'Close Room' : 'Leave';
  }
  const managePlyBtn = GoA.$('btnManagePlayers');
  if (managePlyBtn) managePlyBtn.style.display = isHost ? '' : 'none';

  // Token banner — visible whenever a game is in progress
  const tb = GoA.$('tokenBanner');
  const tok = GoA.state.initiativeToken || 'blue';
  if (GoA.state.phase !== 'lobby' && GoA.state.phase !== 'offline-setup') {
    tb.className = `token-banner ${tok}`;
    tb.textContent = tok === 'blue' ? '💎 Blue has the initiative token' : '🔥 Orange has the initiative token';
    tb.style.display = 'block';
  } else {
    tb.style.display = 'none';
  }

  switch (GoA.state.phase) {
    case 'offline-setup':
      GoA.show('viewOfflineSetup');
      GoA.renderOfflineSetup();
      break;

    case 'lobby':
      GoA.show('viewLobbyHost');
      GoA.$('lobbyCode').textContent = GoA.sessionCode;
      GoA.renderPlayers('lobbyPlayers', players);
      {
        const others = players.filter(p => p.id !== GoA.myId && p.isConnected);
        GoA.$('btnStartGame').style.display = isHost ? '' : 'none';
        GoA.$('btnStartGame').disabled = others.length === 0;
        GoA.$('hostTokenSection').style.display = isHost ? '' : 'none';
        GoA.$('hostEndTurnSection').style.display = isHost ? '' : 'none';
        GoA.$('startHint').textContent = others.length === 0
          ? 'Waiting for players to join…'
          : `${others.length} player${others.length !== 1 ? 's' : ''} ready — start when ready!`;
      }
      break;

    case 'initiative':
      GoA.show('viewInitiative');
      GoA.applyCharacterTheme();
      GoA.updatePad();
      if (GoA.gameMode === 'offline') {
        const op = GoA.offlinePlayers[GoA.offlineInitIdx];
        GoA.$('offlineInitFor').innerHTML = op
          ? `<span class="team-dot ${op.team}"></span> <strong>${GoA.esc(op.name)}</strong>  ·  <span style="font-size:13px">${GoA.offlineInitIdx + 1} / ${GoA.offlinePlayers.length}</span>`
          : '';
        GoA.$('offlineInitFor').style.display = 'block';
        GoA.$('initiativePlayers').style.display = 'none';
        const offlineEmmit = op && op.character === 'emmit';
        GoA.$('abilityReverseTime').style.display = offlineEmmit ? 'block' : 'none';
      } else {
        GoA.$('offlineInitFor').style.display = 'none';
        GoA.$('initiativePlayers').style.display = '';
        GoA.renderPlayers('initiativePlayers', players);
        const showRevTime = GoA.myCharacter === 'emmit';
        GoA.$('abilityReverseTime').style.display = showRevTime ? 'block' : 'none';
      }
      break;

    case 'turns':
      GoA.show('viewTurns');
      GoA.renderTurnList('turnsList');
      GoA.renderAbilities();
      // Show kill button only for host in turns phase
      GoA.$('btnKillPlayers').style.display = isHost ? '' : 'none';
      break;

    case 'round-complete':
      GoA.show('viewRoundComplete');
      GoA.renderTurnList('roundSummary');
      GoA.$('abilityPanel').style.display = 'none';
      GoA.$('hurryUpPanel').style.display = 'none';
      GoA.$('btnNewRound').style.display = 'block';
      break;
  }
  
  // Update phase tracker for next render (used to detect phase transitions)
  GoA.previousPhase = GoA.state.phase;
};

// ── Render players list ────────────────────────────────────────────────────
GoA.renderPlayers = function(containerId, players) {
  const el = GoA.$(containerId);
  if (!players.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:8px 0;">No players yet…</div>';
    return;
  }
  var isHost = GoA.gameMode === 'offline' || GoA.state.hostPlayerId === GoA.myId;
  const canKill = GoA.state.phase === 'turns' && isHost;
  el.innerHTML = players.map(p => {
    const isMe = p.id === GoA.myId;
    const disc = !p.isConnected;
    const statusClass = disc ? 'pstatus-disconnected'
      : p.submissionStatus === 'locked' ? 'pstatus-locked'
        : p.submissionStatus === 'submitted' ? 'pstatus-submitted'
          : 'pstatus-waiting';
    let statusText = '';
    if (disc) {
      let prefix = '';
      if (p.disconnectedAt) {
        const remaining = GoA.DISCONNECT_GRACE_MS - (Date.now() - p.disconnectedAt);
        if (remaining > 0) prefix = `(${GoA.formatMs(remaining)}) `;
      }
      statusText = `${prefix}Disconnected`;
    } else if (p.submissionStatus === 'locked') {
      statusText = 'Locked ✓';
    } else if (p.submissionStatus === 'submitted') {
      statusText = 'Entered…';
    } else {
      statusText = 'Waiting…';
    }
    const teamDot = p.team ? `<span class="team-dot ${p.team}"></span>` : '';
    const charTag = p.character ? `<span class="char-badge">· ${GoA.charLabel(p.character)}</span>` : '';
    const iconSrc = p.character ? GoA.charIconPath(p.character) : 'CharacterIcons/_placeholder.svg';
    return `
      <div class="player-row${isMe ? ' is-me' : ''}">
        <div class="char-icon-col"><img class="char-icon" src="${iconSrc}" alt="" onerror="this.src='CharacterIcons/_placeholder.svg'"></div>
        <span class="player-name">
          ${teamDot}${GoA.esc(p.name)}${charTag}${isMe ? '<span class="me-tag">(you)</span>' : ''}
        </span>
        <span class="pstatus ${statusClass}">${statusText}</span>
        ${canKill && !isMe ? `<button class="btn btn-sm btn-ghost btn-kill-player" data-id="${p.id}" title="Remove from this round">✖</button>` : ''}
      </div>`;
  }).join('');

  // Manage a periodic re-render while any disconnected players remain within the grace window
  const now = Date.now();
  const needsTimer = Object.values(GoA.state.players).some(pp => pp.disconnectedAt && (now - pp.disconnectedAt) < GoA.DISCONNECT_GRACE_MS);
  if (needsTimer && !GoA.disconnectTimer) {
    GoA.disconnectTimer = setInterval(() => { try { GoA.render(); } catch (_) {} }, 1000);
  } else if (!needsTimer && GoA.disconnectTimer) {
    clearInterval(GoA.disconnectTimer);
    GoA.disconnectTimer = null;
  }

  // Wire kill buttons for host/offline host
  if (canKill) {
    el.querySelectorAll('.btn-kill-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        const name = (GoA.state.players[id] && GoA.state.players[id].name) || 'Player';
        if (!confirm(`Remove ${name} from this round?`)) return;
        if (GoA.gameMode === 'offline') {
          GoA.killPlayerThisRound(id);
        } else {
          GoA.sendAction('kill_player', { targetId: id });
        }
      });
    });
  }
};

// ── Turn notification (sound + vibration) ──────────────────────────────
GoA.notifyMyTurn = function() {
  // Double-beep using Web Audio API (no external files needed)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch (_) {}
  // Haptic feedback on supported devices (Android Chrome)
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
};

// ── Render turn list ───────────────────────────────────────────────────────
GoA.renderTurnList = function(containerId) {
  const el = GoA.$(containerId);
  if (!GoA.state.turns.length) { el.innerHTML = ''; return; }

  el.innerHTML = GoA.state.turns.map(t => {
    const cls = t.status === 'active' ? ' active' : t.status === 'completed' ? ' completed' : '';
    const players = t.players || [];
    const isMixedSlot = !!t.mixedTieSlot;
    const isSimul = !isMixedSlot && players.length > 1;
    const teamCls = isMixedSlot ? ` team-${t.teamTurn}`
      : (players[0] && players[0].team) ? ` team-${players[0].team}` : '';

    // Resolve primary character avatar for the ghost background
    const getAvatar = id => { const c = GoA.state.players[id]; return c && c.character ? GoA.charAvatarPath(c.character) : ''; };
    const getIcon = id => { const c = GoA.state.players[id]; return c && c.character ? GoA.charIconPath(c.character) : 'CharacterIcons/_placeholder.svg'; };
    let bgAvatar = '';
    if (isMixedSlot) {
      const tie = GoA.state.mixedTies && GoA.state.mixedTies[t.initiative];
      const pool = tie && tie[`${t.teamTurn}Pool`];
      bgAvatar = pool && pool[0] ? getAvatar(pool[0].id) : '';
    } else if (players.length > 0) {
      bgAvatar = getAvatar(players[0].id);
    }
    const avatarAttr = bgAvatar ? ` style="--avatar-url: url('${bgAvatar}')"` : '';

    // Build the character icon column
    const PLACEHOLDER = 'CharacterIcons/_placeholder.svg';
    const iconImg = (src) => `<img class="char-icon" src="${src}" alt="" onerror="this.src='${PLACEHOLDER}'">`;
    const stackedIconImg = (src) => `<img class="char-icon char-icon-stacked" src="${src}" alt="" onerror="this.src='${PLACEHOLDER}'">`;
    let iconColHtml;
    if (isMixedSlot) {
      const tie2 = GoA.state.mixedTies && GoA.state.mixedTies[t.initiative];
      const pool2 = tie2 && tie2[`${t.teamTurn}Pool`];
      const src = pool2 && pool2[0] ? getIcon(pool2[0].id) : PLACEHOLDER;
      const mixedIconId = `mixed-icon-${t.initiative}-${t.teamTurn}`;
      iconColHtml = `<div class="char-icon-col"><div id="${mixedIconId}">${iconImg(src)}</div></div>`;
    } else if (players.length > 1) {
      const MAX_VISIBLE = 3;
      const toShow = players.length > MAX_VISIBLE ? players.slice(0, MAX_VISIBLE - 1) : players;
      const overflowCount = players.length > MAX_VISIBLE ? players.length - (MAX_VISIBLE - 1) : 0;
      let stackItems = toShow.map(p => stackedIconImg(getIcon(p.id))).join('');
      if (overflowCount > 0) stackItems += `<span class="icon-overflow-badge">+${overflowCount}</span>`;
      iconColHtml = `<div class="char-icon-col char-icon-col--stack"><div class="char-icon-stack">${stackItems}</div></div>`;
    } else {
      const src = players[0] ? getIcon(players[0].id) : PLACEHOLDER;
      iconColHtml = `<div class="char-icon-col">${iconImg(src)}</div>`;
    }
    let names;
    if (isMixedSlot) {
      const tie = t.status !== 'completed' && GoA.state.mixedTies && GoA.state.mixedTies[t.initiative];
      if (tie) {
        const mkTeam = (pool, key) => pool.length
          ? `<span class="team-dot ${key}"></span>${pool.map(p => GoA.esc(p.name)).join(', ')}` : null;
        const blueHtml = mkTeam(tie.bluePool, 'blue');
        const orangeHtml = mkTeam(tie.orangePool, 'orange');
        const activeHtml = t.teamTurn === 'blue' ? blueHtml : orangeHtml;
        const waitingHtml = t.teamTurn === 'blue' ? orangeHtml : blueHtml;
        const parts = [];
        if (activeHtml) parts.push(activeHtml + ' <em>(any&nbsp;1)</em>');
        if (waitingHtml) parts.push(waitingHtml);
        names = parts.join(' <span class="tie-vs">vs</span> ');
      } else {
        names = players.map(p => GoA.esc(p.name)).join(' / ') + ' <em>(any&nbsp;1)</em>';
      }
    } else {
      names = players.map(p => GoA.esc(p.name)).join(' & ');
    }
    const badge = t.status === 'active' ? '<span class="turn-badge">▶ Active</span>' : '';
    const subLabel = isMixedSlot ? ' · Tie' : isSimul ? ' · Simultaneous' : '';
    let waitInfo = '';
    if (t.status === 'active' && isSimul) {
      const done = (t.doneIds || []).length;
      waitInfo = `<div class="turn-wait">Simultaneous — ${done}/${players.length} ready</div>`;
    }
    return `
      <div class="turn-row${cls}${teamCls}"${avatarAttr}>
        <div class="turn-order">${t.order}</div>
        ${iconColHtml}
        <div class="turn-info">
          <div class="turn-name">${names}</div>
          <div class="turn-initiative">Initiative ${t.initiative}${subLabel}</div>
          ${waitInfo}
        </div>
        ${badge}
      </div>`;
  }).join('');

  if (containerId === 'turnsList') {
    const active = GoA.state.turns[GoA.state.currentTurnIndex];
    // Show End Turn only if offline (manager mode), the host, or the active player(s)
    const isHost = GoA.gameMode === 'offline' || GoA.state.hostPlayerId === GoA.myId;
    const isInActiveSlot = active && (active.players || []).some(p => p.id === GoA.myId);
    const hostActingForOthers = isHost && GoA.state.hostCanEndTurn && !isInActiveSlot && active && GoA.gameMode !== 'offline';
    
    let isMyTurn;
    if (!active) {
      isMyTurn = false;
    } else if (GoA.gameMode === 'offline') {
      isMyTurn = true;
    } else {
      isMyTurn = isInActiveSlot || (isHost && GoA.state.hostCanEndTurn);
    }
    
    let iAlreadyDone;
    if (hostActingForOthers) {
      iAlreadyDone = active && (active.players || []).every(p => (active.doneIds || []).includes(p.id));
    } else {
      iAlreadyDone = GoA.gameMode !== 'offline' && active && (active.doneIds || []).includes(GoA.myId);
    }
    
    // Update End Turn button label
    const btn = GoA.$('btnEndTurn');
    if (GoA.gameMode === 'offline' && active && active.mixedTieSlot) {
      btn.textContent = `End ${active.teamTurn === 'blue' ? '💎 Blue' : '🔥 Orange'} Team's Turn`;
    } else if (hostActingForOthers) {
      const nextPlayer = (active.players || []).find(p => !(active.doneIds || []).includes(p.id));
      if (nextPlayer) {
        btn.textContent = `End ${GoA.esc(nextPlayer.name)}'s Turn`;
      } else {
        btn.textContent = 'End My Turn';
      }
    } else {
      btn.textContent = GoA.gameMode === 'offline' ? 'End Turn' : 'End My Turn';
    }
    
    GoA.$('turnActions').style.display = (isMyTurn && !iAlreadyDone) ? 'block' : 'none';
    // Notify once per turn when it first becomes this player's move (skip in offline)
    if (GoA.gameMode !== 'offline' && isMyTurn && !iAlreadyDone && !hostActingForOthers && GoA.state.currentTurnIndex !== GoA.lastNotifiedTurnIndex) {
      GoA.lastNotifiedTurnIndex = GoA.state.currentTurnIndex;
      GoA.notifyMyTurn();
    }
    const waitEl = GoA.$('turnWaiting');
    if (isMyTurn && iAlreadyDone && active && !active.mixedTieSlot && !hostActingForOthers) {
      const waiting = (active.players || [])
        .filter(p => p.id !== GoA.myId && !(active.doneIds || []).includes(p.id))
        .map(p => GoA.esc(p.name));
      waitEl.textContent = `Waiting for ${waiting.join(' & ')}…`;
      waitEl.style.display = 'block';
    } else {
      waitEl.style.display = 'none';
    }

    // Set up cycling for mixed slot icons (2-second interval through all characters in pool)
    GoA.setupMixedIconCycles();
  }
};

// ── Setup cycling for mixed slot icons ─────────────────────────────────────
GoA.setupMixedIconCycles = function() {
  console.log('[mixed-icon] setupMixedIconCycles called, clearing', Object.keys(GoA.mixedIconCycles).length, 'existing intervals');
  
  // Clear all existing intervals
  Object.keys(GoA.mixedIconCycles).forEach(key => {
    clearInterval(GoA.mixedIconCycles[key]);
    delete GoA.mixedIconCycles[key];
  });

  // Find all mixed slot icons and set up cycling
  const getIcon = id => { const c = GoA.state.players[id]; return c && c.character ? GoA.charIconPath(c.character) : 'CharacterIcons/_placeholder.svg'; };
  const getAvatar = id => { const c = GoA.state.players[id]; return c && c.character ? GoA.charAvatarPath(c.character) : ''; };
  const PLACEHOLDER = 'CharacterIcons/_placeholder.svg';

  GoA.state.turns.forEach((t, turnIdx) => {
    if (!t.mixedTieSlot) return;

    const players = t.players || [];
    if (!players || players.length === 0) {
      console.log(`[mixed-icon] No players for init=${t.initiative}, team=${t.teamTurn}`);
      return;
    }

    console.log(`[mixed-icon] Found ${players.length} players in turn slot for init=${t.initiative}, team=${t.teamTurn}`);

    const mixedIconId = `mixed-icon-${t.initiative}-${t.teamTurn}`;
    const container = GoA.$(mixedIconId);
    if (!container) {
      console.log(`[mixed-icon] Container not found: ${mixedIconId}`);
      return;
    }

    // Find the turn-row element for background updates
    const turnRow = container.closest('.turn-row');
    if (!turnRow) {
      console.log(`[mixed-icon] Turn-row not found for ${mixedIconId}`);
      return;
    }

    // Only cycle if slot has multiple characters
    if (players.length <= 1) {
      console.log(`[mixed-icon] Turn slot has ${players.length} characters, skipping cycle`);
      return;
    }

    console.log(`[mixed-icon] Starting cycle for ${mixedIconId} with ${players.length} icons`);

    let currentIdx = 0;
    const iconSrcs = players.map(p => getIcon(p.id));
    const avatarSrcs = players.map(p => getAvatar(p.id));

    // Start cycling every 2 seconds
    const cycleKey = `${t.initiative}-${t.teamTurn}`;
    GoA.mixedIconCycles[cycleKey] = setInterval(() => {
      currentIdx = (currentIdx + 1) % iconSrcs.length;
      const src = iconSrcs[currentIdx];
      const bgSrc = avatarSrcs[currentIdx];
      container.innerHTML = `<img class="char-icon" src="${src}" alt="" onerror="this.src='${PLACEHOLDER}'">`;
      if (bgSrc) {
        turnRow.style.setProperty('--avatar-url', `url('${bgSrc}')`);
      }
    }, 2000);
  });
};

// ── Offline Setup Renderer ─────────────────────────────────────────────────
GoA.renderOfflineSetup = function() {
  const list = GoA.$('offlinePlayerList');
  list.innerHTML = GoA.offlinePlayers.map((p, i) => `
    <div class="offline-player-row">
      <input class="offline-name-input" type="text" value="${GoA.esc(p.name)}" maxlength="20"
             placeholder="Player ${i + 1}" data-idx="${i}" autocomplete="off" />
      <div class="offline-team-toggle">
        <button class="offline-team-btn${p.team === 'blue' ? ' active' : ''}" data-idx="${i}" data-team="blue">💎</button>
        <button class="offline-team-btn${p.team === 'orange' ? ' active' : ''}" data-idx="${i}" data-team="orange">🔥</button>
      </div>
      <select class="offline-char-select" data-idx="${i}">
        <option value="">—</option>
        <option value="emmit"      ${p.character === 'emmit' ? 'selected' : ''}>⏪ Emmit</option>
        <option value="hanu"       ${p.character === 'hanu' ? 'selected' : ''}>⚡ Hanu</option>
        <option value="ignatia"    ${p.character === 'ignatia' ? 'selected' : ''}>🌀 Ignatia</option>
        <option value="tali"       ${p.character === 'tali' ? 'selected' : ''}>🧊 Tali</option>
        <option value="tigerclaw"  ${p.character === 'tigerclaw' ? 'selected' : ''}>☠️ Tigerclaw</option>
        <option value="takahide"   ${p.character === 'takahide' ? 'selected' : ''}>⚔️ Takahide</option>
      </select>
      <button class="btn-remove-offline" data-idx="${i}" title="Remove">&#x2715;</button>
    </div>
  `).join('');
  list.querySelectorAll('.offline-name-input').forEach(inp =>
    inp.addEventListener('input', e => { GoA.offlinePlayers[+e.target.dataset.idx].name = e.target.value; })
  );
  list.querySelectorAll('.offline-team-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      GoA.offlinePlayers[+e.target.dataset.idx].team = e.target.dataset.team;
      GoA.renderOfflineSetup();
    })
  );
  list.querySelectorAll('.offline-char-select').forEach(sel =>
    sel.addEventListener('change', e => {
      GoA.offlinePlayers[+e.target.dataset.idx].character = e.target.value;
    })
  );
  list.querySelectorAll('.btn-remove-offline').forEach(btn =>
    btn.addEventListener('click', e => {
      GoA.offlinePlayers.splice(+e.target.dataset.idx, 1);
      GoA.renderOfflineSetup();
    })
  );
};

// ── Render kill players list ───────────────────────────────────────────────
GoA.renderKillPlayersList = function(containerId, players) {
  const el = GoA.$(containerId);
  if (!players.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:8px 0;">No players…</div>';
    return;
  }
  el.innerHTML = players.map(p => {
    const isMe = p.id === GoA.myId;
    const disc = !p.isConnected;
    const statusClass = disc ? 'pstatus-disconnected'
      : p.submissionStatus === 'locked' ? 'pstatus-locked'
        : p.submissionStatus === 'submitted' ? 'pstatus-submitted'
          : 'pstatus-waiting';
    const teamDot = p.team ? `<span class="team-dot ${p.team}"></span>` : '';
    const charTag = p.character ? `<span class="char-badge">· ${GoA.charLabel(p.character)}</span>` : '';
    return `
      <div class="player-row">
        <span class="player-name">
          ${teamDot}${GoA.esc(p.name)}${charTag}${isMe ? '<span class="me-tag">(you)</span>' : ''}
        </span>
        ${!isMe ? `<button class="btn btn-sm btn-danger" data-id="${p.id}" title="Remove from this round">⚠ Remove</button>` : ''}
      </div>`;
  }).join('');

  // Wire kill buttons
  el.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const name = (GoA.state.players[id] && GoA.state.players[id].name) || 'Player';
      if (!confirm(`Remove ${name} from this round?`)) return;
      if (GoA.gameMode === 'offline') {
        GoA.killPlayerThisRound(id);
      } else {
        GoA.sendAction('kill_player', { targetId: id });
      }
      // Close the panel after killing
      GoA.$('killPlayersPanel').style.display = 'none';
      GoA.render();
    });
  });
};
