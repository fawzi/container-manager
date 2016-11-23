
module.exports = function (config,k8) {

var ProxyRouter = function(options) {
  if (!options.backend) {
    throw "ProxyRouter backend required. Please provide options.backend parameter!";
  }

  this.backend   = options.backend;
  this.cache_ttl = (options.cache_ttl || 10) * 1000;
  this.cache     = {};

  console.log("ProxyRouter cache TTL is set to " + this.cache_ttl + " ms.");
};

ProxyRouter.prototype.lookup = function(path, user, callback) {
  var self = this;
  var resolved = false;
  if (!this.cache[user.id]) {
    this.backend.hget('routes', user.id, function(err, data) {
      if (data && data[path]) {
          // Set cache and expiration
          var target = data[path];
          self.cache[user.id] = {path : target};
          self.expire_route(user.id, self.cache_ttl);
          resolved =true;
          // Return target
          callback(target);
        }
      });
  }
  if(!resolved){
    async.waterfall([
      //Check if service exists
      function(next) {
        k8.ns(config.k8component.namespace).service.get('beaker-sv-'+user.id, next);
      },
      //Create the service if its not present
      function(err,result,next) {
        if(err && err.code == 404){
          k8.ns(config.k8component.namespace).service.post({ body: k8component('service', user.id)}, next);
        }
        else next(null, err,result);
      },
      //Check if service exists
      function(err,result,next) {
        k8.ns(config.k8component.namespace).replicationcontrollers.get('beaker-rc-'+user.id, next);
      },
      //Create the rc-controller if its not present
      function(err,result,next) {
        if(err && err.code == 404){
          k8.ns(config.k8component.namespace).replicationcontrollers.post({ body: k8component('replicationController', user.id)}, next);
        }
        else next(null, err,result);
      },
      function(err,result, next){
        k8.ns(config.k8component.namespace).service.get('beaker-sv-'+user.id,function(err, result){
          var target = config.app.node+':'+result.spec.ports[0].nodePort;
          self.cache[user.id] = {path : target};
          self.expire_route(user.id, self.cache_ttl);
          callback(target);
        });
      }
    ], function(next) {
      console.log(next);
    });
  }
};

ProxyRouter.prototype.lookup_ori = function(hostname, callback) {
  var self = this;
  if (!this.cache[hostname]) {
    client.hget('routes', hostname, function(err, data) {
      if (data) {
        // Lookup route
        var route = data.split(':');
        var target = {host: route[0], port: route[1]};

        // Set cache and expiration
        self.cache[hostname] = target;
        self.expire_route(hostname, self.cache_ttl);

        // Return target
        callback(target);
      }
      else {
        callback(null);
      }
    });
  }
  else {
    callback(this.cache[hostname]);
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