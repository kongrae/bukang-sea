const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {out,chromium}=require('./result-polish-qa');
const sharp=require(path.join(path.dirname(process.argv[2]),'sharp'));
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:500,height:960}});await p.goto('http://127.0.0.1:5182/outputs/qa/result-polish/video.html');
  const audio=await p.evaluate(async()=>{
   const c=new AudioContext(),buffer=await c.decodeAudioData(await (await fetch('escape-audio.webm')).arrayBuffer());
   const a=buffer.getChannelData(0);let peak=0,energy=0,nonzero=0;for(const x of a){peak=Math.max(peak,Math.abs(x));energy+=x*x;if(Math.abs(x)>.0001)nonzero++;}
   const v=document.querySelector('video');v.muted=false;await v.play();const tracks=v.captureStream().getAudioTracks().length;
   return {duration:buffer.duration,channels:buffer.numberOfChannels,peak,rms:Math.sqrt(energy/a.length),nonzero,audioTracks:tracks};
  });assert.equal(audio.audioTracks,1);assert.ok(audio.peak>.005&&audio.peak<.98);assert.ok(audio.rms>.0005);
  await p.waitForTimeout(4700);await p.screenshot({path:path.join(out,'video-playback.png')});
  fs.writeFileSync(path.join(out,'audio-report.json'),JSON.stringify(audio,null,2));
 }finally{await browser.close();}
 const destination=path.resolve('docs/result-polish');fs.mkdirSync(destination,{recursive:true});
 for(const kind of ['hud','result']){
  const parts=[];for(const [index,side] of ['before','after'].entries()){
   let img=sharp(path.join(out,`${side}-${kind}.png`));if(kind==='hud')img=img.extract({left:30,top:152,width:720,height:116});
   const {data,info}=await img.resize({width:390}).png().toBuffer({resolveWithObject:true});
   parts.push({input:data,left:index*406,top:38});if(index===0)parts.height=info.height;
  }
  const label=Buffer.from('<svg width="796" height="38"><style>text{font:16px sans-serif;fill:#205b6d}</style><text x="12" y="25">BEFORE</text><text x="418" y="25">AFTER</text></svg>');
  await sharp({create:{width:796,height:parts.height+50,channels:4,background:'#e8f8f5'}}).composite([...parts,{input:label,left:0,top:0}]).png().toFile(path.join(destination,kind+'-comparison.png'));
 }
 for(const name of ['escape-with-audio.webm','video.html','after-report.json','video-report.json','audio-report.json'])fs.copyFileSync(path.join(out,name),path.join(destination,name));
 console.log('Video audio decoded, one audio track, non-silent/no clipping; comparisons saved.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
