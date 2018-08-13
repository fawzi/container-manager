target_hostname=${target_hostname:-$HOSTNAME}
cat <<EOF
# once (create secrets)
if [ ! -e redis-session-db-pwd.txt ]; then
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > redis-session-db-pwd.txt
fi
kubectl create secret generic redis-session-db-pwd --from-file=redis-password=redis-session-db-pwd.txt
if [ ! -e redis-user-db-pwd.txt ]; then
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 28 > redis-user-db-pwd.txt
fi
kubectl create secret generic redis-user-db-pwd --from-file=redis-password=redis-user-db-pwd.txt

helm install --name redis-session-db -f redis-session-db-values.yaml stable/redis
kubectl apply -f redis-user-db-volume-$target_hostname.yaml
helm install --name redis-user-db -f redis-user-db-values.yaml stable/redis
EOF
