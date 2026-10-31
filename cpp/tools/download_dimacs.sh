#!/bin/sh
# Downloads the New York road network of the 9th DIMACS Implementation
# Challenge (264,346 nodes, 733,846 arcs; derived from US Census TIGER/Line
# data, public domain) into data/. The week 18 and 19 benchmarks use it if it
# exists.
set -eu
cd "$(dirname "$0")/.."
mkdir -p data
base=http://www.diag.uniroma1.it/challenge9/data/USA-road-d
for f in USA-road-d.NY.gr USA-road-d.NY.co; do
  if [ ! -f "data/$f" ]; then
    curl -fL -o "data/$f.gz" "$base/$f.gz"
    gunzip "data/$f.gz"
  fi
done
ls -l data
