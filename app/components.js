config = require('config')
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const baseDir = path.resolve(__dirname, '..')
const cconfig = config.k8component
const userSettings = require('./userSettings')
const crypto = require('crypto');
const url = require('url');
const compact_sha = require('./compact-sha')
const logger = require('./logger')
const stringify = require('json-stringify-safe')

var baseRepl = {
  baseDir: baseDir,
  baseUri: config.app.baseUri,
  baseUriPath: url.parse(config.app.baseUri).path
};
const br = config.app.baseReplacements
for (k in br)
   baseRepl[k] = br[k];

// Create a template from the given string
function templatize(str) {
  return handlebars.compile(str)
}

const templatesDir = templatize(config.app.templatesDir)(baseRepl)
baseRepl['templatesDir'] = templatesDir
baseRepl['namespace'] = cconfig.namespace
baseRepl['commands'] = templatize(cconfig.commands.path)(baseRepl)

// Given a path loads it and compiles a template for it, use loadTemplate that has caching
function loadTemplateInternal(templatePath, next) {
  const templateRealPath = path.join(templatesDir, templatePath || "kube/defaultTemplate.yaml")
  fs.readFile(templateRealPath, 'utf8', function(err, data) {
    if (err) {
      err.message = err.message + ` loading ${templateRealPath}`
      next(err,null)
    } else {
      const template = templatize(data)
      next(null, template)
    }
  })
}

const templateCache = require('../safe-memory-cache/map.js')({
  limit: cconfig.templateCacheNMax,
  maxTTL: cconfig.templateCacheTtlMaxMs,
  refreshF: function(key, value, cache) {
    loadTemplateInternal(key, function(err, t) {
      if (err) {
        logger.warn(`refresh of template ${key} failed with ${stringify(err)}`)
      } else {
        cache.set(key,t)
      }
    })
  }
})

// function that loads and and compiles a template, with caching
function loadTemplate(templatePath, next) {
  const v = templateCache.get(templatePath)
  if (v === undefined) {
    loadTemplateInternal(templatePath, function(err, t) {
      if (err) {
        logger.warn(`template ${templatePath} loading failed with ${stringify(err)}, putting null`)
        templateCache.set(templatePath, null)
        next(err, null)
      } else {
        templateCache.set(templatePath, t)
        next(null, t)
      }
    })
  } else {
    next(null, v)
  }
}

// evaluates a template, here only the most basic replacements are given, you normally need to pass in extraRepl.
// calls next with the resolved template plus all replacements defined
function evalTemplate(templatePath, extraRepl, next) {
  loadTemplate(templatePath, function (err, template) {
    if (err) {
      next(err, null, undefined)
    } else {
      const repl = Object.assign({}, extraRepl, baseRepl)
      const res = template(repl)
      //logger.debug(`evaluating <<${templatePath}>> with ${stringify(repl)} gives <<${res}>>`)
      next(null, res, repl)
    }
  })
}

// evaluates a template, here only the most basic replacements are given, you normally need to pass in extraRepl.
// calls next with the resolved template plus all replacements defined
function evalTemplate(templatePath, extraRepl, next) {
  loadTemplate(templatePath, function (err, template) {
    if (err) {
      next(err, null, undefined)
    } else {
      const repl = Object.assign({}, extraRepl, baseRepl)
      const res = template(repl)
      //logger.debug(`evaluating <<${templatePath}>> with ${stringify(repl)} gives <<${res}>>`)
      next(null, res, repl)
    }
  })
}

// Immediately returns an html describing the error
function getHtmlErrorTemplate(err, context = '') {
  let error = '', error_msg = '', error_detail = ''
  if (!err) {
    try {
      error_detail = stringify(err, null, 2)
      error = err.error || ''
      error_msg = error.message || ''
    } catch(e) {
    }
    return `<!doctype html>
      <html>
      <head>
      <title>Error ${error}</title>
      <meta charset="utf-8" />
      </head>
      <body>
      <h1>Error ${error}</h1>
      <h2>context</h2>
      <p>
      ${error_msg}
      </p>
      <pre>
      ${error_detail}
      </pre>
      </body>
      </html>`
  }
}

// Helper to evaluate a web page template (layout + content)
// will *always* give an html as result (it there was an error it describe the error
function evalHtmlTemplate(htmlPath, repl, next, layout = null, context = '') {
  const layout = repl.layout || "defaultTemplate.html"
  evalTemplate("html/"+htmlPath, repl, function (err, template){
    if (err) {
      next(err, getHtmlErrorTemplate(err, context))
    } else {
      const repl2 = Object.assign({title: htmlPath, head: ''}, repl, { body: template })
      evalHtmlTemplate("html/"+layout, repl2, function(err,res){
        if (err) {
          next(err, getHtmlErrorTemplate(err, context))
        } else {
          next(nil, res)
        }
      })
    }
  })
}

function namespaceTemplate(name, next) {
  evalTemplate("kube/namespace.yaml", { namespace: name }, next)
}

/// returns a short session ID from a long session id
function shortSession(sessionID) {
  const hash = crypto.createHash('sha512');
  hash.update(sessionID)
  // lowercase base32 would be better...
  return hash.digest('hex').slice(0,20).toLowerCase()
}


/// returns the name of the pod for the given replacements
function podNameForRepl(repl) {
  const imageType = cconfig.image.imageType
  const itypeRe = /^[a-z0-9]+$/

  if (!itypeRe.test(imageType))
    throw `imageType ${imageType} is invalid (not just lower case letters an numbers)`
  if (!itypeRe.test(repl.imageSubtype))
    throw `imageSubtype ${repl.imageSubtype} is invalid (not just lower case letters an numbers)`
  return `${imageType}-${repl.user}-${repl.imageSubtype}`
}

/// returns the keys (user,...) for the given pod name
function infoForPodName(podName) {
  const imageType = podName.slice(0,podName.indexOf('-'))
  const imageSubtype = podName.slice(podName.lastIndexOf('-') + 1, podName.length)
  const user = podName.slice(imageType.length + 1, podName.length - imageSubtype.length - 1)
  return {
    imageType: imageType,
    user: user,
    imageSubtype: imageSubtype
  }
}

/// gives the replacements for the user
function replacementsForUser(user, extraRepl, next) {
  var repl = {}
  var keysToProtect = new Set()
  var toSkip
  function addRepl(dict) {
    if (dict && dict.keysToSkip)
      toSkip = new Set([...keysToProtect, ...dict.keysToSkip])
    else
      toSkip = new Set(keysToProtect)
    for (k in dict)
      if (!toSkip.has(k))
        repl[k] = dict[k]
    if (dict && dict.keysToProtect)
      for (k in dict.keysToProtect)
        keysToProtect.add(k)
  }
  addRepl(cconfig)
  addRepl(cconfig.image)
  let imageType = cconfig.image.imageType
  const userRepl = userSettings.getAppSetting(user, 'image:' + imageType)
  addRepl(userRepl)
  // extraRepl overrides even protected values
  if (extraRepl)
    for (k in extraRepl)
      repl[k] = extraRepl[k]
  // "real" user imageType and podName overrided everything
  repl['user'] = user
  repl['imageType'] = imageType
  repl['podName'] = podNameForRepl(repl)
  delete repl.replacementsChecksum
  repl.replacementsChecksum = compact_sha.objectSha(repl)

  next(null, repl)
}

// returns the name of the logged in user
function selfUserName(req) {
  var selfName;
  try {
    selfName = req.user.id;
  } catch(e) {
    selfName = ''
  }
  return selfName
}

// returns the cached replacements if available, creating them if the entryPoint is not exclusive
function cachedReplacements(req, next) {
  let imageType = cconfig.image.imageType
  var repl = req.session.replacements
  if (repl)
    repl=repl[imageType]
  if (repl) {
    next(null, repl)
  } else if (!cconfig.entryPoint.exclusiveStartPoint) {
    replacementsForUser(selfUserName(req), {}, function(err, newRepl) {
      if (!req.session.replacements)
        req.session.replacements = {}
      req.session.replacements[imageType] = newRepl
      next(null, newRepl)
    })
  } else {
    next({ message: `no replacements defined, you need to visit first the entry point ${cconf.entryPoint.path}` }, undefined)
  }
}

function templateForImage(repl, next) {
  evalTemplate(repl['templatePath'], repl, next)
}

module.exports = {
  baseRepl: baseRepl,
  templatize: templatize,
  evalTemplate: evalTemplate,
  namespaceTemplate: namespaceTemplate,
  shortSession: shortSession,
  replacementsForUser: replacementsForUser,
  selfUserName: selfUserName,
  cachedReplacements: cachedReplacements,
  podNameForRepl: podNameForRepl,
  infoForPodName: infoForPodName,
  templateForImage: templateForImage
}
