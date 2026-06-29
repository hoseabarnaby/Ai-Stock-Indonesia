const { handleRequest } = require('../server/http');
module.exports = async function handler(req, res) {
  const query = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = '/api/stored-signals' + query;
  return handleRequest(req, res);
};
