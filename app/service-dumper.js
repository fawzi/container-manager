const yaml = require('js-yaml')
const logger = require('./logger')
const fs = require('fs')
const k8D = require('./k8-data')

function mergeServices(s1,s2) {
  for (let k in s2) {
    if (!s1[k])
      s1[k] = []
    let vv = s1[k]
    for (let s in s2[k])
      vv.push(s)
  }
}

exports.serviceDumper = function(args) {
  let iarg = 0
  let inFile = ''
  let outFile = ''
  let namespace = 'default'
  let services = []
  const usage = `node ${args[1]} serviceDumper [--namespace <namespace>] [--in-file <input.yaml>] [--out-file <servicePorts.yaml>]

  input should be a yaml dictionary with the following keys:
    - namespace: the namespaces to dump (defaults to ['default'])
    - services: a list of the services to extract (defaults to all if not given)
    `
  while (iarg < args.length) {
    var arg = args[iarg]
    iarg += 1
    if (arg == '--help') {
      console.log(usage)
      return;
    } else if (arg == '--in-file') {
      if (iarg >= args.length) {
        console.log(`Expected in file after --in-file, ${usage}`)
        return;
      }
      inFile = args[iarg]
      iarg += 1
    } else if (arg == '--out-file') {
      if (iarg >= args.length) {
        console.log(`Expected out file after --out-file, ${usage}`)
        return;
      }
      outFile = args[iarg]
      iarg += 1
    } else if (arg == '--namespace') {
      if (iarg >= args.length) {
        console.log(`Expected namespace after --namespace, ${usage}`)
        return;
      }
      namespace = args[iarg]
      iarg += 1
    } else {
      console.log(`unexpected argument ${arg}, ${usage}`)
    }
  }
  if (inFile.length > 0) {
    let inF = yaml.safeLoad(fs.readFileSync(inFile))
    if (inF.namespace)
      namespace = inF.namespace
    if (inF.services)
      services = inF.services
  }
  k8D.getServiceInfo(namespace, function(err, ss){
    if (err)
      logger.warn(`error getting services for namespace ${namespace}`)
    else {
      let sss = ss
      if (services.length != 0){
        sss = {}
        for (let sName in services) {
          if (ss[sName])
            sss[sName] = ss[sName]
          else
            sss[sName] = []
        }
      }
      let res = yaml.safeDump(sss, {sortKeys: true})
      if (outFile.length > 0)
        fs.writeFileSync(outFile, res, {encoding:'utf8'})
      else
        console.log(res)
      process.exit(0)
    }
  })
}
