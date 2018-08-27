#!/bin/bash
nomadRoot=${nomadRoot:-/nomad/nomadlab}
buildDocker=1
updateDeploy=1
imageType=beaker
target_hostname=${target_hostname:-$HOSTNAME}
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
      --target-hostname)
          shift
          target_hostname=$1
          ;;
      --nomad-root)
          shift
          nomadRoot=$1
          ;;
      *)
          echo "usage: $0 [--nomad-root <pathToNomadRoot>] [--docker-only] [--docker-skip] [--target-hostname hostname]"
          echo
          echo "Env variables: NODE_ENV, target_hostname, nomadRoot"
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
name="analytics-toolkit.nomad-coe.eu:5509/nomadlab/nomad-container-manager-$version"
if [ -n "$buildDocker" ] ; then
    docker build -t $name .
    docker push $name
fi

echo "# Initial setup"
echo "To make kubectl work, for example for the test kubernetes"
echo "  export KUBECONFIG=/nomad/nomadlab/kubernetes/dev/config"

echo "# Helm install"
if [ -n updateDeploy ]; then
    cat > helm-tiller-serviceaccount.yaml <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: tiller
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: tiller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: tiller
    namespace: kube-system
EOF

    cat > prometheus-alertmanager-volume.yaml <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: prometheus-alertmanager
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Recycle
  storageClassName: manual-alertmanager
  hostPath:
    path: $nomadRoot/servers/$target_hostname/prometheus/alertmanager-volume
    type: Directory
EOF

    cat > prometheus-server-volume.yaml <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: prometheus-server
spec:
  capacity:
    storage: 16Gi
  storageClassName: manual-prometheus
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Recycle
  hostPath:
    path: $nomadRoot/servers/$target_hostname/prometheus/server-volume
    type: Directory
EOF

    cat > prometheus-values.yaml <<EOF
alertmanager:
  persistentVolume:
    storageClass: manual-alertmanager
  service:
    type: NodePort
server:
  persistentVolume:
    storageClass: manual-prometheus
  service:
    type: NodePort
EOF
fi

echo "  kubectl create -f helm-tiller-serviceaccount.yaml"
echo "  helm init --service-account tiller"
echo "# Prometheus setup"
echo "  kubectl create -f prometheus-alertmanager-volume.yaml"
echo "  kubectl create -f prometheus-server-volume.yaml"
echo "  helm install --name prometheus -f prometheus-values.yaml stable/prometheus"

if [ -n updateDeploy ]; then
    cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF
fi

echo "## Environment setup, redis db for the sessions"
if [ -n updateDeploy ]; then
    if [ ! -e session-db-redis-pwd.txt ]; then
        echo "created random password in session-db-redis-pwd.txt"
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > session-db-redis-pwd.txt
    fi

    SESSION_REDIS_PASS=$(head -1 session-db-redis-pwd.txt)

    cat >session-redis-helm-values.yaml <<EOF
existingSecret: session-db-redis-pwd
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
echo "# password secret"
echo "  kubectl create secret generic session-db-redis-pwd --from-file=redis-password=session-db-redis-pwd.txt"
echo "# actual redis setup"
echo "  if ! [[ -n \"\$(helm ls analytics-session-db | grep -E '^analytics-session-db\s' )\" ]]; then"
echo "    helm install --name analytics-session-db -f session-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm upgrade analytics-session-db -f session-redis-helm-values.yaml stable/redis"
echo "  fi"


echo "## Environment setup, mongo db for notebook & usage information"
if [ -n updateDeploy ]; then

    if [ ! -e notebook-db-mongo-pwd.txt ]; then
        echo "created random password in notebook-db-mongo-pwd.txt"
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > notebook-db-mongo-pwd.txt
    fi
    NOTEBOOK_MONGO_PASS=$(head -1 notebook-db-mongo-pwd.txt)

# check how to use secret
    cat >notebook-mongo-helm-values.yaml <<EOF
mongodbRooPassword: "$(cat notebook-db-mongo-pwd.txt)"
mongodbUsername: "notebookinfo"
mongodbPassword: "$(cat notebook-db-mongo-pwd.txt)"
mongodbDatabase: "notebookinfo"
persistence:
  enabled: false
EOF
fi

echo "# password secret"
echo "  kubectl create secret generic notebook-db-mongo-pwd --from-literal=database=notebookinfo --from-literal=user=notebookinfo --from-file=password=notebook-db-mongo-pwd.txt"
echo "# actual mongo setup"

echo "  if ! [[ -n \"\$(helm ls notebook-info-db | grep -E '^notebook-info-db\s' )\" ]]; then"
echo "    helm install --name notebook-info-db -f notebook-mongo-helm-values.yaml stable/mongodb"
echo "  else"
echo "    helm upgrade notebook-info-db -f notebook-mongo-helm-values.yaml stable/mongodb"
echo "  fi"

echo "## Environment setup: user settings redis db"
if [ -n updateDeploy ]; then
    if [ ! -e user-settings-redis-pwd.txt ]; then
        echo "created random password in user-settings-redis-pwd.txt"
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > user-settings-redis-pwd.txt
    fi

    cat >user-settings-redis-volume.yaml <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: user-settings-redis
  labels:
    type: local
spec:
  storageClassName: manual-user-settings
  capacity:
    storage: 16Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Recycle
  hostPath:
    path: $nomadRoot/servers/$target_hostname/analytics/user-settings-redis-data
    type: Directory
EOF

    cat >user-settings-redis-helm-values.yaml <<EOF
existingSecret: user-settings-db
rbac:
  create: true
metrics:
  enabled: true
master:
  persistence:
    enabled: true
    storageClass: manual-user-settings
cluster:
  enabled: false
EOF
fi


echo "# volume for redis persistence"
echo "  kubectl create -f user-settings-redis-volume.yaml"
echo "# password secret"
echo "  kubectl create secret generic user-settings-db --from-file=redis-password=user-settings-redis-pwd.txt"
echo "# actual redis setup"
echo "  if ! [[ -n \"\$(helm ls user-settings-db | grep -E '^user-settings-db\s' )\" ]]; then"
echo "    helm install --name user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm upgrade user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  fi"

echo "## Environment setup, create namespace for pods of container manager"
if [ -n updateDeploy ]; then
cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF
fi
echo "  kubectl create -f container-manager-namespace.yaml"

echo "## Initial setup: create container manager service"
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
        imagePullPolicy: IfNotPresent
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
echo "# To simply update the deployment:"
echo "kubectl apply -f container-manager-deploy.yaml"
