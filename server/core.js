const fs = require('fs');
const path = require('path');

loadEnvFile();

const CONFIG = {
  appName: process.env.APP_NAME || 'AstraQuant CryptoFX',
  cryptoProvider: String(process.env.CRYPTO_PROVIDER || process.env.ASTRAQUANT_PRICE_MODE || 'coingecko').toLowerCase(),
  forexProvider: process.env.FOREX_PROVIDER || 'frankfurter',
  // Leave CRYPTO_SYMBOLS empty to let the AI universe selector choose coins automatically.
  cryptoSymbols: splitEnv(process.env.CRYPTO_SYMBOLS || ''),
  cryptoUniverseMode: String(process.env.CRYPTO_UNIVERSE_MODE || 'ai').toLowerCase(),
  cryptoUniverseLimit: Number(process.env.CRYPTO_UNIVERSE_LIMIT || 60),
  cryptoSignalLimit: Number(process.env.CRYPTO_SIGNAL_LIMIT || 24),
  minCryptoVolumeUsd: Number(process.env.MIN_CRYPTO_VOLUME_USD || 10000000),
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
  chartProvider: String(process.env.CHART_PROVIDER || 'coingecko').toLowerCase(),
  chartMode: String(process.env.CHART_MODE || 'ohlc').toLowerCase(),
  chartDays: Number(process.env.CHART_DAYS || 1),
  forexPairs: splitEnv(process.env.FOREX_PAIRS || 'EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD'),
  livePricePollSeconds: Number(process.env.LIVE_PRICE_POLL_SECONDS || msToSeconds(process.env.ASTRAQUANT_PRICE_TICK_MS) || msToSeconds(process.env.ASTRAQUANT_SERVERLESS_PRICE_INTERVAL_MS) || 15),
  validatePollSeconds: Number(process.env.SIGNAL_VALIDATE_POLL_SECONDS || msToSeconds(process.env.ASTRAQUANT_ENGINE_INTERVAL_MS) || msToSeconds(process.env.ASTRAQUANT_SERVERLESS_ENGINE_INTERVAL_MS) || 30),
  rapidApiKey: process.env.RAPIDAPI_KEY || '',
  rapidApiHost: process.env.RAPIDAPI_HOST || '',
  rapidForexUrl: process.env.RAPIDAPI_FOREX_URL || '',
  aiProvider: process.env.AI_PROVIDER || 'mock',
  publicSafety: String(process.env.PUBLIC_SIGNAL_SAFETY_MODE || 'true') !== 'false',
  // Supabase persistence. This app never writes to localStorage or local JSON DB.
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseEnabled: String(process.env.SUPABASE_ENABLED || 'true') !== 'false',
  supabaseSaveLiveMarket: String(process.env.SUPABASE_SAVE_LIVE_MARKET || 'true') !== 'false',
  supabaseLiveSaveMinSeconds: Number(process.env.SUPABASE_LIVE_SAVE_MIN_SECONDS || 60),
  cryptoNewsEnabled: String(process.env.CRYPTO_NEWS_ENABLED || 'true') !== 'false',
  cryptoNewsRssUrls: splitEnv(process.env.CRYPTO_NEWS_RSS_URLS || 'https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss/'),
  cryptoNewsLimit: Number(process.env.CRYPTO_NEWS_LIMIT || 8),
  signalStabilityMode: String(process.env.SIGNAL_STABILITY_MODE || 'supabase').toLowerCase(),
  signalAutoReplaceInvalid: String(process.env.SIGNAL_AUTO_REPLACE_INVALID || 'true') !== 'false',
  signalStableMinutes: Number(process.env.SIGNAL_STABLE_MINUTES || 240)
};

const cache = new Map();

const COINGECKO_IDS = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
  ADAUSDT: 'cardano',
  LINKUSDT: 'chainlink',
  AVAXUSDT: 'avalanche-2',
  MATICUSDT: 'matic-network',
  DOTUSDT: 'polkadot',
  LTCUSDT: 'litecoin',
  BCHUSDT: 'bitcoin-cash',
  UNIUSDT: 'uniswap',
  NEARUSDT: 'near',
  ATOMUSDT: 'cosmos',
  APTUSDT: 'aptos',
  OPUSDT: 'optimism',
  ARBUSDT: 'arbitrum'
};

const SYMBOL_FROM_COINGECKO_ID = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([symbol, id]) => [id, symbol]));

const STABLE_IDS = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'paypal-usd', 'usdd', 'usde', 'ethena-usde', 'true-usd']);
const WRAPPED_IDS = new Set(['wrapped-bitcoin', 'wrapped-steth', 'staked-ether', 'rocket-pool-eth', 'mantle-staked-ether']);

function normalizeDynamicCryptoSymbol(raw) {
  const base = safeSymbol(raw);
  if (!base || base.length > 12) return null;
  return `${base}USDT`;
}

function isGoodAutoCoin(row) {
  if (!row || !row.id || !row.symbol) return false;
  if (STABLE_IDS.has(row.id) || WRAPPED_IDS.has(row.id)) return false;
  const symbol = safeSymbol(row.symbol);
  if (!symbol || symbol.length > 6) return false;
  const price = num(row.current_price);
  const volume = num(row.total_volume);
  const marketCapRank = num(row.market_cap_rank, 999999);
  if (!price || !volume || !marketCapRank) return false;
  // Public dashboard should avoid obscure, illiquid tokens because their charts can look broken.
  if (marketCapRank > 90) return false;
  if (volume < CONFIG.minCryptoVolumeUsd) return false;
  return true;
}

function loadEnvFile() {
  const candidates = [path.join(process.cwd(), 'config.env'), path.join(process.cwd(), '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function splitEnv(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

function msToSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return Math.max(1, Math.round(n / 1000));
}

function nowIso() { return new Date().toISOString(); }
function num(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function round(n, d = 2) { const f = 10 ** d; return Math.round(Number(n || 0) * f) / f; }
function pct(n) { return `${round(n, 2)}%`; }
function safeSymbol(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, headers: { 'user-agent': 'AstraQuant-CryptoFX/22', ...(options.headers || {}) } });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 240)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = String(block || '').match(re);
  return m ? decodeHtml(stripTags(m[1])) : '';
}

function parseRss(xml, sourceUrl) {
  const blocks = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const title = tagValue(block, 'title');
    const link = tagValue(block, 'link');
    const pubDate = tagValue(block, 'pubDate') || tagValue(block, 'updated') || tagValue(block, 'published');
    const description = tagValue(block, 'description');
    const source = sourceUrl.includes('cointelegraph') ? 'Cointelegraph' : sourceUrl.includes('coindesk') ? 'CoinDesk' : 'Crypto News';
    return {
      title,
      link,
      source,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : nowIso(),
      summary: description.slice(0, 180),
      impact: classifyNewsImpact(`${title} ${description}`)
    };
  }).filter(x => x.title && x.link);
}

function classifyNewsImpact(text) {
  const t = String(text || '').toLowerCase();
  const negative = ['hack', 'exploit', 'lawsuit', 'ban', 'crackdown', 'liquidation', 'outflow', 'sell-off', 'plunge', 'fraud', 'sec sues', 'bankruptcy'];
  const positive = ['etf', 'approval', 'inflow', 'partnership', 'adoption', 'upgrade', 'rate cut', 'rally', 'surge', 'record high', 'accumulation'];
  const macro = ['fed', 'inflation', 'interest rate', 'cpi', 'fomc', 'dollar', 'yields'];
  if (negative.some(k => t.includes(k))) return 'Risk Watch';
  if (positive.some(k => t.includes(k))) return 'Positive Catalyst';
  if (macro.some(k => t.includes(k))) return 'Macro Catalyst';
  return 'Market Catalyst';
}

async function getCryptoNews() {
  if (!CONFIG.cryptoNewsEnabled) return { ok: true, enabled: false, news: [] };
  const urls = CONFIG.cryptoNewsRssUrls.slice(0, 4);
  const result = await cached(`crypto-news:${urls.join('|')}`, 10 * 60 * 1000, async () => {
    const all = [];
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'AstraQuant-CryptoFX-News/26' } });
        const text = await res.text();
        clearTimeout(timer);
        if (res.ok) all.push(...parseRss(text, url));
      } catch {}
    }
    const seen = new Set();
    return all
      .filter(item => {
        const key = item.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, Math.max(1, Math.min(CONFIG.cryptoNewsLimit || 8, 20)));
  });
  return { ok: true, enabled: true, source: 'rss', updatedAt: nowIso(), news: result };
}

function flowScore(asset) {
  const vol = num(asset.volume);
  const chg = num(asset.changePct);
  return vol * (chg / 100);
}

function formatFlowLabel(value) {
  const n = Math.abs(Number(value || 0));
  if (n >= 1e12) return `${round(n / 1e12, 2)}T`;
  if (n >= 1e9) return `${round(n / 1e9, 2)}B`;
  if (n >= 1e6) return `${round(n / 1e6, 2)}M`;
  if (n >= 1e3) return `${round(n / 1e3, 2)}K`;
  return `${round(n, 2)}`;
}

function buildFlowInsight(market, scan, newsPayload) {
  const crypto = (market.crypto || []).filter(a => num(a.price) > 0);
  const forex = (market.forex || []).filter(a => num(a.price) > 0);
  const totalVolume = crypto.reduce((s, a) => s + num(a.volume), 0);
  const inflow = crypto.filter(a => num(a.changePct) > 0).reduce((s, a) => s + num(a.volume), 0);
  const outflow = crypto.filter(a => num(a.changePct) < 0).reduce((s, a) => s + num(a.volume), 0);
  const netFlow = crypto.reduce((s, a) => s + flowScore(a), 0);
  const upCount = crypto.filter(a => num(a.changePct) > 0).length;
  const downCount = crypto.filter(a => num(a.changePct) < 0).length;
  const inflowRatio = totalVolume ? inflow / totalVolume : 0;
  const outflowRatio = totalVolume ? outflow / totalVolume : 0;
  const avgCryptoMove = crypto.length ? crypto.reduce((s, a) => s + num(a.changePct), 0) / crypto.length : 0;
  const avgForexMove = forex.length ? forex.reduce((s, a) => s + num(a.changePct), 0) / forex.length : 0;
  const topInflows = [...crypto].filter(a => flowScore(a) > 0).sort((a, b) => flowScore(b) - flowScore(a)).slice(0, 7).map(a => ({ ...a, flowValue: flowScore(a), flowLabel: formatFlowLabel(flowScore(a)) }));
  const topOutflows = [...crypto].filter(a => flowScore(a) < 0).sort((a, b) => flowScore(a) - flowScore(b)).slice(0, 7).map(a => ({ ...a, flowValue: flowScore(a), flowLabel: formatFlowLabel(flowScore(a)) }));
  const topVolume = [...crypto].sort((a, b) => num(b.volume) - num(a.volume)).slice(0, 7).map(a => ({ ...a, volumeLabel: formatFlowLabel(a.volume) }));
  let mode = 'Selective';
  let message = 'Market belum satu arah. Fokus ke coin yang volume naik tetapi belum terlalu jauh dari area entry.';
  if (inflowRatio >= 0.58 && avgCryptoMove > 0.7) {
    mode = 'Liquidity Inflow';
    message = 'Dana 24 jam lebih dominan masuk ke asset yang menguat. Prioritaskan setup continuation dengan risk kecil.';
  } else if (outflowRatio >= 0.58 || avgCryptoMove < -0.8) {
    mode = 'Liquidity Outflow';
    message = 'Volume besar lebih banyak berada di asset melemah. Hindari entry agresif dan tunggu reversal jelas.';
  }
  return {
    ok: true,
    updatedAt: nowIso(),
    mode,
    message,
    metrics: {
      totalVolume,
      totalVolumeLabel: formatFlowLabel(totalVolume),
      inflow,
      inflowLabel: formatFlowLabel(inflow),
      outflow,
      outflowLabel: formatFlowLabel(outflow),
      netFlow,
      netFlowLabel: `${netFlow >= 0 ? '+' : '-'}${formatFlowLabel(netFlow)}`,
      inflowRatio: round(inflowRatio * 100, 1),
      outflowRatio: round(outflowRatio * 100, 1),
      avgCryptoMove: round(avgCryptoMove, 2),
      avgForexMove: round(avgForexMove, 3),
      upCount,
      downCount,
      assetCount: crypto.length
    },
    topInflows,
    topOutflows,
    topVolume,
    topSignals: (scan.signals || []).slice(0, 6),
    news: newsPayload?.news || []
  };
}

async function getMarketInsight(query = {}) {
  const market = await getLiveMarket(query);
  const scan = await getScan(query);
  const news = await getCryptoNews();
  return buildFlowInsight(market, scan, news);
}

function dbConfigured() {
  return !!(CONFIG.supabaseEnabled && CONFIG.supabaseUrl && CONFIG.supabaseServiceRoleKey);
}

function dbStatusBase() {
  return {
    enabled: CONFIG.supabaseEnabled,
    configured: dbConfigured(),
    mode: dbConfigured() ? 'supabase' : 'disabled-or-missing-env',
    localStorage: false,
    localJsonDb: false
  };
}

async function supabaseRest(table, options = {}) {
  if (!dbConfigured()) throw new Error('Supabase belum dikonfigurasi: isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel env');
  const base = CONFIG.supabaseUrl.replace(/\/$/, '');
  const query = options.query ? `?${options.query}` : '';
  const headers = {
    apikey: CONFIG.supabaseServiceRoleKey,
    authorization: `Bearer ${CONFIG.supabaseServiceRoleKey}`,
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(`${base}/rest/v1/${table}${query}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Supabase ${table} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

function cleanPayload(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return v;
  }));
}

function mapMarketRow(a) {
  return cleanPayload({
    symbol: a.symbol,
    asset_type: a.type,
    display: a.display,
    provider: a.provider,
    source: a.source,
    price: a.price,
    change_pct: a.changePct,
    volume: a.volume,
    bid: a.bid,
    ask: a.ask,
    spread_pct: a.spreadPct,
    market_cap: a.marketCap || null,
    rank: a.rank || null,
    updated_at: a.updatedAt || nowIso(),
    payload: a
  });
}

function mapSignalRow(s) {
  return cleanPayload({
    symbol: s.symbol,
    asset_type: s.type,
    display: s.display,
    provider: s.provider,
    source: s.source,
    price: s.price,
    change_pct: s.changePct,
    volume: s.volume,
    ai_score: s.aiScore,
    direction: s.direction,
    status: s.status,
    entry: s.entry,
    stop_loss: s.stopLoss,
    take_profit: s.takeProfit,
    risk_pct: s.riskPct,
    reward_pct: s.rewardPct,
    horizon: s.horizon,
    timeframe: s.timeframe || s.horizon || null,
    valid_for: s.validFor,
    updated_at: nowIso(),
    payload: s
  });
}

let lastLiveMarketSaveAt = 0;

async function saveLiveMarketToSupabase(market) {
  const base = dbStatusBase();
  if (!base.configured || !CONFIG.supabaseSaveLiveMarket) return { ...base, saved: false, skipped: true };
  const minMs = Math.max(0, CONFIG.supabaseLiveSaveMinSeconds || 0) * 1000;
  if (minMs && Date.now() - lastLiveMarketSaveAt < minMs) return { ...base, saved: false, skipped: true, reason: 'rate-limited-memory-gate' };
  const rows = (market.all || []).map(mapMarketRow).filter(r => r.symbol);
  if (!rows.length) return { ...base, saved: false, skipped: true, reason: 'no-rows' };
  await supabaseRest('aq_crypto_fx_live_assets', {
    method: 'POST',
    query: 'on_conflict=symbol',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: rows
  });
  lastLiveMarketSaveAt = Date.now();
  return { ...base, saved: true, table: 'aq_crypto_fx_live_assets', rows: rows.length };
}

async function saveScanToSupabase(scan) {
  const base = dbStatusBase();
  if (!base.configured) return { ...base, saved: false, skipped: true };
  const signalRows = (scan.signals || []).map(mapSignalRow).filter(r => r.symbol);
  if (signalRows.length) {
    await supabaseRest('aq_crypto_fx_signals', {
      method: 'POST',
      query: 'on_conflict=symbol',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: signalRows
    });
  }
  await supabaseRest('aq_crypto_fx_scan_runs', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: cleanPayload({
      scanned_at: scan.scannedAt,
      mode: scan.mode,
      signal_count: signalRows.length,
      active_count: scan.summary?.active || 0,
      watchlist_count: scan.summary?.watchlist || 0,
      best_symbol: scan.summary?.best?.symbol || null,
      summary: scan.summary,
      providers: scan.providers,
      payload: scan
    })
  });
  return { ...base, saved: true, signalTable: 'aq_crypto_fx_signals', scanTable: 'aq_crypto_fx_scan_runs', rows: signalRows.length };
}

async function getStoredSignals(limit = 50) {
  const base = dbStatusBase();
  if (!base.configured) return { ok: false, ...base, signals: [] };
  const data = await supabaseRest('aq_crypto_fx_signals', {
    query: `select=*&order=ai_score.desc&limit=${Math.max(1, Math.min(Number(limit) || 50, 200))}`
  });
  return { ok: true, ...base, count: Array.isArray(data) ? data.length : 0, signals: data || [] };
}


function dbRowToSignal(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return cleanPayload({
    ...payload,
    symbol: payload.symbol || row.symbol,
    type: payload.type || row.asset_type,
    display: payload.display || row.display || row.symbol,
    provider: payload.provider || row.provider,
    source: payload.source || row.source,
    price: num(row.price, payload.price),
    changePct: num(row.change_pct, payload.changePct),
    volume: num(row.volume, payload.volume),
    aiScore: num(row.ai_score, payload.aiScore),
    direction: payload.direction || row.direction,
    status: payload.status || row.status,
    entry: num(row.entry, payload.entry),
    stopLoss: num(row.stop_loss, payload.stopLoss),
    takeProfit: num(row.take_profit, payload.takeProfit),
    riskPct: num(row.risk_pct, payload.riskPct),
    rewardPct: num(row.reward_pct, payload.rewardPct),
    horizon: payload.horizon || row.horizon,
    timeframe: payload.timeframe || row.timeframe || row.horizon,
    validFor: payload.validFor || row.valid_for,
    lockedAt: payload.lockedAt || row.updated_at,
    updatedAt: row.updated_at || payload.updatedAt
  });
}

function signalTtlMinutes(signal) {
  const tf = String(signal.timeframe || signal.horizon || '').toUpperCase();
  if (tf.includes('SCALP')) return 45;
  if (tf.includes('INTRADAY')) return 360;
  if (tf.includes('SWING')) return 7 * 24 * 60;
  if (tf.includes('DAILY')) return 24 * 60;
  if (tf.includes('LONG')) return 30 * 24 * 60;
  if (tf.includes('WATCH')) return Math.max(60, CONFIG.signalStableMinutes || 240);
  return Math.max(60, CONFIG.signalStableMinutes || 240);
}

function signalAgeMinutes(signal) {
  const t = Date.parse(signal.lockedAt || signal.updatedAt || 0);
  if (!t) return 999999;
  return (Date.now() - t) / 60000;
}

function mergeStableSignalWithLive(signal, liveAsset) {
  if (!liveAsset) return signal;
  return cleanPayload({
    ...signal,
    // current market fields may move, but action/entry/SL/TP/timeframe stay locked for all users
    price: liveAsset.price || signal.price,
    changePct: liveAsset.changePct ?? signal.changePct,
    volume: liveAsset.volume ?? signal.volume,
    bid: liveAsset.bid ?? signal.bid,
    ask: liveAsset.ask ?? signal.ask,
    spreadPct: liveAsset.spreadPct ?? signal.spreadPct,
    provider: liveAsset.provider || signal.provider,
    source: liveAsset.source || signal.source,
    liveUpdatedAt: liveAsset.updatedAt || nowIso()
  });
}

function isSignalInvalid(signal, liveAsset) {
  const current = num(liveAsset?.price, num(signal.price));
  const entry = num(signal.entry);
  const sl = num(signal.stopLoss);
  const tp = num(signal.takeProfit);
  const action = String(signal.signalAction || signal.action || '').toUpperCase();
  if (!current || !entry) return false;
  if (signalAgeMinutes(signal) > signalTtlMinutes(signal)) return true;
  if (action === 'BUY') {
    if (sl && current <= sl) return true;
    if (tp && current >= tp) return true;
  }
  if (action === 'SELL') {
    if (sl && current >= sl) return true;
    if (tp && current <= tp) return true;
  }
  return false;
}

async function readStoredSignalPayloads(limit = 80) {
  if (!dbConfigured()) return [];
  const data = await supabaseRest('aq_crypto_fx_signals', {
    query: `select=*&order=ai_score.desc&limit=${Math.max(1, Math.min(Number(limit) || 80, 200))}`
  });
  return Array.isArray(data) ? data.map(dbRowToSignal).filter(isTradableAsset) : [];
}

async function getStableSignalsFromSupabase(market) {
  const base = dbStatusBase();
  if (CONFIG.signalStabilityMode === 'off' || !base.configured) return { usable: false, reason: 'stability-disabled-or-db-missing', database: base };
  const stored = await readStoredSignalPayloads(Math.max(50, (CONFIG.cryptoSignalLimit || 24) + 20));
  if (!stored.length) return { usable: false, reason: 'no-stored-signals', database: { ...base, stored: 0 } };
  const liveMap = new Map((market.all || []).map(a => [a.symbol, a]));
  const invalid = stored.filter(s => isSignalInvalid(s, liveMap.get(s.symbol)));
  if (CONFIG.signalAutoReplaceInvalid && invalid.length) {
    return { usable: false, reason: `invalid-signals:${invalid.map(s => s.symbol).slice(0, 5).join(',')}`, database: { ...base, stored: stored.length, invalid: invalid.length } };
  }
  const usable = stored
    .map(s => mergeStableSignalWithLive(s, liveMap.get(s.symbol)))
    .filter(isTradableAsset)
    .sort((a, b) => num(b.aiScore) - num(a.aiScore));
  if (!usable.length) return { usable: false, reason: 'stored-signals-not-usable', database: { ...base, stored: stored.length } };
  return { usable: true, reason: 'stored-stable', signals: usable, database: { ...base, stored: stored.length, invalid: invalid.length, stable: true } };
}

function buildScanPayload(market, signals, source = 'fresh-scan') {
  return {
    ok: true,
    scannedAt: nowIso(),
    mode: 'crypto-fx',
    source,
    stability: {
      mode: CONFIG.signalStabilityMode,
      autoReplaceInvalid: CONFIG.signalAutoReplaceInvalid,
      stableMinutes: CONFIG.signalStableMinutes
    },
    disclaimer: 'Research dashboard, bukan nasihat keuangan. Crypto dan forex berisiko tinggi.',
    summary: {
      active: signals.filter(s => s.status === 'BUY ZONE' || s.status === 'SELL ZONE').length,
      watchlist: signals.filter(s => s.status === 'WATCHLIST').length,
      universe: market.crypto.length,
      best: signals[0] ? {
        symbol: signals[0].symbol,
        type: signals[0].type,
        display: signals[0].display,
        price: signals[0].price,
        changePct: signals[0].changePct,
        aiScore: signals[0].aiScore,
        status: signals[0].status,
        direction: signals[0].direction,
        action: signals[0].action,
        signalAction: signals[0].signalAction,
        horizon: signals[0].horizon,
        timeframe: signals[0].timeframe,
        validFor: signals[0].validFor,
        provider: signals[0].provider,
        source: signals[0].source,
        entry: signals[0].entry,
        stopLoss: signals[0].stopLoss,
        takeProfit: signals[0].takeProfit
      } : null
    },
    signals,
    providers: market.providers,
    liveMarketDatabase: market.database
  };
}

async function getDbHealth() {
  const base = dbStatusBase();
  if (!base.configured) return { ok: false, ...base, message: 'Supabase belum aktif. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.' };
  try {
    const test = await supabaseRest('aq_crypto_fx_signals', { query: 'select=symbol&limit=1' });
    return { ok: true, ...base, canRead: true, sampleRows: Array.isArray(test) ? test.length : 0 };
  } catch (err) {
    return { ok: false, ...base, error: err.message };
  }
}

async function getCryptoMarket(requestedSymbols) {
  const provider = String(CONFIG.cryptoProvider || 'auto').toLowerCase();
  const manualSymbols = (requestedSymbols?.length ? requestedSymbols : CONFIG.cryptoSymbols).map(safeSymbol).filter(Boolean).slice(0, 50);
  const useAiUniverse = !manualSymbols.length && CONFIG.cryptoUniverseMode !== 'manual';

  // In AI universe mode, the app does not use a fixed/default coin list.
  // CoinGecko market-cap/volume data becomes the broad universe, then the local AI scorer ranks the best setups.
  if (useAiUniverse && (provider === 'auto' || provider === 'coingecko')) {
    try {
      const rows = await getCoinGeckoAutoUniverseMarket();
      if (rows?.length) return rows;
    } catch (err) {
      return [];
    }
  }

  const symbols = manualSymbols.length ? manualSymbols : [];
  if (!symbols.length) return []; // no default coins: AI universe must come from provider data

  if (provider === 'coingecko') return getCoinGeckoMarket(symbols);
  if (provider === 'coinbase') return getCoinbaseMarket(symbols);
  if (provider === 'binance') return getBinanceMarket(symbols);
  if (provider === 'mock') return mockCrypto(symbols, 'mock');

  // Auto mode avoids Binance first because Binance API may be blocked from some networks/regions.
  try {
    const cg = await getCoinGeckoMarket(symbols);
    if (cg?.length) return cg;
  } catch {}
  try {
    const cb = await getCoinbaseMarket(symbols);
    if (cb?.length) return cb;
  } catch {}
  return mockCrypto(symbols, 'all provider fallback');
}

async function getCoinGeckoAutoUniverseMarket() {
  const limit = Math.max(10, Math.min(250, CONFIG.cryptoUniverseLimit || 60));
  const headers = CONFIG.coingeckoApiKey ? { 'x-cg-demo-api-key': CONFIG.coingeckoApiKey } : {};
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=1h,24h,7d&precision=full`;
  const data = await cached(`coingecko:auto-universe:${limit}`, 15000, async () => fetchJson(url, { headers }, 10000));
  const arr = Array.isArray(data) ? data : [];
  const rows = arr.filter(isGoodAutoCoin).map(normalizeCoinGeckoMarketTicker).filter(Boolean);
  if (!rows.length) throw new Error('CoinGecko auto universe response kosong');
  return rows;
}

async function getBinanceMarket(symbols) {
  try {
    const data = await cached(`binance:${symbols.join(',')}`, 2500, async () => {
      const encoded = encodeURIComponent(JSON.stringify(symbols));
      return await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encoded}&type=FULL`);
    });
    const arr = Array.isArray(data) ? data : [data];
    return arr.map(normalizeBinanceTicker).filter(Boolean);
  } catch (err) {
    return mockCrypto(symbols, `binance fallback: ${err.message}`);
  }
}

async function getCoinGeckoMarket(symbols) {
  const idPairs = symbols.map(symbol => [symbol, COINGECKO_IDS[symbol]]).filter(([, id]) => !!id);
  if (!idPairs.length) return [];
  try {
    const ids = idPairs.map(([, id]) => id).join(',');
    const headers = CONFIG.coingeckoApiKey ? { 'x-cg-demo-api-key': CONFIG.coingeckoApiKey } : {};
    const data = await cached(`coingecko:${ids}`, 10000, async () => fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true&precision=full`,
      { headers },
      9000
    ));
    const rows = idPairs.map(([symbol, id]) => normalizeCoinGeckoTicker(symbol, id, data?.[id])).filter(Boolean);
    if (!rows.length) throw new Error('CoinGecko response kosong');
    return rows;
  } catch (err) {
    return [];
  }
}

async function getCoinbaseMarket(symbols) {
  try {
    const rows = await cached(`coinbase:${symbols.join(',')}`, 5000, async () => Promise.all(symbols.map(async symbol => {
      const base = symbol.replace(/USDT$/, '').replace(/USD$/, '');
      const product = `${base}-USD`;
      const t = await fetchJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`, {}, 9000);
      return normalizeCoinbaseTicker(symbol, product, t);
    })));
    return rows.filter(Boolean);
  } catch (err) {
    return mockCrypto(symbols, `coinbase fallback: ${err.message}`);
  }
}

function normalizeCoinGeckoMarketTicker(row) {
  const base = safeSymbol(row.symbol);
  const symbol = normalizeDynamicCryptoSymbol(base);
  if (!symbol) return null;
  const price = num(row.current_price);
  const changePct = num(row.price_change_percentage_24h);
  const change1h = num(row.price_change_percentage_1h_in_currency);
  const change7d = num(row.price_change_percentage_7d_in_currency);
  const high = num(row.high_24h, price);
  const low = num(row.low_24h, price);
  const open = changePct ? price / (1 + changePct / 100) : price;
  const spreadPct = 0.08;
  const bid = price * (1 - spreadPct / 200);
  const ask = price * (1 + spreadPct / 200);
  return {
    type: 'crypto',
    symbol,
    coinId: row.id,
    display: `${base}/USDT`,
    name: row.name || base,
    provider: 'coingecko',
    source: 'ai-auto-universe',
    rank: num(row.market_cap_rank, 999999),
    price,
    changePct,
    change1h,
    change7d,
    open,
    high,
    low,
    volume: num(row.total_volume),
    marketCap: num(row.market_cap),
    bid,
    ask,
    spreadPct,
    count: 0,
    chart: Array.isArray(row.sparkline_in_7d?.price) ? row.sparkline_in_7d.price.filter(x => Number.isFinite(Number(x))).slice(-80) : buildFallbackChart(price, open, high, low, changePct, symbol),
    updatedAt: row.last_updated || nowIso()
  };
}

function normalizeCoinGeckoTicker(symbol, id, t) {
  if (!t) return null;
  const price = num(t.usd);
  const changePct = num(t.usd_24h_change);
  const open = price / (1 + changePct / 100);
  const spreadPct = 0.08;
  const bid = price * (1 - spreadPct / 200);
  const ask = price * (1 + spreadPct / 200);
  return {
    type: 'crypto',
    symbol,
    coinId: id,
    display: symbol.replace('USDT', '/USDT'),
    provider: 'coingecko',
    source: 'public-aggregated',
    price,
    changePct,
    open,
    high: Math.max(price, open) * 1.006,
    low: Math.min(price, open) * 0.994,
    volume: num(t.usd_24h_vol),
    marketCap: num(t.usd_market_cap),
    bid,
    ask,
    spreadPct,
    count: 0,
    chart: buildFallbackChart(price, open, Math.max(price, open) * 1.006, Math.min(price, open) * 0.994, changePct, symbol),
    updatedAt: t.last_updated_at ? new Date(num(t.last_updated_at) * 1000).toISOString() : nowIso()
  };
}

function normalizeCoinbaseTicker(symbol, product, t) {
  if (!t) return null;
  const price = num(t.price);
  const bid = num(t.bid, price * 0.9998);
  const ask = num(t.ask, price * 1.0002);
  const spreadPct = price ? ((ask - bid) / price) * 100 : 0;
  const pseudoOpen = price * (1 - seededWave(symbol, 0.025));
  return {
    type: 'crypto',
    symbol,
    display: symbol.replace('USDT', '/USDT'),
    provider: 'coinbase',
    source: 'public-exchange-ticker',
    price,
    changePct: pseudoOpen ? ((price - pseudoOpen) / pseudoOpen) * 100 : 0,
    open: pseudoOpen,
    high: Math.max(price, pseudoOpen) * 1.007,
    low: Math.min(price, pseudoOpen) * 0.993,
    volume: num(t.volume),
    baseVolume: num(t.size),
    bid,
    ask,
    spreadPct,
    count: num(t.trade_id),
    updatedAt: t.time || nowIso()
  };
}

function normalizeBinanceTicker(t) {
  if (!t?.symbol) return null;
  const price = num(t.lastPrice);
  const open = num(t.openPrice, price);
  const high = num(t.highPrice, price);
  const low = num(t.lowPrice, price);
  const bid = num(t.bidPrice, price);
  const ask = num(t.askPrice, price);
  const changePct = num(t.priceChangePercent, open ? ((price - open) / open) * 100 : 0);
  return {
    type: 'crypto',
    symbol: t.symbol,
    display: t.symbol.replace('USDT', '/USDT'),
    provider: 'binance',
    source: 'live-public',
    price,
    changePct,
    open,
    high,
    low,
    volume: num(t.quoteVolume),
    baseVolume: num(t.volume),
    bid,
    ask,
    spreadPct: price ? ((ask - bid) / price) * 100 : 0,
    count: num(t.count),
    updatedAt: new Date(num(t.closeTime, Date.now())).toISOString()
  };
}

async function getForexMarket(requestedPairs) {
  const pairs = (requestedPairs?.length ? requestedPairs : CONFIG.forexPairs).map(safeSymbol).slice(0, 12);
  if (CONFIG.forexProvider === 'rapidapi' && CONFIG.rapidApiKey && CONFIG.rapidApiHost && CONFIG.rapidForexUrl) {
    return getRapidForex(pairs);
  }
  if (CONFIG.forexProvider === 'frankfurter') {
    try {
      const results = await cached(`frankfurter:${pairs.join(',')}`, 30 * 60 * 1000, async () => {
        return await Promise.all(pairs.map(async pair => {
          const base = pair.slice(0, 3);
          const quote = pair.slice(3, 6);
          const data = await fetchJson(`https://api.frankfurter.dev/v2/rate/${base}/${quote}`, {}, 9000);
          const rate = num(data.rate ?? data.rates?.[quote]);
          return normalizeForex(pair, rate, 'frankfurter', 'daily-reference', data.date || nowIso().slice(0, 10));
        }));
      });
      return results;
    } catch (err) {
      return mockForex(pairs, `frankfurter fallback: ${err.message}`);
    }
  }
  return mockForex(pairs, 'mock');
}

async function getRapidForex(pairs) {
  try {
    const sep = CONFIG.rapidForexUrl.includes('?') ? '&' : '?';
    const url = `${CONFIG.rapidForexUrl}${sep}pairs=${encodeURIComponent(pairs.join(','))}`;
    const data = await cached(`rapidfx:${pairs.join(',')}`, 5000, async () => fetchJson(url, {
      headers: {
        'x-rapidapi-key': CONFIG.rapidApiKey,
        'x-rapidapi-host': CONFIG.rapidApiHost
      }
    }));
    const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.rates) ? data.rates : [];
    if (!items.length) throw new Error('RapidAPI forex response kosong / format belum cocok');
    return items.map((item, i) => normalizeForex(
      item.symbol || item.pair || pairs[i],
      item.price || item.rate || item.last || item.close,
      'rapidapi',
      'live-or-delayed',
      item.updatedAt || item.time || nowIso()
    ));
  } catch (err) {
    return mockForex(pairs, `rapidapi fallback: ${err.message}`);
  }
}

function normalizeForex(pair, price, provider, source, updatedAt) {
  const p = safeSymbol(pair);
  const cleanPrice = num(price, 1);
  const pseudoOpen = cleanPrice * (1 - seededWave(p, 0.0018));
  const changePct = pseudoOpen ? ((cleanPrice - pseudoOpen) / pseudoOpen) * 100 : 0;
  return {
    type: 'forex',
    symbol: p,
    display: `${p.slice(0, 3)}/${p.slice(3, 6)}`,
    provider,
    source,
    price: cleanPrice,
    changePct,
    open: pseudoOpen,
    high: Math.max(cleanPrice, pseudoOpen) * 1.001,
    low: Math.min(cleanPrice, pseudoOpen) * 0.999,
    volume: 0,
    bid: cleanPrice * 0.99995,
    ask: cleanPrice * 1.00005,
    spreadPct: 0.01,
    updatedAt
  };
}

function seededWave(seed, amp = 1) {
  const s = Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(Date.now() / 60000);
  return Math.sin(s * 12.9898) * amp;
}

function mockCrypto(symbols, reason) {
  const base = { BTCUSDT: 105000, ETHUSDT: 3400, SOLUSDT: 155, BNBUSDT: 650, XRPUSDT: 2.3, DOGEUSDT: 0.18, ADAUSDT: 0.62, LINKUSDT: 14.5, AVAXUSDT: 28 };
  return symbols.map(symbol => {
    const b = base[symbol] || 100;
    const move = seededWave(symbol, 2.6);
    const price = b * (1 + move / 100);
    return {
      type: 'crypto', symbol, display: symbol.replace('USDT','/USDT'), provider: 'mock', source: reason,
      price, changePct: move, open: b, high: Math.max(b, price) * 1.012, low: Math.min(b, price) * 0.988,
      volume: Math.abs(seededWave(symbol + 'v', 90000000)) + 50000000,
      bid: price * 0.9998, ask: price * 1.0002, spreadPct: 0.04, count: Math.round(Math.abs(seededWave(symbol + 'c', 500000)) + 40000), updatedAt: nowIso()
    };
  });
}

function mockForex(pairs, reason) {
  const base = { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 155, AUDUSD: 0.66, USDCAD: 1.36, USDCHF: 0.89, NZDUSD: 0.61 };
  return pairs.map(pair => normalizeForex(pair, (base[pair] || 1) * (1 + seededWave(pair, 0.003)), 'mock', reason, nowIso()));
}

async function getLiveMarket(query = {}) {
  const cryptoSymbols = query.crypto ? splitEnv(query.crypto) : CONFIG.cryptoSymbols;
  const forexPairs = query.forex ? splitEnv(query.forex) : CONFIG.forexPairs;
  let [crypto, forex] = await Promise.all([getCryptoMarket(cryptoSymbols), getForexMarket(forexPairs)]);
  crypto = (crypto || []).filter(isTradableAsset);
  forex = (forex || []).filter(isTradableAsset);
  const result = {
    ok: true,
    updatedAt: nowIso(),
    providers: {
      crypto: CONFIG.cryptoProvider,
      forex: CONFIG.forexProvider,
      forexNote: CONFIG.forexProvider === 'frankfurter' ? 'daily central-bank/reference rates; not tick-by-tick broker quotes' : undefined,
      cryptoNote: CONFIG.cryptoUniverseMode !== 'manual' && !CONFIG.cryptoSymbols.length ? 'AI universe mode: scans CoinGecko market universe, then ranks best setups automatically' : 'manual symbols mode'
    },
    crypto,
    forex,
    all: [...crypto, ...forex]
  };
  try {
    result.database = await saveLiveMarketToSupabase(result);
  } catch (err) {
    result.database = { ...dbStatusBase(), saved: false, error: err.message };
  }
  return result;
}

function isTradableAsset(a) {
  return !!(a && a.symbol && a.display && a.type && Number.isFinite(Number(a.price)) && Number(a.price) > 0);
}


function ema(values, period) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (!arr.length) return 0;
  const k = 2 / (period + 1);
  let out = arr[0];
  for (let i = 1; i < arr.length; i++) out = arr[i] * k + out * (1 - k);
  return out;
}

function stochasticK(values, lookback = 14) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(-lookback);
  if (arr.length < 3) return 50;
  const high = Math.max(...arr);
  const low = Math.min(...arr);
  const close = arr.at(-1);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) return 50;
  return Math.max(0, Math.min(100, ((close - low) / (high - low)) * 100));
}

function fibLevels(values) {
  const arr = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(-80);
  if (arr.length < 4) return null;
  const high = Math.max(...arr);
  const low = Math.min(...arr);
  const range = high - low;
  if (!range) return null;
  return {
    high,
    low,
    fib382: high - range * 0.382,
    fib50: high - range * 0.5,
    fib618: high - range * 0.618
  };
}

function buildTechnicalSnapshot(a) {
  const closeSeries = Array.isArray(a.chart) && a.chart.length > 6
    ? a.chart.map(Number).filter(v => Number.isFinite(v) && v > 0)
    : buildFallbackChart(a.price, a.open, a.high, a.low, a.changePct, a.symbol);
  const close = closeSeries.at(-1) || num(a.price);
  const e9 = ema(closeSeries, 9);
  const e21 = ema(closeSeries, 21);
  const e50 = ema(closeSeries, 50);
  const stoch = stochasticK(closeSeries, 14);
  const fib = fibLevels(closeSeries) || {};
  let trend = 'sideways';
  if (e9 > e21 && e21 >= e50) trend = 'bullish';
  else if (e9 < e21 && e21 <= e50) trend = 'bearish';
  let stochZone = 'netral';
  if (stoch >= 80) stochZone = 'overbought';
  else if (stoch <= 20) stochZone = 'oversold';
  const nearestFib = fib.fib382 && close > fib.fib382 ? 'di atas Fib 0.382' : fib.fib618 && close < fib.fib618 ? 'di bawah Fib 0.618' : 'area Fib tengah';
  return cleanPayload({
    trend,
    ema9: round(e9, close > 1000 ? 2 : 6),
    ema21: round(e21, close > 1000 ? 2 : 6),
    ema50: round(e50, close > 1000 ? 2 : 6),
    stochasticK: round(stoch, 1),
    stochasticZone: stochZone,
    fibHigh: fib.high ? round(fib.high, close > 1000 ? 2 : 6) : null,
    fibLow: fib.low ? round(fib.low, close > 1000 ? 2 : 6) : null,
    fib382: fib.fib382 ? round(fib.fib382, close > 1000 ? 2 : 6) : null,
    fib50: fib.fib50 ? round(fib.fib50, close > 1000 ? 2 : 6) : null,
    fib618: fib.fib618 ? round(fib.fib618, close > 1000 ? 2 : 6) : null,
    nearestFib,
    summary: `EMA9 ${e9 >= e21 ? 'di atas' : 'di bawah'} EMA21, stochastic ${round(stoch, 1)} (${stochZone}), harga ${nearestFib}.`
  });
}

function buildFundamentalSnapshot(a) {
  if (a.type !== 'crypto') return { summary: 'Forex memakai reference rate; fundamental perlu dilihat dari data makro USD, inflasi, FOMC, dan risk sentiment.' };
  const base = String(a.symbol || '').replace(/USDT$/, '');
  const rank = a.rank ? `rank #${a.rank}` : 'rank belum tersedia';
  const volumeM = Math.round((a.volume || 0) / 1000000);
  const liquidity = (a.volume || 0) >= 1000000000 ? 'sangat likuid' : (a.volume || 0) >= 100000000 ? 'likuid' : 'cukup likuid';
  const institutional = ['BTC','ETH'].includes(base) ? 'sensitif terhadap ETF, institusi besar, inflow/outflow, dan berita seperti BlackRock/Fidelity.' : 'lebih sensitif terhadap narasi proyek, unlock token, listing exchange, whale flow, dan market risk appetite.';
  return cleanPayload({
    rank: a.rank || null,
    volume24hUsd: a.volume || null,
    liquidity,
    institutionalSensitivity: institutional,
    summary: `${base}: ${rank}, volume 24h sekitar $${volumeM}M, likuiditas ${liquidity}. ${institutional}`
  });
}

function scoreAsset(a) {
  const oneHour = num(a.change1h);
  const sevenDay = num(a.change7d);
  const rankBonus = a.rank ? Math.max(0, Math.min(12, (80 - Math.min(a.rank, 80)) / 80 * 12)) : 4;
  const changePct = num(a.changePct);
  const momentum = Math.max(0, Math.min(100, 50 + changePct * (a.type === 'crypto' ? 7.5 : 55) + oneHour * 5 + Math.sign(sevenDay) * Math.min(Math.abs(sevenDay), 12) * 0.6));
  const volatility = a.open ? Math.abs((a.high - a.low) / a.open) * 100 : 0;
  const volatilityScore = Math.max(0, Math.min(100, 80 - Math.max(0, volatility - (a.type === 'crypto' ? 8 : 0.8)) * 5));
  const liquidityScore = a.type === 'crypto' ? Math.max(35, Math.min(100, Math.log10(Math.max(a.volume, 1)) * 9 + rankBonus)) : 65;
  const spreadScore = Math.max(0, Math.min(100, 100 - Math.abs(a.spreadPct || 0) * 120));
  const trendConsistency = a.type === 'crypto' ? Math.max(0, Math.min(100, 50 + Math.sign(changePct || 0) * Math.sign(oneHour || changePct || 0) * 18 + Math.sign(changePct || 0) * Math.sign(sevenDay || changePct || 0) * 10)) : 60;
  const aiScore = round(momentum * 0.34 + liquidityScore * 0.20 + volatilityScore * 0.18 + spreadScore * 0.14 + trendConsistency * 0.14, 1);
  const direction = decideDirection(a, aiScore);
  const action = direction === 'LONG' ? 'BUY' : direction === 'SHORT' ? 'SELL' : 'WAIT';
  const timeframe = decideTimeframe(a, aiScore, action);
  let status = 'RADAR';
  if (action === 'BUY' && aiScore >= 74) status = 'BUY ZONE';
  else if (action === 'SELL' && aiScore >= 74) status = 'SELL ZONE';
  else if (aiScore >= 62) status = 'WATCHLIST';
  else status = 'WAIT';
  const riskPct = a.type === 'crypto' ? (timeframe === 'SCALPING' ? 1.2 : timeframe === 'INTRADAY' ? 2.2 : timeframe === 'SWING' ? 4.5 : 7.5) : 0.45;
  const rewardPct = a.type === 'crypto' ? riskPct * (timeframe === 'SCALPING' ? 1.4 : timeframe === 'INTRADAY' ? 1.8 : 2.2) : 0.9;
  const entry = a.price;
  const stopLoss = action === 'SELL' ? entry * (1 + riskPct / 100) : entry * (1 - riskPct / 100);
  const takeProfit = action === 'SELL' ? entry * (1 - rewardPct / 100) : entry * (1 + rewardPct / 100);
  const technical = buildTechnicalSnapshot(a);
  const fundamental = buildFundamentalSnapshot(a);
  const rationale = buildRationale(a, aiScore, action, status, timeframe, technical, fundamental);
  return {
    ...a,
    aiScore,
    direction,
    action,
    signalAction: action,
    status,
    entry,
    stopLoss,
    takeProfit,
    riskPct,
    rewardPct,
    rationale,
    technical,
    fundamental,
    horizon: timeframe,
    timeframe,
    validFor: validForText(a, timeframe),
    chart: Array.isArray(a.chart) && a.chart.length > 1 ? a.chart : buildFallbackChart(a.price, a.open, a.high, a.low, changePct, a.symbol)
  };
}

function decideDirection(a, score) {
  const changePct = num(a.changePct);
  const oneHour = num(a.change1h);
  const sevenDay = num(a.change7d);
  if (a.type === 'forex') {
    if (changePct > 0.08) return 'LONG';
    if (changePct < -0.08) return 'SHORT';
    return 'WATCH';
  }
  const bullish = changePct > 0.45 && oneHour > -0.6 && sevenDay > -12;
  const bearish = changePct < -0.65 && oneHour < 0.5;
  if (bullish || (score >= 78 && changePct > 0.15 && sevenDay > 0)) return 'LONG';
  if (bearish || (score >= 78 && changePct < -0.25 && sevenDay < 0)) return 'SHORT';
  return 'WATCH';
}

function decideTimeframe(a, score, action) {
  if (a.type === 'forex') return 'DAILY BIAS';
  const changeAbs = Math.abs(num(a.changePct));
  const oneHourAbs = Math.abs(num(a.change1h));
  const sevenDayAbs = Math.abs(num(a.change7d));
  if (action === 'WAIT') return score >= 70 ? 'WATCHLIST' : 'NO TRADE';
  if (oneHourAbs >= 1.2 || changeAbs >= 4.5) return 'SCALPING';
  if (changeAbs >= 1 || score >= 76) return 'INTRADAY';
  if (sevenDayAbs >= 5) return 'SWING';
  return 'INTRADAY';
}

function validForText(a, timeframe) {
  if (a.type === 'forex') return '1 hari referensi';
  if (timeframe === 'SCALPING') return '15–45 menit';
  if (timeframe === 'INTRADAY') return '1–6 jam';
  if (timeframe === 'SWING') return '2–7 hari';
  if (timeframe === 'LONG TERM') return '1–3 bulan';
  return 'Tunggu konfirmasi';
}

function buildRationale(a, score, action, status, timeframe, technical = {}, fundamental = {}) {
  const lines = [];
  const move = `${a.changePct >= 0 ? '+' : ''}${pct(a.changePct)}`;
  lines.push(`${action} · ${timeframe} · ${a.display} bergerak ${move}.`);
  if (a.type === 'crypto') {
    lines.push(`Teknikal: ${technical.summary || 'EMA, stochastic, dan Fibonacci dibaca dari chart 24H.'}`);
    lines.push(`Fundamental: ${fundamental.summary || `Volume 24h $${Math.round((a.volume || 0) / 1000000)}M, 1h ${pct(a.change1h || 0)}, 7d ${pct(a.change7d || 0)}.`}`);
  } else {
    lines.push(`Teknikal: ${technical.summary || 'EMA/stochastic memakai chart reference.'}`);
    lines.push(`Fundamental: ${fundamental.summary || 'Forex dipengaruhi USD, suku bunga, inflasi, dan risk sentiment.'}`);
  }
  if (action === 'BUY') lines.push(`Plan: cari entry dekat area sekarang/pullback sehat, stop loss di bawah area invalidasi, target mengikuti TP.`);
  if (action === 'SELL') lines.push(`Plan: hindari long; peluang sell/short hanya untuk user yang paham risiko dan wajib pakai stop loss.`);
  if (action === 'WAIT') lines.push(`Plan: belum ada buy/sell jelas. Tunggu breakout, pullback sehat, atau konfirmasi indikator.`);
  lines.push(`Score ${score}; status ${status}.`);
  return lines;
}

function buildFallbackChart(price, open, high, low, changePct, seed = '') {
  const p = num(price);
  if (!p) return [];
  const o = num(open, p / (1 + num(changePct) / 100));
  const h = num(high, Math.max(o, p) * 1.006);
  const l = num(low, Math.min(o, p) * 0.994);
  const arr = [];
  const n = 42;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wave = seededWave(`${seed}:${i}`, 0.012) + Math.sin(i / 4) * 0.004;
    let v = o + (p - o) * t + p * wave;
    v = Math.max(l * 0.995, Math.min(h * 1.005, v));
    arr.push(round(v, p > 100 ? 2 : 6));
  }
  arr[0] = round(o, p > 100 ? 2 : 6);
  arr[arr.length - 1] = round(p, p > 100 ? 2 : 6);
  return arr;
}

async function getScan(query = {}) {
  const market = await getLiveMarket(query);
  const force = String(query.force || '').toLowerCase() === 'true' || String(query.rescan || '').toLowerCase() === 'true';

  if (!force) {
    try {
      const stable = await getStableSignalsFromSupabase(market);
      if (stable.usable) {
        const scan = buildScanPayload(market, stable.signals, 'supabase-stable');
        scan.database = stable.database;
        scan.stability.reason = stable.reason;
        return scan;
      }
    } catch (err) {
      // If Supabase read fails, continue with fresh scan so the site still loads.
    }
  }

  const scored = market.all.filter(isTradableAsset).map(scoreAsset).sort((a, b) => b.aiScore - a.aiScore);
  const cryptoTop = scored.filter(a => a.type === 'crypto').slice(0, CONFIG.cryptoSignalLimit || 24);
  const forexTop = scored.filter(a => a.type === 'forex');
  const signals = [...cryptoTop, ...forexTop].sort((a, b) => b.aiScore - a.aiScore).map(s => ({ ...s, lockedAt: nowIso() }));
  const scan = buildScanPayload(market, signals, force ? 'manual-force-rescan' : 'fresh-scan');
  try {
    scan.database = await saveScanToSupabase(scan);
  } catch (err) {
    scan.database = { ...dbStatusBase(), saved: false, error: err.message };
  }
  return scan;
}

async function getChart(query = {}) {
  const symbol = safeSymbol(query.symbol || '');
  const type = String(query.type || query.assetType || 'crypto').toLowerCase();
  const days = Math.max(1, Math.min(Number(query.days || CONFIG.chartDays || 1), 30));
  if (!symbol) return { ok: false, error: 'symbol required', points: [], candles: [] };

  // Chart data must come from a real public chart endpoint first.
  // v38: prefer high-density real chart data so the chart fills the card and does not look half-empty.
  // 1) Yahoo chart (5m candles, many bars) when available
  // 2) CoinGecko market_chart converted to candles
  // 3) CoinGecko OHLC candlestick endpoint
  // 4) Last fallback: live-market series so the UI never breaks
  if (type === 'crypto') {
    const id = String(query.id || query.coinId || COINGECKO_IDS[symbol] || '').trim();

    try {
      const yahoo = await getYahooChart(symbol, type, days);
      if (yahoo.candles.length >= 12) return { ...yahoo, provider: 'yahoo-real-chart' };
    } catch (err) {}

    if (id) {
      try {
        const headers = CONFIG.coingeckoApiKey ? { 'x-cg-demo-api-key': CONFIG.coingeckoApiKey } : {};
        const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&precision=full`;
        const data = await cached(`chart:coingecko:market:${id}:${days}:v38`, 60 * 1000, async () => fetchJson(url, { headers }, 10000));
        const raw = Array.isArray(data?.prices) ? data.prices : [];
        const points = normalizeChartPoints(raw.map(([time, price]) => ({ time, price })));
        if (points.length >= 10) {
          return {
            ok: true,
            symbol,
            id,
            type,
            provider: 'coingecko-real-chart',
            chartType: 'market-data',
            days,
            points,
            candles: candlesFromChartPoints(points),
            price: points.at(-1)?.price
          };
        }
      } catch (err) {}

      try {
        const cgOhlc = await getCoinGeckoOhlcChart(id, symbol, type, days);
        if (cgOhlc.candles.length >= 4) return cgOhlc;
      } catch (err) {}
    }
  }

  if (type === 'forex') {
    try {
      const yahoo = await getYahooChart(symbol, type, days);
      if (yahoo.points.length >= 10) return yahoo;
    } catch (err) {}
  }

  try {
    const market = await getLiveMarket({});
    const found = (market.all || []).find(a => a.symbol === symbol);
    const series = Array.isArray(found?.chart) ? found.chart : [];
    const points = normalizeChartPoints(series.map((price, i) => ({ time: Date.now() - (series.length - i) * 15 * 60 * 1000, price })));
    return {
      ok: points.length > 1,
      symbol,
      type,
      provider: found?.provider ? `${found.provider}-fallback` : 'fallback',
      chartType: 'fallback',
      days,
      points,
      candles: candlesFromChartPoints(points),
      price: found?.price || points.at(-1)?.price || null
    };
  } catch (err) {
    return { ok: false, symbol, type, provider: 'fallback', chartType: 'line', error: err.message, points: [], candles: [] };
  }
}

async function getCoinGeckoOhlcChart(id, symbol, type, days) {
  const headers = CONFIG.coingeckoApiKey ? { 'x-cg-demo-api-key': CONFIG.coingeckoApiKey } : {};
  const allowedDays = [1, 7, 14, 30];
  const d = allowedDays.reduce((best, cur) => Math.abs(cur - days) < Math.abs(best - days) ? cur : best, allowedDays[0]);
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${d}`;
  const data = await cached(`chart:coingecko:ohlc:${id}:${d}:v36`, 60 * 1000, async () => fetchJson(url, { headers }, 10000));
  const candles = normalizeOhlcCandles(Array.isArray(data) ? data : []);
  const points = candles.map(c => ({ time: c.time, price: c.close }));
  if (!candles.length) throw new Error('CoinGecko OHLC kosong');
  return {
    ok: true,
    symbol,
    id,
    type,
    provider: 'coingecko-ohlc',
    chartType: 'candlestick',
    days: d,
    points,
    candles,
    price: points.at(-1)?.price
  };
}

function yahooSymbol(symbol, type) {
  if (type === 'forex') {
    if (/^[A-Z]{6}$/.test(symbol)) return `${symbol}=X`;
    return `${symbol}=X`;
  }
  const base = symbol.replace(/USDT$/, '').replace(/USD$/, '');
  return `${base}-USD`;
}

async function getYahooChart(symbol, type, days) {
  const ySymbol = yahooSymbol(symbol, type);
  const range = days <= 1 ? '1d' : `${days}d`;
  const interval = type === 'forex' ? '5m' : '5m';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const data = await cached(`chart:yahoo:${ySymbol}:${range}:${interval}:v32`, 45 * 1000, async () => fetchJson(url, {}, 10000));
  const result = data?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const candles = timestamps.map((t, i) => ({
    time: Number(t) * 1000,
    open: num(opens[i]),
    high: num(highs[i]),
    low: num(lows[i]),
    close: num(closes[i])
  })).filter(c => c.time && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 && c.high >= c.low);
  const cleanCandles = normalizeOhlcCandles(candles.map(c => [c.time, c.open, c.high, c.low, c.close]));
  const points = cleanCandles.map(c => ({ time: c.time, price: c.close }));
  if (!points.length) throw new Error('Yahoo chart kosong');
  return {
    ok: true,
    symbol,
    yahooSymbol: ySymbol,
    type,
    provider: 'yahoo-chart',
    chartType: 'candlestick',
    days,
    points,
    candles: cleanCandles,
    price: points.at(-1)?.price
  };
}

function candlesFromChartPoints(points) {
  const src = normalizeChartPoints(points || []);
  if (src.length < 2) return [];
  const maxCandles = 72;
  const bucketSize = Math.max(1, Math.ceil(src.length / maxCandles));
  const out = [];
  for (let i = 0; i < src.length; i += bucketSize) {
    const chunk = src.slice(i, i + bucketSize);
    if (!chunk.length) continue;
    const prices = chunk.map(p => Number(p.price)).filter(v => Number.isFinite(v) && v > 0);
    if (!prices.length) continue;
    const open = prices[0];
    const close = prices.at(-1);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    out.push({ time: chunk[0].time, open, high, low, close });
  }
  return out.slice(-maxCandles);
}

function normalizeOhlcCandles(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  const candles = rows
    .map(r => ({
      time: num(r?.[0]),
      open: num(r?.[1]),
      high: num(r?.[2]),
      low: num(r?.[3]),
      close: num(r?.[4])
    }))
    .filter(c => c.time && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 && c.high >= c.low);
  if (candles.length <= 2) return candles;
  const prices = candles.flatMap(c => [c.open, c.high, c.low, c.close]).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)] || prices[0];
  const cleaned = candles.filter(c => c.high < median * 2.8 && c.low > median * 0.35);
  const source = cleaned.length >= Math.max(4, candles.length * 0.75) ? cleaned : candles;
  const maxCandles = 80;
  if (source.length <= maxCandles) return source;
  const step = Math.ceil(source.length / maxCandles);
  return source.filter((_, i) => i % step === 0 || i === source.length - 1).slice(-maxCandles);
}

function normalizeChartPoints(points) {
  const arr = (points || [])
    .map(p => ({ time: num(p.time), price: num(p.price) }))
    .filter(p => p.time && p.price > 0);
  if (arr.length <= 2) return arr;
  const prices = arr.map(p => p.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)] || prices[0];
  // remove extreme API spikes/bad ticks so charts do not collapse visually
  const cleaned = arr.filter(p => p.price > median * 0.35 && p.price < median * 2.8);
  const source = cleaned.length >= Math.max(6, arr.length * 0.75) ? cleaned : arr;
  const maxPoints = 96;
  if (source.length <= maxPoints) return source;
  const step = Math.ceil(source.length / maxPoints);
  return source.filter((_, i) => i % step === 0 || i === source.length - 1).slice(-maxPoints);
}

async function getProvidersHealth() {
  const health = { ok: true, checkedAt: nowIso(), providers: {}, database: await getDbHealth() };
  try {
    const crypto = await getCryptoMarket([]);
    health.providers.crypto = { ok: !!crypto[0] && crypto[0].provider !== 'mock', mode: CONFIG.cryptoProvider, universeMode: CONFIG.cryptoUniverseMode, universeCount: crypto.length, sample: crypto[0]?.display, source: crypto[0]?.source, actualProvider: crypto[0]?.provider };
  } catch (e) { health.providers.crypto = { ok: false, error: e.message }; }
  try {
    const forex = await getForexMarket(['EURUSD']);
    health.providers.forex = { ok: !!forex[0], mode: CONFIG.forexProvider, sample: forex[0]?.display, source: forex[0]?.source };
  } catch (e) { health.providers.forex = { ok: false, error: e.message }; }
  return health;
}

module.exports = {
  CONFIG,
  getLiveMarket,
  getScan,
  getProvidersHealth,
  getDbHealth,
  getStoredSignals,
  getCryptoNews,
  getMarketInsight,
  getChart
};
