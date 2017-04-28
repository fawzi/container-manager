const http = require('http');

const httpProxy = require('http-proxy');
const fs = require('fs');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const bodyParser = require('body-parser');
module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession, File) {


  function makeid(){
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < 5; i++ )
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  app.get('/login',
    passport.authenticate(config.passport.strategy,
      {
        successReturnToOrRedirect: '/',
        failureRedirect: '/login'
      })
  );

  
  function setFrontendHeader() {
  return function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', config.app.frontendAddr);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    next();
  }
}
	
//Passport SAML request is not accepted until the body is parsed. And since bodyParser can not used in the express app, it is called here separately.
  app.post(config.passport.saml.path,bodyParser.json(),bodyParser.urlencoded({extended: true}),
    passport.authenticate(config.passport.strategy,
      {
        failureRedirect: '/',
        failureFlash: true
      }),
    function (req, res) {
     if (req.session && req.session.returnTo) {
       res.redirect('/'); // req.session.returnTo can't be used as the partial path after # is not available to the backend
     } else {
        res.redirect('/')  ;
     }
    }
  );

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

  app.get('/userapi', function(req, res){
    res.send('Working');
  });

  app.get('/userapi/files', setFrontendHeader(), function(req, res){
    File.find({isPublic: true},function(err,files) {
        if(err) {
            res.send(err);
        }
        else {
            res.send(files);
        }
    });
  })


  app.get('/userapi/files/:user', setFrontendHeader(), function(req, res){
    File.find({user: req.params.user},function(err,files) {
        if(err) {
            res.send(err);
        }
        else {
            res.send(files);
        }
    });
  })

  app.get('/userapi/files/:id', setFrontendHeader(), function(req, res){
    File.find({id: req.params.id},function(err,files) {
        if(err) {
            res.send(err);
        }
        else {
            res.send(files);
        }
    });
  })
  app.get('/userapi/users/:id', setFrontendHeader(), function(req, res){
	  if(req.user === undefined || req.user.id === undefined) {
	    res.send({users:{
		  //type: "user",
		  id: 1,
		  userName:'You are not logged in',
		  myNotebooks: [{title:'Sample1', link: '/Sample1.bkr'},{title:'Sample2', link: '/Sample2.bkr'},{title:'Sample3', link: '/Sample3.bkr'},{title:'Sample4', link: '/Sample4.bkr'},{title:'Sample5', link: '/Sample5.bkr'}],
		  sharedNotebooks: [{title:'Sample1', link: '/Sample1.bkr'},{title:'Sample2', link: '/Sample2.bkr'}],
		  cpuInfo: "Not available",
		  diskInfo: "0 MB",
		  status: "Not available"
		}});
	  }
	 else {
		 res.send({users:{
		  //type: "user",
		  id: 1,
		  userName:req.user.id,
		  myNotebooks: [{title:'Sample1', link: '/Sample1.bkr'},{title:'Sample2', link: '/Sample2.bkr'},{title:'Sample3', link: '/Sample3.bkr'},{title:'Sample4', link: '/Sample4'},{title:'Sample5', link: '/Sample5.bkr'}],
		  sharedNotebooks: [{title:'Sample1', link: '/Sample1.bkr'},{title:'Sample2.bkr', link: '/Sample2.bkr'}],
		  cpuInfo: "Not available",
		  diskInfo: "0 MB",
		  status: "Not available"
		}});
	 }
  });

  app.get('/nmdalive', function(req, res){
    res.send("<div>Hello2!!</div>");
  });

  app.all('/*', ensureLoggedIn('/login'),function (req, res) {
//  res.send(`<meta http-equiv="refresh" content="5" > <h3>Please wait while we start a container for you!</h3>`);
//    console.log('Retrieved session: '+JSON.stringify(req.session, null, 2))
    redirect(req, res, req.user.id, false, '/beaker', function(route){
      proxyServer.web(req, res,{
        target: route
      });
    });
  });
};
