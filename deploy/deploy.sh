#!/bin/bash
# Deploys the container manager and related things

nomadRoot=${nomadRoot:-/nomad/nomadlab}
target_hostname=${target_hostname:-$HOSTNAME}

mydir=$(dirname $0)
if [ -n "$mydir" ] ; then
  cd "$mydir"
fi
while test ${#} -gt 0
do
    case "$1" in
      --debug)
          debug=1
          ;;
      --tls)
          tls=--tls
          ;;
      --update-docker)
          buildDocker=1
          ;;
      --always-pull)
          alwaysPull=1
          ;;
      --no-deploy-scripts)
          skipDeploy=1
          ;;
      --no-push)
          noPush=1
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
          echo "unexpected argument '$1'"
          echo "usage: $0 [--debug] [--tls] [--nomad-root <pathToNomadRoot>] [--chown-root <pathForPrometheusVolumes>] [--env <NODE_ENV_VALUE>] [--update-docker] [--no-deploy-scripts] [--target-hostname hostname] [--secret-web-certs <secretName>]  [--always-pull] [--no-push] [--update-base-version]"
          echo
          echo "Env variables: NODE_ENV, target_hostname, nomadRoot, nomadRootContainer"
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
if [ -n "$buildDocker" ] ; then
    git checkout ./container_version
    v=$(git describe --tags --always --dirty)
    echo $v > container_version
fi
container_version=$(cat container_version)

name="gitlab-registry.mpcdf.mpg.de/nomad-lab/container-manager:$container_version"
if [ -n "$buildDocker" ] ; then
    if [ -n "$alwaysPull" ] ; then
        docker pull node:carbon
    fi
    docker build -t $name ..
    if [ -z "$noPush" ] ; then
        docker push $name
    fi
fi
if [ -n "$alwaysPull" ] ; then
    pullPolicy=Always
else
    pullPolicy=IfNotPresent
fi
config=${NODE_ENV}
user=${USER}

echo "## Environment setup, redis db for the sessions"
if [ -z "$skipDeploy" ]; then
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
echo "  if ! [[ -n \"\$(helm ls $tls analytics-session-db | grep -E '^analytics-session-db\s' )\" ]]; then"
echo "    helm install $tls --name analytics-session-db -f session-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm upgrade $tls analytics-session-db -f session-redis-helm-values.yaml stable/redis"
echo "  fi"


echo "## Environment setup, mongo db for notebook & usage information"
if [ -z "$skipDeploy" ]; then

    if [ ! -e notebook-db-mongo-pwd.txt ]; then
        echo "created random password in notebook-db-mongo-pwd.txt"
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > notebook-db-mongo-pwd.txt
    fi
    NOTEBOOK_MONGO_PASS=$(head -1 notebook-db-mongo-pwd.txt)

    cat >notebooks-mongo-service.yaml <<EOF
kind: Service
apiVersion: v1
metadata:
  name: notebooks-mongo
spec:
  selector:
    app: notebooks-mongo
  ports:
  - protocol: TCP
    port: 27017
    targetPort: 27017
  type: NodePort
EOF

    cat >notebooks-mongo-deploy.yaml <<EOF
apiVersion: apps/v1beta2
kind: Deployment
metadata:
  name: notebooks-mongo
  labels:
    app: notebooks-mongo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: notebooks-mongo
  template:
    metadata:
      labels:
        app: notebooks-mongo
    spec:
      containers:
      - name: notebooks-mongo
        image: mongo:3.4
        imagePullPolicy: $pullPolicy
        ports:
        - containerPort: 27017
#        env:
#        - name: MONGO_INITDB_ROOT_PASSWORD
#          valueFrom:
#            secretKeyRef:
#              name: notebooks-mongo
#              key: password
#        - name: MONGO_INITDB_ROOT_USERNAME
#          valueFrom:
#            secretKeyRef:
#              name: notebooks-mongo
#              key: user
EOF
fi

echo "# notebooks info secret"
echo "  kubectl create secret generic notebooks-mongo --from-literal=database=notebookinfo --from-literal=user=notebookinfo --from-file=password=notebook-db-mongo-pwd.txt" --from-literal=root-connect="mongodb://notebookinfo:$NOTEBOOK_MONGO_PASS@notebooks-mongo/notebookinfo"
echo "# nopass version"
echo "  kubectl create secret generic notebooks-mongo --from-literal=database=notebookinfo --from-literal=user=notebookinfo --from-file=password=notebook-db-mongo-pwd.txt" --from-literal=root-connect="mongodb://notebooks-mongo/notebookinfo"
echo "# notebooks info service"
echo "  kubectl create -f notebooks-mongo-service.yaml"
echo "# notebooks info deployment"
echo "  kubectl apply -f notebooks-mongo-deploy.yaml"

echo "## Environment setup: user settings redis db"
if [ -z "$skipDeploy" ]; then
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
    path: $nomadRoot/servers/$target_hostname/user-settings-redis-data
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
echo "  if [ ! -d \"$nomadRoot/servers/$target_hostname/user-settings-redis-data\" ] ; then"
echo "    mkdir -p $nomadRoot/servers/$target_hostname/user-settings-redis-data"
echo "    chown 1001:1001 $nomadRoot/servers/$target_hostname/user-settings-redis-data"
echo "  fi"
echo "  kubectl create -f user-settings-redis-volume.yaml"
echo "# password secret"
echo "  kubectl create secret generic user-settings-db --from-file=redis-password=user-settings-redis-pwd.txt"
echo "# actual redis setup"
echo "  if ! [[ -n \"\$(helm ls $tls user-settings-db | grep -E '^user-settings-db\s' )\" ]]; then"
echo "    helm install $tls --name user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  else"
echo "    helm upgrade $tls user-settings-db -f user-settings-redis-helm-values.yaml stable/redis"
echo "  fi"

echo "## Environment setup for container manager"
if [ -z "$skipDeploy" ]; then
    cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF
    cat >container-manager-user.yaml <<EOF
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: analytics-user
  namespace: analytics
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: analytics-user-full-access
  namespace: analytics
rules:
- apiGroups: ["", "extensions", "apps"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["batch"]
  resources:
  - jobs
  - cronjobs
  verbs: ["*"]

---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: analytics-user-view
  namespace: analytics
subjects:
- kind: ServiceAccount
  name: analytics-user
  namespace: analytics
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: analytics-user-full-access
EOF
fi
echo "# create namespace for pods of container manager"
echo "  kubectl create -f container-manager-namespace.yaml"
echo "# create user for namespace of pods of container manager"
echo "  kubectl create -f container-manager-user.yaml"
echo "# secret to pull images from gitlab-registry.mpcdf.mpg.de"
echo "  kubectl create secret docker-registry garching-kube --docker-server=gitlab-registry.mpcdf.mpg.de --docker-username=\$DOCKER_USERNAME --docker-password=\"\$DOCKER_PASSWORD\" --docker-email=\$DOCKER_EMAIL"
echo "  kubectl --namespace analytics create secret docker-registry garching-kube --docker-server=gitlab-registry.mpcdf.mpg.de --docker-username=\$DOCKER_USERNAME --docker-password=\"\$DOCKER_PASSWORD\" --docker-email=\$DOCKER_EMAIL"
echo "# get certificates to connect to kubernetes (either from kube-certs of ~/.minikube)"
echo "  if [ -f kube-certs/client.key ] ; then"
echo "    pushd kube-certs"
echo "  elif [ -e ../../kube-certs/client.key ] ; then"
echo "    pushd ../../kube-certs"
echo "  elif [ -e ../../../kube-certs/client.key ] ; then"
echo "    pushd ../../../kube-certs"
echo "  elif [ -e ~/.minikube ] ; then"
echo "    mkdir -p ./kube-certs"
echo "    pushd  kube-certs"
echo "    cp ~/.minikube/ca.crt ~/.minikube/client.crt ~/.minikube/client.key ."
echo "    sed \"s|$HOME/.minikube|/usr/src/app/kube-certs|g\" ~/.kube/config > config"
if [ -z "$KUBERNETES_SERVER_URL" ] ; then
    echo "    echo https://\$(minikube ip):8443 > server.url"
else
    echo "    echo \"$KUBERNETES_SERVER_URL\" > server.url"
fi
if [ -z "$KUBERNETES_NODE" ] ; then
    echo "    echo \$(minikube ip) >node.addr"
else
    echo "    echo \"$KUBERNETES_NODE\" > node.addr"
fi
echo "  else"
echo "    pushd ."
echo "  fi"

if [ -n "$KUBERNETES_SERVER_URL" ]; then
    echo "  kubectl create secret generic kube-certs --from-file=ca.crt=ca.crt --from-file=client.crt=client.crt --from-file=client.key=client.key --from-literal=server.url=\"$KUBERNETES_SERVER_URL\" --from-literal=node.addr=\"$KUBERNETES_NODE\" --from-file=config=config"
else
    echo "  kubectl create secret generic kube-certs --from-file=ca.crt=ca.crt --from-file=client.crt=client.crt --from-file=client.key=client.key --from-file=server.url=server.url --from-file=node.addr=node.addr --from-file=config=config"
fi
echo "  popd"
echo "# create secret with web certificates"
echo "  if [ -f web-certs/key.pem ] ; then"
echo "    pushd web-certs"
echo "  elif [ -f ../../web-certs/key.pem ]; then"
echo "    pushd ../../web-certs"
echo "  elif [ -f ../../../web-certs/key.pem ]; then"
echo "    pushd ../../../web-certs"
echo "  else"
echo "    pushd ."
echo "  fi"
echo "  kubectl create secret generic ${secretWebCerts} --from-file=key.pem=key.pem --from-file=cert.pem=cert.pem"
echo "  popd"
echo

echo "# create cron job updating info on services"
if [ -z "$skipDeploy" ]; then
targetF=service-dumper.yaml
cat > "$targetF" <<EOF
apiVersion: v1
kind: Pod
#apiVersion: batch/v1beta1
#kind: CronJob
metadata:
  name: service-dumper
  labels:
    app: nomad-container-manager-dumper
spec:
#  schedule: "*/15 * * * *"
#  jobTemplate:
#    spec:
#      template:
#        spec:
          imagePullSecrets:
          - name: garching-kube
          restartPolicy: OnFailure
          containers:
          - name: dumper
            image: $name
            imagePullPolicy: $pullPolicy
            command:
            - node
            - app.js
            - serviceDumper
            - --out-file
            - /services-info/$target_hostname.services.yaml
            env:
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
            - mountPath: "/services-info"
              name:  services-info
EOF
    if [ -n "$debug" ] ; then
        cat >> $targetF <<EOF
            - mountPath: "/usr/src/app"
              name: app-source
EOF
    fi
    cat >> $targetF <<EOF
            - mountPath: "/usr/src/app/kube-certs"
              name: kube-certs
              readOnly: true
          volumes:
          - name: kube-certs
            secret:
              secretName: kube-certs
          - name: services-info
            hostPath:
              path: "$nomadRoot/servers/services-info"
EOF
    if [ -n "$debug" ] ; then
        cat >> $targetF <<EOF
          - name: app-source
            hostPath:
              path: "$nomadRoot/servers/$target_hostname/service-dumper"
EOF
    fi
fi
echo "  kubectl apply -f $targetF"

for imageType in beaker jupyter creedo remotevis userapi watcher; do

if [ "$imageType" != "watcher" ] ; then
    echo "## $imageType Initial setup: create container manager service"
    if [ -z "$skipDeploy" ]; then
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
fi

if [ -z "$skipDeploy" ]; then
    scheme=HTTP
    if [ "$target_hostname" == "labdev-nomad" -o  "$target_hostname" == "labtest-nomad" ] ; then
      scheme=HTTPS
    fi
    targetF=container-manager-deploy-$imageType.yaml
    cat > $targetF <<HERE
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
        ports:
        - containerPort: 3003
HERE
    if [ "$imageType" = "watcher" ]; then
        cat >> $targetF <<HERE
        command:
        - npm
        - start
        - watcher
HERE
    elif [ "$imageType" = "userapi" ]; then
        cat >> $targetF <<HERE
        command:
        - npm
        - start
        - apiserver
        readinessProbe:
          httpGet:
            path: "/userapi"
            port: 3003
            scheme: "$scheme"
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: "/userapi"
            port: 3003
            scheme: "$scheme"
          initialDelaySeconds: 30
          periodSeconds: 30
HERE
    else
        cat >> $targetF <<HERE
        command:
        - npm
        - start
        - webserver
        readinessProbe:
          httpGet:
            path: "/nmdalive"
            port: 3003
            scheme: "$scheme"
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: "/nmdalive"
            port: 3003
            scheme: "$scheme"
          initialDelaySeconds: 30
          periodSeconds: 30
HERE
    fi
    cat >> $targetF <<HERE
        env:
        - name: MONGODB_URL
          valueFrom:
            secretKeyRef:
              name: notebooks-mongo
              key: root-connect
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
          path: "$nomadRoot/servers/$target_hostname/$imageType-manager"
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

echo "  kubectl apply -f container-manager-deploy-$imageType.yaml"
echo
done
