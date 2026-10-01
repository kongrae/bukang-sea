/* Shared, optional art. Gameplay never waits for a network image or changes on load failure. */
const SHARK_ART = (() => {
  const images = {}, tinted = new Map();
  const urls = { hero: '@@ART_HERO@@', portrait: '@@ART_PORTRAIT@@', swim: '@@ART_SWIM@@' };
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
    get(name, skin) {
      const original = images[name];
      if (!original || !original.naturalWidth) return null;
      if (!skin?.body || name === 'hero') return original;
      const key = name + ':' + skin.id;
      if (tinted.has(key)) return tinted.get(key);
      const layer = document.createElement('canvas');
      layer.width = original.naturalWidth; layer.height = original.naturalHeight;
      const ctx = layer.getContext('2d');
      ctx.drawImage(original, 0, 0);
      // Color blend preserves the highlights, ivory belly and sculpted volume.
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
