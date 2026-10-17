/* Pose control uses image landmarks. Hip-relative world coordinates are not a jump-height sensor. */
(function(root){
  'use strict';
  const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
  function feature(points,aspect=16/9,mirror=true){
    if(!points||![11,12,23,24,27,28].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??0)>=.55))return null;
    const hip={x:(points[23].x+points[24].x)/2,y:(points[23].y+points[24].y)/2},shoulder=(points[11].y+points[12].y)/2,torso=hip.y-shoulder;
    if(torso<.075||hip.x<.1||hip.x>.9||Math.max(points[27].y,points[28].y)>.99||Math.min(points[11].y,points[12].y)<.015)return null;
    return {x:mirror?1-hip.x:hip.x,y:hip.y,torso,leftFoot:points[27].y,rightFoot:points[28].y,aspect};
  }
  class PoseControl{
    constructor(){this.sensitivity=.22;this.mirror=true;this.reset();}
    reset(){this.baseline=null;this.samples=[];this.calibrating=false;this.lock=null;this.lastSeen=null;this.filtered=null;this.lastTime=null;this.lane=1;this.pendingLane=1;this.pendingSince=0;this.airborne=false;this.jumpTime=-Infinity;this.groundSince=null;this.crouched=false;this.neutralSince=null;this.needsCalibration=false;}
    calibrate(){this.reset();this.calibrating=true;}
    update(poses,time,aspect=16/9){
      const events=[],candidates=(poses||[]).map((p,index)=>({f:feature(p,aspect,this.mirror),index})).filter(x=>x.f);
      let selected;
      if(this.lock){selected=candidates.map(x=>({...x,cost:Math.hypot(x.f.x-this.lock.x,x.f.y-this.lock.y)})).filter(x=>x.cost<.2&&x.f.torso/this.lock.torso>.65&&x.f.torso/this.lock.torso<1.55).sort((a,b)=>a.cost-b.cost)[0];}
      else selected=candidates.sort((a,b)=>(Math.abs(a.f.x-.5)-a.f.torso*.5)-(Math.abs(b.f.x-.5)-b.f.torso*.5))[0];
      if(!selected){if(this.lastSeen!==null&&time-this.lastSeen>1100&&this.baseline){this.needsCalibration=true;events.push({type:'lost'});}if(this.calibrating)this.samples=[];return {events,status:this.needsCalibration?'lost':'searching',progress:0,index:-1};}
      const f=selected.f;this.lock=f;this.lastSeen=time;
      if(this.needsCalibration)return {events,status:'lost',progress:0,index:selected.index};
      if(this.calibrating){
        if(this.samples.length){const first=this.samples[0];if(Math.abs(f.y-first.y)>f.torso*.14||Math.abs(f.x-first.x)>f.torso/f.aspect*.18||Math.abs(f.torso/first.torso-1)>.15)this.samples=[];}
        this.samples.push({...f,time});const span=time-this.samples[0].time;
        if(span>=2000&&this.samples.length>=10){this.baseline={x:median(this.samples.map(x=>x.x)),y:median(this.samples.map(x=>x.y)),torso:median(this.samples.map(x=>x.torso)),leftFoot:median(this.samples.map(x=>x.leftFoot)),rightFoot:median(this.samples.map(x=>x.rightFoot))};this.calibrating=false;this.filtered={...f};this.lastTime=time;this.neutralSince=time;events.push({type:'calibrated'});}
        return {events,status:this.baseline?'ready':'calibrating',progress:Math.min(1,span/2000),index:selected.index};
      }
      if(!this.baseline)return {events,status:'uncalibrated',progress:0,index:selected.index};
      const b=this.baseline;
      if(f.torso/b.torso<.72||f.torso/b.torso>1.38){this.needsCalibration=true;events.push({type:'distance'});return {events,status:'distance',index:selected.index};}
      const dt=this.lastTime===null?1/20:Math.max(.01,Math.min(.3,(time-this.lastTime)/1000));this.lastTime=time;
      const oldY=this.filtered?.y??f.y,a=1-Math.exp(-dt/.065);this.filtered??={...f};for(const k of ['x','y','leftFoot','rightFoot'])this.filtered[k]+=(f[k]-this.filtered[k])*a;
      const s=this.filtered,up=(b.y-s.y)/b.torso,velocity=(oldY-s.y)/dt/b.torso,leftUp=(b.leftFoot-s.leftFoot)/b.torso,rightUp=(b.rightFoot-s.rightFoot)/b.torso;
      const threshold=b.torso/f.aspect*.75,hysteresis=threshold*.16,dx=s.x-b.x;
      let lane=this.lane;
      if(dx< -threshold-hysteresis)lane=0;else if(dx>threshold+hysteresis)lane=2;else if((this.lane===0&&dx> -threshold+hysteresis)||(this.lane===2&&dx<threshold-hysteresis))lane=1;
      if(lane!==this.pendingLane){this.pendingLane=lane;this.pendingSince=time;}else if(lane!==this.lane&&time-this.pendingSince>=80){this.lane=lane;events.push({type:'lane',lane});}
      const crouch=up<-.28;
      if(crouch&&!this.crouched){this.crouched=true;this.neutralSince=null;events.push({type:'crouch'});}
      if(this.crouched&&up>-.1){this.crouched=false;this.neutralSince=time;}
      if(!this.crouched&&!this.airborne&&up<this.sensitivity*.55&&leftUp<.09&&rightUp<.09)this.neutralSince??=time;
      if(!this.airborne&&!this.crouched&&this.neutralSince!==null&&time-this.neutralSince>240&&time-this.jumpTime>650&&up>this.sensitivity&&velocity>.35&&Math.min(leftUp,rightUp)>.09){this.airborne=true;this.jumpTime=time;this.groundSince=null;events.push({type:'jump'});}
      if(this.airborne){if(Math.abs(up)<.13&&leftUp<.13&&rightUp<.13){this.groundSince??=time;if(time-this.groundSince>=120&&time-this.jumpTime>350){this.airborne=false;this.neutralSince=time;events.push({type:'land'});}}else this.groundSince=null;}
      return {events,status:'ready',progress:1,index:selected.index,lane:this.lane,up,crouched:this.crouched};
    }
  }
  const api={PoseControl,feature};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NutriPose=api;
})(typeof self!=='undefined'?self:this);
