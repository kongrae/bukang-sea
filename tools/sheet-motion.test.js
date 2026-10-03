const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/game.js'), 'utf8');
const sheets = source.slice(source.indexOf('const SHEET_IDS'), source.indexOf('/* ---------- storage'));

// Actual production sheet handlers, controllable clock, focus and visibility.
function scene(reduced = false) {
  return new Function('reduceMotion', `
    let now=0,sequence=0,gest={drag:true},queued='R',desktop=false;
    const performance={now:()=>now},calls=[];
    const matchMedia=()=>({get matches(){return desktop;}});
    const closeJourney=()=>dismiss('journeyOverlay'),closeEnding=()=>dismiss('endingOverlay'),closeDaily=()=>dismiss('dailyOverlay');
    const closeFree=()=>dismiss('freeOverlay'),closePilot=()=>dismiss('pilotOverlay'),closeJournal=()=>dismiss('journalOverlay');
    const closeSkins=()=>dismiss('skinsOverlay'),closeSettings=()=>dismiss('settingsOverlay'),closeGuide=()=>dismiss('guideOverlay');
    function dismiss(id){calls.push(id);closeSheet(id);}
    const invalidateScenes=()=>{};
    const timers=new Map(),elements=new Map(),document={hidden:false,activeElement:null};
    const setTimeout=(cb,ms)=>{const id=++sequence;timers.set(id,{cb,due:now+ms});return id;};
    const clearTimeout=id=>timers.delete(id);
    const $=id=>{
      if(!elements.has(id)){
        const classes=new Set(),attrs=new Map(),styles=new Map(),captures=new Set();
        elements.set(id,{id,hidden:id.endsWith('Overlay'),inert:false,isConnected:true,items:[],
          classList:{add:(...ks)=>ks.forEach(k=>classes.add(k)),remove:(...ks)=>ks.forEach(k=>classes.delete(k)),contains:k=>classes.has(k),replace:(a,b)=>{classes.delete(a);classes.add(b);}},
          style:{setProperty:(k,v)=>styles.set(k,String(v)),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''},
          setPointerCapture:k=>captures.add(k),hasPointerCapture:k=>captures.has(k),releasePointerCapture:k=>captures.delete(k),
          setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k),
          focus(){document.activeElement=this;},closest(selector){
            if(selector==='[hidden]')return this.hidden?this:null;
            if(selector==='[data-sheet-drag]')return this.header||null;
            if(selector==='.overlay')return this.overlay||null;
            if(selector==='.card')return this.card||null;
            if(selector==='[data-sheet-close]')return this.dataset?.sheetClose?this:null;
            return this.interactive?this:null;
          },
          getClientRects(){return this.hidden?[]:[{}];},querySelectorAll(){return this.items;}});
      }
      return elements.get(id);
    };
    ${sheets}
    const header=id=>{
      const h=$(id+'Header'),el=$(id),card=$(id+'Card');h.header=h;h.overlay=el;h.card=card;
      card.getBoundingClientRect=()=>({top:400+(parseFloat(el.style.getPropertyValue('--sheet-y'))||0),height:400});
      return h;
    };
    const pointer=(id,x,y,extra={})=>({target:header(id),clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,timeStamp:now,cancelable:true,preventDefault(){},...extra});
    const advance=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.due<=now){timers.delete(id);t.cb();}};
    return {element:$,open:openSheet,close:closeSheet,flush:flushSheetExits,keys:sheetKeydown,advance,
      focus:id=>$(id).focus(),active:()=>document.activeElement?.id,timers:()=>timers.size,
      hidden:v=>document.hidden=v,input:()=>({gest,queued}),closing:()=>sheetExits.size,
      down:sheetPointerDown,move:sheetPointerMove,up:sheetPointerEnd,click:sheetClick,pointer,header,calls,
      desktop:v=>desktop=v,reset:resetSheetGesture,drag:()=>sheetDrag,returning:()=>!!sheetReturn};
  `)(reduced);
}

test('logical close is immediate; exit blocks background input until focus returns once', () => {
  const ui=scene();ui.focus('titleSettingsBtn');ui.open('settingsOverlay');
  assert.equal(ui.element('app').inert,true);assert.deepEqual(ui.input(),{gest:null,queued:null});
  ui.focus('settingsDone');ui.close('settingsOverlay','titleSettingsBtn');
  assert.equal(ui.element('settingsOverlay').hidden,true);
  assert.equal(ui.element('settingsOverlay').getAttribute('aria-hidden'),'true');
  assert.equal(ui.element('settingsOverlay').inert,true);
  assert.equal(ui.element('settingsOverlay').classList.contains('sheet-leaving'),true);
  let blocked=0;assert.equal(ui.keys({key:'ArrowUp',preventDefault:()=>blocked++}),true);assert.equal(blocked,1);
  ui.close('settingsOverlay','titleSettingsBtn');assert.equal(ui.timers(),1);
  ui.advance(179);assert.equal(ui.element('app').inert,true);
  ui.advance(1);assert.equal(ui.element('app').inert,false);assert.equal(ui.active(),'titleSettingsBtn');
  assert.equal(ui.element('settingsOverlay').classList.contains('sheet-leaving'),false);assert.equal(ui.timers(),0);
});

test('drag uses the menu dismissal once and exits from the finger position; the release click is consumed', () => {
  const ui=scene();ui.open('settingsOverlay');
  ui.down(ui.pointer('settingsOverlay',100,400));ui.advance(150);ui.move(ui.pointer('settingsOverlay',102,525));
  assert.equal(ui.element('settingsOverlay').style.getPropertyValue('--sheet-y'),'125px');
  ui.up(ui.pointer('settingsOverlay',102,525));
  assert.deepEqual(ui.calls,['settingsOverlay']);assert.equal(ui.closing(),1);
  assert.equal(ui.element('settingsOverlay').style.getPropertyValue('--sheet-exit-start'),'125px');
  let blocked=0;ui.click({target:ui.header('settingsOverlay'),detail:1,pointerId:1,preventDefault(){blocked++;},stopImmediatePropagation(){blocked++;}});
  assert.equal(blocked,2);ui.advance(180);assert.equal(ui.element('app').inert,false);
  assert.equal(ui.element('settingsOverlay').style.getPropertyValue('--sheet-exit-start'),'');
});

test('short drag returns, a deliberate flick dismisses, tiny fast motions and held drags do not', () => {
  for(const [distance,ms,hold,closed]of [[25,100,0,false],[50,50,0,true],[20,5,0,false],[50,40,200,false]]){
    const ui=scene();ui.open('dailyOverlay');ui.down(ui.pointer('dailyOverlay',100,400));
    ui.advance(ms);ui.move(ui.pointer('dailyOverlay',100,400+distance));ui.advance(hold);
    ui.up(ui.pointer('dailyOverlay',100,400+distance));assert.equal(ui.calls.length,closed?1:0);
    if(!closed){assert.equal(ui.returning(),true);assert.equal(ui.element('app').inert,true);ui.advance(180);assert.equal(ui.returning(),false);}
  }
});

test('body, controls, desktop, results, sideways and upwards gestures never dismiss', () => {
  for(const mode of ['body','control','desktop','result','side','up']){
    const ui=scene(),id=mode==='result'?'clearOverlay':'journalOverlay';ui.open(id);
    const p=ui.pointer(id,100,400);
    if(mode==='body')p.target=ui.element('body');
    if(mode==='control')p.target={closest:s=>s==='[data-sheet-drag]'?ui.header(id):{}};
    if(mode==='desktop')ui.desktop(true);
    ui.down(p);ui.advance(100);
    ui.move(ui.pointer(id,mode==='side'?250:100,mode==='up'?250:550));
    ui.up(ui.pointer(id,100,550));assert.equal(ui.calls.length,0,mode);assert.equal(ui.drag(),null,mode);
  }
});

test('cancel, extra pointer, menu replacement and resize cleanup leave no captured pointer or stale transform', () => {
  for(const mode of ['cancel','extra','open','reset','close']){
    const ui=scene();ui.open('skinsOverlay');ui.down(ui.pointer('skinsOverlay',100,400));
    ui.advance(100);ui.move(ui.pointer('skinsOverlay',100,450));
    if(mode==='cancel')ui.up(ui.pointer('skinsOverlay',100,450),true);
    if(mode==='extra')ui.down(ui.pointer('skinsOverlay',150,450,{pointerId:2,isPrimary:false}));
    if(mode==='open')ui.open('guideOverlay');
    if(mode==='reset')ui.reset();
    if(mode==='close')ui.close('skinsOverlay');
    ui.advance(200);assert.equal(ui.drag(),null);assert.equal(ui.returning(),false);
    assert.equal(ui.header('skinsOverlay').hasPointerCapture(1),false);
    assert.equal(ui.element('skinsOverlay').style.getPropertyValue('--sheet-y'),'');
    assert.equal(ui.calls.length,0);
  }
});

test('every dismissible menu routes through its handler; reduced motion resets without a return timer', () => {
  for(const id of ['journeyOverlay','endingOverlay','dailyOverlay','freeOverlay','pilotOverlay','journalOverlay','skinsOverlay','settingsOverlay','guideOverlay']){
    const ui=scene(true);ui.open(id);ui.down(ui.pointer(id,100,400));ui.advance(200);
    ui.move(ui.pointer(id,100,550));ui.up(ui.pointer(id,100,550));assert.deepEqual(ui.calls,[id]);assert.equal(ui.timers(),0);
  }
  const ui=scene(true);ui.open('freeOverlay');ui.down(ui.pointer('freeOverlay',100,400));ui.advance(200);
  ui.move(ui.pointer('freeOverlay',100,440));ui.up(ui.pointer('freeOverlay',100,440));
  assert.equal(ui.returning(),false);assert.equal(ui.timers(),0);assert.equal(ui.element('app').inert,true);
});

test('opening another sheet or reentering cancels the old exit without stealing focus', () => {
  const ui=scene();ui.open('dailyOverlay');ui.close('dailyOverlay','dailyBtn');
  ui.open('journalOverlay');ui.focus('journalTitle');
  assert.equal(ui.closing(),0);assert.equal(ui.timers(),0);assert.equal(ui.element('app').inert,true);
  ui.advance(1000);assert.equal(ui.active(),'journalTitle');
  ui.close('journalOverlay','journalBtn');ui.open('journalOverlay');ui.focus('journalTitle');
  assert.equal(ui.element('journalOverlay').hidden,false);assert.equal(ui.element('journalOverlay').inert,false);
  ui.advance(1000);assert.equal(ui.active(),'journalTitle');assert.equal(ui.element('app').inert,true);
});

test('reduced motion, hidden documents and screen changes leave no exit timers or blocked background', () => {
  const reduced=scene(true);reduced.open('skinsOverlay');reduced.close('skinsOverlay','skinBtn');
  assert.equal(reduced.timers(),0);assert.equal(reduced.active(),'skinBtn');assert.equal(reduced.element('app').inert,false);
  const ui=scene();ui.open('freeOverlay');ui.close('freeOverlay','freeBtn');ui.hidden(true);ui.flush();
  assert.equal(ui.timers(),0);assert.equal(ui.element('app').inert,false);assert.equal(ui.active(),undefined);
  ui.hidden(false);ui.open('guideOverlay');ui.close('guideOverlay',null,false);
  assert.equal(ui.timers(),0);assert.equal(ui.element('app').inert,false);
});

test('Tab and Shift Tab wrap within the active dialog, excluding hidden controls', () => {
  const ui=scene();ui.open('settingsOverlay');
  const first=ui.element('sound'),last=ui.element('done'),hidden=ui.element('legacy');hidden.hidden=true;
  ui.element('settingsOverlay').items=[first,hidden,last];
  let wrapped=0;const key=shiftKey=>({key:'Tab',shiftKey,preventDefault:()=>wrapped++});
  ui.focus('done');ui.keys(key(false));assert.equal(ui.active(),'sound');
  ui.keys(key(true));assert.equal(ui.active(),'done');assert.equal(wrapped,2);
  ui.focus('background');ui.keys(key(false));assert.equal(ui.active(),'sound');
});
