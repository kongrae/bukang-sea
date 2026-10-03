const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const levels = fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
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
    const unlocked=i=>i===0||save.best[i-1]!=null,totalStars=()=>Object.values(save.best).reduce((sum,n)=>sum+n,0);
    const earnedJournalRewards=()=>[],refreshSkins=()=>[],sfx={win:noop,star:noop,cancelReward:noop,token:()=>0,unlockReward:noop},haptic=noop,setTimeout=cb=>cb();
    const storySession=()=>null,curLevel=()=>LEVELS[LVL];
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
const bestThrough = count => Object.fromEntries(Array.from({length:count},(_,i)=>[i,1]));

test('journey uses valid story escapes, keeps chapter boundaries and ignores daily progress and invalid stars', () => {
  const game=scene({best:{...bestThrough(12),12:3,13:2,24:0,25:'3',26:4,47:-1},daily:{'2026-10-01':3},dailyOps:{'2026-10-01':{version:1,stars:[3,3,3]}}});
  const progress=game.progress();assert.equal(progress.count,14);assert.equal(progress.complete,false);
  assert.deepEqual(progress.chapters.map(ch=>[ch.start,ch.count,ch.total,ch.complete]),[[0,12,12,true],[12,2,12,false],[24,0,12,false],[36,0,12,false]]);
  assert.equal(game.ending(),false);assert.equal(game.written(),null,'viewing progress does not rewrite existing records');
});

test('one-star chapter completion shows the milestone and continues to the next existing level', () => {
  const game=scene({best:bestThrough(11),owned:['basic','gold'],skin:'gold',sessions:{story:{id:11},daily:{keep:true}}});
  game.clear(11);
  assert.equal(game.element('clearTitle').textContent,'북항 수로 통과!');assert.equal(game.element('clearStory').hidden,false);
  assert.match(game.element('clearStory').textContent,/공원 안쪽 운하/);
  assert.equal(game.element('nextBtn').textContent,'다음 장으로');game.next();assert.equal(game.stats().loaded,12);
  assert.equal(game.save().best[11],1);assert.equal(game.save().sessions.story,undefined);assert.deepEqual(game.save().sessions.daily,{keep:true});
  assert.deepEqual(game.save().owned,['basic','gold']);assert.equal(game.save().skin,'gold');
});

test('final clear opens the ending at 48 one-star escapes; closing restores result and daily/home routes remain available', () => {
  const game=scene({best:bestThrough(47)});game.clear(47);
  assert.equal(game.progress().complete,true);assert.equal(game.element('nextBtn').textContent,'구출 엔딩 보기');
  game.next();assert.equal(game.element('endingOverlay').hidden,false);assert.equal(game.element('clearOverlay').hidden,true);
  assert.equal(game.element('app').inert,true);assert.match(game.element('endingRecord').textContent,/48개 수로 구출 완료 · ★ 48 \/ 144/);
  game.close();assert.equal(game.element('clearOverlay').hidden,false);assert.equal(game.element('app').inert,true);
  game.next();game.daily();assert.equal(game.stats().dailyOpened,1);assert.equal(game.element('endingOverlay').hidden,true);
  game.ending();game.home();assert.equal(game.element('endingOverlay').hidden,true);assert.equal(game.element('endingBtn').hidden,false);
});

test('old complete saves offer ending replay without extra flags or maximum stars; reload and journey return preserve ownership', () => {
  const stored={best:bestThrough(48),last:47,skin:'coral',owned:['basic','coral'],journal:{version:1,days:{'2026-09-30':1}}};
  const game=scene(stored);game.render();assert.equal(game.element('endingBtn').hidden,false);
  assert.match(game.element('playBtn').textContent,/별 더 모으기/);
  game.journey();assert.equal(game.element('journeyEndingBtn').hidden,false);game.ending('journey');game.close();
  assert.equal(game.element('journeyOverlay').hidden,false);assert.equal(game.element('app').inert,true);
  assert.equal(game.written(),null);assert.deepEqual(game.save().journal,stored.journal);
  assert.equal(scene(game.save()).ending(),true,'replay derives from retained clears, no new completion flag');
});

test('missing earlier escape cannot unlock ending through last-level clear or daily completion', () => {
  const best=bestThrough(48);delete best[6];const game=scene({best});game.clear(47);
  assert.equal(game.progress().complete,false);assert.equal(game.element('nextBtn').textContent,'수로 목록');assert.equal(game.ending(),false);
  const daily=scene({best:bestThrough(48)});daily.clear(0,3,true);assert.equal(daily.element('clearStory').hidden,true);
  daily.next();assert.equal(daily.stats().dailyContinued,1);assert.equal(daily.element('endingOverlay').hidden,true);
});

test('journey can preview a locked chapter without opening its levels; reduced-motion ending immediately shows selected shark in sea', () => {
  const game=scene({skin:'starsea'},true);game.journey();assert.match(game.element('journeyChapters').innerHTML,/4장 둘러보기/);
  game.select(3);assert.match(game.element('levelGrid').innerHTML,/외항 물길/);
  assert.equal(game.element('stagePicker').open,true,'journey selection reveals its chapter before focus moves');
  assert.match(game.element('levelGrid').innerHTML,/disabled/);assert.equal(game.stats().loaded,null);
  const ending=scene({best:bestThrough(48),skin:'starsea',owned:['basic','starsea']},true);
  ending.ending();const args=ending.stats().sharkDraws[0];
  assert.equal(args[1],222);assert.equal(args[6],false);assert.equal(args[9].id,'starsea');
  ending.draw(20);assert.equal(ending.stats().sharkDraws[1][1],222,'reduced motion keeps a static sea position');
});
