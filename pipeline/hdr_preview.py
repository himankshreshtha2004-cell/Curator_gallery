import bpy, numpy as np, sys
from PIL import Image
src, dst, exp = sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
im = bpy.data.images.load(src); w, h = im.size
px = np.empty(w*h*4, np.float32); im.pixels.foreach_get(px); px = px.reshape(h, w, 4)[::-1, :, :3] * exp
print(src, 'mean', px.mean(), 'p99', np.percentile(px, 99))
x = px / (1 + px); x = np.clip(x, 0, 1) ** (1/2.2)
Image.fromarray((x*255).astype(np.uint8)).save(dst)
