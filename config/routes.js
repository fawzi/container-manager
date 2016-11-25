const httpProxy = require('http-proxy');

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
        port: 31829
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

  var tagret = {
    host: '192.168.99.100' ,
    port: 31829
  }
  app.ws('/:foo(beaker|[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])/*', function(ws, req) {
    ws.on('connection', function (socket) {
      proxyServer.ws(req, socket, ws.head,{
          target: target
      });
    });
    ws.on('message', function(msg) {
      ws.send(msg);
    });
  });

  app.ws('/*', function(ws, req) {
    ws.on('connection', function ( socket) {
      proxyServer.ws(req, ws.socket, ws.head,{
          target: target
      });
    });
    ws.on('message', function(msg) {
      ws.send(msg);
    });
  });


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
