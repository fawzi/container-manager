const httpProxy = require('http-proxy');
const fs = require('fs');

module.exports = function (app, config, proxyServer, proxyRouter, k8, passport, passportInit, passportSession) {


  function makeid(){
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < 5; i++ )
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  function redirect(req, res, path, next) {
    var sess = req.session
    if (!sess.user) {
      sess.user = {};
      if(!sess.user.id)
        sess.user.id = 'user1';//makeid();
    }
      var route = {
        host: '192.168.99.100' ,
        port: 31382 
      }
//    proxyRouter.lookup('/beaker', sess.user, function(route) {
      if (route) {
        next(route);
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
//    });
  }

  app.get('/',function(req, res) {

    if (req.isAuthenticated()) {
          console.log('Normal req: '+JSON.stringify(req.headers, null, 2))
          console.log('Req session: '+JSON.stringify(req.session, null, 2))
          console.log('Req sessionID: '+JSON.stringify(req.sessionID, null, 2))
          console.log('Get index');
          console.log('Is auth: '+ req.isAuthenticated())
          var randomNumber=Math.random().toString();
          randomNumber=randomNumber.substring(2,randomNumber.length);
          res.cookie('nomadUser',req.user.email, { maxAge: 900000, httpOnly: false });
          fs.createReadStream('./index.html')
          .pipe(res);
        } else {
            res.redirect('/login');
        }
  });

  app.get('/login',
    passport.authenticate(config.passport.strategy,
      {
        successRedirect: '/',
        failureRedirect: '/login'
      })
  );

  app.post(config.passport.saml.path,
    passport.authenticate(config.passport.strategy,
      {
        failureRedirect: '/',
        failureFlash: true
      }),
    function (req, res) {
      res.redirect('/');
    }
  );

  app.get('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function (req, res) {
    redirect(req, res,'/beaker', function(route){
      proxyServer.web(req, res,{
        target: route,
        ws: true
      });
    });
  });

  app.post('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function (req, res) {
    redirect(req, res,'/beaker', function(route){
      proxyServer.web(req, res,{
        target: route,
        ws: true
      });
    });
  });

  app.put('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function (req, res) {
    redirect(req, res,'/beaker', function(route){
      proxyServer.web(req, res,{
        target: route,
        ws: true
      });
    });
  });

  app.delete('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function (req, res) {
    redirect(req, res,'/beaker', function(route){
      proxyServer.web(req, res,{
        target: route,
        ws: true
      });
    });
  });

//  var tagret = {
//    host: '192.168.99.100' ,
//    port: 31829
//  }
//  app.ws('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function(ws, req) {
//    ws.on('connection', function (socket) {
//      proxyServer.ws(req, socket, ws.head,{
//          target: target
//      });
//    });
//    ws.on('message', function(msg) {
//      ws.send(msg);
//    });
//  });
//
//  app.ws('/*', function(ws, req) {
//    ws.on('connection', function ( socket) {
//      proxyServer.ws(req, ws.socket, ws.head,{
//          target: target
//      });
//    });
//    ws.on('message', function(msg) {
//      ws.send(msg);
//    });
//  });


//  app.ws('/*', function(ws, req) {
//    console.log('Websocket call:' + ws );
//    console.log('Websocket call req:' + req );
//    redirect(req, res,'/beaker', function(route){
//      proxyServer.ws(req, ws.socket, ws.head,{
//        target: route
//      });
//    });
//  });

//  httpServer.on( 'upgrade', function( req, socket, head ) {
//    var sess = {};
//    if (!sess.user) {
//      sess.user = {};
//      if(!sess.user.id)
//        sess.user.id = 'user1';//makeid();
//    }
//    proxyRouter.lookup('/beaker', sess.user, function(route) {
//      if (route) {
//      route =  {
//        host: '192.168.99.100',
//        port: 31829
//      }
//      console.log("ws redirect to " + route)
//
//        proxyServer.ws(req, socket, head,
//        { target: route, ws: true });
//      }
//      else {
//          console.error("res.writeHead/res.end error: %s", er.message);
//      }
//    });
//  });


//    app.get('/b7c81a9*', function (req, res) {
//      var sess = req.session
//      if (!sess.user) {
//        sess.user = {};
//        if(!sess.user.id)
//          sess.user.id = 'user1';//makeid();
//
//      }
//      proxyRouter.lookup('/beaker', sess.user, function(route) {
//        if (route) {
//        console.log("Returned route:" + route)
//          proxyServer.web(req, res,{
//              target: route
//          });
//        }
//        else {
//          try {
//            res.writeHead(404);
//            res.end();
//          }
//          catch (er) {
//            console.error("res.writeHead/res.end error: %s", er.message);
//          }
//        }
//      });
//    });
//
//    app.ws('/b7c81a9*', function(ws, req) {
//      console.log(ws);
//      proxyRouter.lookup('/beaker', sess, function(route) {
//        if (route) {
//          proxyServer.ws(req, ws.socket, ws.head,{
//              target: route
//          });
//        }
//        else {
//          try {
//            res.writeHead(404);
//            res.end();
//          }
//          catch (er) {
//            console.error("res.writeHead/res.end error: %s", er.message);
//          }
//        }
//      });
//
//    });
};
