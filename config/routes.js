const http = require('http');

const httpProxy = require('http-proxy');
const fs = require('fs');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const bodyParser = require('body-parser');
module.exports = function (app, redirect, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession,  models) {
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

  function getUserInfo(username, selfName, next) {
    var query;
    if (selfName && username == selfName)
      query = { user: selfName };
    else
      query = { user: username, isPublic: true};
    models.Notebook.find(query, null, {sort: {updated_at: -1}}, function(err, myNotebooks) {
      if(err) {
        next(err);
      } else {
        models.Rusage.findOne({username: username}, function(err, rusage) {
          let res = {
            data: {
              type: "users",
              id: username,
              attributes: {
                username: username,
              },
              relationships: {
                notebooks: {
                  data: myNotebooks.map(models.notebookResId)
                },
                rusage: null
              }
            },
            included: notebooks.map(models.notebookResObj)
          }
          if (rusage) {
            res.data.relationships.rusage = models.rusageResId(rusage)
            res.data.included.push(models.rusageResObj(rusage))
          }
          next(null, res);
        });
      }
    });
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

  app.get('/userapi/notebooks', setJsonApiHeader(), function(req, res){
    models.Notebook.find({isPublic: true},function(err,notebooks) {
      if(err) {
        res.send({ errors: [err] });
      }
      else {
        res.send({ data: notebooks.map(models.notebookResObj) });
      }
    });
  })

  app.get('/userapi/notebooks/:id', setJsonApiHeader(), function(req, res){
    res.setHeader('content-type', 'application/vnd.api+json')
    models.Notebook.findOne({_id: req.params.id},function(err,notebook) {
      if(err) {
        res.send({ errors: [ err ] });
      } else if (notebook.isPublic || notebook.username == selfUserName(req)) {
        res.send({
          data: models.notebookResObj(notebook)
        });
      } else { // hide completely and treat as non existing, or trigger an error? currently expose minimal info
        res.send({
          data:{
            type: "notebooks",
            id: req.params.id,
            attributes: {
              isPublic: false,
              username: notebook.username
            }
          }
        });
      }
    });
  })

  app.get('/userapi/rusages', setJsonApiHeader(), function(req, res){
    res.setHeader('content-type', 'application/vnd.api+json')
    models.Rusage.find({},function(err,rusages) {
      if(err) {
        res.send({ errors: [err] });
      }
      else {
        res.send({ data: rusages.map(models.rusageResObj) });
      }
    });
  })

  app.get('/userapi/rusages/:username', setJsonApiHeader(), function(req, res){
    res.setHeader('content-type', 'application/vnd.api+json')
    models.getRusage(req.params.username, function(err,rusage) {
      if(err) {
        res.send({ errors: [ err ] });
      } else { // hide if rusage.username != selfUserName(req)??
        res.send({
          data: rusageResObj(rusage)
        });
      }
    });
  })
  
  function getMyself(username, next) {
    File.find({isPublic: true}, null, {sort: "user -updated_at"}, function(err,notebooks) {
      if(err) {
        next(err);
      } else {
        let username = selfUserName(req)
        if (!username) {
          next(null, {
            data: {
              type: "myself",
              id: 1,
              attributes: {
                username: ''
              },
              relationships: {
                user: null,
                visibleNotebooks: {
                  data: notebooks.map(notebookResId)
                }
              }
            },
            included: notebooks.map(notebookResObj)
          })
        } else {
          getUserInfo(username, username, function(err, userInfo) {
            if (err) {
              next(err)
            } else {
              var toInclude = notebooks.concat([user.data]).concat(userInfo.included.filter(function(x) {
                return x.type != "notebook" || !x.isPublic
              }));
              next(null,{
                data: {
                  type: "myselfs",
                  id: 1,
                  attributes: {
                    username: username
                  },
                  relationships: {
                    user: {
                      data: { type: "users", id: username }
                    },
                    rusage: {
                      data: userInfo.data.relationships.rusage
                    },
                    visibleNotebooks: {
                      data: notebooks.map(models.notebookResId)
                    }
                  }
                },
                included: toInclude
              });
            }
          });
	}
      }
    });
  }

  app.get('/userapi/myselfs', setJsonApiHeader(), function(req,res) {
    getMyself(selfUserName(req), function(err, myself) {
      if (err) {
        res.send({ errors: [err] })
      } else {
        res.send({
          data: [ myself.data ],
          included: myself.included
        });
      }
    });
  });

  app.get('/userapi/myselfs/:id', setJsonApiHeader(), function(req,res) {
    if (req.params.id == "1") {
      getMyself(selfUserName(req), function(err, myself) {
        if (err) {
          res.send({ errors: [err] })
        } else {
          res.send({
            data: [ myself.data ],
            included: myself.included
          });
        }
      })
    } else {
      res.send({
        data: null
      })
    }
  });

  app.get('/userapi/myselfs/1/username', setJsonApiHeader(), function(req, res){
    res.send(selfUserName(req))
  });

  app.get('/userapi/users/:username', setJsonApiHeader(), function(req, res){
    var selfName = selfUserName(req)
    let username = req.params.username;
    getUserInfo(username, selfName, function(err, userInfo) {
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
}
