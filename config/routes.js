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


  app.get('/nmdalive', function(req, res){
    res.send("<div>Hello2!!</div>");
  });

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
