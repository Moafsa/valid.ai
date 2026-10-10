#!/usr/bin/env python3
"""Writes the VSL fixtures of the video lab into tools/site-lab/www (served on :8099). One page per way a real page puts a video on the screen."""
import os
W = "/opt/funnelai/tools/site-lab/www"
CSS = "body{margin:0;font-family:Inter,Arial,sans-serif;background:#0b1020;color:#fff;text-align:center}main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:28px}.cta{display:inline-block;margin:20px 8px;padding:16px 34px;background:#16a34a;color:#fff;border-radius:999px;font-weight:700;text-decoration:none}.box{position:relative;overflow:hidden;background:#000;border-radius:14px;margin:16px auto}.cover{position:absolute;inset:0;z-index:30;cursor:pointer;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}.cover i{width:70px;height:70px;border-radius:50%;background:#d32f2f;display:block}"
def page(name, body, script=""):
    os.makedirs(f"{W}/{name}", exist_ok=True)
    open(f"{W}/{name}/index.html", "w").write(f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oferta {name}</title><style>{CSS}</style></head><body><main><h1>Assista ao vídeo até o final</h1>{body}</main>{("<script>"+script+"</script>") if script else ""}</body></html>')

# 1. the page that failed in production: a web component player (shadow iframe), a click-to-play layer on top, a buy button revealed by the video's clock
page("vsl_ytcomp", '''<div class="box" style="width:360px;aspect-ratio:9/16"><youtube-video src="https://youtu.be/dQw4w9WgXcQ" style="display:block;width:100%;height:100%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(1.15)"></youtube-video><div id="cover" class="cover"><i></i></div></div><div id="slot" style="min-height:100px"></div>''', '''
class YT extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'});this._t=0}
connectedCallback(){this.shadowRoot.innerHTML='<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?controls=0&enablejsapi=1" style="width:100%;height:100%;border:0"></iframe>'}
get currentTime(){return this._t}get duration(){return 212}play(){clearInterval(this._i);this._i=setInterval(()=>{this._t+=1;this.dispatchEvent(new Event('timeupdate'))},1000)}}
customElements.define('youtube-video',YT);
const v=document.querySelector('youtube-video');
v.addEventListener('timeupdate',e=>{if(e.target.currentTime>=45&&!document.getElementById('buy')){const a=document.createElement('a');a.id='buy';a.href='https://pay.hotmart.com/x1';a.className='cta';a.textContent='ADICIONAR AO MEU PEDIDO';document.getElementById('slot').appendChild(a)}});
document.getElementById('cover').onclick=function(){this.remove();v.play()};''')

# 2. a native video whose duration is known (VP9 plays in the test browser), a layer over it, a button at 12 s of the video
page("vsl_native_pitch", '''<div class="box" style="width:640px;height:360px"><video id="v" src="/media/vsl20.webm" controls playsinline style="width:100%;height:100%"></video><div id="cover" class="cover"><i></i></div></div><div id="slot" style="min-height:90px"></div>''', '''
const v=document.getElementById('v');
v.addEventListener('timeupdate',()=>{if(v.currentTime>=12&&!document.getElementById('buy')){const a=document.createElement('a');a.id='buy';a.href='https://pay.hotmart.com/x2';a.className='cta';a.textContent='QUERO MEU ACESSO';document.getElementById('slot').appendChild(a)}});
document.getElementById('cover').onclick=function(){this.remove();v.play()};''')

# 3. a native video the browser cannot read (H.264 in the test browser: no duration known): the probe has to cope with NaN
page("vsl_native_nodur", '''<div class="box" style="width:640px;height:360px"><video id="v" src="/media/vsl70.mp4" controls playsinline style="width:100%;height:100%"></video></div><div id="slot" style="min-height:90px"></div>''', '''
const v=document.getElementById('v');
v.addEventListener('timeupdate',()=>{if(v.currentTime>=30&&!document.getElementById('buy')){const a=document.createElement('a');a.id='buy';a.href='https://pay.hotmart.com/x3';a.className='cta';a.textContent='GARANTIR MINHA VAGA';document.getElementById('slot').appendChild(a)}});''')

# 4. several videos on one page + a button that a TIMER shows (12 s of the clock) + one that the first video's clock shows (10 s)
page("vsl_multi", '''<video id="v1" src="/media/vsl20.webm" controls playsinline style="width:640px;height:360px;background:#000"></video>
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="640" height="360" style="border:0;display:block;margin:16px auto" allowfullscreen></iframe>
<iframe src="https://player.vimeo.com/video/76979871" width="640" height="360" style="border:0;display:block;margin:16px auto" allowfullscreen></iframe>
<div id="slot" style="min-height:90px"></div><div id="slot2" style="min-height:90px"></div>''', '''
const v=document.getElementById('v1');
v.addEventListener('timeupdate',()=>{if(v.currentTime>=10&&!document.getElementById('pitch')){const a=document.createElement('a');a.id='pitch';a.href='https://pay.hotmart.com/x4';a.className='cta';a.textContent='COMPRAR PELO VIDEO';document.getElementById('slot').appendChild(a)}});
setTimeout(()=>{const a=document.createElement('a');a.id='late';a.href='https://pay.hotmart.com/x5';a.className='cta';a.textContent='OFERTA POR TEMPO';document.getElementById('slot2').appendChild(a)},12000);''')

# 5. web components without a known script on the page: lite-youtube, wistia-player, mux-player (their addresses are in attributes)
page("vsl_components", '''<lite-youtube videoid="dQw4w9WgXcQ" style="display:block;width:640px;height:360px;background:#000;margin:16px auto"></lite-youtube>
<wistia-player media-id="abc123xyz9" style="display:block;width:640px;height:360px;background:#000;margin:16px auto"></wistia-player>
<mux-player playback-id="DS00Spx1CV902MCtPj5WknGlR102V5HFkDe" style="display:block;width:640px;height:360px;background:#000;margin:16px auto"></mux-player>''')

# 6. frames of the video hosts the market uses
page("vsl_iframes", '''<iframe src="https://fast.wistia.net/embed/iframe/abc123xyz9" width="640" height="360" style="border:0;display:block;margin:12px auto"></iframe>
<iframe src="https://player-vz-8e1b4c3d-4e1.tv.pandavideo.com.br/embed/?v=0f0f0f0f-1111-2222-3333-444444444444" width="640" height="360" style="border:0;display:block;margin:12px auto"></iframe>
<iframe src="https://iframe.mediadelivery.net/embed/12345/abcd1234-0000-1111-2222-333344445555" width="640" height="360" style="border:0;display:block;margin:12px auto"></iframe>
<iframe src="https://fast.vidalytics.com/embed/AbCdEf/GhIjKl" width="640" height="360" style="border:0;display:block;margin:12px auto"></iframe>
<iframe src="https://iframe.videodelivery.net/abcdef0123456789abcdef0123456789" width="640" height="360" style="border:0;display:block;margin:12px auto"></iframe>''')

# 7. a video that only gets its address when it scrolls into view, with <source> children
page("vsl_lazy", '''<div style="height:1400px;color:#9ca3af;padding-top:40px">role para baixo</div>
<video id="lz" controls playsinline preload="none" style="width:640px;height:360px;background:#000"><source data-src="/media/vsl20.webm" type="video/webm"></video>
<div style="height:200px"></div>''', '''
const lz=document.getElementById('lz');
new IntersectionObserver((es,io)=>{es.forEach(e=>{if(e.isIntersecting){const s=lz.querySelector('source');s.src=s.dataset.src;lz.load();io.disconnect()}})},{rootMargin:'200px'}).observe(lz);''')

# 8. a cover that is a plain button over the video (no svg, a word), and a video inside a tab that is not the first
page("vsl_cover_text", '''<div class="box" style="width:640px;height:360px"><video id="v" src="/media/vsl20.webm" playsinline style="width:100%;height:100%"></video><button id="cv" style="position:absolute;inset:0;width:100%;height:100%;z-index:5;cursor:pointer;background:rgba(0,0,0,.5);color:#fff;border:0;font-size:22px">Clique para assistir</button></div>''', '''
document.getElementById('cv').onclick=function(){this.remove();document.getElementById('v').play()};''')
# 9. a button that a LONG timer shows (20 s of the clock; the page's own timer, no video clock involved), over a frame video
page("vsl_timer", '''<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="640" height="360" style="border:0;display:block;margin:12px auto" allowfullscreen></iframe><div id="slot" style="min-height:90px"></div>''', '''
setTimeout(()=>{const a=document.createElement('a');a.href='https://pay.hotmart.com/x6';a.className='cta';a.textContent='LIBERAR MEU DESCONTO';document.getElementById('slot').appendChild(a)},20000);''')
print("fixtures written:", sorted(n for n in os.listdir(W) if n.startswith("vsl_")))
