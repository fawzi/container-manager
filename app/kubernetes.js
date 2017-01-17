const K8Api = require('kubernetes-client'),
      fs = require('fs');

module.exports = function (config) {
  var k8options = {
    url: config.k8Api.url,
    version: 'v1',  // Defaults to 'v1'
    namespace: 'default' // Defaults to 'default',
  }

  if(config.k8Api.ca){
    k8options.ca = fs.readFileSync(config.k8Api.ca);
    k8options.cert = fs.readFileSync(config.k8Api.cert);
    k8options.key = fs.readFileSync(config.k8Api.key);
  }

  const k8 = new K8Api.Core(k8options);

  function print(err, result) {
    console.log(JSON.stringify(err || result, null, 2));
  }

//  k8.ns('kube-system').po.get('kubernetes-dashboard-9k337', print);

  return(k8);

};