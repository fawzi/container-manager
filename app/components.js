
module.exports = function (config) {
  const handlebars = require('handlebars');
  const fs = require('fs');
  const path = require('path');
  const baseDir = path.resolve(__dirname, '..')
  const cconfig = config.k8component
  const userSettings = require('userSettings')
  
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
    limit = cconfig.templateCacheNMax,
    opts.maxTTL = cconfig.templateCacheTtlMaxMs,
    refreshF = function(key, value) {
      loadTemplateInternal(key, function(err, t) {
        if (err) {
          console.log(`refresh of template ${key} failed with ${JSON.stringify(err)}, keeping old value`)
          this.set(key, value)
        } else {
          this.set(key,t)
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
          this.set(templatePath, t)
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

  /// Returns the template corrsponding 
  function templateForImageType(imageType, user, extraRepl, next) {
    var repl = {}
    var keysToProtect = new Set()
    var toSkip
    function addRepl(dict) {
      if (dict.keysToSkip)
        toSkip = new Set([...keysToProtect, ...dict.keysToSkip])
      else
        toSkip = new Set(keysToProtect)
      for (k in cconfig)
        if (!toSkip.has(k))
          rep[k] = config[k]
      if (dict.keysToProtect)
        for (k in dict.keysToProtect)
          keysToProtect.add(k)
    }
    addRepl(cconfig)
    addRepl(cconfig[imageType])
    const userRepl = userSettings.getSettings(user, 'image:' + imageType)
    addRepl(userRepl)
    // extraRepl overrides even protected values
    for (k <- extraRepl)
      repl[k] = userRepl[k]
    // and the "real" user overrided everything
    repl['user'] = user

    evalTemplate(repl['templatePath'], repl, next)
  }

  return {
    evalTemplate: evalTemplate,
    namespaceTemplate: namespaceTemplate,
    templateForImageType: templateForImageType
  }
}
