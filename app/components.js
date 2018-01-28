
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
  var imageType = config.k8component.imageType
  var imageInfo = config.k8component.images[imageType]
  if (!imageInfo)
      throw new Error(`could not fing image ${imageType} in ${JSON.stringify(imageInfo)}`)
  const service= {
    "kind": "Service",
    "apiVersion": "v1",
    "metadata": {
      "name": imageType + "-svc-"+user,
      "labels": {
        "user": user,
        "app": imageType
      }
    },
    "spec":{
      "type": "NodePort",
      "ports":[{
        "port": 8801,
        "name": imageType + "-port",
        "targetPort": imageInfo.port,
        "protocol": "TCP"
      }],
      "selector":{
        "user": user,
        "app": imageType
        }
    }
  };
  return(service);
};

var createRcControllerConfig = function(user) {
  var imageType = config.k8component.imageType
  var imageInfo = config.k8component.images[imageType]
  if (!imageInfo)
      throw new Error(`could not fing image ${imageType} in ${JSON.stringify(imageInfo)}`)
  const rcController = {
    "apiVersion": "v1",
    "kind": "ReplicationController",
    "metadata": {
      "name": imageType + "-rc-" + user,
      "labels": {
        "user": user,
        "app": imageType
      },
    },
    "spec": {
      "replicas": 1,
      "selector":{
        "user": user,
        "app": imageType
        },
      "template": {
        "metadata": {
          "labels": {
            "user":user,
            "app": imageType
          }
        },
        "spec": {
          "containers": [
            {
              "image": imageInfo.image,
              "name": imageType,
              "ports": [
                {
                  "containerPort": imageInfo.port,
                  "name": "main-port",
                  "protocol": "TCP"
                }
              ],
              "env": [
                {"name": "NOMAD_USER", "value": user },
                {"name": "NOMAD_BASE_URI", "value": config.app.baseUri }
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
                  "mountPath": imageInfo.homePath+"/notebooks",
                  "name": "notebooks-data-volume",
                  "readOnly": true
                },
                {
                  "mountPath": config.userInfo.privateDirInContainer+ "/" + user,
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
