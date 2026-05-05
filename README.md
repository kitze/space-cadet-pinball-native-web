# Space Cadet Pinball Native Web

Native browser port seed for `k4zmu2a/SpaceCadetPinball`.

No WebAssembly, no Emscripten, no native bridge. The web target is plain HTML, CSS, Canvas, TypeScript modules, and generated bitmap assets:

- `src/dat.ts` ports the `PARTOUT(4.0)RESOURCE` loader so `PINBALL.DAT`, `CADET.DAT`, or `DEMO.DAT` can be decoded in the browser.
- `src/tableModel.ts` ports the table/object manifest lookup enough to extract the original background, table bitmap, collision walls, bumpers, flippers, ball radius, plunger point, and projection matrix.
- `src/physics.ts` is a native TypeScript pinball simulation layer.
- `src/collisionMask.ts` uses the generated collision-guide bitmap as a pixel collision mask for the imagegen fallback table.
- `src/renderer.ts` renders the table on Canvas and keeps the HUD in DOM.
- `assets/generated/playfield.png` is the complete generated playfield currently used by the fallback table.
- `assets/generated/playfield-underlay.png` and `assets/generated/playfield-occluders-alpha.png` are experimental below/above ball layers.
- `assets/generated/collision-guide-v1.png` is the imagegen-assisted collision tracing guide.
- `assets/sprites/` contains separate moving/interactive transparent PNG sprites.
- `asset-prompts.md` documents the imagegen prompts used for the project assets.

Run it:

```sh
npm install
npm run dev
```

Then open `http://127.0.0.1:5177`.

Build it:

```sh
npm run build
```

The repository does not include the original Microsoft resource files, so the app boots into an asset-clean fallback table. Load a local `PINBALL.DAT` or `CADET.DAT` with the `DAT` control to render the original assets locally in your browser.

Status: prototype. The imagegen fallback is intentionally experimental and not yet a faithful 1:1 physics port.
