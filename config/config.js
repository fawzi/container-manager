
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
      pageReloadTime: 5,
      frontendAddr: 'http://127.0.0.1:4200'
    },
    mongoDb: {
      url: 'mongodb://localhost/filedatabase'
    },
    k8Api: {
      url: 'https://192.168.99.100:8443',
      ca: process.env.HOME + '/.minikube/ca.crt',
      cert: process.env.HOME + '/.minikube/apiserver.crt',
      key: process.env.HOME + '/Users/kari/.minikube/apiserver.key',
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
    },
    userInfo: {
	  basePathToWatch: process.env.HOME + '/NOMAD/dirToWatch',
      sharedDir: process.env.HOME + '/NOMAD/dirToWatch/public',
      privateDir: process.env.HOME + '/NOMAD/dirToWatch/private',
	  privateDirInContainer: '/data/private',
	  sharedDirInContainer: '/data/shared',
	  mySharedDirInContainer: '/data/my-shared'
	}
  },
  labdev: {
    app: {
      name: 'User container manager',
      port: process.env.PORT || 443,
      secret: 'theTreeInFrontIsReal',
      localOverride: '/localoverride',
      maxErrorQueue: 5,
      redisTimeout: 7200,
      localCacheTimeout: 30,
      pageReloadTime: 5,
      ssl: {
        key: '/certs/pkey.pem',
        cert: '/certs/cert-7741588557007104.pem'
      },
      frontend: 'https://labdev-nomad.esc.rzg.mpg.de:4200'
    },
    mongoDb: {
      url: 'mongodb://labdev-nomad.esc.rzg.mpg.de/filedatabase'
    },
    redis: {
      port: 6390,
      host: 'labdev-nomad.esc.rzg.mpg.de'
    },
    k8Api: {
      url: 'http://labdev3-nomad.esc.rzg.mpg.de:8080',
      node: 'labdev3-nomad.esc.rzg.mpg.de'
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
      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.8.0-16-g2ac4412-dirty'
    },    
    userInfo: {
	  basePathToWatch: '/nomad/nomadlab/beaker-notebooks/user-data',
	  privateDir: '/nomad/nomadlab/beaker-notebooks/user-data/private',
	  sharedDir: '/nomad/nomadlab/beaker-notebooks/user-data/shared',
	  privateDirInContainer: '/data/private',
	  sharedDirInContainer: '/data/shared',
	  mySharedDirInContainer: '/data/my-shared'
	}
  },
  analyticsToolkit: {
    app: {
      name: 'User container manager',
      port: process.env.PORT || 443,
      secret: 'reallyTheTreeInFrontIsReal',
      localOverride: '/localoverride',
      maxErrorQueue: 5,
      redisTimeout: 7200,
      localCacheTimeout: 30,
      pageReloadTime: 5,
      ssl: {
        cert: '/certs/nomad-coe.eu.crt.pem',
        key: '/certs/nomad-coe.eu.key.pem'
      },
      frontend: 'https://analytics-toolkit.nomad-coe.eu:4200'
    },
	mongoDb: {
      url: 'mongodb://analytics-toolkit.nomad-coe.eu/filedatabase'
    },
    redis: {
      port: 6390,
      host: 'analytics-toolkit.nomad-coe.eu'
    },
    k8Api: {
      url: 'http://labdev3-nomad.esc.rzg.mpg.de:8080',
      node: 'labdev3-nomad.esc.rzg.mpg.de'
    },
    passport: {
      strategy: 'saml',
      saml: {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://nomad-login.csc.fi/idp/profile/SAML2/Redirect/SSO',
        issuer: 'https://analytics-toolkit.nomad-coe.eu/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.8.0-16-g2ac4412-dirty'
    },
    userInfo: {
	  basePathToWatch: '/nomad/nomadlab/beaker-notebooks/user-data',
	  privateDir: '/nomad/nomadlab/beaker-notebooks/user-data/private',
	  sharedDir: '/nomad/nomadlab/beaker-notebooks/user-data/shared',
	  privateDirInContainer: '/data/private',
	  sharedDirInContainer: '/data/shared',
	  mySharedDirInContainer: '/data/my-shared'
	}
  }
};
