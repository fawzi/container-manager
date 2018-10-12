const config = require('config')
const stringify = require('json-stringify-safe');
const fs = require('fs');
const components = require('./components');
const k8D = require('./k8-data');
const logger = require('./logger')
  
  var ProxyRouter = function(options) {
    if (!options.backend) {
      throw "ProxyRouter backend required. Please provide options.backend parameter!";
    }
    this.client    = options.backend;
  }
;
// The decision could be made using the state machine instead of the
ProxyRouter.prototype.lookup = function(req, res, userID, isWebsocket, path, next) {
  var start = Date.now()
  components.cachedReplacements(req, function(err, repl) {
    //logger.debug(`replacements available after ${(Date.now()-start)/1000.0}s`)
    if (err) {
      logger.error(`no replacements for ${userID} in %{path}`)
      res.send(500, components.getHtmlErrorTemplate({
        error:"No replacements",
        msg: `lookup without visiting the entry point ${config.k8component.entryPoint.path} (${stringify(err)})`
      }))
    } else {
      k8D.resolvePod(repl, function (err, target) {
        //logger.debug(`target available after ${(Date.now()-start)/1000.0}s, err: ${stringify(err)} target: ${stringify(target)}`)
        if (err) {
          if ((err.error === 'no ip' || err.error === 'not ready') &&
              err.status && (err.status.phase === 'Pending' || err.status.phase === 'Running')) {
            let error_detail = ''
            if (!err.secondsSinceCreation || err.secondsSinceCreation > 15)
              error_detail = stringify(err, null, 2)
            let repl = {
              refreshEachS: config.app.pageReloadTime,
              error_detail: error_detail
            }
            components.evalHtmlTemplate(
              'reloadMsg.html', repl,
              function(err, pageHtml) {
                if (res && res.send)
                  res.send(pageHtml)
              })
            return;
          } else if (err.error === 'too many containers') {
            components.evalHtmlTemplate("maxContainers.html", {
              pods: pods
            }, function(err, errorHtml) {
              repl.status(503).send(errorHtml)
            })
          } else {
            logger.error(`error starting container ${repl.podName}: ${stringify(err)}`)
            let errorHtml = components.getHtmlErrorTemplate(err, "Error starting container")
            if (res && res.status && res.send)
              res.status(500).send(errorHtml)
          }
        } else {
          next(target);
        }
      })
    }
  })
}

module.exports = ProxyRouter
