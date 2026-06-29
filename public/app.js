
const state = {
  route: 'home',
  market: null,
  scan: null,
  insight: null,
  chartCache: new Map(),
  liveCharts: new Map(),
  config: { livePricePollSeconds: 15, validatePollSeconds: 30 },
  timer: null,
  scanTimer: null,
  insightTimer: null,
  errors: { market: '', scan: '', config: '' }
};

const $ = (sel) => document.querySelector(sel);
const app = $('#app');
const ticker = $('#ticker');

init();

async function init() {
  window.addEventListener('hashchange', render);
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  setupMobileMenu();
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    openAnalysis(btn.dataset.open);
  });
  await loadConfig();
  await refreshAll(false);
  startLoops();
  render();
}


function setupMobileMenu() {
  const getToggle = () => document.querySelector('#menu-toggle');
  const setExpanded = (value) => {
    const toggle = getToggle();
    if (toggle) toggle.setAttribute('aria-expanded', value ? 'true' : 'false');
  };
  const close = () => {
    document.body.classList.remove('menu-open');
    setExpanded(false);
  };
  const open = () => {
    document.body.classList.add('menu-open');
    setExpanded(true);
  };
  const toggleMenu = () => {
    document.body.classList.contains('menu-open') ? close() : open();
  };

  // Event delegation: lebih kuat untuk mobile browser dan tetap jalan walau DOM dirender ulang.
  document.addEventListener('click', (event) => {
    if (event.target.closest('#menu-toggle')) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
      return;
    }
    if (
      event.target.closest('[data-menu-close]') ||
      event.target.closest('.menu-backdrop') ||
      event.target.closest('.sidebar .nav a') ||
      event.target.closest('.mobile-brand')
    ) {
      close();
    }
  }, true);

  window.addEventListener('hashchange', close);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1200) close();
  });
}

async function loadConfig() {
  try {
    state.config = await api('/api/config');
    state.errors.config = '';
  } catch (e) {
    state.errors.config = e.message;
  }
}

function startLoops() {
  clearInterval(state.timer);
  clearInterval(state.scanTimer);
  clearInterval(state.insightTimer);
  state.timer = setInterval(() => refreshMarket(true), Math.max(5, state.config.livePricePollSeconds || 15) * 1000);
  state.scanTimer = setInterval(() => refreshScan(true), Math.max(15, state.config.validatePollSeconds || 30) * 1000);
  state.insightTimer = setInterval(() => refreshInsight(true), 60 * 1000);
}

async function api(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Response API bukan JSON valid untuk ${url}. Biasanya ini terjadi karena deploy belum selesai atau route API error.`);
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshAll(showToast = false) {
  await Promise.all([refreshMarket(false), refreshScan(false), refreshInsight(false)]);
  if (showToast) toast('Data direfresh');
  render();
}

async function refreshMarket(renderAfter = true) {
  try {
    state.market = await api('/api/live-market');
    state.errors.market = '';
  } catch (e) {
    state.errors.market = e.message;
  }
  renderTicker();
  if (renderAfter) render();
}

async function refreshScan(renderAfter = true) {
  try {
    state.scan = await api('/api/scan');
    state.errors.scan = '';
  } catch (e) {
    state.errors.scan = e.message;
  }
  if (renderAfter) render();
}

async function refreshInsight(renderAfter = true) {
  try {
    state.insight = await api('/api/market-insight');
    state.errors.insight = '';
  } catch (e) {
    state.errors.insight = e.message;
  }
  if (renderAfter && state.route === 'insights') render();
}

function render() {
  state.route = location.hash.replace('#/', '') || 'home';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === state.route));
  const titles = {
    home: ['Home', 'Crypto & Forex Signal Radar'],
    crypto: ['Crypto', 'Action, timeframe, dan chart professional.'],
    forex: ['Forex', 'Daily bias, move, dan risk zone.'],
    insights: ['Market Insight', 'Flow 24H, news impact, dan liquidity direction.']
  };
  const [title, sub] = titles[state.route] || titles.home;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = sub;
  renderAlerts();
  if (state.route === 'crypto') return renderMarketPage('crypto');
  if (state.route === 'forex') return renderMarketPage('forex');
  if (state.route === 'insights') return renderInsights();
  return renderHome();
}

function renderAlerts() {
  const box = $('#alert-box');
  const msgs = [state.errors.config, state.errors.market, state.errors.scan, state.errors.insight].filter(Boolean);
  if (!msgs.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="error-box"><strong>Ada masalah data:</strong><div style="margin-top:8px">${msgs.map(m => `<div>• ${escapeHtml(m)}</div>`).join('')}</div></div>`;
}

function renderTicker() {
  const items = (state.market?.all || []).slice(0, 14);
  ticker.innerHTML = items.map(a => `
    <div class="ticker-item">
      <strong>${a.display}</strong>
      <span><b>${fmtPrice(a)}</b><b class="${trendClass(a.changePct)}">${signed(a.changePct)}%</b></span>
    </div>
  `).join('') || '<div class="ticker-item"><strong>Data belum masuk</strong><span>Tunggu scan atau cek API</span></div>';
}

function renderHome() {
  const summary = state.scan?.summary || {};
  const best = firstSignal() || summary.best;
  app.innerHTML = `
    <div class="hero">
      <div class="hero-top">
        <div>
          <h2>AstraQuant CryptoFX Signal Radar.</h2>
          <p>Signal global untuk semua user. Setup tetap stabil sampai invalid, target tercapai, atau waktunya habis.</p>
          <div class="hero-actions">
            <a class="btn primary" href="#/insights">Market Insight</a>
            <a class="btn secondary" href="#/crypto">Lihat Crypto</a>
          </div>
        </div>
        <div class="top-signal-card">
          <h3>TOP SIGNAL</h3>
          <div class="big">${best ? best.display : '-'}</div>
          <div class="sub">${best ? `${best.signalAction || best.action || actionFromDirection(best.direction)} • ${best.timeframe || best.horizon || '-'} • score ${best.aiScore ?? '-'}` : 'Belum ada signal'}</div>
          <div class="kpis" style="margin-top:14px">
            <div class="kpi"><small>Price</small><strong>${best ? fmtPrice(best) : '-'}</strong></div>
            <div class="kpi"><small>Change</small><strong class="${best ? trendClass(best.changePct) : ''}">${best ? signed(best.changePct)+'%' : '-'}</strong></div>
            <div class="kpi"><small>Valid</small><strong>${best ? (best.validFor || '-') : '-'}</strong></div>
          </div>
          ${best ? `<div class="actions"><button class="btn secondary" data-open="${best.symbol}">Open Analysis</button></div>` : ''}
        </div>
      </div>
      <div class="hero-grid">
        <div class="metric"><strong>${summary.active ?? 0}</strong><small>Active setup</small></div>
        <div class="metric"><strong>${summary.watchlist ?? 0}</strong><small>Watchlist</small></div>
        <div class="metric"><strong>${summary.universe ?? 0}</strong><small>Asset discan AI</small></div>
        <div class="metric"><strong>${state.market?.all?.length ?? 0}</strong><small>Live asset terbaca</small></div>
      </div>
    </div>
    <div class="grid">
      <div class="panel"><h3 style="margin-top:0">Global Signal</h3><p class="note">Semua user melihat setup yang sama dari database.</p></div>
      <div class="panel"><h3 style="margin-top:0">Auto Replace</h3><p class="note">AI mengganti setup otomatis jika stop loss, target, atau valid time tercapai.</p></div>
    </div>
    ${renderCards((state.scan?.signals || []).slice(0, 4))}
    
  `;
  bindOpenButtons();
}

function renderMarketPage(type) {
  const raw = type === 'crypto' ? (state.market?.crypto || []) : (state.market?.forex || []);
  const signals = (state.scan?.signals || []).filter(s => (s.type || '').toLowerCase() === type).map(enhanceAssetForCard);
  const scanMap = new Map(signals.map(s => [s.symbol, s]));
  const fallback = raw.filter(hasPrice).map(a => enhanceAssetForCard(scanMap.get(a.symbol) || a));
  const merged = (signals.length ? signals : fallback).slice(0, type === 'crypto' ? 24 : 12);
  app.innerHTML = `
    <div class="notice">${type === 'crypto' ? 'Crypto radar: BUY/SELL/WAIT, timeframe, entry, stop loss, dan take profit.' : 'Forex radar: daily bias, move, dan risk zone.'}</div>
    ${renderCards(merged)}
  `;
  bindOpenButtons();
}

function enhanceAssetForCard(asset = {}) {
  const a = { ...asset };
  const change = Number(a.changePct || 0);
  const score = Number(a.aiScore || a.score || 0);
  if (!a.direction || a.direction === '-') a.direction = change > 0.45 ? 'LONG' : change < -0.45 ? 'SHORT' : 'WAIT';
  if (!a.signalAction && !a.action) a.signalAction = actionFromDirection(a.direction);
  if (!a.timeframe || a.timeframe === '-') a.timeframe = deriveTimeframe(a);
  if (!a.horizon || a.horizon === '-') a.horizon = a.timeframe;
  if (!a.aiScore && score !== 0) a.aiScore = round(score, 1);
  if (!a.aiScore && score === 0) a.aiScore = round(58 + Math.min(24, Math.abs(change) * 9), 1);
  if (!a.status || a.status === 'LIVE') {
    const action = a.signalAction || a.action;
    a.status = action === 'BUY' ? 'BUY ZONE' : action === 'SELL' ? 'SELL ZONE' : 'WATCHLIST';
  }
  const levels = buildTradeLevels(a, a.signalAction || a.action);
  if (!a.entry) a.entry = levels.entry;
  if (!a.takeProfit) a.takeProfit = levels.takeProfit;
  if (!a.stopLoss) a.stopLoss = levels.stopLoss;
  if (!Array.isArray(a.rationale) || !a.rationale.length) {
    const actionText = a.signalAction || a.action || 'WAIT';
    a.rationale = [`${a.display || a.symbol}: ${actionText} ${a.timeframe}. Momentum ${signed(change)}%, tunggu konfirmasi area entry dan jaga stop loss.`];
  }
  return a;
}

function deriveTimeframe(a = {}) {
  const ch = Math.abs(Number(a.changePct || 0));
  const type = (a.type || '').toLowerCase();
  if (type === 'forex') return 'DAILY BIAS';
  if (ch >= 4) return 'SCALPING';
  if (ch >= 1.2) return 'INTRADAY';
  if (ch >= .35) return 'SWING';
  return 'WATCHLIST';
}


function renderInsights() {
  const insight = state.insight || buildInsightFallback();
  const m = insight.metrics || {};
  app.innerHTML = `
    <div class="flow-hero">
      <div>
        <span class="insight-chip">24H MARKET FLOW</span>
        <h2>${insight.mode || 'Market Flow'}</h2>
        <p>${insight.message || 'Membaca aliran dana, volume, dan news catalyst crypto.'}</p>
      </div>
      <div class="flow-score">
        <small>Net Flow Proxy</small>
        <strong class="${Number(m.netFlow || 0) >= 0 ? 'up' : 'down'}">${m.netFlowLabel || '-'}</strong>
        <span>${m.assetCount || 0} crypto assets</span>
      </div>
    </div>

    <div class="insight-grid compact">
      <div class="metric"><strong>$${m.totalVolumeLabel || '-'}</strong><small>24H Volume</small></div>
      <div class="metric"><strong class="up">$${m.inflowLabel || '-'}</strong><small>Flow ke aset naik</small></div>
      <div class="metric"><strong class="down">$${m.outflowLabel || '-'}</strong><small>Flow ke aset turun</small></div>
      <div class="metric"><strong>${m.inflowRatio ?? '-'}%</strong><small>Inflow dominance</small></div>
    </div>

    <div class="flow-layout">
      <section class="panel flow-board">
        <div class="section-head"><h3>Where Money Flows</h3><small>Proxy: volume 24h × move</small></div>
        ${flowAssetList(insight.topInflows, 'in')}
      </section>
      <section class="panel flow-board">
        <div class="section-head"><h3>Outflow / Risk Zone</h3><small>Aset turun dengan volume besar</small></div>
        ${flowAssetList(insight.topOutflows, 'out')}
      </section>
    </div>

    <div class="flow-layout wide-left">
      <section class="panel news-board">
        <div class="section-head"><h3>News Impact</h3><small>Berita yang bisa memengaruhi crypto</small></div>
        ${newsList(insight.news)}
      </section>
      <section class="panel flow-board">
        <div class="section-head"><h3>Liquidity Leaders</h3><small>Volume 24h terbesar</small></div>
        ${volumeList(insight.topVolume)}
      </section>
    </div>

    <div class="action-board">
      <div class="action-card"><b>Market Read</b><span>${marketReadText(insight)}</span></div>
      <div class="action-card"><b>Entry Filter</b><span>Utamakan coin yang masuk inflow list dan belum terlalu jauh dari entry area.</span></div>
      <div class="action-card"><b>Risk Filter</b><span>Hindari coin di outflow list kecuali ada reversal jelas dan volume membaik.</span></div>
    </div>
  `;
}

function buildInsightFallback() {
  const market = { crypto: (state.market?.crypto || []).filter(hasPrice), forex: (state.market?.forex || []).filter(hasPrice) };
  const crypto = market.crypto;
  const totalVolume = crypto.reduce((sum, a) => sum + Number(a.volume || 0), 0);
  const inflow = crypto.filter(a => Number(a.changePct || 0) > 0).reduce((sum, a) => sum + Number(a.volume || 0), 0);
  const outflow = crypto.filter(a => Number(a.changePct || 0) < 0).reduce((sum, a) => sum + Number(a.volume || 0), 0);
  const netFlow = crypto.reduce((sum, a) => sum + (Number(a.volume || 0) * Number(a.changePct || 0) / 100), 0);
  const topInflows = [...crypto].filter(a => Number(a.changePct || 0) > 0).sort((a,b)=>flowValue(b)-flowValue(a)).slice(0,7).map(addFlowFields);
  const topOutflows = [...crypto].filter(a => Number(a.changePct || 0) < 0).sort((a,b)=>flowValue(a)-flowValue(b)).slice(0,7).map(addFlowFields);
  const topVolume = [...crypto].sort((a,b)=>Number(b.volume||0)-Number(a.volume||0)).slice(0,7).map(x => ({...x, volumeLabel: shortMoney(x.volume)}));
  const mode = netFlow >= 0 ? 'Liquidity Inflow' : 'Liquidity Outflow';
  return {
    mode,
    message: netFlow >= 0 ? 'Flow 24 jam lebih condong ke aset yang menguat.' : 'Flow 24 jam lebih banyak berada di aset yang melemah.',
    metrics: {
      totalVolumeLabel: shortMoney(totalVolume), inflowLabel: shortMoney(inflow), outflowLabel: shortMoney(outflow), netFlowLabel: `${netFlow >= 0 ? '+' : '-'}${shortMoney(netFlow)}`,
      netFlow, inflowRatio: totalVolume ? round(inflow / totalVolume * 100, 1) : 0, assetCount: crypto.length
    },
    topInflows, topOutflows, topVolume, news: []
  };
}

function flowValue(a) { return Number(a.volume || 0) * Number(a.changePct || 0) / 100; }
function addFlowFields(a) { const fv = flowValue(a); return {...a, flowValue: fv, flowLabel: shortMoney(fv)}; }
function shortMoney(value) {
  const n = Math.abs(Number(value || 0));
  if (n >= 1e12) return `${round(n/1e12,2)}T`;
  if (n >= 1e9) return `${round(n/1e9,2)}B`;
  if (n >= 1e6) return `${round(n/1e6,2)}M`;
  if (n >= 1e3) return `${round(n/1e3,2)}K`;
  return `${round(n,2)}`;
}

function flowAssetList(items, mode) {
  if (!items?.length) return '<p class="note">Belum ada data flow.</p>';
  return `<div class="flow-list">${items.map(x => `
    <div class="flow-row ${mode}">
      <span><b>${x.display || x.symbol}</b><small>${fmtPrice(x)} · ${signed(x.changePct)}%</small></span>
      <strong>${mode === 'in' ? '+' : '-'}$${x.flowLabel || shortMoney(x.flowValue)}</strong>
    </div>
  `).join('')}</div>`;
}

function volumeList(items) {
  if (!items?.length) return '<p class="note">Belum ada data volume.</p>';
  return `<div class="flow-list">${items.map(x => `
    <div class="flow-row">
      <span><b>${x.display || x.symbol}</b><small>${fmtPrice(x)} · ${signed(x.changePct)}%</small></span>
      <strong>$${x.volumeLabel || shortMoney(x.volume)}</strong>
    </div>
  `).join('')}</div>`;
}

function newsList(items) {
  if (!items?.length) return '<p class="note">News feed belum masuk. Market Insight tetap membaca flow 24H dari harga dan volume.</p>';
  return `<div class="news-list">${items.slice(0, 8).map(n => `
    <a href="${escapeAttr(n.link)}" target="_blank" rel="noreferrer" class="news-row">
      <span class="news-impact">${escapeHtml(n.impact || 'Market Catalyst')}</span>
      <b>${escapeHtml(n.title)}</b>
      <small>${escapeHtml(n.source || 'Crypto News')} · ${timeAgo(n.publishedAt)}</small>
    </a>
  `).join('')}</div>`;
}

function marketReadText(insight) {
  const ratio = Number(insight.metrics?.inflowRatio || 0);
  if (ratio >= 58) return 'Dana 24H cenderung masuk ke aset yang menguat. Setup continuation lebih layak dipantau.';
  if (ratio <= 42) return 'Dana 24H belum mendukung risk-on. Tunggu market lebih stabil sebelum entry agresif.';
  return 'Flow campuran. Gunakan seleksi ketat dan jangan mengejar candle yang sudah jauh.';
}

function timeAgo(value) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '-';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h/24)}d ago`;
}

function avgChange(items) {
  const valid = (items || []).filter(hasPrice);
  if (!valid.length) return 0;
  return round(valid.reduce((sum, x) => sum + Number(x.changePct || 0), 0) / valid.length, 2);
}

function getMarketMood(items) {
  const valid = (items || []).filter(hasPrice);
  if (!valid.length) return { label: 'WAIT', title: 'Market belum terbaca.', note: 'Tunggu data masuk atau cek provider.', className: 'wait' };
  const avg = avgChange(valid);
  const upRatio = valid.filter(x => Number(x.changePct || 0) > 0).length / valid.length;
  if (avg > 1.2 && upRatio >= .58) return { label: 'RISK ON', title: 'Momentum market kuat.', note: 'Banyak asset menguat. Fokus ke setup dengan score tinggi dan spread kecil.', className: 'on' };
  if (avg < -1.0 || upRatio <= .36) return { label: 'RISK OFF', title: 'Market sedang lemah.', note: 'Utamakan wait and see. Jangan kejar harga yang volatil atau turun tajam.', className: 'off' };
  return { label: 'SELECTIVE', title: 'Market campuran.', note: 'Pilih setup secara selektif. Hindari entry tanpa konfirmasi momentum.', className: 'neutral' };
}

function radarList(items) {
  if (!items?.length) return '<p class="note">Belum ada radar.</p>';
  return `<div class="radar-list">${items.map((x, i) => `
    <button class="radar-row" data-open="${x.symbol}">
      <span class="rank">${i + 1}</span>
      <span><b>${x.display || x.symbol}</b><small>${x.status || 'LIVE'} · ${x.direction || 'WATCH'}</small></span>
      <strong>${x.aiScore ?? '-'}</strong>
    </button>
  `).join('')}</div>`;
}

function breadthBlock(items, label) {
  const valid = (items || []).filter(hasPrice);
  const up = valid.filter(x => Number(x.changePct || 0) > 0).length;
  const down = valid.length - up;
  const upPct = valid.length ? Math.round((up / valid.length) * 100) : 0;
  return `
    <div class="breadth-block">
      <div><b>${label}</b><small>${up} naik · ${down} turun</small></div>
      <div class="breadth-bar"><span style="width:${upPct}%"></span></div>
      <strong>${upPct}%</strong>
    </div>
  `;
}

function marketList(items) {
  if (!items?.length) return '<p class="note">Belum ada data.</p>';
  return `<div class="market-list">${items.map(x => `
    <div>
      <span><b>${x.display || x.symbol}</b><small>${fmtPrice(x)}</small></span>
      <strong class="${trendClass(x.changePct)}">${signed(x.changePct)}%</strong>
    </div>
  `).join('')}</div>`;
}

function planText(items, type) {
  const mood = getMarketMood(items || []);
  if (mood.label === 'RISK ON') return type === 'crypto' ? 'Cari continuation setup. Jangan entry kalau sudah pump terlalu jauh.' : 'Ikuti pair paling kuat, gunakan konfirmasi timeframe lebih besar.';
  if (mood.label === 'RISK OFF') return 'Tahan entry agresif. Fokus ke proteksi modal dan tunggu reversal jelas.';
  return 'Market belum satu arah. Gunakan watchlist, tunggu breakout atau pullback sehat.';
}

function hasPrice(a) { const p = Number(a?.price); return Number.isFinite(p) && p > 0; }
function biasText(items) {
  const valid = (items || []).filter(hasPrice);
  if (!valid.length) return 'Data belum cukup untuk membaca bias market.';
  const up = valid.filter(x => Number(x.changePct || 0) > 0).length;
  const avg = round(valid.reduce((sum, x) => sum + Number(x.changePct || 0), 0) / valid.length, 2);
  if (up / valid.length >= .62) return `Mayoritas menguat (${up}/${valid.length}); momentum cenderung risk-on. Rata-rata perubahan ${signed(avg)}%.`;
  if (up / valid.length <= .38) return `Mayoritas melemah (${up}/${valid.length}); market perlu hati-hati. Rata-rata perubahan ${signed(avg)}%.`;
  return `Market campuran (${up}/${valid.length} menguat); pilih setup selektif. Rata-rata perubahan ${signed(avg)}%.`;
}
function miniList(items) {
  if (!items?.length) return '<p class="note">Belum ada data.</p>';
  return `<div class="mini-list">${items.map(x => `<div><span><b>${x.display}</b><small>${x.symbol}</small></span><strong class="${trendClass(x.changePct)}">${signed(x.changePct)}%</strong></div>`).join('')}</div>`;
}

function renderCards(items) {
  if (!items?.length) return '<div class="panel">Belum ada data. Coba refresh atau cek koneksi API.</div>';
  return `<div class="grid">${items.map(card).join('')}</div>`;
}

function card(a) {
  a = enhanceAssetForCard(a);
  const action = a.signalAction || a.action || actionFromDirection(a.direction);
  const actionClass = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : 'wait';
  const statusClass = a.status === 'BUY ZONE' ? 'active' : a.status === 'SELL ZONE' ? 'sell' : a.status === 'WATCHLIST' ? 'watch' : 'wait';
  return `
    <article class="card">
      <div class="card-head">
        <div class="asset">
          <span class="icon">${a.display?.[0] || a.symbol?.[0] || '?'}</span>
          <div><strong>${a.display || a.symbol}</strong><small>${(a.type || 'ASSET').toUpperCase()} · ${a.provider || 'provider'}${a.source ? ' · ' + a.source : ''}</small></div>
        </div>
        <div class="badge-stack"><span class="badge ${statusClass}">${a.status || 'LIVE'}</span><span class="action-pill ${actionClass}">${action}</span></div>
      </div>
      <div class="price-row"><div><div class="price">${fmtPrice(a)}</div><div class="${trendClass(a.changePct)}"><b>${signed(a.changePct)}%</b> move</div></div><span class="time-pill">${a.timeframe || a.horizon || '-'}</span></div>
      <div class="mini-chart live-chart-wrap js-card-chart" data-symbol="${escapeAttr(a.symbol)}" data-type="${escapeAttr(a.type || 'crypto')}" data-coinid="${escapeAttr(a.coinId || '')}"><div class="chart-loading">Loading chart...</div></div>
      <div class="scorebar"><span style="width:${Math.max(8, Math.min(100, a.aiScore || 50))}%"></span></div>
      <div class="kpis">
        <div class="kpi"><small>AI Score</small><strong>${a.aiScore ?? '-'}</strong></div>
        <div class="kpi"><small>Action</small><strong class="${actionClass}">${action}</strong></div>
        <div class="kpi"><small>Timeframe</small><strong>${a.timeframe || a.horizon || '-'}</strong></div>
      </div>
      <p class="note">${escapeHtml((a.rationale || [`${a.display} live radar.`])[0])}</p>
      <div class="actions">
        <button class="btn secondary" data-open="${a.symbol}">Open Analysis</button>
      </div>
    </article>
  `;
}

function bindOpenButtons() {
  hydrateCardCharts();
}

async function hydrateCardCharts() {
  const nodes = [...document.querySelectorAll('.js-card-chart:not([data-loaded])')].slice(0, 10);
  for (const node of nodes) {
    node.dataset.loaded = '1';
    const symbol = node.dataset.symbol;
    const type = node.dataset.type || 'crypto';
    const coinId = node.dataset.coinid || '';
    const asset = enhanceAssetForCard((state.scan?.signals || state.market?.all || []).find(x => x.symbol === symbol) || { symbol, type, coinId });
    if (!symbol) continue;

    // v40: tampilkan fallback dulu supaya chart tidak blank/down saat API lambat.
    renderLiveChartCanvas(node, fallbackCandlesFromAsset(asset, 54), asset, { compact: true, levels: false, locked: true, source: 'fallback' });

    try {
      const key = `${symbol}:${coinId}:7:real:card`;
      let payload = state.chartCache.get(key);
      if (!payload) {
        const qs = new URLSearchParams({ symbol, type, id: coinId, days: '7' });
        payload = await api(`/api/chart?${qs.toString()}`);
        state.chartCache.set(key, payload);
      }
      const candles = chartCandlesFromPayload(payload);
      if (candles.length >= 4) {
        renderLiveChartCanvas(node, candles, asset, { compact: true, levels: false, locked: true, source: payload.provider || 'market' });
      }
    } catch {
      // Tetap pakai fallback lokal, jangan tampilkan error hitam/kosong ke publik.
    }
  }
}

function openAnalysis(symbol) {
  const a = enhanceAssetForCard((state.scan?.signals || state.market?.all || []).find(x => x.symbol === symbol));
  if (!a || !a.symbol) return;
  const action = a.signalAction || a.action || actionFromDirection(a.direction);
  const actionClass = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : 'wait';
  const chartId = `chart-${safeDomId(a.symbol)}`;
  $('#modal-body').innerHTML = `
    <div class="asset">
      <span class="icon">${(a.display || a.symbol || '?')[0]}</span>
      <div><h2 style="margin:0">${a.display || a.symbol}</h2><small>${(a.type || 'ASSET').toUpperCase()} · ${a.provider || '-'}</small></div>
    </div>
    <div class="chart-card">
      <div class="chart-top"><span class="action-pill ${actionClass}">${action}</span><span class="time-pill">${a.timeframe || a.horizon || '-'}</span><strong>${fmtPrice(a)}</strong></div>
      <div id="${chartId}" class="live-chart-wrap chart-big"><div class="chart-loading">Loading real chart...</div></div>
      <small class="chart-source">Chart asli terkunci: halaman tetap bisa discroll.</small>
    </div>
    <div class="stats-grid">
      <div class="metric"><strong>${fmtPrice(a)}</strong><small>Price</small></div>
      <div class="metric"><strong class="${trendClass(a.changePct)}">${signed(a.changePct)}%</strong><small>Move</small></div>
      <div class="metric"><strong>${a.aiScore ?? '-'}</strong><small>AI Score</small></div>
      <div class="metric"><strong>${a.validFor || '-'}</strong><small>Valid</small></div>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="panel"><small>Entry</small><h3>${a.entry ? fmtNumber(a.entry, a.type) : '-'}</h3></div>
      <div class="panel"><small>Stop Loss</small><h3>${a.stopLoss ? fmtNumber(a.stopLoss, a.type) : '-'}</h3></div>
      <div class="panel"><small>Take Profit</small><h3>${a.takeProfit ? fmtNumber(a.takeProfit, a.type) : '-'}</h3></div>
      <div class="panel"><small>Status</small><h3>${a.status || '-'}</h3></div>
    </div>
    <div class="analysis-grid" style="margin-top:16px">
      <div class="panel analysis-panel" id="tech-${chartId}">
        <h3 style="margin-top:0">Technical Analysis</h3>
        ${renderTechnicalBlock(a.technical, a)}
      </div>
      <div class="panel analysis-panel" id="fund-${chartId}">
        <h3 style="margin-top:0">Fundamental & News</h3>
        ${renderFundamentalBlock(a.fundamental, a)}
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h3 style="margin-top:0">AI Reasoning</h3>
      ${(a.rationale || []).map(x => `<p class="note">• ${escapeHtml(x)}</p>`).join('') || '<p class="note">Belum ada reasoning tambahan.</p>'}
    </div>
  `;
  $('#modal').classList.remove('hidden');
  loadRealChart(a, chartId);
  loadNewsAnalysis(a, `fund-${chartId}`);
}


function renderTechnicalBlock(t = {}, a = {}) {
  if (!t || !Object.keys(t).length) {
    return '<p class="note">Menunggu data chart untuk membaca EMA, stochastic, dan Fibonacci.</p>';
  }
  const trendClassName = t.trend === 'bullish' ? 'buy' : t.trend === 'bearish' ? 'sell' : 'wait';
  return `
    <div class="indicator-grid">
      <div class="indicator"><small>Trend</small><strong class="${trendClassName}">${escapeHtml((t.trend || '-').toUpperCase())}</strong></div>
      <div class="indicator"><small>EMA 9 / 21</small><strong>${fmtMaybe(t.ema9, a.type)} / ${fmtMaybe(t.ema21, a.type)}</strong></div>
      <div class="indicator"><small>Stochastic</small><strong>${t.stochasticK ?? '-'} · ${escapeHtml(t.stochasticZone || '-')}</strong></div>
      <div class="indicator"><small>Fib 0.618</small><strong>${fmtMaybe(t.fib618, a.type)}</strong></div>
    </div>
    <p class="note">${escapeHtml(t.summary || 'Indikator teknikal dibaca dari chart.')}</p>
  `;
}

function renderFundamentalBlock(f = {}, a = {}) {
  const base = String(a.symbol || '').replace(/USDT$/, '');
  return `
    <p class="note">${escapeHtml(f?.summary || `${base}: cek likuiditas, market cap rank, news catalyst, unlock token, listing exchange, whale flow, dan sentimen institusi.`)}</p>
    <div class="news-hit-list" data-news-for="${escapeAttr(a.symbol)}"><small>News catalyst: loading...</small></div>
  `;
}

function computeTechnicalFromMarketData(payload, a = {}) {
  let closes = [];
  const candles = Array.isArray(payload?.candles) ? payload.candles : [];
  if (candles.length) closes = candles.map(c => Number(c.close)).filter(v => Number.isFinite(v) && v > 0);
  if (!closes.length && Array.isArray(payload?.points)) closes = payload.points.map(p => Number(p.price)).filter(v => Number.isFinite(v) && v > 0);
  if (closes.length < 4 && Array.isArray(a.chart)) closes = a.chart.map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (closes.length < 4) closes = fallbackSeries(a);
  closes = cleanChartSeries(closes);
  const close = closes.at(-1) || Number(a.price || 0);
  const e9 = emaClient(closes, 9);
  const e21 = emaClient(closes, 21);
  const e50 = emaClient(closes, 50);
  const stoch = stochasticClient(closes, 14);
  const fib = fibClient(closes);
  let trend = 'sideways';
  if (e9 > e21 && e21 >= e50) trend = 'bullish';
  else if (e9 < e21 && e21 <= e50) trend = 'bearish';
  const zone = stoch >= 80 ? 'overbought' : stoch <= 20 ? 'oversold' : 'netral';
  const nearestFib = fib.fib382 && close > fib.fib382 ? 'di atas Fib 0.382' : fib.fib618 && close < fib.fib618 ? 'di bawah Fib 0.618' : 'area Fib tengah';
  return {
    trend,
    ema9: round(e9, close > 1000 ? 2 : 6),
    ema21: round(e21, close > 1000 ? 2 : 6),
    ema50: round(e50, close > 1000 ? 2 : 6),
    stochasticK: round(stoch, 1),
    stochasticZone: zone,
    fib382: fib.fib382 ? round(fib.fib382, close > 1000 ? 2 : 6) : null,
    fib50: fib.fib50 ? round(fib.fib50, close > 1000 ? 2 : 6) : null,
    fib618: fib.fib618 ? round(fib.fib618, close > 1000 ? 2 : 6) : null,
    summary: `EMA9 ${e9 >= e21 ? 'di atas' : 'di bawah'} EMA21, stochastic ${round(stoch, 1)} (${zone}), harga ${nearestFib}.`
  };
}

function emaClient(values, period) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (!arr.length) return 0;
  const k = 2 / (period + 1);
  let out = arr[0];
  for (let i = 1; i < arr.length; i++) out = arr[i] * k + out * (1 - k);
  return out;
}
function stochasticClient(values, lookback = 14) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(-lookback);
  if (arr.length < 3) return 50;
  const high = Math.max(...arr), low = Math.min(...arr), close = arr.at(-1);
  return high === low ? 50 : Math.max(0, Math.min(100, ((close - low) / (high - low)) * 100));
}
function fibClient(values) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(-80);
  if (arr.length < 4) return {};
  const high = Math.max(...arr), low = Math.min(...arr), range = high - low;
  if (!range) return {};
  return { high, low, fib382: high - range * 0.382, fib50: high - range * 0.5, fib618: high - range * 0.618 };
}

async function loadNewsAnalysis(a, panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  try {
    const data = await api('/api/crypto-news');
    const hits = matchNewsToAsset(a, data.news || []);
    const target = panel.querySelector('[data-news-for]');
    if (!target) return;
    if (!hits.length) {
      target.innerHTML = '<small>News catalyst: belum ada berita spesifik yang kuat untuk asset ini. Pantau ETF/inflow, listing, upgrade, unlock token, dan regulasi.</small>';
      return;
    }
    target.innerHTML = `<div class="news-catalyst-list">${hits.slice(0, 3).map(n => `<a href="${escapeAttr(n.link)}" target="_blank" rel="noreferrer"><b>${escapeHtml(n.impact || 'Catalyst')}</b><span>${escapeHtml(n.title)}</span><small>${escapeHtml(n.source || 'News')}</small></a>`).join('')}</div>`;
  } catch {}
}

function matchNewsToAsset(a, news) {
  const base = String(a.symbol || '').replace(/USDT$/, '').toLowerCase();
  const names = {
    btc: ['bitcoin','btc','blackrock','etf','spot bitcoin','fidelity','ibit'],
    eth: ['ethereum','eth','ether','blackrock','etf','spot ether'],
    sol: ['solana','sol'],
    xrp: ['xrp','ripple'],
    bnb: ['bnb','binance'],
    doge: ['dogecoin','doge'],
    ada: ['cardano','ada'],
    link: ['chainlink','link'],
    avax: ['avalanche','avax']
  };
  const keys = names[base] || [base];
  const catalystWords = ['etf','blackrock','fidelity','inflow','outflow','whale','accumulation','upgrade','partnership','hack','exploit','sec','lawsuit','regulation','listing','unlock','treasury'];
  return (news || []).filter(n => {
    const t = `${n.title || ''} ${n.summary || ''}`.toLowerCase();
    return keys.some(k => t.includes(k)) || catalystWords.some(k => t.includes(k));
  });
}

function fmtMaybe(v, type) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return fmtNumber(n, type || 'crypto');
}

async function loadRealChart(a, chartId) {
  const target = document.getElementById(chartId);
  const sourceEl = target?.closest('.chart-card')?.querySelector('.chart-source');
  if (!target || !a?.symbol) return;

  // v40: jangan pernah kosong. Render fallback lokal dulu, lalu replace dengan data provider kalau masuk.
  const fallback = fallbackCandlesFromAsset(a, 72);
  renderLiveChartCanvas(target, fallback, a, { compact: false, levels: true, locked: true, source: 'fallback' });
  if (sourceEl) sourceEl.textContent = 'Chart terkunci: loading data market...';

  const key = `${a.symbol}:${a.coinId || ''}:7:real`;
  try {
    let payload = state.chartCache.get(key);
    if (!payload) {
      const qs = new URLSearchParams({ symbol: a.symbol, type: a.type || 'crypto', id: a.coinId || '', days: '7' });
      payload = await api(`/api/chart?${qs.toString()}`);
      state.chartCache.set(key, payload);
    }
    const techPanel = document.getElementById(`tech-${chartId}`);
    const technical = computeTechnicalFromMarketData(payload, a);
    if (techPanel) techPanel.innerHTML = `<h3 style="margin-top:0">Technical Analysis</h3>${renderTechnicalBlock(technical, a)}`;

    const candles = chartCandlesFromPayload(payload);
    if (candles.length >= 4) {
      const focused = focusCandlesForSignal(candles, a);
      renderLiveChartCanvas(target, focused.length >= 4 ? focused : candles, a, { compact: false, levels: true, locked: true, source: payload.provider || 'market' });
      const provider = String(payload.provider || 'market').replace('-market','').replace('-chart','').replace('-ohlc',' OHLC');
      const kind = payload.chartType === 'candlestick' ? 'candlestick asli' : 'market data';
      if (sourceEl) sourceEl.textContent = `Chart terkunci: ${provider} · ${kind} · ${payload.days || 7}D`;
      return;
    }
    if (sourceEl) sourceEl.textContent = 'Chart terkunci: fallback aktif karena provider kosong.';
  } catch (err) {
    if (sourceEl) sourceEl.textContent = 'Chart terkunci: fallback aktif karena provider lambat/gagal.';
  }
}

function chartCandlesFromPayload(payload = {}) {
  const rawCandles = Array.isArray(payload.candles) ? payload.candles : [];
  let candles = normalizeLightweightCandles(rawCandles);
  if (candles.length >= 4) return candles;
  const points = Array.isArray(payload.points) ? payload.points : [];
  return normalizePointsToCandles(points);
}

function normalizeLightweightCandles(candles) {
  const arr = (candles || []).map(c => {
    const timeRaw = Number(c.time ?? c.t ?? c[0]);
    const open = Number(c.open ?? c.o ?? c[1]);
    const high = Number(c.high ?? c.h ?? c[2]);
    const low = Number(c.low ?? c.l ?? c[3]);
    const close = Number(c.close ?? c.c ?? c[4]);
    const time = timeRaw > 100000000000 ? Math.floor(timeRaw / 1000) : Math.floor(timeRaw);
    return { time, open, high, low, close };
  }).filter(c => c.time && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 && c.high >= c.low)
    .sort((a, b) => a.time - b.time);
  const dedup = [];
  for (const c of arr) {
    if (dedup.length && dedup[dedup.length - 1].time === c.time) dedup[dedup.length - 1] = c;
    else dedup.push(c);
  }
  return dedup.slice(-140);
}

function normalizePointsToCandles(points) {
  const src = (points || []).map(p => ({
    time: Number(p.time),
    price: Number(p.price)
  })).filter(p => p.time && p.price > 0).sort((a, b) => a.time - b.time);
  if (src.length < 4) return [];
  const maxCandles = 110;
  const bucketSize = Math.max(1, Math.ceil(src.length / maxCandles));
  const out = [];
  for (let i = 0; i < src.length; i += bucketSize) {
    const chunk = src.slice(i, i + bucketSize);
    const prices = chunk.map(p => p.price).filter(v => Number.isFinite(v) && v > 0);
    if (!prices.length) continue;
    const t = chunk[0].time > 100000000000 ? Math.floor(chunk[0].time / 1000) : Math.floor(chunk[0].time);
    out.push({ time: t, open: prices[0], high: Math.max(...prices), low: Math.min(...prices), close: prices[prices.length - 1] });
  }
  return out;
}

function focusCandlesForSignal(candles, asset = {}) {
  const tf = String(asset.timeframe || asset.horizon || '').toUpperCase();
  let count = 96;
  if (tf.includes('SCALP')) count = 55;
  else if (tf.includes('INTRADAY')) count = 75;
  else if (tf.includes('SWING')) count = 110;
  const locked = Date.parse(asset.lockedAt || asset.updatedAt || asset.liveUpdatedAt || 0);
  if (locked) {
    const lockedSec = Math.floor(locked / 1000);
    const after = candles.filter(c => c.time >= lockedSec - 30 * 60);
    if (after.length >= 12) return after.slice(-count);
  }
  return candles.slice(-count);
}

function renderLiveChartCanvas(container, candles, asset = {}, options = {}) {
  if (!container) return false;
  if (!window.LightweightCharts?.createChart) {
    container.innerHTML = '<div class="chart-empty dark">Chart library belum termuat.</div>';
    return false;
  }
  const compact = !!options.compact;
  const locked = options.locked !== false;
  const chartKey = container.id || `${asset.symbol || 'chart'}:${compact ? 'mini' : 'big'}:${Math.random().toString(36).slice(2)}`;
  const old = state.liveCharts.get(chartKey);
  if (old?.remove) { try { old.remove(); } catch {} }

  container.innerHTML = '<div class="lw-chart-host" aria-label="Real market chart"></div><div class="chart-scroll-shield" aria-hidden="true"></div>';
  container.classList.add('live-chart-ready');
  container.classList.toggle('chart-locked', locked);
  const host = container.querySelector('.lw-chart-host');
  const shield = container.querySelector('.chart-scroll-shield');
  if (shield) lockChartPointer(shield);
  const data = normalizeLightweightCandles(candles);
  const initialHeight = compact ? Math.max(135, container.clientHeight || 150) : Math.max(330, Math.min(500, container.clientHeight || 380));
  const initialWidth = Math.max(260, Math.floor(container.getBoundingClientRect().width || container.clientWidth || 760));

  const chart = LightweightCharts.createChart(host, {
    width: initialWidth,
    height: initialHeight,
    layout: { background: { type: LightweightCharts.ColorType.Solid, color: '#07101f' }, textColor: '#8ea4c4', fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { vertLines: { color: compact ? 'rgba(145,170,205,.06)' : 'rgba(145,170,205,.12)' }, horzLines: { color: compact ? 'rgba(145,170,205,.08)' : 'rgba(145,170,205,.16)' } },
    rightPriceScale: { borderColor: 'rgba(145,170,205,.20)', visible: !compact, scaleMargins: { top: 0.12, bottom: 0.16 } },
    timeScale: { borderColor: 'rgba(145,170,205,.20)', timeVisible: !compact, secondsVisible: false, visible: !compact, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
    crosshair: { mode: LightweightCharts.CrosshairMode.Magnet },
    handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: { time: false, price: false }, mouseWheel: false, pinch: false },
  });
  const series = chart.addCandlestickSeries({
    upColor: '#18e59b',
    downColor: '#ff4778',
    borderUpColor: '#18e59b',
    borderDownColor: '#ff4778',
    wickUpColor: '#18e59b',
    wickDownColor: '#ff4778',
    priceLineVisible: !compact,
    lastValueVisible: !compact,
  });
  series.setData(data);
  if (!compact && options.levels !== false) addTradePriceLines(series, asset);

  const fit = () => {
    const rect = container.getBoundingClientRect();
    const width = Math.max(260, Math.floor(rect.width || container.clientWidth || initialWidth));
    const height = compact ? Math.max(135, container.clientHeight || 150) : Math.max(330, Math.min(500, container.clientHeight || 380));
    chart.applyOptions({ width, height });
    const visibleBars = Math.max(6, Math.min(data.length || 6, compact ? 90 : 120));
    const maxSpacing = compact ? 38 : 34;
    const minSpacing = compact ? 4 : 6;
    const spacing = Math.max(minSpacing, Math.min(maxSpacing, Math.floor(width / Math.max(visibleBars + 2, 4))));
    chart.timeScale().applyOptions({ barSpacing: spacing, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true });
    try { chart.timeScale().fitContent(); } catch {}
  };

  // Render after layout settles; fixes half-black canvas on modal/card changes.
  requestAnimationFrame(() => {
    fit();
    setTimeout(fit, 80);
    setTimeout(fit, 260);
  });

  const ro = new ResizeObserver(() => fit());
  try { ro.observe(container); } catch {}
  try { ro.observe(host); } catch {}
  const originalRemove = chart.remove.bind(chart);
  chart.remove = () => { try { ro.disconnect(); } catch {}; originalRemove(); };
  state.liveCharts.set(chartKey, chart);
  return true;
}

function lockChartPointer(el) {
  if (!el || el.dataset.lockReady === '1') return;
  el.dataset.lockReady = '1';
  const stopOnly = (event) => {
    // Jangan preventDefault: scroll modal/halaman tetap jalan, tapi chart tidak menerima zoom/drag.
    event.stopPropagation();
  };
  ['wheel', 'mousedown', 'mousemove', 'mouseup', 'dblclick', 'contextmenu', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend'].forEach(name => {
    try { el.addEventListener(name, stopOnly, { passive: true, capture: true }); } catch {}
  });
}

function addTradePriceLines(series, asset = {}) {
  const action = asset.signalAction || asset.action || actionFromDirection(asset.direction);
  const levels = buildTradeLevels(asset, action);
  const lineStyle = LightweightCharts.LineStyle.Dashed;
  const add = (price, title, color) => {
    price = Number(price);
    if (!Number.isFinite(price) || price <= 0) return;
    series.createPriceLine({
      price,
      color,
      lineWidth: 2,
      lineStyle,
      axisLabelVisible: true,
      title: `${title} ${fmtNumber(price, asset.type || 'crypto')}`,
    });
  };
  if (action === 'WAIT') {
    add(levels.entry, 'PRICE', '#23c2ff');
    return;
  }
  add(levels.takeProfit, 'TP', '#18e59b');
  add(levels.entry, 'ENTRY', '#23c2ff');
  add(levels.stopLoss, 'SL', '#ff4778');
}

function actionFromDirection(direction) {
  if (direction === 'LONG') return 'BUY';
  if (direction === 'SHORT') return 'SELL';
  return 'WAIT';
}


function sparklineSvg(a, width = 560, height = 170) {
  return priceChartSvg(a, width, height, { compact: true });
}

function candlestickSvg(candles, width = 900, height = 330, asset = {}, options = {}) {
  const data = normalizeCandlesForChart(candles);
  if (data.length < 4) return priceChartSvg(asset, width, height, options);
  return proChartSvg(data, asset, width, height, { ...options, mode: 'candles' });
}

function priceChartSvg(a, width = 560, height = 170, options = {}) {
  let arr = Array.isArray(a.chart) ? a.chart.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];
  if (arr.length < 2) arr = fallbackSeries(a);
  arr = cleanChartSeries(arr);
  if (arr.length < 2) return '<div class="chart-empty">Chart belum tersedia</div>';
  const candles = syntheticCandlesFromSeries(arr, a);
  return proChartSvg(candles, a, width, height, { ...options, mode: 'candles' });
}

function proChartSvg(candles, asset = {}, width = 900, height = 330, options = {}) {
  const data = normalizeCandlesForChart(candles);
  if (data.length < 2) return '<div class="chart-empty">Chart belum tersedia</div>';
  const compact = !!options.compact;
  const action = asset.signalAction || asset.action || actionFromDirection(asset.direction);
  const levels = buildTradeLevels(asset, action);
  const shouldShowLevels = !compact;
  const levelValues = shouldShowLevels ? Object.values(levels).filter(v => Number.isFinite(v) && v > 0) : [];
  const lows = data.map(c => c.low).concat(levelValues);
  const highs = data.map(c => c.high).concat(levelValues);
  let min = Math.min(...lows);
  let max = Math.max(...highs);
  const lastClose = data.at(-1)?.close || Number(asset.price || 0);
  // Keep scale focused on real price action. If levels are too far away, do not let them flatten the candles.
  if (!compact && action !== 'WAIT' && lastClose > 0) {
    const naturalMin = Math.min(...data.map(c => c.low));
    const naturalMax = Math.max(...data.map(c => c.high));
    const naturalRange = Math.max(naturalMax - naturalMin, lastClose * 0.01);
    const maxAllowedRange = Math.max(naturalRange * 4.5, lastClose * 0.09);
    if (max - min > maxAllowedRange) {
      min = Math.max(0.0000001, lastClose - maxAllowedRange * 0.52);
      max = lastClose + maxAllowedRange * 0.52;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const price = Number(asset.price || data.at(-1)?.close || 1);
    min = price * 0.985;
    max = price * 1.015;
  }
  const pad = Math.max((max - min) * 0.10, (Number(asset.price || 0) || max) * 0.002);
  min = Math.max(0.0000001, min - pad);
  max += pad;
  const padL = compact ? 14 : 58;
  const padR = compact ? 18 : 112;
  const padT = compact ? 12 : 22;
  const padB = compact ? 12 : 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const y = v => padT + (1 - ((v - min) / (max - min))) * innerH;
  const x = i => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const step = innerW / Math.max(1, data.length - 1);
  const bodyW = compact ? Math.max(2.2, Math.min(7.5, step * .62)) : Math.max(4, Math.min(11, step * .62));
  const gridVals = [0, .25, .5, .75, 1].map(t => max - (max - min) * t);
  const grid = gridVals.map(v => `<line x1="${padL}" y1="${round(y(v),1)}" x2="${width-padR}" y2="${round(y(v),1)}" class="pro-grid"></line>${compact ? '' : `<text x="${padL-8}" y="${round(y(v)+4,1)}" text-anchor="end" class="pro-axis">${fmtAxis(v, asset.type)}</text>`}`).join('');
  const candleNodes = data.map((c, i) => {
    const cx = x(i);
    const up = c.close >= c.open;
    const cls = up ? 'pro-up' : 'pro-down';
    const wickTop = Math.max(padT, Math.min(height - padB, y(c.high)));
    const wickBot = Math.max(padT, Math.min(height - padB, y(c.low)));
    const bodyTop = Math.max(padT, Math.min(height - padB, y(Math.max(c.open, c.close))));
    const bodyBot = Math.max(padT, Math.min(height - padB, y(Math.min(c.open, c.close))));
    const h = Math.max(2.4, bodyBot - bodyTop);
    return `<line class="pro-wick ${cls}" x1="${round(cx,1)}" y1="${round(wickTop,1)}" x2="${round(cx,1)}" y2="${round(wickBot,1)}"></line><rect class="pro-body ${cls}" x="${round(cx-bodyW/2,1)}" y="${round(bodyTop,1)}" width="${round(bodyW,1)}" height="${round(h,1)}" rx="1.8"></rect>`;
  }).join('');
  const closeLine = data.map((c,i) => `${round(x(i),1)},${round(y(c.close),1)}`).join(' ');
  const modeLayer = options.mode === 'line'
    ? `<polyline points="${closeLine}" class="pro-close-line ${data.at(-1).close >= data[0].close ? 'pro-up' : 'pro-down'}"></polyline>`
    : candleNodes;
  const levelLayer = shouldShowLevels ? renderLevelLines(levels, y, padL, width - padR, width, compact, asset.type, action, padT, height - padB) : '';
  const footer = compact ? '' : `<text x="${padL}" y="${height-10}" class="pro-axis">24H</text><text x="${width-padR}" y="${height-10}" text-anchor="end" class="pro-axis">Now</text>`;
  return `<svg class="pro-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="professional price chart">
    <rect x="0" y="0" width="${width}" height="${height}" rx="18" class="pro-bg"></rect>
    ${grid}
    ${levelLayer}
    ${modeLayer}
    ${footer}
  </svg>`;
}

function renderLevelLines(levels, y, x1, x2, width, compact, type, action = 'WAIT', minY = 0, maxY = 9999) {
  const map = action === 'WAIT'
    ? [['entry', 'PRICE', 'entry']]
    : [['takeProfit', 'TP', 'tp'], ['entry', 'ENTRY', 'entry'], ['stopLoss', 'SL', 'sl']];
  const items = map.map(([key, label, cls]) => {
    const v = Number(levels[key]);
    if (!Number.isFinite(v) || v <= 0) return null;
    return { key, label, cls, v, yy: round(y(v), 1) };
  }).filter(Boolean).sort((a, b) => a.yy - b.yy);
  const gap = compact ? 18 : 27;
  let lastLabelY = -Infinity;
  for (const item of items) {
    let labelY = item.yy;
    if (labelY - lastLabelY < gap) labelY = lastLabelY + gap;
    labelY = Math.max(minY + 12, Math.min(maxY - 12, labelY));
    item.labelY = round(labelY, 1);
    lastLabelY = item.labelY;
  }
  // If the last label got pushed below the chart, shift the stack upward.
  const overflow = items.length ? items.at(-1).labelY - (maxY - 12) : 0;
  if (overflow > 0) {
    for (const item of items) item.labelY = round(item.labelY - overflow, 1);
  }
  return items.map(item => {
    const { label, cls, v, yy, labelY } = item;
    const line = `<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" class="level-line ${cls}"></line>`;
    const valueText = fmtNumber(v, type || 'crypto');
    const text = compact ? `${label}` : `${label} ${valueText}`;
    const boxW = compact ? 70 : Math.max(86, width - x2 - 22);
    const boxH = compact ? 18 : 24;
    const boxX = x2 + 8;
    const tx = boxX + 9;
    const ty = labelY + 5;
    const connector = Math.abs(labelY - yy) > 4 ? `<line x1="${x2}" y1="${yy}" x2="${boxX}" y2="${labelY}" class="level-connector ${cls}"></line>` : '';
    return `${line}${connector}<rect x="${boxX}" y="${labelY-boxH/2}" width="${boxW}" height="${boxH}" rx="8" class="level-box ${cls}"></rect><text x="${tx}" y="${ty}" class="level-text">${text}</text>`;
  }).join('');
}

function buildTradeLevels(a, action = 'WAIT') {
  const price = Number(a.price || 0);
  const change = Math.abs(Number(a.changePct || 0));
  const base = price > 0 ? price : 1;
  let entry = Number(a.entry || 0);
  let tp = Number(a.takeProfit || 0);
  let sl = Number(a.stopLoss || 0);
  if (!entry) entry = base;
  if (action === 'WAIT') return { entry, takeProfit: null, stopLoss: null };
  const amp = Math.max(0.008, Math.min(0.045, (change || 1.0) / 100 * 1.45));
  if (action === 'SELL') {
    if (!tp) tp = entry * (1 - amp * 1.7);
    if (!sl) sl = entry * (1 + amp);
  } else {
    if (!tp) tp = entry * (1 + amp * 1.7);
    if (!sl) sl = entry * (1 - amp);
  }
  return { entry, takeProfit: tp, stopLoss: sl };
}

function normalizeCandlesForChart(candles) {
  return (candles || [])
    .map(c => ({
      time: Number(c.time || 0),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }))
    .filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 && c.high >= c.low)
    .slice(-90);
}

function syntheticCandlesFromSeries(series, asset = {}) {
  const arr = cleanChartSeries(series);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const close = arr[i];
    const previous = i === 0 ? Number(asset.open || close * (1 - Number(asset.changePct || 0) / 100 / Math.max(1, arr.length))) : arr[i - 1];
    const micro = close * (Math.sin(i * 1.7) * 0.0009 + Math.cos(i * .73) * 0.0006);
    const open = Math.max(0.0000001, previous + micro);
    const range = Math.max(Math.abs(close - open) * 1.8, close * (0.003 + ((i % 7) * 0.00045)));
    const high = Math.max(open, close) + range * (0.35 + (i % 3) * 0.12);
    const low = Math.max(0.0000001, Math.min(open, close) - range * (0.35 + (i % 4) * 0.10));
    out.push({ time: Date.now() - (arr.length - i) * 15 * 60 * 1000, open, high, low, close });
  }
  return out;
}

function cleanChartSeries(series) {
  const arr = (series || []).map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (arr.length <= 4) return arr;
  const sorted = [...arr].sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length / 2)] || sorted[0];
  const cleaned = arr.filter(v => v > median * 0.55 && v < median * 1.75);
  const src = cleaned.length >= arr.length * 0.65 ? cleaned : arr;
  const maxPoints = 80;
  if (src.length <= maxPoints) return src;
  const step = Math.ceil(src.length / maxPoints);
  return src.filter((_, i) => i % step === 0 || i === src.length - 1).slice(-maxPoints);
}

function fmtAxis(v, type) {
  if (type === 'forex') return Number(v).toFixed(4);
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 1) return Number(v).toFixed(3);
  return Number(v).toPrecision(3);
}

function safeDomId(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, ''); }

function fallbackSeries(a) {
  const price = Number(a.price || 0);
  if (!price) return [];
  const changePct = Number(a.changePct || 0);
  const open = Number(a.open || price / (1 + changePct / 100));
  const amp = price * Math.max(0.006, Math.min(0.055, Math.abs(changePct || 1.2) / 100 * 2.2));
  const arr = [];
  const n = 64;
  let v = open;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const drift = (price - open) * t;
    const wave = Math.sin(i / 3.1) * amp * .42 + Math.cos(i / 8.2) * amp * .30 + Math.sin(i / 1.35) * amp * .16;
    v = open + drift + wave;
    arr.push(Math.max(price * .70, v));
  }
  arr[0] = open;
  arr[arr.length - 1] = price;
  return arr;
}

function closeModal() { $('#modal').classList.add('hidden'); }
function firstSignal() { return (state.scan?.signals || [])[0] || null; }
function tradingViewSymbol(a) {
  if (a.type === 'crypto') {
    const base = a.symbol.replace(/USDT$/, '').replace(/USD$/, '');
    if (a.provider === 'coinbase') return `COINBASE:${base}USD`;
    if (a.provider === 'binance') return `BINANCE:${a.symbol}`;
    return `CRYPTO:${base}USD`;
  }
  return `FX:${a.symbol}`;
}
function tvLink(a) { return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol(a))}`; }
function trendClass(n) { return Number(n) > 0 ? 'up' : Number(n) < 0 ? 'down' : 'flat'; }
function signed(n) { const x = Number(n || 0); return `${x >= 0 ? '+' : ''}${round(x, 2)}`; }
function round(n, d = 2) { const f = 10 ** d; return Math.round(Number(n || 0) * f) / f; }
function fmtNumber(n, type) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: type === 'forex' ? 5 : n > 1000 ? 2 : 5 }); }
function fmtPrice(a) { const p = Number(a?.price); if (!Number.isFinite(p) || p <= 0) return '-'; return `${a.type === 'forex' ? '' : '$'}${fmtNumber(p, a.type)}`; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 2600); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(v) { return String(v ?? '').replace(/["'<>]/g, ''); }

/* v40: reliable locked real-data canvas chart. Replaces the old interactive chart renderer. */
function renderLiveChartCanvas(container, candles, asset = {}, options = {}) {
  if (!container) return false;
  const compact = !!options.compact;
  const chartKey = container.id || `${asset.symbol || 'chart'}:${compact ? 'mini' : 'big'}`;
  const old = state.liveCharts.get(chartKey);
  if (old?.dispose) { try { old.dispose(); } catch {} }

  const data = normalizeCanvasCandles(candles).length >= 4
    ? normalizeCanvasCandles(candles)
    : fallbackCandlesFromAsset(asset, compact ? 54 : 72);

  container.classList.add('live-chart-ready', 'canvas-chart-ready', 'chart-locked');
  container.innerHTML = '<canvas class="aq-real-canvas" aria-label="Locked market chart"></canvas>';
  const canvas = container.querySelector('canvas');
  if (!canvas || data.length < 2) {
    container.innerHTML = '<div class="chart-empty dark">Chart sedang menyiapkan data...</div>';
    return false;
  }

  const draw = () => drawAstraCanvasChart(canvas, container, data, asset, { ...options, compact });
  requestAnimationFrame(draw);
  setTimeout(draw, 60);
  setTimeout(draw, 220);
  setTimeout(draw, 600);

  const ro = new ResizeObserver(draw);
  try { ro.observe(container); } catch {}
  window.addEventListener('resize', draw, { passive: true });
  state.liveCharts.set(chartKey, { dispose: () => { try { ro.disconnect(); } catch {}; window.removeEventListener('resize', draw); } });
  return true;
}

function normalizeCanvasCandles(candles) {
  return (candles || []).map((c, i) => {
    const timeRaw = Number(c.time ?? c.t ?? c[0] ?? Date.now() + i);
    const open = Number(c.open ?? c.o ?? c[1]);
    const high = Number(c.high ?? c.h ?? c[2]);
    const low = Number(c.low ?? c.l ?? c[3]);
    const close = Number(c.close ?? c.c ?? c[4]);
    const time = timeRaw > 100000000000 ? Math.floor(timeRaw / 1000) : Math.floor(timeRaw);
    return { time, open, high, low, close };
  }).filter(c => c.time && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 && c.high >= c.low)
    .sort((a, b) => a.time - b.time)
    .slice(-120);
}

function fallbackCandlesFromAsset(asset = {}, count = 72) {
  let series = Array.isArray(asset.chart) ? asset.chart.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];
  if (series.length < 4) series = fallbackSeries(asset);
  if (series.length < 4) {
    const price = Number(asset.price || 1) || 1;
    series = Array.from({ length: count }, (_, i) => price * (1 + Math.sin(i / 5) * 0.004 + Math.cos(i / 9) * 0.003));
    series[series.length - 1] = price;
  }
  const step = Math.max(1, Math.ceil(series.length / count));
  series = series.filter((_, i) => i % step === 0 || i === series.length - 1).slice(-count);
  return syntheticCandlesFromSeries(series, asset);
}

function drawAstraCanvasChart(canvas, container, candles, asset = {}, options = {}) {
  const compact = !!options.compact;
  const rect = container.getBoundingClientRect();
  const width = Math.max(compact ? 260 : 320, Math.floor(rect.width || container.clientWidth || (compact ? 520 : 820)));
  const height = Math.max(compact ? 130 : 320, Math.floor(container.clientHeight || (compact ? 155 : 390)));
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  roundRectPath(ctx, 0, 0, width, height, compact ? 18 : 24);
  ctx.fillStyle = '#07101f';
  ctx.fill();

  const data = normalizeCanvasCandles(candles);
  if (data.length < 2) return;

  const action = asset.signalAction || asset.action || actionFromDirection(asset.direction);
  const levels = buildTradeLevels(asset, action);
  const naturalMin = Math.min(...data.map(c => c.low));
  const naturalMax = Math.max(...data.map(c => c.high));
  const last = Number(asset.price || data.at(-1)?.close || 1);
  let min = naturalMin;
  let max = naturalMax;
  const levelValues = !compact && options.levels !== false
    ? (action === 'WAIT' ? [levels.entry] : [levels.takeProfit, levels.entry, levels.stopLoss]).filter(v => Number.isFinite(Number(v)) && Number(v) > 0).map(Number)
    : [];
  const naturalRange = Math.max(naturalMax - naturalMin, last * 0.006);
  for (const v of levelValues) {
    if (Math.abs(v - last) <= Math.max(naturalRange * 3.2, last * 0.085)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) { min = last * 0.985; max = last * 1.015; }
  const pad = Math.max((max - min) * 0.14, last * 0.0025);
  min = Math.max(0.00000001, min - pad);
  max += pad;

  const padL = compact ? 10 : 54;
  const padR = compact ? 10 : 92;
  const padT = compact ? 10 : 18;
  const padB = compact ? 12 : 34;
  const innerW = Math.max(40, width - padL - padR);
  const innerH = Math.max(40, height - padT - padB);
  const xAt = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const yAt = (v) => padT + (1 - ((v - min) / (max - min))) * innerH;

  // Grid and axis.
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + innerH * (i / 4);
    ctx.strokeStyle = i === 4 ? 'rgba(142,164,196,.20)' : 'rgba(142,164,196,.12)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke();
    if (!compact) {
      const v = max - (max - min) * (i / 4);
      ctx.fillStyle = '#8fb0dc';
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtAxis(v, asset.type), padL - 8, y);
    }
  }

  // Candles.
  const step = innerW / Math.max(1, data.length - 1);
  const bodyW = compact ? Math.max(2, Math.min(7, step * 0.58)) : Math.max(3, Math.min(10, step * 0.58));
  data.forEach((c, i) => {
    const x = xAt(i);
    const up = c.close >= c.open;
    const color = up ? '#16e69a' : '#ff4b78';
    const yHigh = Math.max(padT, Math.min(padT + innerH, yAt(c.high)));
    const yLow = Math.max(padT, Math.min(padT + innerH, yAt(c.low)));
    const yOpen = Math.max(padT, Math.min(padT + innerH, yAt(c.open)));
    const yClose = Math.max(padT, Math.min(padT + innerH, yAt(c.close)));
    const top = Math.min(yOpen, yClose);
    const h = Math.max(2.4, Math.abs(yOpen - yClose));
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, compact ? 1.2 : 1.4);
    ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow); ctx.stroke();
    ctx.fillStyle = color;
    roundRectPath(ctx, x - bodyW / 2, top, bodyW, h, Math.min(3, bodyW / 2));
    ctx.fill();
  });

  if (!compact && options.levels !== false) {
    drawCanvasLevels(ctx, levels, action, asset, yAt, padL, width - padR, padT, padT + innerH, width);
  }

  if (!compact) {
    ctx.fillStyle = '#8fb0dc';
    ctx.font = '800 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('7D', padL, height - 11);
    ctx.textAlign = 'right';
    ctx.fillText('Now', width - padR, height - 11);
  }
  ctx.restore();
}

function drawCanvasLevels(ctx, levels, action, asset, yAt, x1, x2, minY, maxY, width) {
  const rows = action === 'WAIT'
    ? [['entry', 'PRICE', '#23c2ff']]
    : [['takeProfit', 'TP', '#18e59b'], ['entry', 'ENTRY', '#23c2ff'], ['stopLoss', 'SL', '#ff4778']];
  const items = rows.map(([key, label, color]) => {
    const value = Number(levels[key]);
    if (!Number.isFinite(value) || value <= 0) return null;
    const rawY = yAt(value);
    const y = Math.max(minY + 8, Math.min(maxY - 8, rawY));
    return { key, label, color, value, y };
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  const gap = 28;
  let last = -9999;
  for (const item of items) {
    if (item.y - last < gap) item.labelY = last + gap;
    else item.labelY = item.y;
    item.labelY = Math.max(minY + 14, Math.min(maxY - 14, item.labelY));
    last = item.labelY;
  }
  const overflow = items.length ? items.at(-1).labelY - (maxY - 14) : 0;
  if (overflow > 0) items.forEach(i => i.labelY -= overflow);
  for (const item of items) {
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = item.color;
    ctx.beginPath(); ctx.moveTo(x1, item.y); ctx.lineTo(x2, item.y); ctx.stroke();
    ctx.setLineDash([]);
    const text = `${item.label} ${fmtNumber(item.value, asset.type || 'crypto')}`;
    ctx.font = '900 11px Inter, system-ui, sans-serif';
    const tw = Math.min(128, Math.max(74, ctx.measureText(text).width + 20));
    const bx = Math.min(width - tw - 10, x2 + 8);
    const by = item.labelY - 12;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = item.color;
    roundRectPath(ctx, bx, by, tw, 24, 8); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = item.color;
    roundRectPath(ctx, bx, by, tw, 24, 8); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 10, item.labelY);
    ctx.restore();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
