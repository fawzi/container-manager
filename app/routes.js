module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, fs, ensureLoggedIn, bodyParser) {
  const components = require('../app/components')
  const logger = require('./logger')
  const stringify = require('json-stringify-safe')
  const k8D = require('./k8-data')

  function setFrontendHeader() {
    return function(req, res, next) {
      res.setHeader('Access-Control-Allow-Origin', config.app.frontendAddr);
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

  app.get(cconf.entryPoint.path, ensureLoggedIn('/login'), function(req, res){
    extraArgs = object.create(req.query)
    extraArgs.path = req.url
    if (cconf.entryPoint.pathReStr) {
      let re = new RegExp(cconf.entryPoint.pathReStr)
      var iRe = 1
      while (undefined !== re[iRe]) {
        let iReStr = iRe.toString()
        let pVal = re[iRe]
        extraArgs["path" + iReStr] = pVal
        extraArgs["escapedPath" + iReStr] = pVal.replace("/","%2F")
      }
    }
    let user = components.selfUserName(req)
    components.replacementsForUser(user, extraArgs, function(err, repl) {
      if (!err) {
        if (!req.session.replacements)
          req.session.replacements = {}
        req.session.replacements[cconf.image.imageType] = repl
        const podName = components.podNameForRepl(repl)
        proxyRouter.getOrCreatePod(podName, repl, true, function (err, podInfo) {
          if (err) {
        logger.warn(`error in entry point ${stringify(conf.k8component.entryPoint)} creating the pod: ${stringify(err)}`)
          }            
          let target = components.templatize(cconf.entryPoint.redirectTarget)(repl)
          res.redirect(302, target);
        })
      } else {
        logger.warn(`error in entry point ${stringify(conf.k8component.entryPoint)} getting the replacements: ${stringify(err)}`)
      }
    })
  });

  const commandsBase = components.templatize(cconf.commands.path)(components.baseRepl)

  app.get(commandsBase + "/view-containers", ensureLoggedIn('/login'), bodyParser.urlencoded({extended: true}), function(req, res){
    let user = components.selfUserName(req)
    var selectors
    if (req.body.all && req.body.all !== 'false')
      selectors = { user: user }
    else
      selectors = { user: user, "image-type": config.k8component.image.imageType }
    k8D.getPods(selectors, function(err, pods) {
      if (err) {
        res.send(getHtmlErrorTemplate(err, "Viewing running containers"))
      } else {
        let podList = pods.items
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
            if (pod.status && pod.status.phase === 'Pending') {
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
            
            return {
              name: pod.metadata.name,
              time: `${time.toFixed(1)} ${unit}`,
              status: status,
              detail: pod
            }
          })
        components.evalHtmlTemplate(
          "viewContainers.html",
          {
            pods: podList
          }, function (err, page) {
            res.send(page)
          })
      }
    })
  })

  app.get(commandsBase + "/container/:podname", ensureLoggedIn('/login'), bodyParser.json(), function(req, res){
    var loggedUsername = components.selfUserName(req);
    var podName = req.params.podname;
    var podInfo = components.infoForPodName(podName)
    if (podInfo.user && loggedUsername === podInfo.user) {
      k8.ns(config.k8component.namespace).pods.get({ name: podName }, function (err, result) {
        if (!err) {
          res.type('application/vnd.api+json').json({data:{ id: podName,
                                     type: 'pod',
                                     attributes: {
                                       data: result
                                     }
                                   }
                             }, null, 2);
        } else res.type('application/vnd.api+json').json({errors:[{
          id: 'no pod',
          detail: `error getting info onn pod ${podName}`,
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
  
  app.delete(commandsBase + "/container/:podname", ensureLoggedIn('/login'), bodyParser.json(), function(req, res){
    var loggedUsername = components.selfUserName(req);
    var podName = req.params.podname;
    var podInfo = components.infoForPodName(podName)
    if (podInfo.user && loggedUsername === podInfo.user) {
      logger.info(`Deleting pod: ${podName}`)
      k8.ns(config.k8component.namespace).pods.delete({ name: podName }, function (err, result) {
        if (!err) {
          logger.info(`deleted pod ${podName}`)
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
          logger.warn(`Error deleting pod ${podName}: ${stringify(err)}`)
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

  /*app.get('/notebook-edit/*', ensureLoggedIn('/login'), function(req, res){
    const target = config.app.baseUri + '/beaker/#/open?uri=' + req.url.slice(14, req.url.length).replace("/","%2F")
    logger.debug(`notebook-edit redirecting to ${target}`)
    res.redirect(302, target);
  });*/

  app.all('/*', ensureLoggedIn('/login'), function (req, res) {
    //  res.send(`<meta http-equiv="refresh" content="5" > <h3>Please wait while we start a container for you!</h3>`);
    //logger.debug('Pre redirect, Retrieved session: '+stringify(req.session, null, 2))
    redirect(req, res, req.user.id, false, config.k8component['imageType'], function(route){
      proxyServer.web(req, res,{
        target: route
      });
    });
  });
}
