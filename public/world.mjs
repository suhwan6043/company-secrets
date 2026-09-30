// The host owns this world. actorId is chosen from the authenticated room/channel,
// never from the input packet. Snapshot data contains no local cooldown secrets.
export class World {
 constructor(){this.players=new Map();this.active=false;this.paused=false;this.allowed=true;this.aspect=16/9;this.revision=0;}
 members(members){const ids=new Set(members.map(m=>m.id));for(const id of this.players.keys())if(!ids.has(id))this.players.delete(id);
  members.forEach((m,i)=>{if(!this.players.has(m.id))this.players.set(m.id,{id:m.id,name:m.name,x:i===0?.3:.7,y:.8,skin:i===0?'cat':'alien',hp:3,kills:0,deaths:0,jumpUntil:0,respawnAt:0,invulnerableUntil:0,lastMove:-Infinity,lastAttack:-Infinity,lastReact:-Infinity,seen:new Set()});else this.players.get(m.id).name=m.name;});this.revision++;}
 input(actorId,m,now=Date.now()){
  const p=this.players.get(actorId);if(!p||!m||typeof m!=='object')return null;
  if(m.type==='skin'&&['cat','alien','robot'].includes(m.skin)){p.skin=m.skin;this.revision++;return {changed:true};}
  if(!this.active||this.paused||p.hp===0)return null;
  if(m.type==='move'&&Number.isFinite(m.dx)&&Math.abs(m.dx)===1&&now-p.lastMove>=50){p.lastMove=now;p.x=Math.max(.05,Math.min(.95,p.x+m.dx*.025));this.revision++;return {changed:true};}
  if(m.type==='jump'&&p.jumpUntil===0){p.jumpUntil=now+650;this.revision++;return {changed:true};}
  if(m.type==='react'&&now-p.lastReact>=500){p.lastReact=now;return {effect:{x:p.x,y:this.y(p,now),w:'heart',actorId}};}
  if(m.type!=='attack'||!this.allowed||!['hammer','bomb'].includes(m.weapon)||!Number.isFinite(m.x)||!Number.isFinite(m.y)||m.x<0||m.x>1||m.y<0||m.y>1||typeof m.id!=='string'||m.id.length<1||m.id.length>64||p.seen.has(m.id))return null;
  const cooldown=m.weapon==='bomb'?1500:500;if(now-p.lastAttack<cooldown)return null;
  p.lastAttack=now;p.seen.add(m.id);if(p.seen.size>256)p.seen.delete(p.seen.values().next().value);
  // Only the opponent can be hit. Radius measured in fractions of screen width.
  const target=[...this.players.values()].find(other=>other.id!==actorId),radius=m.weapon==='bomb'?.15:.08;
  const hit=!!target&&target.hp>0&&now>=target.invulnerableUntil&&Math.hypot(m.x-target.x,(m.y-this.y(target,now))/this.aspect)<=radius;
  if(hit){target.hp=Math.max(0,target.hp-(m.weapon==='bomb'?2:1));if(target.hp===0){target.deaths++;p.kills++;target.respawnAt=now+2500;target.jumpUntil=0;}this.revision++;}
  return {changed:hit,effect:{x:m.x,y:m.y,w:m.weapon,hit,actorId,targetId:hit?target.id:null}};
 }
 y(p,now){if(!p.jumpUntil||now>=p.jumpUntil)return p.y;const progress=1-(p.jumpUntil-now)/650;return p.y-Math.sin(Math.PI*Math.max(0,progress))*.18;}
 tick(now=Date.now()){let changed=false;for(const p of this.players.values()){
  if(p.jumpUntil&&now>=p.jumpUntil){p.jumpUntil=0;changed=true;}
  if(p.hp===0&&now>=p.respawnAt){p.hp=3;p.respawnAt=0;p.invulnerableUntil=now+1000;changed=true;}
 }if(changed)this.revision++;return changed;}
 snapshot(now=Date.now()){return {revision:this.revision,active:this.active,paused:this.paused,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:this.y(p,now),skin:p.skin,hp:p.hp,kills:p.kills,deaths:p.deaths,respawnMs:Math.max(0,p.respawnAt-now),invulnerable:now<p.invulnerableUntil}))};}
}
