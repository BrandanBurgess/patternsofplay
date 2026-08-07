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


def find_grass_end_row(rgba: Image.Image, row_start: int, row_end: int) -> int:
    """Last row (top to bottom) with grass-green pixels, scanning downward
    from find_grass_start_row's result toward the bottom of the source
    art. Everything below this row is the freestanding flat "PATTERNS OF
    PLAY" wordmark banner, not the grass base: a caller that wants "shield
    + stars + grass, no wordmark" crops here instead of at full_box's
    bottom (see the T-070 follow-up: that flat wordmark is white text with
    no backing once the red field is keyed out, illegible on light theme
    grounds, so the lockup drops it and lets the shield's own arched
    lettering carry the name instead)."""
    px = rgba.load()
    w = rgba.width
    last = row_start
    for y in range(row_start, row_end):
        hits = 0
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 16 and g - r > 20 and g - b > 15 and r < 120:
                hits += 1
                if hits > 5:
                    last = y
                    break
    return last


def row_extents(rgba: Image.Image, alpha_thresh: int = 16):
    """Per-row (min_x, max_x) of opaque pixels, or None for an empty row.
    One O(w*h) pass so find_shield_top_row can answer "what would the
    windowed bbox width be starting at row y" in O(1) per row instead of
    rescanning every pixel for every candidate row."""
    px = rgba.load()
    w, h = rgba.size
    extents: list[tuple[int, int] | None] = [None] * h
    for y in range(h):
        left = right = None
        for x in range(w):
            if px[x, y][3] > alpha_thresh:
                if left is None:
                    left = x
                right = x
        if left is not None:
            extents[y] = (left, right)
    return extents


def find_shield_top_row(extents, top: int, grass_row: int) -> int:
    """First row (top to bottom) at which the shield's own silhouette has
    reached its stable full width: the row above which the windowed bbox
    [row, grass_row) would still be widened by the star arc and the two
    small decorative maple-leaf sprigs that flank it. Those cannot be
    separated from the shield by colour or a simple connected-component
    pass (in the source art the centre star's point and the sprigs touch
    the shield's shoulders, so all of it is one connected opaque blob,
    same shape as the trapped-letter problem remove_background's
    docstring describes for the wordmark). Reference width is measured
    just above the grass line, where only the shield itself can possibly
    still be present; walking down from the top of the art until the
    windowed width settles to that reference finds the row where the
    stars and sprigs drop out of the window. Used only to build a
    stars-free favicon crop (T-070 follow-up: the star arc dissolves into
    noise at 16px). The nav rail mark and apple-touch-icon keep the star
    arc and are unaffected."""
    ref_top = max(top, grass_row - 80)
    suffix_min: list[int | None] = [None] * grass_row
    suffix_max: list[int | None] = [None] * grass_row
    cur_min = cur_max = None
    for y in range(grass_row - 1, top - 1, -1):
        e = extents[y]
        if e is not None:
            l, r = e
            cur_min = l if cur_min is None else min(cur_min, l)
            cur_max = r if cur_max is None else max(cur_max, r)
        suffix_min[y] = cur_min
        suffix_max[y] = cur_max
    ref_min, ref_max = suffix_min[ref_top], suffix_max[ref_top]
    if ref_min is None:
        return top
    ref_width = ref_max - ref_min
    for y in range(top, grass_row):
        if suffix_min[y] is None:
            continue
        if suffix_max[y] - suffix_min[y] <= ref_width + 2:
            return y
    return top


def largest_red_component(rgba: Image.Image):
    """4-connected component analysis (see remove_background) restricted
    to red-dominant pixels, returns (mask, mean_colour) for the LARGEST
    such component. In the source art this is always the solid maple-leaf
    fill: the only other red-dominant shape at this scale is the thin
    ring circumscribing it, which despite its long perimeter has far
    fewer pixels (a stroke, not a fill) and is never the largest
    component. Classified by "red dominant over green and blue" rather
    than distance to one sampled reference pixel, so this keeps working
    if the art's exact red hue ever shifts."""
    w, h = rgba.size
    px = rgba.load()
    candidate = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 16 and r - g > 40 and r - b > 40 and r > 100:
                candidate[row + x] = 1

    visited = bytearray(w * h)
    best: list[int] = []
    for start in range(w * h):
        if not candidate[start] or visited[start]:
            continue
        visited[start] = 1
        comp = [start]
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
        if len(comp) > len(best):
            best = comp

    mask = bytearray(w * h)
    r_total = g_total = b_total = 0
    for idx in best:
        mask[idx] = 1
        y, x = divmod(idx, w)
        pr, pg, pb, _ = px[x, y]
        r_total += pr
        g_total += pg
        b_total += pb
    n = max(len(best), 1)
    mean_color = (r_total // n, g_total // n, b_total // n)
    return Image.frombytes("L", (w, h), bytes(255 * v for v in mask)), mean_color


def build_favicon_mini(crop: Image.Image) -> Image.Image:
    """Flatten a shield-only crop to two flat colours for the 16px favicon
    (T-070 follow-up): shield navy everywhere the source has any opacity,
    with only the leaf's own connected component (largest_red_component)
    painted back on top in its own colour. Drops the gold border, the
    thin red ring and the arched "PATTERNS OF PLAY" lettering: none of
    that fine detail survives resampling to 16px, it just reads as
    grey-brown noise (see the shipped-before comparison in the follow-up
    report), so the mini favicon ships only the two shapes that actually
    do survive at that size."""
    w, h = crop.size
    px = crop.load()
    alpha_mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 16:
                alpha_mask[y * w + x] = 1
    leaf_mask, leaf_color = largest_red_component(crop)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    alpha_im = Image.frombytes("L", (w, h), bytes(255 * v for v in alpha_mask))
    navy_layer = Image.new("RGBA", (w, h), ICON_BACKDROP + (255,))
    out.paste(navy_layer, (0, 0), alpha_im)
    leaf_layer = Image.new("RGBA", (w, h), leaf_color + (255,))
    out.paste(leaf_layer, (0, 0), leaf_mask)
    return out


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
    # below it (nav rail mark and apple-touch-icon source): crop above the
    # row where grass green first appears.
    grass_row = find_grass_start_row(rgba, full_box[1], full_box[3])
    shield_box = pad(bbox_in_rows(rgba, full_box[1], grass_row), 6, (w, h))

    # Shield + stars + grass, excluding the flat wordmark banner below the
    # grass (T-070 follow-up, defect 1): that banner is white text with no
    # backing once the red field is keyed out, near-invisible on the
    # board theme's light background. The shield's own arched "PATTERNS OF
    # PLAY" lettering, white on navy, carries the name instead and reads
    # on any ground.
    grass_end = find_grass_end_row(rgba, grass_row, full_box[3])
    lockup_box = pad(bbox_in_rows(rgba, full_box[1], grass_end), 6, (w, h))

    # Shield only, no star arc and no decorative leaf sprigs (T-070
    # follow-up, defect 2): the star arc dissolves into noise at 16px, so
    # the favicon crops tighter than the nav rail mark. See
    # find_shield_top_row's docstring for why this needs its own row scan
    # instead of reusing shield_box's top.
    favicon_top = find_shield_top_row(row_extents(rgba), full_box[1], grass_row)
    favicon_box = pad(bbox_in_rows(rgba, favicon_top, grass_row), 4, (w, h))

    full_lockup = rgba.crop(lockup_box)
    shield_mark = rgba.crop(shield_box)
    favicon_detail = rgba.crop(favicon_box)
    favicon_mini = build_favicon_mini(favicon_detail)

    # 1. Full lockup, transparent background: shield + stars + grass for
    # the sign-in screen (no flat wordmark banner, see above). Downscaled
    # from the native crop to a size that still renders crisply at typical
    # sign-in display widths (roughly 240-320 CSS px) at 2x density.
    lockup_w = 640
    lockup_h = round(full_lockup.height * (lockup_w / full_lockup.width))
    full_lockup_out = full_lockup.resize((lockup_w, lockup_h), Image.LANCZOS)
    size_lockup = save_png(full_lockup_out, PUBLIC / "logo-lockup.png")

    # 2. Shield mark, transparent background, nav rail (28-40px render).
    # Shipped at 2x density for a ~28-32px logical size (a 3x device needs
    # 84-96px, which this already covers), so a single asset is enough:
    # no srcSet, no second candidate nobody's viewport can ever select
    # (T-070 follow-up, defect 3: that used to be shield-mark-144.png).
    mark_out_bytes = save_png(
        shield_mark.resize(
            (round(shield_mark.width * (96 / shield_mark.height)), 96), Image.LANCZOS
        ),
        PUBLIC / "shield-mark-96.png",
    )

    # 3. Favicon set (T-070 follow-up, defect 2). Two sizes, not three:
    # nothing in this app requests a 48px favicon (no manifest.json, no
    # browserconfig.xml tile), so it was dead weight the same way
    # shield-mark-144 was. 16px is designed for, not downsampled to: the
    # flattened navy-shield-plus-leaf mark (favicon_mini) is what actually
    # survives that small; 32px keeps the full engraved detail (gold
    # border, ring, arched lettering), which is legible at that size.
    favicon_sources = {16: favicon_mini, 32: favicon_detail}
    favicon_bytes = {}
    for size, source in favicon_sources.items():
        target_w = round(source.width * (size / source.height))
        resized = source.resize((target_w, size), Image.LANCZOS)
        # Favicons are square; center the (narrower than tall) mark on a
        # transparent square canvas so it isn't squashed.
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
        favicon_bytes[size] = save_png(canvas, PUBLIC / f"favicon-{size}.png")

    # favicon.ico (T-070 follow-up, defect 2): Chrome requests
    # /favicon.ico at the document root by habit even when <link
    # rel="icon"> is present, and that request 404ed with nothing at that
    # path. Built from the same flattened mini mark as favicon-16.png (an
    # ICO's job here is just to resolve that implicit request cleanly; a
    # modern browser prefers the <link>-declared PNGs for the actual tab
    # icon whenever they're present). Square canvas first so Pillow's
    # multi-size ICO writer downsamples without distorting the aspect
    # ratio.
    ico_canvas_size = 64
    ico_target_w = round(favicon_mini.width * (ico_canvas_size / favicon_mini.height))
    ico_resized = favicon_mini.resize((ico_target_w, ico_canvas_size), Image.LANCZOS)
    ico_master = Image.new("RGBA", (ico_canvas_size, ico_canvas_size), (0, 0, 0, 0))
    ico_master.paste(
        ico_resized, ((ico_canvas_size - ico_resized.width) // 2, 0), ico_resized
    )
    ico_path = PUBLIC / "favicon.ico"
    ico_master.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32)])
    size_ico = ico_path.stat().st_size

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
    composite_review(Image.open(PUBLIC / "shield-mark-96.png"), "shield-mark")
    composite_review(Image.open(PUBLIC / "favicon-32.png"), "favicon-32")
    composite_review(Image.open(PUBLIC / "favicon-16.png"), "favicon-16")

    print(f"logo-lockup.png: {size_lockup} bytes ({lockup_w}x{lockup_h})")
    print(f"shield-mark-96.png: {mark_out_bytes} bytes")
    for size in sorted(favicon_sources):
        print(f"favicon-{size}.png: {favicon_bytes[size]} bytes")
    print(f"favicon.ico: {size_ico} bytes")
    print(f"apple-touch-icon.png: {size_touch} bytes ({touch_size}x{touch_size})")
    print(f"Review composites written to {REVIEW_DIR}")


if __name__ == "__main__":
    main()
