const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
function createServer(options={}){
 const rooms=new Map(),root=path.join(__dirname,'public');
 const server=(options.tls?require('node:https'):http).createServer(...(options.tls?[options.tls]:[]), (req,res)=>{
  const u=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if(u.pathname==='/health'){res.end('ok');return;}
  const file=path.join(root,u.pathname==='/'?'index.html':u.pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(b);});
 });
 const wss=new WebSocketServer({server,maxPayload:524288});
 const send=(s,m)=>{if(s?.readyState===1)s.send(JSON.stringify(m));};
 const broadcast=(r,m)=>r.members.forEach(s=>send(s,m));
 const state=r=>broadcast(r,{type:'room',code:r.code,members:r.members.map(s=>({id:s.id,name:s.nick,host:s===r.host})),sharing:r.sharing,allowed:r.allowed});
 function leave(s){const r=s.room;if(!r)return;s.room=null;if(r.host===s){broadcast(r,{type:'closed'});r.members.forEach(p=>p.room=null);rooms.delete(r.code);}else{r.members=r.members.filter(p=>p!==s);broadcast(r,{type:'peer-left'});state(r);}}
 wss.on('connection',(s,req)=>{
  if(options.accessToken){const token=new URL(req.url,'http://localhost').searchParams.get('token')||'';const a=Buffer.from(token),b=Buffer.from(options.accessToken);if(a.length!==b.length||!crypto.timingSafeEqual(a,b)){s.close(1008,'invalid connection token');return;}}
  const origin=req.headers.origin;
  const publicOrigin=options.publicOrigin||process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
  if(publicOrigin&&origin){let trusted=false;try{const u=new URL(origin);trusted=u.origin===new URL(publicOrigin).origin||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));}catch{}if(!trusted){s.close(1008,'origin');return;}}
  const origins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
  if(origins.length && !origins.includes(origin)){s.close(1008,'origin');return;}
  s.id=crypto.randomUUID();s.count=0;s.window=Date.now();s.alive=true;s.on('pong',()=>s.alive=true);
  s.on('message',(raw,binary)=>{try{
   if(binary){const r=s.room;if(!r||r.host!==s||!r.sharing||!r.relay)return;const now=Date.now();if(now-(s.lastFrame||0)<80)return;s.lastFrame=now;if(raw.length<4||raw[0]!==255||raw[1]!==216)return;for(const guest of r.members)if(guest!==s&&guest.readyState===1&&guest.bufferedAmount<524288)guest.send(raw,{binary:true});return;}
   if(raw.length>65536)throw Error('메시지가 너무 큽니다');
   if(Date.now()-s.window>1000){s.window=Date.now();s.count=0;}if(++s.count>100)throw Error('요청이 너무 많습니다');
   const m=JSON.parse(raw);if(!m||typeof m.type!=='string')throw Error('잘못된 메시지');
   if(m.type==='create'||m.type==='join'){
    if(s.room)throw Error('먼저 방에서 나가세요');s.nick=String(m.name||'플레이어').trim().slice(0,20)||'플레이어';
    let r;if(m.type==='create'){
     if(rooms.size>=1000)throw Error('서버가 혼잡합니다');let code;do{code=crypto.randomBytes(5).toString('hex').toUpperCase();}while(rooms.has(code));
     r={code,members:[],host:s,sharing:false,allowed:true};rooms.set(code,r);
    }else{r=rooms.get(String(m.code).toUpperCase());if(!r)throw Error('방을 찾을 수 없습니다');if(r.members.length>=2)throw Error('방은 최대 2명입니다');}
    s.room=r;r.members.push(s);send(s,{type:'welcome',id:s.id,host:s===r.host,ice:iceConfig()});state(r);return;
   }
   const r=s.room;if(!r)throw Error('먼저 방에 입장하세요');
   if(m.type==='leave'){leave(s);return;}
   if(m.type==='policy'){if(s!==r.host)throw Error('호스트만 변경할 수 있습니다');r.sharing=m.sharing===true;if(!r.sharing)r.relay=false;r.allowed=m.allowed===true;state(r);return;}
   if(m.type==='kick'){if(s!==r.host)throw Error('호스트만 퇴장시킬 수 있습니다');const p=r.members.find(x=>x!==s);if(p){send(p,{type:'closed'});leave(p);}return;}
   if(m.type==='relay-start'){
    if(s!==r.host||!r.sharing)throw Error('공유 중인 호스트만 호환 연결을 시작할 수 있습니다');
    r.relay=true;broadcast(r,{type:'transport',mode:'relay'});return;
   }
   if(m.type==='relay-input'||m.type==='relay-event'){
    if(!r.sharing||!r.relay)return;
    if(!m.data||typeof m.data!=='object'||JSON.stringify(m.data).length>4096)return;
    if(m.type==='relay-input'&&s!==r.host&&['move','jump','attack','skin','react'].includes(m.data.type))send(r.host,{type:'relay-input',actorId:s.id,data:m.data});
    if(m.type==='relay-event'&&s===r.host&&['state','effect'].includes(m.data.type))r.members.filter(p=>p!==s).forEach(p=>{if(p.bufferedAmount<524288)send(p,{type:'relay-event',data:m.data});});
    return;
   }
   if(m.type==='signal'){
    if(!r.sharing)throw Error('공유가 중지되었습니다');
    if(!m.data || JSON.stringify(m.data).length>60000)throw Error('잘못된 연결 정보');
    r.members.filter(p=>p!==s).forEach(p=>send(p,{type:'signal',data:m.data}));return;
   }
  }catch(e){send(s,{type:'error',message:e.message});}});
  s.on('close',()=>leave(s));s.on('error',()=>{});
 });
 const timer=setInterval(()=>wss.clients.forEach(s=>{if(!s.alive)return s.terminate();s.alive=false;s.ping();}),30000);timer.unref();
 server.on('close',()=>clearInterval(timer));return {server,wss,rooms};
}
function iceConfig(){const ice=[];if(process.env.STUN_URL)ice.push({urls:process.env.STUN_URL});if(process.env.TURN_URL&&process.env.TURN_SECRET){const username=`${Math.floor(Date.now()/1000)+3600}:invader`;ice.push({urls:process.env.TURN_URL.split(','),username,credential:crypto.createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64')});}return ice;}
if(require.main===module)createServer().server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('Screen Invaders: http://localhost:'+(process.env.PORT||8787)));
module.exports={createServer};
