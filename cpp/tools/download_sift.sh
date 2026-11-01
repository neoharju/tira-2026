#!/bin/sh
# Downloads SIFT1M of the TEXMEX corpus (1,000,000 SIFT descriptors of 128
# values and 10,000 queries) into data/sift/. The week 23 and 24 benchmarks
# use its first vectors if it exists. The corpus is from INRIA; it was
# published with H. Jegou, M. Douze and C. Schmid: Product Quantization for
# Nearest Neighbor Search (IEEE TPAMI, 2011). Check its terms of use on
# http://corpus-texmex.irisa.fr/ before you publish results with it.
set -eu
cd "$(dirname "$0")/.."
mkdir -p data
if [ ! -f data/sift/sift_base.fvecs ]; then
  curl -fL -o data/sift.tar.gz ftp://ftp.irisa.fr/local/texmex/corpus/sift.tar.gz
  tar -xzf data/sift.tar.gz -C data
  rm data/sift.tar.gz
fi
ls -l data/sift
