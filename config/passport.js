const SamlStrategy = require('passport-saml').Strategy;
const LocalStrategy = require('passport-local').Strategy

module.exports = function (passport, config) {

  passport.serializeUser(function (user, done) {
    done(null, user);
  });

  passport.deserializeUser(function (user, done) {
    done(null, user);
  });

  if (config.passport.strategy === "saml") {
    passport.use(new SamlStrategy(
      {
        path: config.passport.saml.path,
        entryPoint: config.passport.saml.entryPoint,
        issuer: config.passport.saml.issuer,
        identifierFormat: config.passport.saml.identifierFormat,
        acceptedClockSkewMs: -1
      },
      function (profile, done) {
        return done(null,
                    {
                      id: profile.uid,
                      email: profile.email,
                      displayName: profile.cn,
                      firstName: profile.givenName,
                      lastName: profile.sn
                    });
      }));
  } else if (config.passport.strategy === "local") {
    passport.use(new LocalStrategy(
      function(username, password, done) {
        const pass = config.passport.users[username]
        if (pass === undefined)
          return done(null, false, { message: 'Unknown user.' });
        else if (pass == password)
          return done(null, user)
        else
          return done(null, false, { message: 'Incorect password.' });
      }));
  } else {
    throw "Invalid passport strategy: ${config.passport.strategy}"
  }
};
