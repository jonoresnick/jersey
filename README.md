# Hockey Uniform Builder

Design a full hockey uniform in the browser and see it rendered like a product mock-up: a hanging jersey with folds, fabric texture, stitching and raised twill lettering, plus a full player with helmet and visor, gloves, pants, socks, skates and stick.
Pick a template, set your team colours, then change any stripe, pattern, collar, crest, name or number.
Everything runs locally; nothing is uploaded.

## Run it

Open `index.html` in a browser. That's it, no install or build step.

To host it as one file (GitHub Pages, email, a shared drive):

```bash
node scripts/build-single.mjs
```

This writes `dist/hockey-uniform-builder.html` with all CSS and JS inlined.

## Using it

- **Views**: *Photo* repaints a real mannequin photo with your design: jersey, sleeves, collar, pants, socks, glove backs and cuffs, and helmet all take your colours, stripes and crest while keeping the photo's folds and gloss. *Player* shows the full kit on a drawn player, front and back. *Jersey* shows the sweater front and back like a product photo. *Flat sheet* is a flat technical drawing.
- **Home / Away / Third**: three kits share one team palette, crest, player name and number. Each kit has its own style and colour mapping.
- **Template**: 12 starting points (Original Six, Heritage Yoke, Chevron, Arena Fade, Camo Night, and more). Applying one keeps your team colours, lettering and crest. *Light (away)* swaps Primary and Secondary to make a white road sweater.
- **Colours**: five team colours plus 12 ready-made schemes. Every part of the uniform (body, sleeves, yoke, each stripe, pattern, collar, laces, number and outlines, name, crest, pants, socks, helmet) links to a team colour or a fixed custom colour. Change a team colour and every linked part updates on all kits.
- **Click anything in the preview** to recolour it directly.
- **Stripes & patterns**: collar style, shoulder yoke (shape, depth, trim), hem and sleeve stripes (style, height, size), and 12 patterns with size, position, strength and coverage.
- **Name & number**: 8 number fonts, single or double outline, arched name, sleeve and helmet numbers, captain's C or A. A contrast check warns when the number is hard to read against the body.
- **Crest**: roundel, shield, wordmark, initials, or upload your own logo; shoulder patches.
- **Logos on the photo**: upload images for the left and right chest, the collar, and each pants leg (Crest tab).
- **Pants & gear**: pants stripes, sock stripes, crest on the pants leg, and the stick. Helmet, gloves, skates and stick each have their own colours.
- **Export & save**: PNG of one kit or all three, SVG, save/open a design file, or copy/paste design code. Undo and redo with Ctrl+Z / Ctrl+Shift+Z. Your work autosaves in the browser.

## Editing the builder

All options are plain data in **`js/data.js`**, so most changes don't touch any logic:

| To add or change… | Edit |
|---|---|
| A colour scheme | `UB.SCHEMES` |
| A template | `UB.TEMPLATES` (style settings plus which palette slot goes where) |
| A stripe layout | `UB.STRIPE_SETS` (bands with position, thickness and colour) |
| A number font | `UB.FONTS` (any Google Font; also add it to the font link in `index.html`) |
| The example team | `UB.SAMPLE` |

Colour values are either a palette slot (`"p0"` Primary … `"p4"` Extra) or a fixed hex like `"#56623B"`.

New patterns go in **`js/patterns.js`**: each is a small function that returns SVG in jersey coordinates.
Flat drawing lives in `js/render.js`, the realistic jersey and player in `js/realistic.js`, and controls, state and export in `js/app.js`.

### How the Photo view works

`js/photo-assets.js` holds the mannequin photo plus a map of which part each pixel belongs to and how lit it is. `js/photo.js` draws your design flat for each part, then multiplies it by that lighting, so any colour or stripe gets the photo's real folds. Positions of stripes, crest and numbers on the photo are in `GEO` at the top of `js/photo.js`. The template is built by the scripts in `scripts/photo-template/` (see its README).

### How the realistic look works

`js/realistic.js` draws the design as flat artwork, then adds lighting layers on top, the way mock-up tools do. Each piece (body, sleeves, pants, socks, gloves, skates, helmet) gets a height map made from its outline plus fold "ridges". An SVG filter turns that into light and shadow from the upper left, blended with hard-light so it shades white and dark fabric equally. Crease shadows, highlights, a woven-fabric texture, shoulder mesh, stitching and a raised twill effect on letters and crests go on top. The shading never depends on colour, so every template and colour gets the same treatment. To change the drape, edit the `TORSO_RIDGES`, `SLEEVE_RIDGES` and crease lists near the top of the file.

| File | Contents |
|---|---|
| `index.html` | Page layout and controls (`data-bind="path"` links a control to the design) |
| `css/style.css` | Styles, light and dark themes |
| `js/data.js` | Templates, schemes, stripes, fonts, colour zones |
| `js/color.js` | Colour helpers and zone colour lookup |
| `js/patterns.js` | Jersey patterns |
| `js/render.js` | Flat SVG for jersey, pants, socks, helmet and export sheets |
| `js/realistic.js` | Realistic jersey and player renders, lighting and export sheets |
| `js/photo.js` | Photo view: repaints the mannequin photo with the design |
| `js/photo-assets.js` | Photo template (generated; photo + part/lighting maps) |
| `scripts/photo-template/` | Scripts that build the photo template from a mock-up image |
| `js/app.js` | State, undo/redo, controls, colour picker, export |
