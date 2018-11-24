
var geolite2 = require('geolite2');
var maxmind = require('maxmind');

var lookup = maxmind.openSync(geolite2.paths.country); // or geolite2.paths.country or geolite2.paths.asn


const http = require('http');

const hostname = 'localhost';
const port = 2222;

const server = http.createServer((req, res) => {
  var country = lookup.get(req.headers['x-real-ip']);
  var cc = country["country"]["iso_code"];

  console.log(req.headers['x-real-ip']+' '+cc);
  var fs = require('fs');
  fs.readFile("/var/www/html/games", 'utf8', function(err, data) {
  if (err) { 
    res.statusCode = 500;
    res.end()
  }
  else
  {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(data.replace('xx',cc.toLowerCase()));

  }
});

});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

