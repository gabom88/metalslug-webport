import { stateControls } from './saves.mjs';
import { loadGameData } from './game-data.mjs';
import { keyboardControls } from './keyboard.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const play = $('play');
const status = $('status');
const gameStatus = $('game-status');
const touch = MetalSlugTouch;
const menu = $('game-menu');
const menuButton = $('menu-btn');
function closeMenu() {
  menu.close();
  if (running) engine._web_pause(false);
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  if (touch.editing) return;
  clearInput();
  if (running) engine._web_pause(true);
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
$('menu-close').addEventListener('click', closeMenu);
$('menu-resume').addEventListener('click', () => { closeMenu(); canvas.focus({ preventScroll: true }); });
menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
menu.addEventListener('close', () => {
  if (running && !touch.editing && !keysDialog.open) engine._web_pause(false);
  if (!menu.open) menuButton.setAttribute('aria-expanded', 'false');
});

const cabinetBits = [256, 512];
const pulses = new Map();
let engine;
let running = false;
let touchMask = 0;
let keyMask = 0;
const keysDialog = $('keyboard-dialog');
const keyboard = keyboardControls({
  dialog: keysDialog,
  grid: $('keyboard-grid'),
  status: $('keyboard-status'),
  onInput: (mask) => {
    const pressed = mask & ~keyMask;
    keyMask = mask;
    for (const bit of cabinetBits) if (pressed & bit) pulse(bit);
    syncInput();
  },
  canPlay: () => running && !menu.open && !keysDialog.open && !touch.editing,
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
keysDialog.addEventListener('close', () => { if (running) engine._web_pause(false); });
keysDialog.addEventListener('click', (event) => { if (event.target === keysDialog) keysDialog.close(); });

function syncInput() {
  if (!running) return;
  let mask = touchMask | keyMask;
  for (const bit of pulses.keys()) mask |= bit;
  engine._web_input(mask);
}
function pulse(bit) {
  clearTimeout(pulses.get(bit));
  pulses.set(bit, setTimeout(() => { pulses.delete(bit); syncInput(); }, 150));
  syncInput();
}
touch.init($('touch-layer'), (mask) => {
  const pressed = mask & ~touchMask;
  touchMask = mask;
  for (const bit of cabinetBits) if (pressed & bit) pulse(bit);
  syncInput();
});
function clearInput() {
  keyboard.release();
  touch.release();
  for (const timeout of pulses.values()) clearTimeout(timeout);
  pulses.clear();
  syncInput();
}
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
for (const button of document.querySelectorAll('[data-bit]')) {
  button.addEventListener('click', () => {
    const bit = Number(button.dataset.bit);
    pulse(bit);
    if (bit === 256) {
      closeMenu();
      canvas.focus({ preventScroll: true });
    }
  });
}

function showTouch(show) {
  touch.show(show);
  $('touch-toggle').setAttribute('aria-pressed', String(show));
  document.body.classList.toggle('touch-playing', show);
}
$('touch-toggle').addEventListener('click', () => {
  showTouch(!touch.shown);
  closeMenu();
});
const editLabels = { dpad: 'Cruceta', stick: 'Stick' };
function paintEditor() {
  const selected = touch.selected;
  $('ed-selected').disabled = !selected;
  $('ed-name').textContent = selected ? (editLabels[selected.id] || selected.label) : '—';
  if (selected) $('ed-size').value = selected.size;
  $('ed-hide').disabled = ['dpad', 'stick'].includes(selected?.id);
  $('ed-opacity').value = touch.settings.opacity;
  $('ed-mode').value = touch.settings.mode;
  $('ed-haptics').checked = touch.settings.haptics;
}
let previousTouch = false;
$('touch-config').addEventListener('click', () => {
  closeMenu();
  previousTouch = touch.shown;
  showTouch(true);
  engine._web_pause(true);
  touch.setEditing(true, { onSelect: paintEditor });
  $('touch-editor').hidden = false;
  paintEditor();
  $('ed-done').focus({ preventScroll: true });
});
$('ed-size').addEventListener('input', (event) => touch.updateSelected({ size: Number(event.target.value) }));
$('ed-hide').addEventListener('click', () => {
  if (['dpad', 'stick'].includes(touch.selected?.id)) return;
  touch.updateSelected({ visible: false });
  touch.setEditing(true);
  paintEditor();
});
$('ed-opacity').addEventListener('input', (event) => touch.setSetting('opacity', Number(event.target.value)));
$('ed-mode').addEventListener('change', (event) => {
  touch.setSetting('mode', event.target.value);
  touch.setEditing(true);
  paintEditor();
});
$('ed-haptics').addEventListener('change', (event) => touch.setSetting('haptics', event.target.checked));
$('ed-showall').addEventListener('click', () => { touch.showAll(); paintEditor(); });
$('ed-reset').addEventListener('click', () => { touch.reset(); touch.setEditing(true); paintEditor(); });
$('ed-done').addEventListener('click', () => {
  touch.setEditing(false);
  engine._web_pause(false);
  $('touch-editor').hidden = true;
  showTouch(previousTouch);
  menuButton.focus({ preventScroll: true });
});

$('back').addEventListener('click', () => location.reload());
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', async () => {
  closeMenu();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('arcade').requestFullscreen();
    canvas.focus({ preventScroll: true });
  } catch {
    gameStatus.textContent = 'El navegador no pudo abrir la pantalla completa.';
  }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').querySelector('.tile-label').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});

play.addEventListener('click', async () => {
  $('launcher').hidden = true;
  $('arcade').hidden = false;
  document.body.classList.add('playing');
  running = true;
  menuButton.disabled = true;
  gameStatus.textContent = 'Iniciando partida…';
  showTouch(matchMedia('(pointer: coarse)').matches);
  try {
    engine._web_options(Number($('mission').value), $('double-jump').checked);
    engine._web_extra_options($('turbo-mod').checked, $('mirror-mod').checked);
    engine._web_mod_options(false, Number($('blood-mode').value));
    touch.setSetting('dashEnabled', false);
    const code = engine.callMain(['--rom-path', '/roms', '--scale', '1']);
    while (!engine._web_is_ready()) await new Promise(requestAnimationFrame);
    menuButton.disabled = false;
    gameStatus.textContent = '';
    if (code) throw new Error(gameStatus.textContent || 'El motor no pudo iniciar.');
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
 try { localStorage.setItem('mslug.display-mode', value); } catch {}
}
let savedDisplayMode = 'fit';
try { savedDisplayMode = localStorage.getItem('mslug.display-mode') || 'fit'; } catch {}
setDisplayMode(savedDisplayMode);
for (const id of ['display-mode', 'game-display-mode']) $(id).addEventListener('change', event => {
 savedDisplayMode = event.target.value; setDisplayMode(savedDisplayMode);
});
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
  await stateControls({
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
