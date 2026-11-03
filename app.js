// Grok Bot desk · read-only iPhone app (plan B). Data files are AES-GCM encrypted; the key comes from
// the #fragment of your private link, which browsers never send to any server. This repo holds no key.
// Every FOMO link shown here is a string carried in the JSON (made by links.py). This file never builds one.
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const POLL_S = 15, STALE_S = 120;

// ---------- data: encrypted files on the 'data' branch (or a local-only EXAMPLE fixture for screenshots)
const FIX = window.DESK_FIXTURE || null;
const DESK_DATA_BASE = 'https://raw.githubusercontent.com/idk02111/desk-web/';
const DESK_REF = 'https://api.github.com/repos/idk02111/desk-web/git/ref/heads/data';
let dataSha = 'data', dir = null, key = null;
const secret = FIX ? '' : decodeURIComponent(location.hash.slice(1));
async function refresh() {
  if (FIX) return;
  try { const r = await fetch(DESK_REF, {cache: 'no-cache'}); dataSha = r.ok ? (await r.json()).object.sha : 'data'; } catch (e) { dataSha = 'data'; }
}
async function sha(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
async function load(name) {
  if (FIX) {
    if (window.DESK_FIXTURE_FAIL) throw new Error('offline');
    if (!(name in FIX)) throw new Error('404');
    return JSON.parse(JSON.stringify(FIX[name]));
  }
  const r = await fetch(DESK_DATA_BASE + dataSha + '/' + dir + name, {cache: dataSha === 'data' ? 'no-store' : 'default'});
  if (!r.ok) throw new Error(String(r.status));
  const raw = new Uint8Array(await r.arrayBuffer());
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: raw.slice(0, 12)}, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------- state
const S = {state: null, chart: null, activity: null, coins: {}, coinErr: {}, lastOk: null, fail: false,
           nextAt: 0, range: 'LIVE', tab: 'home', overlay: null, coinMint: null, audMint: null, sigSeen: null, execAnim: 0};
window.deskStatus = 'loading';

// ---------- formatting (only numbers the desk sent; '—' when missing)
const has = v => v !== null && v !== undefined && !Number.isNaN(v);
const money = (v, sign = false) => !has(v) ? '—' : (v < 0 ? '-' : (sign ? '+' : '')) + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const compact = v => !has(v) ? '—' : '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(2));
const priceFmt = v => !has(v) ? '—' : v >= 1 ? '$' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4}) : '$' + Number(v.toPrecision(4)).toString().replace(/e-(\d+)/, (m, n) => 'e-' + n);
const pct = (v, d = 2) => !has(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const tm = ts => ts ? new Date(ts).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : '—';
const hm = ts => ts ? new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false}) : '';
const ago = ts => { if (!ts) return null; const m = Math.max(0, (nowMs() - Date.parse(ts)) / 60000);
  return m < 60 ? Math.floor(m) + 'm' : m < 2880 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const nowMs = () => FIX && S.state ? Date.parse(S.state.ts) : Date.now();
const settings = () => (S.state && S.state.settings) || {};
const isPaper = () => S.state && S.state.mode === 'PAPER';
const paperPill = () => isPaper() ? '<span class="pill paper">PAPER</span>' : '';
const ICON = {
  search: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  bell: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'};
const sk = (w, h, r = 12) => `<span class="sk" style="display:block;width:${w};height:${h}px;border-radius:${r}px"></span>`;
const errRow = () => '<div class="errrow"></div>' + (S.state && S.state.example ? '<div class="exrow">Example data · not real</div>' : '');

// ---------- odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left
function odo(el, text) {
  const chars = [...text], old = el.dataset.text || '';
  if (old.length !== chars.length || REDUCED() || !old) {
    el.innerHTML = chars.map(c => /\d/.test(c)
      ? `<span class="col"><span class="strip" style="transform:translateY(${-c * 1.05}em);transition:none">${'0123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>`
      : `<span class="ch">${esc(c)}</span>`).join('');
  } else {
    const kids = [...el.children]; let k = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] !== old[i] && /\d/.test(chars[i])) {
        const strip = kids[i].querySelector('.strip');
        if (strip) { strip.style.transition = ''; strip.style.transitionDelay = (k * 30) + 'ms'; strip.style.transform = `translateY(${-chars[i] * 1.05}em)`; k++; }
      }
    }
  }
  el.dataset.text = text;
}

// ---------- navigation
function go(tab) {
  S.tab = tab; closeOverlays(false);
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render(); scrollTo(0, 0);
}
function openOverlay(name, push = true) {
  S.overlay = name; $$('.overlay').forEach(o => o.classList.toggle('on', o.id === 'o-' + name));
  if (push) history.pushState({o: name}, '', location.href);   // same URL: the #key stays put
}
function closeOverlays(back = true) {
  if (!S.overlay) return;
  S.overlay = null; $$('.overlay').forEach(o => o.classList.remove('on'));
  if (back && history.state && history.state.o) history.back();
}
addEventListener('popstate', () => { if (S.overlay) { S.overlay = null; $$('.overlay').forEach(o => o.classList.remove('on')); } });
async function openCoin(mint) { S.coinMint = mint; openOverlay('coin'); renderCoin(); await loadCoin(mint); renderCoin(); }
async function openAuditor(mint) {
  if (!mint && S.state) mint = S.state.agents.auditor.current && S.state.agents.auditor.current.mint;
  S.audMint = mint || null; Aud.reset(); openOverlay('auditor'); renderAuditor();
  if (mint) { await loadCoin(mint); renderAuditor(); }
}
async function loadCoin(mint) {
  try { S.coins[mint] = await load('coin/' + mint + '.json'); S.coinErr[mint] = false; }
  catch (e) { S.coinErr[mint] = true; }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-go],[data-coin],[data-aud],[data-act]');
  if (!t || t.tagName === 'A') return;
  if (t.dataset.tab) go(t.dataset.tab);
  else if (t.dataset.go) { go(t.dataset.go); if (t.dataset.anchor) setTimeout(() => { const a = document.getElementById(t.dataset.anchor); a && a.scrollIntoView(); }, 0); }
  else if (t.dataset.coin) openCoin(t.dataset.coin);
  else if (t.dataset.aud !== undefined) openAuditor(t.dataset.aud || null);
  else if (t.dataset.act === 'back') closeOverlays();
  else if (t.dataset.act === 'search') openSearch();
  else if (t.dataset.act === 'range') { S.range = t.dataset.r; renderHome(); }
  else if (t.dataset.act === 'invite') invite();
  else if (t.dataset.act === 'bookf') { S.bookF = t.dataset.f; renderBook(); }
  else if (t.dataset.act === 'pos') { S.posK = S.posK === t.dataset.k ? null : t.dataset.k; renderBook(); }
});

// ---------- polling (no SSE in plan B): every ~15s; keep the last good numbers on screen
async function tick() {
  S.nextAt = Date.now() + POLL_S * 1000;
  await refresh();
  try {
    const st = await load('state.json');
    const [ch, act] = await Promise.all([load('chart.json').catch(() => S.chart), load('activity.json').catch(() => S.activity)]);
    S.state = st; S.chart = ch; S.activity = act; S.lastOk = Date.now(); S.fail = false;
    window.deskStatus = 'ok'; window.deskState = st;
    if (S.overlay === 'coin' && S.coinMint) await loadCoin(S.coinMint);
    if (S.overlay === 'auditor' && S.audMint) await loadCoin(S.audMint);
  } catch (e) { S.fail = true; if (window.deskStatus !== 'ok') window.deskStatus = 'nodata:' + e.message; }
  render();
}
function offline() {
  if (S.fail) return true;
  return !FIX && S.state && (Date.now() - Date.parse(S.state.ts)) / 1000 > STALE_S;   // desk stopped publishing
}
function updateErr() {
  const off = offline(); document.body.classList.toggle('offline', !!off);
  const n = Math.max(0, Math.ceil((S.nextAt - Date.now()) / 1000));
  const last = S.state ? tm(S.state.ts) : 'never';
  $$('.errrow').forEach(e => e.textContent = `Desk offline · retrying in ${n}s · last update ${last}`);
}
setInterval(updateErr, 1000);

function render() {
  renderHome(); if (S.tab === 'agents') renderAgents(); if (S.tab === 'activity') renderActivity(); if (S.tab === 'account') renderAccount();
  if (S.overlay === 'coin') renderCoin(); if (S.overlay === 'auditor') renderAuditor(); updateErr();
}

// ---------- activity rows (shared by Home and Activity)
const KIND = {bought: ['blue', '+', 'var(--blue)'], sold: ['green', '$', 'var(--green)'], stopped: ['red', '↓', 'var(--red)'], rejected: ['sec', '✕', 'var(--c2)']};
function vParts(v) {   // "$47.50 · 23.8% of stack" → two right-aligned lines so the coin name keeps its room
  const [a, ...b] = String(v ?? '—').split(' · ');
  return `<span class="v1">${esc(a)}</span>` + (b.length ? `<span class="v2">${esc(b.join(' · '))}</span>` : '');
}
function actRow(i) {
  const k = KIND[i.kind] || KIND.rejected;
  const target = i.screen === 'auditor' ? `data-aud="${esc(i.mint)}"` : `data-coin="${esc(i.mint)}"`;
  const vcol = i.kind === 'sold' ? 'green' : i.kind === 'stopped' ? 'red' : i.kind === 'rejected' ? 'sec' : '';
  return `<button class="row" ${i.mint ? target : ''}><span class="ic" style="background:${k[2]};color:${i.kind === 'rejected' ? 'var(--sec)' : i.kind === 'bought' ? '#fff' : '#000'}">${k[1]}</span>
    <span class="mid"><div class="t">${esc(i.title)}</div><div class="s">${esc(i.subtitle)}</div></span><span class="v ${vcol}">${vParts(i.value)}</span></button>`;
}

// ---------- HOME
function navbarHome() {
  const h = S.state && S.state.account && S.state.account.handle;
  return `<header class="navbar"><button class="tap" data-tab="account" aria-label="Account"><span class="avatar">${esc((h || 'S')[0].toUpperCase())}</span></button>
    <button class="brand" data-tab="agents">Grok Bot<span class="chev">›</span></button><span class="spacer"></span>
    <button class="tap" data-act="search" aria-label="Search">${ICON.search}</button>
    <button class="tap bell" aria-label="Notifications">${ICON.bell}</button></header>`;   // plan B: no unread dot
}
function renderHome() {
  const v = $('#v-home');
  if (S.tab !== 'home' && v.dataset.built && S.state) return;      // drawn when visible (canvas needs a size)
  if (!FIX && secret.length < 32) { v.innerHTML = navbarHome() + `<div class="locked">Locked. Open your private link (it ends in #…) to load the desk.</div>`; return; }
  if (!v.dataset.built || v.dataset.ex !== String(!!(S.state && S.state.example))) {
    v.innerHTML = navbarHome() + errRow() + `
      <section class="balance"><div class="bal-row"><span class="odo" id="odo"></span><span id="paperHome"></span></div>
        <div class="today" id="today"></div><div class="allbooks" id="allBooks"></div></section>
      <div class="chartbox"><canvas id="homeChart"></canvas></div>
      <div class="ranges" id="ranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-act="range" data-r="${r}">${r}</button>`).join('')}</div>
      <div class="sect"><h2 id="bookHd">Paper positions</h2></div>
      <div class="ranges bookf" id="bookF">${['all', 'open', 'closed'].map(f => `<button data-act="bookf" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
      <div class="list" id="bookList"></div>
      <div class="sect"><h2 id="agentsHd">Agents</h2></div>
      <div class="carousel" id="carousel"></div>
      <div class="sect"><h2>Activity</h2><button class="link" data-tab="activity">See all</button></div>
      <div class="list" id="homeAct"></div><div style="height:24px"></div>`;
    v.dataset.built = '1'; v.dataset.ex = String(!!(S.state && S.state.example));
  }
  $$('#ranges button').forEach(b => b.classList.toggle('on', b.dataset.r === S.range));
  const st = S.state;
  if (!st) {               // loading: #1c1c1e blocks in the final layout
    $('#odo').innerHTML = sk('220px', 62, 14); $('#today').innerHTML = sk('160px', 22, 11);
    $('#homeChart').style.display = 'none';
    if (!$('#chartSk')) $('.chartbox').insertAdjacentHTML('beforeend', `<div id="chartSk" style="margin:0 16px">${sk('100%', 224, 14)}</div>`);
    $('#agentsHd').textContent = 'Agents';
    $('#carousel').innerHTML = [0, 1].map(() => `<div class="acard sk"></div>`).join('');
    $('#homeAct').innerHTML = [0, 1, 2].map(() => `<div class="row"><span class="ic sk"></span><span class="mid">${sk('60%', 14, 7)}<div style="height:6px"></div>${sk('40%', 12, 6)}</span></div>`).join('');
    return;
  }
  $('#chartSk') && $('#chartSk').remove(); $('#homeChart').style.display = '';
  odo($('#odo'), money(st.balance));
  $('#paperHome').innerHTML = paperPill();
  const start = st.balanceStart, chg = has(start) && start ? (st.balance - start) / start * 100 : null;
  $('#today').innerHTML = `<span class="${chg >= 0 ? 'green' : 'red'}">${pct(chg)} today</span>` +
    (has(start) && start ? `<span class="pill mult">${(st.balance / start).toFixed(2)}×</span>` : '');
  drawHomeChart();
  renderBook();
  const A = st.agents;
  $('#agentsHd').textContent = `Agents · ${st.running} running`;
  $('#carousel').innerHTML = ['scanner', 'auditor', 'analyst', 'executor', 'risk'].map(k => agentCard(k, A[k])).join('');
  const rc = $('#ringHome'); rc && Charts.ring(rc, A.analyst.last ? A.analyst.last.score : null, A.analyst.minScore);
  animateExec();
  const items = (S.activity && S.activity.items) || [];
  $('#homeAct').innerHTML = items.length ? items.slice(0, 5).map(actRow).join('') : `<div class="empty">Nothing yet tonight</div>`;
}
// ---------- ALL PAPER BOOKS: the desk's positions + copybot's (merged by the desk publisher; fake money only)
const px = v => !has(v) ? '—' : v === 0 ? '$0' : v < 0.0001 ? '$' + v.toExponential(2) : v < 1 ? '$' + v.toPrecision(4) : '$' + v.toLocaleString('en-US', {maximumFractionDigits: 4});
const ct = iso => { if (!iso) return ''; try { return new Date(iso).toLocaleString('en-US', {timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) + ' CT'; } catch (e) { return iso; } };
const WHY = {stop: 'stop-loss', trail: 'trailing stop', timeout: 'timeout', trader: 'trader sold', pulled: 'pulled', tp: 'take profit'};
const posKey = p => `${p.book}:${p.id}:${p.mint}`;
// ---------- position price charts (inline SVG, no libs; data comes pre-fetched in the sealed state)
function chartGeom(ch, entry, w, h, pad, withLevels) {
  const pts = ch.pts || [];
  const t0 = pts[0][0], t1 = Math.max(pts[pts.length - 1][0], t0 + 1);
  const vals = pts.map(q => q[1]).concat([entry]);
  if (withLevels) [ch.stop, ch.trail].forEach(v => { if (has(v) && v > 0) vals.push(v); });
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; }
  const X = t => pad + (t - t0) / (t1 - t0) * (w - 2 * pad), Y = v => pad + (hi - v) / (hi - lo) * (h - 2 * pad);
  return {pts, X, Y, t0, t1, lo, hi};
}
function sparkSVG(p) {
  const ch = p.chart;
  if (!ch || !ch.pts || ch.pts.length < 2 || !has(p.entry)) return '<span class="spark"></span>';
  const w = 64, h = 26, g = chartGeom(ch, p.entry, w, h, 2, false), ey = g.Y(p.entry).toFixed(1);
  const line = g.pts.map(q => g.X(q[0]).toFixed(1) + ',' + g.Y(q[1]).toFixed(1)).join(' ');
  const id = 'sp' + Math.abs(hashS(posKey(p)));
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs>
    <clipPath id="${id}a"><rect x="0" y="0" width="${w}" height="${ey}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${ey}" width="${w}" height="${h}"/></clipPath></defs>
    <line x1="0" x2="${w}" y1="${ey}" y2="${ey}" class="ent"/>
    <polyline points="${line}" class="ln up" clip-path="url(#${id}a)"/><polyline points="${line}" class="ln dn" clip-path="url(#${id}b)"/></svg>`;
}
function hashS(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function trendBadge(tr, open) {
  if (!tr) return '';
  const cls = tr.dir === 'up' ? 'green' : tr.dir === 'down' ? 'red' : 'sec';
  const word = tr.dir === 'up' ? '▲ subiendo' : tr.dir === 'down' ? '▼ bajando' : '■ estable';
  return `<span class="trend ${cls}">${word} ${pct(tr.pct, 1)} <small>${tr.mins} min${open ? '' : ' antes del cierre'}</small></span>`;
}
function bigChart(p) {
  const ch = p.chart;
  if (!ch || !ch.pts || ch.pts.length < 2) return '<div class="empty">Sin historial de precio todavía</div>';
  const w = 340, h = 190, g = chartGeom(ch, p.entry, w, h, 14, true), ey = g.Y(p.entry);
  const line = g.pts.map(q => g.X(q[0]).toFixed(1) + ',' + g.Y(q[1]).toFixed(1)).join(' ');
  const id = 'bc' + Math.abs(hashS(posKey(p)));
  const last = g.pts[g.pts.length - 1], up = last[1] >= p.entry;
  const lvl = (v, cls, lab) => has(v) && v > 0 ? `<line x1="14" x2="${w - 14}" y1="${g.Y(v).toFixed(1)}" y2="${g.Y(v).toFixed(1)}" class="lv ${cls}"/>
    <text x="${w - 16}" y="${(g.Y(v) - 3).toFixed(1)}" class="lt ${cls}" text-anchor="end">${lab} ${px(v)}</text>` : '';
  const tlab = t => new Date(t * 1000).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'});
  return `<svg class="bigc" viewBox="0 0 ${w} ${h}" data-k="${esc(posKey(p))}"><defs>
      <clipPath id="${id}a"><rect x="0" y="0" width="${w}" height="${ey.toFixed(1)}"/></clipPath>
      <clipPath id="${id}b"><rect x="0" y="${ey.toFixed(1)}" width="${w}" height="${h}"/></clipPath></defs>
    ${lvl(ch.stop, 'stp', 'stop')}${lvl(ch.trail, 'trl', 'trail')}
    <line x1="14" x2="${w - 14}" y1="${ey.toFixed(1)}" y2="${ey.toFixed(1)}" class="lv ent"/>
    <text x="16" y="${(ey - 4).toFixed(1)}" class="lt">entrada ${px(p.entry)}</text>
    <polyline points="${line}" class="ln up" clip-path="url(#${id}a)"/><polyline points="${line}" class="ln dn" clip-path="url(#${id}b)"/>
    <circle cx="${g.X(g.pts[0][0]).toFixed(1)}" cy="${ey.toFixed(1)}" r="4" class="mk ent"/>
    <circle cx="${g.X(last[0]).toFixed(1)}" cy="${g.Y(last[1]).toFixed(1)}" r="5" class="mk ${up ? 'up' : 'dn'}"/>
    <text x="14" y="${h - 2}" class="lt">${tlab(g.t0)}</text><text x="${w - 14}" y="${h - 2}" class="lt" text-anchor="end">${p.status === 'open' ? 'ahora' : 'salida'} ${tlab(g.t1)}</text>
    <line class="xh" x1="-10" x2="-10" y1="10" y2="${h - 12}"/></svg>`;
}
function tagText(p) {
  const t = p.tag || '';
  if (t === 'scanner') return 'escáner';
  if (t === 'both') return p.book === 'copybot' ? 'wallet: ' + (p.source || '') + ' + escáner' : 'escáner + wallets';
  if (t.startsWith('wallet:')) return 'wallet: ' + t.slice(7);
  return p.source || t;
}
function whyBox(p) {
  if (!p.why || !p.why.length) return '';
  return `<div class="pp-why"><div class="sec">Por qué la elegí${has(p.score) ? ` · puntuación ${Math.round(p.score)}/100` : ''}</div><ul>${p.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
}
function posPanel(p) {
  const ch = p.chart || {}, open = p.status === 'open', col = has(p.pnlUsd) ? (p.pnlUsd >= 0 ? 'green' : 'red') : '';
  return `<div class="ppanel">
    <div class="pp-h"><span class="pp-pnl ${col}">${money(p.pnlUsd, true)} · ${pct(p.pnlPct, 1)}</span>${trendBadge(ch.trend, open)}</div>
    ${whyBox(p)}${bigChart(p)}
    <div class="pp-read" id="rd-${Math.abs(hashS(posKey(p)))}">Toca el gráfico para ver el precio</div>
    <div class="pp-l"><span>entrada <b>${px(p.entry)}</b></span><span>${open ? 'ahora' : 'salida'} <b class="${col}">${px(p.price)}</b></span>
      ${has(ch.stop) ? `<span class="red">stop ${px(ch.stop)}</span>` : ''}${has(ch.trail) ? `<span class="orange">trail ${px(ch.trail)}</span>` : ''}</div>
    <div class="pp-f"><span class="sec">${ch.src === 'gecko' ? 'velas GeckoTerminal + precios del bot' : 'precios del bot'} · PAPER</span>
      ${p.link ? `<a class="pp-btn" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">Abrir en FOMO</a>` : ''}</div></div>`;
}
function bookRow(p) {
  const up = has(p.pnlUsd) && p.pnlUsd >= 0, col = !has(p.pnlUsd) ? '' : up ? 'green' : 'red';
  const ic = p.status === 'open' ? ['var(--blue)', '#fff', '•'] : up ? ['var(--green)', '#000', '$'] : ['var(--red)', '#000', '↓'];
  const when = p.status === 'open' ? 'open since ' + ct(p.openedAt) : (WHY[p.reason] || p.reason || 'closed') + ' · ' + ct(p.closedAt);
  const prices = `${px(p.entry)} → ${px(p.price)}${p.status === 'open' ? ' now' : ''}`;
  const k = posKey(p), on = S.posK === k;
  const inner = `<span class="ic" style="background:${ic[0]};color:${ic[1]}">${ic[2]}</span>
    <span class="mid"><div class="t">${esc(p.name)} <span class="src tag-${esc((p.tag || '').split(':')[0])}">${esc(tagText(p))}</span></div><div class="s">${esc(prices)}</div><div class="s">${esc(when)}${has(p.sizeUsd) ? ' · ' + money(p.sizeUsd) : ''}</div></span>
    ${sparkSVG(p)}<span class="v ${col}"><span class="v1">${money(p.pnlUsd, true)}</span><span class="v2 ${col}">${pct(p.pnlPct, 1)}</span></span>`;
  return `<div class="prow${on ? ' on' : ''}"><div class="row" role="button" tabindex="0" data-act="pos" data-k="${esc(k)}">${inner}</div>${on ? posPanel(p) : ''}</div>`;
}
function chartRead(svg, clientX) {
  const b = S.state && S.state.book, p = b && (b.positions || []).find(q => posKey(q) === svg.dataset.k);
  if (!p || !p.chart) return;
  const r = svg.getBoundingClientRect(), w = 340, x = (clientX - r.left) / r.width * w;
  const g = chartGeom(p.chart, p.entry, w, 190, 14, true);
  let best = g.pts[0];
  g.pts.forEach(q => { if (Math.abs(g.X(q[0]) - x) < Math.abs(g.X(best[0]) - x)) best = q; });
  const xh = svg.querySelector('.xh'); xh.setAttribute('x1', g.X(best[0])); xh.setAttribute('x2', g.X(best[0]));
  const ch = (best[1] / p.entry - 1) * 100, el = document.getElementById('rd-' + Math.abs(hashS(posKey(p))));
  if (el) el.innerHTML = `${new Date(best[0] * 1000).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'})} CT · ${px(best[1])} · <span class="${ch >= 0 ? 'green' : 'red'}">${pct(ch, 1)} vs entrada</span>`;
}
['pointerdown', 'pointermove'].forEach(ev => document.addEventListener(ev, e => {
  const svg = e.target.closest && e.target.closest('svg.bigc');
  if (svg && (ev === 'pointerdown' || e.buttons || e.pointerType === 'touch' || e.pointerType === 'mouse')) chartRead(svg, e.clientX);
}, {passive: true}));
function renderBook() {
  const b = S.state && S.state.book, el = $('#bookList'), top = $('#allBooks');
  if (!el || !top) return;
  if (!b) { top.innerHTML = ''; el.innerHTML = `<div class="empty">No paper book in this data yet</div>`; return; }
  const t = b.total, bk = b.books, f = S.bookF || 'all';
  const part = k => bk[k] ? `${esc(bk[k].name)} ${money(bk[k].balance)} <span class="${bk[k].pnl >= 0 ? 'green' : 'red'}">(${money(bk[k].pnl, true)})</span>${bk[k].stale ? ' <span class="orange">stale</span>' : ''}` : '';
  top.innerHTML = `<div class="ab-t">All paper books <b>${money(t.balance)}</b> <span class="${t.pnl >= 0 ? 'green' : 'red'}">${money(t.pnl, true)} · ${pct(t.pnlPct)}</span></div>
    <div class="ab-s">${['desk', 'copybot'].map(part).filter(Boolean).join(' · ')} · start ${money(t.start)}</div>`;
  $$('#bookF button').forEach(x => x.classList.toggle('on', x.dataset.f === f));
  const rows = (b.positions || []).filter(p => f === 'all' || p.status === f);
  const nOpen = (b.positions || []).filter(p => p.status === 'open').length;
  $('#bookHd').textContent = `Paper positions · ${nOpen} open · ${(b.positions || []).length - nOpen} closed`;
  el.innerHTML = rows.length ? rows.map(bookRow).join('') : `<div class="empty">No ${f === 'all' ? '' : f + ' '}positions</div>`;
}
function drawHomeChart() {
  const st = S.state, ch = S.chart || {balance: [], marks: []};
  const to = Date.parse(st.ts), R = {'1H': 36e5, '4H': 4 * 36e5, '1D': 864e5, '1W': 7 * 864e5};
  const pts = (ch.balance || []).map(p => [Date.parse(p[0]), p[1]]);
  let from = S.range === 'LIVE' ? Date.parse(ch.nightStart || st.nightStart) : S.range === 'ALL' ? (pts.length ? pts[0][0] : to - 36e5) : to - R[S.range];
  const shown = pts.filter(p => p[0] >= from && p[0] <= to);
  const marks = (ch.marks || []).map(m => ({t: Date.parse(m.ts), kind: m.kind, text: m.text, id: m.kind + m.ts + m.mint}));
  Charts.line($('#homeChart'), {points: shown, start: ch.start, marks, from, to, empty: !marks.length});
}

// ---------- agent cards (Home carousel)
function cardTop(color, name, status) {
  return `<div class="top"><span class="dot" style="background:${color}"></span>${esc(name)}<span class="st"><span class="dot ${status}"></span> ${status}</span></div>`;
}
function agentCard(k, a) {
  if (k === 'scanner') {
    const feed = a.decisions.slice(0, 5);
    return `<div class="acard" data-tab="agents">${cardTop('var(--cyan)', 'Scanner', a.status)}
      <div class="big cyan">${a.count}<small>pools</small></div><div class="body">${feed.length ? `<ul class="feed">${feed.map(d =>
        `<li class="${d.verdict}"><span class="nm">${esc(d.name)}</span><span class="why">${esc(d.reason)}</span></li>`).join('')}</ul>` :
        `<div class="sec">Listening for graduations</div>`}</div></div>`;
  }
  if (k === 'auditor') {
    const c = a.current, L = c ? c.layers : [];
    const strips = Array.from({length: 8}, (_, i) => `<i class="${L[i] === 1 ? 'ok' : L[i] === 0 ? 'bad' : ''}"></i>`).join('');
    const line = !c ? '<span class="sec">No coin taken apart yet</span>' : c.verdict === 'taking apart' ? '<span class="sec">taking apart...</span>' :
      c.verdict === 'cleared' ? `<span class="green">8/8 → Executor</span>` : `<span class="red">${esc(c.reason)}</span>`;
    return `<div class="acard" data-aud="">${cardTop('var(--text)', 'Auditor', a.status)}
      <div class="big">${a.count}<small>taken apart</small></div>
      <div class="body"><div class="sec" style="font-size:15px">${c ? esc(c.name) : ''}</div><div class="strips">${strips}</div><div style="font-size:15px">${line}</div></div>
      <div class="foot">${a.rejected} rejected</div></div>`;
  }
  if (k === 'analyst') {
    const l = a.last;
    return `<div class="acard" data-tab="agents">${cardTop('var(--yellow)', a.name, a.status)}
      <div class="big yellow" style="font-size:28px">Scoring</div>
      <div class="body"><div class="ringwrap"><canvas id="ringHome"></canvas><div>${l ? `<div>${esc(l.name)}</div>
        <div class="${l.pass ? 'green' : 'red'}" style="font-size:15px">${l.pass ? 'passed' : esc(l.reason || 'rejected')}</div>` : '<div class="sec">No coin scored yet</div>'}
        <div class="sec" style="font-size:13px;margin-top:4px">green from ${a.minScore}</div></div></div></div></div>`;
  }
  if (k === 'executor') {
    const l = a.last;
    return `<div class="acard" data-tab="agents">${cardTop('var(--green)', 'Executor', a.status)}
      <div class="big green">${a.count}<small>trades</small></div>
      <div class="body">${l ? `<div style="font-size:17px">${esc(l.name)}</div><div class="sec">${money(l.size_usd)} · ${l.stack_pct}% of stack</div>
        <div class="bar"><i id="execBar" style="width:100%"></i></div><div id="execTxt" class="green" style="font-size:15px">${l.status === 'sent' ? '<span class="orange">Waiting for Bought</span>' : '✓ Filled'}</div>`
        : '<div class="sec">No trades yet</div>'}</div></div>`;
  }
  const l = a.last;
  return `<div class="acard" data-tab="agents">${cardTop('var(--pink)', 'Risk', a.status)}
    <div class="big pink" style="font-size:28px">${a.count ? 'Guarding' : 'Idle'}<small>${a.count} open</small></div>
    <div class="body">${l ? `<div><span class="${l.exit_reason === 'stop' ? 'red' : 'green'}">${l.exit_reason === 'stop' ? 'Stopped' : l.exit_reason === 'trail' ? 'Trailed out' : l.exit_reason === 'timeout' ? 'Timed out' : 'Pulled'}</span> · ${esc(l.name)}</div>
      <div class="${(l.pnl_usd || 0) >= 0 ? 'green' : 'red'}">${money(l.pnl_usd, true)}</div>` : '<div class="sec">No exits yet</div>'}
      <div class="pills"><span class="pill mono red-o">stop -${a.stopPct}%</span><span class="pill mono green-o">trail ${a.trailPct}%</span></div></div></div>`;
}
function animateExec() {               // "Executing... N%" then "✓ Filled" for a fill that arrived while watching
  const l = S.state.agents.executor.last, id = l ? l.ts + l.mint : null;
  if (S.sigSeen === null) { S.sigSeen = id || ''; return; }
  if (!id || id === S.sigSeen || REDUCED() || l.status !== 'bought') { S.sigSeen = id || S.sigSeen; return; }
  S.sigSeen = id; const t0 = performance.now();
  const f = now => { const k = Math.min(1, (now - t0) / 1200), bar = $('#execBar'), tx = $('#execTxt'); if (!bar) return;
    bar.style.width = (k * 100) + '%'; tx.innerHTML = k < 1 ? `<span class="sec">Executing... ${Math.round(k * 100)}%</span>` : '✓ Filled';
    if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

// ---------- AGENTS tab
const GROUP = {scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', executor: 'Executor', risk: 'Risk'};
function renderAgents() {
  const v = $('#v-agents'), st = S.state;
  const nav = `<header class="navbar"><h1 class="title-left">Agents</h1></header>` + errRow();
  if (!st) { v.innerHTML = nav + [0, 1, 2].map(() => `<div class="fcard">${sk('40%', 22, 8)}<div style="height:12px"></div>${sk('100%', 120, 10)}</div>`).join(''); updateErr(); return; }
  const colors = {scanner: 'var(--cyan)', auditor: 'var(--text)', analyst: 'var(--yellow)', executor: 'var(--green)', risk: 'var(--pink)'};
  v.innerHTML = nav + ['scanner', 'auditor', 'analyst', 'executor', 'risk'].map(k => {
    const a = st.agents[k], on = a.status !== 'paused';
    const sw = k === 'risk' && a.locked
      ? `<div class="ctl"><span class="lbl">${ICON.lock} Locked while a position is open</span><span class="switch on ro"></span></div>`
      : `<div class="ctl"><span class="lbl">${on ? 'On' : 'Paused'}</span><span class="switch ${on ? 'on' : ''} ro"></span></div>`;
    const empty = {scanner: 'Listening for graduations', auditor: 'No coin taken apart yet', analyst: 'No coin scored yet', executor: 'No trades yet', risk: 'No exits yet'}[k];
    const dec = a.decisions.slice(0, 20);
    return `<div class="fcard"><div class="hd"><span class="dot" style="background:${colors[k]}"></span><b>${esc(a.name)}</b>
        <span class="dot ${a.status}" style="margin-left:8px"></span><span class="sec" style="font-size:13px">${a.status}</span>
        <span class="cnt">${a.count} ${esc(a.countLabel)}</span></div>
      ${sw}<div class="note">Pause and resume go through chat with Grok Bot.</div>
      ${dec.length ? `<ul class="dec">${dec.map(d => `<li><span class="tm">${hm(d.ts)}</span>
        <span class="co"><a href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a><small>${esc(d.reason)}</small></span>
        <span class="vd ${verdictColor(d.verdict)}">${esc(d.verdict)}</span></li>`).join('')}</ul>` : `<div class="empty">${empty}</div>`}
      <button class="btn2" data-go="account" data-anchor="grp-${k}">Settings</button></div>`;
  }).join('') + '<div style="height:16px"></div>';
  updateErr();
}
const verdictColor = v => ['passed', 'cleared', 'bought', 'trailed out'].includes(v) ? 'green' : ['killed', 'rejected', 'stopped', 'pulled', 'missed'].includes(v) ? 'red' : v === 'skipped' ? 'sec' : 'orange';

// ---------- ACTIVITY tab
function renderActivity() {
  const v = $('#v-activity'), items = (S.activity && S.activity.items) || [];
  const nav = `<header class="navbar"><h1 class="title-left">Activity</h1></header>` + errRow();
  if (!S.state) { v.innerHTML = nav + `<div class="list">${[0, 1, 2, 3].map(() => `<div class="row"><span class="ic sk"></span><span class="mid">${sk('60%', 14, 7)}</span></div>`).join('')}</div>`; updateErr(); return; }
  v.innerHTML = nav + `<div class="list">${items.length ? items.map(actRow).join('') : '<div class="empty">Nothing yet tonight</div>'}</div><div style="height:16px"></div>`;
  updateErr();
}

// ---------- ACCOUNT tab
const LABEL = k => k.split('.').slice(1).join(' ').replace(/_/g, ' ');
function renderAccount() {
  const v = $('#v-account'), st = S.state;
  const nav = `<header class="navbar"><h1 class="title-left">Account</h1></header>` + errRow();
  if (!st) { v.innerHTML = nav + `<div class="acct-hd">${sk('56px', 56, 28)}${sk('40%', 22, 8)}</div><div style="margin:0 16px">${sk('100%', 44, 9)}</div>`; updateErr(); return; }
  const a = st.account || {}, s = st.settings || {}, R = st.ranges || {};
  const groups = {};
  Object.keys(s).sort().forEach(k => { const g = k.split('.')[0]; (groups[g] = groups[g] || []).push(k); });
  const setRow = k => {
    const val = s[k], r = R[k] || [null, null];
    if (typeof val === 'boolean') return `<div class="set"><div class="k"><span>${esc(LABEL(k))}</span><span class="switch ${val ? 'on' : ''} ro"></span></div></div>`;
    if (typeof val === 'number' && has(r[0])) return `<div class="set"><div class="k"><span>${esc(LABEL(k))}</span>
        <input class="numf" type="text" inputmode="decimal" value="${esc(val)}" readonly aria-label="${esc(k)}"></div>
        <input type="range" min="${r[0]}" max="${r[1]}" step="any" value="${val}" disabled>
        <div class="rng"><span>min ${r[0]}</span><span>max ${r[1]}</span></div><div class="key">${esc(k)}</div></div>`;
    return `<div class="set"><div class="k"><span>${esc(LABEL(k))}</span><span class="mono">${esc(val)}</span></div></div>`;
  };
  const notif = st.notifier || {};
  v.innerHTML = nav + `
    <div class="acct-hd"><span class="avatar">${esc((a.handle || 'S')[0].toUpperCase())}</span><div><div style="font:600 22px var(--display-font)">@${esc(a.handle)}</div>
      <div class="sec" style="font-size:15px">FOMO account</div></div></div>
    <div class="seg"><span class="${st.mode === 'PAPER' ? 'on' : ''}">PAPER</span><span class="${st.mode === 'LIVE' ? 'on' : ''}">LIVE</span></div>
    <div class="note" style="padding:8px 16px 0">Read-only here. Switching PAPER / LIVE, the stack, pause and every setting go through chat with Grok Bot, and each change is written to the change log.</div>
    <div class="grp">Stack</div>
    <div class="list"><div class="set"><div class="k"><span>${st.mode === 'LIVE' ? 'LIVE stack' : 'PAPER stack'}</span><input class="numf" type="text" value="${esc(money(st.stack))}" readonly></div></div></div>
    <div class="grp">FOMO</div>
    <div class="list">
      <a class="row" href="${esc(a.profileUrl)}" target="_blank" rel="noopener noreferrer"><span class="mid"><div class="t">Your FOMO profile</div><div class="s">@${esc(a.handle)}</div></span><span class="chev">›</span></a>
      <button class="row" data-act="invite"><span class="mid"><div class="t">Invite a friend</div><div class="s">Share your FOMO invite link</div></span><span class="chev">›</span></button>
    </div>
    <div class="grp">Notifications</div>
    <div class="list"><div class="row"><span class="mid"><div class="t">Discord: ${notif.configured ? 'connected' : 'not set'}</div>
      <div class="s">Test pushes go through chat with Grok Bot</div></span></div></div>
    ${Object.keys(groups).map(g => `<div class="grp" id="grp-${g}">${esc(GROUP[g] || (g === 'desk' ? 'Desk' : g))}</div><div class="list">${groups[g].map(setRow).join('')}</div>`).join('')}
    <div style="height:24px"></div>`;
  updateErr();
}
async function invite() {
  const url = S.state && S.state.account && S.state.account.signupUrl; if (!url) return;
  if (navigator.share) { try { await navigator.share({url}); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { toast('Copy failed'); }
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1800); }

// ---------- COIN screen
function lastPrice(c) { const p = (c.prices || []).filter(x => x[1] != null); return p.length ? p[p.length - 1][1] : (c.market ? c.market.priceUsd : null); }
function renderCoin() {
  const o = $('#o-coin'), m = S.coinMint, c = S.coins[m];
  const nav = `<header class="navbar"><button class="tap back" data-act="back">${ICON.back}Back</button><span class="spacer"></span></header>` + errRow();
  if (!c) {
    o.innerHTML = nav + (S.coinErr[m] && S.state ? `<div class="empty">This coin isn't in tonight's data.</div>` :
      `<div class="coinhd">${sk('60%', 26, 8)}<div style="height:8px"></div>${sk('40%', 16, 8)}<div style="height:14px"></div>${sk('70%', 62, 14)}</div><div style="margin:12px 16px">${sk('100%', 280, 14)}</div>`);
    updateErr(); return;
  }
  const cn = c.coin || {}, p = c.position, open = p && !p.closed_at, au = c.audit || {}, rows = au.rows || [];
  const okN = rows.filter(r => r.pass === 1).length, red = rows.some(r => r.pass === 0);
  const shield = !rows.length ? `<span class="shield na">no audit</span>` : `<button class="shield ${red ? 'bad' : au.running ? 'na' : ''}" data-aud="${esc(m)}">◈ ${okN}/8</button>`;
  const lp = lastPrice(c), since = p && has(lp) ? (lp - p.entry_price) / p.entry_price * 100 : null;
  const age = ago(cn.migrated_at);
  const mk = c.market || {};
  const ex = c.exit;
  o.innerHTML = nav + `
    <div class="coinhd"><div class="nm">${esc(c.name)} ${paperPill()}</div>
      <div class="sub">${esc(cn.symbol || '')}${cn.symbol ? ' · ' : ''}${esc(c.chain || 'Solana')}${age ? ' · ' + age + ' old' : ''} ${shield}</div>
      <div class="price" id="coinPrice">${priceFmt(lp)}</div>
      ${has(since) ? `<div class="chg ${since >= 0 ? 'green' : 'red'}">${since >= 0 ? '▲' : '▼'} ${Math.abs(since).toFixed(2)}% since entry</div>` : ''}</div>
    <div class="candles"><canvas id="coinCandles"></canvas></div>
    <div class="stats"><div><small>Market cap</small><b>${compact(mk.marketCap)}</b></div><div><small>Liquidity</small><b>${compact(mk.liquidityUsd)}</b></div>
      <div><small>24h volume</small><b>${compact(mk.volH24)}</b></div><div><small>Holders</small><b>${has(cn.holders) ? cn.holders.toLocaleString('en-US') : 'n/a'}</b></div></div>
    ${open ? `<div class="card"><div class="kv"><span>Your position</span><span>${money(p.size_usd)} in · Executor</span></div>
      <div class="kv"><span>Entry</span><span>${priceFmt(p.entry_price)}</span></div></div>` : ''}
    ${p && p.closed_at ? `<div class="card"><div class="kv"><span>Closed · ${esc({trail: 'trailing stop', stop: 'stop', timeout: 'timeout', pulled: 'liquidity pulled'}[p.exit_reason] || '')}</span>
      <span class="${(p.pnl_usd || 0) >= 0 ? 'green' : 'red'}">${money(p.pnl_usd, true)}</span></div></div>` : ''}
    ${open && ex ? `<div class="card"><div class="kv"><span>Stop line</span><span class="red">${priceFmt(ex.stopLine)} · -${ex.stopPct}%</span></div>
      <div class="kv"><span>Trail line</span><span class="${ex.trailActive ? 'green' : 'sec'}">${ex.trailActive ? `${priceFmt(ex.trailLine)} · ${ex.trailPct}% under peak` : `starts at +${ex.trailStartPct}% (${priceFmt(ex.trailStartsAt)})`}</span></div>
      <div class="kv"><span>Timeout</span><span>${dur(Date.parse(ex.timeoutAt) - nowMs())} left · needs +${ex.timeoutMinGainPct}%</span></div></div>` : ''}
    <a class="cta ${open ? 'sell' : ''}" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">${open ? 'Sell on FOMO' : 'Buy on FOMO'}</a>`;
  fitText($('#coinPrice'), 66, 40);
  const lines = open && ex ? [{v: ex.exitLine, color: Charts.C.orange, dash: true, label: 'Risk trailing stop'}] : [];
  Charts.candles($('#coinCandles'), {candles: Charts.candlesFrom(c.prices || []), lines});
  updateErr();
}
function fitText(el, max, min) { if (!el) return; let s = max; el.style.fontSize = s + 'px'; while (el.scrollWidth > el.clientWidth && s > min) { s -= 2; el.style.fontSize = s + 'px'; } }

// ---------- AUDITOR screen: 8 discs, a cyan beam reads each layer (350ms), then 150ms to green or red.
// The beam waits on a layer the server hasn't sent yet. Never shows a result the server didn't send.
const NAMES = ['Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders', 'Liquidity', 'Pool age', 'Bundled wallets', 'Delegations'];
const Aud = {mint: null, shown: 0, busy: false, done: false, timers: [],
  reset() { this.timers.forEach(clearTimeout); this.timers = []; this.mint = null; this.shown = 0; this.busy = false; this.done = false; }};
function renderAuditor() {
  const o = $('#o-auditor'), m = S.audMint, c = m ? S.coins[m] : null;
  const nav = `<header class="navbar"><button class="tap back" data-act="back">${ICON.back}Back</button><h1>Auditor</h1><span class="tap"></span></header>`;
  if (!m) { o.innerHTML = nav + errRow() + (S.state ? `<div class="empty" style="padding-top:80px">No coin taken apart yet</div>` : `<div class="aud">${sk('100%', 260, 14)}</div>`) + toggleHTML(); updateErr(); return; }
  if (!c) { o.innerHTML = nav + errRow() + (S.coinErr[m] && S.state ? `<div class="empty">No coin taken apart yet</div>` : `<div class="aud">${sk('60%', 30, 8)}<div style="height:16px"></div>${sk('100%', 260, 14)}</div>`); updateErr(); return; }
  if (Aud.mint !== m) {
    Aud.reset(); Aud.mint = m;
    o.innerHTML = nav + errRow() + `<div class="aud"><div class="coinname">${esc(c.name)}</div><div class="sec" style="font-size:15px">${esc((c.coin || {}).symbol || '')} · ${esc(c.chain || 'Solana')}</div>
      <div class="discs" id="discs">${NAMES.map((_, i) => `<div class="disc" id="disc${i}" style="top:${i * 30}px;z-index:${10 - i}"></div>`).join('')}<div class="beam" id="beam"></div></div></div>
      <div class="list lrows">${NAMES.map((n, i) => `<div class="row hide" id="lr${i}"><span class="ok-ic na" id="li${i}">${i + 1}</span><span class="mid"><div class="t">${n}</div></span><span class="v" id="lv${i}"></span></div>`).join('')}</div>
      <div class="result" id="audResult"></div>${toggleHTML(c)}
      <a class="cta" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>`;
  }
  updateErr(); audStep();
}
function toggleHTML(c) {
  const en = c ? (c.audit || {}).enabled : settings()['auditor.enabled'];
  return `<div class="card"><div class="ctl" style="margin:0"><span class="lbl">Take apart before buying</span><span class="switch ${en !== false ? 'on' : ''} ro"></span></div>
    <div class="note">Changes go through chat with Grok Bot.</div></div>`;
}
function audStep() {
  const c = S.coins[Aud.mint]; if (!c || Aud.busy || Aud.done) return;
  const rows = ((c.audit || {}).rows || []).slice().sort((a, b) => a.layer - b.layer), running = (c.audit || {}).running;
  const beam = $('#beam'); if (!beam) return;
  const reveal = (i, r) => {
    $('#disc' + i).className = 'disc ' + (r.pass === 1 ? 'ok' : 'bad'); $('#disc' + i).textContent = r.pass === 1 ? '✓' : '✕';
    $('#lr' + i).classList.remove('hide'); const ic = $('#li' + i); ic.className = 'ok-ic ' + (r.pass === 1 ? 'ok' : 'bad'); ic.textContent = r.pass === 1 ? '✓' : '✕';
    const lv = $('#lv' + i); lv.textContent = r.value; lv.className = 'v ' + (r.pass === 1 ? '' : 'red');
  };
  if (REDUCED()) {                    // no beam: values swap instantly
    while (Aud.shown < rows.length) { reveal(Aud.shown, rows[Aud.shown]); if (rows[Aud.shown].pass === 0) { Aud.shown++; break; } Aud.shown++; }
    return audFinish(c, rows, running);
  }
  const i = Aud.shown;
  const red = rows.slice(0, i).some(r => r.pass === 0);
  if (red || i >= 8 || (i >= rows.length && !running)) return audFinish(c, rows, running);
  beam.classList.add('on'); beam.style.top = (i * 30 + 20) + 'px';
  if (i >= rows.length) { beam.classList.add('wait'); return; }      // server slower: wait on this layer
  beam.classList.remove('wait'); Aud.busy = true;
  Aud.timers.push(setTimeout(() => { reveal(i, rows[i]);
    Aud.timers.push(setTimeout(() => { Aud.shown++; Aud.busy = false; audStep(); }, 150)); }, 350));
}
function audFinish(c, rows, running) {
  if (running) { $('#beam') && $('#beam').classList.add('on', 'wait'); return; }
  Aud.done = true; $('#beam') && $('#beam').classList.remove('on', 'wait');
  const red = rows.find(r => r.pass === 0);
  for (let i = 0; i < 8; i++) if (!rows[i] || (red && rows[i].layer > red.layer)) {       // layers after a red were not checked
    if ($('#disc' + i).classList.contains('ok') || $('#disc' + i).classList.contains('bad')) continue;
    $('#disc' + i).className = 'disc skip'; $('#lr' + i).classList.remove('hide'); $('#lv' + i).textContent = 'not checked'; $('#lv' + i).className = 'v ter';
  }
  const au = c.audit || {}, sig = c.signal, vd = c.verdict, rules = settings()['analyst.mode'] === 'rules';
  let html;
  if (red) html = `<b class="red">Rejected · ${esc(red.value)}</b><div class="sec">Grok Bot won't buy ${esc(c.name)}</div>`;
  else if (rows.length === 8) {
    const next = sig && has(sig.size_usd) ? `Sent to Executor · ${money(sig.size_usd)}` : sig && sig.status === 'skipped' ? 'Sent to Executor · skipped'
      : vd && !vd.pass ? `${rules ? 'Analyst (rules)' : 'Analyst'} · ${esc(vd.reason || 'rejected')}` : 'Sent to Analyst';
    html = `<b class="green">Cleared · 8/8 parts</b><div class="sec">${next}</div>`;
  } else html = `<b class="sec">Not finished</b>`;
  $('#audResult').innerHTML = html;
}

// ---------- search (name, symbol or mint)
function openSearch() {
  openOverlay('search');
  const o = $('#o-search');
  o.innerHTML = `<header class="navbar"><button class="tap back" data-act="back">${ICON.back}</button><div class="search" style="flex:1;padding:0">
    <input id="q" type="search" placeholder="Name, symbol or mint" autocomplete="off" autocapitalize="off" spellcheck="false"></div></header><div class="list" id="qres" style="margin-top:8px"></div>`;
  const q = $('#q'), res = $('#qres');
  const run = () => { const t = q.value.trim().toLowerCase(), coins = (S.state && S.state.coins) || [];
    const hit = t ? coins.filter(c => [c.name, c.symbol, c.mint].some(x => x && x.toLowerCase().includes(t))) : coins.slice(-20).reverse();
    res.innerHTML = hit.length ? hit.slice(0, 40).map(c => `<button class="row" data-coin="${esc(c.mint)}"><span class="mid"><div class="t">${esc(c.name)}</div>
      <div class="s">${esc(c.symbol || '')} · ${esc(c.mint.slice(0, 4))}...${esc(c.mint.slice(-4))}</div></span><span class="chev">›</span></button>`).join('')
      : `<div class="empty">${t ? 'No coin matches' : 'No coins tonight yet'}</div>`; };
  q.addEventListener('input', run); run(); setTimeout(() => q.focus(), 50);
}

// ---------- boot
async function init() {
  render();
  if (FIX) { tick(); setInterval(tick, POLL_S * 1000); return; }
  if (secret.length < 32) { window.deskStatus = 'locked'; return; }
  dir = 'd/' + hex(await sha('dir:' + secret)).slice(0, 32) + '/';
  key = await crypto.subtle.importKey('raw', await sha('key:' + secret), 'AES-GCM', false, ['decrypt']);
  window.deskStatus = 'waiting';
  tick(); setInterval(tick, POLL_S * 1000);
}
window.desk = {go, openCoin, openAuditor, tick, S};      // used by the local screenshot harness
init();
if ('serviceWorker' in navigator && !FIX) navigator.serviceWorker.register('sw.js');
