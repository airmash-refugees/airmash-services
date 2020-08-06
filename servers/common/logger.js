const fs = require('fs');
const path = require('path');
const paths = require('./paths');

let logPath;

if (require.main) {
  logPath = path.resolve(paths.logs, `${path.basename(require.main.filename, '.js')}.log`);  
}

function stringify(data) {
  if (data !== null && typeof(data) === 'object') {
    let obj = {};
    Object.getOwnPropertyNames(data).forEach(name => obj[name] = data[name]);
    return JSON.stringify(obj);
  }
  else {
    return JSON.stringify(data);
  }
}

module.exports = function() {
  const parts = Array.from(arguments).map(part => part instanceof Error ? stringify(part) : part);
  const msg = (new Date().toISOString()) + ' | ' + parts.join(' | ');
  if (logPath) {
    try {
      fs.appendFileSync(logPath, msg + '\n');
    } catch(err) {
      console.error(`Error writing ${stringify(msg)} to ${logPath}: ${err.stack}`);
    };
  }
  else {
    console.log(msg);
  }
}