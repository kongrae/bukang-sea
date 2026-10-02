const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const read = name => fs.readFileSync(path.join(__dirname, '../src/', name + '.js'), 'utf8');
const section = (a,b) => source.slice(source.indexOf(a),source.indexOf(b));
const fn = name => source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`,'m'))?.[0]
  || source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];

// Production saving, award detection and presentation handlers, with a controllable clock.
// CSS, canvas appearance and physical-device input are verified separately.
function scene({ stored={}, reduced=false }={}) {
  return new Function('stored','reduceMotion','NativeDate',`
    ${read('engine')}
    ${read('levels')}
    ${read('variety')}
    ${read('variety-reserves')}
    ${read('daily')}
    const Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-01T12:00:00']));}};
    let written=null,now=0,sequence=0,DAILY=null,FREE=null,LVL=0,g,st,cleared=false,heroW=1;
    const timers=new Map(),frames=[],sounds=[],vibrations=[],draws=[],noop=()=>{};
    const setTimeout=(cb,ms)=>{const id=++sequence;timers.set(id,{cb,due:now+ms});return id;};
    const clearTimeout=id=>timers.delete(id),requestAnimationFrame=cb=>frames.push(cb);
    // Business harnesses omit visual exits; actual sheet lifecycle is covered by sheet-motion.test.js.
    const openSheet=id=>{$(id).hidden=false;$('app').inert=true;};
    const closeSheet=id=>{$(id).hidden=true;$('app').inert=false;};
    const document={hidden:false},window={devicePixelRatio:1},performance={now:()=>now},C={};
    const renderSuspended=()=>document.hidden;
    const ctx=new Proxy({},{get:()=>noop}),drawShark=(...args)=>draws.push(args);
    function element(attrs={}) {
      const classes=new Set(),children=[];
      const el={attrs,children,dataset:{},hidden:true,textContent:'',isConnected:true,offsetWidth:300,
        classList:{toggle:(k,on)=>{if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},
        focus:noop,setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k]??null,
        getBoundingClientRect:()=>({width:300,height:112}),getContext:()=>ctx,
        contains:c=>children.some(child=>child===c||child.contains(c)),closest:()=>null,
        querySelectorAll:selector=>children.filter(c=>selector==='canvas'?c.tag==='canvas':selector==='.skin'?c.attrs.class?.split(' ').includes('skin'):c.attrs[selector.slice(1,-1)]!=null),
        querySelector:selector=>selector==='canvas'?el.canvas:children.find(c=>c.attrs['data-id']===selector.match(/"([^]*?)"/)?.[1])};
      for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))el.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
      Object.defineProperty(el,'innerHTML',{get:()=>el.html||'',set:value=>{
        el.html=value;children.length=0;
        for(const match of value.matchAll(/<(button|canvas|span|li)\\b([^>]*?)>/g)) {
          const a=Object.fromEntries([...match[2].matchAll(/([\\w-]+)="([^]*?)"/g)].map(m=>[m[1],m[2]])),child=element(a);child.tag=match[1];
          if(child.tag==='button'){child.canvas=element();child.canvas.tag='canvas';child.children.push(child.canvas);}
          children.push(child);
        }
      }}); return el;
    }
    const elements=new Map(),$=id=>{if(!elements.has(id)){const el=element();elements.set(id,el);
      const parent={clearUnlocks:'clearOverlay',skinGrid:'skinsOverlay'}[id];if(parent)$(parent).children.push(el);
    }return elements.get(id);};
    const localStorage={getItem:()=>JSON.stringify(Object.assign({best:{},sessions:{}},stored)),setItem:(_,v)=>written=v};
    ${section('const STORE_KEY','const unlocked')}
    const unlocked=i=>i===0||save.best[i-1]!=null;
    ${section('function flower(', '/* ---------- haptics:')}
    ${fn('chapterOf')}
    ${section('/* ---------- story journey:', '/* ---------- shark skins:')}
    ${section('/* ---------- reward presentation:', '/* ---------- daily canal: record')}
    ${section('/* ---------- daily canal: record', '/* ---------- free canals:')}
    const sfx={win:()=>sounds.push(['win',now]),star:k=>sounds.push([k,now]),equip:()=>sounds.push(['equip',now])};
    const haptic=v=>vibrations.push(v),renderLevelGrid=noop,storySession=()=>null;
    const curLevel=()=>DAILY?DAILY.level:LEVELS[LVL],dailySessionKey=()=> 'daily';
    const show=noop,loadLevel=noop;
    const advance=ms=>{const end=now+ms;while(true){const entry=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!entry)break;now=entry[1].due;timers.delete(entry[0]);entry[1].cb();}now=end;};
    return {save:()=>JSON.parse(written),element:$,sounds:()=>sounds.slice(),timers:()=>timers.size,advance,cancel:cancelClearPresentation,
      interrupt:interruptClearPresentation,resume:()=>clearReveal?.(false),pendingResult:()=>!!clearReveal,
      hidden:v=>document.hidden=v,frames:()=>{while(frames.length)frames.shift()();},draws:()=>draws.slice(),
      pending:()=>({levels:[...rewardPending.levels],stars:[...rewardPending.stars],chapters:[...rewardPending.chapters],
        dates:[...rewardPending.stamps],badges:[...rewardPending.badges],skins:[...rewardPending.skins]}),
      openJournal,closeJournal,openSkins,selectSkin,closeSkins,step:stepRewardPreviews,apply:applyStoryRewards,
      finish:(index,stars=3,daily=null)=>{LVL=index;DAILY=daily?makeDailyStage('2026-10-01',daily.stage,dailyOperationVersion('2026-10-01')):null;
        g=parseLevel(curLevel());st={fish:stars>=2?g.fish.map((_,i)=>i):[],moves:curLevel().par+(stars===2?1:0)};
        $('clearOverlay').hidden=true;$('titleScreen').hidden=true;onClear();}
    };
  `)(stored,reduced,Date);
}

test('stars commit before animation and receive sound in sequence; unmet stars never receive a cue',()=>{
  for(const count of [1,2,3]) {
    const game=scene();game.finish(2,count);
    assert.equal(game.save().best[2],count);assert.equal(game.element('clearOverlay').hidden,true);
    game.advance(650);assert.equal(game.element('clearOverlay').hidden,false);assert.deepEqual(game.sounds(),[]);
    game.advance(239);assert.deepEqual(game.sounds(),[]);game.advance(1);assert.deepEqual(game.sounds(),[[0,890]]);
    game.advance(1000);assert.deepEqual(game.sounds().map(x=>x[0]),[0,1,2].slice(0,count));
    assert.equal(game.element('nextBtn').disabled,undefined,'presentation never disables navigation');
  }
});
test('leaving or a new clear cancels delayed cues without changing earned progress; hidden tabs skip sounds',()=>{
  const game=scene();game.finish(0);game.advance(650);game.cancel();game.advance(2000);assert.deepEqual(game.sounds(),[]);assert.equal(game.save().best[0],3);
  game.finish(1);game.advance(100);game.finish(2,1);game.advance(1800);assert.deepEqual(game.sounds().map(x=>x[0]),[0]);
  game.finish(3);game.hidden(true);game.advance(2000);assert.equal(game.sounds().length,1);assert.equal(game.save().best[3],3);
});
test('only new or improved story records queue stars, next level and chapter; replay never lowers best',()=>{
  const game=scene({stored:{best:{0:3,11:1},owned:['basic']}});game.finish(0,1);
  assert.deepEqual(game.pending().levels,[]);assert.deepEqual(game.pending().stars,[]);assert.equal(game.save().best[0],3);
  game.finish(11,3);assert.deepEqual(game.pending().stars,[11]);assert.deepEqual(game.pending().chapters,[]);
  game.finish(23,1);assert.deepEqual(game.pending().levels,[24]);assert.deepEqual(game.pending().chapters,[2]);
});

test('collapsed stage picker retains unlock and star cues until the player opens it',()=>{
  const game=scene();game.finish(0,3);
  game.element('titleScreen').hidden=false;
  game.element('levelGrid').innerHTML='<button data-i="0"></button><button data-i="1"></button>';
  game.element('stagePicker').open=false;game.apply();
  assert.deepEqual(game.pending().stars,[0]);assert.deepEqual(game.pending().levels,[1]);
  game.element('stagePicker').open=true;game.apply();
  assert.deepEqual(game.pending().stars,[]);assert.deepEqual(game.pending().levels,[]);
  const [cleared,unlocked]=game.element('levelGrid').children;
  assert.equal(cleared.classList.contains('reward-updated'),true);
  assert.equal(unlocked.classList.contains('reward-unlock'),true);
});
test('operation stages and journal stamps only celebrate an actual new stamp or badge, not replay',()=>{
  const game=scene({stored:{dailyOps:{'2026-10-01':{version:1,stars:[3,3,0]}}}});
  game.finish(0,3,{stage:2});assert.equal(game.save().journal.days['2026-10-01'],2);
  assert.match(game.element('clearJournalStamp').textContent,/작전 완료/);assert.deepEqual(game.pending().badges,['first-operation']);
  game.openJournal();assert.deepEqual(game.pending().dates,[]);assert.deepEqual(game.pending().badges,[]);game.closeJournal();
  game.finish(0,1,{stage:2});assert.equal(game.element('clearJournalStamp').hidden,true);assert.deepEqual(game.pending().dates,[]);
  assert.deepEqual(game.save().dailyOps['2026-10-01'].stars,[3,3,3]);
});
test('new skins are awarded once, previewed without equipping, and selection respects ownership',()=>{
  const best=Object.fromEntries(Array.from({length:11},(_,i)=>[i,i<3?3:1]));
  const game=scene({stored:{best,owned:['basic'],skin:'basic',hintUsage:{'story:11':{count:2,lastUsed:10}}}});
  game.finish(11);assert.deepEqual(game.save().owned,['basic','sakura']);assert.equal(game.save().skin,'basic');
  assert.equal(game.element('clearUnlocks').hidden,false);assert.match(game.element('clearUnlocks').innerHTML,/벚꽃 상어/);
  game.advance(650);game.step(.5);assert.ok(game.draws().length>1);
  game.cancel();game.openSkins();game.frames();game.selectSkin('gold');assert.equal(game.save().skin,'basic');
  game.selectSkin('sakura');game.frames();game.step(.4);assert.equal(game.save().skin,'sakura');
  game.closeSkins();const n=game.draws().length;game.step(.5);assert.equal(game.draws().length,n,'closed sheets stop previews');
  game.finish(11);assert.equal(game.element('clearUnlocks').hidden,true);assert.deepEqual(game.save().hintUsage,{'story:11':{count:2,lastUsed:10}});
});
test('reduced motion retains all rewards and buttons with a single completion cue and static previews',()=>{
  const game=scene({reduced:true});game.finish(0);game.advance(50);
  assert.equal(game.element('clearOverlay').classList.contains('clear-celebrating'),false);
  assert.deepEqual(game.sounds(),[['win',50]]);game.advance(2000);assert.equal(game.sounds().length,1);assert.equal(game.timers(),0);
  const hidden=scene({reduced:true});hidden.finish(0);hidden.hidden(true);hidden.advance(2000);
  assert.deepEqual(hidden.sounds(),[]);assert.equal(hidden.save().best[0],3);
});

test('backgrounding before or during rewards preserves the result and discards all delayed cues',()=>{
  for(const delay of [100,650,950]) {
    const game=scene();game.finish(0);game.advance(delay);const sounds=game.sounds().length;
    game.hidden(true);game.interrupt();game.advance(5000);
    assert.equal(game.timers(),0);assert.equal(game.sounds().length,sounds);assert.equal(game.save().best[0],3);
    game.hidden(false);game.resume();game.advance(2000);
    assert.equal(game.element('clearOverlay').hidden,false);assert.equal(game.pendingResult(),false);
    assert.equal(game.element('clearOverlay').classList.contains('clear-celebrating'),false);
    assert.equal(game.sounds().length,sounds);
  }
  const canceled=scene();canceled.finish(0);canceled.interrupt();canceled.cancel();canceled.resume();
  assert.equal(canceled.element('clearOverlay').hidden,true,'leaving the level must not reopen its result');
});
