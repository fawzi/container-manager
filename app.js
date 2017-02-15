const express = require('express');

const http = require('http');
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

var env = process.env.NODE_ENV || 'development';
const config = require('./config/config')[env];
console.log('Using configuration', config);

require('./config/passport')(passport, config);

const k8 = require('./app/kubernetes')(config);
const k8component = require('./app/components')(config);

const client = redis.createClient(config.redis);
const ProxyRouter = require('./app/ProxyRouter')(config,k8, k8component)
const proxyRouter = new ProxyRouter({
  backend: client,
  cache_ttl: 10
});

var app = express();

if (env === 'development') {
  // only use in development
  app.use(errorHandler())
}
app.use(morgan('combined'));
app.use(cookieParser);
//NOTE: Bodyparser doesn't allow the Post request to be forwarded by the http-proxy. Careful before using it!!!
//This code is kept here to stop people from making a ridiculous error that's almost impossible to debug when used on the app.
//app.use(bodyParser.json());
//app.use(bodyParser.urlencoded({extended: true}));
const store = new session.MemoryStore();
const sessionManager = session(
                  {
                    store: new RedisStore({client: client}),
                    resave: true,
                    saveUninitialized: true,
                    secret: config.app.secret,
                    httpOnly: false
                  });
app.use(sessionManager);
var passportInit = passport.initialize();
var passportSession =passport.session();
app.use(passportInit);
app.use(passportSession);


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

require('./config/routes')(app,redirect, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession);

var httpServer = http.createServer(app);
httpServer.on('upgrade', function (req, socket, head) {
    cookieParser(req, {}, function() {
    var sessionID = req.cookies['connect.sid'];
    sessionManager(req, {}, function(){
      try{
        redirect( req, {}, req.session.passport.user.id, true, '/beaker', function(route){
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
httpServer.listen(config.app.port);

process.on('uncaughtException', (err) => {
  console.log("#ERROR# UncaughtException: " + err)
});
