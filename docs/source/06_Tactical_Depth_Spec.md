# Patterns of Play, Tactical Depth Spec (Formations Lab)
### Source of truth for the T-100 epic. Written 2026-08-07 by the orchestrator, commissioned by the founder.
**Version:** 1.0
**Status:** binding for T-100..T-109. Amends the MVP Brief scope table (see Section 0).

**Conflict rule (extends CLAUDE.md):** this doc wins on everything in the T-100 epic: the formation phase model, rotation systems, position archetypes, footedness, the superiority engine, and the Formations page surface. Doc 03 still wins on general schema conventions (scoping, source_ref, content_version, natural keys). The design handoff README still wins on visual language and the permission table. The Bible still wins wherever it already says something (Sections 1, 2, 3G, 4, 5B are the seed spine for this epic). Doc 04 stack decisions are not reopened.

**Reading order for an implementing agent:** Section 0 (what changed in scope), then only the sections your ticket names.

---

## 0. Scope amendment

The MVP Brief §1 scope table marked four rows OUT because they had no designed surface. This epic builds the surface, so the founder has moved them IN. T-100 amends the Brief table itself; no other ticket may rely on this section without T-100 merged.

| Brief §1 row | Was | Now | Why |
|---|---|---|---|
| Formation matchup overlay | OUT, data seeded | **IN** | This epic designs the surface: opposition toggle plus live per-zone superiority on the Formations board. |
| Rondo Map overlay (5 zones) | IN, 4-3-3 only | **IN, all formations, 6 zones** | Left and right flank corridors split, because asymmetry is the point of every modern shape. |
| Auto footedness (Bible 3F) | OUT | **IN** | `players.preferred_foot` already exists and is unused. The footedness engine is pure derivation from data the roster already holds. |
| Full clash warning set | OUT beyond double-exposure | **IN for unit-balance warnings only** | Archetype combination balance is the core mechanic of this epic. Bible 2B.4's other clashes stay OUT. |

Still OUT, unchanged, and no ticket in this epic may build them: training session planner, drill scheduling, video, club layer, national styles, opponent scouting import, live match tooling.

**Scope discipline note.** This epic adds tactical depth to one page. It does not add a new product pillar. If a ticket finds itself designing a session planner, a match report, or an opponent database, it has left scope: stop and write the question in the PR body per CLAUDE.md rule 7.

---

## 1. What we are building, in one paragraph

The Formations page stops being a shape browser and becomes a **tactics lab**. A coach picks a base shape, then watches it morph into what it actually looks like with the ball (3-2-5, 2-3-5, box midfield) and without it (4-4-2 mid block, 5-4-1 low block). The coach drops an opponent shape on top and the pitch immediately answers the only question that matters: **where are we spare, where are we short, and which route connects them.** The coach plays a named rotation (the inverted fullback, the stepping centre back, the pivot drop) and sees the shape reorganise. The coach assigns real roster players into slots, picks an archetype for each, and the app tells them which combinations balance and which leave nobody holding. Every number on the screen is computed from coordinates, not authored, so it stays true when the coach changes anything.

---

## 2. Football content register

This is the football. Every item here is editorial reference, never prescription. The existing copy rule from the design README holds without exception: **identities and reference systems curate, never lock.** Phrase every reference the way `seeds/roles.json` already does ("not a licence: names are editorial reference points only").

### 2.1 The three superiorities (the spine of the whole epic)

Already in Bible 3G. Restated because the engine computes against it:

- **Numerical**: more bodies than them in a zone. Computed from token counts.
- **Positional**: same numbers, better placed. The free man between the lines. Computed from the JdP grid: a player alone in a half-space between two opponent lines.
- **Qualitative**: a 1v1 our player simply wins. Not computable, coach-declared per slot (a toggle on the personnel panel), which is honest and keeps us out of fake-analytics territory.

Every card the engine emits must name which superiority it is talking about. That is the transferable coaching language and it is what separates this from a formation picker.

### 2.2 Positional play grid (juego de posición)

The pitch divides into **5 vertical lanes** (left wing, left half-space, centre, right half-space, right wing) and **5 horizontal lines** (own third build, first line, middle, between the lines, last line). Half-spaces carry priority: they are where the danger comes from because a player there can see and be seen by both the flank and the centre.

Occupancy rules to enforce as live warnings, held as guidelines and never as errors:
- No more than **three** teammates on any horizontal line.
- No more than **two** teammates in any vertical lane.
- Wide lanes: **one** occupant each, whenever possible.
- Circulate **between** zones, not within a zone. Diagonal forward passes are preferred to straight vertical ones.
- Temporary breaches are legal when forming a triangle, creating an overload, or dragging a marker out. The player returns afterwards. So the UI copy is "check this" not "wrong".

Lane boundaries (model coords, y is 0 at top to 100 at bottom, per CLAUDE.md rule 8):

| Lane | y range |
|---|---|
| Left wing | 0 to 19 |
| Left half-space | 19 to 37 |
| Centre | 37 to 63 |
| Right half-space | 63 to 81 |
| Right wing | 81 to 100 |

Horizontal line boundaries (x is 0 at own goal to 100 at the attacking goal):

| Line | x range |
|---|---|
| Own build | 0 to 22 |
| First line | 22 to 42 |
| Middle | 42 to 60 |
| Between the lines | 60 to 78 |
| Last line | 78 to 100 |

These numbers are the contract. Any ticket changing them changes the seeds too, and both move together in one PR.

### 2.3 Rondo map, extended to six zones and every formation

Bible 3G.2 gave five zones on the 4-3-3 only. This epic ships six zones on all six formations. The polygons are seeded per formation because a back three's first line is geometrically different from a back four's. **The ratio label is never seeded when the opposition is on; it is computed.** Seeded `canonical_rondo` is the fallback shown in no-opposition mode.

| zone_key | What it is | Canonical rondo (no opposition) | Trains |
|---|---|---|---|
| `first_line` | Keeper plus the back line plus whoever drops in, against their first pressing line | 4v2 or 3v2 | B5, B6, B8 |
| `midfield_box` | The central engine room between both midfield lines | 5v3 | A5, B8, B2 |
| `flank_corridor_left` | Left touchline plus left half-space, from own third to the byline | 2v1 to 2v2 | A1, A2, F1 |
| `flank_corridor_right` | Mirror of the above | 2v1 to 2v2 | A1, A2, F1 |
| `last_line` | Our forwards against their back line | 2v2 plus keeper | R12, C3 |
| `counterpress_ring` | A radius around the ball at the moment of loss, in their half | 4v4 plus 3 | D2, D4, C1 |

The counterpress ring is not a fixed polygon. It is a circle of radius 18 model units centred on the ball's position (or on the centroid of our three most advanced players when no ball is placed). It moves. That is the whole teaching point: rest defence is relative to the ball, not to the pitch.

### 2.4 Formation phases: in shape and out of shape

A **phase variant** is the same eleven slots at different coordinates. Slots never change identity across phases, which is what makes the morph animation legible: the coach watches *their left back* walk into midfield, not a token teleport.

Ship these per base formation. Reference-team variants are additional rows, attributed.

**4-3-3**
- `in_possession` **3-2-5, single inverted fullback.** One fullback tucks into the pivot beside the six. Other fullback stays as the third of a back three. Wingers hold the touchline, both eights occupy the half-spaces at the last line. Rest defence 3+2.
- `in_possession_alt` **2-3-5, both fullbacks advanced.** Centre backs split wide, six drops to make a line of three with both fullbacks, five across the front. Rest defence 2+3. Higher risk, higher width.
- `out_of_possession` **4-1-4-1 high block.** Nine leads the press, wingers pin the fullbacks, eights step, six screens.
- `out_of_possession_alt` **4-4-2 mid block.** One eight steps beside the nine, the shape becomes two banks of four.
- `rest_defence` 3+2 or 2+3, follows the in-possession variant chosen.

**4-2-3-1**
- `in_possession` **2-3-5 via a splitting double pivot.** One pivot drops between the centre backs, the other holds. Fullbacks push to the last line. Ten and both wingers occupy the three central and half-space slots between the lines.
- `in_possession_alt` **3-2-5 via one inverted fullback**, double pivot stays intact, the shape most similar to City's.
- `out_of_possession` **4-4-2 mid block**, ten joins the nine. The cleanest defensive conversion in football and the reason this shape is the most used in Europe.
- `out_of_possession_alt` **4-2-3-1 high press**, ten man-marks their pivot.

**4-4-2**
- `in_possession` **2-4-4 / 4-2-4**, wide midfielders advance, both centre midfielders hold. Structurally short in the centre, which is the honest teaching: the shape's answer is to go over or around, not through.
- `out_of_possession` **4-4-2 flat mid block**, the reference defensive shape.
- `out_of_possession_alt` **4-4-2 low block**, lines within 25 model units of the goal.
- `rest_defence` 4+2.

**3-5-2**
- `in_possession` **3-2-5**, wing backs to the last line, one of the three midfielders drops beside the pivot, two strikers plus two wing backs plus one arriving eight make five.
- `in_possession_alt` **asymmetric back four**, one wing back high and one deep, the wide centre back sliding to fullback. This is the Inter shape.
- `out_of_possession` **5-3-2**, wing backs drop into a back five.
- `rest_defence` 3+2, the most natural in football.

**3-4-3**
- `in_possession` **3-2-5**, the purest version: back three holds, double pivot holds, wing backs and front three make five. Wing backs are the entire width.
- `in_possession_alt` **3-2-2-3 box midfield**, the two wide forwards drop into the half-spaces to form the top of a box with the double pivot at its base.
- `out_of_possession` **5-4-1** or **5-2-3** press.
- `rest_defence` 3+2.

**5-4-1 / 5-3-2**
- `in_possession` **3-4-3 on the break**, wing backs launch, the shape is only briefly a five.
- `out_of_possession` **5-4-1 low block**, the reference park-the-bus shape.
- `rest_defence` 5+2, which is really "we are not attacking with numbers, and that is the plan".

### 2.5 Rotation systems: the named library

These are **structural** rotations (who changes job), distinct from the existing library rotations R1, R12, R13 (which are movement patterns). Each ships with an animation spec so it plays on the board using the existing player, and each names what it costs, not only what it gives. A rotation with no stated risk is marketing, not coaching.

| code | Name | Produces | Who moves | Trigger | What it costs |
|---|---|---|---|---|---|
| `rot_invert_fb_pivot` | Inverted fullback into the pivot | 3-2-5 | One fullback steps inside beside the six | Goal kick or centre-back circulation against a two-striker press | The flank behind him is empty on the turnover. Needs a winger who defends or a wide centre back who can cover the channel. |
| `rot_invert_fb_high` | Fullback into the eight line | 3-1-6 | Fullback steps inside and forward to the height of the eights | Opponent block already pinned deep, we need bodies between the lines | Only one screener behind six attackers. This is a lead-chasing shape, not a default. |
| `rot_cb_step` | Centre back steps into midfield | 3-2-5 or 2-3-5 | A centre back carries or steps into the pivot line | Their first line refuses to press, so the free man must come from the back | If he is caught stepping, the back line is a two against their front two. |
| `rot_cb_invert_middle` | Middle centre back of a three inverts | 2-3-5 from a back three | The central defender of the back three steps in front of the other two | Keeper is under pressure and needs a bounce option that does not exist wide | Loses the spare central defender against a lone striker who plays on the shoulder. |
| `rot_pivot_drop` | Salida lavolpiana, pivot drops between the centre backs | 3-2 build | The six drops between the split centre backs | Two strikers pressing the two centre backs, we need a third | Removes the screen in front of the back line. If it is played badly the counter goes straight through the vacated space. |
| `rot_double_pivot_split` | One of the double pivot drops, the other holds | 3-2-5 | One pivot drops between centre backs, the partner stays as the single screen | The press arrives in a 4-4-2 and the two centre backs are 2v2 | The remaining pivot is alone against two eights. |
| `rot_wb_asymmetry` | One wing back high, one deep | Back four in build, five in attack | Ball-far wing back drops to the back line, ball-near wing back holds the last line | Building down one side against a back four | The deep wing back is the only cover on his entire flank. |
| `rot_fb_touchline_swap` | Winger inside, fullback outside | 2-3-5 with inverted wingers | Winger takes the half-space, fullback takes the touchline | Their fullback is tucking narrow to protect the centre back | The winger is no longer isolated in a 1v1, so the qualitative superiority is traded for a positional one. Know which one you wanted. |
| `rot_false_nine_drop` | Nine drops, wingers dive the channels | 4-2-4 shape in the moment | Nine drops between the lines, both wingers run the channels he vacated | The ball reaches a facing midfielder | Nobody occupies the centre backs. If the runs do not go, the last line has zero pin. |
| `rot_box_form` | Two forwards drop to form the box midfield | 3-2-2-3 | Both wide forwards or both eights take the half-space slots between the lines | We are winning the centre and want to keep it | Wide zones are empty except the wing backs. Two exhausted wing backs is a real cost. |
| `rot_press_bait_hold` | Hold the ball dead to invite the presser | Build shape unchanged | Centre back stops the ball with the sole, faces forward, waits | Opponent's first line is hesitating on the edge of pressing | It is a genuine risk taken on purpose in our own third. Only run it with players who can execute under pressure, and say so. |
| `rot_gk_plus_one` | Keeper as the spare man in the build | 3-2 with the keeper as the apex | Keeper steps to the edge of the box and becomes the free man of the first-line rondo | The opponent presses with one more than we build with | Everything behind the keeper is empty. The single highest-consequence rotation in the book. |
| `rot_ten_drop_pivot` | Ten drops beside the pivot | 4-3-3 from a 4-2-3-1 | The ten drops into the midfield line to make a three | Their ten or striker is screening our pivot and we cannot get out | We surrender the between-the-lines occupant, which is the shape's whole point. Temporary only. |
| `rot_overload_isolate` | Overload one side, switch to the isolated winger | Shape unchanged, occupancy shifted | Six or seven players commit to one flank, the far winger stays wide and alone | We have a winger who wins his 1v1 | The switch must be prepared, not hopeful. An unprepared long diagonal is a turnover in our own build shape. |

**Reference systems** (attributed, editorial, one line of provenance each). These bind a phase variant plus a set of rotations to a named modern side. They belong in the `identities` table as `kind = 'reference_system'`, alongside the existing reference teams, so they inherit the existing "curate never lock" copy handling.

1. **Manchester City, 3-2-5 with the inverting centre back.** A 4-3-3 on the team sheet that becomes a back three plus a two-man pivot, with a centre back stepping into midfield to make the pivot rather than a fullback. Front five pins the back four. Rest defence 3+2. Teaches: the free man can be manufactured from any line, and the position it comes from decides who covers the counter.
2. **Arsenal, 3-2-5 into 3-1-6.** One fullback tucks to complete a back three while the other steps into the pivot, freeing both central midfielders to attack the half-spaces as dual eights. Redundancy is the point: either fullback can be the inverter, which makes the shape robust to a marking scheme.
3. **Bayer Leverkusen and Real Madrid, 3-4-2-1 into 3-2-5.** The back three and the double pivot both stay, and the entire width plus the top of the attack comes from two wing backs. The build forms square structures in midfield so the carrier always has two forward options. Teaches: width and goal threat can be the same two players, if you have those two players.
4. **Liverpool, 4-2-3-1 into 2-3-5.** Centre backs split, both fullbacks advance, one pivot drops and one steps. Compact 4-3-3 without the ball. Teaches: the double pivot is a mechanism, not a position pair.
5. **Brighton under De Zerbi, press baiting into 2-4-4.** Centre backs hold the ball dead with the sole of the foot to keep every lane open and invite the first presser. The backward pass is a trigger, not a retreat. Fullbacks invert beside the pivot. Teaches: pressure is information, and you can choose when to receive it.
6. **Inter, 3-5-2 with asymmetric wing backs.** One wing back high and one deep turns a back three into a back four in build and a front five in attack, with heavy rotation in possession and a rigid 5-3-2 without it. Teaches: fluid with the ball and rigid without it is a coherent model, not a contradiction.
7. **Amorim's 3-4-3, inverting the middle centre back.** The central defender of the three steps in front to give the keeper a bounce option and to manipulate the opponent's first line. Out of possession the shape becomes 5-4-1 or 4-4-2. Teaches: the inverter does not have to be a fullback.
8. **Como under Fàbregas, 4-2-3-1 with a splitting pivot.** The double pivot splits to create a back-three illusion, inverted wingers occupy the half-spaces while fullbacks own the touchline, high line around 42 metres. Teaches: possession is a means of controlling space, not a statistic.
9. **The low-block counter, 5-4-1 into 3-4-3.** The block exists to make the pitch small, and the outlet striker is the most important defender on the team. Teaches: the rest of the epic in reverse, because every superiority above is one this shape is deliberately conceding.
10. **Barcelona's high line as rest defence.** Instead of leaving bodies behind the ball, leave none and hold an extreme offside line. Teaches: rest defence is a philosophy with more than one answer, and this one has a specific, nameable failure mode.

Each reference system card carries: base formation, phase variant it produces, rotations used, keystone profiles required, one youth takeaway, and one honest risk line. No card may exceed the existing blurb limits enforced by the seed validator.

### 2.6 Position archetypes

An **archetype** is finer than a role. Existing `roles` answers "how does this player play the position". An archetype answers "which specific job does this player do inside a unit, and what does the unit then need around him". Archetypes attach to a **slot family**, not a position code, because the eight in a 4-3-3 and the eight in a 3-5-2 are different jobs.

Slot families: `gk`, `cb_central`, `cb_wide`, `fb`, `wb`, `six`, `eight`, `ten`, `wide_forward`, `nine`.

Every archetype row carries: code, slot family, name, one-sentence definition, 2 to 3 `key_attribute_keys` drawn strictly from the existing six (`pace`, `passing_range`, `carrying_1v1`, `positional_discipline`, `aerial_physical`, `pressing_engine`), a foot hint, AWR/DWR defaults, `enables_pattern_codes`, `enables_rotation_codes`, `needs_around_it` (free text, one line), and `exemplar_note` with the standing disclaimer.

**The eight, worked in full, because it is the archetype family the founder called out.**

| code | Name | Key attributes | Job | Needs around it |
|---|---|---|---|---|
| `eight_half_space_creator` | Half-space creator | passing_range, positional_discipline | Receives between their midfield and back line in the half-space and plays the pass that beats the last line | A six who holds, and a winger who pins the fullback so the half-space stays open |
| `eight_box_crasher` | Box crasher | pace, aerial_physical | Arrives late and unmarked at the far post or the penalty spot, the third-man finisher | Someone else holding the middle, because he will not be there when the ball turns over |
| `eight_carrier` | Line-breaking carrier | carrying_1v1, pace | Breaks the line by driving through it rather than passing through it | Space to run into, so pair him with players who pin rather than drop |
| `eight_ball_winner` | Ball winner | pressing_engine, positional_discipline | The counterpress trigger of the midfield, wins the ball back five seconds after we lose it | A creator alongside, or the trio has no forward pass |
| `eight_deep_rotator` | Deep rotator | passing_range, positional_discipline | Drops beside the six to make a temporary double pivot, then leaves once the line is broken | A partner who does the opposite, otherwise both drop and nobody occupies |
| `eight_wide_rotator` | Wide rotator | pace, carrying_1v1 | Takes the touchline when the fullback inverts, so the width never disappears | An inverting fullback. Without one this archetype is just a bad winger |

**Combination rules for a midfield three (six plus two eights).** These are the mechanic. Ship as `archetype_combinations` rows with a computed check:

- Exactly one archetype in the trio must own **tempo** (`six_metronome`, `six_line_breaker`, or `eight_deep_rotator`). Zero means the ball never circulates cleanly. Two means neither accelerates.
- At least one must own **progression** (`eight_half_space_creator` or `eight_carrier`). Without it the trio recycles and never breaks.
- At least one must own **rest defence** (`six_destroyer`, `six_metronome`, `eight_ball_winner`, or `eight_deep_rotator`). Without it the 3+2 is a 3+1 and the counter arrives free.
- Two `eight_box_crasher` is the classic imbalance: both arrive, nobody holds. Warn, do not block. Some coaches want exactly this when chasing a game, and the warning should say so.
- Two `eight_half_space_creator` warns for the mirror reason: nobody wins it back.

Named good combinations to seed, with what each gives and costs:
- **Metronome, creator, crasher.** The positional-possession trio. Controls, unlocks, finishes. Costs: the crasher's flank is exposed on the turnover.
- **Destroyer, carrier, ball winner.** The gegenpress trio. Wins it high, drives at them. Costs: limited against a low block, because carrying into a packed box is not a plan.
- **Line breaker, deep rotator, box crasher.** The double-pivot-by-rotation trio. Costs: demands very high tactical discipline about who drops.
- **Metronome, ball winner, half-space creator.** The tournament trio, balanced in all three duties. Costs: no one drives, so it depends on the front three for the last twenty metres.

Apply the same three-duty framework to the other units, which the seeding ticket writes out in full:
- **Double pivot**: one controller plus one destroyer or runner. Two of the same profile halves the shape's value, which the Bible already says in 4.2 and which becomes a computed warning here.
- **Front three**: needs at least one who pins the last line, at least one who wins a 1v1, and no more than one who drops. Three droppers means the back four is never occupied.
- **Strike pair**: runner plus target, runner plus runner (requires a ten or a long-ball identity), false plus poacher.
- **Back line**: at least one who steps and one who covers. Two steppers means the space behind is permanently open. Two coverers means we never regain the ball high.
- **Wide unit (fullback plus wide forward)**: exactly one takes the touchline. Both inside means no width, both outside means no half-space occupant. This generalises the existing double-exposure flank warning rather than replacing it.

### 2.7 Footedness engine

`players.preferred_foot` already exists (`L`, `R`, `B`) and is currently decorative. Derive these, all from foot plus assigned slot side. All are one-line coach-facing notes, never blocking.

1. **Left centre back, right-footed.** Closed body shape. His first pass points back inside, and a presser who shades him infield takes half the pitch away. A left-footed left centre back opens the body to the whole field.
2. **Wide forward, opposite-footed to his side.** Inside forward profile: cuts in to shoot, and the touchline is available for an overlapping fullback. Same-footed: touchline profile, holds width, delivers early. This changes which delivery types (F codes) are actually on his menu, so surface it next to the delivery library links.
3. **Wing back, same-footed to his side.** Natural early cross and out-swinging delivery. Opposite-footed: cutback and inside combination, in-swinging delivery.
4. **Both fullbacks inverting on the same foot.** The pivot receives from the same angle every time and becomes predictable to press. Flag it.
5. **Deliveries.** Opposite-footed delivery from a flank in-swings, same-footed out-swings. Attach this to the existing F1 to F8 library items so a coach picking a delivery sees which of their players can actually hit it.
6. **`B` (two-footed)** suppresses every warning above for that slot and says so, because two-footedness is a genuine tactical asset and should read as one.

Coach-only, per the permission table: these are fit information and never render in a player view.

### 2.8 Formation matchups

Bible 3G.3 has six matchup rows already. Extend to the fifteen unordered pairs of the six MVP shapes, plus the reference systems as pseudo-opponents (a 4-4-2 mid block is a different opponent from a 4-4-2 high press, and the coach should be able to pick which). Every matchup card teaches the same three-step read, and the copy must follow it literally:

1. **Where is our spare man.** Engine computes it, card names the route to reach him.
2. **Where are we short.** Engine computes it, card names what it costs us.
3. **Which route connects them**: through, around, or over.

The engine produces step 1 and step 2 numerically for any pair, seeded or not. The seeded card adds the coached read. When a pair has no seeded card, render the computed numbers plus the generic three-step scaffold, and say plainly that this pair has no coached read yet. Do not invent one.

---

## 3. Data model

Conventions inherited from doc 03 and non-negotiable: library-world tables carry no `team_id`; every seeded row carries `source_ref` and `content_version`; natural composite keys where doc 03's precedent uses them; fixed vocabularies validated at the Pydantic layer, not as DB enums.

### 3.1 Library world, new tables

**`formation_phases`** primary key `(formation_code, variant_code)`
```
formation_code   FK formations.code
variant_code     str   e.g. 'in_possession', 'in_possession_alt', 'out_of_possession',
                       'out_of_possession_alt', 'rest_defence'
phase            str   in_possession | out_of_possession | rest_defence | transition
name             str   '3-2-5 (inverted left back)'
shape_label      str   '3-2-5'
blurb            text  <= 25 words, validator-enforced like every other blurb
positions_json   json  [{slot, position_code, x, y}]  same slot ids as the base formation, all eleven
trigger          text  when this shape appears
rest_shape       str   '3+2' | '2+3' | '4+1' | '5+2' | null
reference_code   str   nullable, FK identities.code
uses_rotations   json  [rotation_system.code]
source_ref, content_version
```
Hard validator rule: `positions_json` slot set must be **exactly equal** to the base formation's slot set. A phase that adds, drops, or renames a slot is a seed error, because the morph animation binds by slot.

**`rotation_systems`** primary key `code`
```
code, name, family (first_line|pivot|wide|front_line)
applies_to_formations   json [formation_code]
produces_shape          str
trigger                 text
what_moves_json         json [{slot, from:{x,y}, to:{x,y}, becomes: 'pivot'|'third_cb'|...}]
coaching_points_json    json [str]
risk                    text   REQUIRED, not nullable. A rotation without a stated cost fails the validator.
requires_profile_json   json {slot: {archetypes:[...], foot: 'L'|'R'|null, attributes:[...]}}
animation_spec_json     json   same schema the library rotations already use
exemplar_note           text   with the standing disclaimer
source_ref, content_version
```

**`position_archetypes`** primary key `code`
```
code, slot_family, name, definition
key_attribute_keys   json  subset of the six, 2 to 3 entries, validator-checked against position_codes vocabulary
foot_hint            str   nullable: 'same_side' | 'opposite_side' | 'either'
awr_default, dwr_default
duties_json          json  subset of ['tempo','progression','rest_defence','width','pin','box_threat','press_trigger']
enables_pattern_codes    json
enables_rotation_codes   json
needs_around_it      text  one line
exemplar_note        text
source_ref, content_version
```
`duties_json` is what the combination checker runs on. Keep the duty vocabulary closed and small; adding a duty is a spec change, not a seed change.

**`archetype_combinations`** primary key `code`
```
code, unit ('midfield_three'|'double_pivot'|'front_three'|'strike_pair'|'back_line'|'wide_unit'|'box_midfield')
name
slots_json        json [{slot_family, archetype_code}]
what_it_gives     text
what_it_costs     text   REQUIRED
reference_note    text
home_formations   json
source_ref, content_version
```

**`unit_balance_rules`** primary key `code`
```
code, unit
rule_kind      'requires_duty' | 'max_duty' | 'max_same_archetype'
duty           str nullable
min_count, max_count  int nullable
warning_copy   text   coach-facing, must read as a check not an error
severity       'note' | 'warning'
source_ref, content_version
```
This is the generalisation of the existing `role_clashes` mechanic and should reuse its evaluation shape so the two engines read alike.

**`formation_matchups`** primary key `(ours_code, theirs_code)` with `ours_code <= theirs_code` normalised at seed time
```
ours_code, theirs_code    FK formations.code
our_edges_json     json [str]
their_edges_json   json [str]
route              text   the "how the ball finds it" line
route_kind         'through' | 'around' | 'over'
source_ref, content_version
```

**`rondo_zones`** gains columns
```
canonical_rondo  str   '4v2', fallback label when no opposition is placed
zone_kind        'polygon' | 'ball_relative_circle'
radius           int   nullable, used when zone_kind is ball_relative_circle
```
and gains rows for all six formations, with `flank_corridor` split into `flank_corridor_left` and `flank_corridor_right`. Existing 4-3-3 rows migrate: the single `flank_corridor` row becomes two. Handle it as a data migration in the same Alembic revision, not as a seed-only change, so an existing deploy upgrades cleanly.

### 3.2 Team world, new tables

**`team_formations`** (team world, direct `team_id`)
```
id, team_id, name, base_formation_code, active_phase_variant, created_by_user_id, created_at
opponent_formation_code   nullable
opponent_phase_variant    nullable
```

**`team_formation_slots`** (team world, scopes transitively through `team_formation_id`, same pattern as `player_attributes`)
```
team_formation_id (FK, part of PK), slot (part of PK)
player_id          nullable FK players.id
archetype_code     nullable FK position_archetypes.code
qualitative_edge   bool default false   coach-declared 1v1 advantage
```

Every query on both goes through `app/scoped.py`. Client input never supplies `team_id`. That is CLAUDE.md rule 4 and there is no exception for this epic.

---

## 4. The superiority engine

Pure, deterministic, framework-free. Lives in `frontend/src/board/` alongside `coords.ts` and `zones.ts`, and follows the T-020 precedent: **unit tests are written first**, including the round-trip test for the mirror.

```ts
// All inputs and outputs in landscape model coords (CLAUDE.md rule 8).

type Pt = { x: number; y: number };
type SlotPos = { slot: string; position_code: string; x: number; y: number };

// 1. Opponent placement. A 180 degree rotation about the pitch centre, so
//    their attacking direction is the reverse of ours. Involutive:
//    mirrorOpponent(mirrorOpponent(p)) === p, exactly, for all integer inputs.
mirrorOpponent(p: Pt): Pt            // { x: 100 - p.x, y: 100 - p.y }

// 2. Geometry.
pointInPolygon(p: Pt, poly: Pt[]): boolean       // ray casting, boundary counts as inside
pointInCircle(p: Pt, centre: Pt, r: number): boolean

// 3. Per-zone counts.
type ZoneCount = {
  zoneKey: string;
  ours: number;
  theirs: number;
  delta: number;                                  // ours - theirs
  label: string;                                  // '4v2'
  verdict: 'superiority' | 'parity' | 'inferiority';
  superiorityKind: 'numerical' | 'positional' | null;
};
countZone(zone, ours: SlotPos[], theirs: SlotPos[]): ZoneCount

// 4. Positional superiority. A free man is one of ours alone in a lane cell
//    between two of their horizontal lines, with no opponent in the same cell
//    and none within `pressRadius` (default 8 model units).
findFreeMen(ours, theirs, pressRadius = 8): { slot: string; cell: GridCell; whyItMatters: string }[]

// 5. JdP grid occupancy. Returns breaches, never blocks.
type GridBreach = { kind: 'lane_over' | 'line_over' | 'wide_lane_shared'; cell: string; count: number; slots: string[] };
gridOccupancy(ours: SlotPos[]): { occupancy: Record<string, string[]>; breaches: GridBreach[] }

// 6. Rest defence classification. Counts our players behind the ball line
//    (or behind the centroid of our three most advanced, when no ball is set)
//    and splits them into last line and screen line by a 12-unit x gap.
classifyRestDefence(ours: SlotPos[], ballX: number): { shape: string; behindBall: number; lastLine: number; screen: number }

// 7. The read. Assembles the three-step coaching read from the above.
type MatchupRead = {
  spare: ZoneCount | null;       // highest positive delta, tie broken toward our own goal
  short: ZoneCount | null;       // lowest negative delta, tie broken toward our own goal
  route: 'through' | 'around' | 'over';
  seededCard: FormationMatchup | null;
};
buildRead(zones: ZoneCount[], seeded: FormationMatchup | null): MatchupRead
```

**Route inference when no card is seeded**, stated so it is reproducible: if `midfield_box.delta > 0` the route is `through`; else if either flank corridor has `delta > 0` the route is `around`; else `over`. Show the inferred route with visibly softer language than a seeded card's route line, and label it as inferred.

**Performance.** Recompute on every drag frame with 22 tokens and 6 zones. That is well inside the 60fps budget the board already meets at 23 tokens (T-020), but it must be measured, not assumed: add a benchmark test asserting a full recompute stays under 2ms.

**Determinism.** No randomness, no `Date.now()`, no floating-point-sensitive comparisons in verdicts. Counts are integers, so verdicts are exact.

---

## 5. The Formations page

Keep the board-first shell that T-032 established: board, floating meta bar, page-level swipe-up sheet. Do not build a parallel renderer, do not fork `PatternPreviewBoard`. Extend.

### 5.1 Meta bar, four controls

1. **Phase.** Segmented: Base / With the ball / Without the ball / Rest defence. Selecting one morphs the board over 600ms using the existing animation player, binding by slot. A caption strip under the board names the resulting shape and its trigger.
2. **Opposition.** Off by default. On reveals an opponent formation picker and an opponent phase picker (their out-of-possession variants are the ones that matter, so default the picker there). Opponent tokens render in the opponent colour the board already defines for recorded opponents, mirrored via `mirrorOpponent`.
3. **Rondo map.** Same toggle as today, but each zone now carries a live count chip. With opposition off, the chip shows the seeded `canonical_rondo` in muted styling. With opposition on, the chip shows the computed ratio, coloured by verdict, and the zone card gains the computed read. The counterpress ring only renders when a ball is placed or a phase with a defined ball position is active.
4. **Rotations.** A list filtered to rotations that apply to the current formation. Selecting one plays it on the board and opens a card: trigger, what moves, coaching points, and the risk line given equal visual weight to the benefit. The risk line is not a footnote.

Only one of Rondo map, Rotations, and Grid may be open at once, matching the existing mutual-exclusion behaviour in `FormationsPage.tsx`.

### 5.2 Positional grid overlay

A fifth toggle, off by default: draws the 5 by 5 grid and marks breaches. Breach copy is a check, never an error: "Three in the left half-space. Intentional overload, or is someone standing in a teammate's zone?" Never "invalid".

### 5.3 Personnel panel

Opens from the sheet as a third segment. For each of the eleven slots: assigned player (from the team roster), archetype picker, and a suggestion list.

**Suggested archetypes** rank by, in order: the player's six attribute values against the archetype's `key_attribute_keys`; foot fit against `foot_hint` and the slot's side; AWR/DWR match; and whether the resulting unit passes its balance rules. Show the top three with a one-line why for each. The why must cite the actual reason ("passing range 5 and positional discipline 4 fit the metronome"), not a score.

**Unit balance** evaluates `unit_balance_rules` live as archetypes change and renders notes and warnings inline under the unit. Coach-only, both in the UI and at the API. A player token requesting the balance endpoint gets 403, and there is a test for it.

Empty roster is a first-class state: the panel still works with archetypes alone and no players assigned, because a coach planning a shape at 11pm does not want to fill in a roster first.

### 5.4 Phone portrait

Everything above renders portrait on phone per the existing formula (`left = y`, `top = 100 - x`). Specific decisions:
- Meta bar controls collapse to an icon row; each opens a bottom sheet rather than a popover.
- Zone count chips shrink to the ratio only, and the read moves entirely into the tapped zone card.
- The grid overlay is available but off by default on phone, because five lanes on a 7:10 board is dense.
- The personnel panel is a full-height sheet, one unit at a time.

No feature is desktop-only. If something genuinely cannot work portrait, that is a question for the PR body, not a silent omission.

---

## 6. Definition of done

Every ticket in this epic, in addition to the Brief §5 lines for its workstream:

1. `make verify` green: lint, typecheck, pytest, vitest, e2e at both viewports, em-dash scan, seed validator.
2. No em dash in any seed file, blurb, coaching point, warning, or label. Applies to every reference-team name and every risk line.
3. Every new team-world query goes through `app/scoped.py`. A cross-team read test returns nothing.
4. Coach-only data (unit balance warnings, footedness notes, archetype suggestions) returns 403 for a player token, tested per endpoint.
5. Engine functions have unit tests written before the implementation, including: mirror round-trip exactness, point-in-polygon boundary cases, a zone count fixture per formation pair, and the recompute benchmark.
6. Every seeded row has `source_ref` and `content_version`. Reference-system rows carry the editorial disclaimer.
7. Every rotation and every combination has a non-empty cost or risk line. The validator enforces it.
8. Phase `positions_json` slot sets match their base formation exactly. Validator-enforced.
9. Playwright journey at both viewports for the ticket's surface, per `.claude/skills/verify-ui`.

---

## 7. Sources

Research consulted 2026-08-07 for the reference systems in 2.5 and the principles in 2.2 and 2.7. Listed so a later content revision can re-verify rather than re-guess.

- Coaches' Voice, *The tactical evolution of Pep Guardiola's Manchester City*: https://learning.coachesvoice.com/cv/pep-guardiola-man-city-tactics-2016-2026/
- Premier League, *Guardiola's seven innovations that revolutionised Premier League tactics*: https://www.premierleague.com/en/news/4663968/pep-guardiolas-seven-innovations-that-revolutionised-premier-league-tactics
- Breaking The Lines, *What is Juego de Posición?*: https://breakingthelines.com/tactical-analysis/what-is-juego-de-posicion/
- Coaches' Voice, *Positional play: football tactics explained*: https://learning.coachesvoice.com/cv/positional-play-football-tactics-explained-guardiola-cruyff-manchester-city/
- The Football Analyst, *Box Midfield, Football Tactics Explained*: https://the-footballanalyst.com/box-midfield-football-tactics-explained/
- Coaches' Voice, *What is rest defence?*: https://learning.coachesvoice.com/cv/rest-defence-explained/
- The Football Analyst, *Rest-Defence, Football Tactics Explained*: https://the-footballanalyst.com/rest-defence-football-tactics-explained/
- SoccerTutor, *Xabi Alonso Tactics and Formation, 3-2-5 Style of Play at Leverkusen*: https://www.soccertutor.com/blogs/inside-football-coaching/xabi-alonso-tactics-bayer-leverkusen-3-2-5-attacking-shape-wing-back-threat
- SoccerTutor, *De Zerbi Tactics and Style of Play, How to Bait the Press and Build Up*: https://www.soccertutor.com/blogs/inside-football-coaching/de-zerbis-tactics-bait-the-press-build-up-play
- Arsenal Station, *Arsenal's Tactical Evolution: Inverted Fullbacks, the "Eight," and Standards*: https://www.arsenalstation.com/2025/09/16/arsenals-tactical-evolution-inverted-fullbacks-the-eight-and-standards/
- Total Football Analysis, *Arne Slot Tactics At Liverpool 2024/25*: https://totalfootballanalysis.com/head-coach-analysis/arne-slot-liverpool-202425-tactical-analysis-tactics
- Total Football Analysis, *Simone Inzaghi 3-5-2 Tactics At Inter Milan 2024/25*: https://totalfootballanalysis.com/head-coach-analysis/simone-inzaghi-inter-tactics-202425-tactical-analysis
- Total Football Analysis, *Rúben Amorim Man United Build-Up Tactics*: https://totalfootballanalysis.com/team-analysis/ruben-amorim-manchester-united-tactics-build-up-tactical-analysis
- Total Football Analysis, *Cesc Fàbregas Tactics At Como 2025/26*: https://totalfootballanalysis.com/data-analysis/cesc-fabregas-tactics-como-2025-2026-data-analysis
- FourFourTwo, *Numerical superiority: football tactics explained*: https://www.fourfourtwo.com/features/numerical-superiority-football-tactics-explained
- Trace, *Trace Toolkit: The Art of the Rondo*: https://traceup.com/academy/trace-toolkit-the-art-of-the-rondo
- ESPN, *Why does every club want a left-footed centre-back?*: https://www.espn.com/soccer/story/_/id/37633113/why-does-every-club-want-sign-left-footed-centre-back
- Springer, *Contemporary trends in tactical formations and team success in Europe's top-tier football leagues*: https://link.springer.com/article/10.1186/s13102-026-01657-1
