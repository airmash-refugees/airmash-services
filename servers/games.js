
var geolite2 = require('geolite2');
var maxmind = require('maxmind');

var lookup = maxmind.openSync(geolite2.paths.country); // or geolite2.paths.country or geolite2.paths.asn


const http = require('http');

const hostname = 'localhost';
const port = 2222;

const server = http.createServer((req, res) => {
  var realip = '(unknown)', country = '???', cc = 'xx';

  try {
    realip = req.headers['x-real-ip'];
    country = lookup.get(realip);
    cc = country["country"]["iso_code"];
  } catch(e) {
    console.error('error finding iso_code for ' + req.headers['x-real-ip']);
    console.error(e);
    console.log('error !! ' + realip + ' ' + country + ' ' + cc);
  }

  console.log(realip+' '+cc);
  var fs = require('fs');
  fs.readFile("/var/www/html/games", 'utf8', function(err, data) {
  if (err) {
    res.statusCode = 500;
    console.log("!! status 500 due to read error");
    console.error("cannot read /var/www/html/games!");
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
