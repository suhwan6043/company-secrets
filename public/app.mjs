import {World} from './world.mjs';
import {normalizeEndpoint} from './network.mjs';
import {invitationLink,readInvitation,attackId} from './invite.mjs';
const mobile=/Android|iPhone|iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let networkConfig,onlineMode=false;
const $=id=>document.getElementById(id), video=$('screen'), canvas=$('effects'), ctx=canvas.getContext('2d');
let incoming=Promise.resolve(),localEndpoint,selectedEndpoint,retryTimer,retries=0;let localCandidates=0;
let ws,host=false,id,room,peer,channel,ice=[],pending=[],source,output,drawTimer,paused=false,allowed=true,sharing=false,weapon='off',lastAttack=0,generation=0;
let relay=false,relayTimer,fallbackTimer,captureCanvas,relayEpoch=0,decoding=false;
const relayScreen=$('relayScreen');
let world=new World(),snapshot={players:[]},sparks=[];
const note=s=>$('notice').textContent=s;
const send=m=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
function connect(target=selectedEndpoint){clearTimeout(retryTimer);selectedEndpoint=target;const previous=ws;ws=null;previous?.close();ws=new WebSocket(target);ws.binaryType='arraybuffer';const socket=ws;socket.onerror=()=>{$('networkMessage').textContent='서버에 연결할 수 없습니다. 주소·같은 네트워크 여부·방장 PC 방화벽을 확인하세요.';};ws.onopen=()=>{if(ws!==socket)return;retries=0;$('create').disabled=mobile;$('join').disabled=false;$('status').textContent='서버 연결됨';$('networkMessage').textContent='연결 완료 · 방을 만들거나 방 코드로 입장하세요.';};ws.onclose=e=>{if(ws!==socket)return;if(e.code===1008){retries=6;$('networkMessage').textContent='서버 주소의 접속 토큰이 만료되었거나 허용되지 않은 연결입니다. 방장이 다시 복사한 주소를 사용하세요.';}endMedia();$('status').textContent='연결 끊김 · 방에 다시 입장하세요';$('game').hidden=true;$('lobby').hidden=false;room=null;if(retries<6)retryTimer=setTimeout(()=>connect(),Math.min(1000*2**retries++,15000));else if(e.code!==1008)$('networkMessage').textContent='재연결을 중지했습니다. 주소를 확인하고 서버 연결을 다시 누르세요.';};ws.onmessage=e=>{incoming=incoming.then(async()=>{if(ws!==socket)return;if(e.data instanceof ArrayBuffer){receiveFrame(e.data);return;}try{const m=JSON.parse(e.data);
 if(m.type==='welcome'){id=m.id;host=m.host;ice=m.ice;world=new World();snapshot={players:[]};return;}
 if(m.type==='room'){room=m;if(host)world.members(m.members);$('lobby').hidden=true;$('game').hidden=false;$('roomcode').textContent=m.code;$('members').textContent=m.members.map(p=>p.name).join(' · ')+` (${m.members.length}/2)`;
  for(const x of ['share','pause','stop','allowLabel','kick','compat','invite'])$(x).hidden=!host;
  allowed=m.allowed;sharing=m.sharing;if(host){world.active=sharing;world.allowed=allowed;sync();}$('badge').hidden=!sharing;
  if(!sharing&&!host){stopRelay();closePeer();video.srcObject=null;$('empty').hidden=false;}
  if(host&&output&&m.members.length===2&&!peer&&!relay){try{await offer();}catch{requestRelay();}}return;}
 if(m.type==='transport'&&m.mode==='relay'&&sharing)startRelay();
 if(m.type==='relay-input'&&host&&relay&&room?.members.some(p=>p.id===m.actorId&&p.id!==id))applyInput(m.actorId,m.data);
 if(m.type==='relay-event'&&!host&&relay&&sharing)receiveGame(m.data);
 if(m.type==='signal'&&!relay)await signal(m.data);
 if(m.type==='peer-left'){stopRelay();closePeer();note('상대가 나갔습니다.');}
 if(m.type==='closed'){endMedia();room=null;$('game').hidden=true;$('lobby').hidden=false;}
 if(m.type==='error')note(m.message),$('status').textContent=m.message;
 }catch(e){note('연결 오류: '+e.message);}});};}
function closePeer(){clearTimeout(fallbackTimer);generation++;peer?.close();peer=null;channel=null;pending=[];}
function makePeer(){closePeer();peer=new RTCPeerConnection({iceServers:ice});const pc=peer;
 localCandidates=0;pc.onicecandidate=e=>{if(e.candidate){localCandidates++;send({type:'signal',data:{candidate:e.candidate}});}};
 pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete'&&localCandidates===0){$('connectionDetail').textContent='연결 가능한 영상 주소를 찾지 못했습니다. 네트워크 또는 TURN 설정을 확인하세요.';}};
 pc.onconnectionstatechange=()=>{$('status').textContent='영상 연결: '+pc.connectionState;$('connectionDetail').textContent='영상 '+pc.connectionState+' · 입력 '+(channel?.readyState||'대기');if(pc.connectionState==='failed'&&host)requestRelay();};
 pc.ontrack=e=>{video.srcObject=e.streams[0];$('empty').hidden=true;video.play().catch(()=>{});};pc.ondatachannel=e=>attach(e.channel);return pc;}
async function offer(){const pc=makePeer();output.getTracks().forEach(t=>pc.addTrack(t,output));attach(pc.createDataChannel('game',{ordered:true}));await pc.setLocalDescription(await pc.createOffer());if(peer===pc){send({type:'signal',data:{description:pc.localDescription}});fallbackTimer=setTimeout(()=>{if(peer===pc&&channel?.readyState!=='open')requestRelay();},8000);}}
async function signal(data){if(data.description){const d=data.description;if(d.type==='offer'&&!host){const pc=makePeer();await pc.setRemoteDescription(d);for(const c of pending)await pc.addIceCandidate(c);pending=[];await pc.setLocalDescription(await pc.createAnswer());send({type:'signal',data:{description:pc.localDescription}});}else if(d.type==='answer'&&host&&peer){await peer.setRemoteDescription(d);for(const c of pending)await peer.addIceCandidate(c);pending=[];}}
 else if(data.candidate){if(peer?.remoteDescription)await peer.addIceCandidate(data.candidate);else pending.push(data.candidate);}}
function event(m){if(relay){if(ws?.bufferedAmount<524288)send({type:host?'relay-event':'relay-input',data:m});return;}if(channel?.readyState==='open'&&channel.bufferedAmount<65536)channel.send(JSON.stringify(m));}
function attach(ch){channel=ch;ch.onopen=()=>{clearTimeout(fallbackTimer);$('connectionDetail').textContent='영상 연결됨 · 입력 연결됨';note('연결 완료 · 각자 자기 캐릭터를 조작합니다.');if(host)sync();else event({type:'skin',skin:$('skin').value});};ch.onmessage=e=>{
 if(channel!==ch)return;
 if(typeof e.data!=='string'||e.data.length>4096)return;
 try{const m=JSON.parse(e.data);if(host){const guest=room?.members.find(p=>p.id!==id);if(guest)applyInput(guest.id,m);}
 else receiveGame(m);
 }catch{}};}
function receiveGame(m){
 if(m.type==='state'&&Array.isArray(m.players)&&m.players.length<=2){snapshot=m;updateHp();}
 else if(m.type==='effect'){effect(m.x,m.y,m.w);if(m.w!=='heart')note(m.hit?'명중!':'빗나갔어요');}
}
function requestRelay(){if(host&&sharing&&output&&!relay)send({type:'relay-start'});}
function stopRelay(){relay=false;relayEpoch++;clearInterval(relayTimer);clearTimeout(fallbackTimer);relayScreen.hidden=true;relayScreen.width=relayScreen.height=1;video.hidden=false;}
function startRelay(){
 if(relay)return;closePeer();relay=true;const epoch=++relayEpoch;
 $('connectionDetail').textContent='호환 연결 · 영상 10 FPS · 게임 입력 연결됨';
 note('선택한 공유 영역을 연결 서버를 통해 전송합니다.');
 if(!host){video.srcObject=null;video.hidden=true;event({type:'skin',skin:$('skin').value});return;}
 const frame=document.createElement('canvas');frame.width=Math.min(960,captureCanvas.width);frame.height=Math.max(2,Math.round(frame.width*captureCanvas.height/captureCanvas.width));const fc=frame.getContext('2d');let busy=false;
 relayTimer=setInterval(()=>{if(busy||!relay||!sharing||epoch!==relayEpoch||!captureCanvas||ws?.readyState!==1||ws.bufferedAmount>262144)return;busy=true;fc.drawImage(captureCanvas,0,0,frame.width,frame.height);
 frame.toBlob(blob=>{busy=false;if(blob&&blob.size<524288&&epoch===relayEpoch&&relay&&sharing&&ws?.readyState===1&&ws.bufferedAmount<262144)ws.send(blob);},'image/jpeg',.65);},100);sync();
}
async function receiveFrame(bytes){
 if(host||!sharing||!relay||decoding)return;const epoch=relayEpoch;decoding=true;
 try{const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));try{if(epoch!==relayEpoch||!sharing||!relay||bitmap.width>1280||bitmap.height>4096)return;relayScreen.width=bitmap.width;relayScreen.height=bitmap.height;relayScreen.getContext('2d').drawImage(bitmap,0,0);relayScreen.hidden=false;$('empty').hidden=true;}finally{bitmap.close();}}catch{}finally{decoding=false;}
}
$('compat').onclick=requestRelay;
function sync(){if(!host)return;snapshot=world.snapshot();event({type:'state',...snapshot});window.desktopGame?.update(snapshot);updateHp();}
function updateHp(){$('hp').dataset.players=JSON.stringify(snapshot.players);$('hp').textContent=snapshot.players.map(p=>`${p.id===id?'나':p.name} ${'♥'.repeat(p.hp)}${'♡'.repeat(3-p.hp)} · ${p.kills}킬`).join('  |  ');}
function applyInput(actorId,m){const result=world.input(actorId,m);if(!result)return;
 if(result.effect){const e=result.effect;effect(e.x,e.y,e.w);event({type:'effect',...e});}sync();}
function input(m){if(host)applyInput(id,m);else event(m);}

function effect(x,y,w){sparks.push({x,y,w,t:performance.now()});if(host)window.desktopGame?.effect({x,y,w});}
function rect(){const r=canvas.getBoundingClientRect(),ratio=(!relayScreen.hidden?relayScreen.width/relayScreen.height:video.videoWidth/video.videoHeight)||16/9;let w=r.width,h=w/ratio;if(h>r.height){h=r.height;w=h*ratio;}return {x:(r.width-w)/2,y:(r.height-h)/2,w,h};}
canvas.onpointerdown=e=>{if(weapon==='off'||!sharing||!allowed)return;const r=canvas.getBoundingClientRect(),v=rect(),x=(e.clientX-r.left-v.x)/v.w,y=(e.clientY-r.top-v.y)/v.h;if(x<0||x>1||y<0||y>1)return;const m={type:'attack',id:attackId(),x,y,weapon};input(m);if(!host)effect(x,y,'aim');};

function render(t){const r=canvas.getBoundingClientRect();canvas.width=r.width*devicePixelRatio;canvas.height=r.height*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);const v=rect();ctx.save();ctx.beginPath();ctx.rect(v.x,v.y,v.w,v.h);ctx.clip();
 if(sharing)for(const p of snapshot.players){const x=v.x+p.x*v.w,y=v.y+p.y*v.h;ctx.textAlign='center';ctx.font='12px system-ui';ctx.fillStyle=p.id===id?'#baf699':'#c1a3ff';ctx.fillText(p.name+(p.id===id?' (나)':''),x,y-65);
 if(p.hp>0){ctx.globalAlpha=p.invulnerable?.6:1;ctx.font='42px system-ui';ctx.fillText({alien:'👾',cat:'🐱',robot:'🤖'}[p.skin],x,y);ctx.fillRect(x-22,y-58,44*p.hp/3,5);ctx.globalAlpha=1;}else{ctx.fillStyle='#ddd';ctx.fillText('부활 대기',x,y);}}

 sparks=sparks.filter(s=>t-s.t<900);for(const s of sparks){const p=(t-s.t)/900,x=v.x+s.x*v.w,y=v.y+s.y*v.h;ctx.globalAlpha=1-p;ctx.strokeStyle=s.w==='bomb'?'#ffbd61':'#c6a2ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,8+p*(s.w==='bomb'?100:45),0,Math.PI*2);ctx.stroke();ctx.font='30px system-ui';ctx.fillText(s.w==='heart'?'💜':s.w==='bomb'?'💥':s.w==='aim'?'＋':'✦',x,y);}
 ctx.restore();requestAnimationFrame(render);}
async function chooseCrop(stream){const raw=document.createElement('video');raw.muted=true;raw.srcObject=stream;await raw.play();const c=$('crop'),cx=c.getContext('2d');c.width=Math.min(1000,raw.videoWidth);c.height=c.width*raw.videoHeight/raw.videoWidth;let selection=null,start;
 const pos=e=>{const r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*c.width/r.width)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*c.height/r.height))};};
 const paint=()=>{cx.drawImage(raw,0,0,c.width,c.height);if(selection){cx.strokeStyle='#baf699';cx.lineWidth=3;cx.strokeRect(selection.x,selection.y,selection.w,selection.h);}};paint();
 c.onpointerdown=e=>{start=pos(e);c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!start)return;const p=pos(e);selection={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};paint();};c.onpointerup=()=>start=null;
 $('cropDialog').showModal();return new Promise(resolve=>{const finish=value=>{$('cropDialog').close();$('cropDialog').onclose=null;resolve(value);};$('cropConfirm').onclick=()=>{if(!selection||selection.w<32||selection.h<32)return;const k=raw.videoWidth/c.width;finish({raw,x:selection.x*k,y:selection.y*k,w:selection.w*k,h:selection.h*k});};$('cropCancel').onclick=()=>finish(null);$('cropDialog').oncancel=e=>{e.preventDefault();finish(null);};});}
function policy(){world.allowed=$('allow').checked;allowed=world.allowed;send({type:'policy',sharing:!!output,allowed:$('allow').checked});}
async function share(){if(!navigator.mediaDevices?.getDisplayMedia)return note('화면 공유는 PC 앱 또는 HTTPS PC 브라우저에서 가능합니다.');endMedia();const token=++generation;try{source=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});source.getVideoTracks()[0].onended=stop;const chosen=await chooseCrop(source);if(!chosen||token!==generation){stop();return;}const c=document.createElement('canvas');captureCanvas=c;const scale=Math.min(1,1280/chosen.w,1280/chosen.h);c.width=Math.max(2,Math.floor(chosen.w*scale/2)*2);c.height=Math.max(2,Math.floor(chosen.h*scale/2)*2);const cx=c.getContext('2d');const draw=()=>{cx.fillStyle='#101019';cx.fillRect(0,0,c.width,c.height);if(!paused)cx.drawImage(chosen.raw,chosen.x,chosen.y,chosen.w,chosen.h,0,0,c.width,c.height);};draw();drawTimer=setInterval(draw,1000/30);world.aspect=c.width/c.height;output=c.captureStream(30);video.srcObject=output;video.play();$('empty').hidden=true;paused=false;world.paused=false;policy();if(window.desktopGame){const result=await window.desktopGame.configure({x:chosen.x,y:chosen.y,w:chosen.w,h:chosen.h,sourceWidth:chosen.raw.videoWidth,sourceHeight:chosen.raw.videoHeight});note(result.ok?'바탕화면 오버레이 연결됨 · Ctrl/⌘+Shift+G로 입력 해제':result.reason);sync();}}catch(e){stop();note('공유 취소 또는 오류: '+e.message);}}
function endMedia(){stopRelay();captureCanvas=null;world.active=false;window.desktopGame?.stop();clearInterval(drawTimer);closePeer();source?.getTracks().forEach(t=>{t.onended=null;t.stop();});output?.getTracks().forEach(t=>t.stop());source=output=null;video.srcObject=null;sharing=false;paused=false;$('pause').textContent='공유 일시정지';$('badge').hidden=true;$('empty').hidden=false;if($('cropDialog').open)$('cropCancel').click();}
function stop(){endMedia();if(host&&room)policy();}
$('create').onclick=()=>{if(ws?.readyState!==1)return note('온라인 서버에 먼저 연결하세요.');send({type:'create',name:$('name').value});};$('join').onclick=()=>send({type:'join',name:$('name').value,code:$('code').value.trim()});$('share').onclick=share;$('stop').onclick=stop;
$('pause').onclick=()=>{if(!output)return;paused=!paused;world.paused=paused;sync();$('pause').textContent=paused?'공유 재개':'공유 일시정지';};$('allow').onchange=policy;$('kick').onclick=()=>send({type:'kick'});
$('leave').onclick=()=>{stop();send({type:'leave'});room=null;$('game').hidden=true;$('lobby').hidden=false;};$('copy').onclick=()=>copyText(room.code).then(ok=>note(ok?'방 코드를 복사했습니다.':'방 코드: '+room.code));$('full').onclick=()=>$('stage').requestFullscreen?.();
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>{weapon=b.dataset.weapon;document.querySelectorAll('[data-weapon]').forEach(x=>x.classList.toggle('active',x===b));$('stage').classList.toggle('playing',weapon!=='off');window.desktopGame?.mode(weapon);});
function move(dx){input({type:'move',dx});}
document.querySelectorAll('[data-move]').forEach(b=>{let timer;const clear=()=>clearInterval(timer);b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();clear();b.setPointerCapture(e.pointerId);move(Number(b.dataset.move));timer=setInterval(()=>move(Number(b.dataset.move)),100);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=clear;b.onclick=e=>{if(e.detail===0)move(Number(b.dataset.move));};window.addEventListener('blur',clear);});
$('jump').onclick=()=>input({type:'jump'});$('react').onclick=()=>input({type:'react'});$('skin').onchange=()=>input({type:'skin',skin:$('skin').value});

window.onkeydown=e=>{if(e.key==='Escape'){weapon='off';$('stage').classList.remove('playing');document.querySelector('[data-weapon="off"]').click();return;}if(/INPUT|SELECT/.test(e.target.tagName)||weapon==='off')return;if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1);if(e.code==='Space'){e.preventDefault();$('jump').click();}};window.onbeforeunload=()=>endMedia();
if(mobile){$('lobby').classList.add('mobileLobby');$('networkPanel').hidden=true;$('mobileHint').textContent='방장 PC 화면에서 함께 놀아요. 닉네임을 정하고 입장하세요.'; $('create').disabled=true; $('create').textContent='PC에서 방을 만들고 코드로 입장하세요'; }
window.desktopGame?.onInput(m=>{if(m.type==='stop')stop();else if(host&&['attack','move','jump','react'].includes(m.type))input(m);});
window.desktopGame?.onEscape(()=>{weapon='off';$('stage').classList.remove('playing');document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('active',b.dataset.weapon==='off'));});
setInterval(()=>{if(host&&room){world.tick();sync();}},50);
async function initializeNetwork(){
 const config=await window.desktopGame?.networkInfo();networkConfig=config;localEndpoint=config?.local||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/`;if(!config){const token=new URL(location.href).searchParams.get('token');if(token){const endpoint=new URL(localEndpoint);endpoint.searchParams.set('token',token);localEndpoint=normalizeEndpoint(endpoint.href);}}selectedEndpoint=localEndpoint;
 for(const entry of config?.addresses||[]){const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=entry.name+' · '+new URL(entry.address).hostname;button.textContent='방장 주소 복사';button.onclick=()=>copyText(entry.address).then(ok=>{$('networkMessage').textContent=ok?'방장 주소를 복사했습니다. 방 코드도 함께 전달하세요.':'아래 주소를 선택해서 복사하세요.';if(!ok){$('serverAddress').value=entry.address;$('serverAddress').select();}});row.append(label,button);$('localAddresses').append(row);}
 if(config&&!config.addresses.length)$('networkMessage').textContent='공유할 네트워크 주소가 없습니다. Wi-Fi 또는 유선 연결을 확인하세요.';
 if(config?.onlineRequired){$('localServer').hidden=true;$('localAddresses').hidden=true;if(config.online){selectedEndpoint=normalizeEndpoint(config.online);onlineMode=true;$('serverAddress').value=config.online;}else{$('networkPanel').open=true;$('create').disabled=true;$('join').disabled=true;$('status').textContent='온라인 서버 설정 필요';$('networkMessage').textContent='배포한 공용 HTTPS 서버 주소를 입력하세요. 저장하면 다음 실행부터 자동 연결됩니다.';return;}}
 const invitation=readInvitation(location.href);if(invitation){selectedEndpoint=invitation.endpoint;$('code').value=invitation.code;$('mobileHint').textContent='초대받은 방 '+invitation.code+' · 닉네임을 정하고 입장하세요.';$('mobileHint').hidden=false;}
 connect();}
 $('connectServer').onclick=async()=>{if(room)return note('방에서 나간 뒤 서버를 변경하세요.');try{let address=normalizeEndpoint($('serverAddress').value);if(networkConfig?.onlineRequired){const result=await window.desktopGame.saveServer(address);address=result.url;networkConfig.online=address;onlineMode=true;}retries=0;connect(address);}catch(e){$('networkMessage').textContent=e.message;}};
 $('localServer').onclick=()=>{if(room)return note('방에서 나간 뒤 서버를 변경하세요.');retries=0;connect(localEndpoint);};
 initializeNetwork().catch(e=>{$('networkMessage').textContent='연결 설정 오류: '+e.message;});requestAnimationFrame(render);

async function copyText(value){
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true;}}catch{}
 const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();let ok=false;try{ok=document.execCommand('copy');}catch{}field.remove();return ok;
}
$('invite').onclick=()=>{
 const entries=onlineMode?[{name:'온라인 서버',address:selectedEndpoint}]:(networkConfig?.addresses||[]);const select=$('inviteAddress');select.replaceChildren();
 if(entries.length){for(const entry of entries){const option=document.createElement('option');option.value=entry.address;option.textContent=entry.name+' · '+new URL(entry.address).hostname;select.append(option);}}
 else if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)){const option=document.createElement('option');option.value=selectedEndpoint;option.textContent=location.hostname;select.append(option);}
 if(!select.options.length)return note('PC 앱의 Wi-Fi/유선 주소가 필요합니다. 네트워크 연결을 확인하세요.');
 const update=()=>{$('inviteLink').value=invitationLink(select.value,room.code);$('inviteCopyState').textContent='휴대폰에서 링크를 여세요. 온라인 서버에서는 Wi-Fi·LTE·5G로 참여할 수 있습니다.';};select.onchange=update;update();$('inviteDialog').showModal();
};
$('inviteCopy').onclick=async()=>{const ok=await copyText($('inviteLink').value);$('inviteCopyState').textContent=ok?'초대 링크를 복사했습니다. 휴대폰으로 전달하세요.':'주소를 길게 눌러 복사하세요.';if(!ok)$('inviteLink').select();};
$('inviteLink').onclick=()=> $('inviteLink').select();$('inviteClose').onclick=()=> $('inviteDialog').close();
