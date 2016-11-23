
module.exports = function (config) {

var createNamespaceConfig = function(user) {
  const namespace =  {
    "kind": "Namespace",
    "apiVersion": "v1",
    "metadata": {
     "name": user
    }
  };
  return(namespace);
};

var createServiceConfig = function(user) {
  const service= {
    "kind": "Service",
    "apiVersion": "v1",
    "metadata": {
      "name": "beaker-sv-"+user,
//      "namespace": user,
      "labels": {
        "user": user,
        "app": "beaker"
      }
    },
    "spec":{
      "type": "NodePort",
      "ports":[{
        "port": 8801,
        "name": "beaker-port",
        "targetPort": 8801,
        "protocol": "TCP"
      }],
      "selector":{
        "user": user,
        "app": "beaker"
        }
    }
  };
  return(service);
};

var createRcControllerConfig = function(user) {
  const rcController = {
    "apiVersion": "v1",
    "kind": "ReplicationController",
    "metadata": {
      "name": "beaker-rc-"+user,
//      "namespace": user,
      "labels": {
        "user": user,
        "app": "beaker"
      },
    },
    "spec": {
      "replicas": 1,
      "selector":{
        "user": user,
        "app": "beaker"
        },
      "template": {
        "metadata": {
          "labels": {
            "user":user,
            "app": "beaker"
          }
        },
        "spec": {
          "containers": [
            {
              "image": config.k8component.image,
              "name": "beaker",
              "ports": [
                {
                  "containerPort": 8801,
                  "name": "main-port",
                  "protocol": "TCP"
                }
              ],
              "imagePullPolicy": "IfNotPresent"
//              ,
//              "volumeMounts": [
//                {
//                  "mountPath": "/raw-data",
//                  "name": "raw-data-volume",
//                  "readOnly": true
//                },
//                {
//                  "mountPath": "/parsed",
//                  "name": "parsed-data-volume",
//                  "readOnly": true
//                },
//                {
//                  "mountPath": "/normalized",
//                  "name": "normalized-data-volume",
//                  "readOnly": true
//                },
//                {
//                  "mountPath": "/data",
//                  "name": "user-data-volume"
//                },
//                {
//                  "mountPath": "/home/beaker/notebooks",
//                  "name": "notebooks-volume"
//                }
//              ]
            }
          ]
//          ,
//          volumes: [
//            {
//              "name": "parsed-data-volume",
//              "hostPath": { "path": "/nomad/nomadlab/parsed" }
//            },
//            {
//              "name": "raw-data-volume",
//              "hostPath": { "path": "/nomad/nomadlab/raw-data"}
//            },
//            {
//              "name": "normalized-data-volume",
//              "hostPath": { "path": "/nomad/nomadlab/normalized" }
//            },
//            {
//              "name": "user-data-volume",
//              "hostPath": { "path": "/nomad/nomadlab/kubernetes/user-data/{{user}}" }
//            },
//            {
//              "name": "notebooks-volume",
//              "hostPath": { "path": "/nomad/nomadlab/beaker-notebooks/notebooks"}
//            }
//          ]
        }
      }
    }
  };
  return(rcController);
};

const getk8componentConfig = function (k8component,k8componentName) {
  if(k8component === "namespace")
    return(createNamespaceConfig(k8componentName))
  else if (k8component === "service")
   return(createServiceConfig(k8componentName))
  else if (k8component === "replicationController")
   return(createRcControllerConfig(k8componentName))
};

return(getk8componentConfig);
};