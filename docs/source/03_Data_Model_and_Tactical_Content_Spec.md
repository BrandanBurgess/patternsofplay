# Patterns of Play, Data Model and Tactical Content Spec
### How the Tactical Content Bible becomes the database, and how user data sits beside it
**Version:** 1.0. Companion to the Implementation Brief (doc 02). The Bible remains the football source of truth; this document defines its machine shape.

---

## 1. Two data worlds

1. **Library content (read-only, seeded, global):** everything from the Bible. Patterns, deliveries, rotations, formations, keystones, rondo zones, identities, reference teams, role catalog, synergies, pass-risk profiles. Shipped as versioned seed files (JSON or YAML) loaded by a seeder. No team ever edits library rows.
2. **Team data (read-write, team-scoped):** users, teams, rosters, player profiles, saved formations, recorded patterns, confirmed lanes, board settings, suggestions, sessions, receipts. Every row carries `team_id`.

This split is what lets the tactical lead revise content without touching user data, and what later lets the club layer share library content across many teams cheaply.

---

## 2. Tenancy and core platform tables

Single shared SQLite file, `team_id` column scoping (decision rationale in doc 04). All access goes through a scoped query layer; route handlers never filter by team manually.

```
users            id, email, password_hash, display_name, role ('coach'|'player'), created_at
teams            id, name, colors_json, age_group, level, join_code (unique), created_by, created_at
team_members     id, team_id, user_id, role_on_team ('coach'|'player'), joined_at
                 (a player user maps to at most one roster entry per team)
```

Role note: `role_on_team` is the permission driver, structured so 'club_admin' can be added later without reworking checks.

---

## 3. Roster and player profiles (Bible Sections 1, 2)

```
players              id, team_id, user_id (nullable until a player claims their row),
                     name, jersey_number, preferred_foot ('L'|'R'|'B'),
                     position_line, position_code, role_code (nullable),
                     awr ('low'|'med'|'high'), dwr ('low'|'med'|'high')

player_attributes    player_id, attribute_key, value (1-5)
                     attribute_key in: pace, passing_range, carrying_1v1,
                     positional_discipline, aerial_physical, pressing_engine   (Bible 1.3)

playstyle_suggestions id, team_id, player_id, author_user_id, text,
                      status ('pending'|'approved'|'dismissed'),
                      created_at, reviewed_at, reviewed_by
                      (approved text merges into players.playstyle_note)
```

Taxonomy vocabularies (seeded from Bible 1.1 and Section 2):

```
position_codes   GK, CB, FB, WB, DM, CM, AM, W, ST, SS  (Level 2)
roles            code, position_code, name, description, key_attribute_keys[],
                 awr_default, dwr_default, archetype_note, enables_pattern_codes[]
                 One row per Section 2 entry (Sweeper Keeper ... Second Striker)
```

Synergies and clashes, seeded from 2B, data only in this build (the designed double-exposure warning reads from here):

```
role_synergies   code, name, role_codes[] or slot_expression, why_it_works,
                 exemplar, home_formations[], powers_pattern_codes[], kind ('synergy')
role_clashes     code, name, trigger_expression, warning_copy, kind ('clash')
                 Seed all of 2B.4; MVP UI activates only 'double_exposure_flank'
                 via an is_active_mvp flag
```

The double-exposure rule, expressed for the fit checker: a roster flank where the wide player has AWR high and DWR low, and the fullback or wingback behind them on the same side has AWR high, raises `double_exposure_flank` with the Bible's warning copy. Coach-only.

---

## 4. Library content: patterns, deliveries, rotations (Bible 3, 3F, 5B)

One `library_items` table with a type discriminator keeps browsing, search, and session-attachment uniform:

```
library_items    id, code (e.g. 'A5', 'F3', 'R12'), item_type ('pattern'|'delivery'|'rotation'),
                 name, category (e.g. 'combination', 'space', 'transition', 'pressing',
                 'crossing', 'through_ball'), blurb, when_to_use, coaching_points_json,
                 youth_takeaway, age_hint, roles_involved[] (role or position codes),
                 animation_spec_json (nullable), extras_json
```

`extras_json` per type:
- delivery: `trajectory` ('ground'|'driven'|'whipped'|'floated'|'clipped'), `delivery_zone`, `target_corridor` (3F.0 vocabulary)
- rotation: `trigger`, `creates`, `defenders_dilemma` (5B template)

**MVP seed list (exact):**
- Patterns (12): A1 Overlap, A2 Underlap, A3 One-Two, A4 Up-Back, A5 Third-Man Run, B3 Switch of Play, B5 Build-Out From the Back, B8 La Pausa, B9 Press Baiting, C1 Counter-Attack, C2 Long Ball and Second Ball, D1 Pressing Triggers.
- Deliveries (8): F1 Byline Cutback, F2 Whipped Early Cross, F3 Low Driven Cross, F4 Floated Back-Post Cross, F5 In-swinger vs Out-swinger (card copy carries the footedness rule; no automatic logic in MVP), F6 Deep Diagonal Cross, F7 Slide-Rule Through Ball, F8 Ball Over the Top.
- Rotations (3): R1 False-9 Drop and Wing Dive, R12 Strikers' Scissors, R13 Overlapping CB.

Category chips on the Patterns library come from `category`.

### 4.1 Declarative animation spec (preset content)

Transcribed from each Bible entry's numbered animation steps. Positions in landscape model coordinates (x 0-100 left to right toward the attacking goal, y 0-100 top to bottom). Orientation mapping happens at render only (portrait: left = y, top = 100 - x; inverse on input).

```json
{
  "slots": [
    {"slot": "winger_R", "role_hint": "W", "start": {"x": 78, "y": 12}},
    {"slot": "fb_R",     "role_hint": "FB", "start": {"x": 55, "y": 8}},
    {"slot": "opp_fb_L", "side": "opponent", "start": {"x": 84, "y": 14}}
  ],
  "ball": {"holder_slot": "winger_R"},
  "steps": [
    {"n": 1, "caption": "Winger receives wide and faces up the fullback",
     "moves": [], "ball_to": null},
    {"n": 2, "caption": "Fullback sprints an arced run outside him",
     "moves": [{"slot": "fb_R", "to": {"x": 88, "y": 4}, "arc": "outside"}]},
    {"n": 3, "caption": "Ball released into the overlap",
     "ball_to": {"bind_slot": "fb_R", "trajectory": "ground"}}
  ]
}
```

Binding rules (from the design README, binding):
- `ball_to.bind_slot` attaches the waypoint to the player who starts or finishes at that spot; during playback the waypoint chases that player's live position so passes connect to runners.
- `trajectory` values match the delivery vocabulary and drive the trail rendering (ground flat, floated arced, etc.).
- Steps carry captions so the details panel and the animation share one source.
- Rotations are the same format with `loop: true`.
- Reference-team signature animations (Section 5 below) are also this format.

### 4.2 Recorded patterns (user content, team-scoped)

```
saved_patterns   id, team_id, author_user_id, author_role, name,
                 board_snapshot_json (token positions, confirmed lanes, thresholds, zones on),
                 keyframes_json, created_at
```

`keyframes_json`: array of `{t_ms, token_id, x, y}` covering every dragged token including opponents and the ball, exactly as recorded. Keep raw; do not convert to the declarative format in this build. The animation player abstracts over both formats.

Author stamping: tiles render COACH when `author_role` is coach, else the player's display name. Delete permitted only to coaches (API-enforced).

### 4.3 Whiteboard state

```
boards           id, team_id, name, tokens_json, confirmed_lanes_json,
                 blocking_threshold, marking_threshold, zones_visible_json, updated_at
```

Confirmed lanes store per player-token pair. Code comment required: future versions likely key lanes by role or slot so patterns transfer across formations (design README note).

---

## 5. Library content: formations, rondo map, identities (Bible 4, 3G.2, 5, 5.7, 6)

```
formations       code ('433','4231','442','352','343','541'), name, shape_blurb,
                 strengths_json, vulnerabilities_json, natural_identities[],
                 positions_json  (slot list with model coords and position_code)

formation_keystones  formation_code, slot, title, blurb   (Bible Section 4 keystone copy,
                      drives the gold pulse and keycards)

rondo_zones      formation_code, zone_key ('first_line'|'midfield_box'|'flank_corridor'|
                 'last_line'|'counterpress'), polygon_json, rondo_name, teaches,
                 trains_pattern_codes[]        (Bible 3G.2; the 3G.1 rondo table seeds
                 the rondo metadata even though the session planner is deferred)
```

Identities:

```
identities       id, kind ('style_archetype'|'reference_team'|'cult_card'),
                 code, name, tag_line, formation_code,
                 core_idea, signature_pattern_codes[],
                 keystone_roles_json, youth_takeaway,
                 block ('high'|'mid'|'low') nullable,
                 pass_risk_json nullable,        -- style archetypes only (Bible 5.7 row:
                                                 -- encouraged, tolerated, discouraged, tempo_rule)
                 shape_render ('animated'|'static'|'details_only'),
                 signature_animation_spec_json nullable,
                 static_shape_json nullable
```

**MVP seed:**
- Style archetypes: all six (5.1-5.6) with pass-risk profiles, `details_only` render plus static blueprint shape where given.
- Reference teams, `animated`: Barcelona 2008-12 (third-man sequence), Liverpool 2018-20 (counterpress swarm to vertical), Real Madrid 2010-13 (transition counter), Leicester 2015/16 (ball over the top). `static`: Atletico 2013/14 (mid-block shape), Manchester City 2022/23 (3-2-4-1 in-possession shape). All remaining Section 6 entries (6.1, 6.3, 6.5, 6.7, 6.9, 6.11, 6.12, 6.16, 6.18): `details_only` data slots following the full five-part template.
- Cult corner (6.19): one-line cards with a linked pattern code each.
- National styles (Section 7): OPTIONAL seed with an `active: false` flag; no UI.

Detail template enforcement: reference team detail panels render, in order, Formation and shape, Core idea, Signature patterns, Keystone roles, Youth takeaway. The validator rejects any reference team entry missing a field.

---

## 6. Sessions (classroom delivery)

```
sessions         id, team_id, created_by, title, coach_note,
                 status ('draft'|'sent'), sent_at, created_at
session_items    id, session_id, position, item_kind ('library'|'saved_pattern'),
                 library_item_id nullable, saved_pattern_id nullable
session_receipts session_id, player_user_id, viewed_at nullable
```

Rules: receipts exist for every recipient at send time with `viewed_at` null; Mark as watched sets it; receipt data appears only in coach-role API responses. Draft items reorder by `position`. The library picker shows both presets and My Patterns with mini-board thumbnails (thumbnails render client-side from board snapshots; no image storage in MVP).

---

## 7. Bible-to-seed transformation rules (including the em dash rule)

1. **No em dashes, strict.** Every seeded string is rewritten so meaning survives without em dashes. Use a period and a new sentence, a comma, a colon, or parentheses. This is an editorial rewrite, not a character substitution. A CI check scans all seed files and all frontend string literals for the em dash character and fails on any hit. En dashes in ranges are replaced with "to" or a hyphen.
2. **Blurb length:** one sentence, 25 words or fewer (Bible 8.2.1), after transformation.
3. **Required fields:** no entry ships without blurb, animation spec (where the type carries one), roles involved, and coaching points; every card adds a youth takeaway and an age hint (8.2.4). Validator-enforced.
4. **Vocabulary:** real coaching terms kept exactly (half-space, pivot, rest defence, Zone 14); the first use of each term in a card body may carry a short parenthetical definition.
5. **Archetype names:** editorial phrasing only ("the Busquets role"); never imply endorsement; no likenesses (8.2.3).
6. **Curate, never lock:** identity copy is framed as "here is how X assembled these pieces"; the words "correct", "right way", and "off-identity" are banned in identity copy.
7. **Traceability:** every seed entry carries `source_ref` (e.g. `"bible:3A.A5"`) so content revisions map back to the Bible.
8. **Versioning:** seed files carry a `content_version`; the seeder is idempotent and upgrades library rows in place without touching team data.

---

## 8. Seeding pipeline

1. Transcribe the Bible into `/seeds/*.yaml` grouped by table.
2. Run the transformer (em dash rewrite happens in the source files themselves so humans review the final copy, not a runtime filter).
3. Run the validator (required fields, blurb length, banned characters, banned identity phrases, animation slot references resolve, pattern codes referenced by identities and rondo zones exist).
4. `seed` command loads or upgrades library tables inside one transaction.
5. CI runs validator plus em dash scan on every commit.
