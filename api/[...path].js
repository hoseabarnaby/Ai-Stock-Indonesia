const { handleRequest } = require('../server/http');
module.exports = async function handler(req, res) {
  return handleRequest(req, res);
};
