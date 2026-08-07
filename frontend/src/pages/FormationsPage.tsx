// Formations page, Tactics Lab rebuild (T-106, doc 06 sections 5.1, 5.2,
// 5.4; on top of T-032's board-first shell, Brief step 18, PNG 11, 19,
// 32/36, 37-39, 43).
//
// The shell is unchanged: board, floating meta bar, page-level swipe-up
// sheet. Keystone pulse and keycard, the details panel, and the searchable
// formation browser all still work exactly as they did. What is new is the
// meta bar's five controls and what they put on top of the same board.
//
// WHAT THIS FILE IS AND IS NOT. It is an assembly layer. It renders
// PatternPreviewBoard (never a fork of it), drives it with T-105's
// morphToPhase (one Playback, one clock, both elevens), and reads T-104's
// superiority engine for every number it shows. It computes no football of
// its own: no ratio literal, no hand-rolled mirror, no second animation
// loop. Copy that the engine does not supply lives in formationsLab.ts,
// pure and unit tested.
//
// THE ONE RULE WORTH REPEATING. A ratio on screen is either COMPUTED from
// the two shapes on the pitch this instant, or it is the SEEDED
// no-opposition fallback, and the two never look alike: computed chips
// carry a verdict colour, the fallback chip is muted and marked
// data-source="seeded". If a coach can confuse one for the other, the whole
// epic is pointless.
//
// T-112 restores the sixth rondo zone. The counterpress ring is a CIRCLE
// around the ball (doc 06 section 2.3), never the polygon seeded beside it,
// and it is always renderable because section 2.3 hands it a centre for the
// no-ball case: the centroid of our three most advanced. Section 5.1's
// "only renders when a ball is placed" clause assumes a ball affordance
// this page does not have; section 2.3 defines the object and wins. The
// ring moves when the phase does, which is the whole teaching point.
//
// LANDSCAPE MODEL COORDS THROUGHOUT (CLAUDE.md rule 8). Opponent shapes are
// handed to morphToPhase in THEIR OWN frame exactly as seeded, and crossed
// into ours in exactly one place (mirrorOpponentShape) for the engine's
// benefit. Portrait is applied by coords.ts at render time; the two page
// overlays below map through modelToRender rather than re-deriving it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modelToRender, type Orientation } from "../board/coords";
import PatternPreviewBoard, { type PreviewToken, type PreviewZone } from "../board/PatternPreviewBoard";
import { morphToPhase, type PhaseSides } from "../board/phaseMorph";
import { mirrorOpponentShape } from "../board/opponentLayer";
import {
  buildRead,
  countZone,
  findFreeMen,
  gridOccupancy,
  pointInCircle,
  pointInPolygon,
  JDP_GRID,
} from "../board/superiority";
import type {
  FormationMatchup,
  FreeMan,
  SlotPos,
  SuperiorityZone,
  ZoneCount,
} from "../board/superiorityTypes";
import type { Playback } from "../board/playback";
import {
  listFormations,
  type FormationKeystoneWire,
  type FormationOutWire,
  type FormationPositionWire,
  type RondoZoneWire,
} from "../formationsApi";
import { listLibraryItems } from "../libraryApi";
import {
  evaluateUnitBalance,
  getFormationMatchup,
  listArchetypes,
  listFormationPhases,
  listRotations,
  suggestArchetypes,
  type ArchetypeSuggestionWire,
  type FormationPhaseWire,
  type PositionArchetypeWire,
  type RotationSystemWire,
  type UnitBalanceResponseWire,
} from "../tacticsApi";
import { fetchRoster, type PlayerWire, type Role } from "../rosterApi";
import { animationSpecPreview } from "./patternPreview";
import {
  BALL_RELATIVE_CIRCLE,
  breachCheck,
  COUNTERPRESS_RING_ZONE_KEY,
  defaultOpponentVariant,
  inferredRouteLine,
  laneBoundaries,
  lineBoundaries,
  NO_BREACH_CHECK,
  NO_SEEDED_MATCHUP_NOTE,
  PHASE_SEGMENTS,
  polygonCentroid,
  ringCentre,
  rondoDisplayName,
  shortLine,
  slotLabel,
  spareLine,
  variantsForPhase,
  zoneReadLine,
  type PhaseKey,
} from "./formationsLab";
import {
  familyLabel,
  fullbackPairNote,
  personnelGroups,
  sideOfY,
  slotFootednessNote,
  unitHeading,
} from "./personnelLab";
import { matchesSearch } from "./search";
import "./FormationsPage.css";

function humanizeSlug(slug: string): string {
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which of the three board overlays is showing. Doc 06 section 5.1: only
 *  one of Rondo map, Rotations and Grid may be open at once, which is the
 *  mutual exclusion T-032 already had between Details and the Rondo map. */
type Overlay = "rondo" | "rotations" | "grid" | null;

/** The circle arm of T-104's zone union, which is what the counterpress
 *  ring is (doc 06 section 2.3). Narrowed once here so the ring's centre
 *  and radius are reachable without a cast at every use. */
type CircleZone = Extract<SuperiorityZone, { kind: "circle" }>;

/** Which meta bar control has its reading surface open. Desktop renders it
 *  as a floating rail, phone as a bottom sheet (doc 06 section 5.4), same
 *  markup either way. */
type Panel = "details" | "phase" | "opposition" | "rotations" | "grid" | null;

// ---------------------------------------------------------------------------
// Meta bar icons. Doc 06 section 5.4: on phone the controls collapse to an
// icon row. Inline SVG rather than a glyph font so the shapes are the same
// on every device, and stroke="currentColor" so they inherit the button's
// themed colour instead of shipping one of their own (CLAUDE.md: all colour
// through theme variables).
// ---------------------------------------------------------------------------

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 20 20" className="formations-icon" aria-hidden="true" focusable="false">
      {name === "details" && (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v5" />
          <path d="M10 6.2v0.1" />
        </>
      )}
      {name === "phase" && (
        <>
          <path d="M3 7h11l-3-3" />
          <path d="M17 13H6l3 3" />
        </>
      )}
      {name === "opposition" && (
        <>
          <circle cx="6.5" cy="10" r="4" />
          <circle cx="13.5" cy="10" r="4" />
        </>
      )}
      {name === "rondo" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="2" />
        </>
      )}
      {name === "rotations" && (
        <>
          <path d="M15.5 7.5A6.5 6.5 0 1 0 16 12" />
          <path d="M12.5 7.5h3.5V4" />
        </>
      )}
      {name === "grid" && (
        <>
          <path d="M3 3h14v14H3z" />
          <path d="M7.7 3v14M12.3 3v14M3 7.7h14M3 12.3h14" />
        </>
      )}
    </svg>
  );
}

function FormationThumb({ formation }: { formation: FormationOutWire }) {
  const W = 90;
  const H = 68;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="formations-tile-thumb" aria-hidden="true">
      <rect x={0} y={0} width={W} height={H} rx={3} className="formations-tile-thumb-bg" />
      {formation.positions.map((p) => (
        <circle
          key={p.slot}
          cx={(p.x / 100) * W}
          cy={(p.y / 100) * H}
          r={2.4}
          className="formations-tile-thumb-token"
        />
      ))}
    </svg>
  );
}

interface FormationsPageProps {
  orientation: Orientation;
  // T-107: the personnel panel's suggestions, unit balance, and footedness
  // notes are coach-only, both at the API (403 for a player token) and
  // here (CLAUDE.md rule 5): every fetch that touches them is gated on
  // this, never fired unconditionally, so T-106's own "player role reaches
  // every control with no failed request" e2e journey stays honest.
  role: Role;
}

export function FormationsPage({ orientation, role }: FormationsPageProps) {
  // Phone is exactly the breakpoint that already decides board orientation
  // (App.tsx, max-width 700px), so the icon row and the bottom sheets
  // switch on the same signal the portrait board does. One breakpoint, not
  // two that can drift.
  const phone = orientation === "portrait";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formations, setFormations] = useState<FormationOutWire[]>([]);
  const [libraryNames, setLibraryNames] = useState<Record<string, string>>({});

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // T-107: the sheet's second segment, alongside "Browse formations" (doc
  // 06 section 5.3: "opens from the sheet as a third segment", counting
  // the sheet's original one plus this). Stays on whatever the coach last
  // picked across a formation swap; selectFormation closes the sheet
  // anyway, so there is no stale personnel content to worry about landing
  // on for the WRONG formation.
  const [sheetTab, setSheetTab] = useState<"browse" | "personnel">("browse");

  const [panel, setPanel] = useState<Panel>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [activeKeystoneSlot, setActiveKeystoneSlot] = useState<string | null>(null);
  const [activeZoneKey, setActiveZoneKey] = useState<string | null>(null);

  const [phaseKey, setPhaseKey] = useState<PhaseKey>("base");
  const [variantCode, setVariantCode] = useState<string | null>(null);

  const [oppositionOn, setOppositionOn] = useState(false);
  const [oppCode, setOppCode] = useState<string | null>(null);
  const [oppVariantCode, setOppVariantCode] = useState<string | null>(null);

  const [phasesByCode, setPhasesByCode] = useState<Record<string, FormationPhaseWire[]>>({});
  const [rotations, setRotations] = useState<RotationSystemWire[]>([]);
  const [activeRotationCode, setActiveRotationCode] = useState<string | null>(null);
  const [seededMatchup, setSeededMatchup] = useState<FormationMatchup | null>(null);

  // ------------------------------------------------------------------
  // Loads
  // ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listFormations(),
      listLibraryItems("pattern"),
      listLibraryItems("delivery"),
      listLibraryItems("rotation"),
    ])
      .then(([fs, patterns, deliveries, rotationItems]) => {
        if (cancelled) return;
        setFormations(fs);
        setSelectedCode((cur) => cur ?? fs[0]?.code ?? null);
        const names: Record<string, string> = {};
        for (const item of [...patterns, ...deliveries, ...rotationItems]) names[item.code] = item.name;
        setLibraryNames(names);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the formations library. Try reloading.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phases for whichever formations are on the board right now, cached by
  // code so flipping the opposition on and off does not refetch.
  useEffect(() => {
    const wanted = [selectedCode, oppositionOn ? oppCode : null].filter(
      (c): c is string => typeof c === "string"
    );
    const missing = wanted.filter((c) => !(c in phasesByCode));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((c) => listFormationPhases(c).then((ps) => [c, ps] as const)))
      .then((entries) => {
        if (cancelled) return;
        setPhasesByCode((prev) => {
          const next = { ...prev };
          for (const [code, ps] of entries) next[code] = ps;
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this formation's phases. Try reloading.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCode, oppCode, oppositionOn, phasesByCode]);

  useEffect(() => {
    if (!selectedCode) return;
    let cancelled = false;
    listRotations(selectedCode)
      .then((rs) => {
        if (!cancelled) setRotations(rs);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the rotation systems. Try reloading.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  // The SEEDED matchup card, which is the only thing on this page that
  // comes pre-written. Null is a first-class answer (doc 06 section 2.8),
  // not an error: the read below still renders, from computed counts, and
  // says out loud that nobody has coached this pair.
  useEffect(() => {
    if (!oppositionOn || !selectedCode || !oppCode) {
      setSeededMatchup(null);
      return;
    }
    let cancelled = false;
    getFormationMatchup(selectedCode, oppCode)
      .then((res) => {
        if (cancelled) return;
        setSeededMatchup(
          res.matchup
            ? {
                ours_code: res.matchup.ours_code,
                theirs_code: res.matchup.theirs_code,
                our_edges: res.matchup.our_edges,
                their_edges: res.matchup.their_edges,
                route: res.matchup.route,
                route_kind: res.matchup.route_kind,
              }
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setSeededMatchup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [oppositionOn, selectedCode, oppCode]);

  // ------------------------------------------------------------------
  // Derived selection
  // ------------------------------------------------------------------

  const selected = useMemo(
    () => formations.find((f) => f.code === selectedCode) ?? null,
    [formations, selectedCode]
  );

  const ourPhases = useMemo(
    () => (selectedCode ? (phasesByCode[selectedCode] ?? []) : []),
    [phasesByCode, selectedCode]
  );
  const theirPhases = useMemo(
    () => (oppCode ? (phasesByCode[oppCode] ?? []) : []),
    [phasesByCode, oppCode]
  );

  const phaseVariants = useMemo(
    () => variantsForPhase(ourPhases, phaseKey),
    [ourPhases, phaseKey]
  );

  // Keep the chosen variant valid whenever the phase or the formation
  // changes. Selecting a phase with several seeded variants opens on the
  // first, and the variant chips below the segment switch between them.
  useEffect(() => {
    if (phaseKey === "base") {
      if (variantCode !== null) setVariantCode(null);
      return;
    }
    if (phaseVariants.length === 0) {
      if (variantCode !== null) setVariantCode(null);
      return;
    }
    if (!phaseVariants.some((v) => v.variant_code === variantCode)) {
      setVariantCode(phaseVariants[0].variant_code);
    }
  }, [phaseKey, phaseVariants, variantCode]);

  const activeVariant = useMemo(
    () => phaseVariants.find((v) => v.variant_code === variantCode) ?? null,
    [phaseVariants, variantCode]
  );

  useEffect(() => {
    if (!oppositionOn || theirPhases.length === 0) return;
    if (oppVariantCode !== null && theirPhases.some((v) => v.variant_code === oppVariantCode)) return;
    setOppVariantCode(defaultOpponentVariant(theirPhases));
  }, [oppositionOn, theirPhases, oppVariantCode]);

  const oppFormation = useMemo(
    () => formations.find((f) => f.code === oppCode) ?? null,
    [formations, oppCode]
  );
  const oppVariant = useMemo(
    () => theirPhases.find((v) => v.variant_code === oppVariantCode) ?? null,
    [theirPhases, oppVariantCode]
  );

  const keystoneBySlot = useMemo(() => {
    const map = new Map<string, FormationKeystoneWire>();
    for (const k of selected?.keystones ?? []) map.set(k.slot, k);
    return map;
  }, [selected]);
  const keystoneSlots = useMemo(() => [...keystoneBySlot.keys()], [keystoneBySlot]);

  /** Our eleven for the phase on screen, in OUR frame. */
  const ourSlots = useMemo<SlotPos[]>(() => {
    if (!selected) return [];
    if (phaseKey !== "base" && activeVariant) return activeVariant.positions;
    return selected.positions;
  }, [selected, phaseKey, activeVariant]);

  /**
   * Their eleven, in THEIR OWN frame exactly as seeded. This is what
   * morphToPhase wants, and holding it in their frame here is what keeps
   * the mirror to a single call site.
   */
  const theirSlotsOwnFrame = useMemo<SlotPos[] | null>(() => {
    if (!oppositionOn || !oppFormation) return null;
    return oppVariant ? oppVariant.positions : oppFormation.positions;
  }, [oppositionOn, oppFormation, oppVariant]);

  /** The same eleven crossed into our frame, which is the only form the
   *  superiority engine will count. mirrorOpponentShape is the one mirror. */
  const theirSlotsOurFrame = useMemo<SlotPos[]>(
    () => (theirSlotsOwnFrame ? mirrorOpponentShape(theirSlotsOwnFrame) : []),
    [theirSlotsOwnFrame]
  );

  // ------------------------------------------------------------------
  // The board scene: one morph, one playback, both elevens
  // ------------------------------------------------------------------

  const scene = useMemo<PhaseSides>(
    () => ({ ours: ourSlots, theirs: theirSlotsOwnFrame }),
    [ourSlots, theirSlotsOwnFrame]
  );

  const prevSceneRef = useRef<PhaseSides | null>(null);
  const [morph, setMorph] = useState<{ tokens: PreviewToken[]; playback: Playback } | null>(null);
  // Bumped when the page needs the phase scene rebuilt without anything
  // about the phase having changed: closing a rotation vignette, which
  // swapped the board out from under it.
  const [sceneNonce, setSceneNonce] = useState(0);

  useEffect(() => {
    if (scene.ours.length === 0) return;
    const from = prevSceneRef.current ?? scene;
    const next = morphToPhase({
      from,
      to: scene,
      // Deliberately no caption. PatternPreviewBoard would paint it into
      // its own strip, and this page renders its own caption strip that
      // survives a board reset and is present before any morph has run
      // (doc 06 section 5.1 wants the shape and its trigger named at all
      // times, not only for 600ms after a tap).
      caption: null,
      ourTokens: { keystoneSlots },
    });
    prevSceneRef.current = scene;
    setMorph({ tokens: next.tokens, playback: next.playback });
  }, [scene, keystoneSlots, sceneNonce]);

  const activeRotation = useMemo(
    () => rotations.find((r) => r.code === activeRotationCode) ?? null,
    [rotations, activeRotationCode]
  );

  /** A rotation plays as the vignette its animation spec describes (the
   *  handful of players who move), the same way the Patterns page plays a
   *  library preset. It replaces the eleven for as long as it is open. */
  const rotationScene = useMemo(() => {
    if (!activeRotation?.animation_spec) return null;
    return animationSpecPreview(activeRotation.animation_spec);
  }, [activeRotation]);

  const boardTokens = rotationScene ? rotationScene.tokens : (morph?.tokens ?? []);
  const boardPlayback = rotationScene ? rotationScene.playback : (morph?.playback ?? null);

  // ------------------------------------------------------------------
  // The superiority engine
  // ------------------------------------------------------------------

  /**
   * The five POLYGON zones. These partition the pitch, which is what makes
   * them the right input to buildRead: "where are we spare" and "where are
   * we short" only mean something across zones that do not overlap.
   *
   * The counterpress ring is deliberately not in here. It is a circle
   * around the ball (doc 06 section 2.3) that overlaps whatever it happens
   * to be sitting on, so feeding it to buildRead would double count the
   * same players and could hand the route read a zone that is not a place
   * to play through at all. It gets counted on its own, below, and shows
   * its own chip and its own card.
   */
  const polygonZones = useMemo<SuperiorityZone[]>(() => {
    if (!selected) return [];
    return selected.rondo_zones
      .filter((z) => z.zone_key !== COUNTERPRESS_RING_ZONE_KEY)
      .map((z) => ({ zoneKey: z.zone_key, kind: "polygon" as const, polygon: z.polygon }));
  }, [selected]);

  /** The seeded counterpress ring row, or null on a formation without one. */
  const ringRow = useMemo<RondoZoneWire | null>(
    () => selected?.rondo_zones.find((z) => z.zone_key === COUNTERPRESS_RING_ZONE_KEY) ?? null,
    [selected]
  );

  /**
   * The ring's centre for the phase currently on the board, in landscape
   * model coords. Null passed for the ball because this page has no ball
   * and does not invent one: doc 06 section 2.3's fallback is the centroid
   * of our three most advanced, which is why the ring is renderable here at
   * all. It recomputes with `ourSlots`, so selecting a phase moves it.
   */
  const ringCentrePoint = useMemo(() => ringCentre(ourSlots, null), [ourSlots]);

  /**
   * The ring as the engine's own circle zone. Radius comes off the seeded
   * row (18 model units), never a literal here, and a row that is not a
   * ball_relative_circle or carries no radius yields no ring rather than a
   * guess.
   */
  const ringZone = useMemo<CircleZone | null>(() => {
    if (!ringRow || !ringCentrePoint) return null;
    if (ringRow.zone_kind !== BALL_RELATIVE_CIRCLE || ringRow.radius === null) return null;
    return {
      zoneKey: ringRow.zone_key,
      kind: "circle",
      centre: ringCentrePoint,
      radius: ringRow.radius,
    };
  }, [ringRow, ringCentrePoint]);

  const freeMen = useMemo<FreeMan[]>(
    () => (theirSlotsOurFrame.length > 0 ? findFreeMen(ourSlots, theirSlotsOurFrame) : []),
    [ourSlots, theirSlotsOurFrame]
  );
  const freeSlots = useMemo(() => new Set(freeMen.map((f) => f.slot)), [freeMen]);

  const opposed = theirSlotsOurFrame.length > 0 && ourSlots.length > 0;

  /**
   * Live ratios across the five polygon zones. Null means no opposition is
   * placed, which is the ONLY state in which a seeded fallback chip is
   * allowed on screen.
   */
  const zoneCounts = useMemo<ZoneCount[] | null>(() => {
    if (!opposed) return null;
    return polygonZones.map((z) => countZone(z, ourSlots, theirSlotsOurFrame, freeSlots));
  }, [polygonZones, ourSlots, theirSlotsOurFrame, freeSlots, opposed]);

  /** The ring's own live ratio, on the same rule as every other zone.
   *  countZone already understands a circle, so there is no second
   *  containment test anywhere in this page. */
  const ringCount = useMemo<ZoneCount | null>(() => {
    if (!opposed || !ringZone) return null;
    return countZone(ringZone, ourSlots, theirSlotsOurFrame, freeSlots);
  }, [ringZone, ourSlots, theirSlotsOurFrame, freeSlots, opposed]);

  const countByZone = useMemo(() => {
    const map = new Map<string, ZoneCount>();
    for (const c of zoneCounts ?? []) map.set(c.zoneKey, c);
    if (ringCount) map.set(ringCount.zoneKey, ringCount);
    return map;
  }, [zoneCounts, ringCount]);

  const read = useMemo(
    () => (zoneCounts ? buildRead(zoneCounts, seededMatchup) : null),
    [zoneCounts, seededMatchup]
  );

  const gridResult = useMemo(() => gridOccupancy(ourSlots), [ourSlots]);

  const zoneNameOf = useCallback(
    (zoneKey: string) => {
      const zone = selected?.rondo_zones.find((z) => z.zone_key === zoneKey);
      return zone ? rondoDisplayName(zone.rondo_name).toLowerCase() : zoneKey;
    },
    [selected]
  );

  /** The free man a parity zone's positional edge is actually about. Reads
   *  the ring the same way it reads a polygon, through the engine's own
   *  containment tests rather than a second copy of them. */
  const freeManInZone = useCallback(
    (zoneKey: string): FreeMan | null => {
      const zone = [...polygonZones, ...(ringZone ? [ringZone] : [])].find(
        (z) => z.zoneKey === zoneKey
      );
      if (!zone) return null;
      for (const fm of freeMen) {
        const p = ourSlots.find((s) => s.slot === fm.slot);
        if (!p) continue;
        const inside =
          zone.kind === "circle"
            ? pointInCircle({ x: p.x, y: p.y }, zone.centre, zone.radius)
            : pointInPolygon({ x: p.x, y: p.y }, zone.polygon);
        if (inside) return fm;
      }
      return null;
    },
    [polygonZones, ringZone, freeMen, ourSlots]
  );

  // ------------------------------------------------------------------
  // Board overlays
  // ------------------------------------------------------------------

  /**
   * The board's tappable polygons: the five polygon zones only.
   *
   * The counterpress ring is filtered out here and drawn as a circle by the
   * ring layer below instead. Its seeded polygon_json bounds the half of
   * the pitch the ring is coached in; drawing it would put an eleven-a-side
   * count in the same visual language as a real 4v2, which is why T-106
   * refused to. Six zones on screen, five of them polygons.
   */
  const zones = useMemo<PreviewZone[]>(() => {
    if (!selected || overlay !== "rondo") return [];
    return selected.rondo_zones
      .filter((z) => z.zone_key !== COUNTERPRESS_RING_ZONE_KEY)
      .map((z) => ({
        key: z.zone_key,
        label: rondoDisplayName(z.rondo_name),
        corners: z.polygon,
        active: z.zone_key === activeZoneKey,
      }));
  }, [selected, overlay, activeZoneKey]);

  const tiles = useMemo(
    () => formations.filter((f) => matchesSearch([f.name, f.code, ...f.natural_identities], searchQuery)),
    [formations, searchQuery]
  );

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------

  function closeRotationScene() {
    setActiveRotationCode(null);
    // The vignette swapped the board's token list out; rebuild the phase
    // scene so the eleven come back rather than leaving a stale playback
    // to re-run the last morph.
    setSceneNonce((n) => n + 1);
  }

  function selectFormation(code: string) {
    setSelectedCode(code);
    setSheetOpen(false);
    setPanel(null);
    setOverlay(null);
    setActiveKeystoneSlot(null);
    setActiveZoneKey(null);
    setPhaseKey("base");
    setVariantCode(null);
    closeRotationScene();
    if (code === oppCode) setOppCode(null);
  }

  function chooseOverlay(next: Exclude<Overlay, null>) {
    const closing = overlay === next;
    setOverlay(closing ? null : next);
    setActiveZoneKey(null);
    setActiveKeystoneSlot(null);
    if (next !== "rotations") closeRotationScene();
    // Rondo has no reading panel of its own: its reading surface is the
    // zone card you get by tapping a zone on the board.
    setPanel(closing || next === "rondo" ? null : next);
  }

  function togglePanel(next: Exclude<Panel, null>) {
    setPanel((cur) => (cur === next ? null : next));
  }

  function openOpposition() {
    setPanel((cur) => (cur === "opposition" ? null : "opposition"));
    if (!oppositionOn) {
      setOppositionOn(true);
      if (!oppCode) {
        const first = formations.find((f) => f.code !== selectedCode);
        if (first) setOppCode(first.code);
      }
    }
  }

  function selectPhase(key: PhaseKey) {
    setPhaseKey(key);
    setActiveKeystoneSlot(null);
    closeRotationScene();
  }

  function selectRotation(code: string) {
    if (activeRotationCode === code) {
      closeRotationScene();
      return;
    }
    setActiveRotationCode(code);
  }

  function handleTokenClick(slot: string) {
    setActiveKeystoneSlot((cur) => (cur === slot ? null : slot));
  }

  function handleZoneClick(zoneKey: string) {
    setActiveZoneKey((cur) => (cur === zoneKey ? null : zoneKey));
  }

  const identityLabel = selected ? selected.natural_identities.map(humanizeSlug).join(" / ") : "";
  const activeKeystone = activeKeystoneSlot ? (keystoneBySlot.get(activeKeystoneSlot) ?? null) : null;
  const activeZone = selected?.rondo_zones.find((z) => z.zone_key === activeZoneKey) ?? null;

  /** Doc 06 section 5.1: a caption strip under the board naming the
   *  resulting shape and its trigger. */
  const caption = useMemo(() => {
    if (!selected) return "";
    // A rotation vignette is what is actually on the board while it plays,
    // so the strip names that rather than a phase the coach cannot see.
    if (activeRotation) {
      return `${activeRotation.name}. Produces ${activeRotation.produces_shape}.`;
    }
    if (phaseKey !== "base" && activeVariant) {
      return `${activeVariant.name}. Trigger: ${activeVariant.trigger}`;
    }
    if (phaseKey !== "base" && phaseVariants.length === 0) {
      return `${selected.name} base shape. No ${phaseLabel(phaseKey).toLowerCase()} variant is seeded for this formation yet.`;
    }
    return `${selected.name} base shape. ${selected.shape_blurb}`;
  }, [selected, phaseKey, activeVariant, phaseVariants, activeRotation]);

  return (
    <section className="formations-page">
      <h2 className="app-page-heading">
        Formations
        <span
          className="app-page-info"
          aria-hidden="true"
          title="Morph the shape by phase, place an opposition, and read the live counts."
        >
          i
        </span>
      </h2>

      {loadError && (
        <p role="alert" className="formations-error">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="formations-loading">Loading formations...</p>
      ) : !selected ? (
        <p className="formations-loading">No formations available.</p>
      ) : (
        <div className="formations-stage">
          <div className="formations-board-area">
            {/* ---------------- Meta bar ---------------- */}
            <div className="formations-meta-bar" data-testid="formations-meta-bar">
              <span className="formations-meta-title" data-testid="formations-meta-title">
                {selected.name}
                {identityLabel ? `: ${identityLabel}` : ""}
              </span>

              {/* Doc 06 section 5.4: on phone every control collapses into
                  the icon row below and opens a bottom sheet. On desktop
                  the phase segment sits in the bar itself. */}
              {!phone && (
                <div
                  className="formations-segment"
                  role="group"
                  aria-label="Phase"
                  data-testid="formations-phase-segment"
                >
                  {PHASE_SEGMENTS.map((seg) => {
                    const available = seg.key === "base" || variantsForPhase(ourPhases, seg.key).length > 0;
                    return (
                      <button
                        key={seg.key}
                        type="button"
                        className="formations-segment-btn"
                        data-testid={`formations-phase-${seg.key}`}
                        aria-pressed={phaseKey === seg.key}
                        disabled={!available}
                        title={available ? undefined : "No variant seeded for this formation yet."}
                        onClick={() => selectPhase(seg.key)}
                      >
                        {seg.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="formations-ctl-row">
                <button
                  type="button"
                  className="formations-details-btn"
                  data-testid="formations-details-toggle"
                  aria-pressed={panel === "details"}
                  aria-label="Details"
                  onClick={() => togglePanel("details")}
                >
                  {phone ? <Icon name="details" /> : "Details"}
                </button>

                {phone && (
                  <button
                    type="button"
                    className="ctl-ghost formations-ctl"
                    data-testid="formations-phase-toggle"
                    aria-pressed={panel === "phase"}
                    aria-label="Phase"
                    onClick={() => togglePanel("phase")}
                  >
                    <Icon name="phase" />
                  </button>
                )}

                <button
                  type="button"
                  className="ctl-ghost formations-ctl"
                  data-testid="formations-opposition-toggle"
                  aria-pressed={oppositionOn}
                  aria-label="Opposition"
                  onClick={openOpposition}
                >
                  {phone ? <Icon name="opposition" /> : "Opposition"}
                </button>

                <button
                  type="button"
                  className={overlay === "rondo" ? "formations-rondo-pill" : "ctl-ghost formations-ctl"}
                  data-testid={overlay === "rondo" ? "formations-rondo-active-toggle" : "formations-rondo-toggle"}
                  aria-pressed={overlay === "rondo"}
                  aria-label="Rondo map"
                  disabled={selected.rondo_zones.length === 0}
                  onClick={() => chooseOverlay("rondo")}
                >
                  {phone ? <Icon name="rondo" /> : overlay === "rondo" ? "Tap a zone" : "Rondo map"}
                </button>

                <button
                  type="button"
                  className="ctl-ghost formations-ctl"
                  data-testid="formations-rotations-toggle"
                  aria-pressed={overlay === "rotations"}
                  aria-label="Rotations"
                  onClick={() => chooseOverlay("rotations")}
                >
                  {phone ? <Icon name="rotations" /> : "Rotations"}
                </button>

                <button
                  type="button"
                  className="ctl-ghost formations-ctl"
                  data-testid="formations-grid-toggle"
                  aria-pressed={overlay === "grid"}
                  aria-label="Positional grid"
                  onClick={() => chooseOverlay("grid")}
                >
                  {phone ? <Icon name="grid" /> : "Grid"}
                </button>
              </div>

              {/* Variant chips: several shapes can be seeded for one phase
                  (a 4-3-3 has two in-possession variants plus three
                  reference systems), and without this the page could only
                  ever reach the first of them. */}
              {!phone && phaseKey !== "base" && phaseVariants.length > 1 && (
                <div className="formations-variant-row" data-testid="formations-variant-row">
                  {phaseVariants.map((v) => (
                    <button
                      key={v.variant_code}
                      type="button"
                      className="formations-variant-chip"
                      data-testid="formations-variant-chip"
                      data-variant-code={v.variant_code}
                      aria-pressed={v.variant_code === variantCode}
                      onClick={() => setVariantCode(v.variant_code)}
                    >
                      {v.shape_label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="formations-board-frame">
              <PatternPreviewBoard
                orientation={orientation}
                tokens={boardTokens}
                playback={boardPlayback}
                zones={zones}
                onTokenClick={handleTokenClick}
                onZoneClick={handleZoneClick}
                showRestart={false}
              />

              {/* Live count chips (doc 06 section 5.1 control 3). A page
                  overlay rather than a board prop: the chip has to carry a
                  verdict colour and a muted/computed distinction, which an
                  SVG <text> label in the shared renderer cannot, and
                  extending the renderer for one page's styling would be a
                  fork by another name. Positioned through modelToRender, so
                  portrait comes out right without this file knowing the
                  formula. */}
              {overlay === "rondo" && (
                <div
                  className="formations-board-overlay"
                  data-orientation={orientation}
                  data-testid="formations-chip-layer"
                >
                  {/* The counterpress ring (doc 06 section 2.3). A CIRCLE
                      around the ball, never the polygon seeded beside it,
                      and always renderable because section 2.3 gives it a
                      centre for the no-ball case. Drawn with a viewBox of
                      0 0 100 100 and preserveAspectRatio="none", which is
                      exactly normalized render space: modelToRender puts
                      the centre in it and the radius is the same number on
                      both axes, so the shape on screen is the same locus
                      pointInCircle counts inside, in either orientation.
                      Non-scaling stroke keeps the line an even width
                      despite the non-uniform scale. */}
                  {ringZone && ringRow && (
                    <svg
                      className="formations-ring-layer"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      data-testid="formations-ring-layer"
                    >
                      {(() => {
                        const c = modelToRender(ringZone.centre, orientation);
                        const active = activeZoneKey === ringZone.zoneKey;
                        const geom = {
                          cx: c.left,
                          cy: c.top,
                          rx: ringZone.radius,
                          ry: ringZone.radius,
                          vectorEffect: "non-scaling-stroke" as const,
                        };
                        return (
                          <>
                            <ellipse
                              {...geom}
                              className="formations-ring"
                              data-testid="formations-rondo-ring"
                              data-ring-zone={ringZone.zoneKey}
                              data-active={active}
                            />
                            {/* The only part of the ring that takes a tap:
                                a transparent band along the line itself,
                                pointer-events: stroke, so the ring's large
                                interior passes every tap through to the
                                polygon zone underneath it. */}
                            <ellipse
                              {...geom}
                              className="formations-ring-hit"
                              data-testid="formations-ring-hit"
                              role="button"
                              tabIndex={0}
                              aria-label={`${rondoDisplayName(ringRow.rondo_name)}, read this zone`}
                              aria-pressed={active}
                              onClick={() => handleZoneClick(ringZone.zoneKey)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                handleZoneClick(ringZone.zoneKey);
                              }}
                            />
                          </>
                        );
                      })()}
                    </svg>
                  )}

                  {selected.rondo_zones.map((z) => {
                      // Five zones anchor their chip on their polygon. The
                      // ring anchors on its centre, so the chip travels
                      // with it exactly as the circle does.
                      const isRing = z.zone_key === COUNTERPRESS_RING_ZONE_KEY;
                      const centre = isRing ? ringCentrePoint : polygonCentroid(z.polygon);
                      if (!centre) return null;
                      if (isRing && !ringZone) return null;
                      const r = modelToRender(centre, orientation);
                      const count = countByZone.get(z.zone_key) ?? null;
                      // The SEEDED fallback, straight off the wire. It is
                      // never derived from anything on screen and is only
                      // ever shown when no opposition is placed.
                      const seeded = z.canonical_rondo ?? "";
                      if (!count && !seeded) return null;
                      const kind = count?.superiorityKind;
                      return (
                        <span
                          key={z.zone_key}
                          className="formations-zone-chip"
                          data-testid="formations-zone-chip"
                          // Not data-zone-key: that attribute belongs to
                          // the board's own tappable zone polygon, and two
                          // elements answering to the same selector would
                          // make every existing zone journey ambiguous.
                          data-chip-zone={z.zone_key}
                          data-chip-kind={isRing ? "ring" : "polygon"}
                          data-source={count ? "computed" : "seeded"}
                          data-verdict={count ? count.verdict : undefined}
                          style={{ left: `${r.left}%`, top: `${r.top}%` }}
                        >
                          <span className="formations-zone-chip-ratio">
                            {count ? count.label : seeded}
                          </span>
                          {/* Doc 06 section 5.4: on phone the chip shrinks
                              to the ratio only and the read moves into the
                              tapped zone card. */}
                          {!phone && count && kind && (
                            <span className="formations-zone-chip-kind">{kind}</span>
                          )}
                        </span>
                      );
                    })}
                </div>
              )}

              {/* Positional grid (doc 06 section 5.2). Five lanes and five
                  lines, plus a tint on any band the occupancy guidelines
                  raise a CHECK about. Lane boundaries are constant model y
                  and stay vertical in both orientations (portrait maps
                  left = y); line boundaries are constant model x and are
                  horizontal, flipped by top = 100 - x in portrait. */}
              {overlay === "grid" && (
                <div
                  className="formations-board-overlay"
                  data-orientation={orientation}
                  data-testid="formations-grid-layer"
                >
                  {laneBoundaries().map((y) => (
                    <span
                      key={`lane-${y}`}
                      className="formations-grid-line formations-grid-line-v"
                      style={{ left: `${y}%` }}
                    />
                  ))}
                  {lineBoundaries().map((x) => (
                    <span
                      key={`line-${x}`}
                      className="formations-grid-line formations-grid-line-h"
                      style={{ top: `${orientation === "portrait" ? 100 - x : x}%` }}
                    />
                  ))}
                  {gridResult.breaches.map((b, i) => {
                    const lane = JDP_GRID.lanes.find((l) => l.key === b.cell);
                    const line = JDP_GRID.lines.find((l) => l.key === b.cell);
                    if (lane) {
                      return (
                        <span
                          key={`breach-${i}`}
                          className="formations-grid-band formations-grid-band-v"
                          data-testid="formations-grid-band"
                          style={{ left: `${lane.min}%`, width: `${lane.max - lane.min}%` }}
                        />
                      );
                    }
                    if (!line) return null;
                    const top = orientation === "portrait" ? 100 - line.max : line.min;
                    return (
                      <span
                        key={`breach-${i}`}
                        className="formations-grid-band formations-grid-band-h"
                        data-testid="formations-grid-band"
                        style={{ top: `${top}%`, height: `${line.max - line.min}%` }}
                      />
                    );
                  })}
                </div>
              )}

              {/* ---------------- Floating cards ---------------- */}

              {activeKeystone && overlay !== "rondo" && (
                <div className="formations-card" data-testid="formations-keycard">
                  <div className="formations-card-head">
                    <p className="formations-card-kicker">Keystone</p>
                    <button
                      type="button"
                      className="formations-card-close"
                      aria-label="Close keycard"
                      data-testid="formations-keycard-close"
                      onClick={() => setActiveKeystoneSlot(null)}
                    >
                      x
                    </button>
                  </div>
                  <h3 data-testid="formations-keycard-title">{activeKeystone.title}</h3>
                  <p data-testid="formations-keycard-blurb">{activeKeystone.blurb}</p>
                </div>
              )}

              {activeZone && overlay === "rondo" && (
                <div className="formations-card" data-testid="formations-zone-card">
                  <div className="formations-card-head">
                    <p className="formations-card-kicker">Rondo</p>
                    <button
                      type="button"
                      className="formations-card-close"
                      aria-label="Close zone card"
                      data-testid="formations-zone-close"
                      onClick={() => setActiveZoneKey(null)}
                    >
                      x
                    </button>
                  </div>
                  <h3 data-testid="formations-zone-title">
                    {rondoDisplayName(activeZone.rondo_name)}
                  </h3>

                  {/* Doc 06 section 2.3: the ring is the one zone that is
                      not a place on the pitch. Saying so is the teaching
                      point, so the card says it before it says anything
                      about counts. */}
                  {activeZone.zone_key === COUNTERPRESS_RING_ZONE_KEY && activeZone.radius !== null && (
                    <p className="formations-zone-note" data-testid="formations-ring-note">
                      This zone moves. It is a circle of radius {activeZone.radius} around the ball at the moment
                      you lose it, so rest defence is read relative to the ball and not to the pitch. With no ball
                      on the board it centres on your three most advanced players, which is why it travels every
                      time the shape does.
                    </p>
                  )}

                  {(() => {
                    const count = countByZone.get(activeZone.zone_key);
                    if (!count) {
                      const seeded = activeZone.canonical_rondo ?? "";
                      return (
                        <p className="formations-zone-fallback" data-testid="formations-zone-fallback">
                          {seeded ? `Canonical rondo here: ${seeded}. ` : ""}
                          That is the rondo this zone is coached as, not a count of what is on the board. Turn the
                          opposition on to see the live ratio.
                        </p>
                      );
                    }
                    const fm = freeManInZone(activeZone.zone_key);
                    return (
                      <p
                        className="formations-zone-read"
                        data-testid="formations-zone-read"
                        data-verdict={count.verdict}
                      >
                        {zoneReadLine(count, fm ? fm.whyItMatters : null)}
                      </p>
                    );
                  })()}

                  <p data-testid="formations-zone-teaches">{activeZone.teaches}</p>
                  <p className="formations-card-kicker">Trains</p>
                  <div className="formations-zone-patterns" data-testid="formations-zone-patterns">
                    {activeZone.trains_pattern_codes.map((code) => (
                      <span key={code} className="formations-pattern-chip" data-testid="formations-linked-pattern">
                        {libraryNames[code] ? `${code}: ${libraryNames[code]}` : code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------------- Panels ---------------- */}

              {panel === "details" && (
                <div className="formations-panel formations-details-panel" data-testid="formations-details-panel">
                  <div className="formations-details-head">
                    <h3>{selected.name}</h3>
                    <button
                      type="button"
                      className="formations-card-close"
                      aria-label="Close details"
                      data-testid="formations-details-close"
                      onClick={() => setPanel(null)}
                    >
                      x
                    </button>
                  </div>
                  <div className="formations-details-body">
                    <p className="formations-card-kicker">Shape</p>
                    <p>{selected.shape_blurb}</p>

                    <p className="formations-card-kicker">Strengths</p>
                    <ul>
                      {selected.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>

                    <p className="formations-card-kicker">Danger areas conceded</p>
                    <ul>
                      {selected.vulnerabilities.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>

                    <p className="formations-card-kicker">Keystones</p>
                    <div className="formations-details-keystones">
                      {selected.keystones.map((k) => (
                        <div
                          key={k.slot}
                          className="formations-details-card"
                          data-testid="formations-details-keystone"
                        >
                          <p className="formations-details-card-title">{k.title}</p>
                          <p>{k.blurb}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {panel === "phase" && (
                <div className="formations-panel" data-testid="formations-phase-panel">
                  <PanelHead title="Phase" onClose={() => setPanel(null)} testId="formations-phase-close" />
                  <div className="formations-panel-body">
                    <div className="formations-segment formations-segment-stacked" role="group" aria-label="Phase">
                      {PHASE_SEGMENTS.map((seg) => {
                        const available = seg.key === "base" || variantsForPhase(ourPhases, seg.key).length > 0;
                        return (
                          <button
                            key={seg.key}
                            type="button"
                            className="formations-segment-btn"
                            data-testid={`formations-phase-${seg.key}`}
                            aria-pressed={phaseKey === seg.key}
                            disabled={!available}
                            onClick={() => selectPhase(seg.key)}
                          >
                            {seg.label}
                          </button>
                        );
                      })}
                    </div>
                    {phaseKey !== "base" && phaseVariants.length > 1 && (
                      <div className="formations-variant-row" data-testid="formations-variant-row">
                        {phaseVariants.map((v) => (
                          <button
                            key={v.variant_code}
                            type="button"
                            className="formations-variant-chip"
                            data-testid="formations-variant-chip"
                            data-variant-code={v.variant_code}
                            aria-pressed={v.variant_code === variantCode}
                            onClick={() => setVariantCode(v.variant_code)}
                          >
                            {v.shape_label}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeVariant && <p className="formations-panel-note">{activeVariant.blurb}</p>}
                  </div>
                </div>
              )}

              {panel === "opposition" && (
                <div className="formations-panel" data-testid="formations-opposition-panel">
                  <PanelHead
                    title="Opposition"
                    onClose={() => setPanel(null)}
                    testId="formations-opposition-close"
                  />
                  <div className="formations-panel-body">
                    <button
                      type="button"
                      className="ctl-ghost"
                      data-testid="formations-opposition-switch"
                      aria-pressed={oppositionOn}
                      onClick={() => setOppositionOn((on) => !on)}
                    >
                      {oppositionOn ? "Hide the opposition" : "Show the opposition"}
                    </button>

                    {oppositionOn && (
                      <>
                        <label className="formations-field">
                          <span className="formations-card-kicker">Their formation</span>
                          <select
                            className="formations-select"
                            data-testid="formations-opponent-formation"
                            value={oppCode ?? ""}
                            onChange={(e) => {
                              setOppCode(e.target.value);
                              setOppVariantCode(null);
                            }}
                          >
                            {formations.map((f) => (
                              <option key={f.code} value={f.code}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="formations-field">
                          <span className="formations-card-kicker">Their phase</span>
                          <select
                            className="formations-select"
                            data-testid="formations-opponent-phase"
                            value={oppVariantCode ?? ""}
                            onChange={(e) => setOppVariantCode(e.target.value || null)}
                          >
                            <option value="">Their base shape</option>
                            {theirPhases.map((v) => (
                              <option key={v.variant_code} value={v.variant_code}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {read && (
                          <div className="formations-read" data-testid="formations-read">
                            {!seededMatchup && (
                              <p className="formations-read-unseeded" data-testid="formations-read-unseeded">
                                {NO_SEEDED_MATCHUP_NOTE}
                              </p>
                            )}

                            <p className="formations-card-kicker">Where you are spare</p>
                            <p data-testid="formations-read-spare">
                              {spareLine(read, zoneNameOf) ??
                                "No zone is yours on bodies or on placement right now. Move someone before you commit the ball."}
                            </p>

                            <p className="formations-card-kicker">Where you are short</p>
                            <p data-testid="formations-read-short">
                              {shortLine(read, zoneNameOf) ??
                                "No zone is theirs on bodies right now, so there is nothing to play away from."}
                            </p>

                            <p className="formations-card-kicker">How the ball gets there</p>
                            <p data-testid="formations-read-route" data-inferred={read.routeInferred}>
                              {read.routeInferred ? inferredRouteLine(read) : (seededMatchup?.route ?? "")}
                            </p>

                            {seededMatchup && (
                              <>
                                <p className="formations-card-kicker">Our edges</p>
                                <ul data-testid="formations-read-our-edges">
                                  {seededMatchup.our_edges.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                                <p className="formations-card-kicker">Their edges</p>
                                <ul data-testid="formations-read-their-edges">
                                  {seededMatchup.their_edges.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {panel === "rotations" && (
                <div className="formations-panel" data-testid="formations-rotations-panel">
                  <PanelHead
                    title="Rotations"
                    onClose={() => chooseOverlay("rotations")}
                    testId="formations-rotations-close"
                  />
                  <div className="formations-panel-body">
                    {rotations.length === 0 ? (
                      <p className="formations-panel-note">
                        No rotation systems apply to this formation yet.
                      </p>
                    ) : (
                      <div className="formations-rotation-list" data-testid="formations-rotation-list">
                        {rotations.map((r) => (
                          <button
                            key={r.code}
                            type="button"
                            className="formations-rotation-item"
                            data-testid="formations-rotation-item"
                            data-rotation-code={r.code}
                            aria-pressed={r.code === activeRotationCode}
                            onClick={() => selectRotation(r.code)}
                          >
                            <span className="formations-rotation-item-name">{r.name}</span>
                            <span className="formations-rotation-item-shape">{r.produces_shape}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {activeRotation && (
                      <div className="formations-rotation-card" data-testid="formations-rotation-card">
                        <h3>{activeRotation.name}</h3>
                        <p className="formations-panel-note">
                          Playing the movement on its own, not on the full eleven, so you can see who goes where.
                        </p>

                        <p className="formations-card-kicker">Trigger</p>
                        <p data-testid="formations-rotation-trigger">{activeRotation.trigger}</p>

                        <p className="formations-card-kicker">What moves</p>
                        <ul data-testid="formations-rotation-moves">
                          {activeRotation.what_moves.map((m, i) => (
                            <li key={i}>
                              {slotLabel(m.slot)}
                              {m.becomes ? ` becomes the ${slotLabel(m.becomes, false)}` : ""}
                            </li>
                          ))}
                        </ul>

                        <p className="formations-card-kicker">Coaching points</p>
                        <ul data-testid="formations-rotation-points">
                          {activeRotation.coaching_points.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>

                        {/* Doc 06 section 5.1: the risk line gets EQUAL visual
                            weight to the benefit. Same grid track, same
                            padding, same type scale, same colour weight. It is
                            not a footnote and the CSS must not let it become
                            one. */}
                        <div className="formations-balance" data-testid="formations-rotation-balance">
                          <div className="formations-balance-half" data-testid="formations-rotation-gain">
                            <p className="formations-balance-kicker">Gain</p>
                            <p className="formations-balance-body">
                              Produces {activeRotation.produces_shape}.
                            </p>
                          </div>
                          <div className="formations-balance-half" data-testid="formations-rotation-risk">
                            <p className="formations-balance-kicker">Risk</p>
                            <p className="formations-balance-body">{activeRotation.risk}</p>
                          </div>
                        </div>

                        {activeRotation.exemplar_note && (
                          <>
                            <p className="formations-card-kicker">Seen in</p>
                            <p>{activeRotation.exemplar_note}</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {panel === "grid" && (
                <div className="formations-panel" data-testid="formations-grid-panel">
                  <PanelHead
                    title="Positional grid"
                    onClose={() => chooseOverlay("grid")}
                    testId="formations-grid-close"
                  />
                  <div className="formations-panel-body">
                    <p className="formations-card-kicker">Positional superiority check</p>
                    {gridResult.breaches.length === 0 ? (
                      <p data-testid="formations-grid-check">{NO_BREACH_CHECK}</p>
                    ) : (
                      <ul className="formations-check-list">
                        {gridResult.breaches.map((b, i) => (
                          <li key={i} data-testid="formations-grid-check">
                            {breachCheck(b)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="formations-panel-note">
                      These are checks, not errors. A breach can be exactly the overload you wanted, and it is
                      normal for one to appear and disappear as the shape moves through a phase.
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* end .formations-board-frame */}

            <p className="formations-caption" data-testid="formations-phase-caption">
              {caption}
            </p>
          </div>

          {/* Page-level swipe-up sheet: "Browse formations" (T-106) plus
              T-107's personnel panel as the segment alongside it (doc 06
              section 5.3: "opens from the sheet as a third segment"). */}
          <div
            className={`formations-sheet${sheetOpen ? " formations-sheet-open" : ""}`}
            data-sheet-tab={sheetTab}
          >
            <button
              type="button"
              className="formations-sheet-handle"
              data-testid="formations-sheet-handle"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((o) => !o)}
            >
              <span className="formations-sheet-grip" aria-hidden="true" />
              {sheetTab === "personnel" ? "Personnel" : "Browse formations"}
              <span className="formations-sheet-chevron" aria-hidden="true">
                {sheetOpen ? "⌄" : "⌃"}
              </span>
            </button>

            {sheetOpen && (
              <div className="formations-sheet-body" data-testid="formations-sheet-body">
                <div
                  className="formations-segment formations-sheet-segment"
                  role="group"
                  aria-label="Sheet view"
                  data-testid="formations-sheet-segment"
                >
                  <button
                    type="button"
                    className="formations-segment-btn"
                    data-testid="formations-sheet-tab-browse"
                    aria-pressed={sheetTab === "browse"}
                    onClick={() => setSheetTab("browse")}
                  >
                    Browse formations
                  </button>
                  <button
                    type="button"
                    className="formations-segment-btn"
                    data-testid="formations-sheet-tab-personnel"
                    aria-pressed={sheetTab === "personnel"}
                    onClick={() => setSheetTab("personnel")}
                  >
                    Personnel
                  </button>
                </div>

                {sheetTab === "browse" ? (
                  <>
                    <input
                      type="search"
                      className="formations-search"
                      placeholder="Search formations..."
                      aria-label="Search formations"
                      data-testid="formations-search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />

                    <div className="formations-grid" data-testid="formations-grid">
                      {tiles.map((f) => (
                        <button
                          key={f.code}
                          type="button"
                          className="formations-tile"
                          data-testid="formations-tile"
                          onClick={() => selectFormation(f.code)}
                        >
                          <FormationThumb formation={f} />
                          <span className="formations-tile-code">{f.code}</span>
                          <span className="formations-tile-name">{f.name}</span>
                        </button>
                      ))}
                      {tiles.length === 0 && (
                        <p className="formations-empty-result" data-testid="formations-empty-result">
                          No matches. Try a different search.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  // key={selected.code}: a fresh formation is a fresh eleven
                  // slots, so the panel remounts with clean scratch state
                  // rather than carrying stale slot assignments from the
                  // formation the coach was just looking at.
                  <PersonnelPanel
                    key={selected.code}
                    formationCode={selected.code}
                    positions={selected.positions}
                    role={role}
                    phone={phone}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// T-107 Personnel panel (doc 06 sections 2.6, 2.7, 5.3, 5.4). Opens as the
// sheet's "Personnel" segment: for each of the formation's eleven slots, a
// player picker (from the team roster, open to both roles), an archetype
// picker (library world, open to both roles), a top-three suggestion list
// with the server's own cited reason (COACH-ONLY), and a footedness note
// (COACH-ONLY, computed here per doc 06 section 2.7 since no endpoint
// carries it). A live unit balance read (COACH-ONLY) sits underneath.
//
// Nothing here is saved: doc 06 section 5.3 never asks the panel to
// persist a setup, and POST /formations/{code}/balance's own docstring
// says it evaluates the panel's UNSAVED picks. `assignments` is therefore
// plain component state, gone the moment the sheet's formation changes
// (the `key={selected.code}` at the call site remounts this component
// rather than carrying stale picks across formations).
// ---------------------------------------------------------------------------

/** A formation slot once its slot_family is known non-null. Always true
 *  for `selected.positions` (the base formation, backend/app/routers/
 *  formations.py always populates it there); the type stays a filter
 *  rather than an assertion because FormationPositionWire's slot_family is
 *  optional for the ONE other place that type is reused, a
 *  formation_phases row's positions, which this panel never receives. */
type PersonnelSlotWire = FormationPositionWire & { slot_family: string };

interface SlotAssignment {
  playerId: number | null;
  archetypeCode: string | null;
}

interface PersonnelPanelProps {
  formationCode: string;
  positions: FormationPositionWire[];
  role: Role;
  phone: boolean;
}

function PersonnelPanel({ formationCode, positions, role, phone }: PersonnelPanelProps) {
  const isCoach = role === "coach";

  const knownSlots = useMemo(
    () => positions.filter((p): p is PersonnelSlotWire => p.slot_family !== null),
    [positions]
  );

  const [roster, setRoster] = useState<PlayerWire[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [archetypesByFamily, setArchetypesByFamily] = useState<Record<string, PositionArchetypeWire[]>>({});
  const [assignments, setAssignments] = useState<Record<string, SlotAssignment>>({});
  const [suggestionsBySlot, setSuggestionsBySlot] = useState<Record<string, ArchetypeSuggestionWire[]>>({});
  const [balance, setBalance] = useState<UnitBalanceResponseWire | null>(null);
  const [groupIndex, setGroupIndex] = useState(0);

  // Roster: open to both roles (rosterApi.fetchRoster, same call the
  // Roster page makes; the roster itself is player-viewable per the
  // permission table, only its fit-warning analysis is coach-only, and
  // this panel never touches that).
  useEffect(() => {
    let cancelled = false;
    fetchRoster()
      .then((r) => {
        if (!cancelled) setRoster(r.players);
      })
      .catch(() => {
        if (!cancelled) setRosterError("Could not load the roster. Archetypes still work on their own.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Archetype catalog per slot family found on this formation: library
  // world, open to both roles.
  const families = useMemo(() => [...new Set(knownSlots.map((s) => s.slot_family))], [knownSlots]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(families.map((f) => listArchetypes(f).then((list) => [f, list] as const)))
      .then((entries) => {
        if (!cancelled) setArchetypesByFamily(Object.fromEntries(entries));
      })
      .catch(() => {
        // Non-fatal: the roster and slot list already render either way,
        // an archetype picker just comes up short of options.
      });
    return () => {
      cancelled = true;
    };
  }, [families]);

  function setPlayerForSlot(slot: string, playerId: number | null) {
    setAssignments((prev) => ({
      ...prev,
      [slot]: { playerId, archetypeCode: prev[slot]?.archetypeCode ?? null },
    }));
  }

  function setArchetypeForSlot(slot: string, archetypeCode: string | null) {
    setAssignments((prev) => ({
      ...prev,
      [slot]: { playerId: prev[slot]?.playerId ?? null, archetypeCode },
    }));
  }

  // Suggestions (doc 06 section 5.3), COACH-ONLY. Keyed off the PLAYER
  // each slot carries, not the archetype: which archetype is currently
  // picked plays no part in ranking candidates for the slot.
  const assignedPlayerKey = useMemo(
    () => knownSlots.map((s) => `${s.slot}:${assignments[s.slot]?.playerId ?? ""}`).join("|"),
    [knownSlots, assignments]
  );

  useEffect(() => {
    if (!isCoach) {
      setSuggestionsBySlot({});
      return;
    }
    let cancelled = false;
    Promise.all(
      knownSlots.map((s) =>
        suggestArchetypes({
          slotFamily: s.slot_family,
          playerId: assignments[s.slot]?.playerId ?? null,
          side: sideOfY(s.y),
        }).then((res) => [s.slot, res.suggestions] as const)
      )
    )
      .then((entries) => {
        if (!cancelled) setSuggestionsBySlot(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setSuggestionsBySlot({});
      });
    return () => {
      cancelled = true;
    };
    // assignedPlayerKey stands in for `assignments` here on purpose: this
    // effect only cares about WHICH PLAYER is on each slot, and keying on
    // the whole assignments object would refire it on every archetype pick
    // too, tripling the coach-only request count for no reason. The
    // closure still reads the live `assignments` inside the effect body
    // (via the .map above), so this is a deliberately narrower dependency
    // list, not a stale one: assignedPlayerKey changes exactly when the
    // relevant part of `assignments` does.
  }, [isCoach, formationCode, assignedPlayerKey, knownSlots]);

  // Unit balance (doc 06 sections 2.6, 3.1, 5.3), COACH-ONLY, "live as
  // archetypes change": keyed off the ARCHETYPE each slot carries.
  const assignedArchetypeKey = useMemo(
    () => knownSlots.map((s) => `${s.slot}:${assignments[s.slot]?.archetypeCode ?? ""}`).join("|"),
    [knownSlots, assignments]
  );

  useEffect(() => {
    if (!isCoach) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    evaluateUnitBalance(
      formationCode,
      knownSlots.map((s) => ({ slot: s.slot, archetype_code: assignments[s.slot]?.archetypeCode ?? null }))
    )
      .then((res) => {
        if (!cancelled) setBalance(res);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
    // Same narrower-dependency reasoning as the suggestions effect above:
    // assignedArchetypeKey is what this effect actually needs to react to.
  }, [isCoach, formationCode, assignedArchetypeKey, knownSlots]);

  const playersById = useMemo(() => {
    const map = new Map<number, PlayerWire>();
    for (const p of roster ?? []) map.set(p.id, p);
    return map;
  }, [roster]);

  function footFor(slot: string): PreferredFootOrNull {
    const playerId = assignments[slot]?.playerId ?? null;
    if (playerId === null) return null;
    return playersById.get(playerId)?.preferred_foot ?? null;
  }

  // Rule 4 is the one footedness rule that reads TWO slots (doc 06 section
  // 2.7 item 4), computed once per formation and attached under both
  // fullback rows rather than derived per slot.
  const fbLeftSlot = knownSlots.find((s) => s.slot_family === "fb" && sideOfY(s.y) === "left");
  const fbRightSlot = knownSlots.find((s) => s.slot_family === "fb" && sideOfY(s.y) === "right");
  const fbPairNote = fullbackPairNote(
    fbLeftSlot ? footFor(fbLeftSlot.slot) : null,
    fbRightSlot ? footFor(fbRightSlot.slot) : null
  );

  const groups = useMemo(() => personnelGroups(knownSlots), [knownSlots]);

  useEffect(() => {
    setGroupIndex(0);
  }, [formationCode]);

  if (groups.length === 0) {
    return (
      <p className="formations-panel-note" data-testid="personnel-no-slots">
        This formation has no slots to assign yet.
      </p>
    );
  }

  const clampedIndex = Math.min(groupIndex, groups.length - 1);
  const visibleGroups = phone ? [groups[clampedIndex]] : groups;

  return (
    <div className="personnel-panel" data-testid="personnel-panel">
      {rosterError && (
        <p role="alert" className="formations-error">
          {rosterError}
        </p>
      )}

      {/* Empty roster is a first-class state (doc 06 section 5.3): the
          panel still works, archetypes alone, no players assigned. This
          notice is informational for both roles, not a coach-only read. */}
      {roster !== null && roster.length === 0 && (
        <p className="personnel-empty-roster" data-testid="personnel-empty-roster">
          No players on the roster yet. Archetypes still rank and the shape still holds together on its own; assign
          players whenever the roster is ready.
        </p>
      )}

      {/* doc 06 section 5.4: "the personnel panel is a full-height sheet,
          ONE UNIT AT A TIME" on phone. Desktop stacks every group and
          scrolls the panel instead. */}
      {phone && (
        <div className="personnel-pager" data-testid="personnel-pager">
          <button
            type="button"
            className="ctl-ghost"
            data-testid="personnel-pager-prev"
            disabled={clampedIndex === 0}
            onClick={() => setGroupIndex((i) => Math.max(0, i - 1))}
          >
            Prev
          </button>
          <span className="personnel-pager-label" data-testid="personnel-pager-label">
            {groups[clampedIndex].label} ({clampedIndex + 1} of {groups.length})
          </span>
          <button
            type="button"
            className="ctl-ghost"
            data-testid="personnel-pager-next"
            disabled={clampedIndex >= groups.length - 1}
            onClick={() => setGroupIndex((i) => Math.min(groups.length - 1, i + 1))}
          >
            Next
          </button>
        </div>
      )}

      {visibleGroups.map((group) => (
        <div className="personnel-group" data-testid="personnel-group" data-group={group.key} key={group.key}>
          {!phone && <h3 className="personnel-group-title">{group.label}</h3>}
          {group.slots.map((slot) => (
            <SlotRow
              key={slot.slot}
              slot={slot}
              side={sideOfY(slot.y)}
              archetypes={archetypesByFamily[slot.slot_family] ?? []}
              roster={roster ?? []}
              assignment={assignments[slot.slot] ?? { playerId: null, archetypeCode: null }}
              onPlayerChange={(playerId) => setPlayerForSlot(slot.slot, playerId)}
              onArchetypeChange={(code) => setArchetypeForSlot(slot.slot, code)}
              suggestions={suggestionsBySlot[slot.slot]}
              footNote={slot.slot_family === "fb" ? fbPairNote : slotFootednessNote(slot.slot_family, sideOfY(slot.y), footFor(slot.slot))}
              coachView={isCoach}
            />
          ))}
        </div>
      ))}

      {/* Unit balance (doc 06 sections 2.6, 3.1, 5.3), COACH-ONLY: absent
          from the DOM entirely for a player token, not merely hidden,
          because `balance` never leaves null when isCoach is false. Reads
          the REAL slot-to-unit crosswalk straight off the balance
          response (app/units.py), so it names units the simple four-group
          pager above never had to reconstruct (e.g. "Wide unit, left").
          A unit the formation does not contain is not in `units` at all
          (T-110's units_not_evaluated), so nothing here mentions it: say
          nothing rather than shout. */}
      {isCoach && balance && (
        <div className="personnel-balance" data-testid="personnel-balance">
          <p className="formations-card-kicker">Unit balance</p>
          {balance.units.length === 0 ? (
            <p className="formations-panel-note" data-testid="personnel-balance-empty">
              No units are ready to read yet. Pick archetypes for a full unit (a back line, a midfield trio or pivot,
              a front line) to see a balance read.
            </p>
          ) : (
            balance.units.map((u) => (
              <div
                className="personnel-balance-unit"
                data-testid="personnel-balance-unit"
                key={`${u.unit}-${u.flank ?? ""}`}
              >
                <p className="personnel-balance-unit-title">{unitHeading(u.unit, u.flank)}</p>
                {u.notes.length === 0 ? (
                  <p className="personnel-balance-note" data-testid="personnel-balance-note" data-severity="none">
                    {u.is_complete
                      ? "No balance notes. This unit checks out."
                      : "Not fully assigned yet. Balance notes appear once every slot in this unit has an archetype."}
                  </p>
                ) : (
                  u.notes.map((n) => (
                    <p
                      key={n.code}
                      className="personnel-balance-note"
                      data-testid="personnel-balance-note"
                      data-severity={n.severity}
                    >
                      {n.message}
                    </p>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type PreferredFootOrNull = PlayerWire["preferred_foot"] | null;

interface SlotRowProps {
  slot: PersonnelSlotWire;
  side: ReturnType<typeof sideOfY>;
  archetypes: PositionArchetypeWire[];
  roster: PlayerWire[];
  assignment: SlotAssignment;
  onPlayerChange: (playerId: number | null) => void;
  onArchetypeChange: (code: string | null) => void;
  /** undefined (not yet loaded) and [] (loaded, empty) both render no
   *  list; the distinction only matters to the network layer above. */
  suggestions: ArchetypeSuggestionWire[] | undefined;
  footNote: string | null;
  /** Suggestions and the footedness note are COACH-ONLY (doc 06 sections
   *  2.7, 5.3): when false, this row renders neither, and not as a hidden
   *  element either, so a player token's page carries no trace of them. */
  coachView: boolean;
}

function SlotRow({
  slot,
  side,
  archetypes,
  roster,
  assignment,
  onPlayerChange,
  onArchetypeChange,
  suggestions,
  footNote,
  coachView,
}: SlotRowProps) {
  const selectedArchetype = archetypes.find((a) => a.code === assignment.archetypeCode) ?? null;
  return (
    <div className="personnel-slot" data-testid="personnel-slot" data-slot={slot.slot}>
      <div className="personnel-slot-head">
        <span className="personnel-slot-name" data-testid="personnel-slot-name">
          {slotLabel(slot.slot)}
        </span>
        <span className="personnel-slot-family">
          {familyLabel(slot.slot_family)}
          {side !== "center" ? `, ${side}` : ""}
        </span>
      </div>

      <label className="formations-field">
        <span className="formations-card-kicker">Player</span>
        <select
          className="formations-select"
          data-testid="personnel-player-select"
          value={assignment.playerId ?? ""}
          onChange={(e) => onPlayerChange(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Unassigned</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="formations-field">
        <span className="formations-card-kicker">Archetype</span>
        <select
          className="formations-select"
          data-testid="personnel-archetype-select"
          value={assignment.archetypeCode ?? ""}
          onChange={(e) => onArchetypeChange(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">No archetype picked</option>
          {archetypes.map((a) => (
            <option key={a.code} value={a.code}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {selectedArchetype && (
        <p className="personnel-archetype-definition" data-testid="personnel-archetype-definition">
          {selectedArchetype.definition}
        </p>
      )}

      {/* Suggestions (doc 06 section 5.3): "show the top three with a
          one-line why for each. The why must cite the actual reason ...,
          not a score." `s.why` is rendered exactly as the API returns it;
          nothing here recomputes or summarises it. */}
      {coachView && suggestions && suggestions.length > 0 && (
        <div className="personnel-suggestions" data-testid="personnel-suggestions">
          <p className="formations-card-kicker">Suggested archetypes</p>
          <ul className="personnel-suggestion-list">
            {suggestions.map((s) => (
              <li key={s.archetype_code} className="personnel-suggestion" data-testid="personnel-suggestion">
                <button
                  type="button"
                  className="personnel-suggestion-pick"
                  data-testid="personnel-suggestion-pick"
                  aria-pressed={assignment.archetypeCode === s.archetype_code}
                  onClick={() => onArchetypeChange(s.archetype_code)}
                >
                  {s.archetype_name}
                </button>
                <span className="personnel-suggestion-why" data-testid="personnel-suggestion-why">
                  {s.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {coachView && footNote && (
        <p className="personnel-foot-note" data-testid="personnel-foot-note">
          {footNote}
        </p>
      )}
    </div>
  );
}

function PanelHead({
  title,
  onClose,
  testId,
}: {
  title: string;
  onClose: () => void;
  testId: string;
}) {
  return (
    <div className="formations-details-head">
      <h3>{title}</h3>
      <button
        type="button"
        className="formations-card-close"
        aria-label={`Close ${title.toLowerCase()}`}
        data-testid={testId}
        onClick={onClose}
      >
        x
      </button>
    </div>
  );
}

function phaseLabel(key: PhaseKey): string {
  return PHASE_SEGMENTS.find((s) => s.key === key)?.label ?? key;
}
