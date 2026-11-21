"""Tileable PBR textures (albedo / normal / roughness) made with periodic FFT noise, so they repeat seamlessly."""
import numpy as np
from PIL import Image
import os, sys
N = int(os.environ.get('TEX_N', 2048))
OUT = os.environ.get('TEX_OUT', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1204)
fx = np.fft.fftfreq(N)[None, :]; fy = np.fft.fftfreq(N)[:, None]

def noise(beta, sx=1.0, sy=1.0, lo=0.0, hi=0.5):
    """1/f^beta noise; sx/sy stretch (anisotropy); band-limited to [lo, hi] cycles/pixel. Periodic => tileable."""
    w = rng.standard_normal((N, N))
    f = np.sqrt((fx * sx) ** 2 + (fy * sy) ** 2); f[0, 0] = 1
    amp = 1 / f ** beta
    band = (np.abs(fx) <= hi) & (np.abs(fy) <= hi) & (f >= lo)
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * amp * band))
    out -= out.mean(); out /= (out.std() + 1e-9)
    return out

def hex2(c): return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
def srgb_to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def save_rgb(name, lin):
    Image.fromarray((lin_to_srgb(lin) * 255 + 0.5).astype(np.uint8)).save(f"{OUT}/{name}.jpg", quality=92)
def save_gray(name, g):
    Image.fromarray((np.clip(g, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f"{OUT}/{name}.jpg", quality=92)
def save_normal(name, h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.dstack([-dx, dy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(f"{OUT}/{name}_n.png", optimize=True)
def tint(base_hex, field, amt):
    """multiplicative value variation around a base colour, done in linear space"""
    b = srgb_to_lin(hex2(base_hex))
    return b[None, None, :] * (1 + amt * field[..., None])

# --- warm plaster walls: broad cloudy mottling + trowel marks + fine grain
big = noise(2.2, lo=0.0015, hi=0.08); mid = noise(1.6, sx=1.0, sy=2.5, lo=0.004, hi=0.2); fine = noise(0.6, lo=0.05)
f = 0.55 * big + 0.3 * mid + 0.15 * fine
alb = tint("#D8CFC2", f, float(os.environ.get('PLASTER_AMT', 0.03)))
alb[..., 0] *= 1 + 0.012 * big; alb[..., 2] *= 1 - 0.015 * big      # slight warm/cool drift
save_rgb("plaster", alb)
save_normal("plaster", 0.5 * mid + 0.35 * fine + 0.2 * big, 0.9)
save_gray("plaster_r", 0.86 + 0.05 * fine - 0.03 * mid)

# --- light polished concrete floor: soft mottling, tiny aggregate, burnished sheen variation
big = noise(2.0, lo=0.001, hi=0.06); mid = noise(1.3, lo=0.006, hi=0.25); fine = noise(0.2, lo=0.15)
agg = (noise(0.0, lo=0.12) > 2.6).astype(float) - (noise(0.0, lo=0.12) > 2.9).astype(float) * 1.4
f = 0.6 * big + 0.28 * mid + 0.06 * fine + 0.12 * agg
save_rgb("concrete", tint("#BDB6AD", f, 0.07))
save_normal("concrete", 0.2 * mid + 0.3 * fine + 0.5 * agg, 1.2)
save_gray("concrete_r", 0.42 + 0.08 * big + 0.04 * mid)

# --- travertine plinths: horizontal veining bands + small pits
band = noise(2.4, sx=1.0, sy=0.08, lo=0.002, hi=0.2)        # long horizontal strata
streak = noise(1.2, sx=1.0, sy=0.15, lo=0.01, hi=0.4)
pitsfield = noise(0.0, lo=0.08)
pits = np.clip((pitsfield - 2.5) * 1.2, 0, 1)
f = 0.55 * band + 0.3 * streak + 0.15 * noise(0.5, lo=0.05)
alb = tint("#D2C6B4", f, 0.075) * (1 - 0.35 * pits[..., None])
save_rgb("travertine", alb)
save_normal("travertine", 0.35 * streak - 2.5 * pits + 0.2 * noise(0.5, lo=0.1), 1.6)
save_gray("travertine_r", 0.78 + 0.1 * pits + 0.03 * streak)

# --- pale limestone for the sculptures: fine grain + faint strata lines
strata = noise(2.0, sx=1.0, sy=0.05, lo=0.003, hi=0.3)
grain = noise(0.4, lo=0.08)
f = 0.5 * strata + 0.25 * noise(1.8, lo=0.002, hi=0.05) + 0.25 * grain
save_rgb("limestone", tint("#D9D0C2", f, 0.06))
save_normal("limestone", 0.25 * strata + 0.6 * grain, 1.0)
save_gray("limestone_r", 0.8 + 0.04 * grain)

# --- sandstone details (bases, door frame): warmer, grainier
grain = noise(0.3, lo=0.06); cloud = noise(2.0, lo=0.002, hi=0.06)
save_rgb("sandstone", tint("#C7B8A5", 0.6 * cloud + 0.4 * grain, 0.07))
save_normal("sandstone", 0.8 * grain + 0.2 * cloud, 1.4)
save_gray("sandstone_r", 0.86 + 0.04 * grain)

# --- artwork canvas: off-white gesso with faint brushed texture
brush = noise(1.4, sx=1.0, sy=0.12, lo=0.004, hi=0.3)
save_rgb("canvas", tint("#E9E1D3", 0.7 * brush + 0.3 * noise(0.3, lo=0.1), 0.04))
save_normal("canvas", brush, 0.8)
print("textures done")
