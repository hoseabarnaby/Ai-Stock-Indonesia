const { handleRequest } = require('../server/http');
module.exports = async function handler(req, res) {
  req.url = '/api/chart' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  return handleRequest(req, res);
};
