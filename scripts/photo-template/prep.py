"""Turn the mock-up photo into a recolourable template.

Outputs (in out/):
  labels.png  - one byte per pixel, which part of the uniform it belongs to (0 = keep photo)
  shade.png   - R = diffuse shading (0..1), G = additive sheen/highlight (0..1)
  vis_*.png   - debug views
"""
import json
import numpy as np, cv2

img = cv2.imread('base.jpg')
H, W = img.shape[:2]
rgb = img[:, :, ::-1].astype(np.float32) / 255
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
L = 0.299 * R + 0.587 * G + 0.114 * B
mx, mn = rgb.max(-1), rgb.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
hue = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 0].astype(np.float32) * 2  # degrees
fg = cv2.imread('fg.png', 0) > 127
# Fill holes in the cut-out (dark numbers and logos were read as background).
_inv = (~fg).astype(np.uint8)
_n, _cc = cv2.connectedComponents(_inv)
_border = set(np.unique(np.concatenate([_cc[0], _cc[-1], _cc[:, 0], _cc[:, -1]])))
fg = fg | (~np.isin(_cc, list(_border)) & (_inv > 0))

LABEL = dict(keep=0, torso=1, sleeveL=2, sleeveR=3, collar=4, pants=5, socks=6, gloves=7, glovesTrim=8, helmet=9)

def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)

yy, xx = np.mgrid[0:H, 0:W]
yellow = (sat > 0.35) & (hue > 25) & (hue < 65) & (L > 0.25)
white = (sat < 0.14) & (L > 0.33)
dark = L < 0.2

lab = np.zeros((H, W), np.uint8)
assigned = np.zeros((H, W), bool)
def put(mask, name):
    global assigned
    m = mask & ~assigned & fg
    lab[m] = LABEL[name]
    assigned |= m

# --- stick (keep the photo) ---
stick = np.zeros((H, W), np.uint8)
cv2.polylines(stick, [np.array([(176, 657), (700, 646), (880, 632), (960, 600), (1052, 516)], np.int32)], False, 1, 22)
stick = stick.astype(bool) & (sat < 0.2) & (L > 0.1) & (L < 0.62)
assigned |= stick & (yy > 600)

# --- helmet ---
helm = poly_mask([(298, 18), (472, 18), (470, 122), (452, 178), (433, 106), (400, 92), (350, 100), (336, 176), (303, 152)])
dec = helm & (L > 0.84)                      # decals stay as photo
assigned |= dec
put(helm & ((L < 0.55) | (yy < 98)), 'helmet')
assigned |= helm                             # rest of the head area is the mannequin

# --- gloves ---
gl = poly_mask([(68, 540), (90, 520), (150, 512), (188, 516), (208, 540), (212, 718), (66, 718)]) | \
     poly_mask([(598, 600), (650, 546), (712, 546), (748, 598), (766, 640), (762, 710), (636, 710), (594, 652)])
# Bare sleeve showing inside the glove outline (white fabric above the cuff) belongs to the sleeve.
gl &= ~(white & (sat < 0.1) & (L > 0.55) & ((yy < 545) | ((xx > 590) & (yy < 600) & (xx < 650))))
put(gl & (sat > 0.18) & (hue > 25) & (hue < 65) & (L > 0.3) & (L < 0.85), 'glovesTrim')
put(gl & (L < 0.2), 'gloves')
assigned |= gl                               # palm, logos, stick tape stay as photo

# --- collar band (dark trim around the neck) ---
col = poly_mask([(296, 200), (474, 200), (474, 262), (296, 262)])
put(col & (L < 0.22) & ~poly_mask([(388, 250), (428, 250), (428, 275), (388, 275)]), 'collar')
mannequin_neck = col & (sat < 0.1) & (L >= 0.22) & (L < 0.62)
assigned |= mannequin_neck & (yy < 236)

# --- socks, pants ---
socks_zone = (yy > 880) & ((xx < 370) | (xx > 415))
_socks_poly = poly_mask([(222, 898), (345, 898), (338, 960), (332, 1010), (326, 1060), (320, 1122), (222, 1122), (213, 1045), (214, 960)]) | poly_mask([(440, 900), (553, 900), (552, 990), (548, 1122), (450, 1122), (443, 1040)])
fg = fg | cv2.erode(_socks_poly.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
put(socks_zone & ~((yy < 912) & dark), 'socks')
# Pants outline measured from the photo (edge rows every 15 px).
pants_zone = poly_mask([(225, 683), (225, 690), (220, 705), (217, 720), (216, 750), (214, 780), (212, 810), (210, 840), (209, 870), (207, 885), (208, 898),
                        (365, 902), (367, 885), (369, 870), (372, 840), (376, 810), (380, 780), (384, 765), (389, 757),
                        (393, 765), (397, 780), (402, 795), (405, 810), (409, 825), (411, 840), (414, 855), (417, 870), (419, 885), (421, 905),
                        (560, 905), (558, 885), (567, 870), (565, 840), (563, 810), (559, 780), (554, 750), (550, 720), (546, 690), (545, 683)])
fg = fg | pants_zone   # the pants' light edges blend into the background, so trust the outline
pants_logos = poly_mask([(276, 828), (326, 828), (326, 880), (276, 880)]) | poly_mask([(478, 830), (572, 812), (572, 860), (478, 874)])
put(pants_zone & ~(white & (yy > 880)), 'pants')

# --- sleeves and body ---
left_edge = [(300, 212), (262, 285), (246, 360), (238, 430), (238, 470), (214, 520), (200, 548), (196, 720), (0, 720), (0, 0), (300, 0)]
right_edge = [(470, 212), (506, 272), (520, 340), (526, 420), (527, 540), (535, 560), (536, 720), (1098, 720), (1098, 0), (470, 0)]
put(poly_mask(left_edge) & (yy < 720) & (xx > 66), 'sleeveL')
put(poly_mask(right_edge) & (yy < 720) & (xx < 668), 'sleeveR')
put((yy < 700) & (yy > 200) & (xx > 200) & (xx < 548), 'torso')

# --- diffuse shading D and sheen S ---
D = np.zeros((H, W), np.float32)
S = np.zeros((H, W), np.float32)
fabric = np.isin(lab, [LABEL[k] for k in ('torso', 'sleeveL', 'sleeveR', 'collar', 'socks')])
D[fabric & white] = R[fabric & white]

# Yellow bands: scale each band so it matches the white fabric around it.
ycomp = (fabric & yellow).astype(np.uint8)
n, comp = cv2.connectedComponents(ycomp)
for k in range(1, n):
    m = comp == k
    if m.sum() < 30:
        continue
    ring = cv2.dilate(m.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool) & ~m & fabric & white
    gain = np.median(R[ring]) / max(np.median(R[m]), 1e-3) if ring.sum() > 20 else 1.0
    D[m] = np.clip(R[m] * gain, 0, 1)

# Everything else on the fabric (black stripes, logos, crest, numbers) gets filled in.
fill = fabric & ~((white | yellow) & (D > 0))
crest = np.zeros((H, W), np.uint8)
cv2.ellipse(crest, (403, 433), (98, 100), 0, 0, 360, 1, -1)
for box in [(300, 292, 370, 322), (436, 296, 470, 326), (470, 290, 512, 336), (386, 248, 430, 278), (140, 280, 225, 368), (548, 285, 600, 380)]:
    crest[box[1]:box[3], box[0]:box[2]] = 1
fill |= crest.astype(bool) & fabric
fill = cv2.dilate(fill.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))).astype(bool) & fabric
# Fill from the fabric only: seed non-fabric pixels with nearby fabric values first.
D8 = (np.clip(D, 0, 1) * 255).astype(np.uint8)
known = fabric & ~fill
seed = D8.copy()
seed[~known] = 0
# Rough fill of everything unknown, then a proper inpaint inside the holes.
blur = cv2.GaussianBlur(seed.astype(np.float32), (0, 0), 25)
wgt = cv2.GaussianBlur(known.astype(np.float32), (0, 0), 25)
rough = np.where(wgt > 1e-3, blur / np.maximum(wgt, 1e-3), 200).astype(np.uint8)
D8 = np.where(known, D8, rough)
D8 = cv2.inpaint(D8, fill.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
# Light noise so filled areas don't look airbrushed next to real fabric.
rng = np.random.default_rng(3)
D_f = D8.astype(np.float32) / 255
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.8) * 0.012
D_f = np.where(fill, D_f + grain, D_f)
D = np.where(fabric, D_f, D)

# Dark gear (pants, glove backs, helmet): build diffuse shading from the outline,
# and keep the photo's highlights as sheen.
def dark_part(names, base_floor=0.035, logo_fill=None):
    m = np.isin(lab, [LABEL[k] for k in names])
    if not m.any():
        return
    Lp = L.copy()
    if logo_fill is not None:
        hole = (logo_fill & m).astype(np.uint8) * 255
        Lp8 = cv2.inpaint((np.clip(Lp, 0, 1) * 255).astype(np.uint8), cv2.dilate(hole, np.ones((5, 5), np.uint8)), 7, cv2.INPAINT_TELEA)
        Lp = Lp8.astype(np.float32) / 255
    dist = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.clip(dist / 26, 0, 1) ** 0.6                        # rounded edges
    big = cv2.GaussianBlur(Lp * m, (0, 0), 18) / np.maximum(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 18), 1e-3)
    lo, hi = np.percentile(big[m], 5), np.percentile(big[m], 97)
    broad = np.clip((big - lo) / max(hi - lo, 1e-3), 0, 1)        # broad light from the photo's sheen
    side = 1 - 0.18 * np.clip((xx - xx[m].min()) / max(np.ptp(xx[m]), 1), 0, 1)  # light from the left
    Dd = (0.5 + 0.38 * broad + 0.12) * (0.55 + 0.45 * edge) * side
    sheen = np.clip(Lp - base_floor - 0.03 * Dd, 0, 1)
    # Broad bright panels read as paint on coloured fabric; keep fine highlights, soften broad ones.
    broad_sheen = cv2.GaussianBlur(sheen, (0, 0), 9)
    sheen = np.clip(0.35 * broad_sheen + 0.75 * (sheen - broad_sheen) + 0.25 * sheen, 0, 1)
    Dd = Dd * (1 + 0.9 * broad_sheen)   # the lit panel is lighter fabric, so brighten it as diffuse light instead
    D[m] = np.clip(Dd[m], 0, 1)
    S[m] = sheen[m]

pants_logo = (lab == LABEL['pants']) & ((L > 0.3) | yellow) & pants_logos
dark_part(['pants'], logo_fill=pants_logo)
dark_part(['gloves'])
dark_part(['helmet'], base_floor=0.03)

# Glove cuffs are yellow fabric: shading straight from the photo.
gt = lab == LABEL['glovesTrim']
D[gt] = np.clip(R[gt] / 0.98, 0, 1)

shade = np.zeros((H, W, 3), np.uint8)
shade[..., 2] = (np.clip(D, 0, 1) * 255).astype(np.uint8)      # BGR order: R channel = D
shade[..., 1] = (np.clip(S, 0, 1) * 255).astype(np.uint8)
import os
os.makedirs('out', exist_ok=True)
cv2.imwrite('out/shade.png', shade)
cv2.imwrite('out/labels.png', lab)

# Debug: labels in colour, and a test recolour.
pal = np.array([[0, 0, 0], [230, 80, 80], [80, 200, 80], [80, 80, 230], [240, 240, 60], [200, 80, 200], [60, 220, 220], [250, 150, 50], [150, 250, 150], [120, 120, 255]], np.uint8)
vis = (img * 0.45 + pal[lab][:, :, ::-1] * 0.55).astype(np.uint8)
cv2.imwrite('vis_labels.png', vis)
cv2.imwrite('vis_D.png', (np.clip(D, 0, 1) * 255).astype(np.uint8))
cv2.imwrite('vis_S.png', (np.clip(S * 3, 0, 1) * 255).astype(np.uint8))
print({k: int((lab == v).sum()) for k, v in LABEL.items()})
