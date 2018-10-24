const K8Api = require('kubernetes-client');
const fs = require('fs');
const config = require('config');
const Client = K8Api.Client;
const k8Config = K8Api.config;
const client = new Client({ config: k8Config.fromKubeconfig(config.k8Api.kubeconfig), version: '1.9' });

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

const k8 = client // new K8Api.Core(k8options);

module.exports = k8
