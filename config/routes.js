const http = require('http');

const httpProxy = require('http-proxy');
const fs = require('fs');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const bodyParser = require('body-parser');
module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession, File, ResourceUsage) {

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

  app.get('/login/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });
  
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
        res.send({files:files});
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

  function selfUserName(req) {
    var selfName;
    try {
      selfName = req.user.id;
    } catch(e) {
      selfName = ''
    }
    return selfName
  }

  function userInfo(username, selfName, next) {
    var query;
    if (selfName && username == selfName)
      query = { user: selfName };
    else
      query = { user: username, isPublic: true};
    File.find(query, null, {sort: {updated_at: -1}}, function(err, myFiles) {
      if(err) {
        next(err);
      } else {
        ResourceUsage.findOne({username: username}, null,{}, function(err, rUsage) {
          let user = {
            type: "user",
            username: username,
            myNotebooks: myFiles
          }
          if (rUsage) {
            for (let k in ['fileUsageLastUpdate','privateStorageGB','sharedStorageGB','cpuUsageLastUpdate', 'cpuUsage'])
              user[k] = rUsage[k]
          }
          next(null, {
            'self': selfName,
            'user': user
          });
        });
      }
    });
  }
  
  app.get('/userapi/self', setFrontendHeader(), function(req, res){
    File.find({isPublic: true}, null, {sort: "user -updated_at"}, function(err,files) {
      if(err) {
        res.send(err);
      } else {
        let username = selfUserName(req)
        if (!username) {
          res.send({
            self:'',
            user:{}
          })
          return;
        }
        userInfo(username, username, function(err, userInfo) {
          if (err) {
            res.send(err)
          } else {
            userInfo.user.sharedNotebooks = files
            res.send(userInfo);
          }
	});
      }
    });
  });

  app.get('/userapi/whoami', setFrontendHeader(), function(req, res){
    res.send(selfUserName(req))
  });

  app.get('/userapi/users/:username', setFrontendHeader(), function(req, res){
    var selfName = selfUserName(req)
    let username = req.params.username;
    userInfo(username, selfName, function(err, userInfo) {
      if (err) {
        res.send(err)
      } else {
        res.send(userInfo);
      }
    });
  });

  app.get('/nmdalive', function(req, res){
    res.send("<div>Hello2!!</div>");
  });

  app.get('/notebook-edit/*', function(req, res){
    const target = 'https://labdev-nomad.esc.rzg.mpg.de/beaker/#/open?uri=' + req.url.slice(14, req.url.length).replace("/","%2F")
    console.log(`notebook-edit redirecting to ${target}`)
    res.redirect(302, target);
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
