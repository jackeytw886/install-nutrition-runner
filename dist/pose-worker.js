/* Classic worker allows MediaPipe's WASM loader to use importScripts. Camera pixels stay on device. */
let landmarker=null;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const {FilesetResolver,PoseLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      landmarker=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},canvas:new OffscreenCanvas(640,360),runningMode:'VIDEO',numPoses:data.numPoses||3,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.65,outputSegmentationMasks:false});
      self.postMessage({type:'ready'});
    }else if(data.type==='options'){
      await landmarker.setOptions({numPoses:data.numPoses,outputSegmentationMasks:!!data.mask});self.postMessage({type:'configured'});
    }else if(data.type==='frame'){
      if(!landmarker){data.image.close();return;}
      try{const result=landmarker.detectForVideo(data.image,data.time),masks=(result.segmentationMasks||[]).map(m=>({width:m.width,height:m.height,buffer:m.getAsFloat32Array().slice().buffer}));
        self.postMessage({type:'pose',landmarks:result.landmarks,masks,time:data.time},masks.map(x=>x.buffer));result.close();
      }finally{data.image.close();}
    }
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};
