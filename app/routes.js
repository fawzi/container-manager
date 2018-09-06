module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, fs, ensureLoggedIn, bodyParser) {
  const components = require('../app/components')

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
        console.log(`error in entry point ${JSON.stringify(conf.k8component.entryPoint)} creating the pod: ${JSON.stringify(err)}`)
          }            
          let target = components.templatize(cconf.entryPoint.redirectTarget)(repl)
          res.redirect(302, target);
        })
      } else {
        console.log(`error in entry point ${JSON.stringify(conf.k8component.entryPoint)} getting the replacements: ${JSON.stringify(err)}`)
      }
    })
  });

  const commandsBase = components.templatize(cconf.commands.path)(components.templatize)

  app.post(commandsBase + "/stop", ensureLoggedIn('/login'), function(req, res){
    
  })

  app.post(commandsBase + "/stopAll", ensureLoggedIn('/login'), function(req, res){
  })

  app.post(commandsBase + "/refresh", ensureLoggedIn('/login'), function(req, res){
  })

  app.get('/notebook-edit/*', ensureLoggedIn('/login'), function(req, res){
    const target = config.app.baseUri + '/beaker/#/open?uri=' + req.url.slice(14, req.url.length).replace("/","%2F")
    console.log(`notebook-edit redirecting to ${target}`)
    res.redirect(302, target);
  });

  app.all('/*', ensureLoggedIn('/login'), function (req, res) {
    //  res.send(`<meta http-equiv="refresh" content="5" > <h3>Please wait while we start a container for you!</h3>`);
    console.log('Pre redirect, Retrieved session: '+JSON.stringify(req.session, null, 2))
    redirect(req, res, req.user.id, false, config.k8component['imageType'], function(route){
      proxyServer.web(req, res,{
        target: route
      });
    });
  });
}
