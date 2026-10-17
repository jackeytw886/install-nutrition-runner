(() => {
  'use strict';
  const $=id=>document.getElementById(id),stage=$('game-stage'),canvas=$('game-canvas');
  $('reload-btn').addEventListener('click',()=>location.reload());
  const {Node,Renderer,lookAt}=window.Nutri3D;
  const {Game,FOODS,LANES,PLAYER_Z}=window.NutriCore;
  let renderer;
  try{renderer=new Renderer(canvas);}catch(error){$('error-screen').hidden=false;$('start-btn').disabled=true;console.error('3D initialization failed:',error);return;}
  const scene=new Node(),world=new Node(),foodLayer=new Node(),particleLayer=new Node();scene.add(world,foodLayer,particleLayer);
  const core=new Game(),models=new Map(),scenery=[],markers=[],particles=[],menuModels=[];
  const C={grass:'#c6daba',track:'#637e85',cream:'#fff1cf',forest:'#247e68',mint:'#a3f0ce',trunk:'#bf8b55'};
  const group=(parent,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1])=>{const n=new Node({position,rotation,scale});parent.add(n);return n;};
  const shape=(parent,type,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],alpha=1,unlit=false)=>{const n=new Node({geometry:type,color,position,scale,rotation,alpha,unlit});parent.add(n);return n;};
  const shadow=(parent,x,z,size=.6)=>shape(parent,'disk','#46694c',[x,.016,z],[size,1,size*.7],[0,0,0],.13,true);
  let selectedMode='classic',audio=null,sound=false,visualTime=0,feedbackUntil=0,hitUntil=0,wasLearning=false,previousDistance=0,lastFrame=0,lastUiState='',best={classic:0,practice:0};
  try{const saved=JSON.parse(localStorage.getItem('nutri-run-best-v1')||'{}');for(const key of ['classic','practice'])if(Number.isFinite(saved[key])&&saved[key]>=0)best[key]=saved[key];}catch{}

  // A colorful food-market railway: original city models, repeating scenery and rails.
  shape(world,'box','#d9e8d7',[0,-.55,-100],[300,.5,480]);
  shape(world,'box','#b8b3a2',[0,-.22,-90],[9.3,.38,230]);
  for(const [i,x]of LANES.entries()){
    shape(world,'box',i===1?'#6e8c91':'#78989b',[x,-.035,-90],[2.5,.08,230]);
    for(const side of [-1,1])shape(world,'box','#bdc9b9',[x+side*.83,.038,-90],[.1,.1,230]);
    for(let j=0;j<58;j++){const m=shape(world,'box','#4c6870',[x,.012,14-j*4],[2.06,.08,.38]);markers.push(m);}
  }
  for(const side of [-1,1]){
    shape(world,'box','#f7cf68',[side*4.36,.03,-90],[.2,.22,230]);
    shape(world,'box','#e5d8b3',[side*5.6,-.01,-90],[2.3,.25,230]);
  }
  const palettes=['#ef9978','#55bdb0','#a99ada','#edc16f','#83becd','#dc919e'];
  function cityBlock(side,i){
    const h=7+(i%4)*2.1,w=4.5+(i%3)*.65,d=10.5,b=group(world,[side*(8.6+(i%2)*.7),0,9-i*21]);
    shape(b,'box',palettes[(i+(side>0?2:0))%6],[0,h/2,0],[w,h,d]);
    shape(b,'box','#fff1ce',[0,h+.13,0],[w+.35,.28,d+.35]);
    shape(b,'box','#40616c',[0,.95,d/2+.035],[w-.6,1.9,.07]);
    shape(b,'box','#f8d584',[0,2.06,d/2+.3],[w+.2,.25,.75]);
    for(let j=0;j<3;j++){
      shape(b,'box','#fff2d4',[-w*.32+j*w*.32,2.19,d/2+.28],[w*.16,.1,.78]);
      for(let k=0;k<3;k++)shape(b,'box','#3e7280',[-w*.3+j*w*.3,3.25+k*2.1,d/2+.035],[w*.2,1.2,.08]);
    }
    // Side windows face the tracks.
    for(let j=0;j<3;j++)for(let k=0;k<2;k++)shape(b,'box','#397b87',[-side*(w/2+.035),3.6+k*2.6,-3.2+j*3.2],[.08,1.4,1.5]);
    shape(b,'box','#d0dbcc',[w*.22,h+.6,-1],[1.3,1,2.1]);
    scenery.push({node:b,period:252});
    if(i%2===0){
      const plant=group(world,[side*5.55,0,1-i*21]);shape(plant,'box','#f7eee0',[0,.35,0],[.8,.7,.8]);
      shape(plant,'cylinder','#aa8055',[0,1.45,0],[.12,2.2,.12]);
      shape(plant,'sphere','#3aab83',[0,2.5,0],[.85,.8,.8]);shape(plant,'sphere','#77cf8d',[.4,2.9,0],[.6,.6,.6]);scenery.push({node:plant,period:252});
    }
  }
  for(let i=0;i<12;i++)for(const side of [-1,1])cityBlock(side,i);
  for(let i=0;i<3;i++){
    const arch=group(world,[0,0,-27-i*72]);
    for(const side of [-1,1]){shape(arch,'box','#476c72',[side*4.9,3.7,0],[.28,7.4,.28]);shape(arch,'box','#ffc95c',[side*4.9,1.1,.02],[.34,.8,.34]);}
    shape(arch,'box','#476c72',[0,7.3,0],[10.1,.3,.35]);
    shape(arch,'box','#3da79b',[0,6.65,0],[4.4,.9,.25]);
    for(const x of [-1.45,0,1.45]){shape(arch,'box','#d9ffe2',[x,6.65,.15],[.45,.15,.04]);shape(arch,'box','#d9ffe2',[x+.15,6.65,.16],[.25,.15,.04],[0,0,.7]);}
    scenery.push({node:arch,period:216});
  }
  shape(world,'sphere','#fff2ba',[-52,33,-192],[13,13,4],[0,0,0],1,true);
  for(const [x,y,z]of [[-25,21,-105],[28,26,-145],[-8,28,-185]]){
    const cloud=group(world,[x,y,z]);shape(cloud,'sphere','#f4fffb',[0,0,0],[5,1.1,1.5]);shape(cloud,'sphere','#f4fffb',[-2,.7,0],[2.8,1.6,1.4]);
  }
  // Friendly runner, built from simple solid geometry.
  const runner=group(scene,[0,0,PLAYER_Z]);
  const torso=group(runner,[0,1.14,0]);
  shape(torso,'box','#29b6bb',[0,.2,0],[.62,.72,.4]);shape(torso,'box','#214a69',[0,-.1,-.02],[.64,.16,.44]);
  shape(torso,'sphere','#f2c5a2',[0,.86,-.01],[.31,.34,.29]);
  shape(torso,'sphere','#f7cb52',[0,1.02,.01],[.325,.2,.3]);shape(torso,'box','#f7cb52',[0,.95,-.24],[.57,.08,.33]);
  shape(torso,'box','#ff9b4f',[0,.25,.28],[.43,.49,.2]);shape(torso,'box','#ed713d',[0,.25,.395],[.3,.16,.04]);
  for(const x of [-.19,.19])shape(torso,'box','#fff0bd',[x,.25,.217],[.055,.64,.055]);
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const arm=group(runner,[side*.41,1.59,0]);shape(arm,'sphere','#29b6bb',[0,-.12,0],[.14,.23,.14]);shape(arm,'cylinder','#e7b591',[0,-.37,0],[.1,.48,.1]);shape(arm,'sphere','#f2c5a2',[0,-.63,-.03],[.115,.12,.11]);arms.push(arm);
    const leg=group(runner,[side*.19,.88,0]);shape(leg,'box','#315d85',[0,-.23,0],[.24,.48,.27]);shape(leg,'cylinder','#e7b591',[0,-.58,0],[.092,.35,.092]);shape(leg,'box','#fff1d1',[0,-.77,-.08],[.27,.2,.42]);shape(leg,'box','#f3edda',[0,-.86,-.08],[.29,.07,.44]);legs.push(leg);
  }
  const runnerShadow=shadow(scene,0,PLAYER_Z,.59);
  function foodModel(type,parent){
    const root=group(parent),body=group(root),def=FOODS[type];
    shape(root,'disk',def.kind==='food'?'#ffdf70':'#e7745a',[0,.027,0],def.action==='lane'?[1,1,3.7]:[.7,1,.7],[0,0,0],.24,true);
    if(def.kind==='food'){shape(body,'torus','#ffe177',[0,0,-.035],[.48,.48,.17],[0,0,0],.92,true);}
    if(type==='apple'){
      shape(body,'sphere','#df6f55',[-.12,0,0],[.29,.32,.3]);shape(body,'sphere','#e17b5d',[.13,.01,0],[.29,.32,.3]);shape(body,'cylinder','#8a7956',[0,.33,0],[.035,.17,.035],[0,0,-.2]);shape(body,'sphere','#82a66a',[.15,.38,0],[.16,.055,.09],[0,0,.3]);
    }else if(type==='broccoli'){
      shape(body,'cylinder','#a7b879',[0,-.12,0],[.105,.53,.105]);for(const [x,y,z,s] of [[0,.2,0,.29],[-.24,.08,0,.23],[.24,.08,0,.23],[0,.08,.2,.22]])shape(body,'sphere',x>0?'#6b9a62':'#7ba969',[x,y,z],[s,s*.9,s]);
    }else if(type==='yam'){
      shape(body,'sphere','#cb8862',[0,0,0],[.43,.23,.25],[0,0,-.35]);shape(body,'sphere','#e5b96f',[.32,.12,.03],[.1,.17,.18],[0,0,-.35]);
    }else if(type==='egg'){
      shape(body,'sphere','#f4edd5',[0,0,0],[.29,.38,.29]);shape(body,'sphere','#e6b85f',[0,-.04,.252],[.15,.16,.065]);
    }else if(type==='milk'){
      shape(body,'box','#f9f5dd',[0,0,0],[.44,.65,.39]);shape(body,'box','#74a58b',[0,-.07,.205],[.44,.27,.022]);shape(body,'cone','#d4e2ca',[0,.4,0],[.31,.18,.28],[0,Math.PI/4,0]);shape(body,'box','#759e85',[0,.51,0],[.1,.12,.15]);
    }else if(type==='nuts'){
      for(const [x,y,z,a] of [[-.16,-.03,0,-.4],[.12,.1,.06,.4],[.18,-.15,-.02,-.7]]){shape(body,'sphere','#b28b60',[x,y,z],[.15,.25,.14],[0,0,a]);shape(body,'box','#cbac7e',[x,y,z+.135],[.035,.22,.018],[0,0,a]);}
    }else if(type==='fries'){
      shape(body,'box','#cd775d',[0,.26,0],[.58,.46,.38]);shape(body,'disk','#edc582',[0,.29,.198],[.1,1,.1],[Math.PI/2,0,0]);
      for(let i=0;i<5;i++)shape(body,'box',i%2?'#e5bb68':'#f0ce7f',[-.23+i*.11,.59+(i%2)*.065,0],[.08,.44,.14],[0,0,(i-2)*.06]);
    }else if(type==='donut'){
      shape(body,'torus','#c69060',[0,.47,0],[.34,.34,.34],[.12,0,0]);shape(body,'torus','#e7a08d',[0,.48,.04],[.32,.32,.35],[.12,0,0]);
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7;shape(body,'box',i%2?'#fff0bd':'#bca477',[Math.cos(a)*.33,.48+Math.sin(a)*.33,.135],[.06,.025,.025],[0,0,a+.5]);}
    }else if(type==='soda'){
      shape(body,'cylinder','#d38978',[0,.35,0],[.24,.66,.24]);shape(body,'cylinder','#f1e9cf',[0,.71,0],[.26,.06,.26]);shape(body,'box','#eed5a6',[.06,.82,0],[.045,.23,.045],[0,0,-.18]);shape(body,'box','#f2dec1',[0,.35,.242],[.17,.23,.025],[0,0,-.15]);
    }
    if(type==='snackVan'){
      shape(body,'box','#ef965d',[0,1.95,0],[2.02,3.5,7.2]);
      shape(body,'box','#ffe0a0',[0,3.77,0],[2.06,.22,7.25]);
      shape(body,'box','#f7c96b',[0,.53,0],[2.12,.5,7.25]);
      shape(body,'box','#27657a',[0,2.7,3.63],[1.66,1.1,.08]);
      shape(body,'box','#f8efca',[0,1.7,3.67],[1.75,.18,.08]);
      shape(body,'box','#325664',[0,.3,3.7],[1.82,.33,.2]);
      for(const x of [-.67,.67])shape(body,'sphere','#fff8d2',[x,1.12,3.68],[.19,.15,.06],[0,0,0],1,true);
      for(const side of [-1,1])for(let j=0;j<4;j++)shape(body,'box','#327286',[side*1.027,2.65,-2.6+j*1.65],[.045,1.1,1.15]);
      shape(body,'torus','#d86d68',[0,2.05,3.72],[.23,.23,.12]);
    }else if(type==='sugarGate'){
      for(const x of [-.98,.98]){shape(body,'box','#385a6d',[x,1.4,0],[.17,2.8,.34]);shape(body,'box','#f6cf70',[x,.18,0],[.3,.36,.5]);}
      shape(body,'box','#f1816e',[0,1.92,0],[2.12,1.4,.68]);
      for(let j=0;j<5;j++)shape(body,'box','#ffecc8',[-.8+j*.4,1.89,.357],[.12,1.22,.04],[0,0,-.36]);
      shape(body,'box','#284c66',[0,2.04,.4],[.56,.66,.06]);
      shape(body,'box','#e9f9ed',[0,2.09,.45],[.09,.35,.025]);
      for(const side of [-1,1])shape(body,'box','#e9f9ed',[side*.08,1.96,.45],[.09,.25,.025],[0,0,side*-.7]);
    }else if(def.kind==='hazard'){
      // A wider striped plinth makes low obstacles legible before they reach the runner.
      shape(body,'box','#e47662',[0,.18,-.06],[1.58,.36,.72]);
      for(const x of [-.56,0,.56])shape(body,'box','#fff0bc',[x,.19,.315],[.18,.29,.035],[0,0,-.35]);
    }
    return {root,body};
  }
  function makePreview(){
    for(const m of menuModels)foodLayer.remove(m.root);menuModels.length=0;
    for(const [type,lane,z,y]of [['snackVan',0,-21,0],['fries',1,-10,0],['sugarGate',2,-28,0],['snackVan',2,-59,0]]){
      const m=foodModel(type,foodLayer);m.root.position=[LANES[lane],0,z];m.body.position[1]=y;m.base=y;m.food=false;menuModels.push(m);
    }
    for(let i=0;i<11;i++){
      const m=foodModel(i<6?'apple':'broccoli',foodLayer),lane=i<6?2:1;
      m.root.position=[LANES[lane],0,-3-i*3.1];m.body.position[1]=.95;m.base=.95;m.food=true;menuModels.push(m);
    }
  }
  makePreview();
  function clearObjects(){for(const model of models.values()){foodLayer.remove(model.root);model.label.remove();}models.clear();for(const m of menuModels)foodLayer.remove(m.root);menuModels.length=0;for(const p of particles)particleLayer.remove(p.node);particles.length=0;}
  function createObject(o){const model=foodModel(o.type,foodLayer);model.root.position=[o.x,0,o.z];model.body.position[1]=o.y;model.label=document.createElement('span');model.label.className='food-tag'+(o.kind==='hazard'?' hazard':'');model.label.textContent=o.kind==='hazard'?({jump:'↑ 跳過',lane:'← 換道 →',slide:'↓ 滑行'}[o.action]):'＋ '+o.name;$('food-labels').append(model.label);models.set(o.id,model);}
  function burst(x,y,z,good=true){for(let i=0;i<7;i++){const node=shape(particleLayer,'sphere',good?(i%2?'#cfdd94':'#f2d58e'):'#e7a18b',[x,y,z],[.07,.07,.07]);particles.push({node,life:.65,vx:(Math.random()-.5)*3,vy:1+Math.random()*2,vz:(Math.random()-.5)*2});}while(particles.length>65){particleLayer.remove(particles.shift().node);}}
  function tone(frequency,duration=.12,type='sine',volume=.035){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,audio.currentTime);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
  function feedback(text,bad=false,duration=2){$('feedback').textContent=text;$('feedback').className='feedback show'+(bad?' bad':'');feedbackUntil=visualTime+duration;}
  function showBest(){const v=best[selectedMode];$('best-score').textContent=v?String(v):'—';}
  showBest();
  function updateState(){const state=core.state;stage.dataset.gameState=state;lastUiState=state;
    $('intro').hidden=state!=='menu';$('countdown').hidden=state!=='countdown';$('pause-screen').hidden=state!=='paused'||$('learn-dialog').open;$('result-screen').hidden=state!=='result';$('touch-controls').hidden=state!=='running';$('pause-btn').disabled=state!=='running'&&state!=='countdown';
    if(state==='menu'){makePreview();$('stage-label').textContent='準備出發';}
    if(state==='running'){$('stage-label').textContent=['食物辨識','均衡餐盤','選擇挑戰'][core.stage];stage.focus({preventScroll:true});}
    if(state==='result'){
      const r=core.result;$('result-eyebrow').textContent=r.completed?'GREAT CHOICES, GREAT RUN!':'EVERY TRY IS A NEW START';$('result-title').textContent=r.completed?'每個好選擇，都值得鼓掌！':'再試一次，找到自己的節奏！';
      $('final-score').textContent=r.score;$('final-food').textContent=r.food;$('final-dodge').textContent=r.dodge;$('final-groups').textContent=r.groups+'/6';$('final-streak').textContent=r.streak;$('final-distance').textContent=r.distance;
      const missing=window.NutriCore.GROUPS.filter(x=>!core.groups.has(x));const names={grain:'全榖雜糧',protein:'豆魚蛋肉',dairy:'乳品',vegetable:'蔬菜',fruit:'水果',fat:'油脂與堅果'};
      $('result-tip').textContent=missing.length?'下次試著找到「'+missing.slice(0,2).map(x=>names[x]).join('、')+'」，讓餐盤更完整！':'六大類都收集到了！生活中也記得留意適量、多樣搭配。';
      if(r.bonus)$('result-tip').textContent+=' 完賽機會獎勵 ＋'+r.bonus+' 分。';
      if(r.score>best[core.mode]){best[core.mode]=r.score;try{localStorage.setItem('nutri-run-best-v1',JSON.stringify(best));}catch{}showBest();}
    }
  }
  function updateHUD(){const set=(id,text)=>{if($(id).textContent!==String(text))$(id).textContent=text;};set('score',String(core.score).padStart(3,'0'));set('time',Math.ceil(90-core.elapsed));$('time-bar').style.width=(100*(90-core.elapsed)/90)+'%';
    set('hearts',core.mode==='practice'?'∞':'♥ '.repeat(core.hearts).trim()+' ♡'.repeat(3-core.hearts));$('hearts').setAttribute('aria-label',core.mode==='practice'?'練習模式，機會不限':core.hearts+'次機會');set('life-label',core.mode==='practice'?'輕鬆練習':'挑戰機會');set('collection-count',core.groups.size+' / 6');set('distance',Math.floor(core.distance));set('streak',core.streak);set('action-label',core.player.y>.05?'↑ 跳躍中':core.player.slideTime>0?'↓ 滑行中':'跑道 '+(core.player.lane+1)+' · 自動前進');
    for(const stamp of document.querySelectorAll('.food-stamp'))stamp.classList.toggle('collected',core.groups.has(stamp.dataset.group));
    if(core.state==='countdown'){$('countdown').querySelector('strong').textContent=Math.max(1,Math.ceil(core.countdown));}
  }
  function processEvents(){for(const e of core.drain()){
    if(e.type==='reset'){clearObjects();previousDistance=0;feedbackUntil=0;hitUntil=0;$('feedback').className='feedback';}
    if(e.type==='spawn')createObject(e.object);
    if(e.type==='collect'){const model=models.get(e.object.id);if(model){model.root.visible=false;model.label.hidden=true;}burst(e.object.x,e.object.y,e.object.z);tone(660,.1);setTimeout(()=>tone(880,.1),70);feedback('＋10 '+e.object.name+' · '+(e.first?'新類別收集！':e.object.tip),false,1.7);}
    if(e.type==='streak'){feedback('連續收集 '+e.count+' 個！額外 ＋20 分',false,2);tone(990,.18);}
    if(e.type==='slide')tone(250,.12,'triangle',.018);
    if(e.type==='balanced'){feedback('✦ 均衡餐盤完成！額外 ＋50 分',false,3);tone(1046,.3);}
    if(e.type==='hit'){hitUntil=visualTime+.3;tone(160,.2,'triangle');feedback(core.mode==='practice'?'練習提示 · '+e.object.tip:'碰到'+e.object.name+'！'+e.object.tip,true,1.7);burst(e.object.x,.6,e.object.z,false);}
    if(e.type==='jump')tone(330,.13,'sine',.018);
    if(e.type==='stage'){$('stage-label').textContent=['食物辨識','均衡餐盤','選擇挑戰'][e.stage];feedback(e.stage===1?'第 2 段 · 試著收集不同類別！':'最後 30 秒 · 看準時機再起跳！',false,2.2);}
    if(e.type==='remove'){const model=models.get(e.object.id);if(model){foodLayer.remove(model.root);model.label.remove();models.delete(e.object.id);}}
    if(e.type==='state')updateState();
  }}
  function start(){if(window.NutriCamera?.enabled&&!window.NutriCamera.ready){feedback('請先站穩 2 秒，完成攝影機校正。',false,3);return;}try{if(audio?.state==='suspended')audio.resume();}catch{}core.start(selectedMode);processEvents();updateHUD();stage.focus({preventScroll:true});}
  function menu(){core.toMenu();processEvents();updateHUD();}
  function pause(){if(core.pause()){processEvents();$('resume-btn').focus({preventScroll:true});}}
  function resume(){if(window.NutriCamera?.enabled&&!window.NutriCamera.ready){feedback('請回到遊玩區，重新校正後再繼續。',false,3);return;}core.resume();processEvents();}
  $('start-btn').addEventListener('click',start);$('play-again').addEventListener('click',start);$('restart-btn').addEventListener('click',start);$('resume-btn').addEventListener('click',resume);$('menu-btn').addEventListener('click',menu);$('result-menu').addEventListener('click',menu);
  $('pause-btn').addEventListener('click',pause);
  for(const btn of document.querySelectorAll('.mode'))btn.addEventListener('click',()=>{selectedMode=btn.dataset.mode;core.mode=selectedMode;for(const b of document.querySelectorAll('.mode')){const selected=b===btn;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));}showBest();updateHUD();});
  for(const [id,action]of [['left-btn',()=>core.move(-1)],['right-btn',()=>core.move(1)],['jump-btn',()=>core.jump()],['slide-btn',()=>core.slide()]])$(id).addEventListener('pointerdown',e=>{e.preventDefault();action();stage.focus({preventScroll:true});});
  document.addEventListener('keydown',e=>{if($('learn-dialog').open||$('camera-dialog').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyW','KeyS','Escape','KeyP'];if(!keys.includes(e.code)||e.repeat)return;
    if(e.code==='Escape'||e.code==='KeyP'){if(core.state==='running'||core.state==='countdown'){e.preventDefault();pause();}else if(core.state==='paused'){e.preventDefault();resume();}return;}
    if(core.state!=='running')return;e.preventDefault();if(['ArrowLeft','KeyA'].includes(e.code))core.move(-1);if(['ArrowRight','KeyD'].includes(e.code))core.move(1);if(['Space','ArrowUp','KeyW'].includes(e.code))core.jump();if(['ArrowDown','KeyS'].includes(e.code))core.slide();
  });
  let swipe=null;canvas.addEventListener('pointerdown',e=>{if(core.state==='running'){swipe={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',e=>{if(!swipe)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.abs(dx)>28&&Math.abs(dx)>Math.abs(dy))core.move(dx<0?-1:1);else if(dy< -28)core.jump();else if(dy>28)core.slide();});canvas.addEventListener('pointercancel',()=>{swipe=null;});
  $('sound-btn').addEventListener('click',()=>{sound=!sound;$('sound-btn').setAttribute('aria-pressed',String(sound));$('sound-btn').setAttribute('aria-label',sound?'關閉音效':'開啟音效');if(sound)tone(660,.09);});
  function openLearn(){wasLearning=core.pause();$('learn-dialog').showModal();processEvents();}
  for(const id of ['learn-btn','fact-btn'])$(id).addEventListener('click',openLearn);
  for(const id of ['close-learn','learn-done'])$(id).addEventListener('click',()=>$('learn-dialog').close());
  $('learn-dialog').addEventListener('close',()=>{if(wasLearning){wasLearning=false;core.resume();processEvents();}else updateState();});
  $('fullscreen-btn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{feedback('這個瀏覽器暫時不支援全螢幕。',false,2);}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen-btn').setAttribute('aria-label',document.fullscreenElement?'離開全螢幕':'全螢幕');resize();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(core.state==='running'||core.state==='countdown'))pause();lastFrame=0;});
  window.addEventListener('blur',()=>{if(core.state==='running'||core.state==='countdown')pause();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();core.pause();$('error-text').textContent='3D 畫面暫時中斷，請重新整理後再試一次。';$('error-screen').hidden=false;});
  function resize(){const r=stage.getBoundingClientRect();renderer.eye=r.width/r.height<.85?[0,5.5,16.5]:[0,4.4,10.6];renderer.target=[0,1.25,-12];renderer.view=lookAt(renderer.eye,renderer.target);renderer.resize();}
  new ResizeObserver(resize).observe(stage);resize();updateState();updateHUD();
  function frame(now){const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):0;lastFrame=now;visualTime+=dt;core.update(dt);processEvents();
    const active=core.state==='running',moving=active?core.distance-previousDistance:core.state==='menu'?dt*.6:0;previousDistance=core.distance;
    for(const m of markers){m.position[2]+=moving;if(m.position[2]>17)m.position[2]-=232;}
    for(const s of scenery){s.node.position[2]+=moving;if(s.node.position[2]>20)s.node.position[2]-=s.period;}
    const p=core.player;runner.position[0]=p.x;runner.position[1]=p.y;runner.rotation[2]=(LANES[p.lane]-p.x)*-.065;const sliding=p.slideTime>0&&p.y<.01;runner.scale[1]+=((sliding?.4:1)-runner.scale[1])*Math.min(dt*(sliding?22:10),1);runner.rotation[0]=sliding?-.22:0;runner.visible=core.invulnerable<=0||Math.floor(visualTime*12)%2===0;
    if(active){const step=Math.sin(core.distance*1.4);legs[0].rotation[0]=p.y>.05?-.55:step*.65;legs[1].rotation[0]=p.y>.05?.35:-step*.65;arms[0].rotation[0]=p.y>.05?-1:-step*.62;arms[1].rotation[0]=p.y>.05?-1:step*.62;torso.position[1]=1.14+(p.y<.05?Math.abs(step)*.035:0);}
    else if(core.state==='menu'){legs.forEach(l=>l.rotation[0]=0);arms[0].rotation[0]=.08;arms[1].rotation[0]=-.08;torso.position[1]=1.14+Math.sin(visualTime*2)*.02;}
    runnerShadow.position[0]=p.x;const ss=.59/(1+p.y*.2);runnerShadow.scale=[ss,1,ss*.7];
    for(const o of core.objects){const m=models.get(o.id);if(!m)continue;m.root.position[2]=o.z;if(o.kind==='food'){m.body.position[1]=o.y+Math.sin(visualTime*2.5+o.id)*.06;m.body.rotation[1]=visualTime*.7+o.id;}else if(o.action==='jump'){m.body.rotation[1]=Math.sin(visualTime*1.4+o.id)*.035;}
      const visible=!o.resolved&&o.z> -31&&o.z<1.8&&(o.kind==='hazard'||o.id%4===0);m.label.hidden=!visible;if(visible){const screen=renderer.project([o.x,(o.kind==='hazard'?(o.action==='lane'?4.05:o.action==='slide'?3:1.3):o.y+.72),o.z]);m.label.hidden=!screen.visible;m.label.style.left=screen.x+'px';m.label.style.top=screen.y+'px';}
    }
    for(const m of menuModels)if(m.food){m.body.rotation[1]=visualTime*.35;m.body.position[1]=m.base+Math.sin(visualTime*2+m.root.position[2])*.055;}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particleLayer.remove(p.node);particles.splice(i,1);continue;}p.node.position[0]+=p.vx*dt;p.node.position[1]+=p.vy*dt;p.node.position[2]+=p.vz*dt;p.vy-=4*dt;const s=Math.min(.07,p.life*.18);p.node.scale=[s,s,s];}
    if(visualTime>feedbackUntil)$('feedback').classList.remove('show');$('hit-flash').classList.toggle('show',visualTime<hitUntil);
    updateHUD();renderer.render(scene);requestAnimationFrame(frame);
  }
  window.NutriGame={get state(){return core.state;},setLane:lane=>core.setLane(lane),jump:()=>core.jump(),fastDrop:()=>core.fastDrop(),slide:()=>core.slide(),setCrouch:held=>core.setCrouch(held),pause,feedback};
  requestAnimationFrame(frame);
})();
