// Adapted from ReChan web/shell/js/touch.js (MIT).
'use strict';

const MetalSlugTouch = (() => {
  const STORAGE_KEY = 'mslug.touch.v1';
  const B = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, FIRE: 4, JUMP: 5, GRENADE: 6, START: 8, COIN: 9, DASH: 15 };

  // 24x24 line icons (stroke = currentColor).
  const ICONS = {
    dash: '<path d="m5 6 6 6-6 6m8-12 6 6-6 6"/>' ,
    jump: '<path d="M12 3.5 6.5 10h3.5v5h4v-5h3.5z" fill="currentColor" stroke="none"/><path d="M5 20.5h14"/><path d="M8 17.5h8" opacity=".6"/>',
    start: '<path d="M9 7v10M15 7v10" stroke-width="2.6"/>',
    fire: '<path d="M4 8h15v5h-7l-2 6H6l2-6H4z"/><path d="M19 9h2v3h-2M12 13l2 3"/>',
    grenade: '<path d="M10 8V5h5v3M14 5l3-2 3 1"/><ellipse cx="12" cy="14.5" rx="5" ry="6"/><path d="M8 12h8M7.5 16h9M12 9v11"/>',
    coin: '<ellipse cx="12" cy="12" rx="7" ry="8"/><path d="M12 8v8m-1-7 1-1"/>',
  };

  function iconSvg(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  // x/y: centre as a fraction of the viewport; size: fraction of the
  // viewport's shorter side. bind: engine button index, or 'LT'/'RT' axes.
  const CONTROL_DEFS = [
    { id: 'dpad', type: 'dpad' },
    { id: 'stick', type: 'stick' },
    { id: 'jump', type: 'button', bind: B.JUMP, icon: 'jump', label: 'Salto' },
    { id: 'fire', type: 'button', bind: B.FIRE, icon: 'fire', label: 'Disparo' },
    { id: 'grenade', type: 'button', bind: B.GRENADE, icon: 'grenade', label: 'Granada' },
    { id: 'dash', type: 'button', bind: B.DASH, icon: 'dash', label: 'Dash' },
    { id: 'coin', type: 'button', bind: B.COIN, icon: 'coin', label: 'Moneda', small: true },
    { id: 'start', type: 'button', bind: B.START, icon: 'start', label: 'Inicio', small: true },
  ];

  const DEFAULT_LAYOUTS = {
    landscape: {
      dpad:   { x: 0.15, y: 0.67, size: 0.40, visible: true },
      stick:  { x: 0.15, y: 0.67, size: 0.40, visible: false },
      jump:   { x: 0.86, y: 0.83, size: 0.16, visible: true },
      fire:  { x: 0.77, y: 0.64, size: 0.16, visible: true },
      grenade:   { x: 0.86, y: 0.45, size: 0.16, visible: true },
      dash: { x: 0.95, y: 0.64, size: 0.16, visible: true },
      coin: { x: 0.40, y: 0.09, size: 0.10, visible: true },
      start:  { x: 0.60, y: 0.09, size: 0.10, visible: true },
    },
    // The game occupies the top 4:3 band (see .portrait-play in app.css).
    portrait: {
      dpad:   { x: 0.26, y: 0.72, size: 0.44, visible: true },
      stick:  { x: 0.26, y: 0.72, size: 0.44, visible: false },
      jump:   { x: 0.75, y: 0.81, size: 0.19, visible: true },
      fire:  { x: 0.60, y: 0.71, size: 0.19, visible: true },
      grenade:   { x: 0.75, y: 0.61, size: 0.19, visible: true },
      dash: { x: 0.90, y: 0.71, size: 0.19, visible: true },
      coin: { x: 0.40, y: 0.93, size: 0.12, visible: true },
      start:  { x: 0.60, y: 0.93, size: 0.12, visible: true },
    },
  };
  const DEFAULT_SETTINGS = { opacity: 0.7, mode: 'dpad', haptics: true, dashEnabled: false };

  let layouts = {};
  let settings = {};
  let layer = null;
  let editing = false;
  let selectedId = null;
  let shown = false;
  let onInput = () => {};
  const elements = new Map();
  const pointers = new Map(); // pointerId -> { id, ... }
  let onSelect = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Orientation comes from the screen, not from the layer's size: on iOS a
  // layout that overflowed during a rotation could widen the layout viewport
  // (and the fixed layer with it), which then kept selecting the landscape
  // layout in portrait with oversized controls.
  const portraitQuery = window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;
  function orientation() {
    if (portraitQuery) return portraitQuery.matches ? 'portrait' : 'landscape';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  function controls() {
    const layout = layouts[orientation()];
    return CONTROL_DEFS.map((definition) => {
      const control = { ...definition, ...layout[definition.id] };
      if (control.id === 'dash' && !settings.dashEnabled) control.visible = false;
      return control;
    });
  }
  function find(id) { return controls().find((c) => c.id === id) || null; }

  function load() {
    layouts = clone(DEFAULT_LAYOUTS);
    settings = { ...DEFAULT_SETTINGS, dashEnabled: settings.dashEnabled };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        Object.assign(settings, saved.settings || {});
        for (const o of ['landscape', 'portrait']) {
          const so = (saved.layouts || {})[o] || {};
          for (const id in so) {
            if (layouts[o][id]) Object.assign(layouts[o][id], so[id]);
          }
        }
      }
    } catch (_) { /* corrupt or blocked storage: use defaults */ }
    applyMode();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, layouts })); } catch (_) { /* ignore */ }
  }

  function applyMode() {
    for (const o of ['landscape', 'portrait']) {
      layouts[o].dpad.visible = settings.mode !== 'stick';
      layouts[o].stick.visible = settings.mode === 'stick';
    }
  }

  // All geometry is relative to the touch layer itself, never to the window:
  // on iOS Safari the fixed layer can be offset from / sized differently to
  // window.inner* (toolbars, standalone status bar), which shifted the touch
  // areas away from the drawn buttons.
  function layerRect() {
    return layer ? layer.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  function W() { return (layer && layer.clientWidth) || layerRect().width || window.innerWidth; }
  function H() { return (layer && layer.clientHeight) || layerRect().height || window.innerHeight; }
  function lx(e) { return e.clientX - layerRect().left; }
  function ly(e) { return e.clientY - layerRect().top; }

  function unit() { return Math.min(W(), H()); }

  function build() {
    layer.innerHTML = '';
    elements.clear();
    for (const c of CONTROL_DEFS) {
      const el = document.createElement('div');
      el.className = 'tc tc-' + c.type + (c.small ? ' tc-small' : '');
      el.dataset.id = c.id;
      if (c.type === 'stick') {
        el.innerHTML = '<div class="tc-knob"></div>';
      } else if (c.type === 'dpad') {
        el.classList.add('ctrl-dpad');
        el.dataset.st = 'rest';
        el.innerHTML = (typeof DpadModelB !== 'undefined') ? DpadModelB.markup() : '';
      } else {
        el.innerHTML = `<span class="tc-icon">${iconSvg(c.icon)}</span>`;
        el.setAttribute('aria-label', c.label);
        el.setAttribute('role', 'img');
      }
      layer.appendChild(el);
      elements.set(c.id, el);
    }
    layout();
  }

  function layout() {
    if (!layer) return;
    const u = unit();
    layer.style.setProperty('--tc-opacity', settings.opacity);
    for (const c of controls()) {
      const el = elements.get(c.id);
      if (!el) continue;
      const s = c.size * u;
      el.style.width = s + 'px';
      el.style.height = s + 'px';
      // Keep every control fully inside the layer so nothing can overflow
      // (and widen the page) while a rotation is in progress.
      const w = W(), hgt = H();
      el.style.left = Math.max(0, Math.min(w - s, c.x * w - s / 2)) + 'px';
      el.style.top = Math.max(0, Math.min(hgt - s, c.y * hgt - s / 2)) + 'px';
      el.style.fontSize = (s * 0.2) + 'px';
      el.style.display = c.visible ? '' : 'none';
      el.classList.toggle('tc-selected', editing && c.id === selectedId);
    }
  }

  function controlAt(x, y, slop) {
    const u = unit();
    let best = null;
    let bestD = Infinity;
    for (const c of controls()) {
      if (!c.visible) continue;
      const r = c.size * u / 2 * slop;
      const dx = (x - c.x * W()) / r;
      const dy = (y - c.y * H()) / r;
      const d = dx * dx + dy * dy;
      if (d <= 1 && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function buzz() {
    if (settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(8); } catch (_) { /* ignore */ }
    }
  }

  // Recompute the merged pad state from every active pointer.
  function recompute() {
    let buttons = 0;
    let dpadDirs = 0;
    for (const p of pointers.values()) {
      const c = find(p.id);
      if (!c) continue;
      if (c.type === 'button') {
        buttons |= 1 << c.bind;
      } else if (c.type === 'stick') {
        if (p.ax < -0.35) buttons |= 1 << B.LEFT;
        if (p.ax > 0.35) buttons |= 1 << B.RIGHT;
        if (p.ay < -0.35) buttons |= 1 << B.UP;
        if (p.ay > 0.35) buttons |= 1 << B.DOWN;
      } else if (c.type === 'dpad') {
        dpadDirs |= p.dirs || 0;
      }
    }
    buttons |= dpadDirs;
    onInput(buttons);
    for (const [id, el] of elements) {
      let pressed = false;
      for (const p of pointers.values()) if (p.id === id) pressed = true;
      el.classList.toggle('tc-pressed', pressed);
    }
    const dpadEl = elements.get('dpad');
    if (dpadEl) {
      const st = {
        up: !!(dpadDirs & (1 << B.UP)), down: !!(dpadDirs & (1 << B.DOWN)),
        left: !!(dpadDirs & (1 << B.LEFT)), right: !!(dpadDirs & (1 << B.RIGHT)),
      };
      dpadEl.dataset.st = (typeof DpadModelB !== 'undefined') ? DpadModelB.key(st) : 'rest';
    }
  }

  function updateStick(p, c, x, y) {
    const r = c.size * unit() / 2;
    let dx = (x - c.x * W()) / r;
    let dy = (y - c.y * H()) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    p.ax = Math.abs(dx) < 0.08 ? 0 : dx;
    p.ay = Math.abs(dy) < 0.08 ? 0 : dy;
    const knob = elements.get(c.id).querySelector('.tc-knob');
    knob.style.transform = `translate(${dx * 50}%, ${dy * 50}%)`;
  }

  function resetStickKnob(id) {
    const el = elements.get(id);
    const knob = el && el.querySelector('.tc-knob');
    if (knob) knob.style.transform = '';
  }

  function updateDpad(p, c, x, y) {
    const dx = x - c.x * W();
    const dy = y - c.y * H();
    const dead = c.size * unit() * 0.1;
    let dirs = 0;
    if (Math.hypot(dx, dy) > dead) {
      const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right, 90 = down
      if (a > -67.5 && a < 67.5) dirs |= 1 << B.RIGHT;
      if (a > 22.5 && a < 157.5) dirs |= 1 << B.DOWN;
      if (a > 112.5 || a < -112.5) dirs |= 1 << B.LEFT;
      if (a > -157.5 && a < -22.5) dirs |= 1 << B.UP;
    }
    if (dirs !== p.dirs && dirs) buzz();
    p.dirs = dirs;
  }

  // --- play mode pointer handling ---
  function onDown(e) {
    if (editing) return editDown(e);
    const c = controlAt(lx(e), ly(e), 1.2);
    if (!c) return;
    e.preventDefault();
    try { layer.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = { id: c.id };
    pointers.set(e.pointerId, p);
    if (c.type === 'stick') updateStick(p, c, lx(e), ly(e));
    else if (c.type === 'dpad') updateDpad(p, c, lx(e), ly(e));
    else buzz();
    recompute();
  }

  function onMove(e) {
    if (editing) return editMove(e);
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const c = find(p.id);
    if (!c) return;
    if (c.type === 'stick') updateStick(p, c, lx(e), ly(e));
    else if (c.type === 'dpad') updateDpad(p, c, lx(e), ly(e));
    else {
      // Let a thumb slide across the action buttons.
      const over = controlAt(lx(e), ly(e), 1.0);
      if (over && over.type === 'button' && over.id !== p.id) { p.id = over.id; buzz(); }
    }
    recompute();
  }

  function onUp(e) {
    if (editing) return editUp(e);
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    resetStickKnob(p.id);
    recompute();
  }

  // --- edit mode ---
  let drag = null;
  function editDown(e) {
    e.preventDefault();
    const c = controlAt(lx(e), ly(e), 1.1);
    selectedId = c ? c.id : null;
    if (c) {
      drag = { pointerId: e.pointerId, id: c.id,
               ox: lx(e) - c.x * W(), oy: ly(e) - c.y * H() };
      try { layer.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    layout();
    if (onSelect) onSelect(selectedId ? find(selectedId) : null);
  }
  function editMove(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const o = orientation();
    const key = drag.id;
    const place = layouts[o][key];
    place.x = Math.min(0.98, Math.max(0.02, (lx(e) - drag.ox) / W()));
    place.y = Math.min(0.98, Math.max(0.02, (ly(e) - drag.oy) / H()));
    layout();
  }
  function editUp(e) {
    if (drag && drag.pointerId === e.pointerId) { drag = null; save(); }
  }

  function init(layerEl, inputCallback) {
    layer = layerEl;
    onInput = inputCallback;
    load();
    build();
    layer.addEventListener('pointerdown', onDown, { passive: false });
    layer.addEventListener('pointermove', onMove, { passive: false });
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onUp);
    layer.addEventListener('lostpointercapture', onUp);
    // iOS: stop double-tap zoom, long-press callouts and rubber-banding.
    layer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    layer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    // Re-layout whenever the layer's real size changes. iOS fires "resize"
    // (and "orientationchange") before the rotation has settled, so layout
    // computed then used the old size/orientation and stayed wrong; a
    // ResizeObserver fires once the new size is actually applied.
    let lastOrientation = orientation();
    const relayout = () => {
      const o = orientation();
      if (o !== lastOrientation) {
        // Orientation flips swap layouts: drop presses that belonged to the old one.
        lastOrientation = o;
        pointers.clear();
        recompute();
      }
      layout();
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(relayout).observe(layer);
    const settle = () => { relayout(); setTimeout(relayout, 250); setTimeout(relayout, 600); };
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', settle);
    if (portraitQuery && portraitQuery.addEventListener) portraitQuery.addEventListener('change', settle);
  }

  function show(on) {
    shown = !!on;
    layer.classList.toggle('tc-hidden', !shown);
    if (!shown) release();
  }

  function setEditing(on, callbacks) {
    editing = !!on;
    drag = null;
    selectedId = null;
    pointers.clear();
    recompute();
    layer.classList.toggle('tc-editing', editing);
    if (callbacks) onSelect = callbacks.onSelect || null;
    if (editing) show(true);
    layout();
  }

  function updateSelected(changes) {
    if (!selectedId) return;
    const o = orientation();
    const key = selectedId;
    Object.assign(layouts[o][key], changes);
    save();
    layout();
  }

  function setSetting(key, value) {
    settings[key] = value;
    if (key === 'mode') applyMode();
    save();
    layout();
  }

  // Resets the layout of the current orientation (and the shared settings).
  function reset() {
    const o = orientation();
    layouts[o] = clone(DEFAULT_LAYOUTS[o]);
    settings = { ...DEFAULT_SETTINGS, dashEnabled: settings.dashEnabled };
    applyMode();
    save();
    build();
  }

  function showAll() {
    const layout_ = layouts[orientation()];
    for (const id in layout_) {
      if (id === 'stick' || id === 'dpad') continue;
      layout_[id].visible = true;
    }
    applyMode();
    save();
    layout();
  }

  function release() {
    for (const p of pointers.values()) resetStickKnob(p.id);
    pointers.clear();
    recompute();
  }

  return {
    init, show, setEditing, updateSelected, setSetting, reset, release, showAll, orientation,
    get settings() { return settings; },
    get shown() { return shown; },
    get editing() { return editing; },
    get selected() { return selectedId ? find(selectedId) : null; },
  };
})();
