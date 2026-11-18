function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mslug-save-states', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('slots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function slot(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('slots', mode);
      const request = action(tx.objectStore('slots'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la partida.'));
    });
  } finally { db.close(); }
}
/* Earlier engines whose save-state layout is identical to this one
 * (only the page-side input changed), so their saves still load. */
const COMPATIBLE_BUILDS = [
  '0ec7570a6d935e430544f9cf5e2cdd3c719cd72da0b160ff5ba00d54f00640f1',
  '340eb96f89a4bbe9d7d60ce5312739e3983b076e053ace0f9f3f69c54d0c55a6',
];

export async function stateControls({ engine, canSave, clearInput, resume, doubleJump, onRestoreMods }) {
  const buildResponse = await fetch(new URL('./state-build.json', import.meta.url));
  if (!buildResponse.ok) throw new Error('Falta el identificador del motor.');
  const { build } = await buildResponse.json();
  const status = document.getElementById('save-status');
  const saveButton = document.getElementById('save-state');
  const loadButton = document.getElementById('load-state');

  const toggle = document.getElementById('autosave');
  let busy = false;
  let latest;
  try {
    const candidates = await Promise.all(['current', 'manual', 'auto'].map(name =>
      slot('readonly', (store) => store.get(name))));
    latest = candidates.filter(Boolean).sort((a, b) => b.time - a.time)[0];
  } catch { status.textContent = 'El navegador no permite almacenar partidas.'; }
  function paint() {
    saveButton.disabled = busy;
    loadButton.disabled = busy || !latest;

  }
  function time(record) {
    return new Date(record.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  async function save(name) {
    if (busy || !canSave()) return;
    busy = true;
    paint();
    try {
      const size = engine._web_save_state();
      if (!size) throw new Error('El juego todavía está iniciando.');
      const pointer = engine._web_state_buffer_ptr();
      const bytes = engine.HEAPU8.slice(pointer, pointer + size);
      const record = { build, bytes, time: Date.now() };
      await slot('readwrite', (store) => store.put(record, 'current'));
      latest = record;
      status.textContent = (name === 'manual' ? 'Partida guardada' : 'Autoguardado') + ' · ' + time(record);
    } catch (error) {
      status.textContent = error.message;
      if (name === 'auto') { toggle.checked = false; remember(); scheduleAuto(); }
    } finally { busy = false; paint(); }
  }
  async function load(record) {
    if (busy || !record || !canSave()) return false;
    busy = true;
    paint();
    try {
      if ((record.build !== build && !COMPATIBLE_BUILDS.includes(record.build)) || !(record.bytes instanceof Uint8Array) ||
          record.bytes.length !== engine._web_state_size()) {
        throw new Error('Este guardado pertenece a otra versión del motor.');
      }
      clearInput();
      engine.HEAPU8.set(record.bytes, engine._web_state_buffer_ptr());
      if (!engine._web_load_state(record.bytes.length)) throw new Error('El guardado está dañado.');
      doubleJump.checked = Boolean(engine._web_double_jump_enabled());
      onRestoreMods();
      status.textContent = 'Partida cargada · ' + time(record);
      resume();
      return true;
    } catch (error) { status.textContent = error.message; return false; }
    finally { busy = false; paint(); }
  }
  function remember() {
    try { localStorage.setItem('mslug.autosave', String(toggle.checked)); } catch {}
  }
  try { toggle.checked = localStorage.getItem('mslug.autosave') === 'true'; } catch {}
  toggle.addEventListener('change', () => { remember(); scheduleAuto(); });
  saveButton.addEventListener('click', () => save('manual'));
  loadButton.addEventListener('click', () => load(latest));
  let autoTimer;
  function scheduleAuto() {
    clearInterval(autoTimer);
    if (toggle.checked) autoTimer = setInterval(() => {
      if (!document.hidden && !document.querySelector('#game-menu').open) save('auto');
    }, 10000);
  }
  scheduleAuto();
  paint();
  return {
    get latest() { return latest; },
    /* Resume the most recent save when a game starts. */
    loadLatest: () => load(latest),
    time,
  };
}
