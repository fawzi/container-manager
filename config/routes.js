const httpProxy = require('http-proxy');
const proxyServer = httpProxy.createServer({});
module.exports = function (app, config, proxyRouter, k8) {
  var expressWs = require('express-ws')(app);
  function makeid()
  {
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < 5; i++ )
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  }

  app.get('/beaker/*', function (req, res) {
    var sess = req.session
    if (!sess.id) {
        sess.id = makeid();
    }
    proxyRouter.lookup('/beaker', sess.id, function(route) {
      if (route) {
        proxyServer.web(req, res,{
            target: route
        });
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
  });

  app.ws('/beaker/*', function(ws, req) {
  console.log(ws);
    proxyServer.ws(req, ws.socket, ws.head,{
        target: route
    });
  });

  app.get('/profile', function (req, res) {
    if (req.isAuthenticated()) {
      res.render('profile',
        {
          user: req.user
        });
    } else {
      res.redirect('/login');
    }
  });

  app.get('/logout', function (req, res) {
    req.logout();
    // TODO: invalidate session on IP
    res.redirect('/');
  });

};
