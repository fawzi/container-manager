'use strict';
module.exports = function(config, models, cmds) {
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
  const logger = require('./logger')

  var loginPrefixes = ['']
  //if (cmds.includes('apiserver'))
  //  loginPrefixes.push('/userapi')
  //if (cmds.includes('webserver'))
  //  loginPrefixes.push(config.k8component.image.imageType)
  //
  // config.passport.saml.path = loginPrefixes[loginPrefixes.length - 1] + config.passport.saml.path
  const strategies = require('./passport-settings')(passport, config);

  var app = express();

  const env = process.env["NODE_ENV"] || 'development'
  if (env === 'development' || env === 'localSetup') {
    // only use in development
    app.use(errorHandler())
    app.use(morgan('combined'));
  }
  app.use(cookieParser);

  //NOTE: Bodyparser doesn't allow the Post request to be forwarded by the http-proxy. Careful before using it!!!
  //This code is kept here to stop people from making a ridiculous error that's almost impossible to debug when used on the app.
  // selectively add body parser to the call that need it (like the local login)
  //app.use(bodyParser.json());
  //app.use(bodyParser.urlencoded({extended: true}));

  const client = redis.createClient(config.session_redis);
  client.on("error", function (err) {
    throw err
  });
  const sessionManager = session(
    {
      store: new RedisStore({client: client}),
      resave: false,
      saveUninitialized: true,
      secret: config.app.secret,
      httpOnly: false
    });
  app.use(sessionManager);
  app.use(passport.initialize());
  app.use(passport.session());

  var httpServer;
  if (!config.app.ssl || !config.app.ssl.key) {
    httpServer = http.createServer(app);
  } else {
    var httpsOptions = {
      key: fs.readFileSync(config.app.ssl.key),
      cert: fs.readFileSync(config.app.ssl.cert)
    };
    httpServer = https.createServer(httpsOptions, app);
  }

  for (var loginPrefixIndex in loginPrefixes) {
    const loginPrefix = loginPrefixes[loginPrefixIndex]
    const loginUri = loginPrefix + '/login'
  //if (config.passport.strategy === "local") {
  //  const flash = require('connect-flash');
  //  app.use(flash());
  //}

    app.get(loginUri,function(req, res, next) {
    if (config.passport.strategy === "local") {
      res.send(`
        <html>
           <head>
              <title>Login</title>
           </head>
           <body>
             <h1>Login</h1>
             <form action="${loginUri}/callback" method="post">
                <div>
                    <label>Username:</label>
                    <input type="text" name="username"/>
                </div>
                <div>
                    <label>Password:</label>
                    <input type="password" name="password"/>
                </div>
                <div>
                    <input type="submit" value="Log In"/>
                </div>
             </form>
           </body>
         </html>`)
    } else {
      var target = '/'
      if (req.session && req.query.redirectTo)
        req.session.returnTo = req.query.redirectTo
      next()
    }
  }, passport.authenticate(
    config.passport.strategy,
    {
      successReturnToOrRedirect: '/',
      failureRedirect: loginUri
    })
         );

  app.get(loginUri + '/logout', function(req, res){
    var user;
      try {
        user = req.session.passport.user.id
      } catch (e) {
        user = null
      }
    if (strategies['saml']) {
      strategies['saml'].logout(req, function(){
        req.logout();
        req.session.destroy(function(err) {
          logger.info(`user ${user} logged out`);
        })
        res.redirect('/');
      })
    } else {
      req.logout();
      req.session.destroy(function(err) {
        logger.info(`user ${user} logged out`);
      })
      res.redirect('/');
    }
  });

  //Passport SAML request is not accepted until the body is parsed.
  // Since bodyParser can not used in the express app, it is called here separately.
  //
  // To debug passport use a custom callback function (error, user, info) {...}
  // instead of the dictionary in the call to passport.authenticate, as described in
    // https://dmitryrogozhny.com/blog/easy-way-to-debug-passport-authentication-in-express
    // config.passport.saml.path should be this
  app.post(loginUri + '/callback',bodyParser.json(),bodyParser.urlencoded({extended: true}),
           passport.authenticate(config.passport.strategy,
                                 {
                                   failureRedirect: loginUri,
                                   failureFlash: false
                                 }),
           function (req, res) {
             if (req.session && req.session.returnTo) {
               res.redirect(req.session.returnTo); // can't be used for beaker #/open?uri=... urls, as the partial path after # is not available to the backend, always use /notebook-edit instead...
             } else {
               res.redirect('/')  ;
             }
           }
          );
  }

  if (cmds.includes('webserver')) {
    logger.info('starting webserver')
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
        logger.error("Session not initialized");
      }

      proxyRouter.lookup(req, res, sessID, isWebsocket, path, function(route) {
        //logger.debug('Looked up route:' + stringify(route));
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
    require('./routes')(app,redirect, config, proxyServer, proxyRouter, k8, passport, fs, ensureLoggedIn, bodyParser);

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
    logger.info('starting apiserver')
    require('./userapi')(app, config, passport,  models, ensureLoggedIn, bodyParser)
  }
  logger.info(`listening on port ${config.app.port}`)
  httpServer.listen(config.app.port);
}
