// ── Guards of Atlantis II – Turn Tracker ─────────────────────────────────
// UI module — view switching, character picker, theming

window.GoA = window.GoA || {};

// ── Show / hide views ──────────────────────────────────────────────────────
GoA.showLanding = function() {
  GoA.$('landing').style.display = 'flex';
  GoA.$('app').style.display = 'none';
  GoA.$('joinForm').style.display = 'none';
  GoA.$('landingMode').style.display = 'flex';
  GoA.$('landingMain').style.display = 'none';
  GoA.$('viewCharPick').style.display = 'none';
  GoA.$('codeInput').value = '';
  // Reset team button visual state to match the (cleared) myTeam variable
  GoA.$('btnTeamBlue').classList.remove('selected');
  GoA.$('btnTeamOrange').classList.remove('selected');
  GoA.setStatus('');
};

GoA.showApp = function() {
  GoA.$('landing').style.display = 'none';
  GoA.$('app').style.display = 'flex';
};

GoA.show = function(id) {
  GoA.VIEWS.forEach(v => GoA.$(v).style.display = v === id ? (v === 'viewInitiative' ? 'flex' : 'block') : 'none');
};

// ── Character selection ────────────────────────────────────────────────────
GoA.updateSelectedCharDisplay = function() {
  const disp = GoA.$('selectedCharDisplay');
  if (!GoA.myCharacter) {
    disp.style.display = 'none';
    return;
  }
  const c = GoA.charData(GoA.myCharacter);
  if (!c) {
    disp.style.display = 'none';
    return;
  }
  const abilityName = c.id === 'emmit' ? 'Reverse Time'
    : c.id === 'hanu' ? 'Hurry Up'
      : c.id === 'ignatia' ? 'Chaos Incarnate'
        : c.id === 'tigerclaw' ? 'Poison Token'
          : c.id === 'takahide' ? "Warlord's Order"
            : c.id === 'tali' ? 'Ice Barrier'
              : '';
  disp.innerHTML = `
    <img class="selchar-avatar" src="${GoA.charAvatarPath(c.id)}" alt="${GoA.esc(c.name)}" />
    <div class="selchar-info">
      <span class="selchar-name">${c.special ? c.special + ' ' : ''}${GoA.esc(c.name)}</span>
      ${abilityName ? `<span class="selchar-ability">${GoA.esc(abilityName)}</span>` : ''}
    </div>
    <button class="selchar-clear" id="btnClearChar">✕</button>
  `;
  disp.style.display = 'flex';
  GoA.$('btnClearChar').addEventListener('click', e => {
    e.stopPropagation();
    GoA.selectCharacter('');
  });
};

GoA.selectCharacter = function(id) {
  GoA.myCharacter = id;
  GoA.updateSelectedCharDisplay();
  GoA.hideCharPicker();
};

GoA.showCharPicker = function() {
  GoA.renderCharPicker();
  GoA.$('landingMain').style.display = 'none';
  GoA.$('landingMode').style.display = 'none';
  GoA.$('viewCharPick').style.display = 'flex';
};

GoA.hideCharPicker = function() {
  GoA.$('viewCharPick').style.display = 'none';
  GoA.$('landingMain').style.display = 'flex';
};

GoA.renderCharPicker = function() {
  const grid = GoA.$('charPickGrid');
  let html = `<button class="char-pick-card${!GoA.myCharacter ? ' selected' : ''}" data-charid="">
    <div class="char-pick-no-avatar">—</div>
    <span class="char-pick-name">None</span>
  </button>`;
  GoA.CHARACTERS.forEach(c => {
    html += `<button class="char-pick-card${GoA.myCharacter === c.id ? ' selected' : ''}" data-charid="${c.id}">
      <div class="char-pick-img-wrap"><img src="${GoA.charAvatarPath(c.id)}" alt="${GoA.esc(c.name)}" loading="lazy" /></div>
      <span class="char-pick-name">${GoA.esc(c.name)}</span>
    </button>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('.char-pick-card').forEach(card =>
    card.addEventListener('click', () => GoA.selectCharacter(card.dataset.charid))
  );
};

// ── Character theming ──────────────────────────────────────────────────────
GoA.applyCharacterTheme = function() {
  const view = GoA.$('viewInitiative');
  const banner = GoA.$('initiativeCharBanner');
  const title = GoA.$('initiativePhaseTitle');
  const ability = GoA.$('initiativeCharAbility');
  if (!view || !banner) return;
  const isOnline = GoA.gameMode === 'player';
  if (!isOnline || !GoA.myCharacter) {
    banner.style.display = 'none';
    view.classList.remove('char-themed');
    view.style.removeProperty('--char-accent');
    view.style.removeProperty('--char-accent-dim');
    view.style.removeProperty('background');
    if (title) title.style.display = '';
    return;
  }
  const c = GoA.charData(GoA.myCharacter);
  if (!c) {
    banner.style.display = 'none';
    view.classList.remove('char-themed');
    view.style.removeProperty('background');
    if (title) title.style.display = '';
    return;
  }
  GoA.$('initiativeCharImg').src = GoA.charAvatarPath(c.id);
  const lockIcon = GoA.$('lockBtnIcon');
  if (lockIcon) lockIcon.src = GoA.charIconPath(c.id);
  GoA.$('initiativeCharName').textContent = (c.special ? c.special + ' ' : '') + c.name;
  const subtitle = GoA.$('initiativeCharSubtitle');
  if (subtitle) {
    subtitle.textContent = c.subtitle || '';
  }
  if (ability) {
    const abilityText = c.id === 'emmit' ? 'Reverse Time' : c.id === 'hanu' ? 'Hurry Up' : c.id === 'ignatia' ? 'Chaos Incarnate' : '';
    ability.textContent = abilityText ? '— ' + abilityText : '';
    ability.style.display = abilityText ? '' : 'none';
  }
  const quote = GoA.$('initiativeCharQuote');
  if (quote) {
    // Only pick a new quote when entering the initiative phase
    if (GoA.previousPhase !== 'initiative') {
      const pool = GoA.CHARACTER_QUOTES[c.id] || [];
      GoA.currentCharQuote = pool[Math.floor(Math.random() * pool.length)] || '';
    }
    quote.textContent = GoA.currentCharQuote ? '"' + GoA.currentCharQuote + '"' : '';
  }
  banner.style.display = 'block';
  view.classList.add('char-themed');
  view.style.setProperty('--char-accent', c.accent);
  view.style.setProperty('--char-accent-dim', c.accent + '30');
  // Atmospheric background glow matching the character
  view.style.background = `radial-gradient(ellipse 110% 45% at 50% 0%, ${c.accent}1A 0%, transparent 75%)`;
  if (title) title.style.display = 'none';
};
