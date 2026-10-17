const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game,FOODS,LANES,PLAYER_Z}=require('../dist/core.js');
function running(mode='classic'){const g=new Game(12345);g.start(mode);for(let i=0;i<181;i++)g.update(1/60);assert.equal(g.state,'running');g.objects=[];g.nextRow=100000;g.drain();return g;}
function advance(g,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)g.update(1/120);}

test('Countdown gates all actions and pause freezes both countdown and the run',()=>{const g=new Game(2);g.start();assert.equal(g.jump(),false);g.move(1);assert.equal(g.player.lane,1);g.pause();g.update(2);assert.equal(g.countdown,3);g.resume();advance(g,3.1);assert.equal(g.state,'running');const distance=g.distance,time=g.elapsed;g.pause();advance(g,2);assert.equal(g.distance,distance);assert.equal(g.elapsed,time);g.resume();advance(g,.1);assert.ok(g.distance>distance);});
test('A ground pickup scores once, even while still overlapping the runner',()=>{const g=running();g.spawn('apple',1,g.distance);advance(g,.05);assert.equal(g.score,10);assert.equal(g.foodCount,1);assert.equal(g.groups.size,1);advance(g,.15);assert.equal(g.score,10);});
test('Six distinct food groups grant exactly one balanced-plate bonus',()=>{const g=running();for(const type of ['apple','broccoli','yam','egg','milk','nuts']){g.spawn(type,1,g.distance);advance(g,.01);}assert.equal(g.score,110);assert.equal(g.groups.size,6);g.spawn('apple',1,g.distance);advance(g,.01);assert.equal(g.score,120);assert.equal(g.drain().filter(e=>e.type==='balanced').length,1);});
test('Jumping at a reachable time clears a ground hazard, scores once and lands',()=>{const g=running();g.spawn('fries',1,g.distance+3.5);assert.equal(g.jump(),true);assert.equal(g.jump(),false);advance(g,.8);assert.equal(g.hearts,3);assert.equal(g.hits,0);assert.equal(g.score,5);assert.equal(g.dodgeCount,1);advance(g,.3);assert.equal(g.player.y,0);assert.equal(g.player.vy,0);assert.equal(g.score,5);});
test('Elevated food requires a jump; grounded food is not automatically collected while high in air',()=>{const a=running();a.spawn('nuts',1,a.distance+3.5,2.8);advance(a,.7);assert.equal(a.foodCount,0);const b=running();b.spawn('nuts',1,b.distance+3.5,2.8);b.jump();advance(b,.7);assert.equal(b.foodCount,1);const c=running();c.spawn('apple',1,c.distance+3.5);c.jump();advance(c,.7);assert.equal(c.foodCount,0);});
test('Three distinct collisions end classic mode; a hit cannot also award dodge points',()=>{const g=running();for(let i=0;i<3;i++){g.spawn('soda',1,g.distance);advance(g,1.3);}assert.equal(g.state,'result');assert.equal(g.hearts,0);assert.equal(g.score,0);assert.equal(g.hits,3);assert.equal(g.result.completed,false);const snapshot=JSON.stringify(g.result);advance(g,5);assert.equal(JSON.stringify(g.result),snapshot);});
test('Invulnerability prevents multiple losses from overlapping hazards',()=>{const g=running();g.spawn('fries',1,g.distance);g.spawn('donut',1,g.distance);advance(g,.1);assert.equal(g.hearts,2);assert.equal(g.hits,1);});
test('Practice mode can finish all 90 seconds despite repeated collisions',()=>{const g=running('practice');for(let i=0;i<10;i++){g.spawn('fries',1,g.distance);advance(g,1.3);}assert.equal(g.hearts,3);assert.equal(g.state,'running');advance(g,91);assert.equal(g.state,'result');assert.equal(g.result.completed,true);assert.equal(g.elapsed,90);assert.equal(g.result.bonus,0);});
test('Changing lanes avoids a hazard and movement stays within the three lanes',()=>{const g=running();g.spawn('soda',1,g.distance+6);g.move(1);advance(g,1);assert.equal(g.hearts,3);assert.equal(g.score,5);for(let i=0;i<10;i++)g.move(1);assert.equal(g.player.lane,2);for(let i=0;i<10;i++)g.move(-1);assert.equal(g.player.lane,0);advance(g,.7);assert.ok(Math.abs(g.player.x-LANES[0])<.01);});
test('Generated tracks always offer a clear ground lane, with bounded live objects',()=>{
  for(let seed=1;seed<=25;seed++){
    const g=new Game(seed);g.start('practice');advance(g,3.1);
    for(let i=0;i<90*10&&g.state==='running';i++){
      g.update(.1);const hazards=g.objects.filter(o=>o.kind==='hazard');
      for(let ahead=0;ahead<140;ahead+=2){
        const blocked=new Set(hazards.filter(o=>Math.abs(o.distance-g.distance-ahead)<o.depth/2+.45).map(o=>o.lane));
        assert.ok(blocked.size<3,'A reachable ground lane must remain open');
      }
      assert.ok(g.objects.length<=80,'The visible track must fit its object budget');
    }
  }
});
test('A fresh run resets points, invulnerability, player position, collections and result',()=>{const g=running();g.spawn('apple',1,g.distance);advance(g,.05);g.player.y=1;g.invulnerable=1;g.start('practice');assert.equal(g.score,0);assert.equal(g.groups.size,0);assert.equal(g.foodCount,0);assert.equal(g.player.y,0);assert.equal(g.player.x,0);assert.equal(g.invulnerable,0);assert.equal(g.result,null);assert.equal(g.mode,'practice');});
test('The same timed jump behaves consistently at 30, 60 and 120 fps',()=>{for(const fps of [30,60,120]){const g=running();g.spawn('donut',1,g.distance+3.5);g.jump();for(let i=0;i<fps;i++)g.update(1/fps);assert.equal(g.hearts,3);assert.equal(g.dodgeCount,1);assert.equal(g.player.y,0);}});

test('Sliding clears an overhead gate, while standing or jumping collides',()=>{
  const slide=running();slide.spawn('sugarGate',1,slide.distance+4);assert.equal(slide.slide(),true);advance(slide,.7);assert.equal(slide.hits,0);assert.equal(slide.dodgeCount,1);advance(slide,.4);assert.equal(slide.player.slideTime,0);
  for(const action of ['stand','jump']){const g=running();g.spawn('sugarGate',1,g.distance+4);if(action==='jump')g.jump();advance(g,.7);assert.equal(g.hits,1,action);assert.equal(g.dodgeCount,0);}
});
test('A tall train cannot be jumped and must be avoided for its full length',()=>{
  const a=running();a.spawn('snackVan',1,a.distance+7);a.jump();advance(a,1.1);assert.equal(a.hits,1);assert.equal(a.dodgeCount,0);
  const b=running();b.spawn('snackVan',1,b.distance+7);b.move(-1);advance(b,.7);assert.equal(b.hits,0);assert.equal(b.dodgeCount,0);advance(b,.4);assert.equal(b.dodgeCount,1);assert.equal(b.score,5);
});
test('Down in midair accelerates landing and continues into a ground slide',()=>{
  const g=running();g.jump();advance(g,.2);const height=g.player.y;assert.ok(height>0);g.slide();assert.ok(g.player.vy<=-12);advance(g,.15);assert.equal(g.player.y,0);assert.ok(g.player.slideTime>0);g.pause();const remaining=g.player.slideTime;advance(g,2);assert.equal(g.player.slideTime,remaining);g.resume();advance(g,1.1);assert.equal(g.player.slideTime,0);
});
test('A camera crouch may be held, is released on demand, and jump cancels a slide',()=>{
  const g=running();g.setCrouch(true);advance(g,2);assert.ok(g.player.slideTime>0);g.setCrouch(false);advance(g,.2);assert.equal(g.player.slideTime,0);g.slide();assert.equal(g.jump(),true);assert.equal(g.player.slideTime,0);advance(g,.1);assert.ok(g.player.y>0);g.pause();assert.equal(g.slide(),false);g.setCrouch(false);assert.equal(g.player.crouchHeld,false);
});
test('Ten consecutive pickups award a bonus; a collision breaks the sequence',()=>{
  const g=running();for(let i=0;i<10;i++){g.spawn('apple',1,g.distance);advance(g,.01);}assert.equal(g.score,120);assert.equal(g.streak,10);assert.equal(g.drain().filter(e=>e.type==='streak').length,1);g.spawn('soda',1,g.distance);advance(g,.01);assert.equal(g.streak,0);assert.equal(g.bestStreak,10);g.spawn('apple',1,g.distance);advance(g,.01);assert.equal(g.score,130);assert.equal(g.streak,1);
});
