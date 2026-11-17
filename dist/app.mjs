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
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  if (touch.editing) return;
  clearInput();
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
$('menu-close').addEventListener('click', closeMenu);
menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
menu.addEventListener('close', () => {
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
  keysDialog.showModal();
}
$('launcher-keys').addEventListener('click', showKeyboard);
$('game-keys').addEventListener('click', () => {
  closeMenu();
  showKeyboard();
});
$('keyboard-close').addEventListener('click', () => keysDialog.close());
$('keyboard-reset').addEventListener('click', keyboard.reset);
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
  $('fullscreen').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});

play.addEventListener('click', () => {
  $('launcher').hidden = true;
  $('arcade').hidden = false;
  document.body.classList.add('playing');
  running = true;
  showTouch(matchMedia('(pointer: coarse)').matches);
  try {
    const code = engine.callMain(['--rom-path', '/roms', '--scale', '1']);
    if (code) throw new Error(gameStatus.textContent || 'El motor no pudo iniciar.');
    canvas.focus({ preventScroll: true });
  } catch (error) {
    gameStatus.textContent = error.message;
    running = false;
  }
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
  play.disabled = false;
} catch (error) {
  status.textContent = 'No se pudo cargar el juego. Recarga la página para reintentar.';
  console.error(error);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
