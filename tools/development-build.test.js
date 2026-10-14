const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {gameBody}=require('./build-source'),{developmentBody}=require('./development-build'),{assertReleaseAssets}=require('./check-release');
const {LEVELS}=require('../src/levels'),{PILOT_LEVELS}=require('../src/pilot');
test('development-only transform opens valid canals, daily stages and skins without manufacturing stars or changing release source',()=>{
  const release=gameBody(),dev=developmentBody(release);
  const unlocked=new Function('LEVELS',dev.match(/^const unlocked = .*$/m)[0]+';return unlocked;')(LEVELS);
  LEVELS.forEach((_,i)=>assert.equal(unlocked(i),true));assert.equal(unlocked(84),false);
  const pilot=new Function('PILOT_LEVELS',dev.match(/^const pilotUnlocked = .*$/m)[0]+';return pilotUnlocked;')(PILOT_LEVELS);
  PILOT_LEVELS.forEach((_,i)=>assert.equal(pilot(i),true));assert.equal(pilot(12),false);
  assert(dev.includes('const skinEarned = s => true;'));
  assert(dev.includes('const locked = false, stars = progress.stars[stage];'));
  assert(!dev.includes('if (!DAILY_STAGES[stage] || progress.stars.slice(0, stage).some(n => !n)) return;'));
  assert(dev.includes("const STORE_KEY = 'bukang-sea-development-v1';"));
  assert(!dev.includes("const STORE_KEY = 'bukang-sea-v1';"));
  assert(release.includes("const STORE_KEY = 'bukang-sea-v1';"));
  assert(release.includes('const unlocked = i => i === 0 ||'));
  assert(!release.includes('data-development-build'));
  assert.equal(dev.match(/^let save = .*$/m)[0],release.match(/^let save = .*$/m)[0],'start with real empty results');
  assert.throws(()=>developmentBody(release.replace('const unlocked =','const renamedUnlocked =')),/hooks missing/);
});
test('release guard rejects development, stale files and copied comparison content',()=>{
  const parent=path.resolve(__dirname,'../outputs/qa');fs.mkdirSync(parent,{recursive:true});
  const dir=fs.mkdtempSync(path.join(parent,'release-guard-'));
  const write=(html,mode='release')=>{
    fs.writeFileSync(path.join(dir,'index.html'),html);
    fs.writeFileSync(path.join(dir,'build-info.json'),JSON.stringify({mode,htmlSha256:crypto.createHash('sha256').update(html).digest('hex')}));
  };
  try{
    const release=gameBody();write(release);assert.equal(assertReleaseAssets(dir).mode,'release');
    write(developmentBody(release),'development');assert.throws(()=>assertReleaseAssets(dir),/development web assets/);
    write(developmentBody(release));assert.throws(()=>assertReleaseAssets(dir),/normal progression missing/);
    write(release);fs.appendFileSync(path.join(dir,'index.html'),'changed');assert.throws(()=>assertReleaseAssets(dir),/changed since build/);
    write(release);fs.mkdirSync(path.join(dir,'compare'));fs.writeFileSync(path.join(dir,'compare/index.html'),"const STORE_KEY = 'bukang-view-comparison-v1';");
    assert.throws(()=>assertReleaseAssets(dir),/development content/);
  }finally{
    if(path.dirname(path.resolve(dir))!==parent)throw Error('Unexpected test output directory');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
