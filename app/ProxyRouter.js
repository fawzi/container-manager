const config = require('config')
const stringify = require('json-stringify-safe');
const http = require('http');
const fs = require('fs');
const components = require('./components');
const yaml = require('js-yaml')
const k8 = require('./kubernetes');
const logger = require('./logger')

function guaranteeDir(path, next) {
  fs.access(path, fs.constants.F_OK | fs.constants.R_OK, (err) => {
    if(err){
      fs.mkdir(path, parseInt('2775', 8), (err) => {
        if(err) throw err;
        fs.chown(path, 1000, 1000, (err) => {
          if (err)
            logger.warn('Dir '+ path + ' created, error in chown: ' + stringify(err));
          else
            logger.info('Dir correctly created:' + path);
          next();
        });
      });
    } else {
      next();
    }
  });
}

function guaranteeUserDir(userID, next) {
  //Async version needs to be tested thorougly
  guaranteeDir(config.userInfo.sharedDir + '/' + userID, function() {
    guaranteeDir(config.userInfo.privateDir + '/' + userID, function() {
      next();
    });
  });
}

/// functions that either gives the running pod or starts it
function getOrCreatePod(podName, repl, shouldCreate, next) {
  k8.ns(config.k8component.namespace).pod.get(podName, function(err, result) {
    if(err) {
      if (shouldCreate) {
        logger.debug(`creating ${podName}`)
        components.templateForImage(repl, function(err, template, repl) {
          if(err) {
            logger.error(`Cannot start pod ${podName}, error in template generation: ${stringify(err)}`);
            next(err, null)
          } else {
            guaranteeUserDir(repl.user, function (){
              const templateValue = yaml.safeLoad(template, 'utf8')
              k8.ns(config.k8component.namespace).pod.post({ body: templateValue}, function(err, res2){
                if(err) {
                  logger.error(`Cannot start pod ${podName}, error: ${stringify(err)}, \n====\ntemplate was ${template}\n====`);
                  next(err, null)
                } else {
                  logger.info(`Created pod ${podName}: ${stringify(res2)}`)
                  next(null, res2)
                }
              })
            })
          }
        });
      } else {
        logger.error(`Requested pod ${podName} which does not exist and should not be created, error: ${stringify(err)}`);
        next(err, null)
      }          
    } else {
      //logger.debug(`looked up ${podName}: ${stringify(result)}`)
      next(null, result)
    }
  });
}
  
// cache pod name -> host & port
const resolveCache = require('../safe-memory-cache/map.js')({
  limit: config.app.resolveCacheNMax,
  maxTTL: config.app.resolveCacheTtlMaxMs,
  refreshF: function(key, value, cache) {
  }
})
  
function resolvePod(repl, next) {
    const podName = components.podNameForRepl(repl)
    var v = resolveCache.get(podName)
    if (v === undefined) {
      getOrCreatePod(podName, repl, config.k8component.image.autoRestart, function (err, pod) {
        if (err) {
          next(err, null)
        } else {
          const portNr = pod.spec.containers[0].ports[0].containerPort
          const podIp = pod.status.podIP
          if (podIp) {
            var ready = false
            const conds = pod.status.conditions
            if (pod.status && conds) {
              for (icond in conds) {
                let cond = conds[icond]
                if (cond.type === 'Ready' && cond.status === 'True')
                  ready = true
              }
            }
            if (ready) {
              const res = {
                host: podIp,
                port: portNr
              }
              //logger.debug(`got ${stringify(res)} out of pod ${stringify(pod)}`)
              resolveCache.set(podName, res)
              next(null, res)
            } else {
              let secondsSinceCreation = (Date.now() - Date.parse(pod.metadata.creationTimestamp))/ 1000.0
              const err = {
                error: "not ready",
                msg: "pod not yet ready",
                status: pod.status,
                host: podIp,
                port: portNr,
                pod: pod,
                secondsSinceCreation: secondsSinceCreation
              }
              next(err, null)
            }
          } else {
            let secondsSinceCreation = (Date.now() - Date.parse(pod.metadata.creationTimestamp))/ 1000.0
            const err = {
              error: "no ip",
              msg: "ip not yet available",
              status: pod.status,
              host: podIp,
              port: portNr,
              pod: pod,
              secondsSinceCreation: secondsSinceCreation
            }
            next(err, null)
          }
        }
      })
    } else {
      next(null, v)
    }
  }

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
      resolvePod(repl, function (err, target) {
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
          } else {
            logger.error(`error starting container ${repl.podName}: ${stringify(err)}`)
            let errorHtml = components.getHtmlErrorTemplate(err, "Error starting container")
            logger.error(`errorHtml: ${stringify(errorHtml)}`)
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
