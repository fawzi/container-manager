var env = process.env.NODE_ENV || 'development';
const config = require('config') // require('./config/config')[env];
console.log('Using configuration', config.util.getEnv('NODE_ENV'), config);

function main() {
  var iarg = 2
  var args = process.argv
  var cmds = []
  var imageType = config.k8component.imageType
  const usage = `node ${args[1]} [-h|--help] [--image-type [beaker|jupyter|creedo|remotevis]] [webserver|watcher]

  default imageType for current config = ${imageType}`
    console.log(`Started with arguments ${JSON.stringify(args)}`)
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
      throw new Error(`unknown command line argument '${arg}.\n${usage}'`)
    }
  }
  config.k8component['imageType'] = imageType
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
    const fileWatcher = require('./app/filesWatcher')(env, config, models);
  }
  if (cmds.includes("webserver") || cmds.includes("apiserver")) {
    const webServer = require('./app/webserver')(env, config, models, cmds);
  }
  if (cmds.length == 0) {
    console.log(`missin command:\n${usage}`)
  }
}

if (config.app.catchErrors) {
  process.on('uncaughtException', (err) => {
    console.log("#ERROR# UncaughtException: " + err)
  })
}

main();
