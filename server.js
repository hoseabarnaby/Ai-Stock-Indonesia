const http = require('http');
const { handleRequest } = require('./server/http');

const port = Number(process.env.PORT || 5173);
const server = http.createServer((req, res) => handleRequest(req, res));
server.listen(port, () => {
  console.log(`AstraQuant CryptoFX running at http://localhost:${port}`);
});
