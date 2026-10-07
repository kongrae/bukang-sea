const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const levels = fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
const pilot = fs.readFileSync(path.join(__dirname, '../src/pilot.js'), 'utf8');
const { STORY_ORDER: ORDER } = require('../src/levels');
function functionSource(name) {
  const match = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm')) || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, name); return match[0];
}

// Actual completion, journey, ending and main-screen handlers. Canvas pixels and device touch remain browser checks.
function scene(stored = {}, reduced = false) {
  const story = source.slice(source.indexOf('/* ---------- story journey:'), source.indexOf('/* ---------- shark skins:'));
  const rewardSource = source.slice(source.indexOf('/* ---------- reward presentation:'), source.indexOf('function onClear()'));
  const functions = ['chapterOf','persist','onClear','renderLevelGrid','netLevelBadge','nextLevel'].map(functionSource).join('\n');
  return new Function('stored','reduceMotion', `
    ${engine}
    ${levels}
    ${pilot}
    const save = Object.assign({best:{},last:0,sessions:{dailyStages:{}},daily:{},owned:['basic'],skin:'basic',journal:{days:{}}},JSON.parse(JSON.stringify(stored)));
    let written=null,DAILY=null,FREE=null,PILOT=null,LVL=0,g,st,cleared=false,selectedChapter=null,loaded=null,dailyOpened=0,dailyContinued=0,sharkDraws=[];
    const noop=()=>{},performance={now:()=>1000},window={devicePixelRatio:1},C={water:'#164b60',sea:'#367e85',concrete:'#ddd5c2'};
    const currentSkin=()=>({id:save.skin}),drawShark=(...args)=>sharkDraws.push(args);
    const ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(obj,key)=>obj[key]||noop});
    const elements=new Map();
    const $=id=>{
      if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',focus:noop,
        setAttribute:noop,querySelector:()=>({focus:noop}),querySelectorAll:()=>[],classList:{toggle:noop},
        getBoundingClientRect:()=>({width:300,height:170}),getContext:()=>ctx});
      return elements.get(id);
    };
    const STORE_KEY='bukang-sea-v1',localStorage={setItem:(key,value)=>written=value};
    ${source.match(/^const unlocked = .*$/m)[0]}
    const totalStars=()=>Object.values(save.best).reduce((sum,n)=>sum+n,0);
    const earnedJournalRewards=()=>[],refreshSkins=()=>[],sfx={win:noop,star:noop,cancelReward:noop,token:()=>0,unlockReward:noop},haptic=noop,setTimeout=cb=>cb();
    const storySession=()=>null,curLevel=()=>LEVELS[LVL],setRegionArt=noop,showRegionPreview=(el,region)=>{el.region=region;};
    const dailyProgress=()=>({count:1,stars:[0,0,0]}),dailyStreak=()=>1,journalTotals=()=>({visits:1,operations:0}),recordDailyStage=noop,dailySessionKey=()=> 'daily';
    const dailyDate=()=> '2026-10-01',openDaily=()=>{dailyOpened++;$('app').inert=true;},continueDaily=()=>dailyContinued++;
    const loadLevel=i=>{loaded=i;},show=which=>{if(which==='title'){cleared=false;$('clearOverlay').hidden=true;renderLevelGrid(true);}};
    // Business harnesses omit visual exits; actual sheet lifecycle is covered by sheet-motion.test.js.
    const openSheet=id=>{$(id).hidden=false;$('app').inert=true;};
    const closeSheet=id=>{$(id).hidden=true;$('app').inert=false;};
    const document={hidden:false};
    const renderSuspended=()=>document.hidden;
    ${rewardSource}
    ${functions}
    ${story}
    return { progress:storyProgress,journey:openJourney,select:selectJourneyChapter,ending:openEnding,close:closeEnding,
      daily:endingToDaily,home:endingToTitle,next:continueStory,render:renderLevelGrid,draw:drawEnding,
      element:$,save:()=>JSON.parse(JSON.stringify(save)),written:()=>written,
      stats:()=>({loaded,dailyOpened,dailyContinued,sharkDraws}),
      clear:(index,stars=1,daily=false)=>{LVL=index;DAILY=daily?{date:dailyDate(),stage:0}:null;g=parseLevel(LEVELS[index]);
        st={fish:stars>=2?g.fish.map((_,i)=>i):[],moves:LEVELS[index].par+(stars===2?1:0)};onClear();}
    };
  `)(stored,reduced);
}
// Saves are keyed by LEVELS index; "through N" means the first N canals in play order.
const bestThrough = count => Object.fromEntries(ORDER.slice(0, count).map(i => [i, 1]));

test('journey uses valid story escapes, keeps chapter boundaries and ignores daily progress and invalid stars', () => {
  const game=scene({best:{...bestThrough(12),[ORDER[12]]:3,[ORDER[13]]:2,[ORDER[24]]:0,[ORDER[25]]:'3',[ORDER[26]]:4,[ORDER[47]]:-1},daily:{'2026-10-01':3},dailyOps:{'2026-10-01':{version:1,stars:[3,3,3]}}});
  const progress=game.progress();assert.equal(progress.count,14);assert.equal(progress.complete,false);
  assert.deepEqual(progress.chapters.map(ch=>[ch.start,ch.count,ch.total,ch.complete]),[[ORDER[0],12,12,true],[ORDER[12],2,12,false],[ORDER[24],0,12,false],[ORDER[36],0,12,false],[ORDER[48],0,12,false],[ORDER[60],0,12,false]]);
  assert.equal(game.ending(),false);assert.equal(game.written(),null,'viewing progress does not rewrite existing records');
});

test('one-star chapter completion shows the milestone and continues to the next canal in play order', () => {
  const game=scene({best:bestThrough(11),owned:['basic','gold'],skin:'gold',sessions:{story:{id:ORDER[11]},daily:{keep:true}}});
  game.clear(ORDER[11]);
  assert.equal(game.element('clearTitle').textContent,'북항 수로 통과!');assert.equal(game.element('clearStory').hidden,false);
  assert.match(game.element('clearStory').textContent,/공원 안쪽 운하/);assert.equal(game.element('clearRegion').hidden,true);
  assert.equal(game.element('nextBtn').textContent,'다음 장으로');game.next();assert.equal(game.stats().loaded,ORDER[12]);
  assert.equal(game.save().best[ORDER[11]],1);assert.equal(game.save().sessions.story,undefined);assert.deepEqual(game.save().sessions.daily,{keep:true});
  assert.deepEqual(game.save().owned,['basic','gold']);assert.equal(game.save().skin,'gold');
});

test('final clear opens the ending at 72 one-star escapes; closing restores result and daily/home routes remain available', () => {
  const game=scene({best:bestThrough(71)});game.clear(ORDER[71]);
  assert.equal(game.progress().complete,true);assert.equal(game.element('nextBtn').textContent,'구출 엔딩 보기');
  game.next();assert.equal(game.element('endingOverlay').hidden,false);assert.equal(game.element('clearOverlay').hidden,true);
  assert.equal(game.element('app').inert,true);assert.match(game.element('endingRecord').textContent,/72개 수로 구출 완료 · ★ 72 \/ 216/);
  game.close();assert.equal(game.element('clearOverlay').hidden,false);assert.equal(game.element('app').inert,true);
  game.next();game.daily();assert.equal(game.stats().dailyOpened,1);assert.equal(game.element('endingOverlay').hidden,true);
  game.ending();game.home();assert.equal(game.element('endingOverlay').hidden,true);assert.equal(game.element('endingBtn').hidden,false);
});

test('complete saves offer ending replay without extra flags or maximum stars; reload and journey return preserve ownership', () => {
  const stored={best:bestThrough(72),last:59,skin:'coral',owned:['basic','coral'],journal:{version:1,days:{'2026-09-30':1}}};
  const game=scene(stored);game.render();assert.equal(game.element('endingBtn').hidden,false);
  assert.match(game.element('playBtn').textContent,/별 더 모으기/);
  game.journey();assert.equal(game.element('journeyEndingBtn').hidden,false);game.ending('journey');game.close();
  assert.equal(game.element('journeyOverlay').hidden,false);assert.equal(game.element('app').inert,true);
  assert.equal(game.written(),null);assert.deepEqual(game.save().journal,stored.journal);
  assert.equal(scene(game.save()).ending(),true,'replay derives from retained clears, no new completion flag');
});

test('missing earlier escape cannot unlock ending through last-level clear or daily completion', () => {
  const best=bestThrough(72);delete best[ORDER[6]];const game=scene({best});game.clear(ORDER[71]);
  assert.equal(game.progress().complete,false);assert.equal(game.element('nextBtn').textContent,'수로 목록');assert.equal(game.ending(),false);
  const daily=scene({best:bestThrough(72)});daily.clear(0,3,true);assert.equal(daily.element('clearStory').hidden,true);
  daily.next();assert.equal(daily.stats().dailyContinued,1);assert.equal(daily.element('endingOverlay').hidden,true);
});

test('journey can preview a locked chapter without opening its levels; reduced-motion ending immediately shows selected shark in sea', () => {
  const game=scene({skin:'starsea'},true);game.journey();assert.match(game.element('journeyChapters').innerHTML,/4장 둘러보기/);
  game.select(3);assert.match(game.element('levelGrid').innerHTML,/외항 물길/);
  assert.equal(game.element('stagePicker').open,true,'journey selection reveals its chapter before focus moves');
  assert.match(game.element('levelGrid').innerHTML,/disabled/);assert.equal(game.stats().loaded,null);
  const ending=scene({best:bestThrough(72),skin:'starsea',owned:['basic','starsea']},true);
  ending.ending();const args=ending.stats().sharkDraws[0];
  assert.equal(args[1],222);assert.equal(args[6],false);assert.equal(args[9].id,'starsea');
  ending.draw(20);assert.equal(ending.stats().sharkDraws[1][1],222,'reduced motion keeps a static sea position');
});

test('chapter 4 leads into the north harbor preview, then chapter 5 leads to the sluice works preview', () => {
  const outer=scene({best:bestThrough(47),skin:'gold',owned:['basic','gold']});outer.clear(ORDER[47]);outer.next();
  assert.equal(outer.stats().loaded,ORDER[48]);assert.equal(outer.progress().complete,false);
  assert.equal(outer.element('clearRegion').region,'north-harbor');assert.equal(outer.element('nextBtn').textContent,'다음 장으로');
  assert.match(outer.element('clearStory').textContent,/소용돌이/);assert.deepEqual(outer.save().owned,['basic','gold']);
  const harbor=scene({best:bestThrough(59)});harbor.clear(ORDER[59]);harbor.next();
  assert.equal(harbor.stats().loaded,ORDER[60]);assert.equal(harbor.element('clearRegion').region,'sluice-works');
  assert.equal(harbor.element('clearTitle').textContent,'북항 바깥길 통과!');
});

test('players who rescued all 60 canals before the additions keep the ending while the new canals wait', () => {
  const best=Object.fromEntries(Array.from({length:60},(_,i)=>[i,1]));
  const kept=scene({best,storyRescued:1});kept.render();
  assert.equal(kept.progress().complete,false);assert.equal(kept.progress().count,60);
  assert.equal(kept.element('endingBtn').hidden,false);assert.match(kept.element('playBtn').textContent,/이어서 구출/);
  assert.equal(kept.ending(),true);assert.match(kept.element('endingRecord').textContent,/60개 수로 구출 완료 · ★ 60 \/ 216/);
  assert.match(kept.element('endingAfter').textContent,/새로 들어온 수로/);
  kept.close();kept.journey();assert.equal(kept.element('journeyEndingBtn').hidden,false);
  assert.equal(scene({best}).ending(),false,'without a recorded rescue the ending still needs every canal');
});
