
function main() {
  var env = process.env.NODE_ENV || 'development';
  var iarg = 2
  var args = process.argv
  var cmds = []
  const usage = `node ${args[1]} [-h|--help] [--image-type [beaker|jupyter|creedo|remotevis]] [webserver|watcher]
  `
  console.log(`Started with arguments ${JSON.stringify(args)}`)
  var imageType = undefined
  while (iarg < args.length) {
    var arg = args[iarg]
    iarg += 1
    if (arg == '-h' || arg == '--help') {
      console.log(usage)
      return;
    } else if (arg == "--image-type") {
      if (iarg >= args.length) {
	console.log(`Expected image type after --image-type, ${usage}`)
        return;
      }
      imageType = args[iarg]
      iarg += 1
    } else if (arg == "webserver") {
      cmds.push("webserver")
    } else if (arg == "apiserver") {
      cmds.push("apiserver")
    } else if (arg == "watcher") {
      cmds.push("watcher")
    } else {
      throw new Error(`unknown command line argument '${arg}'.\n${usage}`)
    }
  }
  if (imageType)
    process.env["NODE_APP_INSTANCE"] = imageType;
  const config = require('config')
  console.log('Using configuration', config.util.getEnv('NODE_ENV'), 'for instance',process.env["NODE_APP_INSTANCE"], JSON.stringify(config, null, 2));  
  if (config.app.catchErrors) {
    process.on('uncaughtException', (err) => {
      console.log("#ERROR# UncaughtException: " + err)
    })
  }
  const watcherRequired = cmds.includes("watcher")
  const webserverRequired = cmds.includes("webserver")
  const apiserverRequired = cmds.includes("apiserver")
  var models
  if (watcherRequired || apiserverRequired) {
    const mongoose = require('mongoose');
    mongoose.connect(config.mongoDb.url);
    models = require('./app/models')(mongoose, config);
  }
  if (cmds.includes("watcher")) {
    const fileWatcher = require('./app/filesWatcher')(config, models);
  }
  if (cmds.includes("webserver") || cmds.includes("apiserver")) {
    const webServer = require('./app/webserver')(config, models, cmds);
  }
  if (cmds.length == 0) {
    console.log(`missin command:\n${usage}`)
  }
}

main();
