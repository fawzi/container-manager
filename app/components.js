config = require('config')
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const baseDir = path.resolve(__dirname, '..')
const cconfig = config.k8component
const userSettings = require('./userSettings')
const crypto = require('crypto');

var baseRepl = {
  baseDir: baseDir
};
for (k in config.app.baseReplacements)
  repl[k] = baseRepl[k];
const templatesDir = handlebars.compile(config.app.templatesDir)(baseRepl)
baseRepl['templatesDir'] = templatesDir
baseRepl['namespace'] = cconfig.namespace

// Given a path loads it and compiles a template for it, use loadTemplate that has caching
function loadTemplateInternal(templatePath, next) {
  const templateRealPath = path.join(templatesDir, templatePath || "defaultTemplate.yaml")
  fs.readFile(templateRealPath, 'utf8', function(err, data) {
    if (err) {
      err.message = err.message + ` loading ${templateRealPath}`
      next(err,null)
    } else {
      const template = handlebars.compile(data)
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
        console.log(`refresh of template ${key} failed with ${JSON.stringify(err)}`)
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
        console.log(`template ${templatePath} loading failed with ${JSON.stringify(err)}, putting null`)
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

// evaluates a template
function evalTemplate(templatePath, extraRepl, next) {
  loadTemplate(templatePath, function (err, template) {
    if (err) {
      next(err, null)
    } else {
      const repl = Object.assign({}, extraRepl, baseRepl)
      const res = template(repl)
      //console.log(`evaluating <<${data}>> with ${JSON.stringify(repl)} gives <<${res}>>`)
      next(null, res, repl)
    }
  })
}

function namespaceTemplate(name, next) {
  evalTemplate("namespace.yaml", { namespace: name }, next)
}

/// returns a short session ID from a long session id
function shortSession(sessionID) {
  const hash = crypto.createHash('sha512');
  hash.update(req.sessionID)
  return hash.digest('base64').slice(0,14).replace('+','-').replace('/','_')
}

/// returns the name of the pod for the give user/session
function podNameForImageType(imageType, user, shortSession) {
  var session = cconfig.images[imageType].containerPerSession
  if (session !== true && session !== false)
    session = cconfig.containerPerSession
  if (session)
    return `${imageType}-${user}-${shortSession}`
  else
    return`${imageType}-${user}`
}

/// returns the keys (user,...) for the given pod name
function infoForPodName(podName) {
  const imageType = podName.slice(0,podName.indexOf('-'))
  var session = cconfig.images[imageType].containerPerSession
  if (session !== true && session !== false)
    session = cconfig.containerPerSession
  if (session)
    return {
      imageType: imageType,
      user: podName.slice(imageType.length + 1, podName.length - 15),
      shortSession: podName.slice(podName.length - 14)
    }
  else
    return {
      imageType: imageType,
      user: podName.slice(imageType.length + 1)
    }
}

/// gives the replacements for the image type and user
function replacementsForImageType(imageType, user, shortSession, extraRepl, next) {
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
  addRepl(cconfig.images[imageType])
  const userRepl = userSettings.getAppSetting(user, 'image:' + imageType)
  addRepl(userRepl)
  // extraRepl overrides even protected values
  if (extraRepl)
    for (k in extraRepl)
      repl[k] = extraRepl[k]
  // "real" user imageType and podName overrided everything
  repl['user'] = user
  repl['imageType'] = imageType
  repl['shortSession'] = shortSession
  repl['podName'] = podNameForImageType(imageType, user, shortSession)

  next(null, repl)
}

function templateForImageType(imageType, user, shortSession, extraRepl, next) {
  replacementsForImageType(imageType, user, shortSession, extraRepl, function(err, repl) {
    if (err)
      next(err, null, null)
    else
      evalTemplate(repl['templatePath'], repl, next)
  })
}

module.exports = {
  evalTemplate: evalTemplate,
  namespaceTemplate: namespaceTemplate,
  shortSession: shortSession,
  replacementsForImageType: replacementsForImageType,
  podNameForImageType: podNameForImageType,
  infoForPodName: infoForPodName,
  templateForImageType: templateForImageType
}
