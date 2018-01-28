const repl = require('repl')
var env = process.env.NODE_ENV || 'development';
const config = require('./config/config')[env];
//config = require('config')
const k8 = require('./app/kubernetes')(config);
var ns = k8.ns(config.k8component.namespace)
function getService() {
  ns.service.get(config.k8component.imageType + '-svc-fawzi2')
}

const r = repl.start('> ');
r.context.config = config
r.context.k8 = k8
r.context.ns = ns
r.context.getService = getService
