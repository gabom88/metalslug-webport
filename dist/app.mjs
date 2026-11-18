import { stateControls } from './saves.mjs';
import { loadGameData } from './game-data.mjs';
import { keyboardControls } from './keyboard.mjs';

const $ = (id) => document.getElementById(id);

/* ---- button groups built from <select data-seg> ----
 * The select stays the source of truth (hidden), so .value and "change"
 * keep working; setting .value from code repaints the buttons. An option
 * marked data-seg-none gets no button: tapping the chosen button again
 * returns to it (mission: none chosen = title screen). */
const selectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
function segmented(select) {
  const group = document.createElement('div');
  group.className = 'seg';
  group.setAttribute('role', 'radiogroup');
  const label = document.getElementById(select.id + '-label');
  if (label) group.setAttribute('aria-labelledby', label.id);
  if (select.hasAttribute('aria-describedby')) group.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
  const none = select.querySelector('option[data-seg-none]');
  const choose = (value) => {
    if (value === selectValue.get.call(select)) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const buttons = Array.from(select.options).filter((option) => !option.hasAttribute('data-seg-none')).map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.dataset.value = option.value;
    button.textContent = option.dataset.short || option.textContent;
    if (option.dataset.short) button.setAttribute('aria-label', option.textContent);
    button.addEventListener('click', () => {
      choose(none && selectValue.get.call(select) === option.value ? none.value : option.value);
    });
    group.append(button);
    return button;
  });
  function sync() {
    const value = selectValue.get.call(select);
    const anyChecked = buttons.some((button) => button.dataset.value === value);
    buttons.forEach((button, index) => {
      const checked = button.dataset.value === value;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked || (!anyChecked && index === 0) ? 0 : -1;
    });
  }
  group.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const next = buttons[(current + step + buttons.length) % buttons.length];
    next.focus();
    choose(next.dataset.value);
  });
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return selectValue.get.call(this); },
    set(value) { selectValue.set.call(this, value); sync(); },
  });
  select.addEventListener('change', sync);
  select.classList.add('seg-source');
  select.after(group);
  sync();
}
document.querySelectorAll('select[data-seg]').forEach(segmented);
const canvas = $('canvas');
const play = $('play');
const status = $('status');
const gameStatus = $('game-status');
const menu = $('game-menu');
const menuButton = $('menu-btn');

/* ---- touch pads: one for single player, one per half in split screen ---- */
const touch = MetalSlugTouch;
let duoRotation = 0;
const duoTouch = [
  touch.create({ storageKey: 'mslug.touch.duo1', layouts: ['duo'], angle: () => duoRotation }),
  touch.create({ storageKey: 'mslug.touch.duo2', layouts: ['duo'], angle: () => duoRotation + 180 }),
];
let duo = false;
let activeTouch = touch;
const touchEditing = () => touch.editing || duoTouch.some((pad) => pad.editing);
const shownPads = () => (duo ? duoTouch : [touch]);

function closeMenu() {
  menu.close();
  if (running) engine._web_pause(false);
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  if (touchEditing()) return;
  clearInput();
  if (running) engine._web_pause(true);
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
$('menu-close').addEventListener('click', closeMenu);
$('menu-resume').addEventListener('click', () => { closeMenu(); canvas.focus({ preventScroll: true }); });
menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
menu.addEventListener('close', () => {
  if (running && !touchEditing() && !keysDialog.open) engine._web_pause(false);
  if (!menu.open) menuButton.setAttribute('aria-expanded', 'false');
});

/* ---- input: player 1 -> web_input(), player 2 -> web_input2() ---- */
/* Start and coin are pulsed so a tap always reaches the game. */
const cabinetBits = [256, 512];
const pulses = new Map();
let engine;
let running = false;
const touchMasks = [0, 0, 0];   // single pad, split-screen P1, split-screen P2
const keyMasks = [0, 0];
const keysDialog = $('keyboard-dialog');
const keyboard = keyboardControls({
  dialog: keysDialog,
  grid: $('keyboard-grid'),
  tabs: $('keyboard-tabs'),
  status: $('keyboard-status'),
  pads: $('keyboard-pads'),
  onInput: (mask1, mask2) => {
    [mask1, mask2].forEach((mask, player) => {
      const pressed = mask & ~keyMasks[player];
      keyMasks[player] = mask;
      for (const bit of cabinetBits) if (pressed & bit) pulse(player, bit);
    });
    syncInput();
  },
  canPlay: () => running && !menu.open && !keysDialog.open && !touchEditing(),
});
function showKeyboard() {
  clearInput();
  if (running) engine._web_pause(true);
  keysDialog.showModal();
}
$('launcher-keys').addEventListener('click', showKeyboard);
$('game-keys').addEventListener('click', () => {
  closeMenu();
  showKeyboard();
});
$('keyboard-close').addEventListener('click', () => keysDialog.close());
$('keyboard-reset').addEventListener('click', keyboard.reset);
keysDialog.addEventListener('close', () => { if (running && !menu.open) engine._web_pause(false); });
keysDialog.addEventListener('click', (event) => { if (event.target === keysDialog) keysDialog.close(); });

function syncInput() {
  if (!running) return;
  const masks = [touchMasks[0] | touchMasks[1] | keyMasks[0], touchMasks[2] | keyMasks[1]];
  for (const key of pulses.keys()) {
    const [player, bit] = key.split(':').map(Number);
    masks[player] |= bit;
  }
  engine._web_input(masks[0]);
  engine._web_input2(masks[1]);
}
function pulse(player, bit) {
  guideProgress(player, bit);
  const key = player + ':' + bit;
  clearTimeout(pulses.get(key));
  pulses.set(key, setTimeout(() => { pulses.delete(key); syncInput(); }, 150));
  syncInput();
}
function touchInput(slot, player) {
  return (mask) => {
    const pressed = mask & ~touchMasks[slot];
    touchMasks[slot] = mask;
    for (const bit of cabinetBits) if (pressed & bit) pulse(player, bit);
    syncInput();
  };
}
touch.init($('touch-layer'), touchInput(0, 0));
duoTouch[0].init($('duo-touch-1'), touchInput(1, 0));
duoTouch[1].init($('duo-touch-2'), touchInput(2, 1));
function clearInput() {
  keyboard.release();
  touch.release();
  for (const pad of duoTouch) pad.release();
  for (const timeout of pulses.values()) clearTimeout(timeout);
  pulses.clear();
  syncInput();
}
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });

function touchShown() { return shownPads().some((pad) => pad.shown); }
function showTouch(show) {
  touch.show(!duo && show);
  for (const pad of duoTouch) pad.show(duo && show);
  $('touch-toggle').setAttribute('aria-pressed', String(show));
  document.body.classList.toggle('touch-playing', show && !duo);
  paintGuide();
}

/* ---- first run: an arrow points at the coin button, then at start ---- */
const GUIDE_KEY = 'mslug.guide.done';
const guide = [null, null];   // per player: 'coin', 'start' or null
function paintGuide() {
  if (duo) duoTouch.forEach((pad, player) => pad.guide(guide[player]));
  else { touch.guide(guide[0]); for (const pad of duoTouch) pad.guide(null); }
  /* Without the touch pad, show the key to press instead. */
  const banner = $('key-guide');
  const step = !duo && !touch.shown && !touchEditing() ? guide[0] : null;
  banner.hidden = !step;
  if (step) {
    const key = document.createElement('kbd');
    key.textContent = keyboard.label(0, step);
    banner.replaceChildren('Pulsa', key, step === 'coin' ? 'para insertar crédito' : 'para empezar');
  }
}
function guideProgress(player, bit) {
  if (guide[player] === 'coin' && bit === 512) guide[player] = 'start';
  else if (guide[player] === 'start' && bit === 256) {
    guide[player] = null;
    remember(GUIDE_KEY, '1');
  } else return;
  paintGuide();
}
function startGuide() {
  if (recall(GUIDE_KEY) === '1') return;
  guide[0] = 'coin';
  if (duo) guide[1] = 'coin';
  paintGuide();
}
$('touch-toggle').addEventListener('click', () => {
  showTouch(!touchShown());
  closeMenu();
});

/* ---- touch editor: the single pad, or both halves at once in split screen ---- */
const editLabels = { dpad: 'Cruceta', stick: 'Stick' };
const editPads = () => (duo ? duoTouch : [touch]);
function paintEditor() {
  const selected = activeTouch.selected;
  const owner = duo ? (activeTouch === duoTouch[1] ? 'J2 · ' : 'J1 · ') : '';
  $('ed-selected').disabled = !selected;
  $('ed-name').textContent = selected ? owner + (editLabels[selected.id] || selected.label) : '—';
  if (selected) $('ed-size').value = selected.size;
  $('ed-hide').disabled = ['dpad', 'stick'].includes(selected?.id);
  $('ed-opacity').value = activeTouch.settings.opacity;
  $('ed-mode').value = activeTouch.settings.mode;
  $('ed-haptics').checked = activeTouch.settings.haptics;
}
/* Picking a control in one half drops the selection in the other. */
function editAll() {
  for (const pad of editPads()) {
    pad.setEditing(true, {
      onSelect: (selected) => {
        if (selected) activeTouch = pad;
        for (const other of editPads()) if (other !== pad) other.deselect();
        paintEditor();
      },
    });
  }
}
const editor = $('touch-editor');
function centerEditor() {
  editor.style.left = editor.style.top = editor.style.transform = '';
}
let previousTouch = false;
function openEditor() {
  closeMenu();
  previousTouch = touchShown();
  showTouch(true);
  activeTouch = editPads()[0];
  engine._web_pause(true);
  editAll();
  $('ed-hint').textContent = duo
    ? 'Toca cualquier control del J1 o del J2 y arrástralo. Opacidad, dirección y vibración se aplican a los dos.'
    : 'Toca un control para seleccionarlo y arrástralo para moverlo. Cada orientación conserva su propio diseño.';
  document.body.classList.toggle('duo-editing', duo);
  centerEditor();
  editor.hidden = false;
  paintEditor();
  $('ed-done').focus({ preventScroll: true });
}
$('touch-config').addEventListener('click', openEditor);
/* Drag the panel by its title bar, kept inside the screen. */
{
  let grab = null;
  const handle = $('ed-handle');
  handle.addEventListener('pointerdown', (event) => {
    const rect = editor.getBoundingClientRect();
    grab = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    editor.style.transform = 'none';
    editor.style.left = rect.left + 'px';
    editor.style.top = rect.top + 'px';
    try { handle.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!grab || grab.id !== event.pointerId) return;
    const rect = editor.getBoundingClientRect();
    const left = Math.max(0, Math.min(innerWidth - rect.width, event.clientX - grab.dx));
    const top = Math.max(0, Math.min(innerHeight - rect.height, event.clientY - grab.dy));
    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
  });
  const drop = (event) => { if (grab && grab.id === event.pointerId) grab = null; };
  handle.addEventListener('pointerup', drop);
  handle.addEventListener('pointercancel', drop);
  window.addEventListener('resize', () => { if (!editor.hidden && editor.style.transform === 'none') centerEditor(); });
}
$('ed-size').addEventListener('input', (event) => activeTouch.updateSelected({ size: Number(event.target.value) }));
$('ed-hide').addEventListener('click', () => {
  if (['dpad', 'stick'].includes(activeTouch.selected?.id)) return;
  activeTouch.updateSelected({ visible: false });
  editAll();
  paintEditor();
});
$('ed-opacity').addEventListener('input', (event) => {
  for (const pad of editPads()) pad.setSetting('opacity', Number(event.target.value));
});
$('ed-mode').addEventListener('change', (event) => {
  /* Cross or stick is shared by the single pad and both split-screen pads. */
  for (const pad of [touch, ...duoTouch]) pad.setSetting('mode', event.target.value);
  editAll();
  paintEditor();
});
$('ed-haptics').addEventListener('change', (event) => {
  for (const pad of editPads()) pad.setSetting('haptics', event.target.checked);
});
$('ed-showall').addEventListener('click', () => { for (const pad of editPads()) pad.showAll(); paintEditor(); });
$('ed-reset').addEventListener('click', () => {
  for (const pad of editPads()) pad.reset();
  editAll();
  paintEditor();
});
$('ed-done').addEventListener('click', () => {
  for (const pad of editPads()) pad.setEditing(false);
  engine._web_pause(false);
  editor.hidden = true;
  document.body.classList.remove('duo-editing');
  showTouch(previousTouch);
  paintGuide();
  menuButton.focus({ preventScroll: true });
});

/* ---- restart, confirmed with an in-game panel (not the browser's) ---- */
const restartBox = $('restart-confirm');
function closeRestart(focusButton) {
  restartBox.hidden = true;
  if (focusButton) $('restart').focus({ preventScroll: true });
}
$('restart').addEventListener('click', () => {
  restartBox.hidden = false;
  $('restart-cancel').focus({ preventScroll: true });
});
$('restart-cancel').addEventListener('click', () => closeRestart(true));
restartBox.addEventListener('click', (event) => { if (event.target === restartBox) closeRestart(true); });
menu.addEventListener('cancel', (event) => {
  if (restartBox.hidden) return;
  event.preventDefault();
  closeRestart(true);
});
menu.addEventListener('close', () => closeRestart(false));
$('restart-ok').addEventListener('click', async () => {
  closeRestart(false);
  closeMenu();
  clearInput();
  menuButton.disabled = true;
  gameStatus.textContent = 'Reiniciando…';
  engine._web_reset();
  while (!engine._web_is_ready()) await new Promise(requestAnimationFrame);
  menuButton.disabled = false;
  gameStatus.textContent = '';
  canvas.focus({ preventScroll: true });
});

$('back').addEventListener('click', () => location.reload());
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', async () => {
  closeMenu();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (duo) await document.documentElement.requestFullscreen();
    else await $('arcade').requestFullscreen();
    if (duo) lockPortrait();
    canvas.focus({ preventScroll: true });
  } catch {
    gameStatus.textContent = 'El navegador no pudo abrir la pantalla completa.';
  }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').querySelector('.tile-label').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});

/* ---- split screen for two players ---- */
const duoBox = $('duo');
function lockPortrait() {
  try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch { /* not supported */ }
}
function deviceAngle() {
  const angle = screen.orientation ? screen.orientation.angle : Number(window.orientation) || 0;
  return ((angle % 360) + 360) % 360;
}
/* If the device turns anyway (no orientation lock, e.g. iPhone), turn the
 * split screen the other way so it stays put in the players' hands. */
function fitDuo() {
  if (!duo) return;
  const angle = deviceAngle();
  const turned = innerWidth > innerHeight && (angle === 90 || angle === 270);
  duoRotation = turned ? (angle === 90 ? -90 : 90) : 0;
  Object.assign(duoBox.style, turned ? {
    inset: 'auto', width: innerHeight + 'px', height: innerWidth + 'px',
    left: (innerWidth - innerHeight) / 2 + 'px', top: (innerHeight - innerWidth) / 2 + 'px',
    transform: `rotate(${duoRotation}deg)`,
  } : { inset: '', width: '', height: '', left: '', top: '', transform: '' });
  for (const pad of duoTouch) pad.layout();
}
for (const event of ['resize', 'orientationchange']) {
  window.addEventListener(event, () => { fitDuo(); setTimeout(fitDuo, 300); });
}
screen.orientation?.addEventListener?.('change', () => { fitDuo(); setTimeout(fitDuo, 300); });

const DUO_W = 304;
const DUO_H = 224;
const duoContexts = [$('duo-canvas-1'), $('duo-canvas-2')].map((c) => c.getContext('2d', { alpha: false }));
const duoImage = new ImageData(DUO_W, DUO_H);
const duoPixels = new Uint32Array(duoImage.data.buffer);
/* Called by the engine with each finished frame (ARGB8888, 320 wide). */
function drawDuo(pointer) {
  const source = new Uint32Array(engine.HEAPU8.buffer, pointer, 320 * DUO_H);
  let out = 0;
  for (let y = 0; y < DUO_H; y++) {
    let at = y * 320 + 8;
    for (let x = 0; x < DUO_W; x++) {
      const p = source[at++];
      duoPixels[out++] = 0xff000000 | ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff);
    }
  }
  for (const context of duoContexts) context.putImageData(duoImage, 0, 0);
}
function startDuo() {
  duo = true;
  document.body.classList.add('duo-playing');
  duoBox.hidden = false;
  /* Same direction control (cross or stick) as in single-player mode. */
  for (const pad of duoTouch) pad.setSetting('mode', touch.settings.mode);
  engine.duoFrame = drawDuo;
  engine._web_duo(1);
  fitDuo();
}

/* ---- launcher choices ---- */
function remember(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
function recall(key) { try { return localStorage.getItem(key); } catch { return null; } }
$('split-screen').checked = recall('mslug.players') === '2';
$('split-screen').addEventListener('change', (event) => remember('mslug.players', event.target.checked ? '2' : '1'));
$('autoload').checked = recall('mslug.autoload') !== 'false';
$('autoload').addEventListener('change', (event) => remember('mslug.autoload', String(event.target.checked)));

let saves;
play.addEventListener('click', async () => {
  const twoPlayers = $('split-screen').checked;
  const coarse = matchMedia('(pointer: coarse)').matches;
  /* Fullscreen and the orientation lock need this click (user gesture). */
  if (twoPlayers && coarse && document.fullscreenEnabled) {
    document.documentElement.requestFullscreen().then(lockPortrait).catch(() => {});
  }
  $('launcher').hidden = true;
  $('arcade').hidden = false;
  document.body.classList.add('playing');
  running = true;
  menuButton.disabled = true;
  gameStatus.textContent = 'Iniciando partida…';
  if (twoPlayers) startDuo();
  showTouch(twoPlayers || coarse);
  try {
    engine._web_options(Number($('mission').value), $('double-jump').checked);
    engine._web_extra_options($('turbo-mod').checked, $('mirror-mod').checked);
    engine._web_mod_options(false, Number($('blood-mode').value));
    setOverclock($('overclock').value);
    touch.setSetting('dashEnabled', false);
    for (const pad of duoTouch) pad.setSetting('dashEnabled', false);
    const code = engine.callMain(['--rom-path', '/roms', '--scale', '1']);
    while (!engine._web_is_ready()) await new Promise(requestAnimationFrame);
    menuButton.disabled = false;
    gameStatus.textContent = '';
    if (code) throw new Error(gameStatus.textContent || 'El motor no pudo iniciar.');
    let resumed = false;
    if ($('autoload').checked && saves?.latest) {
      if ((resumed = await saves.loadLatest())) {
        gameStatus.textContent = 'Partida guardada cargada · ' + saves.time(saves.latest);
        setTimeout(() => { if (gameStatus.textContent.startsWith('Partida guardada')) gameStatus.textContent = ''; }, 3000);
      } else {
        gameStatus.textContent = $('save-status').textContent;
        setTimeout(() => { gameStatus.textContent = ''; }, 4000);
      }
    }
    /* A chosen mission inserts the coin and presses start by itself. */
    if (!resumed && $('mission').value === '0') startGuide();
    canvas.focus({ preventScroll: true });
  } catch (error) {
    gameStatus.textContent = error.message;
    running = false;
    menuButton.disabled = false;
  }
});

function setDisplayMode(mode) {
  const value = mode === 'stretch' ? 'stretch' : 'fit';
  document.body.classList.toggle('stretched', value === 'stretch');
  $('display-mode').value = $('game-display-mode').value = value;
  engine?._web_display_mode(value === 'stretch');
  remember('mslug.display-mode', value);
}
let savedDisplayMode = recall('mslug.display-mode') || 'fit';
setDisplayMode(savedDisplayMode);
for (const id of ['display-mode', 'game-display-mode']) $(id).addEventListener('change', (event) => {
  savedDisplayMode = event.target.value; setDisplayMode(savedDisplayMode);
});
/* Overclock: ×2 by default; the player's choice is remembered. */
function setOverclock(value) {
  const factor = [1, 2, 3, 4].includes(Number(value)) ? Number(value) : 2;
  $('overclock').value = $('game-overclock').value = String(factor);
  engine?._web_overclock_set(factor);
  remember('mslug.overclock', String(factor));
}
setOverclock(recall('mslug.overclock') || '2');
for (const id of ['overclock', 'game-overclock']) $(id).addEventListener('change', (event) => setOverclock(event.target.value));

const installButton = $('install-app');
let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = undefined;
  installButton.hidden = true;
  try { await prompt.prompt(); } catch (error) { console.warn(error); }
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  installButton.hidden = true;
});

if (document.readyState === 'loading') {
  await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}
try {
  let gameData = await loadGameData();
  engine = await window.createMetalSlug({
    getPreloadedPackage: (_name, expectedSize) => {
      if (gameData?.byteLength !== expectedSize) throw new Error('El paquete de datos no coincide con el motor.');
      const result = gameData;
      gameData = null;
      return result;
    },
    canvas,
    setStatus: (message) => { status.textContent = message ? 'Cargando juego…' : ''; },
    printErr: (message) => {
      console.warn(message);
      if (message.startsWith('error:')) gameStatus.textContent = message;
    },
  });
  status.textContent = '';
  setDisplayMode(savedDisplayMode);
  setOverclock($('overclock').value);
  saves = await stateControls({
    engine, clearInput, doubleJump: $('double-jump'),
    onRestoreMods: () => {
      $('turbo-mod').checked = Boolean(engine._web_turbo_get());
      $('mirror-mod').checked = Boolean(engine._web_mirror_get());
      $('dash-mod').checked = false;
      engine._web_mod_options(false, engine._web_blood_mode_get());
      $('blood-mode').value = String(engine._web_blood_mode_get());
      touch.setSetting('dashEnabled', $('dash-mod').checked);
    },
    canSave: () => running && Boolean(engine._web_is_ready()),
    resume: () => { closeMenu(); canvas.focus({ preventScroll: true }); },
  });
  play.disabled = false;
} catch (error) {
  status.textContent = 'No se pudo cargar el juego. Recarga la página para reintentar.';
  console.error(error);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
