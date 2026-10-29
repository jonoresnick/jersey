# Hockey Uniform Builder

Design a full hockey uniform (jersey front and back, pants, socks and helmet) in the browser.
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

- **Home / Away / Third**: three kits share one team palette, crest, player name and number. Each kit has its own style and colour mapping.
- **Template**: 12 starting points (Original Six, Heritage Yoke, Chevron, Arena Fade, Camo Night, and more). Applying one keeps your team colours, lettering and crest. *Light (away)* swaps Primary and Secondary to make a white road sweater.
- **Colours**: five team colours plus 12 ready-made schemes. Every part of the uniform (body, sleeves, yoke, each stripe, pattern, collar, laces, number and outlines, name, crest, pants, socks, helmet) links to a team colour or a fixed custom colour. Change a team colour and every linked part updates on all kits.
- **Click anything in the preview** to recolour it directly.
- **Stripes & patterns**: collar style, shoulder yoke (shape, depth, trim), hem and sleeve stripes (style, height, size), and 12 patterns with size, position, strength and coverage.
- **Name & number**: 8 number fonts, single or double outline, arched name, sleeve and helmet numbers, captain's C or A. A contrast check warns when the number is hard to read against the body.
- **Crest**: roundel, shield, wordmark, initials, or upload your own logo; shoulder patches.
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
Drawing lives in `js/render.js`; controls, state and export in `js/app.js`.

| File | Contents |
|---|---|
| `index.html` | Page layout and controls (`data-bind="path"` links a control to the design) |
| `css/style.css` | Styles, light and dark themes |
| `js/data.js` | Templates, schemes, stripes, fonts, colour zones |
| `js/color.js` | Colour helpers and zone colour lookup |
| `js/patterns.js` | Jersey patterns |
| `js/render.js` | SVG for jersey, pants, socks, helmet and export sheets |
| `js/app.js` | State, undo/redo, controls, colour picker, export |
