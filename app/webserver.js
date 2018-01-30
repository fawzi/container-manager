'use strict';
module.exports = function(env,config, models, cmds) {
  const express = require('express');

  const http = require('http');
  const https = require('https');
  const path = require('path');
  const passport = require('passport');
  const morgan = require('morgan');
  const cookieParser = require('cookie-parser')();
  const bodyParser = require('body-parser');
  const session = require('express-session');
  const errorHandler = require('errorhandler');
  const redis   = require("redis");
  const RedisStore = require('connect-redis')(session);
  const httpProxy = require('http-proxy');
  const SamlStrategy = require('passport-saml').Strategy;
  const stringify = require('json-stringify-safe');
  const fs = require('fs');
  const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

  var loginPrefix = ''
  if (cmds.includes('apiserver') && !cmds.includes('webserver'))
    loginPrefix = '/userapi' // avoid??

  config.passport.saml.path = loginPrefix + config.passport.saml.path
  require('../config/passport')(passport, config);

  var app = express();

  if (env === 'development') {
    // only use in development
    app.use(errorHandler())
    app.use(morgan('combined'));
  }
  app.use(cookieParser);

  //NOTE: Bodyparser doesn't allow the Post request to be forwarded by the http-proxy. Careful before using it!!!
  //This code is kept here to stop people from making a ridiculous error that's almost impossible to debug when used on the app.
  //app.use(bodyParser.json());
  //app.use(bodyParser.urlencoded({extended: true}));

  const client = redis.createClient(config.redis);
  const sessionManager = session(
    {
      store: new RedisStore({client: client}),
      resave: true,
      saveUninitialized: true,
      secret: config.app.secret,
      httpOnly: false
    });
  app.use(sessionManager);
  app.use(passport.initialize());
  app.use(passport.session());

  var httpServer;
  if (env === 'development') {
    httpServer = http.createServer(app);
  } else {
    var httpsOptions = {
      key: fs.readFileSync(config.app.ssl.key),
      cert: fs.readFileSync(config.app.ssl.cert)
    };
    httpServer = https.createServer(httpsOptions, app);
  }

  app.get(loginPrefix + '/login',function(req, res, next) {
    var target = '/'
    if (req.session && req.query.redirectTo)
      req.session.returnTo = req.query.redirectTo
    next()
  }, passport.authenticate(config.passport.strategy,
                           {
                             successReturnToOrRedirect: '/',
                             failureRedirect: '/login'
                           })
         );

  app.get(loginPrefix + '/login/logout', function(req, res){
    var user;
      try {
        user = req.session.passport.user.id
      } catch (e) {
        user = null
      }
    req.logout();
    req.session.destroy(function(err) {
      console.log(`user ${user} logged out`);
    })
    res.redirect('/');
  });

  //Passport SAML request is not accepted until the body is parsed. And since bodyParser can not used in the express app, it is called here separately.
  app.post(config.passport.saml.path,bodyParser.json(),bodyParser.urlencoded({extended: true}),
           passport.authenticate(config.passport.strategy,
                                 {
                                   failureRedirect: '/',
                                   failureFlash: true
                                 }),
           function (req, res) {
             if (req.session && req.session.returnTo) {
               res.redirect(req.session.returnTo); // can't be used for beaker #/open?uri=... urls, as the partial path after # is not available to the backend, always use /notebook-edit instead...
             } else {
               res.redirect('/')  ;
             }
           }
          );


  if (cmds.includes('webserver')) {
    console.log('starting webserver')
    const ProxyRouter = require('./ProxyRouter')
    const proxyRouter = new ProxyRouter({
      backend: client
    });
    //Agent is need to keep the connection: keep-alive header. But we not using it until really needed.
    //const agent = new http.Agent({ maxSockets: Number.MAX_VALUE });
    //const proxyServer = httpProxy.createProxy({ agent: agent });

    var extractURL = function(uri) {
      var re = /^(.*)[?&]nomadUser=([a-zA-Z0-9_]+)$/
        var match = re.exec(uri)
      if (match)
        return { "uri": match[1], "user": match[2] }
      else
        return { "uri": uri, "user": null }
    }

    function redirect(req, res, userID, isWebsocket, path, next) {
      var sessID = (userID === undefined) ?  'unknownSess1' : userID;
      if(sessID == 'unknownSess1')  {
        console.log("#ERROR# session not initialized");
      }

      proxyRouter.lookup(req, res, sessID, isWebsocket, path, function(route) {
        console.log('Looked up route:' + stringify(route));
        if (route) {
          try{
            next(route);
          }
          catch(er){
            console.error("Proxy server forwarding failed", er.message);
          }
        }
        else {
          try {
            res.writeHead(404);
            res.end();
          }
          catch (er) {
            console.error("res.writeHead/res.end error: %s", er.message);
          }
        }
      });
    }


    const proxyServer = httpProxy.createProxyServer({});
    // Listen for the `error` event on `proxy`.
    proxyServer.on('error', function (err, req, res) {
      //The following will fail on websockets
      /*  try{
          res.writeHead(500,{
          'Content-Type': 'text/plain'
          });
          res.end('Something went wrong.Please refresh otherwise try again later.');
          }
          catch(er){
          console.error("Proxy error: res.writeHead/res.end error: %s", er.message);
          }*/
    });
    const k8 = require('./kubernetes');
    require('../config/routes')(app,redirect, config, proxyServer, proxyRouter, k8, passport, fs, ensureLoggedIn, bodyParser);

    httpServer.on('upgrade', function (req, socket, head) {
      cookieParser(req, {}, function() {
        var sessionID = req.cookies['connect.sid'];
        sessionManager(req, {}, function(){
          try{
            redirect( req, {}, req.session.passport.user.id, true, config.k8component['imageType'], function(route){
              var wsSocket = 'ws://'+route.host +':'+ route.port + req.url;
              proxyServer.ws(req, socket, head, { target: wsSocket });
            });
          }
          catch(er) {
            console.error("Websocket forward error: %s", er.message);
          }
        });
      });
    });

  }
  if (cmds.includes('apiserver')) {
    console.log('starting apiserver')
    require('../config/userapi')(app, config, passport,  models, ensureLoggedIn, bodyParser)
  }

  httpServer.listen(config.app.port);
}
