const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/game.js'), 'utf8');
const section = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));
const fn = name => source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))?.[0]
  || source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];

// The production scheduler and lifecycle with a controllable display clock.
// Draw counters measure work requested, not GPU time or physical-device frame rate.
function scene() {
  return new Function(`
    let now=0,sequence=0,reduceMotion=false,anim=null,bump=null,settle=null,pop=null,clock=0;
    let guidePlaying=false,guidePaintTime=0,guideTime=0,heroWake=0,heroTime=0,heroW=300,heroVisible=true,endingElapsed=0;
    let clearReveal=null;
    const document={hidden:false},performance={now:()=>now},callbacks=new Map(),skinPreviewMotion=new Map(),heroRipples=[];
    const g={},staticLayer={},counts={game:0,hero:0,ending:0,step:0,paused:0,interrupt:0,guide:0,flush:0},deltas=[];
    const nodes={app:{inert:false},gameScreen:{hidden:true},titleScreen:{hidden:false},guideOverlay:{hidden:true},endingOverlay:{hidden:true}};
    const $=id=>nodes[id];
    const requestAnimationFrame=cb=>{const id=++sequence;callbacks.set(id,cb);return id;};
    const cancelAnimationFrame=id=>callbacks.delete(id);
    const guideOpen=()=>!$('guideOverlay').hidden,endingOpen=()=>!$('endingOverlay').hidden,heroPaused=()=>$('app').inert;
    const step=dt=>{counts.step++;deltas.push(dt);clock+=dt;},draw=()=>counts.game++;
    const stepHero=dt=>heroTime+=dt,drawHero=()=>counts.hero++,drawEnding=()=>counts.ending++;
    const stepDeviceGuide=dt=>{if(guidePlaying)counts.guide+=dt;guidePaintTime=guideTime;},stepRewardPreviews=()=>{},updateHintButton=()=>{};
    const flushSheetExits=()=>counts.flush++,pauseGame=()=>{counts.paused++;anim=null;};
    const interruptClearPresentation=()=>counts.interrupt++,clearPlayEffects=()=>{},drawSkinPreview=()=>{},updateGuidePlayback=()=>{};
    ${section('let gameNeedsPaint', 'const SWIPE')}
    ${section('/* One bounded frame chain;', 'function step(dt)')}
    const tick=ms=>{now+=ms;const pending=[...callbacks];callbacks.clear();for(const [,cb]of pending)cb(now);};
    return {start:startFrames,tick,counts,deltas,nodes,pending:()=>callbacks.size,dirty:invalidateScenes,
      move:v=>anim=v?{}:null,reduced:v=>changeMotionPreference({matches:v}),heroVisible:v=>heroVisible=v,
      hidden:v=>{document.hidden=v;if(v)suspendPresentation();else resumePresentation();},
      native:v=>{appActive=v;if(v)resumePresentation();else suspendPresentation();},
      page:v=>{pageHidden=v;if(v)suspendPresentation();else resumePresentation();},
      guide:v=>{nodes.guideOverlay.hidden=false;guidePlaying=v;},
      guideState:()=>({playing:guidePlaying,paintTime:guidePaintTime}),
      result:cb=>clearReveal=()=>{clearReveal=null;cb();},heroTime:()=>heroTime};
  `)();
}
function seconds(ui, count = 1, hz = 240) { for (let i=0;i<count*hz;i++) ui.tick(1000/hz); }

test('high refresh displays stay bounded at 60 active and 30 ambient updates per second', () => {
  const ui=scene();ui.start();seconds(ui);
  assert.ok(ui.counts.hero>=28&&ui.counts.hero<=30, String(ui.counts.hero));
  ui.nodes.titleScreen.hidden=true;ui.nodes.gameScreen.hidden=false;ui.move(true);
  seconds(ui);assert.ok(ui.counts.game>=58&&ui.counts.game<=60,String(ui.counts.game));
  assert.ok(ui.deltas.every(dt=>dt>0&&dt<=.05));assert.equal(ui.pending(),1);
});

test('obscured and reduced-motion scenes paint once, then only after content invalidation', () => {
  const ui=scene();ui.nodes.app.inert=true;ui.start();seconds(ui);assert.equal(ui.counts.hero,1);
  ui.dirty();seconds(ui);assert.equal(ui.counts.hero,2);
  ui.nodes.app.inert=false;ui.reduced(true);seconds(ui);const still=ui.counts.hero;
  seconds(ui,3);assert.equal(ui.counts.hero,still);
  ui.nodes.titleScreen.hidden=true;ui.nodes.gameScreen.hidden=false;seconds(ui);assert.equal(ui.counts.game,1);
  seconds(ui);assert.equal(ui.counts.game,1);
  ui.move(true);seconds(ui);assert.ok(ui.counts.game>1,'essential movement still renders');
});

test('offscreen hero work stops until scrolling it back into view', () => {
  const ui=scene();ui.heroVisible(false);ui.start();seconds(ui);assert.equal(ui.counts.hero,0);
  ui.heroVisible(true);seconds(ui);assert.ok(ui.counts.hero>0);
});

test('visibility, native activity and page lifecycle gates resume only one frame chain without catch-up', () => {
  const ui=scene();ui.start();ui.start();seconds(ui);ui.hidden(true);
  assert.equal(ui.pending(),0);const count=ui.counts.hero,time=ui.heroTime();seconds(ui,60);
  assert.equal(ui.counts.hero,count);assert.equal(ui.heroTime(),time);
  ui.native(false);ui.hidden(false);assert.equal(ui.pending(),0);
  ui.page(true);ui.native(true);assert.equal(ui.pending(),0);
  let result=0;ui.result(()=>result++);ui.page(false);ui.start();assert.equal(ui.pending(),1);assert.equal(result,1);
  ui.tick(34);assert.ok(ui.heroTime()-time<.05);assert.equal(ui.pending(),1);
  ui.native(true);ui.hidden(false);assert.equal(result,1);assert.equal(ui.pending(),1);
});

test('live motion preference stops autoplay and delayed presentation; disabling it never restarts a paused guide', () => {
  const ui=scene();ui.guide(true);ui.start();seconds(ui);assert.ok(ui.counts.guide>0);
  let result=0;ui.result(()=>result++);ui.reduced(true);
  assert.equal(result,1);assert.equal(ui.guideState().playing,false);assert.equal(ui.guideState().paintTime,-1);
  const elapsed=ui.counts.guide;seconds(ui);assert.equal(ui.counts.guide,elapsed);
  ui.reduced(false);seconds(ui);assert.equal(ui.counts.guide,elapsed);
  ui.guide(true);seconds(ui);assert.ok(ui.counts.guide>elapsed,'explicit replay remains available');
});

test('guide redraw reuses its bitmap; allocation only occurs when dimensions change', () => {
  const run=new Function(`
    let reduceMotion=false,guidePlaying=true,guideTime=0,guidePaintTime=-1,writes=0,width=240;
    const noop=()=>{},ctx=new Proxy({},{get:()=>noop});
    const canvas={getBoundingClientRect:()=>({width,height:200}),getContext:()=>ctx};
    for(const key of ['width','height'])Object.defineProperty(canvas,key,{get:()=>canvas['_'+key],set:v=>{writes++;canvas['_'+key]=v;}});
    const els={guideDemo:canvas,guideCaption:{},guideStats:{},guideProgress:{}},$=id=>els[id];
    const window={devicePixelRatio:2},C={},JET={},ANG={U:0};
    const guideDemo={duration:5,grid:{w:1,h:1,nets:0,cells:['.']}};
    const sampleDeviceDemo=()=>({phase:{kind:'move'},nets:[],boats:[],pos:[0,0],dir:'U',scale:1,moves:0,text:'move'});
    const drawShark=noop;
    ${fn('drawDeviceDemo')}
    return {draw:()=>{guideTime+=.016;drawDeviceDemo();},resize:()=>width=300,writes:()=>writes};
  `)();
  run.draw();assert.equal(run.writes(),2);
  for(let i=0;i<120;i++)run.draw();assert.equal(run.writes(),2);
  run.resize();run.draw();assert.equal(run.writes(),4);
});
