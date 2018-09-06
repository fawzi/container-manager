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
    console.log(`Using saml strategy`)
    passport.use('saml',new SamlStrategy(
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
    console.log(`Using local strategy`)
    passport.use('local',new LocalStrategy({
      usernameField : 'username',
      passwordField : 'password',
      passReqToCallback: false
    }, function(username, password, done) {
      console.log(`entering verification callback`)
      const pass = config.passport.users[username]
      if (pass === undefined) {
        console.log(`unknonw user ${username}`)
        return done(null, false, { message: 'Unknown user.' });
      } else if (pass == password) {
        console.log(`successful login for ${username}`)
        return done(null, {
          id: username,
          email: username+"@nowhere",
          displayName: username,
          firstName: username,
          lastName: "None"})
      } else {
        console.log(`failed login for ${username}`)
        return done(null, false, { message: 'Incorrect password.' });
      }
    }));
  } else {
    throw "Invalid passport strategy: ${config.passport.strategy}"
  }
};