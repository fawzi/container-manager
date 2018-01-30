//const config = require('config')
//const redis = require('redis')

/// Returns the settings key of the given app and user
function getSetting(app, user, key) {
  return {}
}

/// Returns the settings of this app for the given user and key
function getAppSetting(user, key) {
  getSetting('container-manager', user, key)
}

module.exports = {
  getSetting: getSetting,
  getAppSetting: getAppSetting
}
