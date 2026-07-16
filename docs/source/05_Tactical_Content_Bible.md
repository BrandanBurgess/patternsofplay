# Patterns of Play — Tactical Content Bible
### Companion to the PRD v1.0 — defines the actual football content the app ships with
**Prepared by:** Football/Tactics Content Lead
**Audience:** Design agent, Product agent, Engineering agent
**Status:** v1.0 draft — content source of truth

---

## 0. How to Read This Document

The PRD defines *what the product does*. This document defines *what the product knows*. It is the seed content for four in-app libraries plus one system:

| Content Library | Feeds PRD Feature | This Doc |
|---|---|---|
| **Positional Role Catalog + Synergies** | Player Profiles & Formation Fit (5.2.3); whiteboard synergy highlights | Sections 1–2, 2B |
| **Core Concepts Library** | Pattern Archetype Library (5.2.4) | Section 3 |
| **Formation Library** | Preset Formations (5.2.1), key-player highlights | Section 4 |
| **Team Identity Library** | Style templates, club philosophy presets (5.5); pass-risk profiles (5.7) | Sections 5–7 |
| **Rotation Systems Library** | Team-as-one-unit animations (PRD 5.2.4) | Section 5B |
| **Delivery Library** | Ball-trajectory types in the animation builder | Section 3F |
| **Superiority / Rondo Map** | Zone-tap rondo overlay; formation-matchup overlay; session planner link (Phase 1.5) | Section 3G |
| **Attribute & Fit Model** | Formation-fit indicator logic (5.2.3) | Section 1.3, per-role attribute keys |

Every entry is written so it can be lifted directly into UI copy (blurbs), the animation builder (step-by-step pattern specs), or the fit engine (attribute mappings).

## 0.1 Governing Content Principle — Style-Agnostic by Design

**The app teaches patterns and principles, not a philosophy.** We are not selling one way to play; we are giving coaches a shared visual language for *every* way to play. This has three hard implications for product and design:

1. **The Concepts Library (Section 3) is the core product; identities are a lens on top of it.** Every pattern (overlap, third man, second-ball cage, pressing trigger, low block) is available to every team at all times, regardless of any identity selected. An identity never locks, hides, or gates content — it only *curates* (suggested starter patterns, default block, relevant reference teams).
2. **Identities are descriptive, not prescriptive.** Style archetypes (S5), reference teams (S6), and national styles (S7) exist to show a coach *how great teams combined the same universal patterns differently* — Barça and Mourinho's Madrid both used the third-man run and the overload-to-isolate; they just weighted them differently. UI copy should consistently frame identities as "here's how X assembled these pieces," never "this is the right way."
3. **Everything is mixable.** A coach must be able to take a low-block base (5.4), bolt on Liverpool-style overlap patterns, and teach a salida build-out for goal kicks — without the app ever flagging that as "off-identity." The identity selection at team creation is a starting curation, editable and ignorable from day one. Real teams are hybrids; the app's respect for that *is* the credibility pitch to experienced coaches.

---

# SECTION 1 — POSITIONAL TAXONOMY

## 1.1 Three-Level Hierarchy

Players are categorized at three levels of increasing nuance. The app should let a coach tag a player at any level; deeper tags unlock more precise formation-fit feedback.

**Level 1 — Line (broad):** Goalkeeper / Defender / Midfielder / Forward

**Level 2 — Position (where on the pitch):**
- Defender → Centre Back (CB), Fullback (FB), Wingback (WB)
- Midfielder → Defensive Mid (DM/6), Central Mid (CM/8), Attacking Mid (AM/10)
- Forward → Winger/Wide Forward (W), Striker (ST/9), Second Striker (SS/9.5)

**Level 3 — Role (how they play that position):** the Role Catalog in Section 2. This is where the product differentiates — "Left Winger" tells you where a player stands; "Touchline Winger" vs "Inside Forward" tells you *what patterns they enable*.

## 1.2 Work-Rate Model (FIFA-style, coach-rated)

Every player carries two work-rate tags, rated by the coach:

- **Attacking Work Rate (AWR):** Low / Medium / High — how aggressively they join attacks and make forward runs.
- **Defensive Work Rate (DWR):** Low / Medium / High — how much they track back, press, and recover.

Examples for coach onboarding copy:
- **High/High** — box-to-box engine (Jude Bellingham, N'Golo Kanté). Covers ground both ways all game.
- **High/Low** — attacking outlet who stays high (classic winger, poacher). Devastating going forward, must be covered behind.
- **Low/High** — defensive anchor (holding 6, defensive fullback). Rarely joins attacks, always home when the ball turns over.
- **Medium/Medium** — balanced connector.

Work rates matter to the fit engine: e.g., placing a High/Low winger in front of an overlapping (High AWR) fullback flags a "no cover on this flank in transition" warning — exactly the nitty-gritty depth the PRD wants to signal.

## 1.3 Core Attribute Set (6 coach-rated sliders, 1–5)

The PRD asks for 4–6 attributes. Recommend these six — each maps cleanly onto role requirements below:

1. **Pace** — raw speed and acceleration (runs in behind, recovery runs, counter-attacking).
2. **Passing Range** — from safe short circulation (1–2) to line-breaking and switch-of-play diagonals (4–5).
3. **1v1 / Ball Carrying** — dribbling, beating a man, driving through midfield.
4. **Positional Discipline** — holds shape, reads danger, doesn't chase the ball.
5. **Aerial & Physical Duels** — heading, shielding, second-ball battles.
6. **Pressing Engine** — intensity and repeatability of pressing/counterpressing actions (distinct from work rate: work rate is *willingness*, this is *capacity*).

---

# SECTION 2 — ROLE CATALOG

Each role entry: **what it is → key attributes (from 1.3) → work rates → archetype player → patterns it enables**. The "patterns it enables" field is the hook into Section 3 — the app can suggest patterns based on the roles a coach has placed on the pitch.

## 2.1 Goalkeepers

**Sweeper Keeper**
Starts high, acts as an 11th outfield player in build-up, defends the space behind a high defensive line. Key attributes: Passing Range, Pace, Positional Discipline. Archetype: Manuel Neuer (Bayern 19/20), Ederson. Enables: playing out from the back, high defensive line, salida lavolpiana variants.

**Traditional Shot-Stopper**
Stays on the line, commands the box, distributes long and safe. Key attributes: Aerial & Physical, Positional Discipline. Enables: long-ball/second-ball game (his clearances *are* the first pass), low-block systems.

## 2.2 Centre Backs

**Ball-Playing / Stepping CB**
Comfortable carrying the ball into midfield or hitting line-breaking passes. Can *step into midfield* to create a +1 in build-up when the opponent presses the pivot — momentarily turning a back 4 into a back 3 with an extra midfielder. Key attributes: Passing Range, 1v1/Carrying, Positional Discipline. Work rates: Med/High. Archetypes: Gerard Piqué (prime Barça), John Stones (as the hybrid CB/DM). Enables: build-out patterns vs man-marking, breaking the first line by dribble, overloading midfield.

**Stopper**
Aggressive front-foot defender who steps out to kill attacks at source and wins his duels early. Key attributes: Aerial & Physical, Pace, Pressing Engine. Work rates: Low/High. Archetype: Sergio Ramos (Mourinho's Madrid). Enables: high line with aggressive man-jumping, pressing traps.

**Covering CB / Sweeper**
Reads danger, defends the space behind his partner, wins footraces to balls in behind. Key attributes: Pace, Positional Discipline. Archetype: Virgil van Dijk (also elite on the ball — roles can stack), Raphaël Varane (France 2018). Enables: high defensive line, defending counter-attacks 2v2.

**Wide CB (back 3)**
Outside CB in a 3-4-3/3-5-2 who defends the channel and can step forward or even overlap in possession. Key attributes: Pace, 1v1/Carrying. Enables: back-3 build-up, wide overloads from deep.

## 2.3 Fullbacks & Wingbacks

**Overlapping / Attacking Fullback**
Provides width high up the pitch, runs outside the winger, delivers crosses and cutbacks. Key attributes: Pace, Pressing Engine (for recovery), 1v1/Carrying. Work rates: High/Med-High. Archetypes: Trent Alexander-Arnold & Andy Robertson (Liverpool), Dani Alves (prime Barça), Marcelo (Mourinho's Madrid). Enables: overlap, underlap, cutback patterns, switches of play (as the far-side target).

**Inverted Fullback**
In possession, steps *inside* into central midfield next to the pivot instead of hugging the touchline — creating a 2-3 build-up shape, adding a body for counterpressing, and freeing the winger to stay wide 1v1. Key attributes: Passing Range, Positional Discipline, Pressing Engine. Work rates: Med/High. Archetypes: Philipp Lahm (Guardiola's Bayern), João Cancelo, Joshua Kimmich (when at RB). Enables: central overloads, rest defence vs counters, freeing the touchline winger.

**Defensive Fullback**
Stays home, defends the flank, keeps the back line intact. Key attributes: Positional Discipline, Aerial & Physical, Pace. Work rates: Low/High. Archetype: Benjamin Pavard (France 2018 — largely a defender first). Enables: asymmetric shapes (one flank attacks, one defends), low-block solidity.

**Wingback (back 3/5 systems)**
Owns the entire flank alone — the team's only width. Effectively a winger and fullback in one shirt. Key attributes: Pace, Pressing Engine, 1v1/Carrying. Work rates: High/High (non-negotiable — this is the most physically demanding role on the pitch). Enables: 3-5-2/3-4-3 systems, 5-man back line when defending.

## 2.4 Midfielders

**Single Pivot / Deep-Lying Playmaker (6)**
The metronome at the base of midfield: receives from the CBs, dictates tempo, breaks the first line, screens the back four. Rarely leaves position. Key attributes: Passing Range, Positional Discipline, first-touch composure (fold into Passing Range for the 6-slider model). Work rates: Med/High. Archetypes: Sergio Busquets (Barça/Spain), Xabi Alonso (Mourinho's Madrid — with a longer, more vertical range). Enables: build-out patterns, switches of play, third-man combinations (he's usually the "third man"), counterpress structure.

**Destroyer / Anchor (6)**
Wins the ball, breaks up play, gives it simple. The insurance policy. Key attributes: Pressing Engine, Aerial & Physical, Positional Discipline. Work rates: Low-Med/High. Archetype: Casemiro. Enables: high-risk attacking systems around him (he covers), pressing traps, counter-attack launch (win → immediate vertical pass).

**Box-to-Box / Workhorse (8)**
The High/High engine: arrives in the opposition box, recovers into his own, wins duels, carries through transition. Key attributes: Pressing Engine, 1v1/Carrying, Pace, Aerial & Physical. Work rates: High/High. Archetypes: Jude Bellingham, Sami Khedira (Mourinho's Madrid), Leon Goretzka (Bayern 19/20). Enables: third-man runs, second-ball dominance, late box arrivals, counterpressing.

**Advanced 8 / Half-Space Creator (Mezzala)**
An 8 who drifts into the half-space between opposition lines to receive on the half-turn and create. Key attributes: 1v1/Carrying, Passing Range, first-touch under pressure. Work rates: High/Med. Archetypes: Andrés Iniesta, David Silva, Thiago (Bayern 19/20 — deeper variant). Enables: half-space combinations, one-twos around the box, up-back-through patterns.

**Classic 10 / Playmaker Between the Lines**
Lives in Zone 14 (central space just outside the box), receives between opposition midfield and defence, plays the final pass. Key attributes: Passing Range, 1v1/Carrying. Work rates: Med/Low-Med. Archetypes: Mesut Özil (Mourinho's Madrid — the transition-10 version), Antoine Griezmann (France 2018 — a hybrid 10/second striker with high defensive contribution). Enables: through-balls to runners, wall passes as the bounce player, transition attacks.

## 2.5 Wide Players

**Touchline Winger**
Stays glued to the touchline to stretch the pitch horizontally, receives to feet, beats the fullback on the outside, crosses or cuts back. Usually plays on his natural side (right-footer on the right). Key attributes: Pace, 1v1/Carrying. Work rates: High/Low-Med. Archetypes: Ángel Di María (Mourinho's Madrid, left side, though left-footed on the right too), Kingsley Coman / Serge Gnabry (Bayern 19/20 in wide-hold mode), prime Pedro (width-keeper in Barça's front three). Enables: 1v1 isolation patterns, stretching a back four to open half-spaces, cutbacks, keeping width during central overloads.

**Inside Forward / Inverted Winger**
Starts wide on the *opposite* side to his strong foot (left-footer on the right), attacks the half-space diagonally, shoots or plays the reverse pass. The fullback behind him usually supplies the width (overlap pairing). Key attributes: 1v1/Carrying, Pace, finishing (UI can surface as a role note). Work rates: High/Low-Med. Archetypes: Mohamed Salah & Sadio Mané (Liverpool), Cristiano Ronaldo (Mourinho's Madrid, left inside forward — the goal-scoring apex of the role). Enables: overlap patterns (he pins inside, FB rounds outside), cut-inside shooting lanes, far-post runs off crosses.

**Wide Forward / Wide Runner**
A striker starting from a wide slot: less interested in receiving to feet, constantly attacking the space behind the fullback with diagonal runs in behind. Key attributes: Pace (elite), finishing. Work rates: High/Low. Archetype: Kylian Mbappé (France 2018 — the reference for the entire role). Enables: counter-attacks, long diagonal balls in behind, pinning a back line deep (his pace alone drops the opposition 10 metres).

**Raumdeuter ("space interpreter")**
A wide-listed player with no fixed station who drifts unmarked into scoring positions — reads where space *will* open and is simply there. Almost purely an off-ball role. Key attributes: Positional Discipline inverted into positional *intelligence*, finishing. Work rates: High/Med. Archetype: Thomas Müller (Bayern 19/20 — assist machine from nominally wide/10 positions). Enables: back-post arrivals, third-man runs, occupying defenders to free teammates.

## 2.6 Strikers

**Runner-in-Behind / Channel Runner (9)**
First thought: run beyond the last defender. Attacks channels between CB and FB, stretches the pitch vertically, finishes one-touch. Key attributes: Pace, finishing, timing of runs (UI note). Work rates: High/Low-Med. Archetypes: Karim Benzema in transition phases (Mourinho's Madrid also used Higuaín this way), Fernando Torres (prime Spain, 2008 vintage). Enables: through-ball patterns, counter-attacks, stretching play so midfield creators get space.

**Target Man (9)**
Reference point for direct play: wins the first ball aerially or holds it up with his back to goal, brings runners into play. Key attributes: Aerial & Physical, first touch/hold-up. Work rates: Med/Med. Archetypes: Olivier Giroud (France 2018 — zero goals, enormous function: he pinned CBs and layed off so Griezmann and Mbappé attacked the second ball and the space). Enables: wall passes (he *is* the wall), up-back-through, long-ball & second-ball game, set-piece threat.

**False 9**
A striker who drops into midfield when his team has the ball, dragging CBs into a dilemma (follow and open space in behind, or hold and concede a free man between the lines). Key attributes: Passing Range, 1v1/Carrying, first touch. Work rates: High/High (the pressing leader from the front). Archetypes: Lionel Messi (Barça 2009–12 — the defining example), Cesc Fàbregas (Spain, Euro 2012), Roberto Firmino (Liverpool — the pressing-first variant that made Salah/Mané's inside runs possible). Enables: central overloads, third-man combinations, wingers attacking the vacated central space, counterpress from the front.

**Complete Forward / All-Round 9**
Can run in behind, hold up, finish, and link. Key attributes: broad 3s–4s everywhere. Archetype: Robert Lewandowski (Bayern 19/20 — the finished article). Enables: everything above; the luxury role.

**Poacher**
Lives on the last shoulder and in the six-yard box; touches few, goals many. Key attributes: finishing, Pace (short bursts). Work rates: Med/Low. Enables: cutback patterns (he's the cutback target), cross-heavy systems.

**Second Striker / Shadow Striker (9.5)**
Plays off the main 9, arriving late into the box from deeper — a goal-scoring 10. Key attributes: finishing, 1v1/Carrying. Archetype: Griezmann (France 2018 hybrid), Müller (interchangeable with Raumdeuter). Enables: layered box arrivals, second-ball goals.

---

# SECTION 2B — ROLE SYNERGY & COMBINATION LIBRARY

Roles don't exist in isolation — the product's depth comes from knowing which archetypes *unlock each other*. This section feeds two features: (1) whiteboard synergy highlights — when a coach places two linked roles, the connection can glow with a blurb; (2) the fit engine v2 — warnings when placed roles clash. Template: **Pairing → why it works → exemplar → home formations → patterns it powers.**

## 2B.1 Attacking Duos & Triangles

**Target Man + Runner(s) in Behind — "The Pin & Sprint."** The target pins both CBs and wins/holds the first ball; because the CBs are occupied and drawn *toward* him, the space behind them belongs to the runner. Neither works alone: a target with no runner just recycles; a runner with no pin gets caught offside against a comfortable line. Exemplar: Giroud + Mbappé (France 2018 — Giroud scored zero and made Mbappé's tournament possible). Home: 4-2-3-1, 4-4-2. Powers: A4, A5, C2, C3.

**Inside Forward + Overlapping Fullback — "The Inverted Pair."** The winger wants to come inside onto his strong foot; that only stays viable if someone supplies the width behind him, forcing the opposition fullback into a two-man problem every possession. Exemplar: Mané + Robertson, Ronaldo + Marcelo. Home: 4-3-3, 4-2-3-1. Powers: A1, cutback-zone finishing (3E).

**Touchline Winger + Underlapping 8 / Inverted FB — "The Stretch & Slip."** The mirror image: winger holds maximum width and pins wide, opening the inside channel for a runner from deep. Exemplar: Coman wide + Goretzka underlapping (Bayern 19/20); Di María wide + Khedira arriving (Madrid). Home: 4-3-3, 4-2-3-1. Powers: A2, half-space combinations.

**False 9 + Wide Runners — "The Vacuum."** The false 9 drops and drags a CB (or forces a free-man concession); the space he vacates is attacked diagonally by the wide players — the goals go to the wingers, the system goes through the striker. Exemplar: Firmino + Salah/Mané; Messi + Pedro/Villa (Barça). Home: 4-3-3. Powers: the false-9 drop pattern, A5, C3.

**Classic 10 + Runner 9 — "The Feeder & Finisher."** The 10 lives between the lines facing goal; the runner's constant threat in behind is what *forces* the opposition line deep enough to give the 10 that space — and the 10's through-balls are what make the runs pay. Exemplar: Özil + Benzema/Higuaín (Mourinho's Madrid). Home: 4-2-3-1. Powers: C1, C3, Zone 14 creation.

**Complete Forward + Raumdeuter — "The Magnet & Ghost."** The 9 occupies defenders and finishes; the Raumdeuter reads where the resulting attention leaves holes and arrives unmarked. Exemplar: Lewandowski + Müller (Bayern 19/20). Home: 4-2-3-1. Powers: box-arrival layering, A5 (the Raumdeuter is a perpetual third man).

**Big–Little Strike Partnership.** The 4-4-2 classic: target wins and sets, second striker plays off his knockdowns and shoulders. The original synergy in football. Home: 4-4-2, 3-5-2. Powers: A4, C2.

## 2B.2 Midfield Structures

**Controller + Destroyer Double Pivot — "The Brain & Shield."** One faces forward and distributes; one wins the ball and covers the other's risk. Two controllers = soft without the ball (unless control *is* the identity — see Spain 6.3); two destroyers = sterile with it. Exemplar: Alonso + Khedira (Madrid); Kimmich + Goretzka (Bayern — controller + box-crasher variant). Home: 4-2-3-1, 3-4-3.

**Single Pivot + Mezzala/Advanced 8s — "The Anchor & Arrows."** The 6's positional discipline is what licenses the 8s to attack the half-spaces; the 8s' movement is what gives the 6 forward passing lanes. Exemplar: Busquets + Xavi/Iniesta. Home: 4-3-3. Powers: B5, A5, B1 rotations.

**Deep-Lying Playmaker + Wide Forwards — "The Quarterback Link."** A 6/pivot with elite long range turns every regain into a launch: one pass from deep finds the wide runners' channels before the opponent resets. Exemplar: Alonso → Ronaldo/Di María; Alexander-Arnold's diagonals → Mané (fullback variant). Powers: B3, C1.

**Box-to-Box 8 + Anchor 6 — "The Engine & Insurance."** The High/High 8 can crash the box and press aggressively *because* the anchor stays home. Exemplar: Goretzka + Kimmich, Khedira + Alonso. Universal across formations.

## 2B.3 Defensive & Build-Up Units

**Stopper + Covering CB — "The Aggressor & Sweeper."** One steps out to kill attacks early; one defends the space that stepping creates. Two stoppers = holes behind; two coverers = no pressure on the ball. Exemplar: Ramos (front foot) + covering partner; van Dijk covering an aggressive partner. Universal.

**Sweeper Keeper + High-Line CBs with Recovery Pace — "The High-Line Contract."** A high line is only playable if the space behind it is defended by *someone* — either the keeper sweeping or a CB/FB winning footraces. Exemplar: Neuer + Boateng/Alaba + Davies' recovery pace (Bayern 19/20). Required by identities 5.1 and 5.3; the fit engine should hard-warn when a high-block identity lacks this unit.

**Ball-Playing CBs + Single Pivot — "The Build-Out Spine."** The three players who beat the first press line between them (B5/B6/B7 all run through this unit). Exemplar: Piqué + Busquets. Required by identity 5.1.

**Inverted FB + Touchline Winger + Covering CB — "The Rest-Defence Flank."** The inverted FB adds a counterpress body centrally (D4), the winger keeps width, the CB covers the vacated flank channel. Exemplar: Lahm/Kimmich-style structures. Home: possession identities.

**Defensive FB behind a High/Low Winger — "Flank Balance."** A winger who doesn't track back must have a fullback who doesn't bomb on (France 2018's right side: Pavard staying home behind Mbappé). The inverse — attacking FB behind a tracking, hard-working wide player — is Matuidi's tucked-in role on the French left. Asymmetry is fine; *double exposure on the same flank is not.* This is the fit engine's clearest, most teachable warning.

## 2B.4 Anti-Synergies (Clash Warnings for the Fit Engine)

- **Two receivers, one space:** Classic 10 + False 9 both dropping between the lines congest the same zone and leave nobody stretching the defence. One must become a runner.
- **No-width flank:** Inside Forward + Inverted FB on the same side = both players in the half-space, zero width, easy to defend. Pair each inside-mover with a width-supplier (2B.1).
- **Double exposure flank:** High/Low winger + High-AWR overlapping FB = an open corridor every transition (the inverse of Flank Balance above).
- **Sterile pivot:** Destroyer + Destroyer double pivot in a possession identity — no one to break lines. (Legitimate in a low-block identity.)
- **Uncovered aggression:** Two Stopper CBs, or a Stopper with no covering partner/keeper, behind a high line.
- **Bus with no outlet:** Low-block identity with no Target Man or elite-pace runner up front — the block never exits its own third (see 4.6).
- **Third-man patterns without a bounce player:** A5/A4 in the starter set but no Target/False 9/10 profile on the pitch to play off.

---

# SECTION 3 — CORE CONCEPTS LIBRARY (Pattern Archetypes)

This is the seed content for the Pattern Archetype Library (PRD 5.2.4). Each entry follows the same template so it can be rendered as a card + animation:

> **Name → Definition (UI blurb) → Animation spec (numbered steps for the pattern builder) → Roles involved → When to use it (game context) → Coaching points**

## 3A. Combination Play (2–3 player patterns)

### A1. Overlap
**Blurb:** The fullback runs *outside* and beyond his winger, who has the ball. The defender must choose: follow the runner (winger cuts inside) or stay (fullback is free to cross).
**Animation:** 1) Winger receives wide, faces up the fullback. 2) Own fullback sprints an arced run outside him. 3a) Ball released into the overlap → cross/cutback, or 3b) winger cuts inside into the vacated half-space.
**Roles:** Inside Forward + Overlapping Fullback (the classic pairing — Robertson outside Mané).
**When:** Opponent defends narrow; your winger is inverted (wants to come inside anyway).
**Coaching points:** The overlap works even when the ball isn't passed — the *threat* of the run drags the defender. Winger should delay one beat to let the run mature.

### A2. Underlap
**Blurb:** Same idea, inside lane: the fullback (or an 8) runs *inside* the winger into the half-space, between fullback and centre back.
**Animation:** 1) Winger holds the ball high and wide, pinning the opposition FB to the touchline. 2) Runner attacks the inside channel. 3) Slipped through-ball → cutback or shot.
**Roles:** Touchline Winger + Inverted FB or Advanced 8.
**When:** Opponent's winger tracks your fullback's outside runs; the inside channel is open because your touchline winger has stretched them.
**Coaching points:** The touchline winger *must* stay wide to open the inside lane — width creates the underlap.

### A3. One-Two (Wall Pass / Give-and-Go)
**Blurb:** Pass, sprint past your marker, receive it back first-time. The oldest way to beat a man without dribbling — the receiver is the "wall."
**Animation:** 1) Player A passes into a teammate's feet. 2) A immediately bursts beyond his marker. 3) Teammate plays a one-touch return into A's path.
**Roles:** Any two, but classically Advanced 8/10 with a Target Man or False 9 as the wall.
**When:** Tight central areas around the box; opponent marking man-to-man (their marker follows the pass, the run kills him).
**Coaching points:** The pass into the wall must be firm and to the correct foot; the run starts *as the pass travels*, not after.

### A4. Playing Off the Target — Up-Back (Bounce & Recycle)
**Blurb:** A pass "up" into a striker with his back to goal isn't meant to turn him — he sets it "back" first-time to a facing teammate. The team advances 20 metres and *keeps a facing player on the ball*. Also the standard way to recycle possession when the striker can't turn.
**Animation:** 1) Vertical pass into the 9's feet (back to goal, CB tight behind). 2) One-touch layoff back to an arriving midfielder. 3) That midfielder plays forward (see A5) or switches (B3).
**Roles:** Target Man / False 9 as the bounce player; Box-to-Box 8 or 10 arriving.
**When:** Opposition midfield line is compact and you can't play through it — go over/into the 9 and play off him instead.
**Coaching points:** The bounce player doesn't need to win his duel, only to shield one touch. Support runner arrives at an angle, never flat behind the ball.

### A5. Third-Man Run (Up-Back-Through)
**Blurb:** The pass the defence can't see. A plays to B; while everyone watches that ball, C is already running; B's first touch releases C. C — the third man — was never marked because he was never on the ball.
**Animation:** 1) 6 or CB plays "up" into the 9/10 between the lines. 2) Layoff "back" to an 8. 3) 8 plays first-time "through" for the third man (winger/striker) attacking in behind. Highlight the third man's run starting *at step 1*.
**Roles:** Bounce player (9/10) + facing passer (6/8) + runner (Wide Forward, Runner-in-Behind, Box-to-Box 8).
**When:** The single most important pattern vs organised defences; core to Barça/Spain positional play and to every good build-out.
**Coaching points:** Timing over speed — the runner curves his run to stay onside; the "back" pass is what unlocks it, because it pulls opposition eyes and bodies toward the ball.

## 3B. Creating & Moving Space (team-level patterns)

### B1. Off-Ball Rotations
**Blurb:** Three players (classically winger–fullback–8) swap stations in a triangle so markers must either follow (holes open) or pass players off (free men appear). The positions stay occupied; the *people* change.
**Animation:** 1) Winger comes inside off the touchline. 2) 8 spins out to the vacated wide lane. 3) Fullback steps into the 8's inside slot. Ball circulates during the rotation; finish with a pass into whichever rotated player came free.
**Roles:** Any wide triangle; requires Positional Discipline 4+ across all three.
**When:** Vs man-oriented marking, or when a low block has "solved" your static shape.
**Coaching points:** Rotate one at a time on triggers, not all at once; the rotation's purpose is a free man, so the ball must find him within ~3 seconds or reset.

### B2. Pinning & Moving the Opposition Shape
**Blurb:** You move defenders without the ball ever going near them. A winger holding maximum width pins a fullback; a striker on the last line pins two CBs; drop your 9 and a CB must choose. Attack where the shape *had* to thin out.
**Animation:** Show the opposition block as a connected shape (lines between defenders). 1) Ball circulates left → block shifts left. 2) Quick switch right (B3) → block scrambles across. 3) Attack the stretched far-side gap before the shape re-sets. The "shape distortion" visual (block stretching/tearing) is a signature animation moment.
**Roles:** Whole team; Touchline Wingers and Runners-in-Behind are the primary pinning tools.
**When:** Always — this is the grammar of possession football. Explicit teaching version: "we circulate to move them, not to keep the ball."
**Coaching points:** Every pass should have a purpose against the block: shift it, stretch it, or break it.

### B3. Switch of Play
**Blurb:** The block has shifted to the ball side — one long diagonal to the far-side free winger/fullback attacks the space it left behind. From overload one side → isolate the other.
**Animation:** 1) Deliberate 3–4 pass overload on the left (drawing the block across). 2) 6 or CB receives facing forward. 3) 40-yard diagonal to the right winger/wingback in acres. 4) Immediate 1v1 or cross.
**Roles:** Deep-Lying Playmaker or Ball-Playing CB (Passing Range 5) as the switcher; Touchline Winger/Wingback as the receiver.
**When:** Opponent defends in a compact ball-side block. Overload-to-isolate is the standard plan for teams with an elite 1v1 winger.
**Coaching points:** The switch must arrive *before* the block slides — one bouncing slow diagonal wastes the overload.

### B4. Overload to Isolate
**Blurb:** Put 4 players and the ball on one flank on purpose. The defence must match numbers — leaving your best dribbler 1v1 on the far side. The overload is the bait; the isolation is the plan.
**Animation:** Same skeleton as B3 but the *end state* is highlighted: far-side winger 1v1, full pitch-width away from help.
**Roles:** Isolation target: Inside Forward or Touchline Winger with 1v1/Carrying 5 (think prime Ronaldo left-side isolation at Mourinho's Madrid).
**When:** You have a clear 1v1 mismatch to exploit.

### B5. Build-Out From the Back (vs press)
**Blurb:** Structured short passing from the GK through the thirds, designed to *bait* the opponent's press forward and then play through or past it — turning their pressure into your space.
**Animation:** 1) GK splits CBs wide, 6 shows between them. 2) Opposition strikers jump → the free man appears (spare CB, dropping 6, or stepping FB). 3) Line-broken pass into the 8/10 between the lines. 4) Release runners (chains directly into A5/third man).
**Roles:** Sweeper Keeper, Ball-Playing CBs, Single Pivot.
**When:** Core identity choice — teach as the default restart pattern for possession identities.
**Coaching points:** The press is not the problem, it's the invitation: every presser who jumps leaves a free man behind him. Know *before the ball arrives* where your +1 is.

### B6. Salida Lavolpiana (CB Split / Pivot Drop)
**Blurb:** The 6 drops *between* the splitting centre backs to form a back three in build-up — creating a spare man vs two pressing strikers and pushing both fullbacks high. Named for Ricardo La Volpe, the Argentine coach who systematised it in Mexican football; Guardiola imported it to Barcelona.
**Animation:** 1) CBs split to the corners of the box. 2) 6 (Busquets role) drops into the gap. 3) Fullbacks advance to midfield height. 4) 3v2 first line plays out calmly.
**Roles:** Single Pivot with Passing Range + composure; Ball-Playing CBs.
**When:** Opponent presses with two strikers; you want fullbacks high early.

### B7. Centre Back Steps Into Midfield
**Blurb:** The mirror of B6: instead of the 6 dropping, a CB *carries or steps* forward into midfield, creating the extra man higher up. Devastating vs teams that man-mark the pivot — nobody is assigned to a dribbling CB.
**Animation:** 1) CB receives, no presser jumps. 2) He drives 15 metres into midfield. 3) A defender is finally forced to engage → CB releases the man that defender abandoned.
**Roles:** Ball-Playing/Stepping CB (1v1/Carrying 4+).
**When:** Opponent man-marks your midfield; you need a free-man mechanism that doesn't sacrifice fullback height.

### B8. Attracting Pressure to Release — La Pausa (Waiting for Pressure)
**Blurb:** The counterintuitive master skill of possession play: *don't* pass early — hold the ball, invite the presser, and release only as he commits. A free teammate only exists because someone's marker left him; pressure on you is space for someone else. The pause is the pass's disguise and its trigger.
**Animation:** 1) CB/6 receives with time — and deliberately waits (slow dribble at the opponent, ball exposed as bait). 2) Presser commits (highlight the moment his weight goes forward — the point of no return). 3) Ball released past him, one line broken, and the presser is now *behind the ball* — the team plays 10v9 until he recovers. Overlay: a "pressure = space" visual showing the presser's abandoned zone lighting up as he jumps.
**Roles:** Ball-Playing CBs, Single Pivot, press-resistant 8s (the Busquets/Xavi signature — receiving *in order to* be pressed).
**When:** Foundation skill for identities 5.1/5.6; the individual-level twin of B5 (which is the same idea run by the whole team).
**Coaching points:** Passing *before* pressure arrives wastes the possession's power — nothing was displaced, the block is intact. The sequence is: receive → invite → commit them → release → they can't recover. Teach the pause explicitly; young players' instinct is to get rid of it, and this concept is the cure.

### B9. Press Baiting (Team-Level Traps in Possession)
**Blurb:** B8 at team scale: deliberately playing into "trapped" areas — a back-pass to the keeper, a pass to the touchline-pinned fullback — *because* it triggers the opponent's press (D1 in reverse), pulling their whole block forward and out of shape, then playing through or over the space they vacated.
**Animation:** 1) Ball goes backward (keeper) — opposition line pushes up 15m in response (show the whole block advancing). 2) Second bait: pass to the "pressing trap" fullback; their winger + 8 converge. 3) The prepared out-ball: first-time bounce inside (A4) or clip over the jumped press (F8) into the space the block abandoned. Show before/after shape: their compact 35m block now stretched to 60m.
**Roles:** Sweeper Keeper (the chief bait), Ball-Playing CBs, a pre-assigned outlet (Target 9 or runner).
**When:** Vs aggressive pressing teams — their aggression is the raw material; possession identities beat presses *by* being pressed well.
**Coaching points:** Every bait needs its pre-planned exit *before* the bait is played (who's the out-ball, where's the second ball landing). Backward passes are forward plays: the ball goes back so the team can go forward. Pairs with 6.15's inverse (they bait you into their trap; this is you baiting them out of shape).

## 3C. Direct & Transition Play

### C1. Counter-Attack (Vertical Transition)
**Blurb:** Win the ball → attack the disorganised opponent before they re-form. The first pass goes *forward* if it can; runners sprint into the channels; ideal completion inside 8–10 seconds.
**Animation:** 1) Regain in own half (tackle/interception flash). 2) First pass vertical into the 10 or wide forward. 3) Two runners break beyond the ball at full sprint (channels + far post). 4) Finish before the recovery lines form. Overlay a "transition clock" (0–10s) as a visual device.
**Roles:** Anchor/Destroyer wins it; transition-10 (Özil archetype) carries/releases; Wide Forwards (Mbappé/Ronaldo/Di María archetypes) finish.
**When:** Core weapon of counter-attacking and hybrid identities (Sections 5–6); situationally available to everyone.
**Coaching points:** The first two seconds decide the counter — face forward, play forward. If the vertical pass isn't on by pass two, keep the ball and reorganise (don't waste the regain).

### C2. Long Ball & The Second-Ball Game
**Blurb:** Skip the build-up: hit the target man or the channels directly. The contest isn't the first ball — it's the *second ball* (the knockdown, flick, or loose ball), and the team structured to swarm it wins the territory.
**Animation:** 1) GK/CB launches to the Target Man vs a CB. 2) A pre-set "second-ball cage": 8s and wide players positioned in a 10–15m ring *before* the ball lands. 3) Second ball won → immediate forward action (shot, through-ball, or wide release).
**Roles:** Target Man; Box-to-Box 8s with Aerial & Physical + Pressing Engine; second striker on the shoulder for flick-ons.
**When:** Vs high presses (go over them), bad pitches, youth contexts where build-up risk is high, or as a deliberate identity (see Mexico, Section 7).
**Coaching points:** "Long ball" is not "hopeful ball" — the target and the cage are pre-planned. Compactness *around the landing zone* is the whole game.

### C3. Runs in Behind (The Runner)
**Blurb:** The simplest devastating pattern: one pass, one run, goal. The runner starts on the last shoulder, curves to stay onside, and attacks the space behind the line the moment a passer gets his head up.
**Animation:** 1) Passer receives facing forward (the trigger). 2) Runner's curved run from CB's blind side. 3) Ball played into space (not to feet) between/behind the CBs.
**Roles:** Runner-in-Behind, Wide Forward; passer needs Passing Range 4+.
**When:** Opponent holds a high line; also the natural partner of every bounce/third-man pattern (A4/A5 end with this run).

## 3D. Pressing & Defending

### D1. Pressing Triggers
**Blurb:** A press is not chasing — it's a coordinated spring released by specific cues: a back-pass, a bad first touch, a pass to a weak-foot fullback, a bouncing ball, the ball travelling to a touchline (the sideline is an extra defender).
**Animation:** 1) Team holds mid-block shape (patience phase, dimmed). 2) Trigger event flashes (e.g., back-pass to CB). 3) Whole unit jumps in one movement: nearest player curves his run to cut the return pass, next players lock the short options, backline steps up.
**Roles:** Whole team; False 9/pressing striker leads and *sets the curve*.
**When:** Teachable to any identity; the aggressive version defines gegenpressing sides (Liverpool, Bayern 19/20).
**Coaching points:** Press the *pass*, not the man — arrive as the ball arrives. One player pressing alone is worse than nobody pressing.

### D2. Counterpressing (Gegenpressing)
**Blurb:** The instant you lose the ball, the nearest 3–4 players swarm it for ~5 seconds instead of retreating. The opponent who just won it is facing his own goal, off-balance, teammates disconnected — losing the ball is your best pressing trigger. Regains here are also your best *chances*: the opponent is mid-transition and unorganised (the counter-attack against the counter-attack).
**Animation:** 1) Possession lost (flash). 2) 5-second swarm radius appears around the ball; nearest players collapse in, others cut passing lanes. 3a) Regain → immediate vertical attack, or 3b) 5 seconds expire → drop into block shape.
**Roles:** Requires Pressing Engine 4+ and High DWR across the front six; enabled structurally by short passing distances in possession (you counterpress well because you were *compact* when you lost it).
**When:** Identity-defining for Klopp's Liverpool ("gegenpressing is the best playmaker") and Barça's "6-second rule."

### D3. Defensive Blocks (High / Mid / Low) & Park-the-Bus
**Blurb:** Where does your team stand without the ball? High block: defend in *their* third, win it near their goal, big space behind you. Mid block: protect central space, invite them wide, spring counters. Low block ("park the bus"): two banks of 4–5 at the edge of your box, concede territory, concede nothing central, and break with pace.
**Animation:** Toggleable overlay showing the same XI's rest positions in each block, with the vulnerable space shaded (behind the line for high; in front of the block for low).
**Roles:** Low block demands Positional Discipline everywhere and pace up front to make the counter (C1) real — a bus with no outlet just gets besieged.
**When:** The block choice is half of a team identity (Section 5); also the standard in-game state-management tool (protecting a lead).

### D4. Rest Defence
**Blurb:** Your defensive shape *while attacking* — the 2–3 players (CBs + pivot, or CBs + inverted FB) positioned behind the ball before you lose it, so the opponent's counter dies at birth.
**Animation:** During any attacking pattern, highlight the 3 players holding the counter-stopping structure behind the ball.
**Roles:** Covering CBs, Single Pivot, Inverted Fullback (a core reason the inverted-FB role exists).
**When:** Bundled as a "defence" layer on every attacking pattern — a differentiating teaching detail for the app.

## 3E. Pitch Geography — Danger Zones (shared visual vocabulary)

Constant overlay vocabulary for the whiteboard; every pattern above references these zones.

- **The Half-Spaces:** the two vertical corridors between centre and wing. The most valuable creative real estate: receive here on the half-turn and you have passing angles a central or wide player doesn't. Home of the Advanced 8, the Inside Forward's dribble, and the underlap.
- **Zone 14:** the central zone just outside the opposition box. Classic 10 territory; most assists in world football originate here or in the half-spaces beside it.
- **The Cutback Zone:** the area between the byline and the six-yard box. A pull-back from here to the penalty spot is statistically among the highest-value passes in football — the finishing pattern behind countless overlap/underlap sequences.
- **The Channels:** seams between CB and FB. Where Runners-in-Behind and Wide Forwards live.
- **The Second-Ball Ring:** the 10–15m radius around a long ball's landing point (see C2).
- **Between the Lines:** the horizontal strip between opposition midfield and defence — the target of every line-breaking pass; where 10s, False 9s and mezzalas receive.

---
## 3F. Delivery Library — Crossing & Through-Ball Types

Not every cross or through ball is the same pattern. Delivery is a first-class content object with its own framework (3F.0): a cross is a *zone × trajectory × target-corridor* decision plus a run package — and each named type below has its own trigger, technique, receiver runs, and identity fit. In the animation builder these become selectable ball-trajectory styles (ground/driven/whipped/floated/clipped) and delivery-zone origins, so a saved pattern specifies not just *where* the ball goes but *how* and *from where*.

### 3F.0 The Crossing Framework — Zone × Trajectory × Runs

A cross is fully specified by three choices, and the app should treat them as three independent selectors in the pattern builder:

**1. Delivery zone (where it's hit from):**
- **Byline zone** — deepest wide position, behind the defensive line; the defence is facing its own goal.
- **Half-space channel** — the corridor between fullback and CB, 10–20m from the byline (the "De Bruyne zone"); the tightest angle defenders can't set up against, because reaching it *already means the block is broken*.
- **Wide-early zone** — level with or in front of the defensive line, near the touchline; the block hasn't set yet.
- **Deep zone** — near halfway/outside the block; only for switch-crosses and floated diagonals (F6).

**2. Trajectory:** ground (carpet) / driven (flat, pace) / whipped (curled, pace, dipping) / floated (hung, height).

**3. Target corridor (where it should arrive):**
- **Near-post corridor** (front of the six-yard box) — for darts and flicks.
- **The "corridor of uncertainty"** — the strip between the keeper and the retreating back line: too far out to claim, too close in to defend facing your own goal. The whipped early cross (F2) lives here.
- **Penalty spot / cutback zone** — for arriving runners, defenders facing the wrong way.
- **Back-post corridor** — beyond the far CB, for ghosting arrivals (Raumdeuter, far wingback).
- **Edge-of-box (the negative zone)** — pulled back *away* from goal for the second-wave shooter.

**The Four-Run Box Occupation (standard run package):** every crossing pattern should ship with this default off-ball choreography — 1) near-post dart (drags the front defender, even as a decoy); 2) penalty-spot arrival (the primary target, arriving not waiting); 3) back-post ghost (widest, latest, outside the far CB's vision); 4) edge-of-box second wave (the negative-zone shooter and first counterpress body if it breaks down). Four runs, four corridors, every time — teach the *occupation*, then vary who runs which. This is a rotation-style team pattern (5B logic) and should render as one.

**Universal coaching points:** cross into a *corridor*, not to a man — the runner's job is to meet it; deliver before the defender can set his feet (a half-beat early beats a perfect ball late); runners arrive at pace at the moment of delivery, never stand and wait (a standing attacker is a marked attacker); the crosser's first look is the cutback, second the corridor of uncertainty, third the back post — in that order of value.

**Choosing the cross — defensive situation → delivery:**
| Situation | Best delivery | Why |
|---|---|---|
| Set low block, packed box | F1 cutback or F16 negative cross | Aerial duels are lost before they start; go where defenders must turn |
| Defence retreating toward goal | F2 whipped early into the corridor of uncertainty | They're facing the wrong way at full sprint — any touch is chaos |
| Aerial mismatch available | F4 floated back-post | Isolate the mismatch away from the keeper |
| Keeper dominant in the air | F3/F15 ground or driven deliveries | Take the claim away entirely |
| You've broken into the half-space | F14 half-space whip behind the line | The angle defenders never practice against |
| Runners not yet in the box | Hold — recycle (A4/B3) and re-enter | The worst cross is the one hit because you got there |

### Crossing Types
**F1. Byline Cutback.** Reach the byline, pull it back low to the penalty spot / cutback zone (3E) against defenders running toward their own goal — statistically the highest-value delivery in football. Runs: one to the spot, one late at the edge. Deliverers: Overlapping FBs, Touchline Wingers. Identity fit: everyone; the possession identities' primary box entry.
**F2. Whipped Early Cross.** Hit from deep/wide *before* the block sets, curled with pace into the corridor between keeper and back line — attacks a retreating defence; the receiver's run meets it, no touch needed. Exemplar: Alexander-Arnold, peak Beckham. Deliverers: Passing Range 5 wide players/FBs. Identity fit: counter and hybrid identities (arrives while the defence is turned).
**F3. Low Driven Cross / Flash Ball.** Flat, hard, across the six-yard box — nobody needs to win a duel, just touch it. De Bruyne's signature from the right half-space. Identity fit: pressing/vertical identities (chaos-friendly: even a miss becomes a second ball).
**F4. Floated Back-Post Cross.** Hung up high to the far post for an aerial mismatch or a ghosting arrival (Raumdeuter, far-side wingback — Atalanta's finisher run, 6.14). Deliverers: any; pairs with Target Man and Big–Little units (2B.1).
**F5. In-swinger vs Out-swinger (footedness rule).** An *inverted* wide player delivers in-swinging (curling toward goal — dangerous, attackable in stride); a *natural-side* player delivers out-swinging (curling away — safer from the keeper, suits arriving headers). The app should surface this automatically from the crosser's preferred foot + side: it's a genuine coaching detail hiding in data the roster already has.
**F6. Deep Diagonal Cross (switch-cross hybrid).** A B3 switch aimed *into the box* rather than to feet — far-post wingback/winger attacks it directly. Home: back-three identities (wingback finisher).

**F14. Half-Space Cross (the De Bruyne delivery).** Hit from the half-space channel — *inside* the fullback, level with the box — whipped with the instep behind the defensive line toward penalty-spot/back-post corridors. Why it's elite: the delivery angle is nearly a through-ball's, so defenders are caught side-on between the ball and their runner; and occupying the half-space at all means a CB or pivot has already been displaced. Execution: receive on the half-turn (Mezzala/Inside Forward territory, 3E), one touch out of the feet toward the byline-side, wrap the ball around the first defender's standing leg side. Identity fit: possession and box-midfield systems (5B.6 — R16's ball-side 8 makes exactly this delivery).
**F15. Ground Cross (the carpet delivery).** A firm, flat pass — not a hit — along the ground from the wide or byline zone, threaded through the gap between the retreating back line and the keeper. Different from F1 (which is pulled *backward* from the byline) and F3 (which is *driven* with violence): the ground cross is weighted like a pass to a moving teammate's stride. Best vs a dominant aerial keeper or giant CBs — it deletes their advantages. Execution: inside-of-foot, laces-down weight, aimed at the penalty-spot corridor for the arriving runner's *front foot* so the finish is one touch. Common error to coach out: hitting it to where the runner *is* instead of where his stride will be.
**F16. Negative Cross / Pull-Back to the Second Wave.** Deliberately pulled back *away* from goal to the edge-of-box zone, ignoring the crowded six-yard area entirely — for the late-arriving 8 or resting playmaker to shoot or restart the attack. The counterintuitive coaching point: when the box is packed, the most dangerous space is *behind* the crowd, because every defender is retreating and nobody steps out. Pairs with R16 (opposite-arrival 8s) and doubles as counterpress insurance (the second-wave player is already the D4 screen if it's cleared). Exemplar habitat: City and Liverpool's sustained-pressure phases.

### Through-Ball Types
**F7. Slide-Rule Ground Through Ball.** Threaded flat into the CB–FB channel, weighted to the runner's stride. The Feeder & Finisher unit's (2B.1) bread and butter. Requires: Passing Range 4+, a C3 runner.
**F8. Ball Over the Top (clipped).** Aerial, over a high line into space — the counter identity's 40-yard dagger and the punishment for every bad press. Exemplars: Alonso → Ronaldo; Drinkwater → Vardy (6.10). The pass is airborne *before* the defence's shape turns.
**F9. The Dink / Scoop.** Short-range chip over a compact, set defence from Zone 14 — when the ground lane is closed but the line is frozen. High skill, low distance.
**F10. Reverse Pass.** Played *against the grain* of the passer's body shape and dribble direction — the disguise is the weapon; defenders shift with the dribble and the ball goes the other way. Signature of elite 10s (Özil, Silva). Pairs with Inside Forward diagonal runs.
**F11. Around-the-Corner Flick.** First-time redirect by a back-to-goal player (Target/False 9) sending a runner into the channel — the one-touch fusion of A4 and F7.
**F12. Trivela (outside-of-boot).** Bends *around* a defender while letting the runner stay onside longer — Modrić/De Bruyne signature; also the natural line-breaker for a player on their "wrong" side.
**F13. Channel Ball (territory pass).** Direct identities' staple: played into the corner-space *for the chase*, not to a precise run — turns the opponent around, wins territory even when not "completed." The honest cousin of F8; a possession identity would log it as a turnover, a direct identity logs it as a win (see 5.7).

---

## 3G. Numerical Superiority — Rondos, the Rondo Map & Formation Matchups

The unifying theory under Sections 3A/3B: almost every pattern exists to create or exploit a **superiority**. Coaching content should name the three classic types: **numerical** (more players than them in a zone — 3v2), **positional** (same numbers, better placed — the free man between the lines), and **qualitative** (1v1 where your player simply wins — B4 isolation). The genius of small-sided training is that the 11v11 game *decomposes* into these situations — and the app can show that decomposition visually.

### 3G.1 The Rondo & Small-Sided Library
Each rondo maps to specific concepts — a session-planner (Phase 1.5) goldmine, because every saved pattern can suggest the rondo that trains it:

| Game | Setup | What it actually teaches | Trains concepts |
|---|---|---|---|
| **4v2** | Square, 4 outside vs 2 inside | The split pass (through both defenders = a line broken), third-man angles, and B8: the pass through the pair only opens when they commit | A5, B8, B5 |
| **5v2** | The classic circle/square | One- and two-touch speed, body shape (receive half-turned), support angles off the ball | A3, A4, first-touch foundation |
| **5v3** | Square, directional option | Now the defenders can *cover* — teaches playing around vs through vs over a mini-block, and the pause (B8) | B2, B8, A5 |
| **3v1 chained** | Two zones, ball travels between | The simplest free-man logic: 2 pass options always exist — find the one the defender isn't shading | B5 first-line logic |
| **4v4+3 (neutrals)** | Possession game, neutrals play with ball side | Transitions both ways + counterpress the instant it's lost — the D2 trainer | D2, C1 |
| **6v6+3 positional game** | Zoned grid, positions fixed | The full juego de posición engine: zone occupation, rotations (B1), switching through the free neutral | B1, B2, B3 |
| **2v1 → 2v2 flank channel** | Wide corridor | The overlap/underlap decision tree in its pure form | A1, A2, F1 |

### 3G.2 The Rondo Map — where each situation lives in the real game
The teaching visualization the user's whiteboard is built for: overlay an 11v11 formation and highlight, zone by zone, **which rondo is happening there**. The 11v11 game is a chain of rondos:

- **First-line build-up = the 4v2 / 3v2.** Two CBs + pivot (+ keeper) vs two pressing strikers — literally the 4v2 rondo, played at the edge of your box (B5/B6 are its solutions).
- **The midfield box = the 5v3.** Double pivot + 10 + stepping CB vs their midfield triangle: same geometry, same split-pass and pause logic as the 5v3 square.
- **The flank corridor = the 2v1/2v2 channel game.** Winger + FB vs their FB (+ tracking winger): every A1/A2 decision is the corridor rondo.
- **The last line = 2v2 (+1 keeper).** Strikers vs CBs: the qualitative-superiority zone where pins, scissors (R12), and C3 runs decide it.
- **Counterpress moments = 4v4+3.** The 5-second swarm (D2) is the neutral-player transition game with real stakes.
**Product note:** this is a premium visual — tap any zone of a saved formation and see "this is a 4v2; here's the rondo that trains it; here's the pattern that solves it." It closes the app's whole loop: match situation → concept → training design, in one screen.

### 3G.3 Formation Matchups — where the free man naturally lives
Superiorities aren't only created — some are *structural*, gifted by how two formations overlay. The matchup layer shows, for any pair of shapes, where the numbers fall (a Phase-2 whiteboard overlay: place opponent shape over yours; over/underloaded zones auto-highlight):

| Matchup | Your structural edges | Their edges / your risks | How the ball finds it |
|---|---|---|---|
| **4-3-3 vs 4-4-2** | Spare CB in build-up (2v1... 3v2 with pivot); 3v2 central midfield | Their 2 STs threaten your split CBs on turnovers | Circulate CB→CB to fix their strikers, pivot receives as the +1, find the free 8 between their lines |
| **4-3-3 vs 4-2-3-1** | Wide 2v1s if their wingers press high | Their 10 sits on your single pivot — your 3v2 midfield becomes marked | B7/R4: a CB steps in or the 6–8 swap to regenerate the free man their 10 erased |
| **4-2-3-1 vs 4-4-2** | Your 10 is *structurally unmarked* between their lines | Central 2v2 pivot battle — no spare | Third-side circulation: play left, switch right, hit the 10 on the second switch as their block chases |
| **4-4-2 vs 4-3-3** | 2 STs vs 2 CBs (no spare for them — press their build-up hard); second-ball parity | 2v3 central midfield — you *will* be outnumbered there | Don't fight the 3v2: go over it (C2) or around it (wide traps, D1), win it back in their half |
| **3-5-2 vs 4-3-3** | Spare wide CB in build-up; 3v3→5v3 central overload with WBs tucking | Their wingers vs your WBs: who pins whom decides the game | Wide CB carries (B7) to force their winger's decision; strikers' scissors (R12) vs their 2 CBs |
| **3-4-3 vs 4-2-3-1** | Front 3 + WBs = 5-lane last-line pin vs their back 4 | 2v3 in central midfield vs their pivot + 10 | Skip midfield: back 3 → WBs or direct to the front 3's bounce (A4), midfield joins on second balls |

**Content rule:** every matchup card teaches the same three-step read — *where is our spare man → where are we short → which route (through/around/over) connects the spare to the shortage.* That read, not any single answer, is the transferable skill.

---

# SECTION 4 — FORMATION LIBRARY

Template per formation: **Shape blurb → Strengths → Vulnerabilities & danger areas conceded → Keystone positions (the whiteboard-highlight feature) → Natural identities**.

**Product note — Keystone Positions:** on the whiteboard, each preset formation ships with 2–3 positions visually highlighted (glow/pulse). Tapping one shows a blurb: *why this position makes or breaks the formation and what profile it needs.* This is the "identify key players in formations" feature — the blurbs below are that copy.

## 4.1 — 4-3-3
**Shape:** Back four; single pivot (6) behind two 8s; striker flanked by two wide forwards.
**Strengths:** Natural triangles everywhere; built for wide overloads, third-man play, and a high press (front three cover their back three/four). The default vehicle of positional-play identities.
**Vulnerabilities / danger areas:** The space *beside the single pivot* — a 4-4-2 diamond or a 10 drifting into the half-space attacks where the lone 6 can't be. Counters through the space *behind attacking fullbacks*.
**Keystone positions:**
- **The 6 (single pivot):** "The whole machine balances on this player. Needs Passing Range and elite Positional Discipline — if he's bypassed, the back four is naked." (Busquets archetype.)
- **The 9:** "Choose the identity: a Runner stretches the game vertically; a False 9 collapses it centrally. This choice defines what the wingers do."
- **The 8s:** "Half-space engines — must combine High/High work rate with the craft to receive between lines."
**Natural identities:** Possession/positional (Barça), gegenpress (Liverpool).

## 4.2 — 4-2-3-1
**Shape:** Back four; double pivot; a 10 flanked by two wingers behind a lone 9.
**Strengths:** The most balanced modern shape. Double pivot gives counter-security and two build-up outlets; the 10 gets a protected creative station; converts cleanly to 4-4-2 mid-block without the ball.
**Vulnerabilities / danger areas:** The *sides of the double pivot* (half-spaces in front of the fullbacks); a lone 9 can get isolated if the 10 and wingers don't support quickly; if both pivots are destroyers the team goes sterile.
**Keystone positions:**
- **The 10:** "The system exists to feed this player between the lines. Needs press-resistance and the final pass — if the 10 is marked out, the whole shape must have a Plan B (usually the wingers in behind)." (Özil/Griezmann archetypes.)
- **The double pivot pairing:** "Balance is everything: one controller + one destroyer/runner (Alonso + Khedira, Kimmich + Goretzka). Two of the same profile halves the shape's value."
**Natural identities:** Counter-attack (Mourinho's Madrid), high-intensity press (Bayern 19/20), pragmatic tournament football (France 2018).

## 4.3 — 4-4-2 (flat)
**Shape:** Two banks of four, two strikers.
**Strengths:** Simplest to teach and the gold standard *defensive* shape — compact, clear zones, every player knows his job. Two strikers permanently occupy both CBs (great for counters and second balls). Ideal youth base shape.
**Vulnerabilities / danger areas:** Outnumbered 2v3 in central midfield vs any three-man midfield; the space *between the lines* behind the midfield four (Zone 14) if the banks stretch apart.
**Keystone positions:**
- **The two CMs:** "Two must do the work of three. Box-to-box engines with discipline — the shape lives or dies on their compactness."
- **The strike partnership:** "One target/link + one runner. Their pairing chemistry *is* the attack: bounce (A4) and run in behind (C3) off each other all game."
**Natural identities:** Low/mid-block counter, long-ball & second-ball identities.

## 4.4 — 3-5-2
**Shape:** Three CBs; two wingbacks owning the flanks; three central mids; two strikers.
**Strengths:** Central overload (3 CMs + 2 STs) plus a spare CB in build-up; wingbacks give width without sacrificing back-line numbers; strike partnership again.
**Vulnerabilities / danger areas:** The *space behind the wingbacks* is the formation's known weakness — if a wingback is pinned deep the shape collapses to a flat, passive 5-3-2; wide CBs get dragged into unfamiliar 1v1s in the channels.
**Keystone positions:**
- **The wingbacks:** "The most demanding role on the pitch — they are the *entire* width, both ways. Without genuine High/High engines here, do not pick this shape."
- **The central CB:** "Organiser and spare man; ideally the ball-player who steps into midfield (B7)."
**Natural identities:** Counter-attack with a back-five safety net; possession variants with elite wingbacks.

## 4.5 — 3-4-3
**Shape:** Three CBs, two wingbacks, two central mids, a front three.
**Strengths:** Ferocious in the press (front three + wingbacks jumping = five pressers); wide overloads (wingback + wide forward pairs); spare man in build-up.
**Vulnerabilities / danger areas:** Only *two* central midfielders — vs a 4-3-3's three they can be overrun; same behind-the-wingbacks exposure as 3-5-2.
**Keystone positions:**
- **The double pivot:** "Two players covering the width of the pitch's engine room — must be the two fittest, smartest midfielders in the squad."
- **The wide forwards:** "Half-space assassins playing off the 9, with wingbacks supplying width outside them."
**Natural identities:** Aggressive pressing sides; hybrid possession-press.

## 4.6 — 5-4-1 / 5-3-2 (the low-block family)
**Shape:** Back five, midfield four (or three), lone striker (or two).
**Strengths:** The park-the-bus reference shape: covers the full width of the box with five, kills crosses and cutbacks, funnels everything into low-value long shots. With one/two pacey outlets, it *is* the counter-attack identity's home shape.
**Vulnerabilities / danger areas:** Almost no possession relief — without a functioning outlet (target or runner) the block faces 90 minutes of siege; second balls around the box become constant emergencies.
**Keystone positions:**
- **The outlet striker:** "The most important defender on the team plays up front: if he can't hold the ball or win his sprint, the block never breathes." 
- **The central CB of the five:** "Commands the box, wins everything aerial, organises the line vocally."
**Natural identities:** Park-the-bus + counter; game-state management (protecting leads).

---

# SECTION 5 — TEAM STYLE ARCHETYPES (Identity Layer)

These are optional "identities" a coach can adopt as a *starting curation* for their team — per the governing principle (0.1), an identity bundles a preferred block (D3), a build-up approach, a transition rule, and a suggested starter set of patterns from Section 3, but never restricts access to anything. Coaches can mix freely across archetypes or skip identity selection entirely. Reference teams in Section 6 are named, historical versions of these archetypes — shown as worked examples of how the same universal patterns get weighted differently, not as templates to copy wholesale.

### 5.1 Positional Possession ("Control")
Keep the ball to control the game; move the opponent's shape (B2) until it breaks; counterpress instantly on loss so the opponent never transitions. Block: high. Build-up: short from the GK (B5/B6). Transition rule: lose it → 5-second swarm (D2). Starter patterns: B5, B6, A5, B3, B1. Player demands: Passing Range and Positional Discipline throughout; a true 6. Risk profile: vulnerable to elite counters if rest defence (D4) is sloppy. 
**Ideal archetype blueprint (4-3-3):** Sweeper Keeper — two Ball-Playing CBs (at least one a Stepping CB, B7) — Overlapping FB one side, Inverted FB the other — Single Pivot (DLP) — Controller 8 + Mezzala — False 9 — Inside Forward one flank, Touchline Winger the other (width and inside threat on opposite sides). **Core synergy units (2B):** Build-Out Spine, Anchor & Arrows, The Vacuum, Rest-Defence Flank.

### 5.2 Counter-Attack Pace ("Vertical")
Concede the ball on purpose; defend a compact mid/low block; win it and go for the throat in under 10 seconds. Block: mid-to-low. Build-up: direct and vertical, minimal passes. Transition rule: win it → first pass forward, two runners minimum. Starter patterns: C1, C3, B4 (isolation for the star winger), D3. Player demands: elite Pace in the front three; a destroyer 6; a transition-10. Risk profile: struggles to create when *forced* to have the ball (opponent parks instead). 
**Ideal archetype blueprint (4-2-3-1):** keeper with quick, accurate long distribution — Stopper + Covering CB — Defensive FB on the free winger's side, one attacking FB opposite — Controller with deep vertical range + Destroyer pivot — Transition 10 — two Wide Forwards with elite Pace — Runner-in-Behind 9. **Core synergy units (2B):** Brain & Shield, Feeder & Finisher, Quarterback Link, Flank Balance.

### 5.3 Gegenpress / High-Intensity ("Chaos on Purpose")
The press is the playmaker: suffocate opponents high, win the ball 30 metres from goal, score before they reset. Block: very high. Build-up: fast, forward, comfortable going direct to skip the press phase. Transition rule: both ways — counterpress on loss (D2), instant vertical on regain (C1). Starter patterns: D1, D2, C1, A1 (overlaps from flying fullbacks). Player demands: Pressing Engine 4+ across the front six, High/High work rates, a high-line CB pairing with recovery pace, a sweeper keeper. Risk profile: physically brutal; one broken press line = 1v1 with your keeper. 
**Ideal archetype blueprint (4-3-3):** Sweeper Keeper — Covering CB with elite recovery pace + strong partner — two High/High Overlapping FBs (they are the width *and* the creators) — Anchor 6 — two Box-to-Box 8s — Pressing False 9 — two Inside Forwards. **Core synergy units (2B):** High-Line Contract (non-negotiable), The Vacuum, Inverted Pair ×2, Engine & Insurance.

### 5.4 Low-Block Counter ("Park the Bus & Break")
Two banks, zero space between the lines, total positional discipline — then release one or two sprinters into 60 metres of grass. Block: low (D3). Starter patterns: D3, C1, C2 (outlet long balls), C3. Player demands: discipline everywhere; an outlet striker; at least one game-breaking runner. Risk profile: thin margins — one set-piece concession can end the game plan. 
**Ideal archetype blueprint (5-4-1):** commanding Shot-Stopper — aerial organising central CB + two mobile CBs — two disciplined Wingbacks (Low-Med/High) — two Destroyer/Box-to-Box CMs + two tracking wide mids — one outlet: Target Man *or* elite-pace Runner (in the 5-3-2 variant, the Big–Little partnership gives both). **Core synergy units (2B):** Pin & Sprint; hard rule: never a bus without an outlet (anti-synergy 2B.4).

### 5.5 Direct & Second Ball ("Territory")
Play the percentages: go long to a target early, structure the team around winning the second ball (C2), and camp in the opponent's half. Aggressive, physical, front-foot. Block: mid, with heavy counterpressing *of second balls*. Starter patterns: C2, A4, D1, set-piece emphasis. Player demands: Target Man, aerial 8s, Pressing Engine everywhere. Risk profile: low control; can be dismantled by a calm build-up team if the first press wave misses. 
**Ideal archetype blueprint (4-4-2):** keeper with a long, flat launch — two aerial-dominant CBs — Defensive FBs — two aerial Box-to-Box CMs (the second-ball cage) — two Touchline Wingers for territory and crossing — Big–Little strike partnership (the target *is* the first pass's destination). **Core synergy units (2B):** Big–Little, Pin & Sprint, Engine & Insurance.

### 5.6 Hybrid / Transition Control ("Tournament Pragmatism")
The modern winner's profile: comfortable in possession *and* in a block, chooses per opponent and per game state. Baseline: solid mid-block + elite transitions; can hold the ball to kill games. Starter patterns: a curated mix — B5, C1, D3, A4, B3. Player demands: tactical intelligence over any single physical trait; versatile roles (e.g., a 10 who defends, a defensive fullback opposite an attacking one). This is France 2018's home (Section 6.1) — and realistically the sanest default identity for a youth team. 
**Ideal archetype blueprint (4-2-3-1, the France 2018 template):** keeper comfortable short and long — Stopper + Covering CB — *asymmetric flanks:* Defensive FB behind the free-role Wide Forward; attacking FB behind a tucked-in High/High wide worker — Destroyer + Controller pivot — working 10/Second-Striker hybrid (High DWR) — Target Man 9. **Core synergy units (2B):** Pin & Sprint, Flank Balance (as deliberate asymmetry), Brain & Shield, Feeder & Finisher.

---
### 5.7 Pass Selection & Risk Profiles — "a good pass depends on the shirt"

**Principle:** there is no universal 'good pass.' Each identity defines its own acceptable passing menu — the same 40-yard ball into the channel is a *sin* in a positional identity (possession surrendered, shape broken) and *the entire plan* in a direct one (territory won, second-ball cage activated). The app must never grade passes style-neutrally; pattern content, coaching copy, and any future analytics inherit the active identity's profile.

| Identity | Encouraged | Tolerated | Discouraged | Tempo rule |
|---|---|---|---|---|
| 5.1 Positional Possession | Short circulation, line-breakers into feet, F7, B3 switches (prepared), F1 cutbacks | F9, F10 in final third | F8/F13 hopeful balls, unprepared long diagonals, crossing for volume | Slow-slow-fast: circulate patiently, accelerate only through gaps |
| 5.2 Counter-Attack Pace | First-pass-forward, F8 over the top, F7, F2 early crosses | F13 to relieve pressure | Slow lateral circulation in transition ("wasting the regain") | Fast on regain (10s), calm reset if the window closes |
| 5.3 Gegenpress | Vertical ground passes, F3 driven crosses, quick F7 after regains | Direct F8 to skip a press phase | Square/back passes under no pressure (Rangnick's cultural sin, 6.15) | Always forward-first; possession is a means, not a KPI |
| 5.4 Low-Block Counter | F13 channel outlets, long clearances *to the Target*, F8 when sprung | Anything that gains 10 seconds of rest | Risky short build-up near own box | Two speeds only: dead slow (with ball, killing tempo) and maximal (the break) |
| 5.5 Direct & Second Ball | F13, long diagonals to the Target (C2), F4 floated crosses, throw-ins forward | F2 early crosses | Short GK build-up, pivot-drop patterns (B6 is off-menu) | High constant tempo; the ball goes forward or it goes long |
| 5.6 Hybrid | Context-switched: possession menu when controlling, counter menu on transition | Everything, situationally | Nothing categorically — *decision quality* is the graded skill | Game-state driven: winning = 5.1's menu, chasing = 5.2's |

**Fit-engine implication — attribute thresholds shift by identity.** A player's required Passing Range (1.3) is not fixed per position; it's per position *within an identity*. A CB in a positional identity needs Passing Range 4+ (he is a playmaker); the same CB slot in a direct identity needs 2 (his 'pass' is a launch, and Aerial & Physical is the premium instead). The fit engine should read thresholds from the identity's blueprint, not from the position alone — this is the difference between an app that knows football and one that knows FIFA.

---

# SECTION 5B — COLLECTIVE MOVEMENT & ROTATION SYSTEMS (per formation × identity)

Distinct from Section 3A combinations: combos are 2–3 player, ball-near actions (give-and-go, overlap). **Rotation systems are whole-unit, off-ball choreography** — the structural swaps and coordinated movements a team runs *continuously*, often nowhere near the ball, to create the free men that the combos then exploit. This is its own content library: each entry is a loopable "system animation" (the team-as-one-unit view from PRD 5.2.4 is built for exactly this). Template: **Trigger → choreography (numbered) → what it creates → the defender's dilemma.**

### 5B.1 — 4-3-3 Positional (Barça 6.2 / City lineage)
**R1. False-9 Drop & Wing Dive.** Trigger: ball reaches the 6/8 facing forward. 1) 9 drops between the lines; 2) *both* wingers cut diagonal runs into the channels the instant he drops; 3) near 8 pushes to occupy the vacated 9 space. Creates: a free receiver (the 9) *and* two runners simultaneously. Dilemma: CB follows the 9 (channel opens behind him) or passes him off (free man between lines). The single most copied rotation of the modern era.
**R2. Salida Chain.** Trigger: goal kick / deep restart vs a two-striker press. 1) 6 drops between splitting CBs (B6); 2) both FBs push to midfield height; 3) 8s rise between the lines; 4) wingers pin maximum width. Creates: 3v2 first line, 7 players ahead of the ball in structure. Dilemma: press the back three with a third player and open the midfield, or concede the calm out-ball.
**R3. Wide Triangle Carousel.** Trigger: ball-side circulation vs a set block (the full version of B1). 1) Winger comes inside to the half-space; 2) 8 spins out to the touchline lane; 3) FB underlaps or holds. One rotation per 2–3 passes, direction alternating. Creates: a perpetually "wrong-marked" flank. Dilemma: track and get dragged out of the block's shape, or zone off and concede the free man.
**R4. Pivot–Eight Vertical Swap.** Trigger: opponent man-marks the 6 (the Busquets problem). 1) 6 pushes forward taking his marker with him; 2) an 8 drops into the vacated base to receive. Creates: a clean first-line outlet without adding a CB. Dilemma: markers swap (communication error window) or follow (structure dragged apart).

### 5B.2 — 4-3-3 Gegenpress (Liverpool 6.4)
**R5. Firmino Vacuum + Narrow Dive.** Trigger: ball advances past halfway. 1) 9 drops toward the ball; 2) both Inside Forwards squeeze narrow onto the last line, occupying all four defenders between just them; 3) *all* width transfers to the FBs, who push like wingers. Creates: 2v4 pinning centrally that frees both flanks entirely. Dilemma: fullbacks track Salah/Mané inside (FBs get the byline) or hold width (IFs get the channels).
**R6. Overlap-and-Fill.** Trigger: FB releases into an A1 overlap. 1) TAA/Robertson bombs on; 2) the near 8 (Henderson role) slides *behind* him into the FB slot; 3) the 6 shifts across to re-centre the rest defence (D4). Creates: a permanent overlap license with zero counter exposure. Dilemma: none for the opponent — this one is *internal* choreography; the teaching point is that aggressive rotations are bought with covering rotations.
**Deliberate rigidity note:** the midfield three barely rotates — press structure outranks positional fluidity. Rotation is a *tool*, not a virtue; identities choose how much of it they can afford. This sentence belongs in the section's intro copy.

### 5B.3 — 4-2-3-1 Counter (Mourinho Madrid 6.6)
**R7. The Transition Triangle.** Trigger: regain (the transition clock starts). 1) 10 (Özil) sprints to the ball-side half-space to receive the first vertical pass; 2) 9 bends a channel run to the *far* side; 3) far winger cuts inside on a diagonal at full sprint; 4) near winger stays wide as the late outlet. Creates: three forward options inside 3 seconds, arranged in a triangle the recovering defence can't screen all at once. Dilemma: pure arithmetic — retreating defenders must choose two of three lanes.
**R8. Block Breathing.** Trigger: sustained opposition possession. 1) The 4-4-1-1 block shifts side-to-side *as one*, never breaking lines; 2) the 10 and 9 alternate who presses and who rests on the counter-launch spot. Creates: a permanently loaded outlet without sacrificing block integrity. Dilemma: the opponent's rest defence must respect a threat that never disappears.

### 5B.4 — 4-2-3-1 High Press (Bayern 6.5)
**R9. The Müller Carousel.** Trigger: ball enters the final third. 1) Lewandowski drops short (A4 bounce available); 2) Müller instantly runs *beyond* him from the 10 slot — the pair swap vertically; 3) near winger holds width, far winger attacks the back post (F4 target). Creates: a striker presence that never leaves even as the striker drops. Dilemma: the CB pairing faces a drop-and-run scissor every 30 seconds for 90 minutes.
**R10. Davies Release.** Trigger: possession secured on the left. 1) LB (Davies) pushes to winger height; 2) LCB (Alaba role) slides wide-left to cover; 3) RCB shifts central, RB (Kimmich role) tucks in as a third builder. Creates: back-line asymmetry that adds an attacker while keeping a back three (D4). Dilemma: mark the fastest player on the pitch with a winger, or with nobody.

### 5B.5 — Back-Three Systems (3-5-2 / 3-4-3; 6.11, 6.14, 6.17)
**R11. Wingback Push & Cover Chain.** Trigger: ball switched to a wingback. 1) WB pushes to the byline zone; 2) near wide CB shifts into the channel behind; 3) near CM tilts across. Creates: width with a built-in insurance chain. Dilemma: the opposition winger must defend or the FB must jump — either way a gap.
**R12. The Strikers' Scissors.** Trigger: any facing-forward receiver in midfield. 1) One striker drops short (bounce); 2) the other crosses *behind* him diagonally in the opposite direction. The pair alternates roles every sequence. Creates: constant A4 + C3 availability from one unit. Dilemma: CBs must swap marks mid-action, endlessly — the 3-5-2's whole attacking argument.
**R13. Overlapping CB (Sheffield, 6.17).** Trigger: WB receives, pinned inside by his marker. 1) Outside CB overlaps *beyond his own wingback*; 2) WB tucks into the half-space; 3) remaining two CBs + pivot form the rest-defence triangle. Creates: a crosser nobody's scheme accounts for. Dilemma: unmarkable by design — the marking assignment doesn't exist.
**R14. Atalanta Carousel (6.14).** Trigger: continuous, vs man-marking opponents especially. 1) Front three rotate freely through the 9/10/wide stations; 2) far-side WB times a back-post dive (F4/F6 target) whenever the ball goes wide opposite. Creates: markers dragged into each other; a free finisher arriving from full-back depth. Dilemma: pass off the rotations (free men) or follow (collisions and holes) — Gasperini's bet is that no team communicates well enough for 90 minutes.

### 5B.6 — 3-2-4-1 Box Midfield (City 22/23, 6.13)
**R15. The Stones Step.** Trigger: settled possession. 1) RCB steps from the back line into the pivot beside the 6 (B7 systematised); 2) back line re-sets as a three; 3) the double-8s push to the half-spaces, wingers hold maximum width, 9 pins the CBs. Creates: the 3-2-4-1 box — a +1 in every zone that matters. Dilemma: a shape the opponent's formation has no natural reference points against.
**R16. Opposite-Arrival 8s.** Trigger: ball enters the final third wide. 1) Ball-side 8 supports short (cutback-spot option, F1); 2) far-side 8 delays, then attacks the back post late. Never both to the same spot. Creates: layered box arrivals on every entry. Dilemma: deep defenders must find runners arriving from two depths on two timings.
**Static-pin note:** Haaland barely rotates — *the pin is the point* (B2). Include as a teaching counterexample: in elite systems some players' job is to never move, so everyone else's movement means something.

### 5B.7 — 4-4-2 Direct (5.5, 6.8-adjacent)
**R17. One Short, One Long.** Trigger: every long ball (C2). 1) Target shows to the ball's flight; 2) partner spins in behind off the CB's blind side; 3) near winger collapses onto the second-ball ring, far winger holds width for the recycle. Creates: first-ball, flick-on, and second-ball coverage from one movement. Dilemma: the CB pairing splits — one contests, one retreats — and either job done badly is a chance.
**R18. Lane Discipline (anti-rotation).** The direct 4-4-2 deliberately does *not* rotate: fixed lanes, fixed jobs, predictability as a strength (see 6.8, 6.19 Burnley). Ship this as explicit content — the app teaching *when not to rotate* is exactly the style-agnostic credibility of 0.1.

---

# SECTION 6 — REFERENCE TEAM IDENTITIES (Named Presets)

Premium content: each reference team is a named identity preset a coach can load — formation + principles + signature patterns (pre-built animations from Section 3) + keystone role blurbs. This is the "learn from the greats" layer that gives the app credibility and teaching depth.

Template: **Formation & shape → Core idea (UI blurb) → Signature patterns (pre-built) → Keystone roles → What a youth coach steals from it.**

## 6.1 France 2018 (Deschamps) — *Hybrid / Tournament Pragmatism*
**Formation:** 4-2-3-1 on paper; defended as an asymmetric 4-4-2 (Matuidi, nominally a left "winger," tucked in as an auxiliary midfielder; Mbappé stayed high on the right).
**Core idea:** Concede possession without conceding control. A disciplined mid-block built on the Kanté–Pogba pivot, then two devastating release valves: Mbappé's runs into space (C3/C1) and Griezmann's hybrid 10 work between the lines. Giroud scored zero and was essential — a pure pinning/bounce target (A4) so others attacked the space he created. Plus elite set pieces (Varane, Umtiti, Griezmann delivery).
**Signature patterns:** C1 (regain → Pogba's 50-yard release → Mbappé channel run), A4 (into Giroud, off to Griezmann), asymmetric D3 block, set-piece package.
**Keystone roles:** Kanté (destroyer 6, Low/High), Pogba (deep passer with vertical range), Mbappé (Wide Forward, the role's global reference), Griezmann (working 10/SS hybrid, High DWR), Giroud (Target Man as a *function*, not a scorer).
**Youth takeaway:** You don't need the ball to be in charge. Asymmetry is legal: one flank can defend while the other attacks — build the shape around what your best players actually do.

## 6.2 Barcelona 2008–12 (Guardiola) — *Positional Possession, the reference*
**Formation:** 4-3-3 with a False 9.
**Core idea:** Juego de posición — the pitch divided into zones with strict occupation rules (proper width, staggered heights, never two players in one lane), so there is *always* a free man and *always* a triangle. Messi drops from the 9 into midfield creating a central overload no one solved; wingers hold maximum width to pin the back line (B2); Busquets is the single-pivot metronome. On loss: the famous counterpress ("6-second rule," D2) — possession itself as the defensive system (~70% share meant the opponent simply never had the ball to hurt them).
**Signature patterns:** B5 build-out, B6 salida lavolpiana, A5 third-man (the house style — Xavi's up-back-through), False-9 drop with winger diagonal runs into the vacated space, D2 six-second counterpress.
**Keystone roles:** Busquets (Single Pivot, the archetype), Xavi–Iniesta (controller 8 + half-space 8), Messi (False 9, the archetype), Alves (Overlapping FB supplying all right-side width).
**Youth takeaway:** Positions before players — teach kids to occupy zones and form triangles, and the free man appears by structure, not talent. The rondo is this entire identity in a 10-yard square.

## 6.3 Spain 2008–2012 (Aragonés → Del Bosque) — *Possession as Defence*
**Formation:** 4-3-3 / 4-2-3-1 hybrids; Euro 2012 famously with Fabregas as a False 9 (no recognised striker).
**Core idea:** Tiki-taka at international level: suffocating the game through ball retention. Distinct from Barça's version — often *slower and even more conservative*, prioritising control over chance creation ("the pass is to protect us"). Double pivot of Busquets + Xabi Alonso (2010) gave two deep controllers; Xavi/Iniesta/Silva rotated between the lines (B1). Conceded 2 goals total across knockout football in three straight tournament wins (Euro 2008, WC 2010, Euro 2012) — the possession *was* the defence.
**Signature patterns:** B5, endless B2 (shifting the block until it cracked, often after 70+ minutes of accumulated fatigue), A3 one-twos in tight central areas, B1 rotations.
**Keystone roles:** Double pivot (controller + controller — a deliberate exception to the 4-2-3-1 "one of each" rule, because *control* was the identity), Xavi (tempo dictator), Iniesta (pressure-release dribbler in the half-spaces).
**Youth takeaway:** Patience as a weapon — a team that never gives the ball away cannot lose its shape chasing it. Also: the striker is optional; the free man is not.

## 6.4 Liverpool 2018–20 (Klopp) — *Gegenpress, the reference*
**Formation:** 4-3-3.
**Core idea:** "Gegenpressing is the best playmaker": the moment possession is lost, swarm (D2); the moment it's won, go vertical. Narrow front three — Salah and Mané as Inside Forwards attacking half-spaces and channels, Firmino a pressing False 9 who vacates the centre for them — while *all* width comes from the fullbacks: Alexander-Arnold and Robertson as the primary creators (A1 overlaps, crossing volume, TAA's switches, B3). A very high line behind an organised press, made safe by van Dijk's reading and recovery pace; workmanlike midfield three whose job is running, screening and second balls, not creation.
**Signature patterns:** D2 counterpress → immediate C1, A1 fullback overlaps into the cutback zone (3E), B3 TAA diagonals, D1 press traps on opposition fullbacks.
**Keystone roles:** Firmino (pressing False 9 — the selfless role that makes the wide scorers possible), TAA/Robertson (creator fullbacks), van Dijk (covering CB enabling the high line), Henderson/Fabinho (engine + anchor).
**Youth takeaway:** Effort can be a *system*, not a vibe — pressing has choreography (curved runs, triggers, cover) that can be trained like a passing drill. And width doesn't have to come from wingers.

## 6.5 Bayern Munich 2019–20 (Flick) — *High-Intensity Press + Vertical Possession*
**Formation:** 4-2-3-1.
**Core idea:** The most extreme high line in modern elite football, plus aggressive man-oriented pressing all over the pitch — win the ball high or force panic long balls onto a stepped-up back line. In possession, faster and more vertical than Guardiola-style control: get the ball forward to Lewandowski and Müller early, wingers (Gnabry/Coman) attacking half-space and byline, Davies' recovery pace single-handedly underwriting the high line on the left, Kimmich–Goretzka pivot mixing control with box-crashing runs. Treble winners; the 8-2 vs Barcelona is the identity's exhibition match.
**Signature patterns:** D1 man-oriented press (everyone jumps, keeper sweeps), C1 short counters from high regains, A4→A5 into Lewandowski with Müller as the perpetual third man, A1/A2 on both flanks.
**Keystone roles:** Neuer (Sweeper Keeper, the archetype), Davies (recovery-pace fullback), Kimmich (hybrid 6/inverted-FB brain), Müller (Raumdeuter, the archetype), Lewandowski (Complete Forward).
**Youth takeaway:** Bravery is structural: you can only defend this high if the keeper sweeps and someone has recovery pace — every aggressive choice must be *paid for* somewhere in the profile of the XI.

## 6.6 Real Madrid 2010–13 (Mourinho) — *Counter-Attack Pace, the reference*
**Formation:** 4-2-3-1.
**Core idea:** The most lethal transition team of its era — the 2011/12 title season set a then-record 121 league goals, many from moves lasting under ten seconds. A mid/low block that *invited* opponents forward as bait; Alonso's deep passing range and Özil's between-the-lines transition creation turned regains into 3v3s instantly; Ronaldo as the ultimate left Inside Forward attacking the far channel, Di María stretching the right, Benzema/Higuaín running channels, Khedira making the High/High supporting sprints. Against Barça and in big games it could park the bus outright (D3 low) — identity flexed by opponent.
**Signature patterns:** C1 with the "transition clock" (regain → Alonso/Özil release → three sprinters), B4 overload-right-to-isolate-Ronaldo-left, D3 bait block with D1 traps, C3 channel runs.
**Keystone roles:** Alonso (deep-lying quarterback — the counter starts with his first pass), Özil (transition 10, the archetype), Ronaldo (Inside Forward as apex scorer), Khedira (box-to-box runner making the counters 3v3 not 1v3), Ramos (front-foot Stopper).
**Youth takeaway:** Defending deep is a *plan*, not a surrender — the block's job is to choose where the opponent loses the ball. And a counter needs runners *without* the ball as much as the star with it.

---

## 6.7–6.18 Extended Reference Library — Deep Cuts

Same preset format, tighter entries. Each is tagged to its style archetype (S5) and flags any **new pattern candidates** not yet in Section 3 — genuinely niche mechanics that make the library feel written by people who watch football, not a content farm.

### 6.7 AC Milan 1987–91 (Sacchi) — *the origin of the modern press* [→ 5.3]
4-4-2, zonal everything, and the famous rule: **no more than 25 metres between the last defender and the striker**. Sacchi's four reference points (ball, teammates, opponents, space) replaced man-marking Italy overnight; the offside trap was run like a drill team, and he trained it with **shadow play** — 11 players attacking an empty pitch against imagined opponents, choreographing movements by position. Keystones: Baresi conducting the line's step-ups, Rijkaard–Ancelotti double screen, Gullit/van Basten pressing as the first defenders. **Every pressing team in this library descends from this one.** Youth takeaway: compactness is measurable — give players the actual metres. **New pattern candidate:** *the coordinated line step (offside trap as a pressing action)*.

### 6.8 Atlético Madrid 2013/14 (Simeone) — *the mid-block masterclass* [→ 5.4/5.6]
4-4-2 with the two banks so laterally compact they covered barely half the pitch's width — daring you to cross into Godín. **Cholismo**: every duel is the game; wide midfielders (Koke, Arda) doubled as auxiliary fullbacks; Diego Costa turned outlet hold-up into psychological warfare; set pieces (Godín's headers) as a primary scoring plan, winning La Liga against the Messi–Ronaldo duopoly on a fraction of the budget. Keystones: Godín (organising CB), Gabi (destroyer-captain), Costa (outlet 9 as a weapon). Youth takeaway: a block isn't passive — Atlético *attacked* you with their shape. Patterns: D3 (the reference mid-block), C2, set-piece package.

### 6.9 Leeds United 2018–20 (Bielsa) — *man-marking maximalism* [→ 5.3, heterodox]
**All-pitch man-to-man with a +1 spare at the back** — everyone else follows their man anywhere, even into "wrong" positions, trusting fitness to win the duels. "Murderball" training sessions (no stoppages, coaches throw balls back in) built the engine. Kalvin Phillips as the spare-man pivot dropping between CBs (B6); vertical possession — Bielsa's dogma that the fastest route to goal is through runners, not circulation; wingers 1v1 constantly because man-marking elsewhere isolates the wide duels. Keystones: Phillips (pivot/spare), Hernández (release valve 10), the entire XI's Pressing Engine at 5. Youth takeaway: man-marking is the most *teachable* press for kids (clear job) — and the most physically honest. **New pattern candidate:** *man-marking press with a spare (+1) structure*.

### 6.10 Leicester City 2015/16 (Ranieri) — *counter-attack purity* [→ 5.2]
The 5,000–1 title: bottom-three possession numbers, champions anyway. 4-4-2 mid-block; **Kanté as a one-man midfield press** (led Europe in tackles+interceptions) feeding instant vertical balls; Vardy's channel runs timed off Drinkwater/Fuchs first-time diagonals over the fullback (C3 in its purest form — the pass was airborne before the opponent's shape turned); Mahrez as the far-side isolation (B4); Okazaki doing the dirty pressing so Vardy could cheat on the last shoulder. Keystones: Kanté (Destroyer, generational), Vardy (Runner-in-Behind, the modern reference), Mahrez (Inside Forward isolation). Youth takeaway: a team that knows exactly what it is beats eleven better players who don't.

### 6.11 Chelsea 2016/17 (Conte) — *the back-3 conversion* [→ 5.6]
Started 4-2-4, lost 3-0 at Arsenal, switched to **3-4-3 mid-season and won 13 straight**. The details football Twitter loved: Moses and Alonso — a converted winger and a converted... whatever Alonso was — as title-winning wingbacks; David Luiz reborn as the libero spraying diagonals from the central CB slot (B7 energy); Kanté + Matić double shield; Hazard given a free inside-left role with Alonso's overlap supplying width (2B.1 Inverted Pair); Pedro/Willian tucking into half-spaces. Keystones: the wingbacks (proof the role makes the player), Luiz (ball-playing central CB of three), Kanté. Youth takeaway: changing shape can rescue a season — teach players two shapes, not one.

### 6.12 AC Milan 2003–07 (Ancelotti) — *the regista invention* [→ 5.1/5.6]
Ancelotti moved Pirlo — a failing trequartista — **backwards** to the base of midfield, inventing the modern deep-lying playmaker in front of the defence, with Gattuso as the snarling bodyguard doing his running (the original Brain & Shield). The diamond (and the "Christmas tree" 4-3-2-1) stacked Seedorf, Rui Costa and Kaká between the lines with zero natural width — width came from Cafu/Serginho fullbacks alone. Kaká's ball-carrying transitions (2005–07) were the era's best C1. Keystones: Pirlo (DLP archetype at source), Gattuso (Destroyer archetype), Kaká (transition-carrier 10). Youth takeaway: a player's best position may be one nobody has tried yet — profile beats label.

### 6.13 Manchester City 2022/23 (Guardiola) — *the box midfield* [→ 5.1, evolved]
The treble side's in-possession **3-2-4-1**: John Stones stepping from RCB into the pivot next to Rodri (B7 as a system, not a moment), forming a 3-2 base with a 2-4 box of midfielders/half-space creators ahead — Haaland pinning both CBs alone (B2 vertical pinning at its most extreme) so De Bruyne and Gündoğan attacked Zone 14 and late box arrivals. Rest defence (D4) so structured that counters died at birth: the 3-2 behind every attack is the modern gold standard. Keystones: Stones (hybrid CB/DM — the fit engine's dream edge case), Rodri (pivot), Haaland (the pin), KDB (half-space assassin). Youth takeaway: formations are phone numbers — what matters is the *in-possession shape*, and it can differ from the defensive one. The app's "two-shape" saving feature exists for exactly this.

### 6.14 Atalanta 2019–21 (Gasperini) — *organised chaos* [→ 5.3, heterodox]
**Man-to-man across the entire pitch, including the back three following strikers into midfield** — the most extreme marking scheme in a top-five league, producing basketball scorelines (98 Serie A goals in 19/20). In possession: relentless third-man combinations down the flanks with wingbacks (Gosens/Hateboer) arriving as unmarked *finishers*, not crossers — wingback as a goal-scoring role. Constant front-line rotations (B1) to shake markers, because Gasperini assumes you're man-marking too. Keystones: the wingbacks (highest-scoring in Europe), Gómez/Ilicic (free-roaming creators), de Roon–Freuler engines. Youth takeaway: if every duel is 1v1, football becomes eleven simultaneous small games — brilliant framing for training design. **New pattern candidate:** *wingback as back-post finisher on opposite-flank crosses*.

### 6.15 RB Leipzig / the Red Bull school (Rangnick lineage) — *pressing as doctrine* [→ 5.3, codified]
Rangnick — the godfather Klopp and Tuchel cite — codified pressing into numbers: win the ball back **within 8 seconds** of losing it; shoot **within 10 seconds** of winning it; if neither, reset. The 4-2-2-2 with narrow "double 10s" deliberately concedes the flanks to trap teams there (the touchline as the extra defender, D1 institutionalised), squeezes the centre, and treats slow possession as a sin — famously, back-passes and square balls are culturally discouraged. The same playbook runs Salzburg → Leipzig as a *club identity independent of any coach* — which is exactly the Phase 2 club-philosophy feature (PRD 5.5) in real life. Keystones: the double 10s (pressing AMs), vertical 8s, sprinting 9s (Werner archetype). Youth takeaway: give the press *numbers kids can count* — 8 seconds is coachable; "work harder" isn't.

### 6.16 Napoli 2017/18 (Sarri) — *vertical tiki-taka* [→ 5.1, accelerated]
**Sarrismo**: positional play at double speed — one-touch automatisms drilled until the same 5-pass sequences (B5 → A4 → A5) ran like code, Jorginho's metronome pivot setting a league-record pass volume, Mertens converted from winger to a tiny false 9 whose spins in behind (C3) punished CBs who stepped with him, and Insigne cutting into the left half-space on rehearsed patterns. The niche detail: Sarri's 33 pre-planned build-up *automatisms* — the strongest real-world argument that patterns of play can literally be scripted, i.e. the thesis of this entire app. Keystones: Jorginho (pivot), Hamšík (mezzala), Mertens (micro false 9). Youth takeaway: automatisms remove decisions for developing players — script the first three passes, free the last two.

### 6.17 Sheffield United 2019/20 (Wilder) — *the overlapping centre backs* [→ 5.6, cult classic]
The single most football-Twitter tactic of the era: in a 3-5-2, Wilder's **outside centre backs overlapped beyond their own wingbacks** deep in the opposition half — a promoted side creating 3v2s in wide areas with *defenders* while the wingback pinned inside, because nobody's marking scheme accounted for Jack O'Connell arriving at the byline. Behind it: rigid rest-defence rules on who stays (the other two CBs + Norwood's pivot). Ninth in the Premier League on a shoestring. Keystones: O'Connell/Basham (Wide CBs, weaponised), Norwood (DLP), the wingbacks (selfless pinners). Youth takeaway: innovation is finding the player nobody marks. **New pattern candidate:** *overlapping centre back (A1 variant launched from a back three)* — ship this; it's a conversation-starter card.

### 6.18 Inter Milan 2009/10 (Mourinho) — *the bus, perfected* [→ 5.4, the reference match]
The Camp Nou semi-final: down to ten men for an hour vs the greatest possession side ever (6.2), Inter completed a comically low pass total, defended in a 4-4-1 → 4-5-0 low block with **Eto'o — a Ballon d'Or-level striker — playing auxiliary right-back**, conceded once, and went through. The treble run distilled D3/D4 into art: Cambiasso's positional genius, Lucio/Samuel's box dominance, Sneijder released as the *only* creative license, Milito finishing the two or three transitions a game the plan budgeted for. Keystones: Cambiasso (the thinking Destroyer), Sneijder (transition 10), Milito (clinical Runner), Eto'o (the sacrifice — star player buy-in as a tactical resource). Youth takeaway: defending with total commitment is a skill and an honour, not a failure — the cultural counterweight every possession-obsessed youth environment needs.

### 6.19 Cult Corner (mini-cards, one line each)
Quick-hit cards for browse/delight — each links one pattern:
- **Greece 2004 (Rehhagel):** man-marking + libero anachronism wins the Euros; set pieces and a low block as a complete identity [D3, set pieces].
- **Stoke City 2008–12 (Pulis):** Rory Delap's flat long throws as a *primary* attacking weapon — the throw-in as a corner [C2; **new pattern candidate:** *long-throw second-ball routine*].
- **Burnley 2016–20 (Dyche):** 4-4-2 low block + aerial territory game, out-xG-ing their budget for years on organisation alone [D3, C2].
- **Wimbledon 1988 "Crazy Gang":** the ur-second-ball team — direct play as open psychological warfare [C2].
- **Ajax 2018/19 (ten Hag):** youth-built positional side pressing CL giants off the pitch — de Jong's press resistance as build-up's first weapon [B5, B7; the aspirational card for a youth-development app].
- **Chile 2014–16 (Sampaoli, Bielsa lineage):** national-team man-press chaos, back-to-back Copa América wins [D1, 6.9's international cousin].

---

# SECTION 7 — NATIONAL STYLE IDENTITIES

Lighter-weight cultural presets: a one-screen "school of football" card per nation (blurb + 2–3 linked patterns + a linked reference team where one exists). Good onboarding/browse content and genuinely useful for coaches shaping a club philosophy.

**Spain — La Roja / Positional School.** Short passing, positional discipline, the free man, midfield superiority. Technical security over physicality; the rondo as the national training icon. Links: 6.2, 6.3, patterns B5/A5/B1.

**Germany — Pressing & Vertical Efficiency.** From gegenpressing's popularisation to ruthless directness after regains; physical, organised, relentless off the ball. Links: 6.5, patterns D1/D2/C1.

**Italy — The Defensive Arts.** The block as craft: catenaccio heritage evolved into the modern world's best-organised low/mid blocks, defensive positioning taught as a first-class skill, plus cynical game management and elite counters. Links: patterns D3/D4/C1. (Keystone culture for teaching *defending* as beautiful — a genuinely useful counterweight in youth coaching.)

**England — Direct Tempo & the Second Ball.** The traditional school: high tempo, physical duels, long balls to a target, crossing volume, second-ball scraps (C2's spiritual home) — now hybridised with continental possession ideas in the modern era. Links: patterns C2/A4/D1.

**Mexico — High-Intensity Second-Ball & La Volpe's Legacy.** A distinctive dual identity: on one side, the famously intense, vertical, duel-heavy rhythm of Liga MX football — constant pressing energy, quick transitions, second-ball chaos embraced rather than avoided (C2/D1). On the other, a serious positional-play lineage: Ricardo La Volpe's Mexico sides systematised the salida lavolpiana (B6) that Guardiola openly borrowed. Card should present both faces — chaos *and* school. Links: patterns C2/D1/B6.

**Brazil — Ginga & the 1v1.** Individual expression inside functional teams: ball-carriers and dribblers as the plan (B4 isolation as a cultural default), attacking fullbacks as a national invention (A1), joy as a coaching value. Links: A1/B4/C3.

**Argentina — La Nuestra & the Enganche.** The classic 10 (enganche) as the sacred position; streetwise game intelligence, tempo changes, and the modern hybrid: 2022 World Cup winners defended in a compact block and struck through Messi's freedom between the lines. Links: Zone 14 (3E), A3/C1.

**Netherlands — Total Football.** The origin of positional interchange (B1 rotations as a philosophy), width, pressing, and the ball-playing defender; the direct ancestor of the Spanish school via Cruyff. Links: B1/B7/B5.

---

# SECTION 8 — CONTENT → FEATURE MAP & NEXT STEPS

## 8.1 Where each content set lives in the product

| Content | MVP surface | Later surface |
|---|---|---|
| Role Catalog (S2) + attributes/work rates (S1) + Synergy Library (S2B) | Player profile tags; formation-fit warnings (PRD 5.2.3); MVP-light synergy glow: highlight 2B.1 pairings when both roles are placed | Fit engine v2: full synergy highlights + clash warnings from 2B.4 (e.g., no-width flank, double exposure, bus-with-no-outlet) |
| Concepts Library (S3) | Pattern Archetype starter library — recommend shipping MVP with **10**: A1, A2, A3, A4, A5, B3, B5, C1, C2, D1 | Full library incl. D2/D3/D4 overlays, zone overlays (3E) |
| Delivery Library (3F) | Trajectory styles as a builder option (ground/driven/whipped/floated/clipped) — cheap to ship, big fidelity win | Full delivery cards F1–F16, crossing framework 3F.0 (zone/trajectory/corridor selectors + Four-Run Box Occupation as a preset run package), footedness logic (F5), situation→delivery decision table as coach-facing content |
| Rotation Systems (S5B) | 2–3 flagship rotations as premium demo animations (R1 False-9 Drop, R13 Overlapping CB, R12 Strikers' Scissors) | Full library; rotations attachable to saved formations as looping 'system animations' |
| Pass-Risk Profiles (5.7) | Identity-aware coaching copy on pattern cards | Fit-engine thresholds per identity; any future pass analytics graded by active identity |
| Superiority & Rondo Map (3G) | B8 (la pausa) + B9 (press baiting) in the concepts library — the "pressure = space" visual is a signature animation | Rondo Map zone-tap overlay; formation-matchup overlay (place opponent shape → auto-highlight over/underloads) — the strongest Phase 1.5/2 whiteboard features in this doc; rondo table auto-suggests sessions per saved pattern |
| Formation Library (S4) | Preset formations with strengths/vulnerabilities + **keystone-position highlights & blurbs** (the differentiator) | Danger-area overlays per formation; opponent-shape comparison |
| Style Archetypes (S5) | Optional "team identity" selection at team creation → seeds the starter pattern set | Club-wide philosophy templates (PRD 5.5) inherit from these |
| Reference Teams (S6, now 18 + Cult Corner) + National Styles (S7) | 2–3 reference teams as demo/browse content (recommend 6.2 Barça, 6.4 Liverpool, 6.6 Mourinho Madrid — the three clearest contrasts) | Full set as premium/browse content incl. Deep Cuts & Cult Corner; session plans themed per identity (Phase 1.5) |

## 8.2 Editorial rules (extends PRD Section 6 terminology guide)
1. Every concept gets: a one-sentence blurb (≤25 words), a numbered animation spec, roles involved, and coaching points — no entry ships without all four.
2. Real coaching vocabulary always (half-space, pivot, rest defence), each term defined on first touch — the app teaches the language while using it.
3. Player archetypes are *references*, not licenses: use names in editorial blurbs ("the Busquets role"), never imply endorsement, and avoid player likenesses/imagery in UI.
4. Youth framing on every card: each identity/pattern carries a "youth takeaway" line and an age-suitability hint (e.g., counterpress choreography lands better U13+; 4-4-2 compactness is teachable U9+).

## 8.3 Open content questions for the founder
- MVP identity count: ship all six style archetypes (S5) or launch with three (Control / Vertical / Hybrid)?
- Reference teams: any licensing sensitivity concerns with named clubs/players in editorial content at pilot stage, or acceptable as clearly editorial/educational?
- Should formation-fit warnings be visible to players, or coach-only? (A player seeing "mismatch" on themselves has motivational implications in youth contexts.)
- Canadian angle: add a Canada card to Section 7 (the developing identity — athleticism, transition, Davies as the icon) as a market-resonant touch?
- **New pattern candidates from the Deep Cuts (6.7–6.19):** coordinated line step / offside trap (6.7), man-marking press with a +1 spare (6.9), wingback back-post finisher (6.14), overlapping centre back (6.17), long-throw second-ball routine (6.19). Recommend adding the overlapping CB and +1 man-press to the library at v1.1 — high delight-per-effort; the rest can wait.

*End of v1.0. Sections are numbered for stable cross-referencing by the design, product, and engineering agents.*
