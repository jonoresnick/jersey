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
