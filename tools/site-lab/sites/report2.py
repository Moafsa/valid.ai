#!/usr/bin/env python3
"""Final numbers of the real-site lab: last comparison of every site (wave 2 where it exists), bot-check originals set aside."""
import json, glob, os, re, subprocess, collections
S = '/opt/funnelai/tools/site-lab/sites'
BLOCK = {"verificação", "segurança", "cloudflare", "captcha", "robô", "robot", "blocked", "denied", "checking", "browser", "challenge", "navegador", "human", "humano", "verifying", "ray", "checkpoint", "vercel", "ponto", "verificando"}
def load(d):
    out = {}
    for f in glob.glob(f'{S}/{d}/*/result.json'):
        r = json.load(open(f))
        if 'widths' in r: out[r['idx']] = (d, r)
    return out
v1 = load('out_v1'); a = load('out'); b = load('out2')
final = {**a, **b}
def blocked(d, idx):
    p = f'{S}/{d}/{idx:03d}/text_orig_1440.txt'
    if not os.path.exists(p): return False
    words = set(re.findall(r'[a-zà-ÿ0-9]{3,}', open(p).read().lower()))
    return len(words) < 160 and len(BLOCK & words) >= 2
def flags(r):
    f = {k: 0 for k in ('texto', 'celular_largo', 'imagem_quebrada', 'video', 'primeira_tela', 'altura', 'mini_player')}
    for w, d in r['widths'].items():
        if d.get('fail'): continue
        if d.get('recall', 1) < 0.9: f['texto'] = 1
        if d.get('overflowX'): f['celular_largo'] = 1
        if d.get('broken', [0, 0])[1] > d.get('broken', [0, 0])[0] + 1: f['imagem_quebrada'] = 1
        va = d.get('videoArea')
        if d.get('videoMissing') or (va is not None and (va < 0.6 or va > 1.6)): f['video'] = 1
        if d.get('diffTop', 0) > 30: f['primeira_tela'] = 1
        hr = d.get('heightRatio', 1)
        if hr < 0.8 or hr > 1.25: f['altura'] = 1
        if d.get('fixedMedia'): f['mini_player'] = 1
    return f
ok_ids = [i for i, (d, r) in final.items() if not blocked(d, i) and not any(w.get('fail') for w in r['widths'].values())]
blk = [i for i, (d, r) in final.items() if blocked(d, i)]
fail = [i for i, (d, r) in final.items() if any(w.get('fail') for w in r['widths'].values()) and i not in blk]
print(f'sites com clone comparado: {len(final)} | original bloqueou a conferência: {len(blk)} | falha ao medir: {len(fail)} | medidos de verdade: {len(ok_ids)}')
cats = list(flags(next(iter(final.values()))[1]).keys())
tot = collections.Counter(); clean = 0
for i in ok_ids:
    f = flags(final[i][1]); clean += not any(f.values())
    for k, v in f.items(): tot[k] += v
print('limpos (nenhum alarme):', clean, '/', len(ok_ids), f'({round(100 * clean / max(1, len(ok_ids)))}%)')
print({k: tot[k] for k in cats})
# before / after on the sites both runs measured
both = [i for i in ok_ids if i in v1 and not blocked('out_v1', i)]
def cnt(S_, ids):
    t = collections.Counter(); c = 0
    for i in ids:
        f = flags(S_[i][1]); c += not any(f.values())
        for k, v in f.items(): t[k] += v
    return c, {k: t[k] for k in cats}
print('antes x depois nos', len(both), 'sites que a versão antiga também mediu:')
print('  antes :', *cnt(v1, both)); print('  depois:', *cnt(final, both))
def weight(S_, ids):
    o = c = 0
    for i in ids:
        d, _ = S_[i]; p = f'{S}/{d}/{i:03d}/raw_1440.json'
        if os.path.exists(p):
            raw = json.load(open(p))
            if raw['orig'].get('ok') and raw['clone'].get('ok'): o += raw['orig'].get('kb', 0); c += raw['clone'].get('kb', 0)
    return o // 1024, c // 1024
print('peso (MB) original -> clone  antes:', weight(v1, both), ' depois (todos os medidos):', weight(final, ok_ids))
# hotlinks
hot = sum(1 for i in ok_ids if any(final[i][1]['widths'].get('1440', {}).get('hotlinks', {}).values()))
print('sites com arquivos ainda vindos do site original:', hot, '/', len(ok_ids))
# phone variants
ids = ",".join(f"'{json.loads(l)['projectId']}'" for l in open(f'{S}/scan_v2.jsonl') if json.loads(l).get('status') == 'ok')
q = f"select count(distinct \"projectId\") from pages where slug like '%\\_\\_m' and \"projectId\" in ({ids})"
print('projetos (1a rodada) com versão de celular:', subprocess.run(['docker', 'exec', 'funnelai_postgres', 'psql', '-U', 'funnelai_app', '-d', 'funnelai', '-tAc', q], capture_output=True, text=True).stdout.strip())
