// Build-time only. Release source never contains an unlock switch or a URL-triggered bypass.
function developmentBody(body) {
  const once = (from, to) => {
    if (body.split(from).length !== 2) throw Error('Development build hook changed: ' + from);
    body = body.replace(from, to);
  };
  once("const STORE_KEY = 'bukang-sea-v1';", "const STORE_KEY = 'bukang-sea-development-v1';");
  once("const CANAL_VIEW_KEY = 'bukang-first-canal-view-v1';", "const CANAL_VIEW_KEY = 'bukang-development-camera-v1';");
  const story = body.match(/^const unlocked = .*$/m)?.[0];
  const skins = body.match(/^const skinEarned = [\s\S]*?;/m)?.[0];
  if (!story || !skins) throw Error('Development unlock hooks missing');
  once(story, 'const unlocked = i => !!LEVELS[i];');
  once('const pilotUnlocked = i => i === 0 || pilotStars(i - 1) > 0;', 'const pilotUnlocked = i => !!PILOT_LEVELS[i];');
  once(skins, 'const skinEarned = s => true;');
  once('const locked = progress.stars.slice(0, stage).some(n => !n), stars = progress.stars[stage];', 'const locked = false, stars = progress.stars[stage];');
  once('if (!DAILY_STAGES[stage] || progress.stars.slice(0, stage).some(n => !n)) return;', 'if (!DAILY_STAGES[stage]) return;');
  once('<!-- playtest-label -->', '<small data-development-build style="position:fixed;left:max(8px,env(safe-area-inset-left));bottom:max(2px,env(safe-area-inset-bottom));z-index:20;pointer-events:none;padding:2px 6px;border-radius:5px;background:#123b46;color:white;font:10px system-ui">DEV · 전체 해금 · 기록 별도</small>');
  return body;
}
module.exports = { developmentBody };
