// Actual production samples/mixer rendered by Edge, at the same 150ms star spacing.
// The WAV is a listening comparison, not a recording from a physical speaker.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const {embedAudio} = require('./build-source');
const {chromium} = require(process.argv[2] || 'playwright');
const beforeRef = '0164aa1', out = path.resolve('docs/result-polish');
async function main() {
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page = await browser.newPage();
    for (const [label, source] of [
      ['before', cp.execFileSync('git', ['show', beforeRef + ':src/sound.js'], {encoding:'utf8'})],
      ['after', fs.readFileSync('src/sound.js', 'utf8')],
    ]) await page.addScriptTag({content:`window.${label}Factory=(()=>{${embedAudio(source)};return createGameAudio;})();`});
    const rendered = await page.evaluate(async () => {
      const rate = 48000, stats = a => {
        let peak=0,energy=0;for(const x of a){peak=Math.max(peak,Math.abs(x));energy+=x*x;}
        return {peak,rms:Math.sqrt(energy/a.length)};
      };
      async function render(version, count, {fallback=false,cancel=false}={}) {
        const ctx = new OfflineAudioContext(1,rate*1.4,rate);
        const facade = new Proxy(ctx,{get:(target,key)=>key==='state'?'running':key==='resume'?()=>Promise.resolve():typeof target[key]==='function'?target[key].bind(target):target[key]});
        const engine = window[version+'Factory']({createContext:()=>facade,random:()=>.5,...(fallback?{samples:null}:{})});
        engine.unlock();await engine.loaded();const token=engine.effects.token();
        const events=Array.from({length:count},(_,i)=>[.2+i*.15,()=>engine.effects.star(i,token)]);
        if(cancel)events.push([.36,()=>engine.effects.cancelReward()]);
        const jobs=events.map(([time,fire])=>ctx.suspend(Math.round(time*rate/128)*128/rate).then(()=>{fire();return ctx.resume();}));
        const buffer=await ctx.startRendering();await Promise.all(jobs);const data=buffer.getChannelData(0);
        return {data:Array.from(data),report:{...stats(data),attacks:events.slice(0,count).map(([time])=>stats(data.slice(Math.round(time*rate),Math.round((time+.06)*rate)))),tail:stats(data.slice(rate)),afterCancel:cancel?stats(data.slice(rate*.42)):null,samples:engine.inspect().samples}};
      }
      const cases={};for(const count of [1,2,3])cases['after'+count]=await render('after',count);
      cases.before3=await render('before',3);cases.fallback=await render('after',3,{fallback:true});cases.cancel=await render('after',3,{cancel:true});
      return cases;
    });
    for (const [name,{report}] of Object.entries(rendered)) {
      assert.ok(report.peak>.005&&report.peak<.95,name+' non-silent, with peak headroom');
      assert.ok(report.tail.peak<.00001,name+' no lingering tail');
      if(name!=='fallback')assert.equal(report.samples,20);
    }
    assert.ok(rendered.cancel.report.afterCancel.peak<.00001,'cancelled ceremony stays silent');
    const comparison = new Float32Array(48000*3.4);
    comparison.set(rendered.before3.data);comparison.set(rendered.after3.data,48000*1.8);
    const wav=Buffer.alloc(44+comparison.length*2);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
    wav.write('data',36);wav.writeUInt32LE(comparison.length*2,40);
    comparison.forEach((x,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'star-sound-before-after.wav'),wav);
    const report={beforeRef,sampleRate:48000,physicalDevice:false,source:'Production Web Audio with embedded CC0 recordings, offline Edge render; original gain preserved',comparison:{before:[.2,.35,.5],after:[2,2.15,2.3]},cases:Object.fromEntries(Object.entries(rendered).map(([k,v])=>[k,v.report]))};
    fs.writeFileSync(path.join(out,'star-sound-report.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(out,'star-sound.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>별 착지 사운드 전후</title><style>body{max-width:560px;margin:40px auto;padding:20px;background:#e8f8f5;color:#205b6d;font:17px/1.7 sans-serif}audio{width:100%}</style><h1>별 착지 사운드</h1><p>이전 3개 → 잠깐 쉼 → 변경 후 3개</p><audio controls src="star-sound-before-after.wav"></audio><p>실제 게임 음원과 믹서를 같은 음량 기준으로 렌더링했습니다. 후반은 짧은 타격음과 더 또렷한 상승 차임입니다.</p><p><a href="video.html">게임 화면과 소리를 함께 보기</a></p>');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
