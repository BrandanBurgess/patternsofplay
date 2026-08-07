#!/usr/bin/env python3
"""Palette check (T-071): the design system's two token layers stay apart,
and every colour pair that carries meaning clears WCAG AA.

Runs in `make verify` via the check-copy target, next to the em dash scan
and the seed validator, because it is the same kind of guard: a rule the
whole codebase depends on that no single component can enforce alone.

Three things are asserted, and every one of them is a bug this ticket had
to fix, so every one is worth failing the build over.

1. Both layers are complete in all three themes.
   --pitch-turf was REFERENCED by PitchMarkings.tsx and defined by nothing,
   so the board had no green of its own: it only looked like grass because
   the wrapper borrowed the chrome's --bg-stripe. A token referenced but
   never defined is exactly the failure mode this catches.

2. The board layer never resolves to a chrome value, and football surfaces
   never read a chrome colour token. If a future edit points --team-home
   back at --accent, or paints a lane with --red, this fails. The invariant
   is: changing --accent must not be able to change what the pitch or a
   lane looks like. (e2e/palette.spec.ts proves the same thing at runtime
   in a real browser, by overriding --accent and re-reading the pitch.)

3. WCAG AA on the pairs that carry meaning: 4.5:1 for text, 3:1 for
   graphics and borders. Computed, never eyeballed.
"""

import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
TOKENS_CSS = root / "frontend/src/styles/tokens.css"
BOARD_DIR = root / "frontend/src/board"

THEMES = ["pitch", "dark", "board"]

# Chrome: the application shell. --accent is the brand red and the only
# interactive colour, --warn is shield gold for advisories and read-only
# emphasis, --red is failure status and never fills a control.
CHROME_TOKENS = [
    "--bg",
    "--sidebar-bg",
    "--surface",
    "--text-primary",
    "--text-secondary",
    "--border",
    "--line",
    "--accent",
    "--accent-ink",
    "--glow",
    "--warn",
    "--on-warn",
    "--bg-warn",
    "--text-warn",
    "--red",
    "--bg-red",
    "--text-red",
]

# Board: a football pitch. Defined independently in every theme.
BOARD_TOKENS = [
    "--pitch-turf",
    "--pitch-stripe",
    "--pitch-line",
    "--token-face",
    "--team-home",
    "--team-away",
    "--ball",
    "--lane-suggested",
    "--lane-confirmed",
    "--lane-glow",
    "--lane-blocked",
    "--intercept",
    "--mark",
    "--zone",
    "--keystone",
    "--route-badge",
    "--route-badge-ink",
]

# Chrome colour tokens a board token must never equal. The neutrals are left
# out on purpose: a turf and a background may share a shade of nothing in
# particular, but a football colour must never BE the brand accent, its
# glow, the status red, or the advisory gold.
CHROME_COLOURS = ["--accent", "--glow", "--red", "--warn"]

# Selectors that draw the pitch itself. Chrome INSIDE the board panel (the
# toolbar, the view menu, the save bar) legitimately reads --accent; these
# do not. Each maps to the file it must live in.
FOOTBALL_SELECTORS = {
    "Board.css": [
        ".board-wrap",
        ".token-ball .token-face",
        ".lane-suggested",
        ".lane-confirmed",
        ".lane-blocked",
        ".lane-dot",
        ".mark-ring",
        ".mark-tight",
        ".zone-rect",
        ".zone-divider",
        ".zone-label",
        ".ball-trail",
        ".route-badge",
        ".route-badge-num",
    ],
    "PatternPreviewBoard.css": [
        ".rondo-zone-poly",
        ".rondo-zone-label",
    ],
}

# Text needs 4.5:1. --accent is a button LABEL colour as well as a button
# fill (global.css .ctl-ghost:hover, auth.css links, Board.css .restart-btn),
# so it is held to the text bar, not the graphics one.
TEXT_PAIRS = [
    ("--text-primary", "--bg"),
    ("--text-primary", "--surface"),
    ("--text-primary", "--sidebar-bg"),
    ("--text-secondary", "--bg"),
    ("--text-secondary", "--surface"),
    ("--accent", "--bg"),
    ("--accent", "--surface"),
    ("--accent-ink", "--accent"),
    ("--text-warn", "--bg"),
    ("--text-warn", "--surface"),
    ("--on-warn", "--warn"),
    ("--text-red", "--bg"),
    ("--text-red", "--surface"),
    # A player token's number sits on its face, and a number is text.
    ("--team-home", "--token-face"),
    ("--team-away", "--token-face"),
    ("--route-badge-ink", "--route-badge"),
]

# Graphics and borders need 3:1. Every mark on the pitch whose colour
# carries meaning, against the turf, plus the two chrome outlines that are
# the only non-text use of a status colour.
#
# --token-face against the turf is deliberately absent: it is the disc
# BEHIND a token, and a token is identified by its ring and its number,
# which are held to 3:1 against the turf and 4.5:1 against the face above.
GRAPHIC_PAIRS = [
    ("--team-home", "--pitch-turf"),
    ("--team-away", "--pitch-turf"),
    ("--ball", "--pitch-turf"),
    ("--pitch-line", "--pitch-turf"),
    ("--lane-suggested", "--pitch-turf"),
    ("--lane-confirmed", "--pitch-turf"),
    ("--lane-blocked", "--pitch-turf"),
    ("--intercept", "--pitch-turf"),
    ("--mark", "--pitch-turf"),
    ("--zone", "--pitch-turf"),
    ("--keystone", "--pitch-turf"),
    ("--warn", "--surface"),
    ("--red", "--surface"),
]

# The brand accent (a warm scarlet, the only red FILL) and the status red (a
# cooler crimson, text and outlines only) are both reds now, so they are
# held apart by value as well as by the form rule written into tokens.css.
MIN_ACCENT_VS_RED = 1.25
MIN_ACCENT_VS_TEXT_RED = 1.35

failures: list[str] = []


def parse_themes(css: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for theme in THEMES:
        block = re.search(
            r'html\[data-theme="%s"\]\s*\{(.*?)\n\}' % theme, css, re.DOTALL
        )
        if not block:
            failures.append(f'tokens.css: no html[data-theme="{theme}"] block')
            out[theme] = {}
            continue
        found: dict[str, str] = {}
        for line in block.group(1).splitlines():
            m = re.match(r"\s*(--[\w-]+)\s*:\s*([^;]+);", line)
            if m:
                found[m.group(1)] = m.group(2).strip().lower()
        out[theme] = found
    return out


def channel(value: int) -> float:
    s = value / 255
    return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4


def luminance(hex_value: str) -> float:
    h = hex_value.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def check_pair(theme: str, vars_: dict[str, str], fg: str, bg: str, minimum: float) -> None:
    a, b = vars_.get(fg), vars_.get(bg)
    if not a or not b:
        return  # a missing token is already reported by the completeness check
    if not (a.startswith("#") and b.startswith("#")):
        failures.append(
            f"{theme}: {fg} on {bg} is not a hex pair ({a} on {b}), contrast unverifiable"
        )
        return
    ratio = contrast(a, b)
    if ratio + 1e-9 < minimum:
        failures.append(
            f"{theme}: {fg} on {bg} is {ratio:.2f}:1, needs {minimum}:1 ({a} on {b})"
        )


def css_block(css: str, selector: str) -> str | None:
    """The declaration body of the rule whose selector list contains
    `selector` exactly (so .lane does not match .lane-confirmed). Comments
    are stripped first: this file documents every rule, and a comment sitting
    above a selector would otherwise be read as part of it."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    for match in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
        selectors = [s.strip() for s in match.group(1).split(",")]
        if selector in selectors:
            return match.group(2)
    return None


css_text = TOKENS_CSS.read_text(encoding="utf-8")
themes = parse_themes(css_text)

# ---- 1. both layers complete in every theme --------------------------------

for theme in THEMES:
    for token in CHROME_TOKENS + BOARD_TOKENS:
        if token not in themes[theme]:
            failures.append(f"{theme}: tokens.css is missing {token}")

names = re.findall(r'html\[data-theme="([\w-]+)"\]', css_text)
if names != THEMES:
    failures.append(
        f"tokens.css theme keys are {names}, expected {THEMES} "
        "(useTheme.ts names these three, pitch is the default)"
    )

# --bg-stripe was a chrome token that every board surface read as if it were
# turf. Deleting it is what makes the mistake unrepeatable, so it must not
# come back. (The file's header comment still names it, hence the colon.)
if re.search(r"--bg-stripe[\w-]*\s*:", css_text):
    failures.append(
        "tokens.css redefines --bg-stripe: the board must not have a chrome "
        "token to mistake for turf again (use --pitch-turf / --pitch-stripe)"
    )

# ---- 2. the board cannot be recoupled to the chrome ------------------------

for theme in THEMES:
    for board_token in BOARD_TOKENS:
        value = themes[theme].get(board_token)
        if value is None:
            continue
        if "var(" in value:
            failures.append(
                f"{theme}: {board_token} is defined as {value}. Board tokens take a "
                "literal value per theme; an indirection is how --team-home ended "
                "up meaning 'the accent' in the first place"
            )
        for chrome_token in CHROME_COLOURS:
            if value == themes[theme].get(chrome_token):
                failures.append(
                    f"{theme}: {board_token} has the same value as {chrome_token} "
                    f"({value}). The pitch must not be able to follow the chrome"
                )

pitch_markings = (BOARD_DIR / "PitchMarkings.tsx").read_text(encoding="utf-8")
referenced = re.findall(r"var\((--[\w-]+)[),]", pitch_markings)
if not referenced:
    failures.append("PitchMarkings.tsx reads no tokens at all, which cannot be right")
for token in referenced:
    if token not in BOARD_TOKENS:
        failures.append(
            f"PitchMarkings.tsx reads {token}, which is not a board token. "
            "The pitch is drawn from the board layer only"
        )

board_tokens_ts = (BOARD_DIR / "tokens.ts").read_text(encoding="utf-8")
fill_block = re.search(r"TOKEN_FILL[^=]*=\s*\{(.*?)\};", board_tokens_ts, re.DOTALL)
face_line = re.search(r"TOKEN_FACE\s*=\s*\"([^\"]+)\"", board_tokens_ts)
if not fill_block or not face_line:
    failures.append("board/tokens.ts no longer exposes TOKEN_FILL and TOKEN_FACE")
else:
    for value in re.findall(r"\"(var\([^\"]+\))\"", fill_block.group(1)) + [
        face_line.group(1)
    ]:
        if "," in value:
            failures.append(
                f"board/tokens.ts uses {value}: a fallback is a chrome token waiting "
                "to be inherited. Board tokens are defined in every theme, so there "
                "is nothing to fall back to"
            )
        name = value[4:-1]
        if name not in BOARD_TOKENS:
            failures.append(f"board/tokens.ts paints tokens with {value}, not a board token")

for filename, selectors in FOOTBALL_SELECTORS.items():
    css = (BOARD_DIR / filename).read_text(encoding="utf-8")
    for selector in selectors:
        body = css_block(css, selector)
        if body is None:
            failures.append(f"{filename}: rule for {selector} not found")
            continue
        for chrome_token in CHROME_COLOURS + ["--accent-ink"]:
            if f"var({chrome_token})" in body:
                failures.append(
                    f"{filename}: {selector} reads the chrome token {chrome_token}. "
                    "That is football, not chrome: use the board layer"
                )

# ---- 3. contrast -----------------------------------------------------------

for theme in THEMES:
    vars_ = themes[theme]
    for fg, bg in TEXT_PAIRS:
        check_pair(theme, vars_, fg, bg, 4.5)
    for fg, bg in GRAPHIC_PAIRS:
        check_pair(theme, vars_, fg, bg, 3.0)

    accent, red, text_red = (
        vars_.get("--accent"),
        vars_.get("--red"),
        vars_.get("--text-red"),
    )
    if accent and red and accent == red:
        failures.append(f"{theme}: --accent and --red are the same colour")
    if accent and text_red and accent == text_red:
        failures.append(f"{theme}: --accent and --text-red are the same colour")
    if accent and red and accent.startswith("#") and red.startswith("#"):
        if contrast(accent, red) < MIN_ACCENT_VS_RED:
            failures.append(
                f"{theme}: --accent and --red are {contrast(accent, red):.2f}:1 apart, "
                f"needs {MIN_ACCENT_VS_RED}. Two reds that mean different things must "
                "not look identical"
            )
    if accent and text_red and accent.startswith("#") and text_red.startswith("#"):
        if contrast(accent, text_red) < MIN_ACCENT_VS_TEXT_RED:
            failures.append(
                f"{theme}: --accent and --text-red are {contrast(accent, text_red):.2f}:1 "
                f"apart, needs {MIN_ACCENT_VS_TEXT_RED}"
            )

# Each theme has to be visibly its own theme. e2e/design-tokens.spec.ts
# asserts this in the browser; asserting it here too means a bad palette edit
# fails in milliseconds instead of after a full Playwright run, and a
# red-family palette makes these collisions easy to write by accident.
for token in ["--bg", "--accent", "--pitch-turf"]:
    values = {themes[t].get(token) for t in THEMES}
    if len(values) != len(THEMES):
        failures.append(f"{token} is not distinct across the three themes: {sorted(values)}")

if failures:
    print("\n".join(failures))
    print(f"check-palette: FAILED, {len(failures)} problem(s)")
    sys.exit(1)

print(
    "check-palette: two token layers intact across "
    f"{len(THEMES)} themes, {len(TEXT_PAIRS)} text pairs at AA, "
    f"{len(GRAPHIC_PAIRS)} graphical pairs at 3:1"
)
