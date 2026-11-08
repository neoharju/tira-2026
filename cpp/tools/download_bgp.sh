#!/bin/sh
# Downloads a table of the global IPv4 BGP routes into data/bgp-table.txt, one
# route per line: "a.b.c.d/length AS", where AS is the network that announced
# the route. The week 29 benchmark of task 6 uses it if it exists. The table
# is APNIC's daily list of the routes that its BGP router (AS131072) sees, a
# view of the same global table as the Route Views collectors
# (archive.routeviews.org, which publish their tables in the binary MRT format).
set -eu
cd "$(dirname "$0")/.."
mkdir -p data
if [ ! -f data/bgp-table.txt ]; then
  curl -fL -o data/bgp-table.txt https://thyme.apnic.net/current/data-raw-table
fi
wc -l data/bgp-table.txt
