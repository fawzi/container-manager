version=$(git describe --tags --always --dirty)
name="labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/nomad-container-manager-$version"
docker build -t $name .
docker push $name

redisPass=${ANALYTICS_SESSION_DB_PASSWORD:-${NOMAD_PASSWORD:-pippo}}
mongoPass=${NOTEBOOK_INFO_DB_PASSWORD:-${NOMAD_PASSWORD:-pippo}}

echo "# Initial setup"
echo "To make kubectl work, for example for the test kubernetes"
echo "  export KUBECONFIG=/nomad/nomadlab/kubernetes/dev/config"

cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF

cat >session-redis-helm-values.yaml <<EOF
redisPassword: "$redisPass"
persistence.enabled: false
EOF

echo "## Environment setup, redis db for the sessions"
echo "  helm install --name analytics-session-db -f session-redis-helm-values.yaml stable/redis"

cat >notebook-mongo-helm-values.yaml <<EOF
mongodbRooPassword: "$mongoPass"
mongodbUsername: "notebookinfo"
mongodbPassword: "$mongoPass"
mongodbDatabase: "notebookinfo"
persistence.enables: false
EOF

echo "## Environment setup, mongo db for notebook & usage information"
echo "  helm install --name notebook-info-db -f notebook-mongo-helm-values.yaml stable mongodb"

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

echo "## Environment setup, persistent volume for user settings"
echo "  kubectl create -f settings-volume.yaml"


cat >settings-redis-helm-values.yaml <<EOF
redisPassword: "$redisPass"
persistence.enabled: true
persistence.existingClaim: usersettings-volume
persistence.size: 8Gi
EOF

echo "## Environment setup, redis db for user settings"
echo "  helm install --name usersettings-db -f settings-redis-helm-values.yaml stable/redis"

cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF

echo "## Environment setup, create namespace"
echo "  kubectl create -f container-manager-namespace.yaml"

cat >container-manager-service.yaml <<HERE
kind: Service
apiVersion: v1
metadata:
  name: nomad-container-manager
spec:
  selector:
    app: nomad-container-manager
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: NodePort
HERE

echo "## Initial setup: create container manager service"
echo "  kubectl create -f container-manager-service.yaml"

cat >container-manager-deploy.yaml <<HERE
apiVersion: apps/v1beta2
kind: Deployment
metadata:
  name: nomad-container-manager
  namespace: analytics
  labels:
    app: nomad-container-manager
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nomad-container-manager
  template:
    metadata:
      labels:
        app: nomad-container-manager
    spec:
      containers:
      - name: nomad-container-manager
        image: $name
        ports:
        - containerPort: 3003
        env:
        - name: SESSION_DB_PASSWORD
          value: "$redisPass"
        - name: NOTEBOOK_INFO_DB_PASSWORD
          value: "$mongoPass"
HERE

echo "# For an initial deployment, launch with:"
echo "kubectl create -f container-manager-deploy.yaml"
echo "# To siply update the deployment:"
echo "kubectl apply -f container-manager-deploy.yaml"
