/* Nutri3D — a small, dependency-free WebGL renderer. All geometry is generated locally. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  function multiply(a,b,out=new Float32Array(16)) {
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return out;
  }
  function transform(position,rotation,scale,out=identity()) {
    const [x,y,z]=rotation,cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
    out[0]=cy*cz*scale[0]; out[1]=cy*sz*scale[0]; out[2]=-sy*scale[0]; out[3]=0;
    out[4]=(cz*sx*sy-cx*sz)*scale[1]; out[5]=(cx*cz+sx*sy*sz)*scale[1]; out[6]=cy*sx*scale[1]; out[7]=0;
    out[8]=(sx*sz+cx*cz*sy)*scale[2]; out[9]=(cx*sy*sz-cz*sx)*scale[2]; out[10]=cx*cy*scale[2]; out[11]=0;
    out[12]=position[0];out[13]=position[1];out[14]=position[2];out[15]=1; return out;
  }
  function normalize(v) {const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function lookAt(eye,target){
    const z=normalize(eye.map((x,i)=>x-target[i])),x=normalize(cross([0,1,0],z)),y=cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);
  }
  function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
  function normalMatrix(m){
    const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]],bc=cross(b,c),ca=cross(c,a),ab=cross(a,b),det=a[0]*bc[0]+a[1]*bc[1]+a[2]*bc[2];
    const d=Math.abs(det)>1e-9?1/det:1;return new Float32Array([...bc.map(x=>x*d),...ca.map(x=>x*d),...ab.map(x=>x*d)]);
  }
  function color(hex,alpha=1){if(Array.isArray(hex))return hex; const v=parseInt(hex.replace('#',''),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255,alpha];}
  class Geometry {
    constructor(){this.data=[];this.buffer=null;}
    tri(a,b,c,n){
      const raw=n||cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));if(Math.hypot(...raw)<1e-7)return;
      const nn=normalize(raw);for(const p of [a,b,c])this.data.push(...p,...nn);
    }
    quad(a,b,c,d,n){this.tri(a,b,c,n);this.tri(a,c,d,n);}
    finish(){this.vertices=new Float32Array(this.data);this.count=this.data.length/6;this.data=null;return this;}
  }
  function box(){const g=new Geometry();
    g.quad([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]);
    g.quad([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]);
    g.quad([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]);
    g.quad([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]);
    g.quad([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]);
    g.quad([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]);return g.finish();}
  function sphere(rows=9,columns=12){const g=new Geometry(); const p=(a,b)=>[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){const a=i*Math.PI/rows,b=j*TAU/columns,c=(i+1)*Math.PI/rows,d=(j+1)*TAU/columns;g.tri(p(a,b),p(a,d),p(c,b));g.tri(p(a,d),p(c,d),p(c,b));}return g.finish();}
  function cylinder(top=1,segments=10){const g=new Geometry();for(let i=0;i<segments;i++){
    const a=i*TAU/segments,b=(i+1)*TAU/segments,A=[Math.cos(a),-.5,Math.sin(a)],B=[Math.cos(b),-.5,Math.sin(b)],C=[Math.cos(a)*top,.5,Math.sin(a)*top],D=[Math.cos(b)*top,.5,Math.sin(b)*top];
    g.quad(A,C,D,B);g.tri([0,-.5,0],A,B,[0,-1,0]);if(top>0)g.tri([0,.5,0],D,C,[0,1,0]);}return g.finish();}
  function disk(segments=24){const g=new Geometry();for(let i=0;i<segments;i++){const a=i*TAU/segments,b=(i+1)*TAU/segments;g.tri([0,0,0],[Math.cos(a),0,Math.sin(a)],[Math.cos(b),0,Math.sin(b)],[0,1,0]);}return g.finish();}
  function torus(){const g=new Geometry();const p=(a,b)=>[(1+.26*Math.cos(b))*Math.cos(a),(1+.26*Math.cos(b))*Math.sin(a),.26*Math.sin(b)];for(let i=0;i<18;i++)for(let j=0;j<8;j++){const a=i*TAU/18,b=j*TAU/8,c=(i+1)*TAU/18,d=(j+1)*TAU/8;g.quad(p(a,b),p(c,b),p(c,d),p(a,d));}return g.finish();}
  const geometries={box:box(),sphere:sphere(),cone:cylinder(0),cylinder:cylinder(),disk:disk(),torus:torus()};
  class Node {
    constructor(opts={}){this.position=opts.position||[0,0,0];this.rotation=opts.rotation||[0,0,0];this.scale=opts.scale||[1,1,1];this.geometry=opts.geometry?geometries[opts.geometry]:null;this.color=color(opts.color||'#ffffff',opts.alpha??1);this.unlit=opts.unlit||false;this.children=[];this.visible=true;this.local=identity();this.world=identity();}
    add(...nodes){this.children.push(...nodes);return this;}
    remove(node){const i=this.children.indexOf(node);if(i>=0)this.children.splice(i,1);}
    setColor(value){this.color=color(value);}
  }
  const VS=`attribute vec3 aPosition;attribute vec3 aNormal;uniform mat4 uModel;uniform mat4 uViewProjection;uniform mat3 uNormal;varying vec3 vNormal;varying float vDepth;void main(){vec4 world=uModel*vec4(aPosition,1.0);gl_Position=uViewProjection*world;vNormal=normalize(uNormal*aNormal);vDepth=gl_Position.w;}`;
  const FS=`precision mediump float;uniform vec4 uColor;uniform vec3 uFogColor;uniform float uUnlit;varying vec3 vNormal;varying float vDepth;void main(){vec3 normal=normalize(vNormal);float diffuse=max(dot(normal,normalize(vec3(-0.5,1.0,0.55))),0.0);float light=mix(0.8+diffuse*0.28,1.0,uUnlit);vec3 rgb=uColor.rgb*light;float fog=smoothstep(46.0,157.0,vDepth);gl_FragColor=vec4(mix(rgb,uFogColor,fog),uColor.a);}`;
  // Draw repeated city parts and food in batches when WebGL instancing is available.
  const IVS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aModel0;attribute vec4 aModel1;attribute vec4 aModel2;attribute vec4 aModel3;attribute vec4 aColor;attribute float aUnlit;uniform mat4 uViewProjection;varying vec3 vNormal;varying float vDepth;varying vec4 vColor;varying float vUnlit;void main(){mat4 model=mat4(aModel0,aModel1,aModel2,aModel3);gl_Position=uViewProjection*model*vec4(aPosition,1.0);vec3 n=cross(aModel1.xyz,aModel2.xyz)*aNormal.x+cross(aModel2.xyz,aModel0.xyz)*aNormal.y+cross(aModel0.xyz,aModel1.xyz)*aNormal.z;vNormal=normalize(n);vDepth=gl_Position.w;vColor=aColor;vUnlit=aUnlit;}`;
  const IFS=FS.replace('uniform vec4 uColor;','varying vec4 vColor;').replace('uniform float uUnlit;','varying float vUnlit;').replaceAll('uColor','vColor').replaceAll('uUnlit','vUnlit');
  class Renderer {
    constructor(canvas){
      this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL unavailable');
      this.instances=gl.getExtension('ANGLE_instanced_arrays');
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,this.instances?IVS:VS));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,this.instances?IFS:FS));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      this.loc={};for(const name of ['uModel','uViewProjection','uNormal','uColor','uFogColor','uUnlit'])this.loc[name]=gl.getUniformLocation(program,name);this.pos=gl.getAttribLocation(program,'aPosition');this.normal=gl.getAttribLocation(program,'aNormal');
      if(this.instances){this.instanceBuffer=gl.createBuffer();this.instanceLoc=['aModel0','aModel1','aModel2','aModel3','aColor','aUnlit'].map(n=>gl.getAttribLocation(program,n));for(const loc of this.instanceLoc){gl.enableVertexAttribArray(loc);this.instances.vertexAttribDivisorANGLE(loc,1);}}
      gl.enableVertexAttribArray(this.pos);gl.enableVertexAttribArray(this.normal);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(.57,.84,.91,1);
      gl.uniform3fv(this.loc.uFogColor,[.57,.84,.91]);this.eye=[0,5.7,13];this.target=[0,1,-16];this.view=lookAt(this.eye,this.target);this.vp=identity();this.drawCalls=0;
      this.resize();
    }
    resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;const ratio=Math.min(devicePixelRatio||1,1.6);this.canvas.width=Math.max(1,Math.round(r.width*ratio));this.canvas.height=Math.max(1,Math.round(r.height*ratio));this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.projection=perspective(60*Math.PI/180,r.width/Math.max(1,r.height),.1,240);this.vp=multiply(this.projection,this.view);}
    render(scene){const gl=this.gl;gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.loc.uViewProjection,false,this.vp);this.drawCalls=0;const opaque=[],transparent=[];
      const visit=(node,parent)=>{if(!node.visible)return;transform(node.position,node.rotation,node.scale,node.local);multiply(parent,node.local,node.world);if(node.geometry)(node.color[3]<1?transparent:opaque).push(node);for(const child of node.children)visit(child,node.world);};visit(scene,identity());
      if(this.instances){gl.depthMask(true);this.drawBatches(opaque);transparent.sort((a,b)=>a.world[14]-b.world[14]);gl.depthMask(false);this.drawBatches(transparent);gl.depthMask(true);return;}
      const draw=node=>{const geo=node.geometry;if(!geo.buffer){geo.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,geo.buffer);gl.bufferData(gl.ARRAY_BUFFER,geo.vertices,gl.STATIC_DRAW);}else gl.bindBuffer(gl.ARRAY_BUFFER,geo.buffer);
        gl.vertexAttribPointer(this.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(this.normal,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.loc.uModel,false,node.world);gl.uniformMatrix3fv(this.loc.uNormal,false,normalMatrix(node.world));gl.uniform4fv(this.loc.uColor,node.color);gl.uniform1f(this.loc.uUnlit,node.unlit?1:0);gl.drawArrays(gl.TRIANGLES,0,geo.count);this.drawCalls++;};
      gl.depthMask(true);opaque.forEach(draw);transparent.sort((a,b)=>a.world[14]-b.world[14]);gl.depthMask(false);transparent.forEach(draw);gl.depthMask(true);
    }
    drawBatches(nodes){
      const gl=this.gl,batches=new Map();
      for(const node of nodes){if(!batches.has(node.geometry))batches.set(node.geometry,[]);batches.get(node.geometry).push(node);}
      for(const [geo,items]of batches){
        if(!geo.buffer){geo.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,geo.buffer);gl.bufferData(gl.ARRAY_BUFFER,geo.vertices,gl.STATIC_DRAW);}else gl.bindBuffer(gl.ARRAY_BUFFER,geo.buffer);
        gl.vertexAttribPointer(this.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(this.normal,3,gl.FLOAT,false,24,12);
        const data=new Float32Array(items.length*21);
        for(let i=0;i<items.length;i++){data.set(items[i].world,i*21);data.set(items[i].color,i*21+16);data[i*21+20]=items[i].unlit?1:0;}
        gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
        for(let i=0;i<6;i++)gl.vertexAttribPointer(this.instanceLoc[i],i===5?1:4,gl.FLOAT,false,84,i*16);
        this.instances.drawArraysInstancedANGLE(gl.TRIANGLES,0,geo.count,items.length);this.drawCalls++;
      }
    }
    project(position){const m=this.vp,[x,y,z]=position,w=m[3]*x+m[7]*y+m[11]*z+m[15];return {x:((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*this.width,y:(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*this.height,visible:w>0};}
  }
  window.Nutri3D={Node,Renderer,identity,multiply,transform,perspective,lookAt,geometries};
})();
