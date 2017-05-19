const fs = require('fs');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
const bodyParser = require('body-parser');

module.exports = function (app, config, passport,  models) {
  app.get('/userapi/login',
          passport.authenticate(config.passport.strategy,
                                {
                                  successReturnToOrRedirect: '/',
                                  failureRedirect: '/login'
                                })
         );

  app.get('/userapi/login/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });

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

  app.get('/userapi/myselfs', setJsonApiHeader(), function(req,res) {
    models.getMyself(selfUserName(req), function(err, myself) {
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
      models.getMyself(selfUserName(req), function(err, myself) {
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
    models.getUserInfo(username, selfName, function(err, userInfo) {
      if (err) {
        res.send(err)
      } else {
        res.send(userInfo);
      }
    });
  });

  app.get('/notebook-edit/*', function(req, res){
    const target = 'https://labdev-nomad.esc.rzg.mpg.de/beaker/#/open?uri=' + req.url.slice(14, req.url.length).replace("/","%2F")
    console.log(`notebook-edit redirecting to ${target}`)
    res.redirect(302, target);
  });

}
