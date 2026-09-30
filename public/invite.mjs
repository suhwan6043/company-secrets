import {normalizeEndpoint} from './network.mjs';
export function invitationLink(endpoint,code){
 if(!/^[A-F0-9]{10}$/.test(code))throw Error('먼저 방을 만드세요.');
 const u=new URL(normalizeEndpoint(endpoint));u.protocol=u.protocol==='wss:'?'https:':'http:';u.searchParams.set('room',code);return u.href;
}
export function readInvitation(value){
 const u=new URL(value),code=u.searchParams.get('room');if(code===null)return null;
 if(!/^[A-Fa-f0-9]{10}$/.test(code)||u.searchParams.getAll('room').length!==1||u.searchParams.getAll('token').length>1)throw Error('초대 링크가 올바르지 않습니다. 방장에게 새 링크를 받으세요.');
 const endpoint=new URL('/',u);const token=u.searchParams.get('token');if(token)endpoint.searchParams.set('token',token);
 return {code:code.toUpperCase(),endpoint:normalizeEndpoint(endpoint.href)};
}
export function attackId(){
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
