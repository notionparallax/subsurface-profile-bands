'use strict';
// Layout prototype for the bands below Subsurface's dive profile.
// Fractions and rules follow ProfileScene::updateAxes() in profile-widget/profilescene.cpp.

const SVGNS = 'http://www.w3.org/2000/svg';

// --- Settings, kept in the URL hash ---------------------------------------------------------

const DEFAULTS = {
  dive: 'd233hr',
  size: '1280x720',
  bands: { tankbar: true, tissues: true, pp: true, sac: true, hr: true, temp: true },
  fence: 'budget',
  budget: 40,          // % of the height below the deco line that bands may take together
  order: 'subject',
  pairing: 'separate',
  oneSide: 'fixed',
  depthMode: 'default',
  fixedDepth: 50,
  sacWindow: 60,
  sacScale: 'sd',
  sacN: 2.5,
  sacPct: 98,
  pressure: true,
  grayscale: false,
  dashShared: true,
  secondaryTicks: 'aligned', // 'own' | 'labels' | 'aligned'
  ppFrac: 10,          // % (Subsurface uses 0.1 unless "Scale graph" is on, then the gasplot_frac preference)
};

const SIZES = {
  '1600x900': 'Large window, 1600 × 900',
  '1280x720': 'Laptop window, 1280 × 720',
  '1024x560': 'Small window, 1024 × 560',
  '800x420': 'Profile pane in a split view, 800 × 420',
  '600x300': 'Print, several dives per page, 600 × 300',
};

// Bottom to top, as Subsurface adds them.
const ORDERS = {
  today: ['hr', 'sac', 'tissues', 'pp', 'temp'],
  subject: ['tissues', 'pp', 'sac', 'hr', 'temp'],
  sacNearProfile: ['tissues', 'pp', 'hr', 'sac', 'temp'],
};

// Fixed fractions from updateAxes(); SAC and the shared band are new.
const FRACTIONS = { hr: 0.125, tissues: 0.083, temp: 0.14, sac: 0.125, shared: 0.15 };

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, patch) {
  const out = clone(base);
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = Object.assign({}, out[k], v);
    else out[k] = v;
  }
  return out;
}

function readHash() {
  try {
    const h = decodeURIComponent(location.hash.slice(1));
    return h ? merge(DEFAULTS, JSON.parse(h)) : clone(DEFAULTS);
  } catch (e) {
    return clone(DEFAULTS);
  }
}

function diffFromDefaults(s) {
  const d = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'object') {
      const sub = {};
      for (const [k2, v2] of Object.entries(v)) if (DEFAULTS[k][k2] !== v2) sub[k2] = v2;
      if (Object.keys(sub).length) d[k] = sub;
    } else if (DEFAULTS[k] !== v) {
      d[k] = v;
    }
  }
  return d;
}

let S = readHash();

function setSettings(next, push) {
  S = next;
  const d = diffFromDefaults(S);
  const hash = Object.keys(d).length ? '#' + encodeURIComponent(JSON.stringify(d)) : location.pathname + location.search;
  if (push) history.pushState(null, '', hash); else history.replaceState(null, '', hash);
  syncControls();
  render();
}

// --- Colours (core/color.h, core/color.cpp): [colour, grayscale twin] ------------------------

const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
const BLACK_LOW = rgba(0, 0, 0, 0.75), BLACK_HIGH = rgba(0, 0, 0, 0.25);
const PALETTE = {
  background: [rgba(0.95, 0.95, 0.9), rgba(1, 1, 1)],
  grid: [rgba(0, 0, 0, 0.08), BLACK_HIGH],
  timeText: [rgba(0.1, 0.5, 0.1), rgba(0, 0, 0)],
  depthTop: [rgba(0.9, 0.9, 0.9, 0.5), rgba(1, 1, 1, 0.5)],
  depthBottom: [rgba(0.2, 0.2, 0.8, 0.5), BLACK_HIGH],
  depthLine: [rgba(0.2, 0.2, 0.8, 0.9), BLACK_LOW],
  depthText: [rgba(0.2, 0.2, 0.7), rgba(0, 0, 0)],
  pressure: [rgba(0.2, 0.4, 0.2, 0.8), BLACK_LOW],
  po2: [rgba(0.2, 0.6, 0.2), BLACK_LOW],
  pn2: [BLACK_LOW, BLACK_LOW],
  phe: [rgba(0.5, 0.2, 0.1), BLACK_LOW],
  hr: [rgba(1, 0.2, 0.2, 0.5), BLACK_LOW],
  hrText: [rgba(1, 0.2, 0.2, 0.8), BLACK_LOW],
  temp: [rgba(0.2, 0.2, 0.9, 0.75), BLACK_LOW],
  tempText: [rgba(0.2, 0.2, 0.7), BLACK_LOW],
  sac: [rgba(0.8, 0.5, 0.0), BLACK_LOW],          // placeholder: PIRATEGOLD1, not yet in color.cpp
  sacText: [rgba(0.6, 0.38, 0.0), BLACK_LOW],
  axisText: [rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.75)],
  bandEdge: [rgba(0, 0, 0, 0.12), BLACK_HIGH],
};
const col = (name) => PALETTE[name][S.grayscale ? 1 : 0];

// --- Data helpers -------------------------------------------------------------------------

function hasData(arr) { return arr.some((v) => v > 0); }

// Time-weighted average of the exported momentary SAC (about a 1-minute window already)
// over a centred window. Zero (surface) samples are gaps.
function smoothSac(dive, window) {
  const t = dive.sec, v = dive.sac;
  if (!window) return v.map((x) => (x > 0 ? x : null));
  const half = window / 2;
  return t.map((ti, i) => {
    if (!(v[i] > 0)) return null;
    let sum = 0, wsum = 0;
    for (let j = 0; j < t.length; j++) {
      if (t[j] < ti - half) continue;
      if (t[j] > ti + half) break;
      if (!(v[j] > 0)) continue;
      const w = (j > 0 ? t[j] - t[j - 1] : 1) || 1;
      sum += v[j] * w;
      wsum += w;
    }
    return wsum ? sum / wsum : null;
  });
}

function sacMax(values) {
  const xs = values.filter((x) => x != null);
  if (!xs.length) return 10;
  const max = Math.max(...xs);
  if (S.sacScale === 'max') return max;
  if (S.sacScale === 'sd') {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return Math.min(max, mean + S.sacN * sd);
  }
  const sorted = xs.slice().sort((a, b) => a - b);
  return Math.min(max, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * S.sacPct / 100))]);
}

function niceStep(range, target) {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

// Tissue heat map colour: DivePercentageItem's colorScale().
function hsv(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `rgb(${Math.round(f(5) * 255)},${Math.round(f(3) * 255)},${Math.round(f(1) * 255)})`;
}
function tissueColour(value, inert) {
  const AMB = 50.0;
  const scaled = value / (AMB * inert) * 1000.0;
  if (scaled < 0.8) return hsv(0.5 + 0.25 * scaled / 0.8, 1, 1);
  if (scaled < 1.0) return hsv(0.75, 1, (1.0 - scaled) / 0.2);
  if (value < AMB) return hsv(0.333, 1, (value - AMB * inert / 1000) / (AMB - AMB * inert / 1000));
  if (value < 65) return hsv(0.333 - 0.133 * (value - AMB) / (65 - AMB), 1, 1);
  if (value < 85) return hsv(0.2 - 0.1 * (value - 65) / 20, 1, 1);
  if (value < 100) return hsv(0.1 * (100 - value) / 15, 1, 1);
  if (value < 120) return hsv(0, 1 - (value - 100) / 20, 1);
  return hsv(0, 0, 1);
}

// --- SVG helpers --------------------------------------------------------------------------

function el(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, attrs) {
  const t = el('text', Object.assign({ x, y, 'font-size': 11, fill: col('axisText') }, attrs), parent);
  t.textContent = str;
  return t;
}
function linePath(xs, ys) {
  let d = '', pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || Number.isNaN(ys[i])) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + xs[i].toFixed(1) + ',' + ys[i].toFixed(1);
    pen = true;
  }
  return d;
}

// --- Layout -------------------------------------------------------------------------------

// The bands that are shown, bottom to top, with the traces in each.
function visibleSlots(dive) {
  const has = {
    tissues: S.bands.tissues,
    pp: S.bands.pp,
    temp: S.bands.temp && dive.temp.some((t) => t != null),
    hr: S.bands.hr && hasData(dive.hr),
    sac: S.bands.sac && hasData(dive.sac),
  };
  const slots = [];
  for (const key of ORDERS[S.order]) {
    if (S.pairing === 'shared' && (key === 'sac' || key === 'hr')) {
      if (slots.some((s) => s.key === 'shared')) continue;
      if (!has.sac && !has.hr) continue;
      const traces = [];
      if (has.sac) traces.push({ kind: 'sac', side: 'left' });
      if (has.hr) traces.push({ kind: 'hr', side: has.sac || S.oneSide === 'fixed' ? 'right' : 'left' });
      slots.push({ key: 'shared', frac: FRACTIONS.shared, traces });
    } else if (has[key]) {
      const frac = key === 'pp' ? S.ppFrac / 100 : FRACTIONS[key];
      const side = key === 'pp' ? 'right' : key === 'hr' || key === 'sac' ? 'left' : null;
      slots.push({ key, frac, traces: [{ kind: key, side }] });
    }
  }
  return slots;
}

function layout(width, height, slots) {
  const leftNeeded = Math.max(40, ...slots.flatMap((s) => s.traces.filter((t) => t.side === 'left').map(() => 34)));
  const rightNeeded = slots.some((s) => s.traces.some((t) => t.side === 'right')) ? 36 : 14;
  const left = leftNeeded, right = width - rightNeeded;
  let bottom = height - 16;                 // dive computer name
  const timeAxis = { y: bottom - 18, h: 18 };
  bottom -= 18;
  let tankbar = null;
  if (S.bands.tankbar) { tankbar = { y: bottom - 14, h: 14 }; bottom -= 14; }
  const top = 4;
  const avail = bottom - top;
  const sum = slots.reduce((a, s) => a + s.frac, 0);
  let scale = 1;
  if (S.fence === 'budget' && sum > S.budget / 100) scale = (S.budget / 100) / sum;
  const placed = [];
  for (const s of slots) {
    const h = s.frac * scale * avail;
    bottom -= h;
    placed.push(Object.assign({}, s, { y: bottom, h }));
  }
  const profile = { y: top, h: bottom - top };
  return { left, right, top, timeAxis, tankbar, profile, slots: placed, sum, scale, avail };
}

// --- Drawing ------------------------------------------------------------------------------

function render() {
  const [W, H] = S.size.split('x').map(Number);
  const svg = document.getElementById('chart');
  svg.innerHTML = '';
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.toggle('gray', S.grayscale);

  const entry = DIVES[S.dive];
  const dive = entry.dive;
  const slots = visibleSlots(dive);
  const L = layout(W, H, slots);

  el('rect', { x: 0, y: 0, width: W, height: H, fill: col('background') }, svg);

  // Time axis.
  const dur = dive.sec[dive.sec.length - 1];
  const tMax = S.depthMode === 'default' ? Math.max(dur, 30 * 60) : dur;
  const X = (t) => L.left + (t / tMax) * (L.right - L.left);
  const xs = dive.sec.map(X);
  const tStep = niceStep(tMax / 60, 10) * 60;
  for (let t = 0; t <= tMax; t += tStep) {
    el('line', { x1: X(t), x2: X(t), y1: L.profile.y, y2: L.timeAxis.y, stroke: col('grid') }, svg);
    text(svg, X(t), L.timeAxis.y + 13, String(t / 60), { 'text-anchor': 'middle', fill: col('timeText') });
  }

  drawProfile(svg, L, dive, X, xs);
  for (const s of L.slots) drawSlot(svg, L, s, dive, xs);
  if (L.tankbar) drawTankbar(svg, L, dive, X);

  text(svg, 4, H - 4, entry.model, { fill: col('timeText') });

  // Readout.
  const pct = (x) => Math.round(x * 100) + '%';
  const used = L.slots.reduce((a, s) => a + s.h, 0);
  const parts = [`<b>Profile ${pct(L.profile.h / L.avail)}</b> of the plot height (${Math.round(L.profile.h)} px)`];
  if (L.slots.length) {
    parts.push(`bands ${pct(used / L.avail)}` + (L.scale < 1 ? `, shrunk to ${pct(L.scale)} of their size by the budget` : ''));
    parts.push(L.slots.map((s) => `${s.key} ${Math.round(s.h)} px`).join(' · '));
  }
  document.getElementById('readout').innerHTML = parts.join(' — ');
  const notes = [entry.name + '.'];
  if (S.bands.hr && !hasData(dive.hr)) notes.push('This dive has no heart rate, so that band is not shown.');
  if (S.bands.sac && !hasData(dive.sac)) notes.push('This dive has no tank pressures, so there is no SAC band.');
  if (S.sacWindow) notes.push('The SAC trace here averages the exported momentary SAC (itself ≈1 min) over the chosen window; a real implementation would use the pressure drop over the window.');
  document.getElementById('notes').textContent = notes.join(' ');
}

function drawProfile(svg, L, dive, X, xs) {
  const maxDepth = Math.max(...dive.depth);
  let dMax = maxDepth + 3;
  if (S.depthMode === 'default') dMax = Math.max(30, dMax);
  if (S.depthMode === 'fixed') dMax = S.fixedDepth;
  const P = L.profile;
  const Y = (d) => P.y + (d / dMax) * P.h;
  const dStep = niceStep(dMax, 6);
  for (let d = 0; d <= dMax; d += dStep) {
    el('line', { x1: L.left, x2: L.right, y1: Y(d), y2: Y(d), stroke: col('grid') }, svg);
    text(svg, L.left - 4, Y(d) + 4, String(d), { 'text-anchor': 'end', fill: col('depthText') });
  }
  const clip = el('clipPath', { id: 'profile-clip' }, el('defs', {}, svg));
  el('rect', { x: L.left, y: P.y, width: L.right - L.left, height: P.h }, clip);
  const grad = el('linearGradient', { id: 'depth-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, svg.querySelector('defs'));
  el('stop', { offset: 0, 'stop-color': col('depthTop') }, grad);
  el('stop', { offset: 1, 'stop-color': col('depthBottom') }, grad);
  const g = el('g', { 'clip-path': 'url(#profile-clip)' }, svg);
  const ys = dive.depth.map((d) => Y(Math.min(d, dMax * 1.2)));
  const d = linePath(xs, ys);
  el('path', { d: d + `L${xs[xs.length - 1]},${P.y}L${xs[0]},${P.y}Z`, fill: 'url(#depth-grad)' }, g);
  el('path', { d, fill: 'none', stroke: col('depthLine'), 'stroke-width': 1.5 }, g);
  if (S.pressure && dive.pressures.length) {
    // Tank pressures are drawn in the 24–80% region of the profile, as in Subsurface.
    const pMax = Math.max(...dive.pressures.flat().filter((x) => x));
    const PY = (p) => P.y + P.h * (0.24 + 0.56 * (1 - p / pMax));
    for (const series of dive.pressures)
      el('path', { d: linePath(xs, series.map((p) => (p ? PY(p) : null))), fill: 'none', stroke: col('pressure'), 'stroke-width': 1.5 }, g);
  }
  if (S.depthMode === 'fixed' && maxDepth > dMax)
    text(svg, L.right - 4, P.y + P.h - 4, `deeper than ${dMax} m: clipped`, { 'text-anchor': 'end', fill: col('hrText') });
}

// An axis: its range and the values that get a label (and, if it owns the grid, a grid line).
function ownAxis(min, max, slotH) {
  const step = niceStep(max - min, Math.max(1, Math.floor(slotH / 16)));
  const ticks = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return { min, max, step, ticks };
}

// The primary axis of a shared band: the top is rounded up to a grid line, so that the
// band has a whole number of grid intervals for the secondary axis to follow.
function primaryAxis(min, max, slotH) {
  const a = ownAxis(min, max, slotH);
  a.max = Math.ceil(max / a.step - 1e-9) * a.step;
  a.ticks = [];
  for (let v = a.min; v <= a.max + 1e-9; v += a.step) a.ticks.push(v);
  return a;
}

const NICE = [1, 2, 2.5, 5];
function nextNice(x) {
  const mag = 10 ** Math.floor(Math.log10(x));
  for (const m of NICE) if (m * mag >= x - 1e-9) return m * mag;
  return 10 * mag;
}

// A secondary axis that labels the primary's grid lines.
// 'labels': whatever value falls on each line. 'aligned': a range chosen so that each
// line falls on a round value.
function secondaryAxis(primary, dataMin, dataMax, mode) {
  const n = Math.round((primary.max - primary.min) / primary.step);
  if (mode === 'labels') {
    const min = dataMin, max = dataMax;
    const step = (max - min) / n;
    return { min, max, step, ticks: primary.ticks.map((_, k) => min + k * step), raw: true };
  }
  let step = nextNice((dataMax - dataMin) / n);
  for (let guard = 0; guard < 20; guard++) {
    const lo = Math.floor(dataMin / step) * step;
    if (lo + n * step >= dataMax - 1e-9) {
      const ticks = [];
      for (let k = 0; k <= n; k++) ticks.push(lo + k * step);
      return { min: lo, max: lo + n * step, step, ticks };
    }
    step = nextNice(step * 1.01);
  }
  return ownAxis(dataMin, dataMax, 0);
}

function drawAxis(svg, L, slot, side, axis, colour, unitLabel, grid) {
  const { min, max } = axis;
  const Y = (v) => slot.y + slot.h - ((v - min) / (max - min)) * (slot.h - 4);
  for (const v of axis.ticks) {
    if (Y(v) < slot.y + 7) continue;   // keep labels inside the band
    const label = axis.raw ? v.toFixed(Math.abs(axis.step) < 2 ? 1 : 0) : formatTick(v, axis.step);
    if (side === 'left') text(svg, L.left - 4, Y(v) + 4, label, { 'text-anchor': 'end', fill: colour, 'font-size': 10 });
    else text(svg, L.right + 4, Y(v) + 4, label, { fill: colour, 'font-size': 10 });
    if (grid) el('line', { x1: L.left, x2: L.right, y1: Y(v), y2: Y(v), stroke: col('grid') }, svg);
  }
  if (unitLabel && slot.h >= 24)
    text(svg, side === 'left' ? L.left + 4 : L.right - 4, slot.y + 11, unitLabel, { 'text-anchor': side === 'left' ? 'start' : 'end', fill: colour, 'font-size': 10 });
  return Y;
}
function formatTick(v, step) { return Number.isInteger(step) ? String(Math.round(v)) : v.toFixed(1); }

function drawSlot(svg, L, slot, dive, xs) {
  el('line', { x1: L.left, x2: L.right, y1: slot.y, y2: slot.y, stroke: col('bandEdge') }, svg);
  // In a shared band the left-hand (SAC) axis owns the grid; the right-hand axis either
  // has its own grid (today's dual-axis style) or labels the left-hand axis's lines.
  const shared = slot.key === 'shared' && slot.traces.length === 2;
  const follow = shared && S.secondaryTicks !== 'own';
  let primary = null;
  const hrVals = dive.hr.filter((x) => x > 0);
  const hrMin = Math.min(...hrVals) - 5, hrMax = Math.max(...hrVals) + 5;
  const sacValues = smoothSac(dive, S.sacWindow);
  const sacTop = Math.max(5, sacMax(sacValues));
  for (const tr of slot.traces) {
    const dashed = S.dashShared && slot.key === 'shared' && tr.side === 'right';
    if (tr.kind === 'tissues') drawTissues(svg, L, slot, dive, xs);
    if (tr.kind === 'pp') drawPP(svg, L, slot, dive, xs);
    if (tr.kind === 'temp') drawTemp(svg, L, slot, dive, xs);
    if (tr.kind === 'sac') {
      const axis = follow ? primaryAxis(0, sacTop, slot.h) : ownAxis(0, sacTop, slot.h);
      primary = axis;
      const Y = drawAxis(svg, L, slot, tr.side, axis, col('sacText'), 'ℓ/min', true);
      el('path', { d: linePath(xs, sacValues.map((x) => (x == null ? null : Y(Math.min(x, axis.max))))), fill: 'none', stroke: col('sac'), 'stroke-width': 1.5, 'stroke-dasharray': dashed ? '5 3' : null }, svg);
      // Mark clipped values along the top edge.
      sacValues.forEach((x, i) => { if (x != null && x > axis.max) el('rect', { x: xs[i] - 1, y: slot.y + 1, width: 2, height: 3, fill: col('sac') }, svg); });
    }
    if (tr.kind === 'hr') {
      const v = dive.hr.map((x) => (x > 0 ? x : null));
      // Following SAC's grid, the padding would often force the next, coarser step.
      const axis = follow && primary ? secondaryAxis(primary, hrMin + 5, hrMax - 5, S.secondaryTicks) : ownAxis(hrMin, hrMax, slot.h);
      const Y = drawAxis(svg, L, slot, tr.side, axis, col('hrText'), 'bpm', !(follow && primary));
      el('path', { d: linePath(xs, v.map((x) => (x == null ? null : Y(x)))), fill: 'none', stroke: col('hr'), 'stroke-width': 1.5, 'stroke-dasharray': dashed ? '5 3' : null }, svg);
    }
  }
}

function drawTissues(svg, L, slot, dive, xs) {
  const rowH = slot.h / 16;
  for (let i = 1; i < xs.length; i++) {
    const inert = dive.amb[i] > 0 ? Math.round((dive.pn2[i] + dive.phe[i]) / dive.amb[i] * 1000) : 790;
    for (let k = 0; k < 16; k++) {
      el('rect', { x: xs[i - 1], y: slot.y + k * rowH, width: Math.max(0.5, xs[i] - xs[i - 1] + 0.3), height: rowH + 0.3, fill: tissueColour(dive.tissues[k][i], inert || 1) }, svg);
    }
  }
}

function drawPP(svg, L, slot, dive, xs) {
  const max = Math.ceil(Math.max(...dive.po2, ...dive.pn2, ...dive.phe) * 2) / 2 || 1;
  const Y = drawAxis(svg, L, slot, 'right', ownAxis(0, max, slot.h), col('axisText'), 'bar', true);
  for (const [key, colour] of [['pn2', 'pn2'], ['phe', 'phe'], ['po2', 'po2']]) {
    if (!hasData(dive[key])) continue;
    el('path', { d: linePath(xs, dive[key].map((v) => (v > 0 ? Y(v) : null))), fill: 'none', stroke: col(colour), 'stroke-width': 1.5 }, svg);
  }
}

function drawTemp(svg, L, slot, dive, xs) {
  const vals = dive.temp.filter((t) => t != null);
  const min = Math.min(...vals), max = Math.max(min + 2, Math.max(...vals));
  const Y = (t) => slot.y + slot.h - 4 - ((t - min) / (max - min)) * (slot.h - 8);
  el('path', { d: linePath(xs, dive.temp.map((t) => (t == null ? null : Y(t)))), fill: 'none', stroke: col('temp'), 'stroke-width': 2 }, svg);
  // Subsurface writes values along the line rather than drawing an axis.
  let last = -1e9;
  dive.temp.forEach((t, i) => {
    if (t == null || xs[i] - last < 120) return;
    if (i > 0 && dive.temp[i - 1] === t) return;
    text(svg, xs[i], Y(t) - 3, t.toFixed(0) + '°C', { fill: col('tempText'), 'font-size': 10 });
    last = xs[i];
  });
}

function drawTankbar(svg, L, dive, X) {
  const T = L.tankbar;
  const gasAt = (i) => {
    if (!(dive.amb[i] > 0) || !(dive.po2[i] > 0)) return null;
    const o2 = Math.round(dive.po2[i] / dive.amb[i] * 100);
    const he = Math.round(dive.phe[i] / dive.amb[i] * 100);
    if (he > 0) return `Tx${o2}/${he}`;
    return o2 >= 98 ? 'O₂' : o2 <= 22 ? 'Air' : `EAN${o2}`;
  };
  let start = 0, cur = gasAt(0);
  const colours = { 'Air': 'rgb(170,200,230)', 'O₂': 'rgb(120,200,120)' };
  const flush = (end) => {
    if (cur == null) return;
    const x1 = X(dive.sec[start]), x2 = X(dive.sec[end]);
    el('rect', { x: x1, y: T.y + 1, width: Math.max(0, x2 - x1), height: T.h - 2, fill: colours[cur] || 'rgb(230,210,120)', stroke: col('bandEdge') }, svg);
    if (x2 - x1 > 40) text(svg, x1 + 4, T.y + T.h - 3, cur, { 'font-size': 10 });
  };
  for (let i = 1; i < dive.sec.length; i++) {
    let g = gasAt(i);
    if (g == null) g = cur;
    if (g !== cur) { flush(i); start = i; cur = g; }
  }
  flush(dive.sec.length - 1);
}

// --- Controls -----------------------------------------------------------------------------

function controlHTML() {
  const opt = (obj, v) => Object.entries(obj).map(([k, label]) => `<option value="${k}"${k === v ? ' selected' : ''}>${label}</option>`).join('');
  const dives = Object.fromEntries(Object.entries(DIVES).map(([k, v]) => [k, v.name]));
  return `
  <fieldset><legend>Dive and window</legend>
    <label><select data-k="dive">${opt(dives)}</select></label>
    <label><select data-k="size">${opt(SIZES)}</select></label>
  </fieldset>
  <fieldset><legend>Bands</legend>
    ${[['tissues', 'Tissue heat map'], ['pp', 'Partial pressures'], ['sac', 'SAC (new)'], ['hr', 'Heart rate'], ['temp', 'Temperature'], ['tankbar', 'Tank bar']]
      .map(([k, l]) => `<label><input type="checkbox" data-band="${k}"> ${l}</label>`).join('')}
    <label>pp gas band <input type="number" data-k="ppFrac" min="5" max="70" step="1"> % of height</label>
  </fieldset>
  <fieldset><legend>Sharing the height</legend>
    <label><input type="radio" name="fence" value="exclusive" data-k="fence"> Either heart rate or tissues (today)</label>
    <label><input type="radio" name="fence" value="stack" data-k="fence"> Stack everything</label>
    <label><input type="radio" name="fence" value="budget" data-k="fence"> Stack within a budget of</label>
    <label style="margin-left:22px"><input type="number" data-k="budget" min="15" max="80" step="5"> % for all bands together</label>
  </fieldset>
  <fieldset><legend>Order, bottom to top</legend>
    <label><select data-k="order">${opt({ today: 'Today: heart rate, (SAC), tissues, pp, temperature', subject: 'By subject: tissues, pp, SAC, heart rate, temperature', sacNearProfile: 'SAC by the profile: tissues, pp, heart rate, SAC, temperature' })}</select></label>
  </fieldset>
  <fieldset><legend>SAC and heart rate</legend>
    <label><input type="radio" name="pairing" value="separate" data-k="pairing"> A band each</label>
    <label><input type="radio" name="pairing" value="shared" data-k="pairing"> One band, heart rate on the right</label>
    <label><input type="radio" name="secondaryTicks" value="own" data-k="secondaryTicks"> Heart rate has its own grid lines</label>
    <label><input type="radio" name="secondaryTicks" value="labels" data-k="secondaryTicks"> Heart rate labels SAC's lines (raw values)</label>
    <label><input type="radio" name="secondaryTicks" value="aligned" data-k="secondaryTicks"> Heart rate labels SAC's lines (round values)</label>
    <label><input type="radio" name="oneSide" value="fixed" data-k="oneSide"> Lone trace keeps its side</label>
    <label><input type="radio" name="oneSide" value="left" data-k="oneSide"> Lone trace moves to the left</label>
  </fieldset>
  <fieldset><legend>SAC trace</legend>
    <label>Smoothing <select data-k="sacWindow">${opt({ 0: 'none (as exported, ≈1 min)', 30: '30 s', 60: '1 min', 90: '90 s', 120: '2 min', 180: '3 min' }, String(S.sacWindow))}</select></label>
    <label><input type="radio" name="sacScale" value="max" data-k="sacScale"> 0 to the highest value</label>
    <label><input type="radio" name="sacScale" value="sd" data-k="sacScale"> 0 to mean +</label>
    <label style="margin-left:22px"><input type="number" data-k="sacN" min="1" max="5" step="0.5"> standard deviations</label>
    <label><input type="radio" name="sacScale" value="pct" data-k="sacScale"> 0 to the</label>
    <label style="margin-left:22px"><input type="number" data-k="sacPct" min="80" max="100" step="1"> th percentile</label>
    <p class="hint">Clipped values are marked along the top of the band.</p>
  </fieldset>
  <fieldset><legend>Depth axis</legend>
    <label><input type="radio" name="depthMode" value="default" data-k="depthMode"> At least 30 m and 30 min (default)</label>
    <label><input type="radio" name="depthMode" value="zoomed" data-k="depthMode"> Fit the dive ("Scale graph" button)</label>
    <label><input type="radio" name="depthMode" value="fixed" data-k="depthMode"> Fixed at</label>
    <label style="margin-left:22px"><input type="number" data-k="fixedDepth" min="5" max="150" step="5"> m (not in Subsurface)</label>
  </fieldset>
  <fieldset><legend>Appearance</legend>
    <label><input type="checkbox" data-k="pressure"> Tank pressure lines</label>
    <label><input type="checkbox" data-k="grayscale"> Grayscale print</label>
    <label><input type="checkbox" data-k="dashShared"> Dash the right-hand trace in a shared band</label>
  </fieldset>`;
}

function syncControls() {
  const root = document.getElementById('controls');
  root.querySelectorAll('[data-k]').forEach((e) => {
    const v = S[e.dataset.k];
    if (e.type === 'radio') e.checked = e.value === String(v);
    else if (e.type === 'checkbox') e.checked = !!v;
    else e.value = String(v);
  });
  root.querySelectorAll('[data-band]').forEach((e) => { e.checked = !!S.bands[e.dataset.band]; });
}

function initControls() {
  const root = document.getElementById('controls');
  root.innerHTML = controlHTML();
  root.addEventListener('change', (ev) => {
    const e = ev.target;
    const next = clone(S);
    if (e.dataset.band) {
      next.bands[e.dataset.band] = e.checked;
      // Today's toolbar: turning one of heart rate and tissues on turns the other off.
      if (next.fence === 'exclusive' && e.checked && (e.dataset.band === 'hr' || e.dataset.band === 'tissues'))
        next.bands[e.dataset.band === 'hr' ? 'tissues' : 'hr'] = false;
    } else if (e.dataset.k) {
      const k = e.dataset.k;
      if (e.type === 'checkbox') next[k] = e.checked;
      else if (e.type === 'number' || k === 'sacWindow') next[k] = Number(e.value);
      else next[k] = e.value;
      if (k === 'fence' && e.value === 'exclusive' && next.bands.hr && next.bands.tissues) next.bands.tissues = false;
    }
    setSettings(next, false);
  });
  syncControls();
}

function initDecisions() {
  const list = document.getElementById('decision-list');
  list.innerHTML = DECISIONS.map((d) => `
    <article class="decision" id="${d.id}">
      <h3>${d.question}</h3>
      <p class="why">${d.why}</p>
      ${d.options.map((o, i) => `
        <div class="option">
          <span class="verdict ${o.verdict}">${o.verdict}</span>
          <div><p>${o.label}</p>${o.reason ? `<p class="reason">${o.reason}</p>` : ''}</div>
          <button type="button" data-d="${d.id}" data-o="${i}">Show</button>
        </div>`).join('')}
    </article>`).join('');
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-d]');
    if (!b) return;
    const d = DECISIONS.find((x) => x.id === b.dataset.d);
    setSettings(merge(S, d.options[Number(b.dataset.o)].show), true);
    document.getElementById('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

window.addEventListener('popstate', () => { S = readHash(); syncControls(); render(); });
initControls();
initDecisions();
render();
