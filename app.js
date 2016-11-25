const express = require('express');
const http = require('http');
const path = require('path');
const passport = require('passport');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const errorhandler = require('errorhandler');
const redis   = require("redis"),
    httpProxy = require('http-proxy');
const client = redis.createClient();
const SamlStrategy = require('passport-saml').Strategy;

var env = process.env.NODE_ENV || 'development';
const config = require('./config/config')[env];
console.log('Using configuration', config);

require('./config/passport')(passport, config);

const k8 = require('./app/kubernetes')(config);
const k8component = require('./app/components')(config);

const ProxyRouter = require('./app/ProxyRouter')(config,k8)
const proxyRouter = new ProxyRouter({
  backend: redis.createClient(),
  cache_ttl: 50
});

var app = express();

app.set('port', config.app.port);
app.set('views', __dirname + '/app/views');
app.set('view engine', 'jade');
app.use(morgan('combined'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(session(
  {
    resave: true,
    saveUninitialized: true,
    secret: config.app.secret,
    httpOnly: false
  }));
var passportInit = passport.initialize();
var passportSession =passport.session();
app.use(passportInit);
app.use(passportSession);
app.use(express.static(path.join(__dirname, 'public')));

const expressWs = require('express-ws')(app);
const proxyServer = httpProxy.createProxyServer({});
require('./config/routes')(app, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession);

//app.listen(app.get('port'), function () {
//  console.log('Express server listening on port ' + app.get('port'));
//});



proxyServer.on('upgrade', function (req, socket, head) {
  proxy.ws(req, socket, head);
});

var httpServer = http.createServer(app);
httpServer.on('upgrade', function (req, socket, head) {
    console.log("XXX upgrade")
    /*passport.authenticate('saml',function(err, user, info){
        if (err) console.log("error " + err)
        if (user) {
           console.log(user)
           proxyServer.ws(req, socket, head, { target: target });
        } else {
            console.log("no user!")
        }
    })*/
    passportInit(req, socket, function () {
    console.log("XXX init")
      // Use the built-in sessions
      passportSession(req, socket, function () {
        // Make the user available throughout the frontend
        console.log("XXX session")
        console.log(req.user)
        // proxyServer.ws(req, socket, head, { target:target });
      });
    });
});
//
httpServer.listen(80);
