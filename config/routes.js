module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, models, fs, ensureLoggedIn, bodyParser) {
  function makeid(){
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < 5; i++ )
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }
  
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
  
  // returns the name of the logget in user
  function selfUserName(req) {
    var selfName;
    try {
      selfName = req.user.id;
    } catch(e) {
      selfName = ''
    }
    return selfName
  }

  app.get(config.app.localOverride,ensureLoggedIn('/login'),function (req, res) {
    var userID = (req.user.id === undefined) ?  'unknownSess1' : req.user.id;
    console.log('Get localoverride:' + userID);
    proxyRouter.client.hget(userID, config.app.localOverride,function(err,data){
      if(data){
        var target = JSON.parse(data)
        res.send(`<h1>HOST: ${target.host}</h1> <h1>PORT: ${target.port}</h1>`)
      }
      else
        res.send(`<h1>Not set yet!</h1>`)
    });

  });

  app.post(config.app.localOverride,function (req, res) {
    if(req.query.host && req.query.port){
      var target = {host: req.query.host, port: req.query.port};
      var writeTarget = JSON.stringify(target);

      proxyRouter.client.hset(req.query.user, config.app.localOverride, writeTarget,function(err,data){
        proxyRouter.client.expireat(req.query.user, 60*10);
        res.send(`<h1>Set! ${req.query.user} ${writeTarget}</h1>`);
      });
    }
    else {
      console.log(`Not executing! ${JSON.stringify(req.query)}`)
    }
  });

  app.get('/nmdalive', function(req, res){
    res.send("<div>Hello2!!</div>");
  });

  app.get('/notebook-edit/*', ensureLoggedIn('/login'), function(req, res){
    const target = 'https://labdev-nomad.esc.rzg.mpg.de/beaker/#/open?uri=' + req.url.slice(14, req.url.length).replace("/","%2F")
    console.log(`notebook-edit redirecting to ${target}`)
    res.redirect(302, target);
  });

  app.all('/*', ensureLoggedIn('/login'), function (req, res) {
    //  res.send(`<meta http-equiv="refresh" content="5" > <h3>Please wait while we start a container for you!</h3>`);
    console.log('Pre redirect, Retrieved session: '+JSON.stringify(req.session, null, 2))
    redirect(req, res, req.user.id, false, '/beaker', function(route){
      proxyServer.web(req, res,{
        target: route
      });
    });
  });
}
