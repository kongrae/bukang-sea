// Record the live browser viewport and the production post-compressor audio together.
// CDP JPEG frames feed an offscreen capture canvas; MediaRecorder muxes real Web Audio (not a replacement soundtrack).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {out,build,chromium}=require('./result-polish-qa');
async function main(){
 build('after');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
  await p.addInitScript(()=>{
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(destination,...args){
    const result=connect.call(this,destination,...args);
    if(destination===this.context.destination){window.qaAudioTap=this.context.createMediaStreamDestination();connect.call(this,qaAudioTap);}
    return result;
   };
  });
  await p.goto('http://127.0.0.1:5182/outputs/qa/result-polish/after.html');await p.locator('#launchScreen').waitFor({state:'hidden'});
  await p.locator('#playBtn').click();await p.evaluate(async()=>{resultQA.enter(3);await resultQA.audio(true,false);});await p.waitForTimeout(800);
  assert.equal((await p.evaluate(()=>resultQA.state())).audio.samples,20);
  await p.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;
   const paint=canvas.getContext('2d'),stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...qaAudioTap.stream.getAudioTracks()]);
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:1800000}),chunks=[];
   const audioRecorder=new MediaRecorder(qaAudioTap.stream,{mimeType:'audio/webm;codecs=opus'}),audioChunks=[];
   recorder.ondataavailable=e=>chunks.push(e.data);audioRecorder.ondataavailable=e=>audioChunks.push(e.data);
   window.qaCapture={paint,recorder,audioRecorder,chunks,audioChunks,started:0,frames:0};
  });
  const cdp=await p.context().newCDPSession(p);let busy=false,frames=0;
  cdp.on('Page.screencastFrame',async e=>{
   await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});if(busy)return;busy=true;
   try{await p.evaluate(async data=>{const img=new Image();img.src='data:image/jpeg;base64,'+data;await img.decode();qaCapture.paint.drawImage(img,0,0,390,844);qaCapture.frames++;},e.data);frames++;}finally{busy=false;}
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:390,maxHeight:844,everyNthFrame:1});await p.waitForFunction(()=>qaCapture.frames>0);
  await p.evaluate(()=>{qaCapture.started=performance.now();qaCapture.recorder.start();qaCapture.audioRecorder.start();});
  await p.waitForTimeout(650);
  for(const s of await p.evaluate(()=>resultQA.route())){await p.evaluate(s=>resultQA.move(s),s);await p.waitForFunction(()=>!resultQA.state().anim);await p.waitForTimeout(90);}
  await p.locator('#clearOverlay').waitFor({state:'visible'});await p.waitForTimeout(2400);
  const result=await p.evaluate(async()=>{
   const capture=qaCapture,finished=performance.now();
   await Promise.all([new Promise(resolve=>{capture.recorder.onstop=resolve;capture.recorder.stop();}),new Promise(resolve=>{capture.audioRecorder.onstop=resolve;capture.audioRecorder.stop();})]);
   const encode=blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});
   return {video:await encode(new Blob(capture.chunks,{type:'video/webm'})),audio:await encode(new Blob(capture.audioChunks,{type:'audio/webm'})),duration:(finished-capture.started)/1000,frames:capture.frames,state:resultQA.state()};
  });
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(out,'escape-with-audio.webm'),Buffer.from(result.video,'base64'));
  fs.writeFileSync(path.join(out,'escape-audio.webm'),Buffer.from(result.audio,'base64'));
  const events=result.state.events.filter(e=>e.name==='star');assert.equal(events.length,3);
  fs.writeFileSync(path.join(out,'video-report.json'),JSON.stringify({duration:result.duration,frames,audioIncluded:true,audioSource:'live production post-compressor Web Audio, same MediaRecorder as browser viewport',sampleAssets:result.state.audio.samples,starEvents:events,physicalDevice:false,play:'stage 7 (LEVELS index 3), real engine replay'},null,2));
  fs.writeFileSync(path.join(out,'video.html'),'<!doctype html><meta charset="utf-8"><title>숭어 수집 · 탈출 결과</title><style>body{margin:20px;background:#e8f8f5;color:#205b6d;font:16px sans-serif;text-align:center}video{height:85vh;max-width:100%;border-radius:20px}</style><p>정식 7번 수로 · 실제 규칙 자동 조작 · 브라우저 게임 소리 포함</p><video controls src="escape-with-audio.webm"></video>');
  console.log(JSON.stringify({duration:result.duration,frames,audioIncluded:true}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
