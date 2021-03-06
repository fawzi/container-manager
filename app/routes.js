module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, fs, ensureLoggedIn, bodyParser) {
  const components = require('../app/components')
  const logger = require('./logger')
  const stringify = require('json-stringify-safe')
  const k8D = require('./k8-data')
  const compactSha = require('./compact-sha')
  const loginUri = components.baseRepl.loginUri

  function setFrontendHeader() {
    return function(req, res, next) {
      res.setHeader('Access-Control-Allow-Origin', config.app.frontendUrl);
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
      next();
    }
  }

  function setJsonApiHeader() {
    return function(req, res, next) {
      res.setHeader('content-type', 'application/vnd.api+json');
      next();
    }
  }      
    
  app.get('/nmdalive', function(req, res){
    res.send("<div>Hello2!!</div>");
  });

  let cconf = config.k8component
  let entryPath = components.templatize(cconf.entryPoint.path)(components.baseRepl)
  const commandsBase = components.templatize(cconf.commands.path)(components.baseRepl)

  app.get(entryPath, ensureLoggedIn(loginUri), bodyParser.json(), bodyParser.urlencoded({extended:true}), function(req, res){
    function isEmpty(obj) { 
      for (var x in obj) { return false; }
      return true;
    }
    var query = {}
    if (cconf.entryPoint.replacementsFromQueryParameters)
      query = req.query
    extraArgs = Object.assign({},query)
    if (!isEmpty(extraArgs) && !extraArgs.imageSubtype)
      extraArgs.imageSubtype = `custom${compactSha.objectSha(extraArgs, prefix='').replace(/[-_]/g,'').slice(0,5).toLowerCase()}`
    extraArgs.path = req.url
    if (cconf.entryPoint.pathReStr) {
      let re = new RegExp(cconf.entryPoint.pathReStr)
      let reMatch = re.exec(req.url)
      for (var iRe in reMatch) {
        if (iRe == ~~iRe) { // if it is an integer...
          let iReStr = iRe.toString()
          let pVal = reMatch[iRe]
          if (pVal) {
            extraArgs["path" + iReStr] = pVal
            extraArgs["escapedPath" + iReStr] = pVal.replace(/\//g,"%2F")
          }
        }
      }
    }
    let user = components.selfUserName(req)
    components.replacementsForUser(user, {}, extraArgs, function(err, repl) {
      if (!err) {
        if (!req.session.replacements)
          req.session.replacements = {}
        req.session.replacements[cconf.image.imageType] = repl
        const podName = components.podNameForRepl(repl)
        k8D.getOrCreatePod(podName, repl, true, function (err, podInfo) {
          let target = `${commandsBase}/command-exec`
          logger.info(`entryPoint got pod ${stringify(podInfo)}`)
          if (err) {
            if (err.error  === 'too many containers') {
              components.evalHtmlTemplate("maxContainers.html", {
                pods: err.pods
              }, function(err, errorHtml) {
                res.status(503).send(errorHtml)
              })
            } else if (err.error === 'pod shutting down') {
              logger.info(`Waiting for ${podName} shutdown`)
              components.evalHtmlTemplate("containerShuttingDown.html", {
                podName: podName,
                refreshEachS: config.app.pageReloadTime
              }, function(err, htmlPage) {
                res.status(503).send(htmlPage)
              })
            } else {
              let context = `entry point ${stringify(cconf.entryPoint)} creating the pod ${podName}`
              logger.warn(`error in ${context}: ${stringify(err)}`)
              res.status(500).send(components.getHtmlErrorTemplate(err, context))
            }
          } else if (podInfo.metadata.labels['replacements-checksum'] !== repl.replacementsChecksum) {
            logger.info(`old Checksum in ${stringify(podInfo,null,2)}`)
            components.evalHtmlTemplate("outdatedImage.html", {
              podName: podInfo.metadata.name,
              runningChecksum: podInfo.metadata.labels['replacements-checksum'],
              currentChecksum: repl.replacementsChecksum,
              target: target
            }, function(err, htmlPage) {
              res.status(409).send(htmlPage)
            })
          } else {
            const podIp = podInfo.status.podIP
            if (podIp) {
              var ready = false
              const conds = podInfo.status.conditions
              if (podInfo.status && conds) {
                for (icond in conds) {
                  let cond = conds[icond]
                  if (cond.type === 'Ready' && cond.status === 'True')
                    ready = true
                }
              }
            }
            if (podIp && ready && podInfo.status.phase == 'Running') { // we have a valid and running pod
              res.redirect(302, target);
            } else if (podInfo.status.phase === 'Pending' || podInfo.status.phase === 'Running') {
              let error_detail = ''
              let secondsSinceCreation = (Date.now() - Date.parse(podInfo.metadata.creationTimestamp))/ 1000.0
              const error = {
                error: "not ready",
                msg: "pod not yet ready",
                status: podInfo.status,
                host: podIp,
                pod: podInfo,
                secondsSinceCreation: secondsSinceCreation
              }
              if (!secondsSinceCreation || secondsSinceCreation > 15)
                error_detail = stringify(error, null, 2)
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
            } else {
              let err = {
                error: 'unexpected pod phase',
                detail: 'Pod ${podName} in phase ${pod.status.phase} (expected Pending or Running)'
              }
              logger.warn(err.detail)
              res.status(500).send(components.getHtmlErrorTemplate(err, 'in entry point'))
            }
          }
        })
      } else {
        logger.warn(`error in entry point ${stringify(cconf.entryPoint)} getting the replacements: ${stringify(err)}`)
        res.status(500).send(components.getHtmlErrorTemplate(err, 'error getting replacements'))
      }
    })
  });


  app.get(commandsBase + "/command-exec", ensureLoggedIn(loginUri), bodyParser.json(), function(req, res){
    components.guaranteeCachedReplacements(req, res, function(repl) {
      let targetTemplateStr = cconf.entryPoint.redirectTarget
      let targetTemplate = components.templatize(targetTemplateStr)
      k8D.guaranteeResolvePod(repl, res, function(podInfo){
        if (cconf.entryPoint.execCommand) {
          let cmd = cconf.entryPoint.execCommand.map(function (x) {
            if (x.indexOf('{{') == -1)
              return x
            else
              return components.templatize(x)(repl)
          })
          k8.api.v1.ns(cconf.namespace).pod(repl.podName).exec.post({ qs: {
            command: cmd,
            stdin: false,
            stderr: true,
            stdout: true,
            tty: false
          } }).then(function(value){
            let newRepl = Object.create(repl)
            newRepl.cmdOut = value.messages.filter(function(x){ return x.channel == "stdout" }).map(function(x){ return x.message }).join("")
            newRepl.cmdOutTrimmed = newRepl.cmdOut.trim()
            newRepl.cmdBody = value.body
            newRepl.cmdBodyTrimmed = newRepl.cmdBody.trim()
            targetTemplate(newRepl)
            let target = targetTemplate(newRepl)
            logger.info(`cmd ${stringify(cmd)} will redirect to ${stringify(target)}`)
            res.redirect(302, target);
          }).catch(function(err) {
            logger.warn(`command ${stringify(cmd)} on pod ${repl.podName} failed ${stringify(err)}`)
            let target = targetTemplate(repl)
            components.evalHtmlTemplate("failedCommand.html", {
              podName: podName,
              command: stringify(cmd),
              error: err,
              target: target
            }, function(err, templateHtml) {
              res.status(500).send(templateHtml)
            })
          })
        } else {
          let target = targetTemplate(repl)
          res.redirect(302, target);
        }
      })
    })
  })

  app.get(commandsBase + "/view-containers", ensureLoggedIn(loginUri), bodyParser.urlencoded({extended: true}), function(req, res){
    let user = components.selfUserName(req)
    var selectors
    if (req.body)
      selectors = Object.assign({}, req.body, { user: user })
    else
      selectors = { user: user, "image-type": cconf.image.imageType }
    k8D.jsonApiPods(selectors, function(err, pods) {
      if (err) {
        res.send(components.getHtmlErrorTemplate(err, "Viewing running containers"))
      } else {
        components.evalHtmlTemplate(
          "viewContainers.html",
          {
            pods: pods
          }, function (err, page) {
            res.send(page)
          })
      }
    })
  })

  app.get(commandsBase + "/container", ensureLoggedIn(loginUri), bodyParser.json(), bodyParser.urlencoded({extended: true}), function(req, res){
    k8D.jsonApiPods(req.body, function(err, pods) {
      if (err) {
        res.status(400).type('application/vnd.api+json').json({ errors: [{ id: 'ErrorContainer',
                              detail: `error getting containers ${stringify(req.body)}`,
                              data: err
                            }]})
      } else {
        res.json({ data: pods })
      }
    })
  })

  app.get(commandsBase + "/container/:podname", ensureLoggedIn(loginUri), bodyParser.json(), function(req, res){
    var loggedUsername = components.selfUserName(req);
    var podName = req.params.podname;
    var podInfo = components.infoForPodName(podName)
    if (podInfo.user && loggedUsername === podInfo.user) {
      k8.api.v1.ns(cconf.namespace).pod(podName).get().then(function (result) {
        res.type('application/vnd.api+json').json({data:{ id: podName,
                                                          type: 'pod',
                                                          attributes: {
                                                            data: result.body
                                                          }
                                                        }
                                                  }, null, 2);
      }, function(err) {
        res.type('application/vnd.api+json').json({errors:[{
          id: 'no pod',
          detail: `error getting info on pod ${podName}`,
          data: err
        }]});
      });
    } else if (podInfo.user) {
      res.status(401).type('application/vnd.api+json').json({ errors: [{
        id:'not allowed',
        detail:'You don\'t have the right to view that container.'}] });
    } else {
      res.status(400).type('application/vnd.api+json').json({ errors: [{
        id: 'invalid request',
        detail:'The pod name is incorrectly formatted.'}] });
    }
  })
  
  app.delete(commandsBase + "/container/:podname", ensureLoggedIn(loginUri), bodyParser.json(), function(req, res){
    var loggedUsername = components.selfUserName(req);
    var podName = req.params.podname;
    var podInfo = components.infoForPodName(podName)
    if (podInfo.user && loggedUsername === podInfo.user) {
      logger.info(`Deleting pod: ${podName}`)
      k8D.deletePod(podName, function (err, result) {
        if (!err) {
          res.type('application/vnd.api+json').json({
            data: {
              id: podName,
              type: 'pod',
              attributes:{
                data: result
              }
            }
          });
        } else {
          res.type('application/vnd.api+json').json({
            errors:[ {
              id: 'delete error',
              detail: `failed to delete pod ${podName}`,
              data: err
            }]});
        }
      });
    } else if (podInfo.user) {
      let err = {
        id:'not allowed',
        detail:'You don\'t have the right to delete that container.'}
      logger.warn(stringify(err))
      res.status(401).type('application/vnd.api+json').json({ errors: [err] });
    } else {
      let err = {
        id: 'invalid request',
        detail:'The pod name is incorrectly formatted.'}
      logger.warn(stringify(err))
      res.status(400).type('application/vnd.api+json').json({ errors: [err] });
    }
  })
 
  app.all('/*', ensureLoggedIn(loginUri), function (req, res) {
    //logger.debug('Pre redirect, Retrieved session: '+stringify(req.session, null, 2))
    redirect(req, res, req.user.id, false, cconf['imageType'], function(route){
      proxyServer.web(req, res,{
        target: route
      });
    });
  });
}
