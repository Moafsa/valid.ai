#!/bin/sh
# usage: sheet.sh <idx> [width] [y0] [h]  -> /opt/funnelai/tools/site-lab/sites/sheets/<idx>_<w>_<y0>.png
w=${2:-1440}; y0=${3:-0}; h=${4:-2400}
docker run --rm -e OUTD=${OUTD:-out} -v /opt/funnelai/tools/site-lab:/lab funnelai-scanner:latest python /lab/sites/sheet.py $1 $w $y0 $h /lab/sites/sheets/${OUTD:-out}_$1_${w}_${y0}.png
