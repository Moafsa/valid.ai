import json
def jac(a,b):
    a,b=set(a or []),set(b or []); return len(a&b)/max(1,len(a|b))
def cr(a,b):
    w=1.0
    for k in ("a","button","img","h2","section","li","p","input"):
        x,y=a['counts'].get(k,0),b['counts'].get(k,0)
        if max(x,y)>=6: w=min(w,min(x,y)/max(x,y))
    return w
print(f"{'idx':>4} {'cat':8} {'words':>6} {'cnt':>5} {'class':>6} {'ids':>5} {'names':>6} {'n d/m':>12}  url")
for l in open('calib_out.jsonl'):
    j=json.loads(l); d,m=j['d'],j['m']
    if 'error' in d or 'error' in m: print(j['idx'], j['cat'], 'ERR', d.get('error'), m.get('error')); continue
    print(f"{j['idx']:>4} {j['cat']:8} {jac(d['words'],m['words']):6.2f} {cr(d,m):5.2f} {jac(d['classes'],m['classes']):6.2f} {jac(d['ids'],m['ids']):5.2f} {jac(d['names'],m['names']):6.2f} {d['n']:>5}/{m['n']:<5}  {j['url'][:50]}")
