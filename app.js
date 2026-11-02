// Read-only viewer. Data files are AES-GCM encrypted; the key comes from the #fragment of your
// private link, which browsers never send to any server. This repo contains no key and no path.
const $=s=>document.querySelector(s);
// Encrypted data lives on the 'data' branch (not the Pages branch), read through raw.githubusercontent.com.
const DESK_DATA_BASE='https://raw.githubusercontent.com/idk02111/desk-web/';
const DESK_REF='https://api.github.com/repos/idk02111/desk-web/git/ref/heads/data';
// Latest data commit: ETag-revalidated (304s don't count against GitHub's 60/h limit); files are then
// read from the immutable commit URL (fresh in ~3s). If the API is rate-limited, fall back to the
// branch URL (raw CDN, up to ~5 min stale).
let sha='data';
async function refresh(){try{const r=await fetch(DESK_REF,{cache:'no-cache'});
  if(r.ok){sha=(await r.json()).object.sha}else sha='data';}catch(e){sha='data'}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button,.tab').forEach(e=>e.classList.remove('on'));
  b.classList.add('on');$('#'+b.dataset.t).classList.add('on');});
const secret=decodeURIComponent(location.hash.slice(1));
async function sha(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
let dir,key;
async function init(){
  if(secret.length<32)return;
  dir='d/'+hex(await sha('dir:'+secret)).slice(0,32)+'/';
  key=await crypto.subtle.importKey('raw',await sha('key:'+secret),'AES-GCM',false,['decrypt']);
  $('#locked').textContent='Waiting for the first data file…';window.deskStatus='waiting';
  tick();setInterval(tick,15000);
}
async function load(name){
  const r=await fetch(DESK_DATA_BASE+sha+'/'+dir+name,{cache:sha==='data'?'no-store':'default'});
  if(!r.ok)throw new Error(r.status);
  const raw=new Uint8Array(await r.arrayBuffer());
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(0,12)},key,raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function tick(){
  await refresh();
  try{
    const st=await load('state.json');$('#locked')?.remove();window.deskStatus='ok';window.deskState=st;
    $('#mode').textContent=st.mode||'—';$('#age').textContent='updated '+new Date(st.ts).toLocaleTimeString();
    $('#cards').innerHTML=(st.cards||[]).map(c=>`<div class="card"><b>${esc(c.title)}</b><div>${esc(c.text)}</div></div>`).join('');
    $('#agentcards').innerHTML=(st.agents||[]).map(a=>`<div class="card"><b>${esc(a.name)}</b> <span class="muted">${esc(a.status)}</span><div>${esc(a.line)}</div></div>`).join('');
    $('#settings').innerHTML=Object.entries(st.settings||{}).map(([k,v])=>`<tr><td class="muted">${esc(k)}</td><td>${esc(JSON.stringify(v))}</td></tr>`).join('');
    const a=st.account||{};$('#acct').innerHTML=`FOMO <b>@${esc(a.handle)}</b> · <a href="${esc(a.profileUrl)}">profile</a>`;
    const act=await load('activity.json');
    $('#feed').innerHTML=(act.items||[]).map(i=>`<li class="${i.kind==='kill'?'kill':''}"><b>${esc(i.title)}</b> <span class="muted">${esc(i.subtitle)}</span> ${esc(i.value)} ${i.link?`<a href="${esc(i.link)}">FOMO</a>`:''}</li>`).join('');
  }catch(e){$('#age').textContent='no data yet';if(window.deskStatus!=='ok')window.deskStatus='nodata:'+e.message}
}
init();
// Account tab: FOMO links come verbatim from links.py via the data file, never built here.
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
