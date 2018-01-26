//const config = require('config')
//const redis = require('redis')

function userSettings(app, user, key) {
  return {}
}

module.exports = {
  getOtherSetting: userSettings

  getSetting: function(user, key) {
    userSettings('container-manager', user, key)
  }
}
