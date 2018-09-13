const SamlStrategy = require('passport-saml').Strategy;
const LocalStrategy = require('passport-local').Strategy
const logger = require('./logger')
const stringify = require('json-stringify-safe');

module.exports = function (passport, config) {

  passport.serializeUser(function (user, done) {
    done(null, user);
  });

  passport.deserializeUser(function (user, done) {
    done(null, user);
  });

  const strategies={}
  if (config.passport.strategy === "saml") {
    logger.info(`Using saml strategy`)
    const samlStrategy = new SamlStrategy(
      {
        path: config.passport.saml.path,
        entryPoint: config.passport.saml.entryPoint,
        issuer: config.passport.saml.issuer,
        logoutUrl: config.passport.saml.logoutUrl,
        logoutCallback: config.passport.saml.logoutCallback,
        identifierFormat: config.passport.saml.identifierFormat,
        acceptedClockSkewMs: -1
      },
      function (profile, done) {
        logger.info(`profile: ${stringify(profile)}`)
        return done(null,
                    {
                      id: profile.uid,
                      email: profile.email,
                      displayName: profile.cn,
                      firstName: profile.givenName,
                      lastName: profile.sn,
                      nameID: profile.nameID,
                      nameIDFormat: profile.nameIDFormat,
                      sessionIndex: profile.sessionIndex
                    });
      })
    strategies['saml'] = samlStrategy
    passport.use('saml', samlStrategy);
  } else if (config.passport.strategy === "local") {
    logger.info(`Using local strategy`)
    const localStrategy = new LocalStrategy({
      usernameField : 'username',
      passwordField : 'password',
      passReqToCallback: false
    }, function(username, password, done) {
      logger.debug(`entering verification callback`)
      const pass = config.passport.users[username]
      if (pass === undefined) {
        logger.warn(`unknonw user ${username}`)
        return done(null, false, { message: 'Unknown user.' });
      } else if (pass == password) {
        logger.debug(`successful login for ${username}`)
        return done(null, {
          id: username,
          email: username+"@nowhere",
          displayName: username,
          firstName: username,
          lastName: "None"})
      } else {
        logger.warn(`failed login for ${username}`)
        return done(null, false, { message: 'Incorrect password.' });
      }
    })
    strategies['local'] = localStrategy
    passport.use('local', localStrategy);
  } else {
    throw "Invalid passport strategy: ${config.passport.strategy}"
  }
  return strategies
};
