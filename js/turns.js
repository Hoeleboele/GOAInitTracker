// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// Turns module — initiative locking, turn-order building, advancing, round lifecycle

window.GoA = window.GoA || {};

// ── Initiative pad display ─────────────────────────────────────────────────
GoA.updatePad = function() {
  const el = GoA.$('initiativeDisplay');
  if (GoA.initValue) {
    el.textContent = GoA.initValue;
    el.classList.remove('is-placeholder');
  } else {
    el.textContent = 'Enter initiative';
    el.classList.add('is-placeholder');
  }
  GoA.$('btnLock').disabled = !GoA.initValue || GoA.initLocked;
};

// ── Reset pad to initial state ──────────────────────────────────────────────
GoA.resetInitPad = function() {
  GoA.initValue = '';
  GoA.initLocked = false;
  document.querySelectorAll('.pad-btn').forEach(b => b.disabled = false);
  GoA.$('btnLock').style.display = 'block';
  GoA.$('btnEdit').style.display = 'none';
  GoA.$('lockStatus').textContent = '';
  GoA.updatePad();
};

// ── Build and reveal turns from locked initiatives (used in offline mode) ─────────────────────────
GoA.revealTurns = function() {
  const now = Date.now();
  // Consider connected players and recently-disconnected players within the grace window
  const considered = Object.values(GoA.state.players).filter(p =>
    p.isConnected || (p.disconnectedAt && (now - p.disconnectedAt) < GoA.DISCONNECT_GRACE_MS)
  );

  // Group players by initiative value
  const byVal = {};
  considered.forEach(p => {
    const v = p.initiative || 0;
    if (!byVal[v]) byVal[v] = [];
    byVal[v].push(p);
  });
  const sortedVals = Object.keys(byVal).map(Number)
    .sort((a, b) => GoA.state.reverseInitiative ? a - b : b - a);

  GoA.state.mixedTies = {};
  const turns = [];
  let order = 1;

  for (const val of sortedVals) {
    const group = byVal[val];
    const blue = group.filter(p => p.team === 'blue');
    const orange = group.filter(p => p.team === 'orange');

    if (blue.length === 0 || orange.length === 0) {
      // Pure same-team (or unassigned): one simultaneous slot
      turns.push({
        order: order++,
        players: group.map(p => ({ id: p.id, name: p.name, team: p.team || '' })),
        initiative: val,
        status: 'pending',
        doneIds: [],
      });
    } else {
      // Mixed teams: store pools and build ONLY the first team slot
      GoA.state.mixedTies[val] = { bluePool: [...blue], orangePool: [...orange] };
      turns.push(GoA.buildMixedSlot(val, GoA.state.initiativeToken, order++));
    }
  }

  if (turns.length > 0) turns[0].status = 'active';
  GoA.state.turns = turns;
  GoA.state.currentTurnIndex = 0;
  GoA.state.phase = 'turns';
  GoA.render();
};

// ── Build one mixed-tie team slot ──────────────────────────────────────────
GoA.buildMixedSlot = function(initiative, teamTurn, order) {
  const tie = GoA.state.mixedTies[initiative];
  const otherTeam = teamTurn === 'blue' ? 'orange' : 'blue';
  const otherHasPlayers = tie[`${otherTeam}Pool`].length > 0;
  return {
    order,
    players: tie[`${teamTurn}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
    initiative,
    status: 'pending',
    doneIds: [],
    mixedTieSlot: true,
    teamTurn,
    tokenAfter: otherHasPlayers ? otherTeam : undefined, // no flip on last mixed slot
  };
};

// ── Advance turn to the next slot ──────────────────────────────────────────
GoA.advanceTurn = function() {
  // Close any open ability panels and reset used-ability tracking for the new turn
  GoA.usedAbilitiesThisTurn.clear();

  const cur = GoA.state.currentTurnIndex;
  const currentTurn = GoA.state.turns[cur];

  // Apply token flip stored on the just-completed turn
  if (currentTurn && currentTurn.tokenAfter !== undefined) {
    GoA.state.initiativeToken = currentTurn.tokenAfter;
  }

  // If this was a mixed-tie slot, update pools and inject the next slot
  if (currentTurn && currentTurn.mixedTieSlot) {
    const initiative = currentTurn.initiative;
    const takenTeam = currentTurn.teamTurn;
    const otherTeam = takenTeam === 'blue' ? 'orange' : 'blue';
    const takenById = currentTurn.doneIds[0];
    const tie = GoA.state.mixedTies[initiative];

    // Remove the player who took this slot
    tie[`${takenTeam}Pool`] = tie[`${takenTeam}Pool`].filter(p => p.id !== takenById);

    const takenRemaining = tie[`${takenTeam}Pool`].length;
    const otherRemaining = tie[`${otherTeam}Pool`].length;
    const nextOrder = cur + 2; // 1-based

    let nextSlot = null;
    if (otherRemaining > 0) {
      // Other team still has players — next mixed slot for them (token just flipped)
      nextSlot = GoA.buildMixedSlot(initiative, GoA.state.initiativeToken, nextOrder);
    } else if (takenRemaining > 0) {
      // Other team exhausted — remaining players go simultaneously
      nextSlot = {
        order: nextOrder,
        players: tie[`${takenTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
        initiative,
        status: 'pending',
        doneIds: [],
      };
    }

    if (nextSlot) {
      GoA.state.turns.splice(cur + 1, 0, nextSlot);
      for (let i = cur + 1; i < GoA.state.turns.length; i++) GoA.state.turns[i].order = i + 1;
    }
  }

  const next = cur + 1;
  if (next >= GoA.state.turns.length) {
    // All turns done — auto-start next round
    GoA.startNewRound();
    return;
  }
  GoA.state.turns[cur].status = 'completed';
  GoA.state.turns[next].status = 'active';
  GoA.state.turns[next].doneIds = [];
  GoA.state.currentTurnIndex = next;
  GoA.render();
};

// ── Start a new round (offline mode) ─────────────────────────────────────
GoA.startNewRound = function() {
  const quoteEl = GoA.$('initiativeCharQuote');
  if (quoteEl) quoteEl.textContent = '';
  GoA.state.phase = 'initiative';
  GoA.state.turns = [];
  GoA.state.currentTurnIndex = 0;
  GoA.state.mixedTies = {};
  GoA.state.reverseInitiative = false;
  GoA.usedAbilitiesThisTurn.clear();
  GoA.offlinePlayers.forEach(p => { p.initiative = undefined; });
  GoA.offlineInitIdx = 0;
  GoA.resetInitPad();
  GoA.render();
};

// ── Remove player from all future turns and mixed-tie pools ─────────────────
GoA.purgePlayerFromUpcoming = function(targetId) {
  const cur = GoA.state.currentTurnIndex;
  for (let i = GoA.state.turns.length - 1; i > cur; i--) {
    const t = GoA.state.turns[i];
    if (!(t.players || []).some(p => p.id === targetId)) continue;
    t.players = t.players.filter(p => p.id !== targetId);
    if (t.players.length === 0) {
      GoA.state.turns.splice(i, 1);
      // If this was a mixed-tie slot, rescue the partner team's pool players
      if (t.mixedTieSlot) {
        const tie = GoA.state.mixedTies[t.initiative];
        if (tie) {
          const otherTeam = t.teamTurn === 'blue' ? 'orange' : 'blue';
          const rescued = (tie[`${otherTeam}Pool`] || []).filter(p => p.id !== targetId);
          if (rescued.length > 0) {
            GoA.state.turns.splice(i, 0, {
              order: 0,
              players: rescued.map(p => ({ id: p.id, name: p.name, team: p.team })),
              initiative: t.initiative,
              status: 'pending',
              doneIds: [],
            });
          }
          delete GoA.state.mixedTies[t.initiative];
        }
      }
    }
  }
  // Remove from all mixed-tie pools; if one pool empties, convert slot to simultaneous
  Object.keys(GoA.state.mixedTies).forEach(init => {
    const initNum = +init;
    const tie = GoA.state.mixedTies[initNum];
    tie.bluePool = tie.bluePool.filter(p => p.id !== targetId);
    tie.orangePool = tie.orangePool.filter(p => p.id !== targetId);
    if (tie.bluePool.length === 0 || tie.orangePool.length === 0) {
      const remaining = tie.bluePool.length > 0 ? tie.bluePool : tie.orangePool;
      const slotIdx = GoA.state.turns.findIndex(t => t.initiative === initNum && t.mixedTieSlot);
      // Only modify future slots — never touch the currently-active slot.
      // If the collapsed tie belongs to the active slot, advanceTurn() will clean it up naturally.
      if (slotIdx > cur) {
        if (remaining.length > 0) {
          // Convert to a plain simultaneous slot for the surviving team
          GoA.state.turns[slotIdx] = {
            order: GoA.state.turns[slotIdx].order,
            players: remaining.map(p => ({ id: p.id, name: p.name, team: p.team })),
            initiative: initNum,
            status: 'pending',
            doneIds: [],
          };
        } else {
          GoA.state.turns.splice(slotIdx, 1);
        }
        delete GoA.state.mixedTies[initNum];
      }
    }
  });
};

// ── Insert player at an initiative in the future turn order ────────────────
GoA.insertPlayerAtInitiative = function(id, name, team, newInit) {
  const cur = GoA.state.currentTurnIndex;
  let mergeIdx = -1;
  for (let j = cur + 1; j < GoA.state.turns.length; j++) {
    if (GoA.state.turns[j].initiative === newInit && GoA.state.turns[j].status !== 'completed') {
      mergeIdx = j; break;
    }
  }
  if (mergeIdx === -1) {
    // No collision — insert in sort order
    let insertAt = GoA.state.turns.length;
    for (let j = cur + 1; j < GoA.state.turns.length; j++) {
      const before = GoA.state.reverseInitiative
        ? GoA.state.turns[j].initiative > newInit
        : GoA.state.turns[j].initiative < newInit;
      if (before) { insertAt = j; break; }
    }
    GoA.state.turns.splice(insertAt, 0, {
      order: 0, players: [{ id, name, team }], initiative: newInit, status: 'pending', doneIds: [],
    });
  } else {
    const slot = GoA.state.turns[mergeIdx];
    const existingTeams = new Set((slot.players || []).map(p => p.team));
    if (existingTeams.size === 0 || existingTeams.has(team) || slot.mixedTieSlot) {
      // Same team or already a mixed-tie slot — add player directly
      if (!slot.players.some(p => p.id === id)) slot.players.push({ id, name, team });
      if (slot.mixedTieSlot && GoA.state.mixedTies[newInit]) {
        const pool = GoA.state.mixedTies[newInit][`${team}Pool`];
        if (pool && !pool.some(p => p.id === id))
          pool.push({ ...(GoA.state.players[id] || {}), id, name, team });
      }
    } else {
      // Different team — create a mixed tie
      const existing = (slot.players || []).map(p =>
        ({ ...(GoA.state.players[p.id] || {}), id: p.id, name: p.name, team: p.team }));
      const incoming = [{ ...(GoA.state.players[id] || {}), id, name, team }];
      const bluePool = team === 'blue' ? incoming : existing;
      const orangePool = team === 'orange' ? incoming : existing;
      GoA.state.mixedTies[newInit] = { bluePool, orangePool };
      const firstTeam = GoA.state.initiativeToken;
      const otherTeam = firstTeam === 'blue' ? 'orange' : 'blue';
      GoA.state.turns[mergeIdx] = {
        order: slot.order,
        players: GoA.state.mixedTies[newInit][`${firstTeam}Pool`].map(p => ({ id: p.id, name: p.name, team: p.team })),
        initiative: newInit,
        status: 'pending',
        doneIds: [],
        mixedTieSlot: true,
        teamTurn: firstTeam,
        tokenAfter: GoA.state.mixedTies[newInit][`${otherTeam}Pool`].length > 0 ? otherTeam : undefined,
      };
    }
  }
  GoA.state.turns.forEach((t, i) => { t.order = i + 1; });
};

// ── Remove player from the current round entirely ────────────────────────────
GoA.killPlayerThisRound = function(targetId) {
  const target = GoA.state.players[targetId];
  if (!target) return;
  // Mark as removed for UI purposes
  GoA.state.players[targetId] = { ...(GoA.state.players[targetId] || {}), removedThisRound: true };

  // Remove from upcoming turns and mixed ties
  GoA.purgePlayerFromUpcoming(targetId);

  // If currently active slot includes them, mark them done so they won't block advancement
  const cur = GoA.state.currentTurnIndex;
  const active = GoA.state.turns[cur];
  if (active && (active.players || []).some(p => p.id === targetId)) {
    if (!active.doneIds) active.doneIds = [];
    if (!active.doneIds.includes(targetId)) active.doneIds.push(targetId);
  }

  // If the active slot is a mixed-tie, update its pools/players immediately
  if (active && active.mixedTieSlot) {
    const tie = GoA.state.mixedTies && GoA.state.mixedTies[active.initiative];
    if (tie) {
      tie.bluePool = (tie.bluePool || []).filter(p => p.id !== targetId);
      tie.orangePool = (tie.orangePool || []).filter(p => p.id !== targetId);

      const curPoolKey = `${active.teamTurn}Pool`;
      const otherTeam = active.teamTurn === 'blue' ? 'orange' : 'blue';
      const otherPoolKey = `${otherTeam}Pool`;

      const curPool = tie[curPoolKey] || [];
      const otherPool = tie[otherPoolKey] || [];

      if (curPool.length > 0) {
        active.players = curPool.map(p => ({ id: p.id, name: p.name, team: p.team }));
      } else if (otherPool.length > 0) {
        // Switch the active team for this mixed slot to the other team
        active.teamTurn = otherTeam;
        active.players = otherPool.map(p => ({ id: p.id, name: p.name, team: p.team }));
      } else {
        // Both pools empty: remove tie and advance the turn immediately
        delete GoA.state.mixedTies[active.initiative];
        // Ensure the current slot won't block advancement
        if (!active.doneIds) active.doneIds = [];
        // Advance turn to clean up the empty mixed slot
        GoA.advanceTurn();
        GoA.toast(`${GoA.esc(target.name)} removed from this round.`);
        return;
      }
    }
  }

  GoA.toast(`${GoA.esc(target.name)} removed from this round.`);
  GoA.render();
};

// ── End turn in offline mode or host-managed mode ───────────────────────────
GoA.endTurnOffline = function() {
  const turn = GoA.state.turns[GoA.state.currentTurnIndex];
  if (!turn) return;
  if (!turn.doneIds) turn.doneIds = [];
  if (turn.mixedTieSlot) {
    // One manager click = one team slot; auto-pick the first candidate
    const first = (turn.players || [])[0];
    if (first && !turn.doneIds.includes(first.id)) turn.doneIds.push(first.id);
  } else {
    // Mark all players done (simultaneous = single click in offline)
    (turn.players || []).forEach(p => {
      if (!turn.doneIds.includes(p.id)) turn.doneIds.push(p.id);
    });
  }
  GoA.advanceTurn();
};
