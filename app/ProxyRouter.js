const vhttp = require('http');
module.exports = function (config,k8, k8component) {

var ProxyRouter = function(options) {
  if (!options.backend) {
    throw "ProxyRouter backend required. Please provide options.backend parameter!";
  }

  this.client    = options.backend;
  this.cache_ttl = (options.cache_ttl || 10) * 1000;
  this.cache     = {};

  console.log("ProxyRouter cache TTL is set to " + this.cache_ttl + " ms.");
};

ProxyRouter.prototype.kubernetesServiceLookup = function(userID, path, next) { //Kubernetes service names are based
  var self = this;

  function createService(userID) {
    k8.ns(config.k8component.namespace).service.get('beaker-svc-'+userID,function(err, result) {
      if(err)
        k8.ns(config.k8component.namespace).service.post({ body: k8component('service', userID)}, function(err, result){
          if(err){
            console.log("#ERROR# Can't start service for the user: " + userID);
            console.log(JSON.stringify(err, null, 2));
          }
          else
            createReplicationController(userID);
        });
      else
        createReplicationController(userID);
    });
  };

  function createReplicationController(userID) {
    k8.ns(config.k8component.namespace).replicationcontrollers.get('beaker-rc-'+userID, function(err, result) {
      if(err)
        k8.ns(config.k8component.namespace).replicationcontrollers.post({ body: k8component('replicationController', userID)}, function(err, result){
          if(err){
            console.log("#ERROR# Can't start replication controller for the user: " + userID);
            console.log(JSON.stringify(err, null, 2));
          }
          else
          getServicePort(userID);
        });
      else
        getServicePort(userID);
    });
  };

  function getServicePort(userID) {
    k8.ns(config.k8component.namespace).service.get('beaker-svc-'+userID,function(err, result) {
      if(err){
        console.log("#ERROR# Can't find service for the user: " + userID);
        console.log(JSON.stringify(err, null, 2));
      }
      else{
          var target= {host: config.k8Api.node, port: result.spec.ports[0].nodePort};
          self.cache[userID] = (self.cache[userID] === undefined) ?  {} : self.cache[userID];
          self.cache[userID][path] = target; //So you don't override other paths
          self.expire_route(userID, self.cache_ttl);
          var writeTarget = JSON.stringify(target);
          self.client.hset(userID, path, writeTarget,function(){next(target);});
        }
    });
  };
  function writeToDisk(userID){
    const fs = require('fs');
    fs.writeFile("service.json", JSON.stringify(k8component('service', userID), null, 2), function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The service file was saved!");
    });
    fs.writeFile("rc.json", JSON.stringify(k8component('replicationController', userID), null, 2), function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The rc file was saved!");
    });
  }
//    writeToDisk(userID);
  createService(userID);
};

ProxyRouter.prototype.lookup = function(userID, path, next) {
  var self = this;
  if (!self.cache[userID] || !self.cache[userID][path]) {
    //Check if the localOverride has been defined in the redis client
    self.client.hget(userID, config.app.localOverride, function(err, data) {
      if(data) { //If of "localOverride" check in redis client
        var target = JSON.parse(data);
        // Set cache and expiration
        if (self.cache[userID] === undefined)
          self.cache[userID] = { path: target }
        else
          self.cache[userID][path] = target;

        self.expire_route(userID, self.cache_ttl);
        next(target);
      }
      else {
        //Else of localOverride has not been defined, check if the path has been defined in the redis client otherwise get it from kubernetes
        self.client.hget(userID, path, function(err, data) {
          if (data) {
            var target = JSON.parse(data);
            // Set cache and expiration
            if (self.cache[userID] === undefined)
              self.cache[userID] = { path: target }
            else
              self.cache[userID][path] = target;

            self.expire_route(userID, self.cache_ttl);
            //HTTP Get to kubernetes to check if the svc still exists
            // Return target
            //Should check if its really the container of user ?
//              http.get({host: target.host + ':'+ target.port, path: '/'}, function(res){
//                const statusCode = res.statusCode;
//                if (statusCode !== 200) {
//                  console.log(`Request on ${JSON.stringify(target)} Failed.\n` +
//                                    `Status Code: ${statusCode}`);
//                }
//                res.on('end', function (chunk) {
//                  next(target);
//                });
//              }).on('error', function(err) {
//                   self.kubernetesServiceLookup(userID,path,next);
//                });
             next(target);

          }
          else { //Else of path check in redis client
            //Lookup target from Kubernetes
            self.kubernetesServiceLookup(userID,path,next);
          }
        });
      }
    });
  }
  else {
    var target = self.cache[userID][path];
    next(target);
  }
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