# Backend services for airmash.online

Path|Description
---|---
dehydrated|Let's Encrypt automated certificate renewal
nginx|Nginx configuration
servers|Services running on https://data.airmash.online and https://login.airmash.online
scripts|Various scripts for automation and testing

## Endpoints

Service|Path|Host|Server|Used by
---|---|---|---|---
Error telemetry|/clienterror|data.airmash.online|[clienterror.js](servers/clienterror.js)|Frontend
Usage telemetry|/enter|data.airmash.online|[enter.js](servers/enter.js)|Frontend
Game server directory|/games|data.airmash.online|[games.js](servers/games.js)|Frontend
User login|/login, /login/callback|login.airmash.online|[login-client.js](servers/login-client.js)|Frontend
User settings|/settings|data.airmash.online|[settings.js](servers/settings.js)|Frontend
Public key|/key|login.airmash.online|[login-key.js](servers/login-key.js)|Game servers
