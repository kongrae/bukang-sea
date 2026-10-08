# Chapter 7 artwork (pending original)

Chapter 7 · 영도 물양장 (`yeongdo-quay`) was added 2026-10-09 with the drifting crate device.

- **Current card is temporary.** `../regions/yeongdo-quay.webp` (720 × 480, WebP quality 78) is cut from the existing chapter-5 original `../content-refresh-v1/north-harbor.png`: source rectangle x 0, y 96, 1200 × 800, mirrored horizontally, drawn into a 720 × 480 canvas in headless Chrome and exported with `canvas.toDataURL('image/webp', 0.78)`. It reuses the dock and moored boat so the card reads as a quay. No new image was generated.
- **To replace it:** save the generated original here as `yeongdo-quay.png` (1536 × 1024, 3:2). Add `['yeongdo-quay', 'chapter-scenes-v2']` to the sources in `tools/prepare-region-art.js`, then run `node tools/prepare-region-art.js <sharp path>`. That overwrites `../regions/yeongdo-quay.webp` under the same token, so no code change is needed.
- These are atmosphere illustrations, not playable maps. They do not change board palettes, rules, saves, stages or unlock conditions.

## Prompt

### 영도 물양장 — yeongdo-quay.png

Use case: stylized-concept. Asset type: a single finished chapter-selection environment illustration for the Korean mobile puzzle game Shark SOS. Create ONE standalone 3:2 landscape illustration, ideally 1536 x 1024, full bleed, opaque background.

Scene: Chapter 7, YEONGDO LIGHTER QUAY. A calm, sheltered working quay just past the sluice works, where small harbor boats tie up.
- A wide L-shaped aquamarine basin is edged by low smooth ivory quay walls with chunky white railings and a few rounded mooring bollards.
- Three or four empty, clean, light-brown wooden fish crates float gently on the water in the foreground and middle distance. They are rounded toy-like boxes with two or three visible plank lines and a thin white ripple ring at the waterline. They are clearly empty and tidy, never trash.
- A short wooden pier with a single small cream-and-orange harbor boat moored to it.
- One orange-and-white life ring on a quay post in the near corner, and a few neat green shrubs.
- In the distance, a gentle curved bridge silhouette and the open cobalt sea suggest that the journey continues beyond the quay.
- Focus on open water with the floating crates as playful obstacles. No cranes, no containers, no industrial clutter, no gates.

Style: polished bright 3D toy world, rounded tactile silicone/plastic/painted ceramic shapes, smooth beveled edges, warm ivory architecture, blue accents and restrained orange life-saving equipment. Clear luminous aqua water with soft caustic patterns and small specular sparkles; detailed but calm, not photorealistic gritty texture.

Camera and light: medium-wide elevated three-quarter view, looking down a little from the quay toward the horizon. Upper 20 percent sunny azure sky, middle-distance structures, lower half inviting clear water. Soft warm daylight, airy shadows and ambient occlusion, small puffy clouds, friendly optimistic mood.

Composition: consistent premium mobile game environment art, not a UI screenshot. All important scenery stays within the central 85 percent to survive rounded card clipping.

Exclusions: no humans, no animals or sharks, no text, letters, numerals, signage, logo, watermark, border, collage, panels, or UI. Do not draw a playable grid.

Consistency: make this image feel from the same set as bright aqua canals with ivory railings, orange-and-white life rings and rounded white-and-blue sluice towers.
