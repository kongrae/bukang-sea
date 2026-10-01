const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine');
const D = require('../src/device-demo');

test('every short demo uses legal taps and actual slide/boat outcomes without mutating its source', () => {
  for (const key of Object.keys(D.DEVICE_DEMOS)) {
    const demo = D.createDeviceDemo(key), before = JSON.stringify(demo), grid = demo.grid;
    assert.ok(demo.duration >= 3 && demo.duration <= 8, `${key}: ${demo.duration}s`);
    for (const phase of demo.phases) {
      if (phase.kind === 'move') {
        const r = E.slide(grid, phase.from.pos, phase.from.dir, new Set(phase.from.nets), phase.from.boats);
        assert.ok(r.path.length, key); assert.deepEqual(phase.path, r.path); assert.deepEqual(phase.to.pos, r.end);
        assert.equal(phase.to.moves, phase.from.moves + 1);
        assert.deepEqual(D.sampleDeviceDemo(demo, phase.start + phase.duration / 2).boats.map(b => [b.x,b.y]),
          phase.from.boats.map(b => [b[0] % grid.w,Math.floor(b[0] / grid.w)]), 'boats wait while shark moves');
      }
      if (phase.kind === 'boat') assert.deepEqual(phase.to.boats, E.stepBoats(grid,phase.from.boats,phase.from.pos[1]*grid.w+phase.from.pos[0],new Set(phase.from.nets)));
      if (phase.kind === 'tap') {
        const i = phase.tap[1] * grid.w + phase.tap[0];
        assert.equal(grid.cells[i], '.'); assert.notEqual(i,phase.from.pos[1]*grid.w+phase.from.pos[0]);
        assert.ok(!phase.from.boats.some(b=>b[0]===i)); assert.ok(phase.to.nets.length<=grid.nets);
        assert.equal(phase.to.moves,phase.from.moves,'net edits never count as moves');
        assert.deepEqual(phase.to.boats,phase.from.boats,'net edits never move boats');
      }
    }
    for (let time=0; time<=demo.duration; time+=.03) {
      const frame=D.sampleDeviceDemo(demo,time);
      assert.ok(frame.pos.every(Number.isFinite)); assert.ok(frame.scale>=0&&frame.scale<=1); assert.ok(frame.text);
    }
    assert.equal(JSON.stringify(demo),before,'sampling does not alter the replay');
  }
});

test('examples teach stopping, jet turns, boat reversal, reusable nets and sand departures', () => {
  const moves = key => D.createDeviceDemo(key).phases.filter(p=>p.kind==='move');
  assert.deepEqual(moves('buoy').map(p=>p.to.pos),[[3,2],[3,1]]);
  assert.deepEqual(moves('sand').map(p=>p.to.pos),[[3,2],[5,2]]);
  assert.deepEqual(moves('jet')[0].path.map(p=>p.slice(0,2)),[[2,1],[3,1],[3,2],[3,3]]);
  assert.deepEqual(D.createDeviceDemo('boat').phases.filter(p=>p.kind==='boat').map(p=>p.to.boats[0]),[[19,'R'],[18,'L']]);
  const net=D.createDeviceDemo('net'), taps=net.phases.filter(p=>p.kind==='tap');
  assert.deepEqual(taps.map(p=>p.to.nets),[[18],[],[10]]);
  assert.equal(D.sampleDeviceDemo(net,net.duration).moves,1);
});

test('whirlpool animation shrinks and jumps between the pair without swimming through land', () => {
  const demo=D.createDeviceDemo('whirl'),move=demo.phases.find(p=>p.kind==='move'),jump=move.path.findIndex(p=>p[3]);
  for(const f of [.1,.49,.51,.9]) {
    const frame=D.sampleDeviceDemo(demo,move.start+move.duration*(jump+f)/move.path.length);
    assert.deepEqual(frame.pos,f<.5?[2,3]:[4,1]);
    assert.ok(Math.abs(frame.scale-Math.abs(f-.5)*2)<1e-8);
  }
  assert.deepEqual(move.to.pos,[5,1]);
});

const source=fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8');
const guideSource=source.slice(source.indexOf('const DEVICE_GUIDES = ['),source.indexOf('// screen change with a native-style push'));
function guide({reduced=false,seen=[],level=D.DEVICE_DEMOS.boat,title=false}={}) {
  return new Function('E','D','reduceMotion','seen','level','title',`
    const {JET}=E,{createDeviceDemo,sampleDeviceDemo}=D,g=E.parseLevel(level);
    const save={seenDevices:seen.slice(),best:{0:3},sessions:{story:{moves:4}},hintUsage:{'story:0':{count:2}}};
    let persisted=null;const persist=()=>{persisted=JSON.stringify(save);},elements=new Map();
    const $=id=>{if(!elements.has(id))elements.set(id,{hidden:id==='guideOverlay'||id==='gameScreen'&&title,textContent:'',innerHTML:'',focus(){},setAttribute(){},getBoundingClientRect:()=>({width:0,height:0})});return elements.get(id);};
    ${guideSource}
    return {show:showDeviceGuide,close:closeGuide,next:advanceGuide,select:selectGuideDevice,toggle:toggleGuidePlayback,replay:replayGuide,step:stepDeviceGuide,
      state:()=>({time:guideTime,playing:guidePlaying,demo:guideDemo,seen:save.seenDevices.slice(),index:guideIndex,keys:guideKeys.slice()}),element:$,saved:()=>persisted};
  `)(E,D,reduced,seen,level,title);
}
test('first encounter auto-plays; pause, replay and closing are isolated from gameplay records', () => {
  const scene=guide();scene.show(true);assert.equal(scene.state().playing,true);
  scene.step(.4);assert.equal(scene.state().time,.4);scene.toggle();scene.step(.4);assert.equal(scene.state().time,.4);
  scene.replay();assert.equal(scene.state().time,0);assert.equal(scene.state().playing,true);
  assert.deepEqual(scene.state().seen,[]);scene.close();assert.deepEqual(scene.state().seen,['boat']);assert.equal(scene.state().demo,null);
  const saved=JSON.parse(scene.saved());assert.deepEqual(saved.best,{0:3});assert.deepEqual(saved.sessions,{story:{moves:4}});assert.deepEqual(saved.hintUsage,{'story:0':{count:2}});
  scene.show(true);assert.equal(scene.element('guideOverlay').hidden,true);scene.show();assert.equal(scene.element('guideOverlay').hidden,false);
});
test('a mixed first encounter records only pages actually opened; skipped devices can still introduce themselves', () => {
  const level={map:['#######','#..w..#','#S.o..#','#wb.s.#','#######'],nets:1},scene=guide({level});
  scene.show(true);assert.deepEqual(scene.state().keys,['buoy','boat','net','sand','whirl']);
  scene.next();scene.close();assert.deepEqual(scene.state().seen,['buoy','boat']);
  scene.show(true);assert.deepEqual(scene.state().keys,['net','sand','whirl']);
  scene.select(2);scene.close();assert.deepEqual(scene.state().seen,['buoy','boat','net','whirl']);
  scene.show(true);assert.deepEqual(scene.state().keys,['sand']);
});
test('reduced motion starts with a static example and only plays on request; title settings list all six devices', () => {
  const scene=guide({reduced:true,title:true});scene.show();assert.equal(scene.state().keys.length,6);
  const still=scene.state().time;scene.step(1);assert.equal(scene.state().time,still);assert.equal(scene.state().playing,false);
  scene.select(5);assert.equal(scene.state().playing,false);scene.toggle();assert.equal(scene.state().time,0);scene.step(.5);assert.equal(scene.state().time,.5);
  scene.close();scene.step(1);assert.equal(scene.state().demo,null);
  const plain=guide({level:D.DEVICE_DEMOS.move});plain.show(true);assert.equal(plain.element('guideOverlay').hidden,true);plain.show();assert.deepEqual(plain.state().keys,['move']);
});
