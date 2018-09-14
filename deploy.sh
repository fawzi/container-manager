#!/bin/bash
nomadRoot=${nomadRoot:-/nomad/nomadlab}
buildDocker=1
updateDeploy=1
target_hostname=${target_hostname:-$HOSTNAME}
chownRoot=
tls=
debug=
alwaysPull=
secretWebCerts=

while test ${#} -gt 0
do
    case "$1" in
      --debug)
          debug=1
          ;;
      --tls)
          tls=--tls
          ;;
      --docker-only)
          buildDocker=1
          updateDeploy=""
          ;;
      --always-pull)
          alwaysPull=1
          ;;
      --docker-skip)
          buildDocker=""
          updateDeploy=1
          ;;
      --secret-web-certs)
          shift
          secretWebCerts=${1:-web-certs}
          ;;
      --env)
          shift
          NODE_ENV=$1
          ;;
      --target-hostname)
          shift
          target_hostname=$1
          ;;
      --nomad-root)
          shift
          nomadRoot=$1
          ;;
      --chown-root)
          shift
          chownRoot=$1
          ;;
      *)
          echo "usage: $0 [--debug] [--tls] [--nomad-root <pathToNomadRoot>] [--chown-root <pathForPrometheusVolumes>] [--env <NODE_ENV_VALUE>] [--docker-only] [--docker-skip] [--target-hostname hostname] [--always-pull]"
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

chownRoot=${chownRoot:-$nomadRoot/servers/$target_hostname}
version=$(git describe --tags --always --dirty)
name="analytics-toolkit.nomad-coe.eu:5509/nomadlab/nomad-container-manager:$version"
if [ -n "$buildDocker" ] ; then
    docker build -t $name .
    docker push $name
fi
if [ -n "$alwaysPull" ] ; then
    pullPolicy=Always
else
    pullPolicy=IfNotPresent
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
    path: $chownRoot/prometheus/alertmanager-volume
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
    path: $chownRoot/prometheus/server-volume
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
if [ -n "$tls" ] ; then
    echo "# secure heml as described in https://docs.helm.sh/using_helm/#using-ssl-between-helm-and-tiller"
    echo "# create certificates"
    echo "mkdir helm-certs"
    echo "cd helm-certs"
    echo "openssl genrsa -out ./ca.key.pem 4096"
    echo "openssl req -key ca.key.pem -new -x509 -days 7300 -sha256 -out ca.cert.pem -extensions v3_ca"
    echo "openssl genrsa -out ./tiller.key.pem 4096"
    echo "openssl genrsa -out ./helm.key.pem 4096"
    echo "openssl req -key tiller.key.pem -new -sha256 -out tiller.csr.pem"
    echo "openssl req -key helm.key.pem -new -sha256 -out helm.csr.pem"
    echo "openssl x509 -req -CA ca.cert.pem -CAkey ca.key.pem -CAcreateserial -in tiller.csr.pem -out tiller.cert.pem -days 365"
    echo "openssl x509 -req -CA ca.cert.pem -CAkey ca.key.pem -CAcreateserial -in helm.csr.pem -out helm.cert.pem  -days 365"
    echo "cp ca.cert.pem \$(helm home)/ca.pem"
    echo "cp helm.cert.pem \$(helm home)/cert.pem"
    echo "cp helm.key.pem \$(helm home)/key.pem"
    echo "# initialize helm"
    echo "helm init --override 'spec.template.spec.containers[0].command'='{/tiller,--storage=secret}' \\"
    echo "          --tiller-tls \\"
    echo "          --tiller-tls-verify \\"
    echo "          --tiller-tls-cert=cert.pem \\"
    echo "          --tiller-tls-key=key.pem \\"
    echo "          --tls-ca-cert=ca.pem \\"
    echo "          --service-account=tiller"
else
    echo "  helm init --service-account tiller"
fi
echo "# Prometheus setup"
echo "  kubectl create -f prometheus-alertmanager-volume.yaml"
echo "  kubectl create -f prometheus-server-volume.yaml"
echo "  helm install $tls --name prometheus -f prometheus-values.yaml stable/prometheus"

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
image:
  pullPolicy: $pullPolicy
existingSecret: analytics-session-db
rbac:
  create: true
metrics:
  enabled: true
master:
  service:
    type: NodePort
  disableCommands: ""
  persistence:
    enabled: false
cluster:
  enabled: false
EOF
fi
echo "# password secret"
echo "  kubectl create secret generic analytics-session-db --from-file=redis-password=session-db-redis-pwd.txt"
echo "# actual redis setup"
echo "  if ! [[ -n \"\$(helm ls analytics-session-db | grep -E '^analytics-session-db\s' )\" ]]; then"
echo "    helm $tls install --name analytics-session-db -f session-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm $tls upgrade analytics-session-db -f session-redis-helm-values.yaml stable/redis"
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
image:
  pullPolicy: $pullPolicy
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
echo "    helm install $tls --name notebook-info-db -f notebook-mongo-helm-values.yaml stable/mongodb"
echo "  else"
echo "    helm upgrade $tls notebook-info-db -f notebook-mongo-helm-values.yaml stable/mongodb"
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
image:
  pullPolicy: $pullPolicy
existingSecret: user-settings-db
rbac:
  create: true
metrics:
  enabled: true
master:
  service:
    type: NodePort
  disableCommands: ""
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
echo "    helm install $tls --name user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm upgrade $tls user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  fi"

echo "## Environment setup for container manager"
if [ -n updateDeploy ]; then
cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF
fi
echo "# create namespace for pods of container manager"
echo "  kubectl create -f container-manager-namespace.yaml"
echo "# secret to pull images from analytics-toolkit.nomad-coe.eu:5509"
echo "  kubectl create secret docker-registry garching-kube --docker-server=analytics-toolkit.nomad-coe.eu:5509 --docker-username=\$DOCKER_USERNAME --docker-password=\"\$DOCKER_PASSWORD\" --docker-email=\$DOCKER_EMAIL"
echo "# get certificates to connect to kubernetes (either from kube-certs of ~/.minikube)"
echo "  if [ -e kube-certs ] ; then"
echo "    pushd kube-certs"
echo "  elif [ -e ../kube-certs ] ; then"
echo "    pushd ../kube-certs"
echo "  elif [ -e ~/.minikube ] ; then"
echo "    pushd  ~/.minikube"
echo "  else"
echo "    pushd ."
echo "  fi"

if [ -z "$KUBERNETES_SERVER_URL" -a -e "$HOME/.minikube" ] ; then
    KUBERNETES_SERVER_URL="https://$(minikube ip):8443"
fi
if [ -z "$KUBERNETES_NODE" -a -e "$HOME/.minikube" ] ; then
    KUBERNETES_NODE="$(minikube ip)"
fi

if [ -n "$KUBERNETES_SERVER_URL" ]; then
    echo "  kubectl create secret generic kube-certs --from-file=ca.crt=ca.crt --from-file=client.crt=client.crt --from-file=client.key=client.key --from-literal=server.url=\"$KUBERNETES_SERVER_URL\" --from-literal=node.addr=\"$KUBERNETES_NODE\""
else
    echo "  kubectl create secret generic kube-certs --from-file=ca.crt=ca.crt --from-file=client.crt=client.crt --from-file=client.key=client.key --from-file=server.url=server.url --from-file=node.addr=node.addr"
fi
echo "  popd"
echo "# create secret with web certificates"
echo "  if [ -e web-certs ] ; then"
echo "    pushd web-certs"
echo "  elif [ -e ../web-certs ]; then"
echo "    pushd ../web-certs"
echo "  else"
echo "    pushd ."
echo "  fi"
echo "  kubectl create secret generic ${secretWebCerts} --from-file=key.pem=key.pem --from-file=cert.pem=cert.pem"
echo "  popd"
echo

for imageType in beaker jupyter creedo remotevis ; do

echo "## $imageType Initial setup: create container manager service"
if [ -n updateDeploy ]; then
cat >container-manager-service-$imageType.yaml <<HERE
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
echo "  kubectl create -f container-manager-service-$imageType.yaml"

if [ -n "$updateDeploy" ]; then
    targetF=container-manager-deploy-$imageType.yaml
    cat >$targetF <<HERE
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
      imagePullSecrets:
      - name: garching-kube
      containers:
      - name: nomad-container-manager
        image: $name
        imagePullPolicy: $pullPolicy
        command:
        - npm
        - start
        - webserver
        ports:
        - containerPort: 3003
        env:
        - name: SESSION_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: analytics-session-db
              key: redis-password
        - name: USER_SETTINGS_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: user-settings-db
              key: redis-password
        - name: NOTEBOOK_INFO_DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: notebook-db-mongo-pwd
              key: password
        - name: KUBERNETES_SERVER_URL
          valueFrom:
            secretKeyRef:
              name: kube-certs
              key: server.url
        - name: KUBERNETES_NODE
          valueFrom:
            secretKeyRef:
              name: kube-certs
              key: node.addr
        - name: NODE_ENV
          value: "$NODE_ENV"
        - name: NODE_APP_INSTANCE
          value: "$imageType"
        volumeMounts:
HERE
    if [ -n "$debug" ] ; then
        cat >> $targetF <<EOF
        - mountPath: "/usr/src/app"
          name: app-source
EOF
    fi
    if [ -n "$secretWebCerts" ] ; then
        cat >> $targetF <<EOF
        - mountPath: "/usr/src/app/web-certs"
          name: web-certs
EOF
    fi
    cat >> $targetF <<EOF
        - mountPath: "/usr/src/app/kube-certs"
          name: kube-certs
          readOnly: true
        - mountPath: "/nomad/nomadlab/user-data/shared"
          name: user-shared
        - mountPath: "/nomad/nomadlab/user-data/private"
          name: user-private
      volumes:
      - name: kube-certs
        secret:
          secretName: kube-certs
      - name: user-shared
        hostPath:
          path: $nomadRoot/user-data/shared
      - name: user-private
        hostPath:
          path: $nomadRoot/user-data/private
EOF
    if [ -n "$debug" ] ; then
        cat >> $targetF <<EOF
      - name: app-source
        hostPath:
          path: "$nomadRoot/servers/$target_hostname/analytics/$imageType"
EOF
    fi
    if [ -n "$secretWebCerts" ] ; then
        cat >> $targetF <<EOF
      - name: web-certs
        secret:
          secretName: $secretWebCerts
EOF
    fi
fi

echo "if ! kubectl get deployment nomad-container-manager-$imageType >& /dev/null ;  then"
echo "  kubectl create --save-config -f container-manager-deploy-$imageType.yaml"
echo "else"
echo "  kubectl apply -f container-manager-deploy-$imageType.yaml"
echo "fi"
echo
done
