/* Menu objects are native images: browsers share decoded assets, including the two settings buttons.
   Keep the existing SVG until decoding succeeds, so failed art never leaves an unlabeled gear. */
const MENU_ART = (() => {
  const urls = { challenge: '@@ART_UI_CHALLENGE@@', free: '@@ART_UI_FREE@@', map: '@@ART_UI_MAP@@', journal: '@@ART_UI_JOURNAL@@', settings: '@@ART_UI_SETTINGS@@' };
  return {
    load(root = document) {
      root.querySelectorAll('[data-menu-art]').forEach(slot => {
        const src = urls[slot.dataset.menuArt];
        if (!src || slot.querySelector('img')) return;
        const img = new Image();
        img.alt = ''; img.decoding = 'async'; img.draggable = false;
        img.onload = () => slot.classList.add('art-ready');
        img.onerror = () => { slot.classList.remove('art-ready'); img.hidden = true; };
        slot.appendChild(img); img.src = src;
      });
    },
  };
})();
/* Shared, optional art. Gameplay never waits for a network image or changes on load failure. */
const SHARK_ART = (() => {
  const images = {}, tinted = new Map(), requested = new Set(), waiting = new Map();
  const urls = { hero: '@@ART_HERO@@', portrait: '@@ART_PORTRAIT@@', swim: '@@ART_SWIM@@' };
  const skinUrls = {
    sakura: { portrait: '@@ART_SKIN_SAKURA_PORTRAIT@@', swim: '@@ART_SKIN_SAKURA_SWIM@@' },
    wave: { portrait: '@@ART_SKIN_WAVE_PORTRAIT@@', swim: '@@ART_SKIN_WAVE_SWIM@@' },
    maple: { portrait: '@@ART_SKIN_MAPLE_PORTRAIT@@', swim: '@@ART_SKIN_MAPLE_SWIM@@' },
    snow: { portrait: '@@ART_SKIN_SNOW_PORTRAIT@@', swim: '@@ART_SKIN_SNOW_SWIM@@' },
    gold: { portrait: '@@ART_SKIN_GOLD_PORTRAIT@@', swim: '@@ART_SKIN_GOLD_SWIM@@' },
    lighthouse: { portrait: '@@ART_SKIN_LIGHTHOUSE_PORTRAIT@@', swim: '@@ART_SKIN_LIGHTHOUSE_SWIM@@' },
    coral: { portrait: '@@ART_SKIN_CORAL_PORTRAIT@@', swim: '@@ART_SKIN_CORAL_SWIM@@' },
    starsea: { portrait: '@@ART_SKIN_STARSEA_PORTRAIT@@', swim: '@@ART_SKIN_STARSEA_SWIM@@' },
  };
  // Optional directional art for the first-canal camera comparison; decode only when that camera is used.
  const oblique = {
    basic: { R: '@@ART_OBLIQUE_BASIC_R@@', L: '@@ART_OBLIQUE_BASIC_L@@', D: '@@ART_OBLIQUE_BASIC_D@@', U: '@@ART_OBLIQUE_BASIC_U@@' },
    lighthouse: { R: '@@ART_OBLIQUE_LIGHTHOUSE_R@@', L: '@@ART_OBLIQUE_LIGHTHOUSE_L@@', D: '@@ART_OBLIQUE_LIGHTHOUSE_D@@', U: '@@ART_OBLIQUE_LIGHTHOUSE_U@@' },
  };
  for (const [id, views] of Object.entries(oblique)) {
    skinUrls[id] = { ...skinUrls[id], ...Object.fromEntries(Object.entries(views).map(([dir, src]) => ['oblique' + dir, src])) };
  }
  function request(name, src) {
    if (requested.has(name)) return;
    requested.add(name);
    const img = new Image();
    const done = image => {
      images[name] = image; tinted.delete(name);
      waiting.get(name)?.forEach(resolve => resolve()); waiting.delete(name);
      api.onReady(name);
    };
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  }
  const api = {
    onReady: () => {},
    ready(name, skin) {
      const src = skinUrls[skin?.id]?.[name] || urls[name];
      if (skinUrls[skin?.id]?.[name]) name += ':' + skin.id;
      if (Object.prototype.hasOwnProperty.call(images, name)) return Promise.resolve();
      return new Promise(resolve => {
        if (!waiting.has(name)) waiting.set(name, []);
        waiting.get(name).push(resolve); request(name, src);
      });
    },
    load() {
      for (const [name, src] of Object.entries(urls)) request(name, src);
    },
    hasSkin(name, skin) { return !!images[name + ':' + skin?.id]?.naturalWidth; },
    hasOblique(skin) { return !!oblique[skin.id]; },
    getOblique(skin, direction) {
      if (!api.hasOblique(skin)) return null;
      for (const dir of ['R', 'L', 'D', 'U']) api.get('oblique' + dir, skin);
      return images['oblique' + direction + ':' + skin.id] || null;
    },
    url(name, skin) { return skinUrls[skin?.id]?.[name] || urls[name]; },
    get(name, skin) {
      const src = skinUrls[skin?.id]?.[name];
      if (src) {
        const key = name + ':' + skin.id;
        request(key, src);
        if (api.hasSkin(name, skin)) return images[key];
      }
      const original = images[name];
      if (!original || !original.naturalWidth) return null;
      if (!skin?.body || name === 'hero') return original;
      const key = name + ':' + skin.id;
      if (tinted.has(key)) return tinted.get(key);
      const layer = document.createElement('canvas');
      layer.width = original.naturalWidth; layer.height = original.naturalHeight;
      const ctx = layer.getContext('2d');
      ctx.drawImage(original, 0, 0);
      // Lightweight legacy fallback while a themed sprite decodes, or if it fails.
      ctx.globalCompositeOperation = 'color'; ctx.fillStyle = skin.body;
      ctx.fillRect(0, 0, layer.width, layer.height);
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(original, 0, 0);
      tinted.set(key, layer); return layer;
    },
    draw(ctx, name, x, y, size, skin) {
      const img = api.get(name, skin);
      if (!img) return false;
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size); return true;
    },
  };
  return api;
})();
/* Sluice device states (SVG) and region cards (WebP). Optional like the shark art: every device has a drawn fallback
   that still shows its real state, and a failed card image only hides the picture. */
const BOARD_ART = (() => {
  const images = {}, sprites = new Map();
  const urls = { gateOpen: '@@ART_GATE_OPEN@@', gateClosed: '@@ART_GATE_CLOSED@@', switchOn: '@@ART_SWITCH_ON@@', switchOff: '@@ART_SWITCH_OFF@@' };
  const api = {
    onReady: () => {},
    load() {
      for (const [name, src] of Object.entries(urls)) {
        const img = new Image();
        img.onload = () => { images[name] = img; api.onReady(name); };
        img.onerror = () => { images[name] = null; api.onReady(name); };
        img.src = src;
      }
    },
    // px: device pixels of one tile. Each size is rasterised once, so the frame loop only copies bitmaps.
    get(name, px) {
      const img = images[name];
      if (!img || !img.naturalWidth) return null;
      if (!px) return img;
      const key = name + ':' + px;
      if (!sprites.has(key)) {
        const layer = document.createElement('canvas'); layer.width = layer.height = px;
        layer.getContext('2d').drawImage(img, 0, 0, px, px); sprites.set(key, layer);
      }
      return sprites.get(key);
    },
  };
  return api;
})();
const REGION_ART = {
  'harbor-canals': '@@ART_REGION_HARBOR_CANALS@@', 'waterside-park': '@@ART_REGION_WATERSIDE_PARK@@',
  'beyond-breakwater': '@@ART_REGION_BEYOND_BREAKWATER@@', 'outer-harbor': '@@ART_REGION_OUTER_HARBOR@@',
  'north-harbor': '@@ART_REGION_NORTH@@', 'sluice-works': '@@ART_REGION_SLUICE@@',
  'yeongdo-quay': '@@ART_REGION_YEONGDO_QUAY@@',
};
