
module.exports = {
  development: {
    specialUsers: { },
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 80,
      secret: 'theTreeInFront',
      localOverride: '/localoverride',
      maxErrorQueue: 10,
      redisTimeout: 3600,
      localCacheTimeout: 10,
      pageReloadTime: 5,
      frontendAddr: 'http://127.0.0.1:4200',
      baseUri: 'http://127.0.0.1',
      catchErrors: false
    },
    mongoDb: {
      url: 'mongodb://localhost/filedatabase'
    },
    k8Api: {
      url: 'https://192.168.99.100:8443',
      ca: process.env.HOME + '/.minikube/ca.crt',
      cert: process.env.HOME + '/.minikube/apiserver.crt',
      key: process.env.HOME + '/.minikube/apiserver.key',
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
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://idp.nomad-coe.eu/idp/profile/SAML2/Redirect/SSO',
        issuer: 'http://172.24.131.117/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      images: {
	  beaker: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.8.0-305-gaf64b6eb-dirty',
	      port: 8801,
	      prefix: '/beaker',
	      homePath: '/home/beaker'
	  },
	  jupyter: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook-jupyter-libatoms-tutorial:v0.4',
	      port: 8888,
	      prefix: '/jupyter',
	      homePath: '/home/beaker'
	  },
	  creedo: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/creedo:v0.4.2-2017-09-29',
	      port: 8080,
	      prefix: '/Creedo',
	      homePath: '/home/creedo'
	  }
      }
    },
    userInfo: {
	  basePathToWatch: process.env.HOME + '/nomad/user-data',
      sharedDir: process.env.HOME + '/nomad/user-data/shared',
      privateDir: process.env.HOME + '/nomad/user-data/private',
	  privateDirInContainer: '/data/private',
	  sharedDirInContainer: '/data/shared',
	  mySharedDirInContainer: '/data/my-shared'
	}
  },
  labdev: {
    specialUsers: { },
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
      frontendAddr: 'https://labdev-nomad.esc.rzg.mpg.de:4200',
      baseUri: 'https://labdev-nomad.esc.rzg.mpg.de',
      catchErrors: false
    },
    mongoDb: {
      url: 'mongodb://labdev-nomad.esc.rzg.mpg.de/filedatabase'
    },
    redis: {
      port: 6390,
      host: 'labdev-nomad.esc.rzg.mpg.de'
    },
    k8Api: {
      url: 'https://130.183.207.101:6443',
      ca: '/usr/src/app/certs/ca.cert',
      cert: '/usr/src/app/certs/client.cert',
      key: '/usr/src/app/certs/client.key',
      node: 'labdev3-nomad.esc.rzg.mpg.de'
    },
    passport: {
      strategy: 'saml',
      saml: {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://idp.nomad-coe.eu/idp/profile/SAML2/Redirect/SSO',
        issuer: 'https://labdev-nomad.esc.rzg.mpg.de/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      images: {
	  beaker: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.8.0-305-gaf64b6eb-dirty',
	      port: 8801,
	      prefix: '/beaker',
	      homePath: '/home/beaker'
	  },
	  jupyter: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook-jupyter-libatoms-tutorial:v0.4',
	      port: 8888,
	      prefix: '/jupyter',
	      homePath: '/home/beaker'
	  },
	  creedo: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/creedo:v0.4.2-2017-09-29',
	      port: 8080,
	      prefix: '/Creedo',
	      homePath: '/home/creedo'
          },
	  remotevis: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook-jupyter-libatoms-tutorial',
	      port: 8888,
	      prefix: '/jupyter',
	      homePath: '/home/beaker'
	  }
      }
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
    specialUsers: {},
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
      frontendAddr: 'https://analytics-toolkit.nomad-coe.eu:4200',
      baseUri: 'https://analytics-toolkit.nomad-coe.eu',
      catchErrors: true
    },
	mongoDb: {
      url: 'mongodb://analytics-toolkit.nomad-coe.eu/filedatabase'
    },
    redis: {
      port: 6390,
      host: 'analytics-toolkit.nomad-coe.eu'
    },
    k8Api: {
      url: 'https://130.183.207.112:6443',
      node: 'nomad-flink-03.esc.rzg.mpg.de',
      ca: '/usr/src/app/certs/ca.cert',
      cert: '/usr/src/app/certs/client.cert',
      key: '/usr/src/app/certs/client.key'
    },
    passport: {
      strategy: 'saml',
      saml: {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://idp.nomad-coe.eu/idp/profile/SAML2/Redirect/SSO',
        issuer: 'https://analytics-toolkit.nomad-coe.eu/shibboleth',
        identifierFormat: null,
        acceptedClockSkewMs: -1
      }
    },
    k8component: {
      namespace: 'default',
      images: {
	  beaker: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook:v1.8.0-305-gaf64b6eb-dirty',
	      port: 8801,
	      prefix: '/beaker',
	      homePath: '/home/beaker'
	  },
	  jupyter: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/notebook-jupyter-libatoms-tutorial:v0.4',
	      port: 8888,
	      prefix: '/jupyter',
	      homePath: '/home/beaker'
	  },
	  creedo: {
	      image: 'labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/creedo:v0.4.2-2017-09-29',
	      port: 8080,
	      prefix: '/Creedo',
	      homePath: '/home/creedo'
	  }
      }
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
