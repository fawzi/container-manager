var env = process.env.NODE_ENV || 'development';
const config = require('./config/config')[env];
console.log('Using configuration', config);
const mongoose = require('mongoose');
mongoose.connect(config.mongoDb.url);
const models = require('./app/models')( mongoose);

function main() {
  var iarg = 2
  var args = process.argv
  var cmds = []
  const usage = `node ${args[1]} [-h|--help] [webserver|watcher]`
  while (iarg < args.length) {
    var arg = args[iarg]
    iarg += 1
    if (arg == '-h' || arg == '--help') {
      console.log(usage)
      return;
    } else if (arg == "webserver") {
      cmds.push("webserver")
    } else if (arg == "watcher") {
      cmds.push("watcher")
    } else {
      throw new Error(`unknown command line argument '${arg}.\n${usage}'`)
    }
    if (cmds.includes("watcher")) {
      const fileWatcher = require('./app/filesWatcher')(env, config, models);
    }
    if (cmds.includes("webserver")) {
      const webServer = require('./app/webserver')(env, config, models);
    }
    if (cmds.length == 0) {
      console.log(`missin command:\n${usage}`)
    }
  }
}

/*process.on('uncaughtException', (err) => {
  console.log("#ERROR# UncaughtException: " + err)
});*/

main();
