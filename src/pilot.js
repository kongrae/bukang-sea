/* ---------- Region art and compatibility with the former pilot course ---------- */
// Stable ids p01–p12 migrate old stars, sessions and hints to main stages 49–60; never reuse them.
// p = switch, G = gate closed at the start, g = gate open at the start (see engine.js). One link group per canal.
// Each canal records its region, learning intent, role, verified minimum route and star target.
// route: the verified minimum swipes; [x,y] = net placement before that swipe. npm run verify replays it.
const PILOT_VERSION = 1;
const PILOT_REGIONS = [
  { id: 'north-harbor', name: '북항 수로', short: '북항', goal: '굽은 물길을 지나 수문 시설 입구까지 가요.',
    // Board surfaces only; exits, jets, nets, fish and devices keep their shared colors in every region.
    palette: null },
  { id: 'sluice-works', name: '수문 시설', short: '수문', goal: '스위치로 수문을 열고 닫으며 바깥 바다로 나가요.',
    palette: { water: '#287b9e', sea: '#17577b', land: ['#f4f8fa', '#dbe7eb'], seam: '#accbd5', rail: '#f8ffff', park: '#82b7ac', frame: '#93c7d7' } },
];
// Compatibility aliases for old p01-p12 saves and the device/route verification tools.
// Production stages use the same definitions through LEVELS[48..59].
const PILOT_LEVELS = typeof STORY_EXTENSION_LEVELS !== 'undefined' ? STORY_EXTENSION_LEVELS : require('./levels.js').STORY_EXTENSION_LEVELS;
if (typeof module !== 'undefined') module.exports = { PILOT_VERSION, PILOT_REGIONS, PILOT_LEVELS };
