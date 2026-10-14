const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const artSource = fs.readFileSync(path.join(__dirname, '../src/art.js'), 'utf8');
const cameraSource = source.slice(source.indexOf('const CANAL_VIEW_KEY'), source.indexOf('function drawObliqueQuay'));
function camera({ stored = null, fail = false } = {}) {
  return new Function('stored', 'fail', `
    const LEVELS = Array.from({length:84},()=>({})); let STORY = LEVELS[0], LVL = 0, DAILY = null, FREE = null, PILOT = null, g = {};
    const T = 48, CH = 480, OY = 72, clock = 3, writes = [];
    const localStorage = {getItem: () => { if(fail) throw Error(); return stored; }, setItem: (...args) => { if(fail) throw Error(); writes.push(args); }};
    const buttons = ['top', 'oblique'].map(mode => ({dataset:{canalView:mode},setAttribute(k,v){this[k]=v;}}));
    const elements = {canalViewToggle:{hidden:false,querySelectorAll:()=>buttons},canalViewNote:{hidden:true}};
    const $ = id => elements[id], SHARK_ART = {hasOblique:()=>true}, currentSkin=()=>({id:'basic'});
    let paints = 0; const resize=()=>{},invalidateScenes=()=>{},draw=()=>paints++;
    ${cameraSource}
    return {projection:boardProjection, gridY:boardGridY, set:setCanalView, update:updateCanalView, writes, elements, buttons,
      scope: (mode,index=0,legacy=false) => {DAILY=mode==='daily'?{}:null;FREE=mode==='free'?{}:null;PILOT=mode==='pilot'?{}:null;LVL=index;STORY=legacy?{}:LEVELS[index];g=mode==='empty'?null:{};updateCanalView();},
      paints:()=>paints};
  `)(stored, fail);
}
test('camera covers every playable mode and restored map while staying disabled before a board exists', () => {
  const c = camera();
  c.scope('empty'); assert.equal(c.projection(),1); assert.equal(c.elements.canalViewToggle.hidden,true);
  c.set('oblique'); assert.equal(c.writes.length,0);
  for (const [mode,index,legacy] of [['daily',0,false],['free',0,false],['pilot',0,false],['story',0,true],['story',59,true]]) {
    c.scope(mode,index,legacy); assert.equal(c.projection(),.78); assert.equal(c.elements.canalViewToggle.hidden,false);
    c.set('top'); assert.equal(c.projection(),1);
    c.set('oblique'); assert.equal(c.projection(),.78);
  }
  for (let index=0;index<84;index++) {
    c.scope('story',index); assert.equal(c.projection(),.78); assert.equal(c.elements.canalViewToggle.hidden,false);
  }
});
test('camera preference uses its own storage and the inverse screen mapping matches both projections', () => {
  const c = camera();
  for (const mode of ['top','oblique','top','oblique']) {
    c.set(mode); const q=c.projection();
    for (const y of [0,.5,1.5,5.5,7]) assert(Math.abs(c.gridY(480*(1-q)/2+(72+y*48)*q)-y)<1e-10);
    assert.equal(c.buttons.find(b=>b.dataset.canalView===mode)['aria-pressed'],'true');
  }
  assert(c.writes.every(([key])=>key==='bukang-first-canal-view-v1'));
  const count=c.paints();c.set('invalid');assert.equal(c.paints(),count);
  assert.equal(camera({stored:'top'}).projection(),1);
  assert.equal(camera({stored:'corrupt'}).projection(),.78);
  const failed=camera({fail:true});failed.set('top');assert.equal(failed.projection(),1);
});
test('directional art is lazy, reused, and unsupported or failed skins keep their original fallback', () => {
  const pending=[];
  const Image=function(){pending.push(this);this.naturalWidth=this.naturalHeight=256;};
  const api=new Function('Image',artSource+';return SHARK_ART;')(Image);
  assert.equal(pending.length,0);assert.equal(api.getOblique({id:'coral'},'R'),null);assert.equal(pending.length,0);
  assert.equal(api.getOblique({id:'basic'},'R'),null);assert.equal(pending.length,4);
  pending.forEach(i=>i.onload());const right=api.getOblique({id:'basic'},'R');assert(right);
  for(let n=0;n<30;n++)assert.equal(api.getOblique({id:'basic'},'R'),right);
  assert.equal(pending.length,4);
  api.getOblique({id:'lighthouse'},'R');pending.slice(4).forEach(i=>i.onerror());
  assert.equal(api.getOblique({id:'lighthouse'},'R'),null);assert.equal(pending.length,8);
});

test('raised quays leave every water/device cell centre visible and retain the regional land palette', () => {
  const { LEVELS } = require('../src/levels');
  const quay = source.slice(source.indexOf('function drawObliqueQuay'), source.indexOf('function drawObliqueShark'));
  const render = new Function('map', `
    const T=40, dpr=1, OX=0, OY=0, CW=map[0].length*T, CH=map.length*T, staticTop=0, staticHeight=CH, deco=0;
    const boardSurface={land:['#eef5fa','#dbe6ed'],decor:'sluice'}, fills=[], colours=[];
    const noop=()=>{}, gradient={addColorStop:(at,colour)=>colours.push(colour)};
    const s=new Proxy({fillRect:(...r)=>fills.push(r),createLinearGradient:()=>gradient},{get:(o,k)=>o[k]||noop});
    const staticLayer={getContext:()=>s}, isLand=(x,y)=>(map[y]?.[x]??'#')==='#';
    const hash=()=>.1, drawPlanting=noop, drawPipe=noop;
    ${quay}
    drawObliqueQuay();return {fills,colours};
  `);
  for (const level of LEVELS) {
    const { fills, colours }=render(level.map);
    assert(colours.includes('#eef5fa') && colours.includes('#dbe6ed'));
    level.map.forEach((row,y)=>[...row].forEach((cell,x)=>{
      if(cell==='#')return;
      const cx=(x+.5)*40,cy=(y+.5)*40;
      assert(!fills.some(([a,b,w,h])=>cx>=a&&cx<a+w&&cy>=b&&cy<b+h),`${level.name}: quay covers ${cell} at ${x},${y}`);
    }));
  }
});
