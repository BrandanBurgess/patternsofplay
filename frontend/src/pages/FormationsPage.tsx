// Formations page (Brief step 18, PNG 11, 19, 37-39, 43): board-first
// render of one of the six seeded formation presets. Keystone slots pulse
// gold and tap to a floating keycard; a page-level swipe-up sheet browses
// the presets by searchable shape thumbnail; the floating meta bar gives
// Details (strengths, danger areas conceded, every keystone blurb per
// design README) and a Rondo Map toggle: five tappable zones (433 only,
// per seeds/rondo_zones.json), each showing its rondo and the patterns it
// trains. Shares the board-first shell (board + meta bar + sheet) the
// Patterns page (T-031) established, and reuses PatternPreviewBoard
// (extended with pulsing/clickable tokens and a zone overlay) rather than
// a parallel renderer.

import { useEffect, useMemo, useState } from "react";
import type { Orientation } from "../board/coords";
import PatternPreviewBoard, { type PreviewToken, type PreviewZone } from "../board/PatternPreviewBoard";
import { listFormations, type FormationKeystoneWire, type FormationOutWire } from "../formationsApi";
import { listLibraryItems } from "../libraryApi";
import "./FormationsPage.css";

function humanizeSlug(slug: string): string {
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function matchesSearch(haystack: (string | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => h?.toLowerCase().includes(q));
}

// rondo_name reads like "5v3 (the midfield box)"; the on-pitch zone label
// is just the ratio prefix, everything from the first " (" on is the long
// form shown in the zone card instead.
function shortZoneLabel(rondoName: string): string {
  const idx = rondoName.indexOf(" (");
  return idx === -1 ? rondoName : rondoName.slice(0, idx);
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
}

export function FormationsPage({ orientation }: FormationsPageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formations, setFormations] = useState<FormationOutWire[]>([]);
  // code -> name across all three libraries (rondo zones train pattern,
  // delivery, and rotation codes alike), so the Rondo Map's "linked
  // patterns" can resolve any of them, not just the Patterns tab's codes.
  const [libraryNames, setLibraryNames] = useState<Record<string, string>>({});

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rondoOpen, setRondoOpen] = useState(false);
  const [activeKeystoneSlot, setActiveKeystoneSlot] = useState<string | null>(null);
  const [activeZoneKey, setActiveZoneKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listFormations(),
      listLibraryItems("pattern"),
      listLibraryItems("delivery"),
      listLibraryItems("rotation"),
    ])
      .then(([fs, patterns, deliveries, rotations]) => {
        if (cancelled) return;
        setFormations(fs);
        setSelectedCode((cur) => cur ?? fs[0]?.code ?? null);
        const names: Record<string, string> = {};
        for (const item of [...patterns, ...deliveries, ...rotations]) names[item.code] = item.name;
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

  const selected = useMemo(
    () => formations.find((f) => f.code === selectedCode) ?? null,
    [formations, selectedCode]
  );

  const keystoneBySlot = useMemo(() => {
    const map = new Map<string, FormationKeystoneWire>();
    for (const k of selected?.keystones ?? []) map.set(k.slot, k);
    return map;
  }, [selected]);

  // Every position slot renders; only keystone slots pulse, label with
  // their position code, and accept a tap (design README: "keystones
  // pulsing, tap for its blurb").
  const tokens = useMemo<PreviewToken[]>(() => {
    if (!selected) return [];
    return selected.positions.map((p) => {
      const isKeystone = keystoneBySlot.has(p.slot);
      return {
        id: p.slot,
        side: "home",
        label: isKeystone ? p.position_code : "",
        pos: { x: p.x, y: p.y },
        pulsing: isKeystone,
      };
    });
  }, [selected, keystoneBySlot]);

  const zones = useMemo<PreviewZone[]>(() => {
    if (!selected || !rondoOpen) return [];
    return selected.rondo_zones.map((z) => ({
      key: z.zone_key,
      label: shortZoneLabel(z.rondo_name),
      corners: z.polygon,
      active: z.zone_key === activeZoneKey,
    }));
  }, [selected, rondoOpen, activeZoneKey]);

  const tiles = useMemo(
    () => formations.filter((f) => matchesSearch([f.name, f.code, ...f.natural_identities], searchQuery)),
    [formations, searchQuery]
  );

  function selectFormation(code: string) {
    setSelectedCode(code);
    setSheetOpen(false);
    setDetailsOpen(false);
    setRondoOpen(false);
    setActiveKeystoneSlot(null);
    setActiveZoneKey(null);
  }

  function toggleRondo() {
    setRondoOpen((open) => !open);
    setActiveZoneKey(null);
    setDetailsOpen(false);
    setActiveKeystoneSlot(null);
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

  return (
    <section className="formations-page">
      <h2 className="app-page-heading">
        Formations
        <span
          className="app-page-info"
          aria-hidden="true"
          title="Browse the six preset shapes, tap a keystone for its blurb, or toggle the Rondo map."
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
            <PatternPreviewBoard
              orientation={orientation}
              tokens={tokens}
              playback={null}
              zones={zones}
              onTokenClick={handleTokenClick}
              onZoneClick={handleZoneClick}
            />

            {!rondoOpen ? (
              <div className="formations-meta-bar" data-testid="formations-meta-bar">
                <span className="formations-meta-title" data-testid="formations-meta-title">
                  {selected.name}
                  {identityLabel ? `: ${identityLabel}` : ""}
                </span>
                <button
                  type="button"
                  className="formations-details-btn"
                  data-testid="formations-details-toggle"
                  aria-pressed={detailsOpen}
                  onClick={() => setDetailsOpen((o) => !o)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="ctl-ghost"
                  data-testid="formations-rondo-toggle"
                  disabled={selected.rondo_zones.length === 0}
                  onClick={toggleRondo}
                >
                  Rondo map
                </button>
              </div>
            ) : (
              <div className="formations-meta-bar" data-testid="formations-meta-bar">
                <button
                  type="button"
                  className="formations-rondo-pill"
                  data-testid="formations-rondo-active-toggle"
                  aria-pressed="true"
                  onClick={toggleRondo}
                >
                  Rondo map: tap a zone
                </button>
              </div>
            )}

            {activeKeystone && !rondoOpen && (
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

            {activeZone && rondoOpen && (
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
                <h3 data-testid="formations-zone-title">{activeZone.rondo_name}</h3>
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

            {detailsOpen && !rondoOpen && (
              <div className="formations-details-panel" data-testid="formations-details-panel">
                <div className="formations-details-head">
                  <h3>{selected.name}</h3>
                  <button
                    type="button"
                    className="formations-card-close"
                    aria-label="Close details"
                    data-testid="formations-details-close"
                    onClick={() => setDetailsOpen(false)}
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
          </div>

          <div className="formations-sheet">
            <button
              type="button"
              className="formations-sheet-handle"
              data-testid="formations-sheet-handle"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((o) => !o)}
            >
              <span className="formations-sheet-grip" aria-hidden="true" />
              Browse formations
              <span className="formations-sheet-chevron" aria-hidden="true">
                {sheetOpen ? "⌄" : "⌃"}
              </span>
            </button>

            {sheetOpen && (
              <div className="formations-sheet-body" data-testid="formations-sheet-body">
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
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
