#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
unzip -oq Medoyv.App-deploy.zip -d public
rm -f public/server.js public/package.json public/render.yaml public/README.md public/DEPLOY-HTTPS.md
cp cloudflare-worker.js public/_worker.js

test -s public/index.html
test -s public/service-worker.js
test -s public/_worker.js
