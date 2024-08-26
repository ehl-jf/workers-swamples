#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VERSION=${1:-1.0.0}

JPD=${JPD:-localhost:8082}
IMAGE_TAG="${JPD}/docker-local/hello:${VERSION}"

docker build -t ${IMAGE_TAG} -f ${DIR}/images/withProperties.dockerfile ${DIR}/images
docker push ${IMAGE_TAG}
 