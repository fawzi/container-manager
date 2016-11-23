
module.exports = {
  development: {
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 3000,
      secret: 'theTreeInFront'
    },
    k8Api: {
      url: 'https://192.168.99.100:8443',
      ca: '/home/kariryaa/.minikube/ca.crt',
      cert: '/home/kariryaa/.minikube/apiserver.crt',
      key: '/home/kariryaa/.minikube/apiserver.key',
      node: 'https://192.168.99.100'
    },
    k8component: {
      namespace: 'default',
      image: 'beakernotebook/beaker'
    },
    beaker: {
      hash: 'b7c81a9'
    }
  },
  production: {
    app: {
      name: 'Container per user manager',
      port: process.env.PORT || 3000,
      secret: 'theTreeInFrontIsReal'
    },
    k8Api: {
      url: 'http://:',
      node: 'https://192.168.99.100'
    },
    k8component: {
      namespace: 'default',
      image: 'beakernotebook/beaker'
    },
    beaker: {
      hash: 'b7c81a9'
    }
  }
};

A manager for containers. Written in nodejs.

Manages beaker, zeppelin and Creedo docker containers. Uses the container per type per user architecture.