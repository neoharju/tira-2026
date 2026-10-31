#!/bin/sh
# Downloads the web graph web-Google of the Stanford Large Network Dataset
# Collection (875,713 pages and 5,105,039 links, released by Google in 2002)
# into data/. The week 22 benchmarks use it if it exists. If you publish
# results with it, cite J. Leskovec, K. Lang, A. Dasgupta and M. Mahoney:
# Community Structure in Large Networks (Internet Mathematics, 2009).
set -eu
cd "$(dirname "$0")/.."
mkdir -p data
if [ ! -f data/web-Google.txt ]; then
  curl -fL -o data/web-Google.txt.gz https://snap.stanford.edu/data/web-Google.txt.gz
  gunzip data/web-Google.txt.gz
fi
ls -l data
