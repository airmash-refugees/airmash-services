const http = require('http');

const hostname = 'localhost';
const port = 3333;

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
	var fs = require('fs')
	fs.appendFile('enter.log', (new Date().toISOString()) + ' ' + req.headers['x-real-ip'] + ' ' + body + '\n', function (err) {
          if (err) { console.log("error writing to log"); }
        });
    });
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end('{"result":1}');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
