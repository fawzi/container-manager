const stringify = require('json-stringify-safe');
const http = require('http');
const fs = require('fs');
module.exports = function (config, k8, k8component) {
const reloadMsg = `<html><head><title>Starting up!</title><meta http-equiv="refresh" content="${config.app.pageReloadTime}" ></head><body><h3>Please wait while we start a container for you!</h3></body></html>`;
var ProxyRouter = function(options) {
  if (!options.backend) {
    throw "ProxyRouter backend required. Please provide options.backend parameter!";
  }

  this.client    = options.backend;
  this.cache_ttl = (options.cache_ttl || 10) * 1000;
  this.cache     = {};
  this.state_info = {};
  //State is only for debug and not used at the moment
  this.stateEnum = {
    STARTING: 1,
    STARTED: 2,
    AVAILABLE: 3,
    STOPPED: 4
  };
  if (Object.freeze)
    Object.freeze(this.stateEnum);
  console.log("ProxyRouter cache TTL is set to " + this.cache_ttl + " ms.");
};

ProxyRouter.prototype.kubernetesServiceLookup = function(req, res, userID, isWebsocket, path, next) { //Kubernetes service names are based
  var self = this;

  function createService(userID) {
    self.set_user_state(userID,self.stateEnum.STARTING);
    k8.ns(config.k8component.namespace).service.get('beaker-svc-'+userID,function(err, result) {
      if(err)
        k8.ns(config.k8component.namespace).service.post({ body: k8component('service', userID)}, function(err, result){
          if(err){
            console.log("#ERROR# Can't start service for the user: " + userID);
            console.log(stringify(err, null, 2));
          }
          else
            createReplicationController(userID);
        });
      else
        createReplicationController(userID);
    });
  };

  function guaranteeDir(path, next) {
      fs.access(path, fs.constants.F_OK | fs.constants.R_OK, (err) => {
          if(err){
              fs.mkdir(path, parseInt('2775', 8), (err) => {
                  if(err) throw err;
                  fs.chown(path, 1000, 1000, (err) => {
                      if (err)
                          console.log('Dir '+ path + ' created, error in chown: ' + JSON.stringify(err));
                      else
                          console.log('Dir correctly created:' + path);
                      next();
                  });
              });
          } else {
              next();
          }
      });
  }

  function guaranteeUserDir(userID, next) {
      //Async version needs to be tested thorougly
      guaranteeDir(config.userInfo.sharedDir + '/' + userID, function() {
          guaranteeDir(config.userInfo.privateDir + '/' + userID, function() {
              next();
          });
      });
  }

  function createReplicationController(userID) {
//	createUserDir(userID); //Kubernetes can handle it, but the permissions can be problamatic
    k8.ns(config.k8component.namespace).replicationcontrollers.get('beaker-rc-'+userID, function(err, result) {
      if(err)
        k8.ns(config.k8component.namespace).replicationcontrollers.post({ body: k8component('replicationController', userID)}, function(err, result){
          if(err){
            console.log("#ERROR# Can't start replication controller for the user: " + userID);
            console.log(stringify(err, null, 2));
          }
          else
          getServicePort(userID);
        });
      else
        getServicePort(userID);
    });
  };

  function getServicePort(userID) {
    self.set_user_state(userID,self.stateEnum.STARTED);
    k8.ns(config.k8component.namespace).service.get('beaker-svc-'+userID,function(err, result) {
      if(err){
        console.log("#ERROR# Can't find service for the user: " + userID);
        console.log(stringify(err, null, 2));
      }
      else{
          var target= {host: config.k8Api.node, port: result.spec.ports[0].nodePort};
//          console.log(`Resolved using kubernetes to ${stringify(target)}`)
          var writeTarget = stringify(target);
          var cb = function(){
            http.request({method:'HEAD',host:target.host,port:target.port,path: '/'}, (r) => {
                if(r.statusCode >= 200 && r.statusCode < 400 ){
//                  console.log("Forwarding to the target!")
                  self.set_user_state(userID,self.stateEnum.AVAILABLE);
                  self.set_user_last_success(userID, Date.now());
                  next(target);
                }
            }).setTimeout(1000).on('error', (err) => {
              self.push_user_error(userID, err.message);
              self.clear_user_state(userID);
//              console.log("Sending message back to the browser!")
              if (!isWebsocket){
                res.send(reloadMsg);
              }
            }).end();
          }
          self.client.hset(userID, path, writeTarget,cb);
        }
    });
  };
  function writeToDisk(userID){
    fs.writeFile("service.json", stringify(k8component('service', userID), null, 2), function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The service file was saved!");
    });
    fs.writeFile("rc.json", stringify(k8component('replicationController', userID), null, 2), function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The rc file was saved!");
    });
  }
//    writeToDisk(userID);
    guaranteeUserDir(userID, function() { createService(userID) });
};
// The decision could be made using the state machine instead of the
ProxyRouter.prototype.lookup = function(req, res, userID, isWebsocket, path, next) {
//  console.log("Looking up the path! " + req.path)
  var self = this;
  if ( self.cache[userID] && self.cache[userID][path]) {
    var target = self.cache[userID][path];
//    console.log(`Resolved using local cache to ${stringify(target)}`)
    next(target);
  }
  else {
    //Check if the path has been defined in the redis client otherwise get it from kubernetes
    self.client.hget(userID, path, function(err, data) {
      if (data) {
        var target = JSON.parse(data);
//        console.log(`Resolved using redis cache to ${stringify(target)}`)
        // Set cache and expiration
        if (self.cache[userID] === undefined){
          self.cache[userID] = { path: target }
        }
        else{
          self.cache[userID][path] = target;
        }
        self.expire_route(userID, self.cache_ttl);
        http.request({method:'HEAD',host:target.host,port:target.port,path: '/'}, (r) => {
          if(r.statusCode >= 200 && r.statusCode < 400 ){
//            console.log("Forwarding to the target!");
            self.set_user_state(userID,self.stateEnum.AVAILABLE);
            next(target);
          } else {
            self.expire_route(userID, 0);
            self.push_user_error(userID, err.message);
            self.clear_user_state(userID);
            self.client.hdel(userID, path, () =>{});
//            console.log("Sending message back to the browser!")
            if (!isWebsocket) {
              res.send(reloadMsg);
            }
          }
        }).setTimeout(1000).on('error', (err) => {
          self.expire_route(userID, 0);
          self.push_user_error(userID, err.message);
          self.clear_user_state(userID);
          self.client.hdel(userID, path, () =>{});
//          console.log("From error! Sending message back to the browser!")
          if (!isWebsocket) {
            res.send(reloadMsg);
          }
        }).end();

      } else { //Else of path check in redis client
        //Lookup target from Kubernetes
//        console.log(`Cant resolve using redis cache!!`)
        self.kubernetesServiceLookup(req, res, userID, isWebsocket, path, next);
      }
    });
  }
};


ProxyRouter.prototype.flush_state_info = function() {
  this.state_info = {};
};

ProxyRouter.prototype.clear_user_state = function(userID) {
//  console.log("Changing state to: STOPPED" )
  if (!this.state_info[userID] === undefined)
    this.state_info[userID]['STATE'] = this.stateEnum.STOPPED;
};

ProxyRouter.prototype.set_user_state = function(userID, state) {
//  console.log("Changing state to: " + state)
  if (this.state_info[userID] === undefined)
    this.state_info[userID] = { STATE: state }
  else
    this.state_info[userID]['STATE'] = state;
};

ProxyRouter.prototype.set_user_last_success = function(userID, s) {

  if (this.state_info[userID] === undefined)
    this.state_info[userID] = { LASTSUCCESS: s }
  else
    this.state_info[userID]['LASTSUCCESS'] = s;
};

ProxyRouter.prototype.push_user_error = function(userID, err) {
  if (this.state_info[userID] === undefined)
    this.state_info[userID] = { ERROR: [err] };
  else if (this.state_info[userID]['ERROR'] === undefined)
    this.state_info[userID]['ERROR'] = [err] ;
  else
    this.state_info[userID]['ERROR'].unshift(err);
  while(this.state_info[userID]['ERROR'].length > config.app.maxErrorQueue){
    this.state_info[userID]['ERROR'].pop();
  }
};

ProxyRouter.prototype.expire_route = function(hostname, ttl) {
  var self = this;
  setTimeout(function() {
    self.flush_route(hostname);
  }, ttl);
};

ProxyRouter.prototype.flush = function() {
  this.cache = {};
};

ProxyRouter.prototype.flush_route = function(hostname) {
  delete(this.cache[hostname]);
};

ProxyRouter.prototype.expire_route = function(hostname, ttl) {
  var self = this;
  setTimeout(function() {
    self.flush_route(hostname);
  }, ttl);
};

return(ProxyRouter);
};
