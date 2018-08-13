#!/bin/bash

buildDocker=1
updateDeploy=1
imageType=beaker
while test ${#} -gt 0
do
  case "$1" in
      --docker-only)
          buildDocker=1
          updateDeploy=""
          ;;
      --docker-skip)
          buildDocker=""
          updateDeploy=1
          ;;
      --image-type)
          shift
          imageType=$1
          ;;
      *)
          echo "usage: $0 [--docker-only] [--docker-skip]"
          echo
          echo "Env variables: NODE_ENV, NOMAD_PASSWORD"
          echo "Examples:"
          echo "export NODE_ENV=nomad-vis-test"
          echo "export NODE_ENV=labenv"
          echo "export NODE_ENV=analytics-toolkit"
          exit 0
          ;;
  esac
  shift
done


version=$(git describe --tags --always --dirty)
name="labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/nomad-container-manager-$version"
if [ -n "$buildDocker" ] ; then
    docker build -t $name .
    docker push $name
fi

echo "# Initial setup"
echo "To make kubectl work, for example for the test kubernetes"
echo "  export KUBECONFIG=/nomad/nomadlab/kubernetes/dev/config"

if [ -n updateDeploy ]; then
cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF

cat >redis-session-db-values.yaml <<EOF
existingSecret: redis-session-db-pwd
rbac:
  create: true
metrics:
  enabled: true
master:
  persistence:
    enabled: false
cluster:
  enabled: false
EOF
fi

echo "## Environment setup, redis db for the sessions"
if [ ! -e redis-session-db-pwd.txt ]; then
  echo "# creating random password in redis-session-db-pwd.txt"
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > redis-session-db-pwd.txt
fi
echo "  kubectl create secret generic redis-session-db-pwd --from-file=redis-password=redis-session-db-pwd.txt"
echo "  helm install --name redis-session-db -f redis-session-db-values.yaml stable/redis"

if [ -n updateDeploy ]; then
cat >notebook-mongo-helm-values.yaml <<EOF
mongodbRooPassword: "$mongoPass"
mongodbUsername: "notebookinfo"
mongodbPassword: "$mongoPass"
mongodbDatabase: "notebookinfo"
persistence.enables: false
EOF
fi

echo "## Environment setup, mongo db for notebook & usage information"
if [ ! -e notebook-mongo-db-pwd.txt ]; then
  echo "# creating random password in notebook-mongo-db-pwd.txt"
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > notebook-mongo-db-pwd.txt
fi
echo "  kubectl create secret generic notebook-mongo-db-pwd --from-file=password=notebook-mongo-db-pwd.txt"
echo "  helm install --name notebook-info-db -f notebook-mongo-helm-values.yaml stable mongodb"

if [ -n updateDeploy ]; then
cat >settings-volume.yaml <<EOF
kind: PersistentVolume
apiVersion: v1
metadata:
  name: usersettings-volume
  labels:
    type: local
spec:
  storageClassName: manual
  capacity:
    storage: 8Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: "/nomad/nomadlab/usersettingsdb"
EOF
fi

echo "## Environment setup, persistent volume for user settings"
echo "  kubectl create -f settings-volume.yaml"


if [ -n updateDeploy ]; then
cat >settings-redis-helm-values.yaml <<EOF
redisPassword: "$redisPass"
persistence.enabled: true
persistence.existingClaim: usersettings-volume
persistence.size: 8Gi
EOF
fi

echo "## Environment setup, redis db for user settings"
echo "  helm install --name usersettings-db -f settings-redis-helm-values.yaml stable/redis"

if [ -n updateDeploy ]; then
cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF
fi

echo "## Environment setup, create namespace"
echo "  kubectl create -f container-manager-namespace.yaml"

if [ -n updateDeploy ]; then
cat >container-manager-service.yaml <<HERE
kind: Service
apiVersion: v1
metadata:
  name: nomad-container-manager-$imageType
spec:
  selector:
    app: nomad-container-manager
    imageType: $imageType
  ports:
  - protocol: TCP
    port: 3003
    targetPort: 3003
  type: NodePort
HERE
fi

echo "## Initial setup: create container manager service"
echo "  kubectl create -f container-manager-service.yaml"

if [ -n updateDeploy ]; then
cat >container-manager-deploy.yaml <<HERE
apiVersion: apps/v1beta2
kind: Deployment
metadata:
  name: nomad-container-manager-$imageType
  labels:
    app: nomad-container-manager
    imageType: $imageType
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nomad-container-manager
      imageType: $imageType
  template:
    metadata:
      labels:
        app: nomad-container-manager
        imageType: $imageType
    spec:
      containers:
      - name: nomad-container-manager
        image: $name
        command:
        - npm
        - start
        - webserver
        ports:
        - containerPort: 3003
        env:
        - name: SESSION_DB_PASSWORD
          value: "$redisPass"
        - name: NOTEBOOK_INFO_DB_PASSWORD
          value: "$mongoPass"
HERE
fi

echo "# For an initial deployment, launch with:"
echo "kubectl create --save-config -f container-manager-deploy.yaml"
echo "# To siply update the deployment:"
echo "kubectl apply -f container-manager-deploy.yaml"
