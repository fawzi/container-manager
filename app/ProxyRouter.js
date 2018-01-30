const stringify = require('json-stringify-safe');
const http = require('http');
const fs = require('fs');
const components = require('./components');
const yaml = require('js-yaml')
const k8 = require('./kubernetes')(config);

const reloadMsg = `<html><head><title>Starting up!</title><meta http-equiv="refresh" content="${config.app.pageReloadTime}" ></head><body><h3>Please wait while we start a container for you!</h3><p>You might need to refresh manually (F5)...</body></html>`;

  function guaranteeDir(path, next) {
    fs.access(path, fs.constants.F_OK | fs.constants.R_OK, (err) => {
      if(err){
        fs.mkdir(path, parseInt('2775', 8), (err) => {
          if(err) throw err;
          fs.chown(path, 1000, 1000, (err) => {
            if (err)
              console.log('Dir '+ path + ' created, error in chown: ' + JSON.stringify(err));
            else
              console.log('Dir correctly created:' + path);
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
  function getOrCreatePod(podName, next) {
    k8.ns(config.k8component.namespace).pod.get(podName, function(err, result) {
      if(err) {
        const info = components.infoForPodName(podName)
        components.templateForImageType(info.imageType, info.user, info.shortSession, {}, function(err, template, repl) {
          if(err) {
            console.log(`#ERROR# Cannot start pod ${podName}, error in template generation: ${JSON.stringify(err)}`);
            next(err, null)
          } else {
            //fs.writeFile("pod.yaml", template)
            //console.log("wrote evaulated template to pod.yaml")
            guaranteeUserDir(info.user, function (){
              k8.ns(config.k8component.namespace).service.post({ body: yaml.safeLoad(template, 'utf8')}, function(err, res2){
                if(err) {
                  console.log(`#ERROR# Cannot start pod ${podName}, error: ${JSON.stringify(err)}`);
                  next(err, null)
                } else {
                  console.log(`Created pod ${podName}: ${JSON.stringify(res2)}`)
                  next(null, res2)
                }
              })
            })
          }
        });
      } else {
        console.log(`looked up ${podName}: ${JSON.stringify(result)}`)
        next(null, result)
      }
    });
  }
  
  // cache pod name -> host & port
  const resolveCache = require('../safe-memory-cache/map.js')({
    limit: config.resolveCacheNMax,
    maxTTL: config.resolveCacheTtlMaxMs,
    refreshF: function(key, value, cache) {
    }
  })
  
  function resolvePod(podName, next) {
    var v = resolveCache.get(podName)
    if (v === undefined) {
      getOrCreatePod(podName, function (err, pod) {
        if (err) {
          next(err, null)
        } else {
          const portInfo = pod.spec.containers[0].ports[0]
          const res = {
            host: portInfo.hostIP,
            port: portInfo.containerPort
          }
          console.log(`got ${JSON.stringify(res)} out of pod ${JSON.stringify(pod)}`)
          resolveCache.set(podName, res)
          next(null, res)
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
  };

  // The decision could be made using the state machine instead of the
  ProxyRouter.prototype.lookup = function(req, res, userID, isWebsocket, path, next) {
    console.log("Looking up the path! " + req.path)
    if (!req.session.shortSession)
      req.session.shortSession = components.shortSession(req.sessionID)
    const shortSession = req.session.shortSession
    const podName = components.podNameForImageType(config.k8component.imageType, userID, shortSession)
    resolvePod(podName, function (err, target) {
      if (err) {
        console.log(`ERROR ${JSON.stringify(err)}`)
      } else {
        console.log(`Resolved to ${stringify(target)}`)
        next(target);
      }
    })
  };

module.exports = ProxyRouter
