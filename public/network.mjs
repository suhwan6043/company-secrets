export function normalizeEndpoint(value){
 const raw=String(value).trim();if(raw.length>2048)throw Error('서버 주소가 너무 깁니다.');
 let u;try{u=new URL(raw.includes('://')?raw:'ws://'+raw);}catch{throw Error('서버 주소를 확인하세요.');}
 if(u.protocol==='https:')u.protocol='wss:';if(u.protocol==='http:')u.protocol='ws:';
 if(!['ws:','wss:'].includes(u.protocol)||u.username||u.password||u.hash||u.pathname!=='/')throw Error('ws:// 또는 wss:// 서버 주소를 입력하세요.');
 const h=u.hostname;
 const ip=h.split('.').map(Number),ipv4=/^\d+\.\d+\.\d+\.\d+$/.test(h)&&ip.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
 const local=h==='localhost'||h==='[::1]'||(ipv4&&(ip[0]===127||ip[0]===10||(ip[0]===192&&ip[1]===168)||(ip[0]===172&&ip[1]>=16&&ip[1]<=31)||(ip[0]===100&&ip[1]>=64&&ip[1]<=127)));
 if(u.protocol==='ws:'&&!local)throw Error('외부 인터넷 서버는 wss:// 보안 연결이 필요합니다.');
 for(const key of u.searchParams.keys())if(key!=='token')throw Error('지원하지 않는 서버 주소 옵션입니다.');
 return u.href;
}
