#!/bin/sh
# keeps measuring the sites the re-clone loop has finished (idx = original idx + 40000 -> mapped back)
while true; do
  python3 /rl/build_pairs.py /lab/sites/scan_resp_a3.jsonl /tmp/pairs_a3_raw.tsv >/dev/null 2>&1
  python3 - <<'PY'
rows=[l.rstrip('\n').split('\t') for l in open('/tmp/pairs_a3_raw.tsv')]
open('/tmp/pairs_a3.tsv','w').write(''.join(f"{int(r[0])-40000}\t{r[1]}\t{r[2]}\n" for r in rows))
PY
  python /rl/responsive_compare.py /tmp/pairs_a3.tsv /rl/out/a3 --widths 1440,1024,768,480,375 --workers 1 >> /rl/out/a3.log 2>&1
  sleep 120
done
