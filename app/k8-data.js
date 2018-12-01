const config = require('config')
const k8 = require('./kubernetes');
const stringify = require('json-stringify-safe');
const fs = require('fs');
const components = require('./components');
const yaml = require('js-yaml')
const logger = require('./logger')
const url = require('url');

// cache pod name -> host & port
const resolveCache = require('../safe-memory-cache/map.js')({
  limit: config.app.resolveCacheNMax,
  maxTTL: config.app.resolveCacheTtlMaxMs,
  refreshF: function(key, value, cache) {
  }
})

// gets pods with the given labels
// returns the raw response
function getPods(labels, next) {
  let selector = ""
  let first = true
  for (k in labels) {
    if (first)
      first = false
    else
      selector += ','
    selector += `${k}=${labels[k]}`
  }
  k8.api.v1.ns(config.k8component.namespace).pods.get({ qs: { labelSelector: selector } }).then(function(data){ next(null, data); }, function(err){ next(err, null) })
}

// gets json api formatted pods
// if details is true gives detailed information on the pod
function jsonApiPods(labels, next, {details = true}={}) {
  getPods(labels, function(err, pods) {
    if (err) {
      next(err, [])
    } else {
      let podList = pods.body.items
      if (podList)
        podList = podList.map(function(pod){
          let secondsSinceCreation = (Date.now() - Date.parse(pod.metadata.creationTimestamp))/ 1000.0
          let time = secondsSinceCreation
          let unit = "s"
          if (time > 60) {
            time = time / 60.0
            unit = "m"
            if (time > 60) {
              time = time / 60.0
              unit = "h"
              if (time > 24) {
                time = time / 24.0
                unit = "d"
              }
            }
          }
          let status = "danger"
          if (pod.metadata.deletionTimestamp) {
            status = "danger"
          } else if (pod.status && pod.status.phase === 'Pending') {
            status = "warning"
          } else if (pod.status && pod.status.phase === 'Running') {
            const conds = pod.status.conditions
            let ready = false
            if (pod.status && conds) {
              for (icond in conds) {
                let cond = conds[icond]
                if (cond.type === 'Ready' && cond.status === 'True')
                  ready = true
              }
              if (ready)
                status = "success"
              else
                status = "warning"
            }
          }

          let podInfo = {
            id: pod.metadata.name,
            type: 'pod',
            attributes: {
              name: pod.metadata.name,
              time: `${time.toFixed(1)} ${unit}`,
              status: status
            }
          }
          if (details)
            podInfo.attributes.data = pod
          return podInfo
        })
      else
        podList=[]
      next(null, podList)
    }
  })
}

/// Guarantees the existence of a directory
function guaranteeDir(path, next) {
  fs.access(path, fs.constants.F_OK | fs.constants.R_OK, (err) => {
    if (err) {
      fs.mkdir(path, parseInt('2775', 8), (err) => {
        if(err && err.code != 'EEXIST') throw err;
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

/// Guarantees the existence of user dirs for the given user
function guaranteeUserDir(userID, next) {
  //Async version needs to be tested thorougly
  guaranteeDir(config.userInfo.sharedDir + '/' + userID, function() {
    guaranteeDir(config.userInfo.privateDir + '/' + userID, function() {
      next();
    });
  });
}

/// creates a pod
function createPod(podName, repl, next) {
  if (repl.imageReStr && repl.image) {
    let re = new RegExp(repl.imageReStr)
    if (!re.exec(repl.image)) {
      let err = {
        error: 'invalid image',
        detail: `Refusing to start pod ${podName} with non acceptable image ${repl.image}`
      }
      logger.warn(err.detail)
      next(err, null)
      return;
    }
  }
  logger.info(`creating ${podName}`)
  components.templateForImage(repl, function(err, template, repl) {
    if(err) {
      logger.error(`Cannot start pod ${podName}, error in template generation: ${stringify(err)}`);
      next(err, null)
    } else {
      guaranteeUserDir(repl.user, function (){
        jsonApiPods({user:repl.user}, function(err, pods) {
          if (pods.length >= config.k8component.maxContainersPerUser) {
            next({
              error: 'too many containers',
              msg: `Reached the maximum number of running containers for ${repl.user}: ${config.k8component.maxContainersPerUser}`,
              pods: pods
            }, null)
          } else {
            const templateValue = yaml.safeLoad(template, 'utf8')
            k8.api.v1.ns(config.k8component.namespace).pod.post({ body: templateValue}).then(function(res2){
              logger.info(`Created pod ${podName}: ${stringify(res2)}`)
              next(null, res2.body)
            }, function(err) {
              logger.error(`Cannot start pod ${podName}, error: ${err.message} ${stringify(err)}, \n====\ntemplate was ${template}\n====`);
              next(err, null)
            })
          }
        })
      })
    }
  });
}

/// functions that either gives the running pod or starts it
function getOrCreatePod(podName, repl, shouldCreate, next) {
  k8.api.v1.ns(config.k8component.namespace).pod(podName).get().then(function(result) {
    if (result && result.body) {
      let pod = result.body
      if (pod.metadata && pod.metadata.deletionTimestamp) {
        let error = {
          error: 'pod shutting down',
          detail: `Pod ${podName} is shutting down, need to wait to restart`
        }
        logger.warn(error.detail)
        next(error, null)
      } else if (pod.status && ['Error', 'Failed', 'Succeeded'].includes(pod.status.phase)) {
        if (shouldCreate) {
          k8.api.v1.ns(config.k8component.namespace).pod(podName).delete().then(function (delResult) {
            logger.info(`Deleted stopped pod ${podName} to restart it`)
            createPod(podName, repl, next) // wait & return 'pod shutting down' instead?
          }, function(err) {
            let error = {
              error: 'failed deleting pod',
              detail: `Error deleting pod ${podName} while trying to restart it: ${stringify(err)}`
            }
            logger.warn(error.detail)
            next(err, null)
          });
        }
      } else {
        //logger.debug(`looked up ${podName}: ${stringify(result)}`)
        next(null, pod)
      }
    } else {
      if (shouldCreate) {
        createPod(podName, repl, next)
      } else {
        let error = {
          error: 'pod failed',
          detail: `Requested pod ${podName} which does not exist and should not be created`
        }
        logger.error(error.detail);
        next(error, null)
      }
    }
  }, function(err) {
    if (shouldCreate) {
      createPod(podName, repl, next)
    } else {
      let error = {
        error: 'pod failed',
        detail: `Requested pod ${podName} which failed but should not be created, error: ${stringify(err)}`
      }
      logger.error(error.detail);
      next(error, null)
    }
  });
}

function resolvePod(repl, next) {
  const podName = components.podNameForRepl(repl)
  var v = resolveCache.get(podName)
  if (v === undefined) {
    getOrCreatePod(podName, repl, config.k8component.image.autoRestart, function (err, reply) {
      if (err) {
        next(err, null)
      } else {
        let pod = reply
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
          if (pod.status.phase == 'Running' && ready) {
            const res = {
              host: podIp,
              port: portNr
            }
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

function guaranteeResolvePod(repl, res, next){
  resolvePod(repl, function (err, target) {
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



function deletePod(podName, next) {
  k8.api.v1.ns(config.k8component.namespace).pod(podName).delete().then(function (result) {
    resolveCache.set(podName, undefined)
    logger.info(`deleted pod ${podName}`)
    next(null, result.body)
  }, function(err) {
    logger.warn(`Error deleting pod ${podName}: ${stringify(err)}`)
    next(err, null)
  })
}

// returns info about services indexed by service
function getServiceInfo(namespace, next, {details = false} = {}) {
  k8.api.v1.ns(namespace).services.get({}).then(function(res) {
    let services = {}
    let master = config.k8Api.url
    let masterHostname = new url.URL(master).hostname
    let node = config.k8Api.node
    let frontendUrl = config.app.frontendUrl
    let frontendHostname = new url.URL(frontendUrl).hostname
    let frontendProtocol = new url.URL(frontendUrl).protocol
    if (res.body && res.body.items)
      for (let is in res.body.items) {
        let s = res.body.items[is]
        let service = {
          name: s.metadata.name,
          namespace: s.metadata.namespace,
          ports: [],
          master: master,
          masterHostname: masterHostname,
          nodes: [node],
          frontendUrl: frontendUrl,
          frontendProtocol: frontendProtocol,
          frontendHostname: frontendHostname
        }
        if (s.spec.clusterIP && s.spec.clusterIP != 'None')
          service.clusterIP = s.spec.clusterIP
        if (s.spec.ports)
          service.ports = s.spec.ports
        if (services[service.name])
          services[service.name].push(service)
        else
          services[service.name]=[service]
      }
    next(null, services)
  }, function(err) {
    next(err, null)
  })
}

module.exports = {
  getPods: getPods,
  jsonApiPods: jsonApiPods,
  getOrCreatePod: getOrCreatePod,
  guaranteeDir: guaranteeDir,
  guaranteeUserDir: guaranteeUserDir,
  resolvePod: resolvePod,
  guaranteeResolvePod: guaranteeResolvePod,
  deletePod: deletePod,
  getServiceInfo: getServiceInfo
}
