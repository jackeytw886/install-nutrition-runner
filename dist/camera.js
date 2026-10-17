(() => {
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('camera-dialog'),video=$('pose-video'),preview=$('pose-preview'),ctx=preview.getContext('2d'),cutout=$('player-cutout');
  const pose=new window.NutriPose.PoseControl();
  const maskCanvas=document.createElement('canvas'),maskContext=maskCanvas.getContext('2d'),compose=document.createElement('canvas'),composeContext=compose.getContext('2d');
  let stream=null,worker=null,enabled=false,ready=false,busy=false,modelReady=false,pendingOptions=false,session=0,lastVideo=-1,lastInference=0,frameId=0,swPromise=null,initTimer=0,lastResponse=0;
  const camera={get enabled(){return enabled;},get ready(){return ready;}};window.NutriCamera=camera;
  const game=()=>window.NutriGame;
  function status(text,ok=false){$('camera-status').textContent=text;$('pose-status-label').textContent=ok?'體感已就緒 · 跑道 '+(pose.lane+1):enabled?'體感設定中 · 點此查看':'體感未啟用 · 點此設定';$('pose-status-dot').classList.toggle('active',ok);}
  function showDialog(){game()?.pause();if(!dialog.open)dialog.showModal();}
  for(const id of ['camera-btn','pose-status-btn'])$(id).addEventListener('click',showDialog);
  for(const id of ['close-camera','camera-done'])$(id).addEventListener('click',()=>dialog.close());
  function pauseForLoss(message){game()?.setCrouch(false);ready=false;game()?.pause();status(message);}
  function calibrate(){if(!enabled||!modelReady)return;ready=false;pose.calibrate();game()?.pause();$('calibration-bar').style.width='0%';status('請全身入鏡，在遊玩中央站穩 2 秒。');$('pose-action').textContent='保持站姿，讓肩膀、臀部與雙腳都能清楚看見。';}
  function stop(message='攝影機已關閉，可繼續使用鍵盤或觸控。'){
    game()?.setCrouch(false);session++;enabled=false;ready=false;modelReady=false;busy=false;pendingOptions=false;clearTimeout(initTimer);cancelAnimationFrame(frameId);worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;pose.reset();cutout.hidden=true;ctx.clearRect(0,0,preview.width,preview.height);$('camera-placeholder').hidden=false;$('calibrate-camera').disabled=true;$('enable-camera').textContent='啟動攝影機';$('enable-camera').disabled=false;$('calibration-bar').style.width='0%';status(message);
  }
  function errorMessage(error){if(error?.name==='NotAllowedError')return '相機權限未開啟。請在網址列允許相機，再重試。';if(error?.name==='NotFoundError')return '找不到攝影機，請確認 USB 連線。';if(error?.name==='NotReadableError')return '攝影機可能被其他程式使用，請關閉後重試。';return '無法啟動辨識。請確認相機、網路與瀏覽器支援，再重試。';}
  async function getSW(){if(!window.isSecureContext||!('serviceWorker'in navigator))throw new Error('unsupported');swPromise??=navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{registration.update().catch(()=>{});return navigator.serviceWorker.ready;}).catch(error=>{swPromise=null;throw error;});return swPromise;}
  function verifyModel(){if(modelReady)return Promise.resolve();return new Promise((resolve,reject)=>{const probe=new Worker('./pose-worker.js?v=2.0.2'),finish=error=>{clearTimeout(timer);probe.terminate();error?reject(error):resolve();},timer=setTimeout(()=>finish(new Error('model timeout')),60000);probe.onmessage=({data})=>{if(data.type==='ready')finish();else if(data.type==='error')finish(new Error(data.message));};probe.onerror=()=>finish(new Error('model worker'));probe.postMessage({type:'init',numPoses:1});});}
  async function enable(){
    if(enabled){game()?.pause();stop();return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('請用 HTTPS 或 localhost 開啟，並使用支援攝影機的瀏覽器。');return;}
    const token=++session;$('enable-camera').disabled=true;status('正在取得攝影機權限…');
    try{
      const device=$('camera-device').value,newStream=await navigator.mediaDevices.getUserMedia({video:{deviceId:device?{exact:device}:undefined,width:{ideal:960},height:{ideal:540},frameRate:{ideal:30,max:30}},audio:false});
      if(token!==session){newStream.getTracks().forEach(t=>t.stop());return;}
      stream=newStream;video.srcObject=stream;await video.play();if(token!==session)return;
      enabled=true;$('enable-camera').disabled=false;$('enable-camera').textContent='關閉攝影機';$('camera-placeholder').hidden=true;status('相機已開啟，正在載入本機辨識模型…');
      try{await getSW();}catch{/* Online inference remains available when offline storage is blocked. */}
      if(token!==session)return;
      const devices=await navigator.mediaDevices.enumerateDevices();if(token!==session)return;$('camera-device').replaceChildren();for(const d of devices.filter(x=>x.kind==='videoinput')){const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||'攝影機';$('camera-device').append(option);}const active=stream.getVideoTracks()[0].getSettings().deviceId;if(active)$('camera-device').value=active;
      worker=new Worker('./pose-worker.js?v=2.0.2');worker.onmessage=event=>onWorker(event.data,token);worker.onerror=()=>{if(token===session){game()?.pause();stop('辨識程式未能載入。首次使用請連網，或重新下載離線資源。');}};
      initTimer=setTimeout(()=>{if(token===session&&!modelReady){game()?.pause();stop('模型載入逾時。請確認網路可下載模型，再重新啟動。');}},90000);
      worker.postMessage({type:'init',numPoses:Number($('pose-count').value)});
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(token===session){game()?.pause();stop('攝影機已中斷，請重新啟動。');}});
    }catch(error){if(token===session){game()?.pause();stop(errorMessage(error));}}
  }
  function applyOptions(){pendingOptions=false;busy=true;worker.postMessage({type:'options',numPoses:Number($('pose-count').value),mask:$('show-cutout').checked});calibrate();}
  function configure(){if(!enabled||!modelReady)return;pendingOptions=true;ready=false;game()?.pause();if(!busy)applyOptions();}
  function onWorker(data,token){
    if(token!==session||!enabled)return;
    if(data.type==='error'){game()?.pause();stop('辨識資源載入或執行失敗。請確認網路，重新啟動攝影機。');return;}
    if(data.type==='ready'){clearTimeout(initTimer);modelReady=true;busy=false;lastResponse=performance.now();$('calibrate-camera').disabled=false;configure();lastVideo=-1;loop();return;}
    if(data.type==='configured'){busy=false;if(pendingOptions)applyOptions();return;}
    if(data.type!=='pose')return;
    busy=false;lastResponse=performance.now();
    if(pendingOptions){applyOptions();return;}
    const result=pose.update(data.landmarks,data.time,video.videoWidth/video.videoHeight||16/9);
    draw(data.landmarks[result.index],data.masks?.[result.index]);
    $('calibration-bar').style.width=((result.progress||0)*100)+'%';
    if(result.status==='ready'){
      ready=true;status('校正完成！可測試動作，或關閉此視窗開始遊戲。',true);
      if(game()?.state==='running'){game().setLane(pose.lane);game().setCrouch(result.crouched);}
    }else{ready=false;if(result.status==='calibrating')status('請站穩… '+Math.round(result.progress*100)+'%');else if(result.status==='searching')status('請讓全身與雙腳入鏡，並在中央站好。');else if(result.status==='lost')pauseForLoss('玩家追蹤中斷，遊戲已暫停。請回到原位，按重新校正。');else if(result.status==='distance')pauseForLoss('前後距離改變較多，遊戲已暫停。請重新校正。');}
    for(const event of result.events){
      if(event.type==='calibrated')$('pose-action').textContent='已就緒：左右移動換道，小跳測試跳躍，蹲下測試滑行。';
      if(event.type==='lane')$('pose-action').textContent='換道 → 跑道 '+(event.lane+1);
      if(event.type==='jump'){$('pose-action').textContent='↑ 偵測到一次跳躍動作';game()?.jump();}
      if(event.type==='crouch'){$('pose-action').textContent='↓ 偵測到蹲下，地面滑行／空中快速落地';}
      if(event.type==='land')$('pose-action').textContent='落地完成，準備下一次動作。';
    }
  }
  async function loop(now=performance.now()){
    if(!enabled||!modelReady)return;frameId=requestAnimationFrame(loop);
    if(ready&&now-lastResponse>1500){pauseForLoss('辨識更新中斷，遊戲已暫停。請重新校正或啟動攝影機。');pose.needsCalibration=true;}
    if(busy||document.hidden||now-lastInference<65||video.readyState<2||video.currentTime===lastVideo)return;
    busy=true;lastInference=now;lastVideo=video.currentTime;const token=session;
    try{const width=640,height=Math.round(width*video.videoHeight/video.videoWidth),image=await createImageBitmap(video,{resizeWidth:width,resizeHeight:height});if(token!==session||!worker){image.close();return;}worker.postMessage({type:'frame',image,time:performance.now()},[image]);}catch{if(token===session)busy=false;}
  }
  const connections=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
  function draw(points,mask){
    const w=preview.width,h=preview.height;ctx.clearRect(0,0,w,h);ctx.save();if(pose.mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(video,0,0,w,h);
    if(points){ctx.strokeStyle='#d9efa3';ctx.lineWidth=3;for(const [a,b]of connections){if((points[a]?.visibility??0)<.55||(points[b]?.visibility??0)<.55)continue;ctx.beginPath();ctx.moveTo(points[a].x*w,points[a].y*h);ctx.lineTo(points[b].x*w,points[b].y*h);ctx.stroke();}ctx.fillStyle='#f5cb86';for(const p of points){if((p.visibility??0)<.55)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,3,0,Math.PI*2);ctx.fill();}}ctx.restore();
    if(pose.baseline){const center=pose.baseline.x,half=pose.baseline.torso/(video.videoWidth/video.videoHeight)*.75;ctx.setLineDash([6,5]);ctx.strokeStyle='#ffffffbc';ctx.lineWidth=2;for(const x of [center-half,center+half]){ctx.beginPath();ctx.moveTo(x*w,0);ctx.lineTo(x*w,h);ctx.stroke();}ctx.setLineDash([]);}
    cutout.hidden=!$('show-cutout').checked||!mask||!points;
    if(cutout.hidden)return;
    maskCanvas.width=mask.width;maskCanvas.height=mask.height;const floats=new Float32Array(mask.buffer),image=maskContext.createImageData(mask.width,mask.height);for(let i=0;i<floats.length;i++){image.data[i*4]=255;image.data[i*4+1]=255;image.data[i*4+2]=255;image.data[i*4+3]=Math.max(0,Math.min(255,(floats[i]-.2)*425));}maskContext.putImageData(image,0,0);
    compose.width=w;compose.height=h;composeContext.globalCompositeOperation='source-over';composeContext.drawImage(video,0,0,w,h);composeContext.globalCompositeOperation='destination-in';composeContext.drawImage(maskCanvas,0,0,w,h);composeContext.globalCompositeOperation='source-over';
    const visible=points.filter(p=>(p.visibility??0)>.45),x=Math.max(0,Math.min(...visible.map(p=>p.x))-.07)*w,y=Math.max(0,Math.min(...visible.map(p=>p.y))-.04)*h,cw=Math.min(w-x,(Math.max(...visible.map(p=>p.x))+.07)*w-x),ch=Math.min(h-y,(Math.max(...visible.map(p=>p.y))+.04)*h-y);
    cutout.width=180;cutout.height=230;const c=cutout.getContext('2d'),scale=Math.min(180/cw,230/ch);c.drawImage(compose,x,y,cw,ch,(180-cw*scale)/2,230-ch*scale,cw*scale,ch*scale);cutout.style.transform=pose.mirror?'scaleX(-1)':'none';
  }
  $('enable-camera').addEventListener('click',enable);$('calibrate-camera').addEventListener('click',calibrate);
  $('camera-device').addEventListener('change',async()=>{if(enabled){game()?.pause();stop();await enable();}});
  $('pose-count').addEventListener('change',configure);
  $('show-cutout').addEventListener('change',()=>{cutout.hidden=true;configure();});
  $('mirror-camera').addEventListener('change',()=>{pose.mirror=$('mirror-camera').checked;calibrate();});
  $('pose-sensitivity').addEventListener('input',()=>{const value=Number($('pose-sensitivity').value);pose.sensitivity=value/100;$('sensitivity-label').textContent=value<20?'小':value>28?'大':'中';});
  $('prepare-offline').addEventListener('click',async()=>{const btn=$('prepare-offline'),label=$('offline-status');btn.disabled=true;label.textContent='正在下載；請保持連網…';try{const registration=await getSW(),channel=new MessageChannel();let timeout=setTimeout(()=>{btn.disabled=false;label.textContent='下載逾時，請連網後重試。';channel.port1.close();},240000);channel.port1.onmessage=async({data})=>{if(data.done)label.textContent='已準備 '+data.done+' / '+data.total+' 個資源';if(data.ready||data.error){clearTimeout(timeout);channel.port1.close();if(data.error){btn.disabled=false;label.textContent='下載未完成，請確認網路與登入狀態後重試。';return;}label.textContent='資源已下載，正在檢查辨識模型…';try{await verifyModel();label.textContent='離線資源與辨識模型已就緒 ✓ 使用同一瀏覽器與網址開啟。';}catch{label.textContent='資源已下載，但辨識模型無法啟動。請更新 Chrome／Edge 後重試。';}finally{btn.disabled=false;}}};registration.active.postMessage({type:'prepare'},[channel.port2]);}catch{btn.disabled=false;label.textContent='此環境無法儲存離線資源。請改用 HTTPS 或 localhost，並允許網站儲存資料。';}});
  if(window.isSecureContext&&'serviceWorker'in navigator)getSW().catch(()=>{});
  window.addEventListener('pagehide',()=>stop());document.addEventListener('visibilitychange',()=>{if(document.hidden&&enabled){game()?.pause();stop('已離開分頁，攝影機自動關閉。回來後請重新啟動。');}});
})();
