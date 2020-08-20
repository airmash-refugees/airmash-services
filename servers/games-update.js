const log = require('./common/logger');
const paths = require('./common/paths');
const path = require('path');
const fs = require('fs');
const https = require('https');

/*
 * Paths
 */
const regionsPath = path.resolve(paths.data, 'regions.txt')
const gamesPath = path.resolve(paths.data, 'games.txt')
const gamesTestPath = path.resolve(paths.data, 'games-test.txt')

const gamesJsonPath = path.resolve(paths.data, 'games.json')
const gamesTestJsonPath = path.resolve(paths.data, 'games-test.json')

/*
 * Read pipe-delimited file
 */
var readPipeDelimitedFile = function(path, expectedFieldCount, callback) {
    const data = fs.readFileSync(path).toString();
    const lines = data.split(/\r?\n/);
    lines.forEach((line) => {
        if (line != "" && line[0] != "#") {
            log('info', 'record', JSON.stringify(line));
            fields = line.split('|');
            if (fields.length >= expectedFieldCount) {
                callback(fields);
            }
            else {
                log('warning', 'incomplete record in file', JSON.stringify(line));
            }
        }
    });
}
/*
 * Read games data and convert to object
 */
var readGames = function(regionsPath, gamesPath, gamesTestPath) {
    let games = [];
    let gamesTest = [];
    let regions = {};
    let regionsTest = {};

    /*
     * Regions
     */
    log('info', 'reading regions file');
    try {
        readPipeDelimitedFile(regionsPath, 2, function(fields) {
            const [id, name] = fields;

            let region = {name: name, id: id, games: []};
            regions[id] = region;
            games.push(region);

            let regionTest = {name: name, id: id, games: []};
            regionsTest[id] = regionTest;
            gamesTest.push(regionTest);
        });
    } catch(e) {
        log('error', 'could not read regions file', e);
        return undefined;
    }

    /*
     * Games
     */
    log('info', 'reading games file');
    try {
        readPipeDelimitedFile(gamesPath, 7, function(fields) {
            const [region, type, id, name, nameShort, host, path] = fields;
            let room = {type: type, id: id, name: name, nameShort: nameShort, host: host, path: path};
            if (regions[region]) {
                regions[region].games.push(room);
                regionsTest[region].games.push(room);
            }
            else {
                log('warning', 'unknown region in games file', JSON.stringify(region));
            }               
        });
    } catch(e) {
        log('error', 'could not read games file', e);
        return undefined;
    }

    /*
     * Additional games for test.airmash.online
     */
    log('info', 'reading games-test file');
    try {
        readPipeDelimitedFile(gamesTestPath, 7, function(fields) {
            const [region, type, id, name, nameShort, host, path] = fields;
            let room = {type: type, id: id, name: name, nameShort: nameShort, host: host, path: path};
            if (regionsTest[region]) {
                regionsTest[region].games.push(room);
            }
            else {
                log('warning', 'unknown region in games-test file', JSON.stringify(region));
            }               
        });
    } catch(e) {
        log('error', 'could not read games-test file', e);
        return undefined;
    }

    return [games, gamesTest];
}

/*
 * All connections
 */
let connections = [];

/*
 * Returns true if all game server requests have been completed (updated data or timed out)
 */
var checkAllRequests = function() {
    let allCompleted = true;
    for (const connection of connections) {
        allCompleted &= connection.completed;
    }
    
    if (allCompleted) {
        log('info', 'update all servers', 'completed');

        log('info', 'writing games json', JSON.stringify(games));

        try {
            fs.writeFileSync(gamesJsonPath + '.tmp', JSON.stringify(games));
        } catch(ex) {
            log('error', 'writing games json', ex);
        }

        log('info', 'writing games-test json', JSON.stringify(gamesTest));

        try {
            fs.writeFileSync(gamesTestJsonPath + '.tmp', JSON.stringify(gamesTest));
        } catch(ex) {
            log('error', 'writing games-test json', ex);
        }

        try {
            fs.renameSync(gamesJsonPath + '.tmp', gamesJsonPath);
        } catch(ex) {
            log('error', 'updating current games json from temporary', ex);
        }

        try {
            fs.renameSync(gamesTestJsonPath + '.tmp', gamesTestJsonPath);
        } catch(ex) {
            log('error', 'updating current games-test json from temporary', ex);
        }

        connections = [];
    }
}

/*
 * Update our player data for an individual server via a request to https://host/path
 */
var updateServer = function(id, game) {
    const url = `https://${game.host}/${game.path}`;
    let connection = {completed: false, timeout: null, game: game};
    connections.push(connection);

    let requestFailure = function() {
      clearTimeout(connection.timeout);
      if (!connection.completed) {
        log('warning', 'connection failed', id, url);
        connection.completed = true;
        checkAllRequests();
      }
    };

    req = https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => { 
            data += chunk; 
        });
        
        res.on('end', () => {
            clearTimeout(connection.timeout);
            try {
                const json = JSON.parse(data);
                if (Number.isInteger(json.players)) {
                    game.players = json.players;
                }
                if (Number.isInteger(json.bots) && json.bots > 0) {
                    game.bots = json.bots;
                }
                log('info', 'response', id, JSON.stringify(json));
            } catch(ex) {
                log('warning', 'invalid json in response', id, JSON.stringify(data), ex);
            }
            
            connection.completed = true;
            checkAllRequests();
        });

        res.on('aborted', function() {
            log('warning', 'connection aborted', id, url);
            requestFailure();
        });
    });

    req.on('error', function() {
        log('warning', 'connection error', id, url);
        requestFailure();
    });

    connection.timeout = setTimeout(function() {
        log('warning', 'connection timed out', id, url);
        req.abort();
        requestFailure();
    }, 5000);
}

/*
 * Update our player data for all servers
 */
var updateAllServers = function() {
    log('info', 'update all servers', 'starting');
    if (connections.length > 0) {
        log('warning', 'connections from previous update not cleared', JSON.stringify(connections));
    }
    connections = [];
    [games, gamesTest] = readGames(regionsPath, gamesPath, gamesTestPath);
    for (let region of gamesTest) {
        for (let game of region.games) {
            updateServer(`${region.id}-${game.id}`, game);
        }
    }
}

/*
 * Does initial update, and a repeated update every thirty seconds
 */
var games, gamesTest;

updateAllServers();
let updateInterval = setInterval(updateAllServers, 30000);
