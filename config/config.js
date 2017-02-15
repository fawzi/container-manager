
module.exports = {
  development: {
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 80,
      secret: 'theTreeInFront',
      localOverride: '/localoverride',
      maxErrorQueue: 10,
      redisTimeout: 3600,
      localCacheTimeout: 10,
      pageReloadTime: 5
    },
    k8Api: {
      url: 'https://192.168.99.100:8443',
      ca: '/.minikube/ca.crt',
      cert: '/.minikube/apiserver.crt',
      key: '/.minikube/apiserver.key',
      node: '192.168.99.100'
    },
    redis: {
      port: 6379,
      host: '127.0.0.1'
    },
    passport: {
      strategy: 'saml',
      saml: {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://nomad-login.csc.fi/idp/profile/SAML2/Redirect/SSO',
        issuer: 'http://172.24.131.117/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.4.0-77-g020d545'
    }
  },
  production: {
    app: {
      name: 'User container manager',
      port: process.env.PORT || 443,
      secret: 'theTreeInFrontIsReal',
      localOverride: '/localoverride',
      maxErrorQueue: 5,
      redisTimeout: 7200,
      localCacheTimeout: 30,
      pageReloadTime: 5
    },
    redis: {
      port: 6379,
      host: '130.183.207.77'
    },
    k8Api: {
      url: 'http://130.183.207.100:8080',
      node: '130.183.207.100'
    },
    passport: {
      strategy: 'saml',
      saml: {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://nomad-login.csc.fi/idp/profile/SAML2/Redirect/SSO',
        issuer: 'https://labdev-nomad.esc.rzg.mpg.de/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.5.0-22-g19a5972-dirty'
    }
  }
};
