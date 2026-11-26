# Digital Jersey

Design a hockey jersey and see it on a player. Built to look and work like Digital Stick: one page, hash routes, no build step.

| Tab | Route | What it is |
| --- | --- | --- |
| Home | `#home` | The designer, laid out like a music app's now-playing screen: the player photo fills the screen and fades into a colour taken from the photo, with a blurred copy behind it. The header, tools, tabs, controls and Save/Share bar float on frosted glass. On phones the photo sits at the top and fades into the tabs and controls, with a floating glass menu at the bottom. This is the landing page. |
| Explore | `#explore` | Twelve starter designs in different colour schemes |
| Saved designs | `#saved` | Your team's saved designs, with folders, search and version history |
| Assets | `#assets` | The team's logos (crests, sponsors, patches) and brand colours |
| Account | `#account` | Your profile, your team and its members, password, your data |
| (no tab) | `#signin`, `#signup`, `#view/…` | Log in, sign up, and a private reveal page opened from a share link |

Assets belong to the team, not to one person, so everyone on the team shares the same logos. On the Home tab, each logo box has "From assets" and "Save to assets".

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
- `js/api.js`: the data layer (local version), `js/share.js`: share links, `js/social.js`: posts and video, `js/saas.js`: the account, library, team and reveal pages
- `js/photo.js`, `js/photo-assets.js`: repaint the mannequin photo with the design
- `js/render.js`: flat jersey drawing (template thumbnails and the back view)
- `scripts/photo-template/`: builds the photo template from a mock-up image
- `js/viewer3d.js`, `js/model-assets.js`, `js/vendor/`: the 3D view (three.js r147). The Blender model is traced part by part to the colour zones; see `blender/README.md`
- `labs/`: the earlier studio-style UI and an experimental procedural 3D player (not used by the site)

## Accounts, teams and sharing

**This is a browser-only demo.** Accounts, teams and designs are saved in the browser's storage, so they don't follow anyone to another device, and passwords are only as safe as that browser. Nothing is sent anywhere.

What works:

- **Accounts:** sign up, log in, profile, change password, download or delete your data. Signing up creates a team of your own.
- **Teams:** each account can be in several teams with a role: owner, editor or viewer. Owners invite people by email and get an invite code to send them; the invited person signs up with that email and enters the code. Viewers can look but not change or delete.
- **Saved designs:** designs saved to a team, with folders, search, rename, duplicate, delete and a history of up to 25 versions per design (restore any of them).
- **Assets and brand colours:** a team library of logos, with a clean-up step for JPGs on plain backgrounds, plus brand colours, team name and default crest and sponsor that new designs start with.
- **Private share links:** a link holds a snapshot of the design inside it. Add a password and the design is encrypted (AES-GCM), so it can't be opened without it. Add a "hidden until" date and the page shows a countdown. The date is checked by the page itself, so it keeps honest people honest but isn't a guarantee. Links can't be switched off once sent.
- **Social posts:** PNG posts in five sizes (4:5, square, story, wide, X/Facebook) with a headline, footer and background, for one kit or all three, and a reveal video (WebM) that fades through each kit.

All pages talk to `UB.api` (`js/api.js`), which lists the methods a real backend must provide. To go live, write another object with the same methods on top of a database and a sign-in service, and assign it to `UB.api`; the pages don't change. Things that need that server: sign-in from any device, Google sign-in, real embargoes, revoking links, fan voting and billing.

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
