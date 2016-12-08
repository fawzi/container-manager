#! /bin/bash
docker network create --subnet=192.168.0.0/16 multi-user-net
docker run --userns=host --net multi-user-net --ip 192.168.0.157  -p 80:80 -v $PWD:/usr/src/app -w /usr/src/app -v ~/.minikube/:~/.minikube:ro -it node:6 bash

