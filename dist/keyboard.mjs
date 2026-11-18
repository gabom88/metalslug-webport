/* Keyboard and gamepad bindings in three groups: player 1, player 2 and the
 * cabinet (system) switches. Each action has one key and one gamepad input
 * ("b<n>" = button n, "a<n>+"/"a<n>-" = axis n). The first connected
 * gamepad is player 1 (and the system group), the second player 2; the left
 * stick always moves as well. */

/* Groups 0 (player 1) and 2 (system) go to web_input(); group 1 (player 2)
 * goes to web_input2(). */
const SYSTEM = 2;
const target = (group) => (group === 1 ? 1 : 0);
const PLAYERS = [
  [
    ['up', 'Arriba', 1, 'KeyW', 'b12'], ['down', 'Abajo', 2, 'KeyS', 'b13'],
    ['left', 'Izquierda', 4, 'KeyA', 'b14'], ['right', 'Derecha', 8, 'KeyD', 'b15'],
    ['fire', 'Disparo', 16, 'KeyN', 'b0'], ['jump', 'Salto', 32, 'Space', 'b1'],
    ['grenade', 'Granada', 64, 'KeyM', 'b2'], ['d', 'Botón D', 128, 'KeyV', 'b3'],
    ['start', 'Inicio', 256, 'Digit1', 'b9'], ['coin', 'Moneda', 512, 'Digit5', 'b8'],
    /* Dash (experimental, bit 32768) is set aside for now; to bring it back:
     * ['dash', 'Dash', 32768, 'ShiftLeft', 'b5'], */
  ],
  [
    ['up', 'Arriba', 1, 'ArrowUp', 'b12'], ['down', 'Abajo', 2, 'ArrowDown', 'b13'],
    ['left', 'Izquierda', 4, 'ArrowLeft', 'b14'], ['right', 'Derecha', 8, 'ArrowRight', 'b15'],
    ['fire', 'Disparo', 16, 'KeyJ', 'b0'], ['jump', 'Salto', 32, 'KeyK', 'b1'],
    ['grenade', 'Granada', 64, 'KeyL', 'b2'], ['d', 'Botón D', 128, 'KeyI', 'b3'],
    ['start', 'Inicio', 256, 'Digit2', 'b9'], ['coin', 'Moneda', 512, 'Digit6', 'b8'],
  ],
  [
    ['select', 'Selección', 4096, 'Digit3', 'b4'], ['service', 'Servicio', 8192, 'Digit9', null],
    ['test', 'Prueba', 16384, 'F2', null],
  ],
].map((list) => list.map(([id, name, bit, key, pad]) => ({ id, name, bit, key, pad })));
const DIRS = { up: 1, down: 2, left: 4, right: 8 };

const storageKey = 'mslug.controls.v3';
const legacyKey = 'mslug.keyboard.v1';
/* Order of the old single-list format (v1). */
const legacyOrder = ['up', 'down', 'left', 'right', 'fire', 'jump', 'grenade', 'd', 'start', 'coin',
  '2:start', '2:coin', 's:select', 's:service', 's:test', 'dash'];
/* Earlier default layouts: players who never changed them get the new defaults. */
const legacyOldDefaults = [
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'Digit1',
    'Digit5', 'Digit2', 'Digit6', 'Digit3', 'Digit9', 'F2', 'ShiftLeft'],
  ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyB', 'KeyN', 'KeyM', 'KeyV', 'Digit1',
    'Digit5', 'Digit2', 'Digit6', 'Digit3', 'Digit9', 'F2', 'ShiftLeft'],
].map((list) => list.join());
const excluded = /^(Escape|Tab|Meta|Control|Alt|Shift|CapsLock|NumLock|ScrollLock|ContextMenu|Unidentified|F[0-9]+$)/;
const usable = (code) => typeof code === 'string' && code.length > 0 && code.length <= 30 &&
  (!excluded.test(code) || code === 'F2' || code === 'ShiftLeft' || code === 'ShiftRight');
const validPad = (pad) => pad === null || (typeof pad === 'string' && /^(b\d{1,2}|a\d[+-])$/.test(pad));

function defaults() {
  return PLAYERS.map((list) => list.map(({ key, pad }) => ({ key, pad })));
}
function valid(bindings) {
  if (!Array.isArray(bindings) || bindings.length !== PLAYERS.length) return false;
  const keys = [];
  for (let p = 0; p < PLAYERS.length; p++) {
    const list = bindings[p];
    if (!Array.isArray(list) || list.length !== PLAYERS[p].length) return false;
    for (const entry of list) {
      if (!entry || !usable(entry.key) || !validPad(entry.pad)) return false;
      keys.push(entry.key);
    }
  }
  return new Set(keys).size === keys.length;
}
function readBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (valid(saved)) return saved;
  } catch { /* fall through */ }
  const result = defaults();
  try {
    const old = JSON.parse(localStorage.getItem(legacyKey));
    if (Array.isArray(old) && old.length === legacyOrder.length - 1) old.push('ShiftLeft');
    if (Array.isArray(old) && old.length === legacyOrder.length && !legacyOldDefaults.includes(old.join())) {
      const migrated = defaults();
      legacyOrder.forEach((name, i) => {
        const [player, id] = name.startsWith('2:') ? [1, name.slice(2)]
          : name.startsWith('s:') ? [SYSTEM, name.slice(2)] : [0, name];
        const index = PLAYERS[player].findIndex((action) => action.id === id);
        if (index >= 0) migrated[player][index].key = old[i];
      });
      /* Player 2 movement must not reuse player 1's keys. */
      const used = new Set(migrated[0].concat(migrated[SYSTEM], migrated[1].slice(8)).map((entry) => entry.key));
      migrated[1].forEach((entry, i) => { if (i < 8 && used.has(entry.key)) entry.key = ''; });
      for (const entry of migrated[1]) {
        if (entry.key) continue;
        entry.key = ['KeyU', 'KeyO', 'KeyH', 'KeyY', 'KeyP', 'KeyG', 'KeyT', 'KeyR'].find((code) =>
          !migrated.flat().some((other) => other.key === code));
      }
      if (valid(migrated)) return migrated;
    }
  } catch { /* fall through */ }
  return result;
}

export function keyLabel(code) {
  const named = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift izq.', ShiftRight: 'Shift der.', Space: 'Espacio', Enter: 'Intro', Backspace: 'Retroceso', Delete: 'Supr',
    Comma: ',', Period: '.', Minus: '-', Equal: '=', Slash: '/', Semicolon: 'Ñ', Quote: '´', BracketLeft: '`', BracketRight: '+',
  };
  return named[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
}
/* Names for the "standard" gamepad layout (Xbox naming, most common). */
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3',
  '↑ cruceta', '↓ cruceta', '← cruceta', '→ cruceta', 'Guía'];
export function padLabel(pad) {
  if (!pad) return '—';
  if (pad[0] === 'b') return PAD_NAMES[Number(pad.slice(1))] || 'Botón ' + pad.slice(1);
  const axis = Number(pad[1]);
  const sign = pad[2];
  const stick = { 0: sign === '+' ? 'Stick izq. →' : 'Stick izq. ←', 1: sign === '+' ? 'Stick izq. ↓' : 'Stick izq. ↑',
    2: sign === '+' ? 'Stick der. →' : 'Stick der. ←', 3: sign === '+' ? 'Stick der. ↓' : 'Stick der. ↑' };
  return stick[axis] || 'Eje ' + axis + ' ' + sign;
}

function connectedPads() {
  const list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  return list.filter((pad) => pad && pad.connected);
}
function padActive(pad, binding) {
  if (!binding) return false;
  if (binding[0] === 'b') {
    const button = pad.buttons[Number(binding.slice(1))];
    return Boolean(button && (button.pressed || button.value > 0.5));
  }
  const value = pad.axes[Number(binding[1])] || 0;
  return binding[2] === '+' ? value > 0.5 : value < -0.5;
}

export function keyboardControls({ dialog, grid, tabs, status, pads, onInput, canPlay }) {
  let bindings = readBindings();
  let player = 0;
  let pending = -1;
  let padBaseline = null;
  const held = PLAYERS.map(() => new Set());
  const padMasks = [0, 0, 0];
  let rows = [];

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(bindings)); return ''; }
    catch { return 'Controles aplicados durante esta sesión.'; }
  }
  function keyMask(p) {
    let mask = 0;
    for (const code of held[p]) {
      const index = bindings[p].findIndex((entry) => entry.key === code);
      if (index >= 0) mask |= PLAYERS[p][index].bit;
    }
    return mask;
  }
  let lastMasks = [-1, -1];
  function emit() {
    const masks = [0, 0];
    PLAYERS.forEach((_, group) => { masks[target(group)] |= keyMask(group) | padMasks[group]; });
    if (masks[0] === lastMasks[0] && masks[1] === lastMasks[1]) return;
    lastMasks = masks;
    onInput(masks[0], masks[1]);
  }
  function release() {
    for (const set of held) set.clear();
    padMasks.fill(0);
    lastMasks = [-1, -1];
    emit();
  }

  function build() {
    grid.textContent = '';
    rows = PLAYERS[player].map((action, index) => {
      const button = document.createElement('button');
      const label = document.createElement('span');
      const key = document.createElement('kbd');
      const pad = document.createElement('span');
      button.type = 'button';
      label.className = 'bind-name';
      pad.className = 'pad-chip';
      label.textContent = action.name;
      button.append(label, key, pad);
      button.addEventListener('click', () => {
        pending = pending === index ? -1 : index;
        padBaseline = pending >= 0 ? snapshot() : null;
        paint();
      });
      grid.append(button);
      return { button, key, pad };
    });
  }
  function paint(message = '') {
    rows.forEach(({ button, key, pad }, index) => {
      const entry = bindings[player][index];
      key.textContent = pending === index ? '…' : keyLabel(entry.key);
      pad.textContent = pending === index ? '…' : padLabel(entry.pad);
      pad.title = 'Mando';
      button.setAttribute('aria-pressed', String(pending === index));
      button.setAttribute('aria-label', PLAYERS[player][index].name + ': tecla ' + keyLabel(entry.key) + ', mando ' + padLabel(entry.pad));
    });
    for (const tab of tabs.querySelectorAll('[role=tab]')) {
      const selected = Number(tab.dataset.player) === player;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    status.textContent = pending < 0 ? message
      : 'Pulsa una tecla o un botón del mando para «' + PLAYERS[player][pending].name.toLowerCase() + '». Esc cancela.';
    paintPads();
  }
  function paintPads() {
    const list = connectedPads();
    pads.textContent = list.length
      ? list.slice(0, 2).map((pad, i) => 'J' + (i + 1) + ': ' + pad.id.replace(/\s*\(.*$/, '').slice(0, 40)).join(' · ')
      : 'Sin mandos conectados. Conecta uno por USB o Bluetooth y pulsa cualquier botón.';
  }
  for (const tab of tabs.querySelectorAll('[role=tab]')) {
    tab.addEventListener('click', () => { player = Number(tab.dataset.player); pending = -1; build(); paint(); });
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      player = (player + (event.key === 'ArrowRight' ? 1 : PLAYERS.length - 1)) % PLAYERS.length;
      pending = -1; build(); paint();
      tabs.querySelector(`[data-player="${player}"]`).focus();
    });
  }

  /* Assign a key or pad input; if another action already uses it, swap. */
  function assign(field, value) {
    const current = bindings[player][pending];
    if (field === 'key') {
      for (const list of bindings) {
        const other = list.find((entry) => entry !== current && entry.key === value);
        if (other) other.key = current.key;
      }
    } else {
      /* Player 1 and the system group read the same gamepad. */
      for (const group of PLAYERS.keys()) {
        if (target(group) !== target(player)) continue;
        const other = bindings[group].find((entry) => entry !== current && entry.pad === value);
        if (other) other.pad = current.pad;
      }
    }
    current[field] = value;
    pending = -1;
    padBaseline = null;
    release();
    paint(save() || (field === 'key' ? 'Tecla guardada.' : 'Botón del mando guardado.'));
  }
  function reset() {
    pending = -1;
    bindings[player] = defaults()[player];
    /* Keep keys unique if another group took one of these defaults. */
    for (const group of PLAYERS.keys()) {
      if (group === player) continue;
      const other = bindings[group];
      for (const entry of bindings[player]) {
        const clash = other.find((o) => o.key === entry.key);
        if (clash) clash.key = defaults()[group][other.indexOf(clash)].key;
      }
    }
    if (!valid(bindings)) bindings = defaults();
    release();
    paint(save() || (player === SYSTEM ? 'Controles del sistema restaurados.' : 'Controles del jugador ' + (player + 1) + ' restaurados.'));
  }

  window.addEventListener('keydown', (event) => {
    if (dialog.open && pending >= 0) {
      if (event.repeat) return;
      if (event.code !== 'Escape' && (!usable(event.code) || event.altKey || event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') { pending = -1; padBaseline = null; paint(); }
      else assign('key', event.code);
      return;
    }
    if (!canPlay() || event.altKey || event.ctrlKey || event.metaKey) return;
    const p = bindings.findIndex((list) => list.some((entry) => entry.key === event.code));
    if (p < 0) return;
    /* During play (no dialog open) Space is a game key even on a focused button. */
    if (event.code === 'Enter' && event.target instanceof HTMLButtonElement) return;
    if (event.code === 'Enter' && event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    event.stopPropagation();
    held[p].add(event.code);
    emit();
  }, true);
  window.addEventListener('keyup', (event) => {
    if (!held.some((set) => set.delete(event.code))) return;
    event.preventDefault();
    event.stopPropagation();
    emit();
  }, true);
  dialog.addEventListener('close', () => { pending = -1; padBaseline = null; paint(); });

  /* ---- gamepads ---- */
  function snapshot() {
    return connectedPads().map((pad) => ({
      index: pad.index,
      buttons: pad.buttons.map((b) => b.pressed || b.value > 0.5),
      axes: pad.axes.slice(),
    }));
  }
  /* A pad input that became active since the capture started. */
  function newPadInput() {
    for (const pad of connectedPads()) {
      const base = padBaseline?.find((entry) => entry.index === pad.index);
      for (let i = 0; i < pad.buttons.length; i++) {
        const on = pad.buttons[i].pressed || pad.buttons[i].value > 0.5;
        if (on && !(base?.buttons[i])) return 'b' + i;
      }
      for (let i = 0; i < pad.axes.length; i++) {
        const value = pad.axes[i];
        const before = base?.axes[i] || 0;
        if (Math.abs(value) > 0.7 && Math.abs(before) < 0.4) return 'a' + i + (value > 0 ? '+' : '-');
      }
      if (!base) padBaseline = (padBaseline || []).concat(snapshot().filter((entry) => entry.index === pad.index));
    }
    return null;
  }
  function poll() {
    if (dialog.open && pending >= 0) {
      const input = newPadInput();
      if (input) assign('pad', input);
    }
    const list = connectedPads();
    const playing = canPlay();
    for (const p of PLAYERS.keys()) {
      const pad = list[target(p)];
      let mask = 0;
      if (pad && playing) {
        PLAYERS[p].forEach((action, i) => { if (padActive(pad, bindings[p][i].pad)) mask |= action.bit; });
      }
      if (pad && playing && p !== SYSTEM) {
        const x = pad.axes[0] || 0;
        const y = pad.axes[1] || 0;
        if (x < -0.5) mask |= DIRS.left;
        if (x > 0.5) mask |= DIRS.right;
        if (y < -0.5) mask |= DIRS.up;
        if (y > 0.5) mask |= DIRS.down;
      }
      padMasks[p] = mask;
    }
    emit();
    requestAnimationFrame(poll);
  }
  const refreshPads = () => { if (dialog.open) paintPads(); };
  window.addEventListener('gamepadconnected', refreshPads);
  window.addEventListener('gamepaddisconnected', refreshPads);
  requestAnimationFrame(poll);

  build();
  paint();
  /* Key name for an action, for on-screen hints. */
  function label(p, id) {
    for (const group of [p, SYSTEM]) {
      const index = PLAYERS[group].findIndex((action) => action.id === id);
      if (index >= 0) return keyLabel(bindings[group][index].key);
    }
    return '';
  }
  return { release, reset, label };
}
