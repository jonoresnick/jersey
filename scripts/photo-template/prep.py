"""Step 2: turn the mock-up photo into a recolourable template. Run from this folder.

Outputs (in out/):
  labels.png  - which part each pixel belongs to (0 = keep the photo), extended a few
                pixels past each part's edge so soft edges have something to blend
  shade.png   - R = fabric shading (0..1), G = sheen/highlight (0..1)
  edge.png    - R = coverage (soft edge alpha), G = 255 where two parts meet
  clean.jpg   - the photo with the old uniform's edge halo removed from the background
  vis_*.png   - debug views
"""
import os
import numpy as np, cv2
from scipy import ndimage

img = cv2.imread('base.jpg')
H, W = img.shape[:2]
rgb = img[:, :, ::-1].astype(np.float32) / 255
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
L = 0.299 * R + 0.587 * G + 0.114 * B
mx, mn = rgb.max(-1), rgb.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
hue = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 0].astype(np.float32) * 2
yy, xx = np.mgrid[0:H, 0:W]

LABEL = dict(keep=0, torso=1, sleeveL=2, sleeveR=3, collar=4, pants=5, socks=6, gloves=7, glovesTrim=8, helmet=9)


def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


yellow = (sat > 0.35) & (hue > 25) & (hue < 65) & (L > 0.25)
white = (sat < 0.14) & (L > 0.33)
dark = L < 0.2
bg_like = (sat < 0.06) & (L > 0.5) & (L < 0.72)

# ---------------- player cut-out ----------------
fg = cv2.imread('fg.png', 0) > 127
# Fill holes in the cut-out (dark numbers and logos were read as background),
# but not real gaps of background, like the one between the arm and the body.
inv = (~fg).astype(np.uint8)
n, cc = cv2.connectedComponents(inv)
border = set(np.unique(np.concatenate([cc[0], cc[-1], cc[:, 0], cc[:, -1]])))
for k in range(1, n):
    if k in border:
        continue
    m = cc == k
    if L[m].mean() < 0.4 or sat[m].mean() > 0.2:
        fg |= m

lab = np.zeros((H, W), np.uint8)
assigned = np.zeros((H, W), bool)


def put(mask, name, need_fg=True):
    global assigned
    m = mask & ~assigned & (fg if need_fg else True)
    lab[m] = LABEL[name]
    assigned |= m


# ---------------- parts that stay as photo ----------------
# Stick (measured edges: the shaft runs y≈641–662, rising toward the blade)
stick = poly_mask([(176, 639), (760, 635), (880, 621), (960, 591), (1052, 506), (1062, 524), (972, 612), (880, 646), (760, 661), (176, 666)])
assigned |= stick
# Neck and head inside the collar
neck = poly_mask([(318, 120), (452, 120), (444, 212), (446, 228), (437, 243), (410, 252), (380, 254), (350, 248), (330, 230), (319, 211)])
collar_ring = neck & ~poly_mask([(333, 214), (350, 232), (373, 240), (400, 243), (415, 237), (423, 222), (424, 205), (336, 205)])

# ---------------- helmet ----------------
helm = poly_mask([(298, 18), (472, 18), (470, 122), (452, 178), (433, 106), (400, 92), (350, 100), (336, 176), (303, 152)])
assigned |= helm & (L > 0.84)                # decals stay as photo
put(helm & ((L < 0.55) | (yy < 98)), 'helmet')
assigned |= helm

# ---------------- collar ----------------
put(collar_ring & (yy >= 211), 'collar', need_fg=False)
assigned |= neck

# ---------------- gloves ----------------
gl = poly_mask([(68, 540), (90, 520), (150, 512), (188, 516), (208, 540), (212, 718), (66, 718)]) | \
     poly_mask([(598, 600), (650, 546), (712, 546), (748, 598), (766, 640), (762, 710), (636, 710), (594, 652)])
# Bare sleeve showing inside the glove outline belongs to the sleeve.
gl &= ~(white & (sat < 0.1) & (L > 0.55) & ((yy < 545) | ((xx > 590) & (yy < 600) & (xx < 650))))
palm = gl & (sat > 0.12) & (sat < 0.45) & (hue > 20) & (hue < 55) & (L > 0.5) & ~((sat > 0.18) & (L < 0.85) & (yy < 600))
logo = gl & (sat < 0.25) & (L > 0.66)
put(gl & (sat > 0.18) & (hue > 25) & (hue < 65) & (L > 0.3) & (L < 0.85) & ~palm, 'glovesTrim')
assigned |= palm | logo
put(gl & ~((sat < 0.06) & (L > 0.55) & (L < 0.75)), 'gloves')
assigned |= gl

# ---------------- socks, pants ----------------
socks_zone = (yy > 880) & ((xx < 370) | (xx > 415))
socks_poly = poly_mask([(222, 898), (345, 898), (338, 960), (332, 1010), (326, 1060), (320, 1122), (222, 1122), (213, 1045), (214, 960)]) | \
             poly_mask([(440, 900), (553, 900), (552, 990), (548, 1122), (450, 1122), (443, 1040)])
fg |= cv2.erode(socks_poly.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
put(socks_zone & ~((yy < 912) & dark), 'socks')

# Pants outline measured from the photo (edge rows every 15 px).
pants_zone = poly_mask([(225, 683), (225, 690), (220, 705), (217, 720), (216, 750), (214, 780), (212, 810), (210, 840), (209, 870), (207, 885), (208, 898),
                        (365, 902), (367, 885), (369, 870), (372, 840), (376, 810), (380, 780), (384, 765), (389, 757),
                        (393, 765), (397, 780), (402, 795), (405, 810), (409, 825), (411, 840), (414, 855), (417, 870), (419, 885), (421, 905),
                        (560, 905), (558, 885), (567, 870), (565, 840), (563, 810), (559, 780), (554, 750), (550, 720), (546, 690), (545, 683)])
fg |= pants_zone
pants_logos = poly_mask([(276, 828), (326, 828), (326, 880), (276, 880)]) | poly_mask([(478, 830), (572, 812), (572, 860), (478, 874)])
put(pants_zone & ~(white & (yy > 880)), 'pants')

# ---------------- sleeves and body ----------------
left_edge = [(300, 212), (262, 285), (246, 360), (238, 430), (238, 470), (214, 520), (200, 548), (196, 720), (0, 720), (0, 0), (300, 0)]
right_edge = [(470, 212), (506, 272), (520, 340), (526, 420), (527, 540), (535, 560), (536, 720), (1098, 720), (1098, 0), (470, 0)]
put(poly_mask(left_edge) & (yy < 680) & (xx > 66), 'sleeveL')
put(poly_mask(right_edge) & (yy < 680) & (xx < 668), 'sleeveR')
put((yy < 700) & (yy > 200) & (xx > 200) & (xx < 548), 'torso')

# Drop specks: tiny islands of a part are almost always mislabelled pixels.
for name, v in LABEL.items():
    if not v:
        continue
    m = (lab == v).astype(np.uint8)
    k, comp, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    for i in range(1, k):
        if stats[i, cv2.CC_STAT_AREA] < 40:
            lab[comp == i] = 0

# ---------------- shading ----------------
D = np.zeros((H, W), np.float32)
S = np.zeros((H, W), np.float32)
fabric = np.isin(lab, [LABEL[k] for k in ('torso', 'sleeveL', 'sleeveR', 'collar', 'socks')])
D[fabric & white] = R[fabric & white]

# Yellow bands: scale each band so it matches the white fabric around it.
n, comp = cv2.connectedComponents((fabric & yellow).astype(np.uint8))
for k in range(1, n):
    m = comp == k
    if m.sum() < 30:
        continue
    ring = cv2.dilate(m.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool) & ~m & fabric & white
    gain = np.median(R[ring]) / max(np.median(R[m]), 1e-3) if ring.sum() > 20 else 1.0
    D[m] = np.clip(R[m] * gain, 0, 1)

# Everything else on the fabric (black stripes, logos, crest, numbers) gets filled in.
fill = fabric & ~((white | yellow) & (D > 0))
patch = np.zeros((H, W), np.uint8)
cv2.ellipse(patch, (403, 433), (98, 100), 0, 0, 360, 1, -1)
for x0, y0, x1, y1 in [(300, 292, 370, 322), (436, 296, 470, 326), (470, 290, 512, 336), (386, 248, 430, 278), (140, 280, 225, 368), (548, 285, 600, 380)]:
    patch[y0:y1, x0:x1] = 1
fill |= patch.astype(bool) & fabric
fill = cv2.dilate(fill.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))).astype(bool) & fabric
D8 = (np.clip(D, 0, 1) * 255).astype(np.uint8)
known = fabric & ~fill
seed = D8.astype(np.float32) * known
blur = cv2.GaussianBlur(seed, (0, 0), 25)
wgt = cv2.GaussianBlur(known.astype(np.float32), (0, 0), 25)
rough = np.where(wgt > 1e-3, blur / np.maximum(wgt, 1e-3), 200).astype(np.uint8)
D8 = np.where(known, D8, rough)
D8 = cv2.inpaint(D8, fill.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
rng = np.random.default_rng(3)
D_f = D8.astype(np.float32) / 255
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.8) * 0.012
D_f = np.where(fill, D_f + grain, D_f)
D = np.where(fabric, D_f, D)


# Dark gear (pants, glove backs, helmet): diffuse shading from the outline,
# the photo's highlights kept as sheen.
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
    edge = np.clip(dist / 26, 0, 1) ** 0.6
    big = cv2.GaussianBlur(Lp * m, (0, 0), 18) / np.maximum(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 18), 1e-3)
    lo, hi = np.percentile(big[m], 5), np.percentile(big[m], 97)
    broad = np.clip((big - lo) / max(hi - lo, 1e-3), 0, 1)
    side = 1 - 0.18 * np.clip((xx - xx[m].min()) / max(np.ptp(xx[m]), 1), 0, 1)
    Dd = (0.5 + 0.38 * broad + 0.12) * (0.55 + 0.45 * edge) * side
    sheen = np.clip(Lp - base_floor - 0.03 * Dd, 0, 1)
    broad_sheen = cv2.GaussianBlur(sheen, (0, 0), 9)
    sheen = np.clip(0.35 * broad_sheen + 0.75 * (sheen - broad_sheen) + 0.25 * sheen, 0, 1)
    Dd = Dd * (1 + 0.9 * broad_sheen)
    D[m] = np.clip(Dd[m], 0, 1)
    S[m] = sheen[m]


pants_logo = (lab == LABEL['pants']) & ((L > 0.3) | yellow) & pants_logos
dark_part(['pants'], logo_fill=pants_logo)
dark_part(['gloves'])
dark_part(['helmet'], base_floor=0.03)
gt = lab == LABEL['glovesTrim']
D[gt] = np.clip(R[gt] / 0.98, 0, 1)

# ---------------- soft edges ----------------
edit = lab > 0
# Smooth the staircase out of each part's outline, then make a 1.5 px soft edge.
soft = cv2.GaussianBlur(edit.astype(np.float32), (0, 0), 1.1)
alpha = np.clip((soft - 0.5) * 1.9 + 0.5, 0, 1)
# Where a part meets a photo part that has its own crisp edge (stick, palm, logos,
# helmet decals, neck), keep the hard mask on the photo side.
keep_parts = stick | (gl & ~edit) | (helm & ~edit) | neck
alpha = np.where(keep_parts & ~edit, 0, alpha)
alpha = np.where(edit & ~cv2.dilate((~edit).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool), 1, alpha)

# Each pixel near an edge needs a part to borrow colour and shading from: use the nearest part pixel.
_, (iy, ix) = ndimage.distance_transform_edt(~edit, return_indices=True)
lab_ext = lab[iy, ix]
D_ext = D[iy, ix]
S_ext = S[iy, ix]
lab_ext[alpha <= 0] = 0

# Pixels where two different parts meet get a light blur in the browser.
seam = np.zeros((H, W), bool)
for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
    a = lab_ext
    b = np.roll(np.roll(lab_ext, dy, 0), dx, 1)
    seam |= (a > 0) & (b > 0) & (a != b)
seam = cv2.dilate(seam.astype(np.uint8), np.ones((2, 2), np.uint8)).astype(bool)

# Clean background: the old uniform's light edge pixels bleed into the background
# around the outline; repaint that thin ring from the background further out.
ring = cv2.dilate(edit.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool) & ~edit & ~keep_parts & ~fg
hole = (edit | ring).astype(np.uint8) * 255
clean = cv2.inpaint(img, hole, 6, cv2.INPAINT_TELEA)
clean = np.where((edit | ring)[..., None], clean, img)

# ---------------- write ----------------
os.makedirs('out', exist_ok=True)
shade = np.zeros((H, W, 3), np.uint8)
shade[..., 2] = (np.clip(D_ext, 0, 1) * 255).astype(np.uint8)
shade[..., 1] = (np.clip(S_ext, 0, 1) * 255).astype(np.uint8)
cv2.imwrite('out/shade.png', shade)
cv2.imwrite('out/labels.png', lab_ext)
edge_img = np.zeros((H, W, 3), np.uint8)
edge_img[..., 2] = (alpha * 255).astype(np.uint8)
edge_img[..., 1] = seam.astype(np.uint8) * 255
cv2.imwrite('out/edge.png', edge_img)
cv2.imwrite('out/clean.jpg', clean, [cv2.IMWRITE_JPEG_QUALITY, 92])

pal = np.array([[0, 0, 0], [230, 80, 80], [80, 200, 80], [80, 80, 230], [240, 240, 60], [200, 80, 200], [60, 220, 220], [250, 150, 50], [150, 250, 150], [120, 120, 255]], np.uint8)
vis = (img * 0.45 + pal[lab][:, :, ::-1] * 0.55).astype(np.uint8)
cv2.imwrite('vis_labels.png', vis)
cv2.imwrite('vis_D.png', (np.clip(D_ext, 0, 1) * 255).astype(np.uint8))
cv2.imwrite('vis_alpha.png', (alpha * 255).astype(np.uint8))
print({k: int((lab == v).sum()) for k, v in LABEL.items()})
