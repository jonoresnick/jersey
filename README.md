# Digital Jersey

Design a hockey jersey and see it on a player. Built to look and work like Digital Stick: one page, hash routes, no build step.

| Route | Page |
| --- | --- |
| `#home` | Hero, how it works, the twelve templates |
| `#design` | The designer: kit, template, team colours, stripes, pattern, collar, name and number, logos, pants and socks |
| `#explore` | Twelve starter designs in different colour schemes, plus your saved designs |

## Run it

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`node scripts/build-single.mjs` writes `dist/hockey-uniform-builder.html`, one file with everything inlined.

## Files

- `index.html`: markup for every page
- `css/site.css`: layout and styles (same tokens as Digital Stick)
- `js/site.js`: routing, design state, controls, saving and export
- `js/data.js`: templates, colour schemes, stripe sets, fonts, colour zones, the example team
- `js/patterns.js`: jersey patterns
- `js/effects.js`: stripe effects (patterns on stripes, deboss and emboss) and the built-in helper
- `js/cutout.js`: logo background removal
- `netlify/functions/ai-effect.mjs`: the AI helper's server side
- `js/photo.js`, `js/photo-assets.js`: repaint the mannequin photo with the design
- `js/render.js`: flat jersey drawing (template thumbnails and the back view)
- `scripts/photo-template/`: builds the photo template from a mock-up image
- `labs/`: the earlier studio-style UI and an experimental 3D player (not used by the site)

## Scenes and poses

The Scene section puts the player on the ice, in an arena, on a team-colour backdrop, or on a transparent background (PNG export keeps the transparency). Scenes are drawn in `js/scenes.js`; add one there and a label in `UB.SCENES` (`js/data.js`).

Poses are a list, `UB.POSES`, in `js/photo.js`. Only one is defined today, so the Pose buttons stay hidden. Each pose is `{ id, label, assets, geo }`:

- `assets`: what `scripts/photo-template` makes from a mock-up photo (`base`, `maps`, `edge`, `cut`, `width`, `height`), saved as a file like `js/pose-skating.js`.
- `geo`: where stripes, crest, numbers and logos sit on that photo, in the same shape as `GEO` at the top of `js/photo.js`.

Load the new file in `index.html` before `js/photo.js` and push the pose onto `UB.POSES`. A Pose row of buttons then appears under Scene.

## AI help

**Stripe effects** (Design, Stripe effects). Pick a stripe, then describe what you want, such as "debossed stars on the main stripe" or "raised gold diagonal lines on the sock stripe", and press Ask AI. The result fills the same controls you can use by hand (pattern, finish, size, spacing, angle, colour), so it is always editable. Effects are plain data in `js/effects.js`; a new pattern is one shape there.

The page sends the sentence to `/api/ai-effect` (`netlify/functions/ai-effect.mjs`), which asks Claude for settings in a fixed format. The browser checks the answer again, so a bad reply can't break the page. If the service isn't connected, or fails, a built-in helper reads common words ("stars", "deboss", "gold", "diagonal") so the feature still works.

To turn the AI on:

1. Deploy to Netlify (no build command; it reads `netlify.toml` and `package.json`).
2. In Netlify, add the environment variable `ANTHROPIC_API_KEY`.
3. In the Anthropic console, set a monthly spend limit. The function also limits each visitor to 12 requests a minute, but that limit resets when the function restarts, so the spend limit is the real safeguard.

**Logo cut-out.** When someone uploads a logo with a plain background (a JPG, say), a dialog offers to remove it and shows the result on a checkerboard. It finds the background colour from the image edge and removes matching areas connected to the edge, so white inside the logo stays. Sliders set how much to remove and how soft the edge is, and "Pick background colour" lets you click the background. It runs in the browser and works best on a plain background. Photos with busy backgrounds need a dedicated background remover first.

## Phones

On a narrow screen the header shrinks while designing, the preview stays pinned at the top, and the options are swipeable tabs (Style, Stripes, Text and logos, Pants and socks, Each part). Pinch to zoom the preview, drag to pan, double-tap to zoom, and swipe sideways to flip between front and back.

## Editing

Almost everything is plain data in `js/data.js`: add a template, scheme, stripe set or font there. Add a pattern in `js/patterns.js`. Colour values are a palette slot (`"p0"` to `"p4"`) or a fixed hex.

Designs and saved designs live in the visitor's browser (`localStorage`).
