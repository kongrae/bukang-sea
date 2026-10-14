const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const artSource = fs.readFileSync(path.join(__dirname, '../src/art.js'), 'utf8');
const cameraSource = source.slice(source.indexOf('const FIRST_CANAL_VIEW_KEY'), source.indexOf('function drawObliqueQuay'));
function camera({ stored = null, fail = false } = {}) {
  return new Function('stored', 'fail', `
    const LEVELS = [{}, {}]; let STORY = LEVELS[0], LVL = 0, DAILY = null, FREE = null, PILOT = null;
    const T = 48, CH = 480, OY = 72, clock = 3, writes = [];
    const localStorage = {getItem: () => { if(fail) throw Error(); return stored; }, setItem: (...args) => { if(fail) throw Error(); writes.push(args); }};
    const buttons = ['top', 'oblique'].map(mode => ({dataset:{canalView:mode},setAttribute(k,v){this[k]=v;}}));
    const elements = {canalViewToggle:{hidden:false,querySelectorAll:()=>buttons},canalViewNote:{hidden:true}};
    const $ = id => elements[id], SHARK_ART = {hasOblique:()=>true}, currentSkin=()=>({id:'basic'});
    let paints = 0; const buildStatic=()=>{},invalidateScenes=()=>{},draw=()=>paints++;
    ${cameraSource}
    return {projection:boardProjection, gridY:boardGridY, set:setCanalView, update:updateCanalView, writes, elements, buttons,
      scope: (mode,index=0,legacy=false) => {DAILY=mode==='daily'?{}:null;FREE=mode==='free'?{}:null;PILOT=mode==='pilot'?{}:null;LVL=index;STORY=legacy?{}:LEVELS[index];updateCanalView();},
      paints:()=>paints};
  `)(stored, fail);
}
test('camera is available only on the current first story canal, never daily/free/pilot or restored legacy maps', () => {
  const c = camera();
  for (const [mode,index,legacy] of [['daily',0,false],['free',0,false],['pilot',0,false],['story',1,false],['story',0,true]]) {
    c.scope(mode,index,legacy); assert.equal(c.projection(),1); assert.equal(c.elements.canalViewToggle.hidden,true);
    c.set('oblique'); assert.equal(c.writes.length,0);
  }
  c.scope('story'); assert.equal(c.projection(),.78); assert.equal(c.elements.canalViewToggle.hidden,false);
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
