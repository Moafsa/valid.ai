import re, sys, urllib.request, urllib.parse, ssl, json
ctx = ssl.create_default_context()
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
ARTICLES = [l.strip() for l in open("articles.txt") if l.strip()]
SKIP = re.compile(r"(google|facebook|twitter|x\.com|linkedin|instagram|youtube|pinterest|wikipedia|apple\.com/app|play\.google|medium\.com|wordpress\.org|gravatar|cloudflare|schema\.org|w3\.org|fonts\.|cdn|amazonaws|shopify\.com/(blog|pricing)|hubspot\.com|zoho\.com|herospark|landingi|popupsmart|htmlburger|bdthemes|seedprod|waitlister|storylane|convertflow|arounda|swipepages|webdew|vezadigital|orbix|sitesplaced|saasvalidation|adminlte|templatemonster|dribbble|behance|magnific|canva\.com/website|neilpatel|flammadesign|tucanomembers|webrand|superdental|gabrieldosite|landingpageagencia|bit\.ly|goo\.gl|t\.co|tiktok|whatsapp|wa\.me|mailto|tel:|javascript|play\.|itunes|apps\.apple|github\.com/(?!$)|reddit|quora|trustpilot|capterra|g2\.com|producthunt|crunchbase|slack\.com/apps)", re.I)
out = {}
for a in ARTICLES:
    try:
        req = urllib.request.Request(a, headers={"User-Agent": UA, "Accept-Language": "en,pt-BR"})
        html = urllib.request.urlopen(req, timeout=20, context=ctx).read().decode("utf-8", "ignore")
    except Exception as e:
        print("FAIL", a, str(e)[:60]); continue
    host_a = urllib.parse.urlparse(a).netloc
    n = 0
    for m in re.finditer(r'href=["\'](https?://[^"\'#\s>]+)', html):
        u = m.group(1)
        p = urllib.parse.urlparse(u)
        if p.netloc == host_a or SKIP.search(u): continue
        key = p.netloc.lower().removeprefix("www.")
        if key not in out:
            out[key] = u.split("?")[0] if p.path in ("", "/") else u
            n += 1
    print("OK", a, "new", n)
json.dump(out, open("harvested.json", "w"), indent=1)
print(len(out), "domains")
