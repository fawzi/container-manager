// make Errors stringifyable....
if (!('toJSON' in Error.prototype))
Object.defineProperty(Error.prototype, 'toJSON', {
    value: function () {
        var alt = {};

        Object.getOwnPropertyNames(this).forEach(function (key) {
            alt[key] = this[key];
        }, this);

        return alt;
    },
    configurable: true,
    writable: true
});

function main() {
  var iarg = 2
  var args = process.argv
  var cmds = []
  const usage = `node ${args[1]} [-h|--help] [--image-type [beaker|jupyter|creedo|remotevis]] [webserver|watcher|apiserver]

  node ${args[1]} serviceDumper [--help <serviceListFile>...]
  node ${args[1]} templateEvaluer [--help ...]
    `
  var imageType = undefined
  if (iarg < args.length) {
    if (args[iarg] == 'serviceDumper') {
      cmds.push('serviceDumper')
      require('./app/service-dumper').serviceDumper(args.slice(iarg + 1))
      return;
    } else if (args[iarg] == 'templateEvaluer') {
      require('./app/template-evaluer').templateEvaluer(args.slice(iarg + 1))
      return;
    }
  }
  if (cmds.length == 0)
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
  const logger = require('./app/logger')
  const stringify = require('json-stringify-safe');
  logger.info(`Started with arguments ${stringify(args)}`)
  logger.info(`Using configuration ${config.util.getEnv('NODE_ENV')} for instance ${process.env["NODE_APP_INSTANCE"]} ${stringify(config, null, 2)}`);
  if (config.app.catchErrors) {
    process.on('uncaughtException', (err) => {
      logger.error(`UncaughtException: ${stringify(err)}`)
    })
  }
  if (cmds.includes('serviceDumper')) {
    require('./app/service-dumper').serviceDumper(args.slice(iarg + 1))
    return;
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
    logger.error(`missing command:\n${usage}`)
  }
}

main();
