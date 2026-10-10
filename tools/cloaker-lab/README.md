# Cloaker lab

Fake sites that cloak (and sites that only look like it) with known answers, to keep the detector honest.

- `server.py` (port 8098): `/lp /js /ab /clean /drop /bots /ref /utm /region /cookie /late /iframe /meta /rot /lang /mobile /dyn /money`.
- `test_cloaker.py`: runs the detector (`services/cloaker_probe.py`, inside the scanner image, private addresses allowed only here) on each site and checks the verdict AND the condition it names. `CASES` = path -> (acceptable statuses, group that must be named, or None).
- `clone_as_visitor.py`: clones a lab site as the Instagram visitor (needs the scanner secret from `.env`).
- `out/*.json`: the public job JSON of the last run. The UI test (`tools/ui-lab/tests/cloaker_ui.py`) renders the real component from these.

```sh
# lab server
python3 /opt/funnelai/tools/cloaker-lab/server.py 8098 &
# all cases (~7 min) or only some paths
docker run --rm -v /opt/funnelai/apps/scanner:/app -v /opt/funnelai/tools/cloaker-lab:/lab -e SCANNER_SHARED_SECRET= -w /app funnelai-scanner python /lab/test_cloaker.py [/lp /cookie ...]
# the screen
cd /opt/funnelai/tools/ui-lab && ./build.sh cloaker && docker run --rm --network funnelai_network -v $PWD:/ui -v /opt/funnelai/tools/cloaker-lab:/cl funnelai-scanner python /ui/tests/cloaker_ui.py
```

## Every new cloaking technique found becomes a test

1. Add a route to `server.py` that behaves like the technique (and, if it can be confused with something harmless, a harmless twin).
2. Add a line to `CASES` with the status it must get and the group that must be named (`real`, `referer`, `params`, `inapp`, `region`, `session`, `crawler`, `social`...). A harmless twin gets `({"green"}, None)`.
3. Run the case; if the detector misses it, teach `cloaker_probe.py` (new scenario, new diff signal, or new group weight) and re-run the WHOLE suite: the old cases must keep their answers.

Rules the suite protects: a robot, a CDN or a traffic router alone is never "cloaking"; a translation, a phone layout, a clock or a random ad are not cloaking; only a deliberate condition (crawler, social robot, origin of the click, ad parameters, in-app browser, region, first visit) that really changes the page is.
