const express = require('express');

const http = require('http');
const path = require('path');
const passport = require('passport');
const morgan = require('morgan');
const cookieParser = require('cookie-parser')();
const bodyParser = require('body-parser');
const session = require('express-session');
//const errorhandler = require('errorhandler');

const redis   = require("redis");
const RedisStore = require('connect-redis')(session);
const httpProxy = require('http-proxy');
const SamlStrategy = require('passport-saml').Strategy;

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
  cache_ttl: 50
});

var app = express();


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

function redirect(userID, path, next) {
  var sessID = (userID === undefined) ?  'unknownSess1' : userID;
  if(sessID == 'unknownSess1')  {
    console.log("#ERROR# session not initialized");
    console.log("#sessID: " + sessID);
  }
//    var route = {
//      host: '192.168.99.100' ,
//      port: 31382
//    }
  proxyRouter.lookup(sessID, path, function(route) {
    console.log('Looked up route:' + JSON.stringify(route));
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
require('./config/routes')(app,redirect, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession);

var httpServer = http.createServer(app);
httpServer.on('upgrade', function (req, socket, head) {
    cookieParser(req, {}, function() {
    var sessionID = req.cookies['connect.sid'];
    console.log(sessionID);
    sessionManager(req, {}, function(){
      console.log('Retrieved session: '+JSON.stringify(req.session, null, 2))
      redirect(req.session.passport.user.id, '/beaker', function(route){
        var wsSocket = 'ws://'+route.host +':'+ route.port + req.url;
        console.log('Final websocket: ' +wsSocket);
        proxyServer.ws(req, socket, head, { target: wsSocket });
      });
    });
  });
});
httpServer.listen(80);

