const fs = require('fs');
const path = require('path');

/**
 * Data and logs directory paths
 */
let dataPath, logsPath;
if (require.main) {
  dataPath = path.resolve(require.main.path, '../data');
  logsPath = path.resolve(require.main.path, '../logs');

  try { fs.mkdirSync(dataPath) } catch {};
  try { fs.mkdirSync(logsPath) } catch {};
}
else {
  dataPath = path.resolve('.');
  logsPath = path.resolve('.');
}


module.exports = {
  data: dataPath,
  logs: logsPath,
};