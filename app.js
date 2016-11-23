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

var env = process.env.NODE_ENV || 'development';
const config = require('./config/config')[env];
console.log('Using configuration', config);
const k8 = require('./config/kubernetes')(config);
const k8component = require('./config/components')(config);

const ProxyRouter = require('./config/ProxyRouter')(config,k8)
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
    secret: config.app.secret
  }));
app.use(express.static(path.join(__dirname, 'public')));

require('./config/routes')(app, config, proxyRouter, k8);

app.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});



