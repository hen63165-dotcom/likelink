"""Remove a small print or embroidery mark from a drawn picture (the cast is never shown
with letters or logos): only the mark's own pixels inside the box are inpainted from the
fabric around them (OpenCV Telea), so the knit and shading stay. Check the result by eye.

  pip install opencv-python-headless
  python clean_marks.py IMG x0 y0 x1 y1 [threshold]   # threshold: lower catches fainter marks
"""
import sys
import cv2
import numpy as np
path, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
thr = float(sys.argv[6]) if len(sys.argv) > 6 else 10
img = cv2.imread(path, cv2.IMREAD_COLOR)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
bg = cv2.GaussianBlur(gray, (0, 0), 5)
detail = np.abs(gray - bg)
mask = np.zeros(gray.shape, np.uint8)
sub = (detail[y0:y1, x0:x1] > thr).astype(np.uint8) * 255
mask[y0:y1, x0:x1] = sub
mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
out = cv2.inpaint(img, mask, 6, cv2.INPAINT_TELEA)
cv2.imwrite(path, out)
print(path, (x0, y0, x1, y1), "pixels inpainted:", int((mask > 0).sum()))
