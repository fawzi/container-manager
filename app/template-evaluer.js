const yaml = require('js-yaml')
const logger = require('./logger')
const fs = require('fs')
const stringify = require('json-stringify-safe')
const components = require('./components')

function mergeServices(s1,s2) {
  for (let k in s2) {
    if (!s1[k])
      s1[k] = []
    let vv = s1[k]
    s2[k].forEach(function(s) {
      vv.push(s) })
  }
}

exports.templateEvaluer = function(args) {
  let iarg = 0
  let inFile = ''
  let outFile = ''
  let replacements = {}
  const usage = `node ${args[1]} templateEvaluer [--template <template>] [--replacements <repl1.yaml> [--replacements <repl2.yaml>]...] [--out-file <evaluatedTemplate>]
    `
  while (iarg < args.length) {
    var arg = args[iarg]
    iarg += 1
    if (arg == '--help') {
      console.log(usage)
      process.exit(0)
      return;
    } else if (arg == '--template') {
      if (iarg >= args.length) {
        console.log(`Expected in file after --template, ${usage}`)
        process.exit(1)
        return;
      }
      inFile = args[iarg]
      iarg += 1
    } else if (arg == '--replacements') {
      if (iarg >= args.length) {
        console.log(`Expected a replacements file after --replacements, ${usage}`)
        process.exit(1)
        return;
      }
      let repl = yaml.safeLoad(fs.readFileSync(args[iarg]))
      mergeServices(replacements, repl)
      iarg += 1
    } else if (arg == '--out-file') {
      if (iarg >= args.length) {
        console.log(`Expected out file after --out-file, ${usage}`)
        process.exit(1)
        return;
      }
      outFile = args[iarg]
      iarg += 1
    } else {
      console.log(`unexpected argument ${arg}, ${usage}`)
      process.exit(1)
      return;
    }
  }
  if (inFile.length > 0) {
    let inF = fs.readFileSync(inFile, {encoding:'utf8'})
    let outF = components.templatize(inF)(replacements)
    if (outFile.length > 0)
      fs.writeFileSync(outFile, outF, { encoding: 'utf8'})
    else
      console.log(outF)
  }
  process.exit(0)
}
