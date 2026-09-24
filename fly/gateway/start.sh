#!/bin/sh
nginx
node /home/node/idle-stop.mjs &
exec node dist/index.js gateway --port 3001 --bind lan
