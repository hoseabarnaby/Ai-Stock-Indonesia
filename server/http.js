const fs = require('fs');
const path = require('path');
const { CONFIG, getLiveMarket, getScan, getProvidersHealth, getDbHealth, getStoredSignals, getCryptoNews, getMarketInsight, getChart } = require('./core');

const publicDir = path.join(process.cwd(), 'public');

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.end(text);
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return Object.fromEntries(u.searchParams.entries());
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' })[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, 'Forbidden');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.statusCode = 200;
    res.setHeader('content-type', contentType(filePath));
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  const indexPath = path.join(publicDir, 'index.html');
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  fs.createReadStream(indexPath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '');
  const query = parseQuery(req.url);
  try {
    if (pathname === '/api/health') return sendJson(res, 200, {
      ok: true,
      app: CONFIG.appName,
      mode: 'crypto-fx',
      cryptoProvider: CONFIG.cryptoProvider,
      forexProvider: CONFIG.forexProvider,
      livePricePollSeconds: CONFIG.livePricePollSeconds,
      validatePollSeconds: CONFIG.validatePollSeconds,
      aiProvider: CONFIG.aiProvider,
      publicSafety: CONFIG.publicSafety,
      database: {
        enabled: CONFIG.supabaseEnabled,
        configured: !!(CONFIG.supabaseUrl && CONFIG.supabaseServiceRoleKey),
        localStorage: false,
        localJsonDb: false
      },
      updatedAt: new Date().toISOString()
    });
    if (pathname === '/api/config') return sendJson(res, 200, {
      appName: CONFIG.appName,
      livePricePollSeconds: CONFIG.livePricePollSeconds,
      validatePollSeconds: CONFIG.validatePollSeconds,
      cryptoSymbols: CONFIG.cryptoSymbols,
      cryptoUniverseMode: CONFIG.cryptoUniverseMode,
      cryptoUniverseLimit: CONFIG.cryptoUniverseLimit,
      cryptoSignalLimit: CONFIG.cryptoSignalLimit,
      forexPairs: CONFIG.forexPairs,
      chartProvider: CONFIG.chartProvider,
      chartDays: CONFIG.chartDays
    });
    if (pathname === '/api/live-market') return sendJson(res, 200, await getLiveMarket(query));
    if (pathname === '/api/scan') return sendJson(res, 200, await getScan(query));
    if (pathname === '/api/providers-health') return sendJson(res, 200, await getProvidersHealth());
    if (pathname === '/api/crypto-news') return sendJson(res, 200, await getCryptoNews());
    if (pathname === '/api/market-insight') return sendJson(res, 200, await getMarketInsight(query));
    if (pathname === '/api/chart') return sendJson(res, 200, await getChart(query));
    if (pathname === '/api/db-health') return sendJson(res, 200, await getDbHealth());
    if (pathname === '/api/stored-signals') return sendJson(res, 200, await getStoredSignals(query.limit || 50));
    if (pathname === '/api/supabase-test') {
      const health = await getDbHealth();
      return sendJson(res, health.ok ? 200 : 500, health);
    }
    return sendJson(res, 404, { ok: false, error: 'API route not found' });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack });
  }
}

async function handleRequest(req, res) {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
}

module.exports = { handleRequest };
