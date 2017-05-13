
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
      "name": "beaker-svc-"+user,
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
              "imagePullPolicy": "IfNotPresent",
              "volumeMounts": [
                {
                  "mountPath": "/raw-data",
                  "name": "raw-data-volume",
                  "readOnly": true
                },
                {
                  "mountPath": "/parsed",
                  "name": "parsed-data-volume",
                  "readOnly": true
                },
                {
                  "mountPath": "/normalized",
                  "name": "normalized-data-volume",
                  "readOnly": true
                },
                {
                  "mountPath": "/home/beaker/notebooks",
                  "name": "notebooks-data-volume"
                },
                {
                  "mountPath": config.userInfo.privateDirInContainer,
                  "name": "private-data-volume"
                },
                {
                  "mountPath": config.userInfo.sharedDirInContainer,
                  "name": "shared-data-volume",
                  "readOnly": true
                },
                {
                  "mountPath": config.userInfo.sharedDirInContainer + "/" + user,
                  "name": "my-shared-data-volume"
                }
              ]
            }
          ]
          ,
          volumes: [
            {
              "name": "parsed-data-volume",
              "hostPath": { "path": "/nomad/nomadlab/parsed" }
            },
            {
              "name": "raw-data-volume",
              "hostPath": { "path": "/nomad/nomadlab/raw-data"}
            },
            {
              "name": "normalized-data-volume",
              "hostPath": { "path": "/nomad/nomadlab/normalized" }
            },
            {
              "name": "notebooks-data-volume",
              "hostPath": { "path": "/nomad/nomadlab/beaker-notebooks/notebooks" }
            },
            {
              "name": "private-data-volume",
              "hostPath": { "path": config.userInfo.privateDir + '/' + user }
            },
            {
              "name": "shared-data-volume",
              "hostPath": { "path": config.userInfo.sharedDir }
            },
			{
              "name": "my-shared-data-volume",
              "hostPath": { "path": config.userInfo.sharedDir + '/' + user }
            }
          ]
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
