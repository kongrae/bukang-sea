const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/game.js'), 'utf8');
const sheets = source.slice(source.indexOf('const SHEET_IDS'), source.indexOf('/* ---------- storage'));

// Actual production sheet handlers, controllable clock, focus and visibility.
function scene(reduced = false) {
  return new Function('reduceMotion', `
    let now=0,sequence=0,gest={drag:true},queued='R';
    const invalidateScenes=()=>{};
    const timers=new Map(),elements=new Map(),document={hidden:false,activeElement:null};
    const setTimeout=(cb,ms)=>{const id=++sequence;timers.set(id,{cb,due:now+ms});return id;};
    const clearTimeout=id=>timers.delete(id);
    const $=id=>{
      if(!elements.has(id)){
        const classes=new Set(),attrs=new Map();
        elements.set(id,{id,hidden:id.endsWith('Overlay'),inert:false,isConnected:true,items:[],
          classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
          setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k),
          focus(){document.activeElement=this;},closest(){return this.hidden?this:null;},
          getClientRects(){return this.hidden?[]:[{}];},querySelectorAll(){return this.items;}});
      }
      return elements.get(id);
    };
    ${sheets}
    const advance=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.due<=now){timers.delete(id);t.cb();}};
    return {element:$,open:openSheet,close:closeSheet,flush:flushSheetExits,keys:sheetKeydown,advance,
      focus:id=>$(id).focus(),active:()=>document.activeElement?.id,timers:()=>timers.size,
      hidden:v=>document.hidden=v,input:()=>({gest,queued}),closing:()=>sheetExits.size};
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
