// Hand-drawn <canvas> charts: Home balance line, Coin candles, Analyst score ring. No library.
// Every canvas is devicePixelRatio aware. Charts draw only numbers the desk sent.
'use strict';
const Charts = (() => {
  const C = {green:'#00d35a', red:'#ff453a', orange:'#ff9f0a', blue:'#0a84ff', sec:'rgba(235,235,245,0.6)',
             ter:'rgba(235,235,245,0.3)', sep:'rgba(84,84,88,0.55)', c1:'#1c1c1e', c2:'#2c2c2e', yellow:'#ffd60a'};
  const FONT = '-apple-system,"SF Pro Text",BlinkMacSystemFont,system-ui,sans-serif';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return {g, w, h};
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function dashed(g, x0, x1, y, color) { g.save(); g.setLineDash([4, 4]); g.strokeStyle = color; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.restore(); }

  // ---- Home line --------------------------------------------------------------------------
  // opts: {points:[[ms,value]], start, marks:[{t,kind,text}], from, to, empty:bool, prev:{n,ids:Set}}
  const lineState = new WeakMap();
  function line(cv, opts) {
    const st = lineState.get(cv) || {n: 0, ids: new Set(), raf: 0};
    lineState.set(cv, st);
    const pts = opts.points || [];
    const grew = pts.length > st.n && st.n > 0 && !reduced();
    const newMarks = (opts.marks || []).filter(m => !st.ids.has(m.id));
    cancelAnimationFrame(st.raf);
    const t0 = performance.now();
    const frame = now => {
      const k = grew ? Math.min(1, (now - t0) / 250) : 1;           // new point slides in over 250ms
      const f = reduced() || !newMarks.length ? 1 : Math.min(1, (now - t0) / 200);   // marks fade in 200ms
      drawLine(cv, opts, k, f, new Set(newMarks.map(m => m.id)));
      if (k < 1 || f < 1) st.raf = requestAnimationFrame(frame);
    };
    st.n = pts.length; (opts.marks || []).forEach(m => st.ids.add(m.id));
    if (grew || newMarks.length && !reduced()) st.raf = requestAnimationFrame(frame); else drawLine(cv, opts, 1, 1, new Set());
  }
  function drawLine(cv, o, k, fade, fresh) {
    const {g, w, h} = setup(cv);
    const top = 64, bot = h - 8, pts = o.points || [];
    const from = o.from, to = Math.max(o.to, from + 1);
    let vals = pts.map(p => p[1]); if (o.start != null) vals.push(o.start);
    if (!vals.length) vals = [0];
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const X = t => (t - from) / (to - from) * w, Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    if (o.start != null) dashed(g, 0, w, Y(o.start), C.ter);
    if (o.empty) {
      g.fillStyle = C.sec; g.font = `15px ${FONT}`; g.textAlign = 'center';
      g.fillText('Waiting for the first trade', w / 2, (o.start != null ? Y(o.start) : h / 2) - 14);
      return;
    }
    if (pts.length) {
      let xy = pts.map(p => [X(p[0]), Y(p[1])]);
      if (k < 1 && xy.length > 1) {                       // last point slides in from the previous one
        const a = xy[xy.length - 2], b = xy[xy.length - 1];
        xy[xy.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
      const grad = g.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, 'rgba(0,211,90,0.28)'); grad.addColorStop(1, 'rgba(0,211,90,0)');
      g.beginPath(); xy.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.lineTo(xy[xy.length - 1][0], bot); g.lineTo(xy[0][0], bot); g.closePath(); g.fillStyle = grad; g.fill();
      g.beginPath(); xy.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.strokeStyle = C.green; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
      const e = xy[xy.length - 1]; g.fillStyle = C.green; g.beginPath(); g.arc(e[0], e[1], 4, 0, 7); g.fill();
    }
    // marks above the line; never overlap: a later mark moves up a row
    const placed = []; g.font = `600 12px ${FONT}`; g.textBaseline = 'middle';
    const valAt = t => { let v = null; for (const p of pts) { if (p[0] <= t) v = p[1]; else break; } return v ?? (pts[0] ? pts[0][1] : o.start); };
    const hit = (x, y, tw, mh) => placed.some(r => x < r[0] + r[2] + 4 && x + tw > r[0] - 4 && y < r[1] + r[3] + 4 && y + mh > r[1] - 4);
    for (const m of (o.marks || []).filter(m => m.t >= from && m.t <= to).sort((a, b) => a.t - b.t)) {
      const tw = g.measureText(m.text).width + 14, mh = 22;
      const x = Math.min(Math.max(X(m.t) - tw / 2, 2), w - tw - 2);
      const baseY = Math.max(2, Math.max(top - 2, Y(valAt(m.t)) - 18) - mh);
      let y = baseY;
      while (hit(x, y, tw, mh) && y - (mh + 4) >= 2) y -= mh + 4;          // a later mark moves up a row
      if (hit(x, y, tw, mh)) { y = baseY; while (hit(x, y, tw, mh) && y + mh < bot) y += mh + 4; }   // no room above: go below
      placed.push([x, y, tw, mh]);
      const col = m.kind === 'bought' ? C.blue : m.kind === 'sold' ? C.green : C.red;
      g.globalAlpha = fresh.has(m.id) ? fade : 1;
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(X(m.t), y + mh); g.lineTo(X(m.t), Y(valAt(m.t))); g.stroke();
      rrect(g, x, y, tw, mh, 11); g.fillStyle = col; g.fill();
      g.fillStyle = m.kind === 'bought' ? '#fff' : '#000'; g.textAlign = 'left'; g.fillText(m.text, x + 7, y + mh / 2 + 1);
      g.globalAlpha = 1;
    }
  }

  // ---- Coin candles: 1-minute OHLC built from db.prices; volume = change of DexScreener volume.m5
  function candlesFrom(prices) {
    const by = new Map();
    for (const [ts, p, v] of prices) {
      if (p == null) continue;
      const t = Date.parse(ts), m = Math.floor(t / 60000) * 60000;
      let c = by.get(m);
      if (!c) by.set(m, c = {t: m, o: p, h: p, l: p, c: p, vEnd: v});
      c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p; if (v != null) c.vEnd = v;
    }
    const out = [...by.values()].sort((a, b) => a.t - b.t);
    out.forEach((c, i) => { const pv = i ? out[i - 1].vEnd : null; c.vol = (c.vEnd != null && pv != null) ? Math.max(0, c.vEnd - pv) : 0; });
    return out;
  }
  function candles(cv, o) {
    const {g, w, h} = setup(cv);
    const cs = o.candles || [];
    if (!cs.length) { g.fillStyle = C.sec; g.font = `15px ${FONT}`; g.textAlign = 'center'; g.fillText('No prices recorded yet', w / 2, h / 2); return; }
    const right = 8, volH = 44, top = 14, bot = h - volH - 10;
    const n = Math.max(cs.length, 30), slot = (w - right) / n, bw = Math.max(1.5, slot * 0.62);
    let lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
    for (const ln of (o.lines || [])) if (ln.v != null) { lo = Math.min(lo, ln.v); hi = Math.max(hi, ln.v); }
    if (hi - lo < 1e-12) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const vmax = Math.max(1e-9, ...cs.map(c => c.vol));
    const off = n - cs.length;
    cs.forEach((c, i) => {
      const x = (off + i) * slot + slot / 2, up = c.c >= c.o, col = up ? C.green : C.red;
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      g.fillStyle = col; g.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
      const vh = c.vol / vmax * volH; g.globalAlpha = 0.45; g.fillRect(x - bw / 2, h - vh, bw, vh); g.globalAlpha = 1;
    });
    for (const ln of (o.lines || [])) {
      if (ln.v == null) continue;
      const y = Y(ln.v); g.save(); g.setLineDash(ln.dash ? [6, 4] : []); g.strokeStyle = ln.color; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.restore();
      g.font = `600 12px ${FONT}`; g.fillStyle = ln.color; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(ln.label, 4, y - 3);
    }
  }

  // ---- Analyst score ring 0-100, green from min_score
  function ring(cv, score, minScore) {
    const {g, w, h} = setup(cv), r = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    if (r <= 0) return;
    g.lineWidth = 10; g.lineCap = 'round';
    g.strokeStyle = C.c2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (score != null) {
      g.strokeStyle = score >= minScore ? C.green : C.red;
      g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100); g.stroke();
    }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 34px -apple-system,"SF Pro Display",BlinkMacSystemFont,system-ui,sans-serif`;
    g.fillText(score == null ? '—' : String(score), cx, cy + 1);
  }
  return {line, candles, candlesFrom, ring, C};
})();
