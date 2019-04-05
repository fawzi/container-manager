Use deploy to deploy the analytics toolkit.

use
 --update-docker to build a new docker image and update version_to_deploy
 --tsl to use the secure connection for helm

With minikube do

./deploy/deploy.sh --chown-root /data --nomad-root /hosthome/$USER/nomadlab


machine specific deploy:

# labtest-nomad

     cd /nomad/nomadlab/servers/labtest-nomad/beaker-manager/deploy
     ./deploy.sh --tls --env labtest-nomad --update-docker --secret-web-certs web-certs > deploy.cmds

# labdev-nomad

     cd /nomad/nomadlab/servers/labdev-nomad/analytics/beaker
     ./deploy/deploy.sh --env labdev-nomad --target-hostname labdev-nomad --secret-web-certs web-certs --debug > deploy/deploy.cmds

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
     ./deploy/deploy.sh --tls --env nomad-vis-test --target-hostname nomad-vis-test --secret-web-certs web-certs

and execute the deploy for remote vis

     kubectl create -f container-manager-service-remotevis.yaml
     kubectl apply -f container-manager-deploy-remotevis.yaml

if only that changed, otherwise on has also to create the secrets and analytics namespace.

A serviceDump has to be run to reexport the ports to the frontend, then the frontend setup needs to be updated.
