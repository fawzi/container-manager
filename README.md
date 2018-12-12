Use deploy to deploy the analytics toolkit.

use
 --docker-skip to avoid building the docker image
 --tsl to use the secure connection for helm

With minikube do

./deploy.sh --chown-root /data --nomad-root /hosthome/$USER/nomadlab


machine specific deploy:

# labdev-nomad

     cd /nomad/nomadlab/servers/labdev-nomad/analytics/beaker
     ./deploy.sh --env labdev-nomad --target-hostname labdev-nomad --secret-web-certs web-certs --debug

development machine, deploy mirroring the filesystem, you might need to manully execute npm install in the container to if you update packages

# nomad-vis-test

from labdev-nomad.container

     cd /nomad/nomadlab/servers/nomad-vis-test/analytics/remotevis

Update info on services of labdev (should already be done) that we use as we share the session db

     ssh labdev-nomad.esc
     cd /nomad/nomadlab/servers/labdev-nomad/beaker-manager
     kubectl create -f sevice-dumper.yaml
     exit

update config with current info on the redis dbs of labdev (default-remotevis.hjson.in -> default-remotevis.hjson)

     docker run -ti -v $PWD:/usr/src/app -v /nomad/nomadlab/servers/services-info:/services-info -w /usr/src/app --rm node:carbon node app.js templateEvaluer --replacements /services-info/labdev-nomad.services.yaml --template config/nomad-vis-test.hjson.in --out-file config/nomad-vis-test.hjson

deploy
     ./deploy.sh --tls --env nomad-vis-test --target-hostname nomad-vis-test --secret-web-certs web-certs

and execute the deploy for remote vis

     kubectl create -f container-manager-service-remotevis.yaml
     if ! kubectl get deployment nomad-container-manager-remotevis >& /dev/null ;  then
       kubectl create --save-config -f container-manager-deploy-remotevis.yaml
     else
       kubectl apply -f container-manager-deploy-remotevis.yaml
     fi

if only that changed, otherwise on has also to create the secrets and analytics namespace.

A serviceDump has to be run to reexport the ports to the frontend, then the frontend setup needs to be updated.
