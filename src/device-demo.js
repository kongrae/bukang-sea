/* ---------- Isolated, reader-paced device examples using the real movement rules ---------- */
const DEMO_ENGINE = typeof module !== 'undefined' && typeof require === 'function' ? require('./engine.js') : { parseLevel, slide, stepBoats, pressSwitch };
const DEVICE_DEMOS = {
  move: { map: ['#######','#.....#','#S....#','#.....#','#######'], actions: [
    { dir: 'R', cue: '오른쪽으로 밀어요', text: '벽 앞까지 한 번에 헤엄쳐요' },
  ], summary: '한 번 밀면 막힐 때까지 이동해요' },
  buoy: { map: ['#######','#.....#','#S..o.#','#.....#','#######'], actions: [
    { dir: 'R', cue: '부표 쪽으로 밀어요', text: '부표 바로 앞 칸에서 멈춰요' },
    { dir: 'U', cue: '이번에는 위로 밀어요', text: '멈춘 자리에서 방향을 바꿀 수 있어요' },
  ], summary: '부표를 멈춤 지점으로 이용해요' },
  boat: { map: ['#######','#.....#','#S..b.#','#.....#','#######'], actions: [
    { dir: 'R', cue: '구조정 쪽으로 밀어요', text: '구조정 앞에서 상어가 먼저 멈춰요', boat: '그다음 구조정이 한 칸 움직여요' },
    { dir: 'D', cue: '상어를 아래로 한 번 더 밀어요', text: '상어가 멈출 때까지 구조정은 기다려요', boat: '벽에 막힌 구조정은 방향을 바꿔요' },
  ], summary: '상어 이동 → 멈춤 → 구조정 한 칸' },
  jet: { map: ['#######','#S.v..#','#.....#','#.....#','#######'], actions: [
    { dir: 'R', cue: '물줄기 쪽으로 밀어요', text: '화살표 방향으로 꺾여 계속 헤엄쳐요' },
  ], summary: '물줄기에 들어가면 방향이 바뀌어요' },
  net: { map: ['#######','#.....#','#S....#','#.....#','#######'], nets: 1, actions: [
    { tap: [4, 2], text: '빈 물 칸을 톡! 그물을 설치해요' },
    { dir: 'R', cue: '그물 쪽으로 밀어요', text: '그물 바로 앞에서 멈춰요' },
    { dir: 'U', cue: '이번에는 위로 밀어요', text: '친 그물은 그 자리에 계속 남아요' },
  ], summary: '한 번 친 그물은 걷을 수 없어요. 칠 자리를 먼저 생각해요' },
  sand: { map: ['#######','#.....#','#S.s..#','#.....#','#######'], actions: [
    { dir: 'R', cue: '모래톱 쪽으로 밀어요', text: '모래톱 위에 올라서면 멈춰요' },
    { dir: 'R', cue: '다시 한 번 오른쪽으로 밀어요', text: '모래톱에서 다시 출발할 수 있어요' },
  ], summary: '올라서면 멈춤, 다음 이동은 자유롭게' },
  whirl: { map: ['#######','#...w.#','#.....#','#Sw...#','#######'], actions: [
    { dir: 'R', cue: '소용돌이 쪽으로 밀어요', text: '짝 소용돌이로 이동해 같은 방향으로 나와요' },
  ], summary: '짝으로 이동한 뒤에도 같은 방향으로 헤엄쳐요' },
  gate: { map: ['#######','#...#.#','#S.pG.#','#...#.#','#######'], actions: [
    { dir: 'R', cue: '스위치 쪽으로 밀어요', text: '닫힌 수문 앞, 스위치 위에서 멈춰요', gate: '멈추면 눌려서 연결된 수문이 열려요' },
    { dir: 'R', cue: '한 번 더 밀어요', text: '열린 수문은 물길처럼 지나가요' },
  ], summary: '스위치에서 멈춰야 눌리고, 누를 때마다 수문이 바뀌어요' },
};
function demoTurn(state) { return { pos: state.pos.slice(), dir: state.dir, boats: state.boats.map(b => b.slice()), nets: state.nets.slice(), moves: state.moves, gate: state.gate }; }
function createDeviceDemo(key) {
  const definition = DEVICE_DEMOS[key];
  if (!definition) return null;
  const grid = DEMO_ENGINE.parseLevel(definition), phases = [];
  let state = { pos: grid.start.slice(), dir: 'R', boats: grid.boats.map(b => b.slice()), nets: [], moves: 0, gate: 0 }, duration = 0;
  const add = (kind, seconds, text, from, to = from, extra = {}) => {
    phases.push({ kind, start: duration, duration: seconds, text, from: demoTurn(from), to: demoTurn(to), ...extra });
    duration += seconds;
  };
  add('hold', 0.5, definition.actions[0].cue || definition.actions[0].text, state);
  for (const action of definition.actions) {
    if (action.tap) {
      const index = action.tap[1] * grid.w + action.tap[0], next = demoTurn(state);
      next.nets = next.nets.includes(index) ? next.nets.filter(i => i !== index) : [...next.nets, index];
      add('tap', 0.8, action.text, state, next, { tap: action.tap });
      state = next; add('hold', 0.35, action.text, state);
      continue;
    }
    state.dir = action.dir;
    add('cue', 0.5, action.cue, state, state, { dir: action.dir });
    const result = DEMO_ENGINE.slide(grid, state.pos, action.dir, new Set(state.nets), state.boats, state.gate);
    const next = { ...demoTurn(state), pos: result.end.slice(), dir: result.path.at(-1)[2], moves: state.moves + 1 };
    add('move', 1.15, action.text, state, next, { path: result.path });
    state = next;
    add('hold', 0.35, action.text, state);
    // Same order as a real turn: the stop presses a switch, its gates turn, then boats move.
    const gate = DEMO_ENGINE.pressSwitch(grid, state.pos, state.gate);
    if (gate !== state.gate) {
      const pressed = { ...demoTurn(state), gate };
      add('gate', 0.55, action.gate, state, pressed);
      state = pressed;
      add('hold', 0.45, action.gate, state);
    }
    const boats = DEMO_ENGINE.stepBoats(grid, state.boats, state.pos[1] * grid.w + state.pos[0], new Set(state.nets), state.gate);
    if (JSON.stringify(boats) !== JSON.stringify(state.boats)) {
      const nextBoat = { ...demoTurn(state), boats };
      add('boat', 0.55, action.boat, state, nextBoat);
      state = nextBoat;
      add('hold', 0.45, action.boat, state);
    }
  }
  add('hold', 1.1, definition.summary, state);
  // Keep the action speed natural; give each distinct caption its own reading hold.
  // The same boundaries drive manual stepping and optional one-pass playback.
  const groups = [];
  for (const phase of phases) {
    if (groups.at(-1)?.text !== phase.text) groups.push({ text: phase.text, phases: [] });
    groups.at(-1).phases.push(phase);
  }
  duration = 0;
  const steps = [], readablePhases = [];
  for (const group of groups) {
    const start = duration, seconds = group.phases.reduce((sum, p) => sum + p.duration, 0);
    const readingTime = Math.max(4, group.text.length * .12 + 1);
    if (seconds < readingTime) {
      const end = group.phases.at(-1).to;
      group.phases.push({ kind: 'hold', duration: readingTime - seconds, text: group.text, from: demoTurn(end), to: demoTurn(end) });
    }
    for (const phase of group.phases) {
      phase.start = duration; duration += phase.duration; readablePhases.push(phase);
    }
    steps.push({ start, end: duration, text: group.text });
  }
  return { key, grid, phases: readablePhases, steps, duration };
}
// Sampling never touches live puzzle state. A warp jumps between its endpoints, never across intervening walls.
function sampleDeviceDemo(demo, time) {
  const at = Math.max(0, Math.min(time, demo.duration));
  const phase = demo.phases.find(p => at < p.start + p.duration) || demo.phases.at(-1);
  const progress = Math.max(0, Math.min(1, (at - phase.start) / phase.duration));
  const state = demoTurn(phase.kind === 'tap' ? (progress < 0.5 ? phase.from : phase.to) : phase.to);
  let pos = state.pos.slice(), dir = state.dir, scale = 1;
  if (phase.kind === 'move') {
    const pts = [phase.from.pos, ...phase.path], distance = Math.min(phase.path.length, progress * phase.path.length);
    const i = Math.min(Math.floor(distance), pts.length - 2), f = distance - i, a = pts[i], b = pts[i + 1];
    dir = b[2];
    if (b[3]) { pos = (f < 0.5 ? a : b).slice(0, 2); scale = Math.abs(f - 0.5) * 2; }
    else pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    state.boats = phase.from.boats.map(b => b.slice());
  }
  const boats = state.boats.map(([index, heading], i) => {
    const before = phase.from.boats[i], start = phase.kind === 'boat' ? before[0] : index;
    const f = phase.kind === 'boat' ? progress : 1;
    return { x: start % demo.grid.w + (index % demo.grid.w - start % demo.grid.w) * f,
      y: Math.floor(start / demo.grid.w) + (Math.floor(index / demo.grid.w) - Math.floor(start / demo.grid.w)) * f, dir: heading };
  });
  return { phase, progress, pos, dir, scale, boats, nets: state.nets, moves: state.moves, gate: state.gate, text: phase.text };
}
if (typeof module !== 'undefined') module.exports = { DEVICE_DEMOS, createDeviceDemo, sampleDeviceDemo };
