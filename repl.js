const repl = require('repl')
const config = require('config');
const k8 = require('./app/kubernetes')(config);
const compontents = require('./app/components')
var ns = k8.ns(config.k8component.namespace)

function getService() {
  ns.service.get(config.k8component.imageType + '-svc-fawzi2')
}

const r = repl.start('> ');
r.context.config = config
r.context.k8 = k8
r.context.ns = ns
r.context.getService = getService
r.context.components = components
