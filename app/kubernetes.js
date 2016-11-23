const K8Api = require('kubernetes-client'),
      fs = require('fs');

module.exports = function (config) {

  const k8 = new K8Api.Core({
    url: config.k8Api.url,
    version: 'v1',  // Defaults to 'v1'
    namespace: 'default', // Defaults to 'default',
    ca: fs.readFileSync(config.k8Api.ca),
    cert: fs.readFileSync(config.k8Api.cert),
    key: fs.readFileSync(config.k8Api.key)
  });

  function print(err, result) {
    console.log(JSON.stringify(err || result, null, 2));
  }

//  k8.ns('kube-system').po.get('kubernetes-dashboard-9k337', print);

  return(k8);

};