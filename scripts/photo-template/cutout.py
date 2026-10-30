"""Step 1: separate the player from the background (writes fg.png). Run from this folder."""
import numpy as np, cv2

img = cv2.imread('base.jpg')
h, w = img.shape[:2]
mask = np.full((h, w), cv2.GC_BGD, np.uint8)
# Rough outline of the player (probable foreground)
poly = np.array([(300, 15), (470, 15), (470, 200), (540, 230), (610, 330), (660, 540), (760, 560), (760, 720), (640, 720), (600, 690), (570, 700),
                 (570, 910), (560, 1122), (430, 1122), (420, 910), (400, 820), (390, 910), (355, 1122), (210, 1122), (205, 900), (200, 720),
                 (60, 720), (60, 520), (90, 420), (200, 240), (300, 215)], np.int32)
cv2.fillPoly(mask, [poly], cv2.GC_PR_FGD)
# Areas that are certainly uniform
for x0, y0, x1, y1 in [(250, 260, 500, 640), (230, 700, 380, 880), (440, 700, 560, 880), (230, 920, 330, 1100), (455, 920, 540, 1100),
                       (330, 40, 440, 170), (100, 560, 180, 690), (640, 600, 720, 690)]:
    mask[y0:y1, x0:x1] = cv2.GC_FGD
cv2.line(mask, (185, 655), (1045, 515), int(cv2.GC_PR_FGD), 26)
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
cv2.imwrite('fg.png', np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8))
