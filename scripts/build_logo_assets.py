#!/usr/bin/env python3
"""Derive the shipped logo assets in frontend/public/ from the source PNG.

Build-time only. Requires Pillow, which is NOT part of the app's runtime
requirements (it never runs in the FastAPI process or in CI's make verify):
install it into a throwaway venv and run this script by hand whenever the
source art changes.

    python3 -m venv .venv && .venv/bin/pip install pillow
    .venv/bin/python3 scripts/build_logo_assets.py

Input: assets/brand/patternsofplaylogo.png (1024x1024, solid red background,
navy shield, gold five-star arc, red maple leaf, green grass base, white
"PATTERNS OF PLAY" wordmark below the shield). The background is a near
uniform red (samples run roughly #C61C1A..#CA1E1E with a soft gradient
toward the corners) that must NOT be blindly colour-keyed across the whole
canvas: two other things in the source are red too and must survive.

  - The maple leaf fill and the shield's inner ring are a deliberate, large,
    fully-enclosed red shape sitting inside the navy shield outline.
  - Less obviously: the white wordmark letters (both the arc on the shield
    and the freestanding line below it) are drawn ON TOP of the red field,
    so the background red is still visible, unchanged, inside every closed
    letter counter (the hole in a P, R, A, O). Keying by border-reachability
    alone leaves those red islands opaque, since the white stroke encloses
    and disconnects them from the outer background, which reads as a
    scatter of red blobs where letters should be.

Approach: connected-component colour keying, not a plain border flood fill.
1. Classify every pixel as "background-like" purely by colour distance to
   the sampled background red (COLOR_THRESH), no connectivity yet.
2. Group those pixels into 4-connected components (pure Python BFS: the
   source is small enough, ~1e6 px, that this runs in a few seconds).
3. A component becomes transparent if it touches the image border (that is
   the actual background field, however the gradient shades it) OR if it is
   small (SMALL_COMPONENT_MAX px). Small-and-enclosed is the letter-counter
   case above: nothing else in the art is both red-like and that small. The
   leaf fill and the shield ring are red-like too but are thousands of
   pixels and never touch the border, so this rule leaves them opaque.
4. Erode the resulting mask by one 3x3 MIN filter pass and Gaussian-blur it
   a fraction of a pixel, so the cut edge is antialiased instead of a hard
   1-bit stairstep. Step 1 already reclassified most of the soft red-to-art
   antialiasing blend as background (a generous COLOR_THRESH), so this last
   erosion pass only needs to mop up a residual pixel or two, not carry the
   whole edge the way a naive hard key would.

Verify by opening the PNGs in build/logo_review/ (composited over both a
near-black and a near-white square) after a run.
"""

from __future__ import annotations

import pathlib
from collections import deque

from PIL import Image, ImageFilter

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "assets" / "brand" / "patternsofplaylogo.png"
PUBLIC = REPO_ROOT / "frontend" / "public"
REVIEW_DIR = REPO_ROOT / "build" / "logo_review"

# Generous: the background has a soft gradient toward the corners and the
# art-to-background edge is itself a soft multi-pixel blend (this is
# generated art, not a crisp vector cutout), so a tight threshold leaves a
# visible red-orange rim once composited on a non-red surface. Safe to be
# generous here because step 3 above (the size/border-touching rule), not
# this threshold, is what keeps the leaf and ring opaque.
COLOR_THRESH = 100
# Trapped letter counters run well under a hundred pixels at this art's
# text size; the leaf fill and shield ring are tens of thousands of pixels.
# Wide margin between the two, so this does not need to be precise.
SMALL_COMPONENT_MAX = 1500
ERODE_PASSES = 1
FEATHER_RADIUS = 0.6  # soft edge, small enough to stay crisp at 28-40px

# Icon colour used to flatten the apple-touch-icon (transparency renders as
# solid black on iOS home screens, so that variant needs an opaque backing).
# Matches the shield navy sampled from the source art (also T-071's
# --shield-navy brand constant); this is a baked pixel in a raster icon
# asset, not a themed UI component, so it is exempt from the "tokens only"
# rule (there is no CSS variable a <link rel="icon"> file can consume).
ICON_BACKDROP = (22, 48, 79)


def load_source() -> Image.Image:
    return Image.open(SOURCE).convert("RGB")


def sample_background_ref(rgb: Image.Image) -> tuple[int, int, int]:
    """Median colour of the four image edges: robust to the gradient and to
    the odd stray art pixel that happens to touch the border."""
    px = rgb.load()
    w, h = rgb.size
    samples = []
    for x in range(0, w, 5):
        samples.append(px[x, 0])
        samples.append(px[x, h - 1])
    for y in range(0, h, 5):
        samples.append(px[0, y])
        samples.append(px[w - 1, y])
    rs = sorted(s[0] for s in samples)
    gs = sorted(s[1] for s in samples)
    bs = sorted(s[2] for s in samples)
    mid = len(samples) // 2
    return (rs[mid], gs[mid], bs[mid])


def remove_background(rgb: Image.Image) -> Image.Image:
    """Colour-key the red background to transparent via connected
    components (see module docstring): catches both the outer field and
    the red trapped inside closed wordmark letterforms, without touching
    the leaf fill or the shield's inner ring. Returns RGBA."""
    w, h = rgb.size
    px = rgb.load()
    bg_ref = sample_background_ref(rgb)
    thresh2 = COLOR_THRESH * COLOR_THRESH

    candidate = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            dr, dg, db = r - bg_ref[0], g - bg_ref[1], b - bg_ref[2]
            if dr * dr + dg * dg + db * db <= thresh2:
                candidate[row + x] = 1

    visited = bytearray(w * h)
    bg_mask = bytearray(w * h)
    for start in range(w * h):
        if not candidate[start] or visited[start]:
            continue
        comp = [start]
        visited[start] = 1
        sy, sx = divmod(start, w)
        touches_border = sx == 0 or sy == 0 or sx == w - 1 or sy == h - 1
        q = deque([start])
        while q:
            cur = q.popleft()
            cy, cx = divmod(cur, w)
            for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    nidx = ny * w + nx
                    if candidate[nidx] and not visited[nidx]:
                        visited[nidx] = 1
                        comp.append(nidx)
                        q.append(nidx)
                        if nx == 0 or ny == 0 or nx == w - 1 or ny == h - 1:
                            touches_border = True
        if touches_border or len(comp) <= SMALL_COMPONENT_MAX:
            for idx in comp:
                bg_mask[idx] = 1

    alpha = Image.frombytes("L", (w, h), bytes(255 * (1 - b) for b in bg_mask))

    for _ in range(ERODE_PASSES):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER_RADIUS))

    out = Image.new("RGBA", (w, h))
    out.paste(rgb, (0, 0))
    out.putalpha(alpha)
    return out


def bbox_in_rows(rgba: Image.Image, row_start: int, row_end: int, alpha_thresh: int = 16):
    """Tight (left, top, right, bottom) box of opaque pixels within
    [row_start, row_end), scanning only the given row window so a crop can
    exclude, e.g., the grass base or wordmark that sit below it."""
    px = rgba.load()
    w = rgba.width
    left, top, right, bottom = w, row_end, 0, row_start
    for y in range(row_start, row_end):
        for x in range(w):
            if px[x, y][3] > alpha_thresh:
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
    return (left, top, right + 1, bottom + 1)


def find_grass_start_row(rgba: Image.Image, row_start: int, row_end: int) -> int:
    """First row (top to bottom) where grass-green pixels appear: green
    channel clearly, substantially dominant over red and blue (a wide
    margin, not just green being the largest of three close values). Shield
    navy/gold, the red ring/leaf, and critically the near-white antialiased
    edges of the wordmark banner arced across the shield (those are near
    neutral grays where green can win by a couple of units on rounding
    noise alone) all fail this; only real grass-green passes. Used to crop
    the nav/favicon mark above the grass base."""
    px = rgba.load()
    w = rgba.width
    for y in range(row_start, row_end):
        hits = 0
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 16 and g - r > 20 and g - b > 15 and r < 120:
                hits += 1
                if hits > 5:
                    return y
    return row_end


def pad(box, amount, size):
    left, top, right, bottom = box
    w, h = size
    return (
        max(0, left - amount),
        max(0, top - amount),
        min(w, right + amount),
        min(h, bottom + amount),
    )


def save_png(im: Image.Image, path: pathlib.Path, quantize: int | None = 64) -> int:
    """RGBA source art has almost no compression-friendly repetition (the
    feathered alpha edge alone produces thousands of near-unique RGBA
    tuples), so a straight optimize=True save of the full lockup came out
    at ~390KB. Quantizing to a small palette first (FASTOCTREE preserves
    per-pixel alpha, unlike the default P-mode single-transparent-index
    palette) is the only size lever available without ImageMagick/cwebp,
    and gets every shipped file comfortably under the 40KB target with no
    visible banding at these sizes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    out = im
    if quantize and im.mode == "RGBA":
        out = im.quantize(colors=quantize, method=Image.FASTOCTREE, dither=Image.NONE)
    out.save(path, format="PNG", optimize=True, compress_level=9)
    return path.stat().st_size


def composite_review(im: Image.Image, name: str) -> None:
    im = im.convert("RGBA")
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for label, bg in (("dark", (18, 18, 20)), ("light", (245, 245, 240))):
        canvas = Image.new("RGB", im.size, bg)
        canvas.paste(im, (0, 0), im)
        canvas.save(REVIEW_DIR / f"{name}-on-{label}.png")


def main() -> None:
    rgb = load_source()
    rgba = remove_background(rgb)
    w, h = rgba.size

    # Full art bounding box (stars, shield, grass, wordmark): matches the
    # founder-measured box (x 162..864, y 154..954 on the 1024x1024 source)
    # to within the flood-fill's own edge trim.
    full_box = pad(bbox_in_rows(rgba, 0, h), 6, (w, h))

    # Shield + star-arc only, excluding the grass base and the wordmark
    # below it (nav rail mark and favicon source): crop above the row
    # where grass green first appears.
    grass_row = find_grass_start_row(rgba, full_box[1], full_box[3])
    shield_box = pad(bbox_in_rows(rgba, full_box[1], grass_row), 6, (w, h))

    full_lockup = rgba.crop(full_box)
    shield_mark = rgba.crop(shield_box)

    # 1. Full lockup, transparent background: shield + stars + grass +
    # wordmark, for the sign-in screen. Downscaled from the ~700x800
    # native crop to a size that still renders crisply at typical sign-in
    # display widths (roughly 240-320 CSS px) at 2x density.
    lockup_w = 640
    lockup_h = round(full_lockup.height * (lockup_w / full_lockup.width))
    full_lockup_out = full_lockup.resize((lockup_w, lockup_h), Image.LANCZOS)
    size_lockup = save_png(full_lockup_out, PUBLIC / "logo-lockup.png")

    # 2. Shield mark, transparent background, nav rail (28-40px render).
    # Shipped at 2x and 3x density per a ~48px logical size so the browser
    # never has to upscale, and never has to downscale a 1024px source.
    mark_sizes = {"96": 96, "144": 144}
    mark_out_bytes = {}
    for label, target_h in mark_sizes.items():
        target_w = round(shield_mark.width * (target_h / shield_mark.height))
        resized = shield_mark.resize((target_w, target_h), Image.LANCZOS)
        mark_out_bytes[label] = save_png(resized, PUBLIC / f"shield-mark-{label}.png")

    # 3. Favicon set. Same shield+stars crop (consistent brand mark across
    # nav rail and browser tab); at 16px the star arc mostly dissolves into
    # texture but the navy shield silhouette and the red leaf keep it
    # readable, which is what a favicon needs to survive at that size.
    favicon_sizes = [16, 32, 48]
    favicon_bytes = {}
    for size in favicon_sizes:
        target_w = round(shield_mark.width * (size / shield_mark.height))
        resized = shield_mark.resize((target_w, size), Image.LANCZOS)
        # Favicons are square; center the (narrower than tall) shield mark
        # on a transparent square canvas so it isn't squashed.
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
        favicon_bytes[size] = save_png(canvas, PUBLIC / f"favicon-{size}.png")

    # apple-touch-icon: opaque backing (iOS renders transparency as black),
    # shield mark centered with ~12% padding on the shield-navy backdrop.
    touch_size = 180
    pad_frac = 0.12
    inner_h = round(touch_size * (1 - 2 * pad_frac))
    inner_w = round(shield_mark.width * (inner_h / shield_mark.height))
    if inner_w > touch_size * (1 - 2 * pad_frac):
        inner_w = round(touch_size * (1 - 2 * pad_frac))
        inner_h = round(shield_mark.height * (inner_w / shield_mark.width))
    resized_touch = shield_mark.resize((inner_w, inner_h), Image.LANCZOS)
    touch_canvas = Image.new("RGBA", (touch_size, touch_size), ICON_BACKDROP + (255,))
    touch_canvas.paste(
        resized_touch,
        ((touch_size - inner_w) // 2, (touch_size - inner_h) // 2),
        resized_touch,
    )
    size_touch = save_png(touch_canvas.convert("RGB"), PUBLIC / "apple-touch-icon.png")

    # Review composites (not shipped, gitignored build/ dir): eyeball the
    # background key over both a near-black and a near-white ground.
    composite_review(full_lockup_out, "logo-lockup")
    composite_review(Image.open(PUBLIC / "shield-mark-144.png"), "shield-mark")
    composite_review(Image.open(PUBLIC / "favicon-32.png"), "favicon-32")

    print(f"logo-lockup.png: {size_lockup} bytes ({lockup_w}x{lockup_h})")
    for label, target_h in mark_sizes.items():
        print(f"shield-mark-{label}.png: {mark_out_bytes[label]} bytes")
    for size in favicon_sizes:
        print(f"favicon-{size}.png: {favicon_bytes[size]} bytes")
    print(f"apple-touch-icon.png: {size_touch} bytes ({touch_size}x{touch_size})")
    print(f"Review composites written to {REVIEW_DIR}")


if __name__ == "__main__":
    main()
