#! /bin/bash
#docker network create --subnet=192.168.0.0/16 multi-user-net
#docker run --userns=host --net multi-user-net --ip 192.168.0.157  -p 80:80 -v $PWD:/usr/src/app -w /usr/src/app -v ~/.minikube/:/.minikube/:ro -it node:6 bash
#On local-machine;  To be run from the folder where nodejs code is present

#MongoDB
docker run --name filemanager-mongo -p 27017:27017 --restart=unless-stopped -d mongo

docker run -p 80:80  --name=node-manager --env PORT=80 --env NODE_ENV=production -v $PWD:/usr/src/app -w /usr/src/app -d node:6 bash -c "npm install && npm start watcher webserver apiserver"

#On labdev-nomad ;  To be run from the folder where nodejs code is present

docker run -p 8801:443 --restart=unless-stopped  --name=node-manager-https --env PORT=443 --env NODE_ENV=labdev -v /u/ankar/certi:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start webserver"
docker run -p 880:443 --restart=unless-stopped  --name=node-manager-api --env PORT=443 --env NODE_ENV=labdev -v /u/ankar/certi:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start apiserver"
docker run -p --restart=unless-stopped  --name=node-manager-watcher --env PORT=443 --env NODE_ENV=labdev -v /u/ankar/certi:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start watcher"

#On analytics-toolkit or labtest-nomad; To be run from the folder where nodejs code is present

docker run -p 8801:443  --restart=unless-stopped --name=analytics-node-manager --env PORT=443 --env NODE_ENV=analyticsToolkit -v /root/nomad-coe:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start webserver"
docker run -p 8802:443  --restart=unless-stopped --name=analytics-node-api --env PORT=443 --env NODE_ENV=analyticsToolkit -v /root/nomad-coe:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start apiserver"
docker run -p 8801:443  --restart=unless-stopped --name=analytics-node-watcher --env PORT=443 --env NODE_ENV=analyticsToolkit -v /root/nomad-coe:/certs:ro -v $PWD:/usr/src/app -w /usr/src/app -v /nomad/nomadlab/beaker-notebooks/user-data:/nomad/nomadlab/beaker-notebooks/user-data -d node:6 bash -c "npm install && npm start watcher"
