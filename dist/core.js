/* Game rules are independent of WebGL and the keyboard, touch and pose inputs. */
(function(root){
  'use strict';
  const LANES=[-2.6,0,2.6],PLAYER_Z=3.4,ROW_SPACING=22;
  const FOODS={
    apple:{name:'蘋果',group:'fruit',kind:'food',tip:'水果類，選擇原型食物。'},
    broccoli:{name:'花椰菜',group:'vegetable',kind:'food',tip:'蔬菜類，多樣搭配。'},
    yam:{name:'地瓜',group:'grain',kind:'food',tip:'全榖雜糧類，提供能量。'},
    egg:{name:'雞蛋',group:'protein',kind:'food',tip:'豆魚蛋肉類，蛋白質來源。'},
    milk:{name:'原味牛奶',group:'dairy',kind:'food',tip:'乳品類，鈣質來源。'},
    nuts:{name:'無調味堅果',group:'fat',kind:'food',tip:'油脂與堅果種子類，適量攝取。'},
    fries:{name:'薯條路障',kind:'hazard',action:'jump',height:.9,depth:1.1,tip:'矮路障：跳過或換道。'},
    donut:{name:'甜甜圈路障',kind:'hazard',action:'jump',height:.9,depth:1.1,tip:'矮路障：跳過或換道。'},
    soda:{name:'汽水路障',kind:'hazard',action:'jump',height:.94,depth:1.1,tip:'矮路障：跳過或換道。'},
    snackVan:{name:'點心列車',kind:'hazard',action:'lane',height:3.8,depth:7.2,tip:'高列車：左右換道。'},
    sugarGate:{name:'糖飲橫桿',kind:'hazard',action:'slide',bottom:1.22,height:2.7,depth:1.4,tip:'上方橫桿：蹲下滑行或換道。'}
  };
  const GROUPS=['grain','protein','dairy','vegetable','fruit','fat'];
  const FOOD_TYPES=['apple','broccoli','yam','egg','milk','nuts'];
  class Game {
    constructor(seed=Date.now()){this.events=[];this.mode='classic';this.seed=seed>>>0;this.state='menu';this.reset();}
    random(){let t=this.seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
    emit(type,detail={}){this.events.push({type,...detail});}
    drain(){return this.events.splice(0);}
    reset(mode=this.mode){
      this.mode=mode;this.elapsed=0;this.distance=0;this.score=0;this.hearts=3;this.foodCount=0;this.dodgeCount=0;this.hits=0;
      this.groups=new Set();this.objects=[];this.nextRow=0;this.nextId=0;this.invulnerable=0;this.stage=0;this.streak=0;this.bestStreak=0;
      this.player={lane:1,x:0,y:0,vy:0,slideTime:0,crouchHeld:false,slideOnLand:false};this.countdown=3;this.events=[];this.result=null;
    }
    start(mode=this.mode){this.reset(mode);this.state='countdown';this.emit('reset');this.populate();this.emit('state');}
    toMenu(){this.reset();this.state='menu';this.emit('reset');this.emit('state');}
    pause(){if(this.state==='running'||this.state==='countdown'){this.beforePause=this.state;this.state='paused';this.emit('state');return true;}return false;}
    resume(){if(this.state==='paused'){this.state=this.beforePause||'running';this.emit('state');}}
    move(direction){if(this.state!=='running')return false;return this.setLane(Math.max(0,Math.min(2,this.player.lane+direction)));}
    setLane(lane){if(this.state!=='running'||!Number.isInteger(lane)||lane<0||lane>2)return false;if(lane!==this.player.lane)this.emit('lane',{lane});this.player.lane=lane;return true;}
    jump(){
      const p=this.player;if(this.state!=='running'||p.y>.001||p.vy>0)return false;
      p.slideTime=0;p.slideOnLand=false;p.crouchHeld=false;p.vy=8.8;this.emit('jump');return true;
    }
    slide(){
      const p=this.player;if(this.state!=='running')return false;
      if(p.y>.001){p.vy=Math.min(p.vy,-12);p.slideOnLand=true;this.emit('fastDrop');}
      else{p.slideTime=.9;this.emit('slide');}return true;
    }
    fastDrop(){return this.slide();}
    setCrouch(active){
      const p=this.player,held=Boolean(active);if(this.state!=='running'&&held)return false;
      const previous=p.crouchHeld;p.crouchHeld=held;if(held&&!previous)this.slide();return true;
    }
    spawn(type,lane,distance,height=.76){
      const definition=FOODS[type];if(!definition||!Number.isInteger(lane)||lane<0||lane>2)throw new Error('Invalid track object');
      const object={id:++this.nextId,type,lane,distance,x:LANES[lane],z:PLAYER_Z-(distance-this.distance),y:definition.kind==='hazard'?0:height,resolved:false,...definition};
      this.objects.push(object);this.emit('spawn',{object});return object;
    }
    trail(type,lane,distance,count=4,height=.9){for(let j=0;j<count;j++)this.spawn(type,lane,distance+j*2.8,height);}
    populate(){
      while(this.nextRow*ROW_SPACING+16<this.distance+145){
        const i=this.nextRow++,d=i*ROW_SPACING+16;
        // The opening introduces each action with one completely open alternate lane.
        if(i===0){this.trail('apple',1,d);continue;}
        if(i===1){this.spawn('fries',1,d);this.trail('egg',0,d,4);this.spawn('apple',1,d,2.65);continue;}
        if(i===2){this.spawn('snackVan',1,d);this.trail('broccoli',0,d-2,4);continue;}
        if(i===3){this.spawn('sugarGate',2,d);this.trail('milk',2,d-2.8,4,.55);continue;}
        if(i===4){this.spawn('donut',0,d);this.trail('yam',1,d,4);continue;}
        if(i===5){this.spawn('sugarGate',1,d);this.spawn('snackVan',2,d);this.trail('nuts',0,d-2,4);continue;}
        const safe=Math.floor(this.random()*3),others=[0,1,2].filter(l=>l!==safe),types=['fries','donut','soda','snackVan','sugarGate'];
        this.trail(FOOD_TYPES[(i-6)%6],safe,d,4);
        const type=types[Math.floor(this.random()*types.length)],hazardLane=others[Math.floor(this.random()*2)];
        this.spawn(type,hazardLane,d);
        if(i>8&&this.random()<.5)this.spawn(types[Math.floor(this.random()*types.length)],others.find(l=>l!==hazardLane),d);
        if(FOODS[type].action==='jump'&&this.random()<.6)this.spawn(FOOD_TYPES[i%6],hazardLane,d,2.65);
        if(FOODS[type].action==='slide')this.trail(FOOD_TYPES[(i+2)%6],hazardLane,d-2.8,3,.55);
      }
    }
    update(dt){
      if(!Number.isFinite(dt)||dt<=0)return;
      if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.state='running';this.emit('state');}return;}
      if(this.state!=='running')return;
      for(let left=Math.min(dt,.25);left>1e-7&&this.state==='running';){const step=Math.min(left,1/120);left-=step;this.step(step);}
    }
    step(dt){
      this.elapsed=Math.min(90,this.elapsed+dt);this.invulnerable=Math.max(0,this.invulnerable-dt);
      const stage=Math.min(2,Math.floor(this.elapsed/30));if(stage!==this.stage){this.stage=stage;this.emit('stage',{stage});}
      const travel=[12,14,16][this.stage]*dt;this.distance+=travel;
      const p=this.player;p.x+=(LANES[p.lane]-p.x)*Math.min(1,19*dt);p.slideTime=Math.max(0,p.slideTime-dt);
      if(p.y>0||p.vy>0){
        p.vy-=22*dt;p.y+=p.vy*dt;
        if(p.y<=0){p.y=0;p.vy=0;this.emit('land');if(p.slideOnLand){p.slideTime=.9;p.slideOnLand=false;this.emit('slide');}}
      }
      if(p.crouchHeld&&p.y===0)p.slideTime=Math.max(p.slideTime,.12);
      const bodyHeight=p.slideTime>0&&p.y===0?.82:1.95;
      for(const o of this.objects){
        o.z+=travel;if(o.resolved)continue;
        const halfZ=o.kind==='hazard'?.45+o.depth/2:.75;
        const overlap=Math.abs(o.x-p.x)<.83&&Math.abs(o.z-PLAYER_Z)<halfZ;
        if(o.kind==='food'&&overlap&&o.y+.32>p.y+.12&&o.y-.32<p.y+bodyHeight){
          o.resolved=true;this.score+=10;this.foodCount++;this.streak++;this.bestStreak=Math.max(this.bestStreak,this.streak);
          const first=!this.groups.has(o.group);this.groups.add(o.group);this.emit('collect',{object:o,first,streak:this.streak});
          if(this.streak%10===0){this.score+=20;this.emit('streak',{count:this.streak});}
          if(first&&this.groups.size===6){this.score+=50;this.emit('balanced');}
        }else if(o.kind==='hazard'&&overlap&&p.y<o.height+.06&&p.y+bodyHeight>(o.bottom??0)){
          o.resolved=true;if(this.invulnerable<=0){
            this.hits++;this.streak=0;if(this.mode==='classic')this.hearts--;this.invulnerable=1.15;this.emit('hit',{object:o});
            if(this.hearts<=0){this.finish(false);break;}
          }
        }else if(o.kind==='hazard'&&o.z>PLAYER_Z+halfZ){o.resolved=true;this.score+=5;this.dodgeCount++;this.emit('dodge',{object:o});}
      }
      this.objects=this.objects.filter(o=>{if(o.z>17){this.emit('remove',{object:o});return false;}return true;});
      if(this.state==='running'){this.populate();if(this.elapsed>=90)this.finish(true);}
    }
    finish(completed){
      if(this.state!=='running')return;const bonus=completed&&this.mode==='classic'?this.hearts*10:0;this.score+=bonus;this.state='result';
      this.result={completed,score:this.score,food:this.foodCount,dodge:this.dodgeCount,groups:this.groups.size,hits:this.hits,bonus,streak:this.bestStreak,distance:Math.floor(this.distance)};
      this.emit('finish',{result:this.result});this.emit('state');
    }
  }
  const api={Game,FOODS,GROUPS,LANES,PLAYER_Z,ROW_SPACING};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NutriCore=api;
})(typeof window!=='undefined'?window:this);
