# Photo template

Builds the Photo view's template (`js/photo-assets.js`) from a mock-up photo (`base.jpg`).

```bash
pip install opencv-python-headless numpy
python cutout.py   # player vs background  -> fg.png
python prep.py     # parts + shading        -> out/labels.png, out/shade.png (+ vis_*.png to check)
python pack.py     # -> ../../js/photo-assets.js
```

`prep.py` traces each part (body, sleeves, collar, pants, socks, glove backs and cuffs, helmet) with
outlines and colour rules, removes the stripes and logos that were painted on, and stores the
fabric shading. Outlines are in photo pixels; adjust them there if a part edge looks off.
Where stripes, the crest and numbers sit on the photo is set in `GEO` in `js/photo.js`.

To use a different mannequin photo you would redo the outlines in `prep.py` and the positions in `GEO`.
