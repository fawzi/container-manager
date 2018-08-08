target_hostname=${target_hostname:-$HOSTNAME}
cat <<EOF
kubectl create secret generic redis-session-db-pwd --from-file=./redis-session-db-pwd.txt
helm install --name redis-session-db -f redis-session-db-values.yaml stable/redis
kubectl create secret generic redis-user-db-pwd --from-file=./redis-user-db-pwd.txt
kubectl apply -f redis-user-db-volume-$target_hostname.yaml
helm install --name redis-user-db -f redis-user-db-values.yaml stable/redis
EOF
