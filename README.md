Use deploy to deploy the analytics toolkit.

use
 --docker-skip to avoid building the docker image
 --tsl to use the secure connection for helm

With minikube do

./deploy.sh --chown-root /data --nomad-root /hosthome/$USER/nomadlab
