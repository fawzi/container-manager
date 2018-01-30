version=$(git describe --tags --always --dirty)
name="labdev-nomad.esc.rzg.mpg.de:5000/nomadlab/nomad-container-manager-$version"
docker build -t $name .
docker push $name

cat >container-manager-namespace.yaml <<EOF
kind: Namespace
apiVersion: v1
metadata:
  name: analytics
EOF

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
        - containerPort: 80
HERE


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

echo "* For an initial deployment, launch with (choose configuration accordingly):"
echo "kubectl --kubeconfig /nomad/nomadlab/kubernetes/dev/config create -f container-manager-service.yaml"
echo "kubectl --kubeconfig /nomad/nomadlab/kubernetes/dev/config create -f container-manager-deploy.yaml"
echo "* To siply update the deployment, just update the Kubernetes deployment without touching the service:"
echo "kubectl --kubeconfig /nomad/nomadlab/kubernetes/dev/config delete -f container-manager-deploy.yaml"
echo "kubectl --kubeconfig /nomad/nomadlab/kubernetes/dev/config create -f container-manager-deploy.yaml"
