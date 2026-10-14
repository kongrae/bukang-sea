// Real release UI, isolated completed-story fixture. Never ships a QA hook or changes production unlock rules.
// node tools/device-view-qa.js <existing playwright module> [release URL] [--all]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.join(__dirname,'..'),base=process.argv[3]||'http://localhost:5182/www/';
const allModes=process.argv.includes('--all');
const out=path.join(root,'outputs/qa/device-view');fs.mkdirSync(out,{recursive:true});
const report={url:base,browser:'Edge mobile emulation',physicalAndroid:false,seededProgress:true,checks:[],errors:[]};
const pass=text=>{report.checks.push(text);console.log('PASS',text);};
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.addInitScript(allModes=>{
      const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
      if(!localStorage.getItem('bukang-sea-v1'))localStorage.setItem('bukang-sea-v1',JSON.stringify({
        best:Object.fromEntries(Array.from({length:84},(_,i)=>[i,3])),storyLength:84,
        sound:false,vibe:false,coachSwipe:true,coachNet:true,skin:'basic',owned:['basic'],
        seenDevices:['jet','boat','net','sand','whirl','gate','crate'],
        ...(allModes?{dailyOps:{[date]:{version:4,stars:[1,1,1]}}}:{})
      }));
    },allModes);
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    const record=()=>page.evaluate(()=>localStorage.getItem('bukang-sea-v1'));
    const session=async()=>JSON.parse(await record()).sessions.story;
    const choose=mode=>page.locator(`[data-canal-view=${mode}]`).click();
    async function enter(chapter,index){
      if(await page.locator('#gameScreen').isVisible())await page.locator('#backBtn').click();
      await page.locator('#stagePicker').click();await page.locator(`[data-chapter="${chapter}"]`).click();
      await page.locator(`#levelGrid [data-i="${index}"]`).click();
      await page.locator('#canalViewToggle').waitFor({state:'visible'});
      if(await page.locator('#guideClose').isVisible())await page.locator('#guideClose').click();
    }
    await page.goto(base);await page.locator('#launchScreen').waitFor({state:'hidden'});
    for(const [chapter,index,number,route] of [[5,59,72,['Up','Down','Up','Right']],[6,83,84,['Up','Left']]]){
      await enter(chapter,index);
      for(const direction of route){await page.keyboard.press('Arrow'+direction);await page.waitForTimeout(700);}
      const before=await record();assert.equal((await session()).state.moves,route.length);
      for(const mode of ['top','oblique']){
        await choose(mode);await page.waitForTimeout(180);assert.equal(await record(),before);
        await page.screenshot({path:path.join(out,`canal-${number}-${mode}.png`)});
      }
      const packet=await session();await page.reload();await page.locator('#playBtn').click();
      assert.deepEqual(await session(),packet);
      assert.equal(await page.locator('[data-canal-view=oblique]').getAttribute('aria-pressed'),'true');
      await page.locator('#undoBtn').click();assert.equal((await session()).state.moves,route.length-1);
      pass(`Canal ${number}: real picker, both cameras at the same position, exact saved bytes, reload/resume and undo`);
    }
    await enter(5,59);
    for(const [width,height,text] of [[320,568,100],[360,640,100],[390,844,100],[430,932,100],[320,568,200],[390,844,200]]){
      await page.setViewportSize({width,height});await page.evaluate(text=>document.documentElement.style.fontSize=text+'%',text);
      await page.waitForTimeout(180);
      const dimensions=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,board:document.querySelector('#board').getBoundingClientRect().height,buttons:[...document.querySelectorAll('[data-canal-view]')].map(b=>b.getBoundingClientRect().height)}));
      assert.equal(dimensions.overflow,false);assert(dimensions.buttons.every(h=>h>=44));
      assert(dimensions.board>=216,`12 rows fit at least 18px: ${JSON.stringify({width,height,text,...dimensions})}`);
      await choose('top');await choose('oblique');
      await page.screenshot({path:path.join(out,`size-${width}-text-${text}.png`)});
    }
    pass('Dense 12-row canal: 320/360/390/430 widths and 200% root text retain board and 44px camera controls');
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='100%');
    const before=await record();
    await page.evaluate(()=>{for(let n=0;n<30;n++){document.querySelector('[data-canal-view=top]').click();document.querySelector('[data-canal-view=oblique]').click();}});
    assert.equal(await record(),before);await page.keyboard.press('ArrowUp');await page.waitForTimeout(700);
    const packet=await session();await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);
    await page.reload();await page.locator('#playBtn').click();assert.deepEqual(await session(),packet);
    await choose('top');await choose('oblique');
    pass('Rapid camera changes leave save untouched; unchanged release service worker resumes the dense canal offline');
    if(allModes){
      await context.setOffline(false);
      for(const kind of ['daily','free'])for(const index of [0,1,2]){
        const enterMode=async()=>{
          if(await page.locator('#gameScreen').isVisible())await page.locator('#backBtn').click();
          await page.locator(kind==='daily'?'#dailyBtn':'#freeBtn').click();
          await page.locator(kind==='daily'?`#dailyStages [data-stage="${index}"]`:`#freeTiers [data-free="${index}"]`).first().click();
          await page.locator('#gameScreen').waitFor({state:'visible'});
          await page.locator('#canalViewToggle').waitFor({state:'visible'});
        };
        const active=()=>page.evaluate(({kind,index})=>{const s=JSON.parse(localStorage.getItem('bukang-sea-v1')).sessions;return kind==='daily'?s.dailyStages[index]:s['free'+index];},{kind,index});
        await enterMode();
        const before=await record();await choose('top');await choose('oblique');assert.equal(await record(),before);
        const packet=await active();assert(packet);
        await page.screenshot({path:path.join(out,`${kind}-${index}-oblique.png`)});
        await choose('top');await page.reload();await enterMode();assert.deepEqual(await active(),packet);
        assert.equal(await page.locator('[data-canal-view=top]').getAttribute('aria-pressed'),'true');
        await choose('oblique');
        await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);
        await page.reload();await enterMode();assert.deepEqual(await active(),packet);
        await choose('top');await choose('oblique');await context.setOffline(false);
        pass(`${kind} ${index+1}: actual menu entry, both cameras, separate session and saved camera choice survive reload and offline resume`);
      }
    }
    assert.deepEqual(report.errors,[]);report.success=true;
  } finally {fs.writeFileSync(path.join(out,base.startsWith('https:')?'public-results.json':'results.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
