// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Abilities module — special character abilities (Hanu, Ignatia, Tigerclaw, Takahide, Tali)

window.GoA = window.GoA || {};

// ── Render active ability buttons ──────────────────────────────────────────
GoA.renderAbilities = function() {
  const isOffline = GoA.gameMode === 'offline';
  const hasHanu = GoA.characterInGame('hanu');
  const hasIgnatia = GoA.characterInGame('ignatia');
  const active = GoA.state.turns[GoA.state.currentTurnIndex];

  const activeIds = active ? (active.players || []).map(p => p.id) : [];
  const hanuOnActive = activeIds.some(id => GoA.state.players[id] && GoA.state.players[id].character === 'hanu')
    || (GoA.myCharacter === 'hanu' && activeIds.includes(GoA.myId));
  const canHurryUp = hanuOnActive && (GoA.myCharacter === 'hanu' || isOffline);

  const ignatiaOnActive = activeIds.some(id => GoA.state.players[id] && GoA.state.players[id].character === 'ignatia')
    || (GoA.myCharacter === 'ignatia' && activeIds.includes(GoA.myId));
  const canChaos = ignatiaOnActive && (GoA.myCharacter === 'ignatia' || isOffline);

  const tigerclawOnActive = activeIds.some(id => GoA.state.players[id] && GoA.state.players[id].character === 'tigerclaw');
  const canPoison = tigerclawOnActive && (GoA.myCharacter === 'tigerclaw' || isOffline);

  const takahideOnActive = activeIds.some(id => GoA.state.players[id] && GoA.state.players[id].character === 'takahide');
  const canOrder = takahideOnActive && (GoA.myCharacter === 'takahide' || isOffline);

  const taliOnActive = activeIds.some(id => GoA.state.players[id] && GoA.state.players[id].character === 'tali');
  const canIceBarrier = taliOnActive && (GoA.myCharacter === 'tali' || isOffline);

  const panel = GoA.$('abilityPanel');
  if (!canHurryUp && !canChaos && !canPoison && !canOrder && !canIceBarrier) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  let html = '';
  if (canHurryUp && !GoA.usedAbilitiesThisTurn.has('hurryUp')) {
    html += `<button class="ability-btn hanu-ability" id="btnHurryUp">⚡ Hurry Up!</button>`;
  }
  if (canChaos && !GoA.usedAbilitiesThisTurn.has('chaos')) {
    html += `<button class="ability-btn ignatia-ability" id="btnChaosIncarnate">🌀 Chaos Incarnate</button>`;
  }
  if (canPoison && !GoA.usedAbilitiesThisTurn.has('poison')) {
    html += `<button class="ability-btn tigerclaw-ability" id="btnPoisonToken">☠️ Poison Token</button>`;
  }
  if (canOrder && !GoA.usedAbilitiesThisTurn.has('warlordOrder')) {
    html += `<button class="ability-btn takahide-ability" id="btnWarlordOrder">🍶 Hold my sake</button>`;
  }
  if (canIceBarrier && !GoA.usedAbilitiesThisTurn.has('iceBarrier')) {
    html += `<button class="ability-btn tali-ability" id="btnIceBarrier">🧊 Ice Barrier</button>`;
  }
  panel.innerHTML = html;

  if (canHurryUp) {
    GoA.$('btnHurryUp').addEventListener('click', GoA.showHurryUpPanel);
  }
  if (canChaos && !GoA.usedAbilitiesThisTurn.has('chaos')) {
    GoA.$('btnChaosIncarnate').addEventListener('click', () => {
      GoA.usedAbilitiesThisTurn.add('chaos');
      if (GoA.gameMode === 'offline') {
        GoA.state.initiativeToken = GoA.state.initiativeToken === 'blue' ? 'orange' : 'blue';
        GoA.toast('\uD83C\uDF00 Chaos Incarnate! Token flipped to ' + GoA.state.initiativeToken + '.');
        GoA.render();
      } else {
        GoA.sendAction('use_ability', { abilityType: 'chaos_incarnate', actorId: GoA.myId });
      }
      GoA.renderAbilities();
    });
  }
  if (canPoison) {
    GoA.$('btnPoisonToken').addEventListener('click', GoA.showPoisonPanel);
  }
  if (canOrder) {
    GoA.$('btnWarlordOrder').addEventListener('click', GoA.showTakahidePanel);
  }
  if (canIceBarrier && !GoA.usedAbilitiesThisTurn.has('iceBarrier')) {
    GoA.$('btnIceBarrier').addEventListener('click', GoA.showIceBarrierPanel);
  }
};

// ── Hanu ability: Hurry Up ─────────────────────────────────────────────────
GoA.showHurryUpPanel = function() {
  GoA.$('hurryUpPanel').style.display = 'block';

  // Only show players who have a pending turn AFTER the current one (or in the current
  // mixed-tie's other-team pool), and exclude Hanu himself
  const cur = GoA.state.currentTurnIndex;
  const futureTurnPlayerIds = new Set();
  for (let i = cur + 1; i < GoA.state.turns.length; i++) {
    const t = GoA.state.turns[i];
    if (t.status !== 'completed') (t.players || []).forEach(p => futureTurnPlayerIds.add(p.id));
  }
  // Also include every mixed-tie pool player
  Object.values(GoA.state.mixedTies).forEach(tie => {
    (tie.bluePool || []).forEach(p => futureTurnPlayerIds.add(p.id));
    (tie.orangePool || []).forEach(p => futureTurnPlayerIds.add(p.id));
  });
  // Also include players in the current slot who haven't ended their turn yet
  const currentTurn = GoA.state.turns[cur];
  if (currentTurn) {
    const doneSet = new Set(currentTurn.doneIds || []);
    (currentTurn.players || []).forEach(p => { if (!doneSet.has(p.id)) futureTurnPlayerIds.add(p.id); });
  }
  const hanuPlayer = Object.values(GoA.state.players).find(p => p.character === 'hanu');
  const hanuId = hanuPlayer ? hanuPlayer.id : null;

  const targets = Object.values(GoA.state.players).filter(p =>
    p.isConnected && p.id !== hanuId && futureTurnPlayerIds.has(p.id)
  );
  if (!targets.length) {
    GoA.$('hurryUpTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No eligible players (everyone after Hanu has already gone).</p>';
  } else {
    GoA.$('hurryUpTargets').innerHTML = targets.map(p =>
      `<button class="hurry-target-btn" data-id="${p.id}">
        <span class="team-dot ${p.team}"></span>${GoA.esc(p.name)}
        ${p.character ? `<span class="char-badge">${GoA.charLabel(p.character)}</span>` : ''}
      </button>`
    ).join('');
    GoA.$('hurryUpTargets').querySelectorAll('.hurry-target-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        GoA.$('hurryUpPanel').style.display = 'none';
        GoA.usedAbilitiesThisTurn.add('hurryUp');
        if (GoA.gameMode === 'offline') {
          GoA.applyHurryUp(btn.dataset.id);
        } else {
          GoA.sendAction('use_ability', { abilityType: 'hurry_up', actorId: GoA.myId, targetId: btn.dataset.id });
        }
        GoA.renderAbilities();
      })
    );
  }
};

GoA.applyHurryUp = function(targetId) {
  const target = GoA.state.players[targetId];
  if (!target) return;
  const NEW_INIT = 11;
  const cur = GoA.state.currentTurnIndex;

  GoA.purgePlayerFromUpcoming(targetId);
  GoA.state.players[targetId] = { ...target, initiative: NEW_INIT };
  GoA.insertPlayerAtInitiative(targetId, target.name, target.team, NEW_INIT);

  GoA.usedAbilitiesThisTurn.add('hurryUp');
  GoA.toast(`⚡ ${GoA.esc(target.name)} rushes to initiative 11!`);
  GoA.render();
};

// ── Tigerclaw ability: Poison Token ────────────────────────────────────────
GoA.showPoisonPanel = function() {
  GoA.$('poisonPanel').style.display = 'block';
  const tigerPlayer = Object.values(GoA.state.players).find(p => p.character === 'tigerclaw');
  const tigerTeam = tigerPlayer ? tigerPlayer.team : null;
  const cur = GoA.state.currentTurnIndex;
  const futurePendingIds = new Set();
  for (let i = cur + 1; i < GoA.state.turns.length; i++) {
    const t = GoA.state.turns[i];
    if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
  }
  Object.values(GoA.state.mixedTies).forEach(tie => {
    (tie.bluePool || []).forEach(p => futurePendingIds.add(p.id));
    (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
  });
  // Also include players in the current slot who haven't ended their turn yet
  const currentTurnP = GoA.state.turns[cur];
  if (currentTurnP) {
    const doneSet = new Set(currentTurnP.doneIds || []);
    (currentTurnP.players || []).forEach(p => { if (!doneSet.has(p.id)) futurePendingIds.add(p.id); });
  }
  const targets = Object.values(GoA.state.players).filter(p =>
    p.isConnected && p.team !== tigerTeam && futurePendingIds.has(p.id)
  );
  if (!targets.length) {
    GoA.$('poisonTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No enemy players with a pending turn.</p>';
  } else {
    GoA.$('poisonTargets').innerHTML = targets.map(p =>
      `<div class="poison-target-row">
        <span class="poison-target-name">
          <span class="team-dot ${p.team}"></span>${GoA.esc(p.name)}
          ${p.character ? `<span class="char-badge">${GoA.charLabel(p.character)}</span>` : ''}
        </span>
        <button class="poison-penalty-btn" data-id="${p.id}" data-penalty="1">-1</button>
        <button class="poison-penalty-btn" data-id="${p.id}" data-penalty="2">-2</button>
      </div>`
    ).join('');
    GoA.$('poisonTargets').querySelectorAll('.poison-penalty-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        GoA.$('poisonPanel').style.display = 'none';
        GoA.usedAbilitiesThisTurn.add('poison');
        if (GoA.gameMode === 'offline') {
          GoA.applyPoison(btn.dataset.id, +btn.dataset.penalty);
        } else {
          GoA.sendAction('use_ability', { abilityType: 'poison', actorId: GoA.myId, targetId: btn.dataset.id, penalty: +btn.dataset.penalty });
        }
        GoA.renderAbilities();
      })
    );
  }
};

GoA.applyPoison = function(targetId, penalty) {
  const target = GoA.state.players[targetId];
  if (!target) return;
  const newInit = target.initiative - penalty;
  const cur = GoA.state.currentTurnIndex;
  GoA.state.players[targetId] = { ...target, initiative: newInit };
  GoA.purgePlayerFromUpcoming(targetId);
  // Only give the target a future slot if their new initiative is still ahead
  // in the turn order. If it lands at or behind the current turn they lose
  // their remaining turn this round.
  const currentInit = GoA.state.turns[cur] ? GoA.state.turns[cur].initiative : null;
  const stillFuture = currentInit === null || (
    GoA.state.reverseInitiative ? newInit > currentInit : newInit < currentInit
  );
  if (stillFuture) GoA.insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
  GoA.usedAbilitiesThisTurn.add('poison');
  GoA.toast(`☠️ ${GoA.esc(target.name)} poisoned! -${penalty} initiative (now ${newInit})`);
  GoA.render();
};

// ── Takahide ability: Warlord's Order ──────────────────────────────────────
GoA.showTakahidePanel = function() {
  GoA.$('takahidePanel').style.display = 'block';
  const takahidePlayer = Object.values(GoA.state.players).find(p => p.character === 'takahide');
  const takaTeam = takahidePlayer ? takahidePlayer.team : null;
  const takaId = takahidePlayer ? takahidePlayer.id : null;
  // Build set of players who still have a pending turn
  const cur = GoA.state.currentTurnIndex;
  const futurePendingIds = new Set();
  for (let i = cur + 1; i < GoA.state.turns.length; i++) {
    const t = GoA.state.turns[i];
    if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
  }
  Object.values(GoA.state.mixedTies).forEach(tie => {
    (tie.bluePool || []).forEach(p => futurePendingIds.add(p.id));
    (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
  });
  const targets = Object.values(GoA.state.players).filter(p =>
    p.isConnected && p.team === takaTeam && p.id !== takaId && futurePendingIds.has(p.id)
  );
  if (!targets.length) {
    GoA.$('takahideTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No other friendly players.</p>';
  } else {
    GoA.$('takahideTargets').innerHTML = targets.map(p =>
      `<div class="takahide-target-row" data-id="${p.id}">
        <span class="takahide-target-name">
          <span class="team-dot ${p.team}"></span>${GoA.esc(p.name)}
          ${p.character ? `<span class="char-badge">${GoA.charLabel(p.character)}</span>` : ''}
        </span>
        <input class="takahide-init-input" type="number" min="1" max="30"
          value="${p.initiative || ''}" placeholder="Init" data-id="${p.id}" />
        <button class="takahide-set-btn" data-id="${p.id}">✔ Set</button>
      </div>`
    ).join('');
    GoA.$('takahideTargets').querySelectorAll('.takahide-set-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = GoA.$('takahideTargets').querySelector(`.takahide-init-input[data-id="${btn.dataset.id}"]`);
        const val = parseInt(input && input.value, 10);
        if (!val || val < 1) { input && input.focus(); return; }
        GoA.$('takahidePanel').style.display = 'none';
        GoA.usedAbilitiesThisTurn.add('warlordOrder');
        if (GoA.gameMode === 'offline') {
          GoA.applyWarlordOrder(btn.dataset.id, val);
        } else {
          GoA.sendAction('use_ability', { abilityType: 'warlord_order', actorId: GoA.myId, targetId: btn.dataset.id, newInit: val });
        }
        GoA.renderAbilities();
      });
    });
  }
};

GoA.applyWarlordOrder = function(targetId, newInit) {
  const target = GoA.state.players[targetId];
  if (!target) return;
  const cur = GoA.state.currentTurnIndex;
  GoA.state.players[targetId] = { ...target, initiative: newInit };
  GoA.purgePlayerFromUpcoming(targetId);
  GoA.insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
  GoA.usedAbilitiesThisTurn.add('warlordOrder');
  GoA.toast(`⚔️ ${GoA.esc(target.name)}'s initiative changed to ${newInit}!`);
  GoA.render();
};

// ── Tali ability: Ice Barrier ──────────────────────────────────────────────
GoA.showIceBarrierPanel = function() {
  GoA.$('taliPanel').style.display = 'block';
  const taliPlayer = Object.values(GoA.state.players).find(p => p.character === 'tali');
  const taliTeam = taliPlayer ? taliPlayer.team : null;
  const cur = GoA.state.currentTurnIndex;
  // Only enemy players with a pending future turn
  const futurePendingIds = new Set();
  for (let i = cur + 1; i < GoA.state.turns.length; i++) {
    const t = GoA.state.turns[i];
    if (t.status !== 'completed') (t.players || []).forEach(p => futurePendingIds.add(p.id));
  }
  Object.values(GoA.state.mixedTies).forEach(tie => {
    (tie.bluePool || []).forEach(p => futurePendingIds.add(p.id));
    (tie.orangePool || []).forEach(p => futurePendingIds.add(p.id));
  });
  // Also include players in the current slot who haven't ended their turn yet
  const currentTurnT = GoA.state.turns[cur];
  if (currentTurnT) {
    const doneSet = new Set(currentTurnT.doneIds || []);
    (currentTurnT.players || []).forEach(p => { if (!doneSet.has(p.id)) futurePendingIds.add(p.id); });
  }
  const targets = Object.values(GoA.state.players).filter(p =>
    p.isConnected && p.team !== taliTeam && futurePendingIds.has(p.id)
  );
  if (!targets.length) {
    GoA.$('taliTargets').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:4px 0">No enemy players with a pending turn.</p>';
  } else {
    GoA.$('taliTargets').innerHTML = targets.map(p =>
      `<div class="poison-target-row">
        <span class="poison-target-name">
          <span class="team-dot ${p.team}"></span>${GoA.esc(p.name)}
          ${p.character ? `<span class="char-badge">${GoA.charLabel(p.character)}</span>` : ''}
        </span>
        <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="1">-1</button>
        <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="2">-2</button>
        <button class="poison-penalty-btn tali-penalty" data-id="${p.id}" data-penalty="3">-3</button>
      </div>`
    ).join('');
    GoA.$('taliTargets').querySelectorAll('.tali-penalty').forEach(btn =>
      btn.addEventListener('click', () => {
        GoA.$('taliPanel').style.display = 'none';
        GoA.usedAbilitiesThisTurn.add('iceBarrier');
        if (GoA.gameMode === 'offline') {
          GoA.applyIceBarrier(btn.dataset.id, +btn.dataset.penalty);
        } else {
          GoA.sendAction('use_ability', { abilityType: 'ice_barrier', actorId: GoA.myId, targetId: btn.dataset.id, penalty: +btn.dataset.penalty });
        }
        GoA.renderAbilities();
      })
    );
  }
};

GoA.applyIceBarrier = function(targetId, penalty) {
  const target = GoA.state.players[targetId];
  if (!target) return;
  const newInit = target.initiative - penalty;
  const cur = GoA.state.currentTurnIndex;
  const hadFutureTurn =
    GoA.state.turns.slice(cur + 1).some(t =>
      t.status !== 'completed' && (t.players || []).some(p => p.id === targetId)
    ) ||
    Object.values(GoA.state.mixedTies).some(tie =>
      [...(tie.bluePool || []), ...(tie.orangePool || [])].some(p => p.id === targetId)
    );
  GoA.state.players[targetId] = { ...target, initiative: newInit };
  GoA.purgePlayerFromUpcoming(targetId);
  const currentInit = GoA.state.turns[cur] ? GoA.state.turns[cur].initiative : null;
  const stillFuture = currentInit === null || (
    GoA.state.reverseInitiative ? newInit > currentInit : newInit < currentInit
  );
  if (hadFutureTurn && stillFuture) GoA.insertPlayerAtInitiative(targetId, target.name, target.team, newInit);
  GoA.usedAbilitiesThisTurn.add('iceBarrier');
  GoA.toast(`🧊 ${GoA.esc(target.name)} frozen! -${penalty} initiative (now ${newInit})`);
  GoA.render();
};
