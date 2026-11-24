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
- `js/photo.js`, `js/photo-assets.js`: repaint the mannequin photo with the design
- `js/render.js`: flat jersey drawing (template thumbnails and the back view)
- `scripts/photo-template/`: builds the photo template from a mock-up image
- `labs/`: the earlier studio-style UI and an experimental 3D player (not used by the site)

## Editing

Almost everything is plain data in `js/data.js`: add a template, scheme, stripe set or font there. Add a pattern in `js/patterns.js`. Colour values are a palette slot (`"p0"` to `"p4"`) or a fixed hex.

Designs and saved designs live in the visitor's browser (`localStorage`).
