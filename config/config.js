
module.exports = {
  development: {
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 80,
      secret: 'theTreeInFront',
      localOverride: '/localoverride'
    },
    k8Api: {
      url: 'https://192.168.99.100:8443',
      ca: '/.minikube/ca.crt',
      cert: '/.minikube/apiserver.crt',
      key: '/.minikube/apiserver.key',
      node: '192.168.99.100'
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
      image: 'beakernotebook/beaker'
    }
  },
  production: {
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 443,
      secret: 'theTreeInFrontIsReal',
      localOverride: '/localoverride'
    },
    k8Api: {
      url: 'http://:',
      node: 'https://192.168.99.100'
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
      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.5.0-13-gee65fcc'
    }
  }
};
