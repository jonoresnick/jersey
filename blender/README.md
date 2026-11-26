# Hockey player model

`build_player.py` builds the player from scratch with Blender's own Python, with no add-ons, and writes `out/`:

- `hockey_player.blend`: open it in Blender to look at it or edit it
- `hockey_player.glb`: the model for the website (glTF 2.0)
- `render_white.png`, `render_kit.png`: test renders (plain white, and a dark kit to check the parts)

Run it with the Blender app:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/build_player.py
```

or with the `bpy` package (`pip install bpy`): `python blender/build_player.py`. Set `RENDER=0` to skip the renders, `SAMPLES=128` for cleaner ones.

Each part is a separate, plain white object named as in the brief: `jersey_body`, `sleeve_left`, `sleeve_right`, `collar`, `pants_shell`, `pants_belt`, `sock_left`, `sock_right`, the glove pieces, skate pieces, helmet pieces, stick pieces, `visor` and `mannequin`. Fabric parts have UVs wrapped around them: u = 0.25 is the front centre and 0.75 the back centre, v runs from the hem or cuff (0) up to the top (1), so stripes stay straight. Metres, Z up, facing -Y, skates on the ground.

This is a simple, procedural stand-in, built from smooth tubes rather than sculpted cloth. It's good for testing the website end to end; a modelled player with real folds would replace it with the same part names.

## Putting a model on the website (the 3D view)

`export_web.py` turns a player `.blend` into `js/model-assets.js`, which the designer's **3D** button shows:

```bash
BLEND=blender/hockey_player_alternate.blend OUT=js/model-assets.js python blender/export_web.py
```

It opens the file with scripts turned off, converts the text numbers and curve stitching to meshes, uses Blender's built-in font where a font isn't on this computer, leaves subdivision off (`LV=1` keeps one level), drops the backdrop, lights and cameras, and embeds a `.glb` with every object and material name kept.

`js/viewer3d.js` then traces the model: the `TRACE` table matches each object name and material name to a colour zone in the designer (`jersey_body` + `Jersey_Yellow` is the jersey, the black material on the same sleeve is the main stripe, `sock_*` + `Fabric_Black` is the sock stripe, and so on). Skin, steel, the visor and tape keep their own colour. A new model only needs its names added to that table.

The alternate model has no UVs on the jersey, sleeves or socks, so stripes are wherever the modeller painted that material; the designer can recolour them but can't move them or add patterns, crests, names or the back number. A model with UVs (see the brief above) would let the designer's stripe and logo artwork wrap onto the fabric.
