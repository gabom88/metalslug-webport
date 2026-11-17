const actions = [
  ['Arriba', 'ArrowUp', 1], ['Abajo', 'ArrowDown', 2],
  ['Izquierda', 'ArrowLeft', 4], ['Derecha', 'ArrowRight', 8],
  ['Disparo', 'KeyZ', 16], ['Salto', 'KeyX', 32], ['Granada', 'KeyC', 64],
  ['Botón D', 'KeyV', 128], ['Inicio J1', 'Digit1', 256],
  ['Moneda J1', 'Digit5', 512], ['Inicio J2', 'Digit2', 1024],
  ['Moneda J2', 'Digit6', 2048], ['Selección J1', 'Digit3', 4096],
  ['Servicio', 'Digit9', 8192], ['Prueba', 'F2', 16384], ['Dash', 'ShiftLeft', 32768],
];
const defaults = actions.map(([, code]) => code);
const storageKey = 'mslug.keyboard.v1';
const excluded = /^(Escape|Tab|Meta|Control|Alt|Shift|CapsLock|NumLock|ScrollLock|ContextMenu|Unidentified|F[0-9]+$)/;
const usable = (code) => typeof code === 'string' && code.length > 0 && code.length <= 30 && (!excluded.test(code) || code === 'F2' || code === 'ShiftLeft' || code === 'ShiftRight');
function readBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.length === defaults.length - 1) saved.push('ShiftLeft');
    if (Array.isArray(saved) && saved.length === defaults.length &&
        new Set(saved).size === saved.length && saved.every(usable)) return saved;
  } catch { /* Fall back to the arcade defaults. */ }
  return [...defaults];
}
function keyLabel(code) {
  const named = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift izq.', ShiftRight: 'Shift der.', Space: 'Espacio', Enter: 'Intro', Backspace: 'Retroceso', Delete: 'Supr',
    Comma: ',', Period: '.', Minus: '-', Equal: '=', Slash: '/',
  };
  return named[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
}

export function keyboardControls({ dialog, grid, status, onInput, canPlay }) {
  let bindings = readBindings();
  let pending = -1;
  const held = new Set();
  const buttons = actions.map(([name], index) => {
    const button = document.createElement('button');
    const label = document.createElement('span');
    const key = document.createElement('kbd');
    button.type = 'button';
    label.textContent = name;
    button.append(label, key);
    button.addEventListener('click', () => {
      pending = pending === index ? -1 : index;
      paint();
    });
    grid.append(button);
    return { button, key };
  });

  function emit() {
    let mask = 0;
    for (const code of held) {
      const index = bindings.indexOf(code);
      if (index >= 0) mask |= actions[index][2];
    }
    onInput(mask);
  }
  function release() {
    held.clear();
    emit();
  }
  function paint(message = '') {
    buttons.forEach(({ button, key }, index) => {
      key.textContent = pending === index ? '…' : keyLabel(bindings[index]);
      button.setAttribute('aria-pressed', String(pending === index));
    });
    status.textContent = pending < 0 ? message : 'Pulsa una tecla para ' + actions[pending][0].toLowerCase() + '. Esc cancela.';
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(bindings));
      return '';
    } catch {
      return 'Teclas aplicadas durante esta sesión.';
    }
  }
  function reset() {
    pending = -1;
    bindings = [...defaults];
    release();
    paint(save() || 'Teclas originales restauradas.');
  }
  window.addEventListener('keydown', (event) => {
    if (dialog.open && pending >= 0) {
      if (event.repeat) return;
      if (event.code !== 'Escape' && (!usable(event.code) || event.altKey || event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') {
        const other = bindings.indexOf(event.code);
        if (other >= 0) bindings[other] = bindings[pending];
        bindings[pending] = event.code;
      }
      pending = -1;
      paint(event.code === 'Escape' ? '' : save() || 'Tecla guardada.');
      return;
    }
    if (!canPlay() || event.altKey || event.ctrlKey || event.metaKey || !bindings.includes(event.code)) return;
    if (['Space', 'Enter'].includes(event.code) && event.target instanceof HTMLButtonElement) return;
    if (event.code === 'Enter' && event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    event.stopPropagation();
    held.add(event.code);
    emit();
  }, true);
  window.addEventListener('keyup', (event) => {
    if (!held.delete(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    emit();
  }, true);
  dialog.addEventListener('close', () => { pending = -1; paint(); });
  paint();
  return { release, reset };
}
