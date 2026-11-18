// Adapted from ReChan web/shell/js/touch.js (MIT).
'use strict';

const MetalSlugTouch = (() => {
  const B = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, FIRE: 4, JUMP: 5, GRENADE: 6, START: 8, COIN: 9, DASH: 15 };

  // Line icons from media/ (hurdles, light-gun, bomb, coin-down, play; 16x16).
  // stroke = currentColor, so each button tints its own icon.
  const ICONS = {
    dash: { box: 24, body: '<path d="m5 6 6 6-6 6m8-12 6 6-6 6"/>' },
    jump: { box: 16, body: '<circle cx="7.25" cy="2.875" r="1.25"/><line x1="6.25" y1="5.5" x2="5.25" y2="8.25"/><line x1="5.25" y1="8.25" x2="11.5" y2="8"/><path d="M5.25 8.25 L3.25 10 L2 8.25"/><path d="M3.5 6.25 L6.25 5.5 L9 4"/><path d="M9.5 13.75 L9.5 11.55 C9.5 11.108 9.858 10.75 10.3 10.75 L12.95 10.75 C13.392 10.75 13.75 11.108 13.75 11.55 L13.75 13.75"/>' },
    start: { box: 16, body: '<path d="M6.537 3.728 L11.924 7.156 C12.542 7.549 12.542 8.451 11.924 8.844 L6.537 12.272 C5.871 12.696 5 12.217 5 11.428 L5 4.572 C5 3.783 5.871 3.304 6.537 3.728 Z"/>' },
    fire: { box: 16, body: '<path d="M2.75 4.25 L13 4.25 C13.552 4.25 14 4.698 14 5.25 L14 6.75 C14 7.302 13.552 7.75 13 7.75 L8.5 7.75 L7.661 11.946 C7.567 12.414 7.157 12.75 6.68 12.75 L5.22 12.75 C4.589 12.75 4.115 12.173 4.239 11.554 L5 7.75 L2.75 7.75 C2.198 7.75 1.75 7.302 1.75 6.75 L1.75 5.25 C1.75 4.698 2.198 4.25 2.75 4.25 Z"/><path d="M8.125 9.75 L9.45 9.75 C9.892 9.75 10.25 9.392 10.25 8.95 L10.25 7.75"/>' },
    grenade: { box: 16, body: '<circle cx="7.25" cy="9.25" r="4.5"/><path d="M5 9.25 A2.25 2.25 0 0 1 7.25 7"/><path d="M10.43 6.07 Q10.75 4.25 11.959 3.615"/><path d="M12.5 1.75 C12.65 2.725 13.025 3.1 14 3.25 C13.025 3.4 12.65 3.775 12.5 4.75 C12.35 3.775 11.975 3.4 11 3.25 C11.975 3.1 12.35 2.725 12.5 1.75 Z"/>' },
    coin: { box: 16, body: '<path d="M7.25 12.75 A5.5 5.5 0 1 1 12.75 7.25"/><path d="M7.554 4.929 L9.079 5.826 C9.262 5.934 9.375 6.131 9.375 6.343 L9.375 8.157 C9.375 8.369 9.262 8.566 9.079 8.674 L7.554 9.571 C7.366 9.682 7.134 9.682 6.946 9.571 L5.421 8.674 C5.238 8.566 5.125 8.369 5.125 8.157 L5.125 6.343 C5.125 6.131 5.238 5.934 5.421 5.826 L6.946 4.929 C7.134 4.818 7.366 4.818 7.554 4.929 Z"/><line x1="11.75" y1="9.794" x2="11.75" y2="14"/><path d="M9.708 11.958 L11.75 14 L14 11.75"/>' },
  };

  function iconSvg(name) {
    const icon = ICONS[name] || { box: 24, body: '' };
    const width = icon.box === 16 ? 1.15 : 1.9;
    return `<svg viewBox="0 0 ${icon.box} ${icon.box}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.body}</svg>`;
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
      coin: { x: 0.06, y: 0.10, size: 0.12, visible: true },
      start:  { x: 0.94, y: 0.10, size: 0.12, visible: true },
    },
    // The game occupies the top 4:3 band (see .portrait-play in app.css).
    portrait: {
      dpad:   { x: 0.26, y: 0.72, size: 0.44, visible: true },
      stick:  { x: 0.26, y: 0.72, size: 0.44, visible: false },
      jump:   { x: 0.75, y: 0.81, size: 0.19, visible: true },
      fire:  { x: 0.60, y: 0.71, size: 0.19, visible: true },
      grenade:   { x: 0.75, y: 0.61, size: 0.19, visible: true },
      dash: { x: 0.90, y: 0.71, size: 0.19, visible: true },
      coin: { x: 0.08, y: 0.06, size: 0.13, visible: true },
      start:  { x: 0.92, y: 0.06, size: 0.13, visible: true },
    },
    // Split-screen: one half of the device per player, in that half's own
    // coordinates (its top edge is the middle of the device). The game takes
    // the top 64% of the half; the controls sit near the player's edge.
    duo: {
      dpad:   { x: 0.20, y: 0.81, size: 0.34, visible: true },
      stick:  { x: 0.20, y: 0.81, size: 0.34, visible: false },
      jump:   { x: 0.80, y: 0.91, size: 0.16, visible: true },
      fire:   { x: 0.63, y: 0.84, size: 0.16, visible: true },
      grenade: { x: 0.80, y: 0.74, size: 0.16, visible: true },
      dash:   { x: 0.95, y: 0.82, size: 0.15, visible: true },
      coin:   { x: 0.07, y: 0.07, size: 0.11, visible: true },
      start:  { x: 0.93, y: 0.07, size: 0.11, visible: true },
    },
  };
  // Layouts saved before this revision keep their positions, except coin and
  // start, which moved to the top corners.
  const LAYOUT_REV = 2;
  const DEFAULT_SETTINGS = { opacity: 0.7, mode: 'dpad', haptics: true, dashEnabled: false };
  // Each pad's D-pad SVG needs its own mask/gradient ids: url(#id) resolves
  // to the first match in the page, which may sit in a hidden layer.
  let dpadInstances = 0;

  // Pixel-art arrow pointing left (14x11 grid), drawn like the game's HUD:
  // yellow with an orange shade, a light top edge and a black outline.
  const GUIDE_ARROW = '<svg class="tc-guide-arrow" viewBox="-1 -1 16 13" shape-rendering="crispEdges">' +
    '<defs><linearGradient id="tcg-fill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#fff38a"/><stop offset=".45" stop-color="#ffd21f"/><stop offset=".55" stop-color="#f6b800"/><stop offset="1" stop-color="#d97a00"/>' +
    '</linearGradient></defs>' +
    '<path d="M0 5h1v-1h1v-1h1v-1h1v-1h1v-1h1v3h8v5h-8v3h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1z" fill="#1a0e00" stroke="#1a0e00" stroke-width="1.6" stroke-linejoin="miter" transform="translate(.5 .7)"/>' +
    '<path d="M0 5h1v-1h1v-1h1v-1h1v-1h1v-1h1v3h8v5h-8v3h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1z" fill="url(#tcg-fill)" stroke="#1a0e00" stroke-width="1" stroke-linejoin="miter"/>' +
    '<path d="M2 4h1v-1h1v-1h1v-1h1M6 3h8" fill="none" stroke="#fffbe0" stroke-width=".8" opacity=".9"/>' +
    '</svg>';
  const GUIDE_TEXT = { coin: '¡Inserta crédito!', start: '¡Pulsa start!' };

  // One touch pad per layer. options.storageKey: where it is saved;
  // options.layouts: the DEFAULT_LAYOUTS keys it uses; options.angle(): the
  // layer's on-screen rotation in degrees (the split-screen halves turn).
  function create(options) {
  const STORAGE_KEY = options.storageKey;
  const LAYOUT_KEYS = options.layouts || ['landscape', 'portrait'];
  const angle = options.angle || (() => 0);

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
    if (LAYOUT_KEYS.length === 1) return LAYOUT_KEYS[0];
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
    layouts = {};
    for (const o of LAYOUT_KEYS) layouts[o] = clone(DEFAULT_LAYOUTS[o]);
    settings = { ...DEFAULT_SETTINGS, dashEnabled: settings.dashEnabled };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        Object.assign(settings, saved.settings || {});
        for (const o of LAYOUT_KEYS) {
          const so = (saved.layouts || {})[o] || {};
          for (const id in so) {
            if (saved.rev !== LAYOUT_REV && (id === 'coin' || id === 'start')) continue;
            if (layouts[o][id]) Object.assign(layouts[o][id], so[id]);
          }
        }
      }
    } catch (_) { /* corrupt or blocked storage: use defaults */ }
    applyMode();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rev: LAYOUT_REV, settings, layouts })); } catch (_) { /* ignore */ }
  }

  function applyMode() {
    for (const o of LAYOUT_KEYS) {
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
  // Pointer position in the layer's own (unrotated) coordinates: undo the
  // layer's rotation (0/90/180/270 degrees) around its centre.
  function local(e) {
    const r = layerRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const a = -angle() * Math.PI / 180;
    const cos = Math.round(Math.cos(a));
    const sin = Math.round(Math.sin(a));
    return { x: dx * cos - dy * sin + W() / 2, y: dx * sin + dy * cos + H() / 2 };
  }
  function lx(e) { return local(e).x; }
  function ly(e) { return local(e).y; }

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
        el.innerHTML = (typeof DpadModelB !== 'undefined') ? DpadModelB.markup().replace(/dpb-/g, 'dpb' + (++dpadInstances) + '-') : '';
      } else {
        el.innerHTML = `<span class="tc-icon">${iconSvg(c.icon)}</span>`;
        el.setAttribute('aria-label', c.label);
        el.setAttribute('role', 'img');
      }
      layer.appendChild(el);
      elements.set(c.id, el);
    }
    guideEl = document.createElement('div');
    guideEl.className = 'tc-guide';
    guideEl.hidden = true;
    guideEl.setAttribute('aria-hidden', 'true');
    guideEl.innerHTML = GUIDE_ARROW.replace(/tcg-fill/g, 'tcg' + (++dpadInstances) + '-fill') + '<span class="tc-guide-label"></span>';
    layer.appendChild(guideEl);
    layout();
  }

  // First-run guide: a yellow arcade arrow next to the coin, then the start
  // button. It lives in the layer, so it turns with a rotated half.
  let guideStep = null;
  let guideEl = null;
  function guide(step) {
    guideStep = step || null;
    layout();
  }
  function placeGuide() {
    if (!guideEl) return;
    const c = guideStep ? find(guideStep) : null;
    const on = Boolean(c && c.visible && shown && !editing);
    guideEl.hidden = !on;
    if (!on) return;
    const w = W(), hgt = H(), s = c.size * unit();
    const cx = Math.max(s / 2, Math.min(w - s / 2, c.x * w));
    const cy = Math.max(s / 2, Math.min(hgt - s / 2, c.y * hgt));
    const pointsLeft = cx < w / 2;
    const aw = Math.max(60, Math.min(120, s * 1.4));
    const ah = aw * 11 / 14;
    guideEl.classList.toggle('tc-guide-right', !pointsLeft);
    guideEl.classList.toggle('tc-guide-up', cy > hgt / 2);
    guideEl.style.width = aw + 'px';
    guideEl.style.height = ah + 'px';
    guideEl.style.left = (pointsLeft ? cx + s / 2 + 4 : cx - s / 2 - 4 - aw) + 'px';
    guideEl.style.top = (cy - ah / 2) + 'px';
    guideEl.style.fontSize = Math.max(13, Math.min(20, aw * 0.22)) + 'px';
    guideEl.querySelector('.tc-guide-label').textContent = GUIDE_TEXT[guideStep] || '';
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
    placeGuide();
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
    placeGuide();
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
    init, show, guide, setEditing, updateSelected, setSetting, reset, release, showAll, orientation, layout,
    get settings() { return settings; },
    get shown() { return shown; },
    get editing() { return editing; },
    get selected() { return selectedId ? find(selectedId) : null; },
  };
  }

  // The single-player pad keeps its original storage key.
  const main = create({ storageKey: 'mslug.touch.v1' });
  main.create = create;
  return main;
})();
