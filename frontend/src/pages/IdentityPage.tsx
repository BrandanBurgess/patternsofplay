// Identity page (Brief step 20, PNG 13, 33, 40-42, 44, 45): board-first,
// empty board by default; a page-level swipe-up sheet holds search and
// three segments (Reference teams, Style archetypes, Cult corner);
// selecting a team or style plays its signature idea on the board (the
// four scripted animations) or renders its static in-possession shape
// (Atletico, Man City); the remaining reference teams are data slots that
// render Details only (CLAUDE.md rule 6: no designed surface, no
// invented one). Details follows the Section 6 five-part template
// (Formation & shape, Core idea, Signature patterns, Keystone roles,
// Youth takeaway), plus an Age hint row (Bible 8.2.4, T-012); style
// archetypes additionally show the pass-risk block (Bible 5.7) between
// Keystone roles and Youth takeaway. Copy rule (doc 03 section 7):
// identities curate, never lock.

import { useEffect, useMemo, useState } from "react";
import type { Orientation } from "../board/coords";
import PatternPreviewBoard from "../board/PatternPreviewBoard";
import { listIdentities, type IdentityKind, type IdentityOutWire, type KeystoneRoleWire } from "../identityApi";
import { identityPreview } from "./identityPreview";
import { TileThumb } from "./PatternsPage";
import "./PatternsPage.css";
import "./IdentityPage.css";

const SEGMENTS: { key: IdentityKind; label: string }[] = [
  { key: "reference_team", label: "Reference teams" },
  { key: "style_archetype", label: "Style archetypes" },
  { key: "cult_card", label: "Cult corner" },
];

function humanizeSlug(slug: string): string {
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function matchesSearch(haystack: (string | undefined | null)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => h?.toLowerCase().includes(q));
}

/** Every reference team's core_idea begins with a "Formation: ..." leading
 * sentence (seeds/identities_reference_teams.json); this pulls it out for
 * the template's own "Formation & shape" row and returns the remainder as
 * the "Core idea" row. Style archetypes and cult cards never carry this
 * prefix, so they fall through with formationShape null and the full text
 * as core idea, unchanged. */
function splitFormationAndCoreIdea(coreIdea: string): { formationShape: string | null; idea: string } {
  if (!coreIdea.startsWith("Formation:")) return { formationShape: null, idea: coreIdea };
  const sentenceEnd = coreIdea.indexOf(". ");
  const firstSentence = sentenceEnd === -1 ? coreIdea : coreIdea.slice(0, sentenceEnd + 1);
  const rest = sentenceEnd === -1 ? "" : coreIdea.slice(sentenceEnd + 2);
  const formationShape = firstSentence.replace(/^Formation:\s*/, "").replace(/\.\s*$/, "");
  return { formationShape, idea: rest || firstSentence };
}

function keystoneRoleLabel(role: KeystoneRoleWire): string {
  return typeof role === "string" ? humanizeSlug(role) : `${humanizeSlug(role.role)}: ${role.note}`;
}

interface IdentityPageProps {
  orientation: Orientation;
}

export function IdentityPage({ orientation }: IdentityPageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemsByKind, setItemsByKind] = useState<Record<IdentityKind, IdentityOutWire[]>>({
    reference_team: [],
    style_archetype: [],
    cult_card: [],
  });

  const [segment, setSegment] = useState<IdentityKind>("reference_team");
  const [searchQuery, setSearchQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selection, setSelection] = useState<IdentityOutWire | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listIdentities("reference_team"),
      listIdentities("style_archetype"),
      listIdentities("cult_card"),
    ])
      .then(([referenceTeams, styleArchetypes, cultCards]) => {
        if (cancelled) return;
        setItemsByKind({
          reference_team: referenceTeams,
          style_archetype: styleArchetypes,
          cult_card: cultCards,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load identities. Try reloading.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tiles = useMemo(
    () =>
      itemsByKind[segment].filter((item) =>
        // Only the user-visible fields: item.code is an internal slug
        // (e.g. "hybrid_transition_control") never shown on the tile, and
        // searching it produces surprising substring collisions (that
        // slug alone contains "control").
        matchesSearch([item.name, item.tag_line], searchQuery)
      ),
    [itemsByKind, segment, searchQuery]
  );

  function switchSegment(next: IdentityKind) {
    setSegment(next);
    setSearchQuery("");
  }

  function selectIdentity(item: IdentityOutWire) {
    setSelection(item);
    setSheetOpen(false);
    setDetailsOpen(false);
  }

  function clearSelection() {
    setSelection(null);
    setDetailsOpen(false);
  }

  const preview = useMemo(() => {
    if (!selection) return { tokens: [], playback: null };
    return identityPreview(selection);
  }, [selection]);

  const templateRows = useMemo(() => {
    if (!selection) return null;
    const { formationShape, idea } = splitFormationAndCoreIdea(selection.core_idea);
    return { formationShape, idea };
  }, [selection]);

  return (
    <section className="patterns-page identity-page">
      <h2 className="app-page-heading">
        Team identity
        <span
          className="app-page-info"
          aria-hidden="true"
          data-testid="identity-info"
          title="Identities curate, never lock. Pull up Browse identities to explore the great teams and style archetypes: pick one, and its signature idea plays on the board, with the formation, keystone roles, youth takeaway, and age hint in Details."
        >
          i
        </span>
      </h2>

      {loadError && (
        <p role="alert" className="patterns-error">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="patterns-loading">Loading identities...</p>
      ) : (
        <div className="patterns-stage">
          <div className="patterns-board-area">
            <PatternPreviewBoard
              orientation={orientation}
              tokens={preview.tokens}
              playback={preview.playback}
              onPlayingChange={setPlaying}
              emptyMessage={
                !selection ? (
                  <>
                    Pick a team or a style from <strong>Browse identities</strong> below.
                    <br />
                    Its signature idea plays here.
                  </>
                ) : preview.tokens.length === 0 ? (
                  <>
                    No visualization for this entry yet.
                    <br />
                    Open <strong>Details</strong> below for the full breakdown.
                  </>
                ) : undefined
              }
            />

            {selection && (
              <div className="patterns-meta-bar" data-testid="identity-meta-bar">
                <span className="patterns-meta-title" data-testid="identity-meta-title">
                  {selection.name}
                </span>
                <button
                  type="button"
                  className="patterns-details-btn"
                  data-testid="identity-details-toggle"
                  aria-pressed={detailsOpen}
                  onClick={() => setDetailsOpen((o) => !o)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="ctl-ghost"
                  data-testid="identity-clear"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>
            )}

            {playing && (
              <div className="patterns-playing-pill" data-testid="identity-playing-pill">
                <span className="patterns-playing-dot" aria-hidden="true" />
                Playing
              </div>
            )}

            {detailsOpen && selection && templateRows && (
              <div className="patterns-details-panel" data-testid="identity-details-panel">
                <div className="patterns-details-head">
                  <h3>{selection.name}</h3>
                  <button
                    type="button"
                    className="patterns-details-close"
                    aria-label="Close details"
                    data-testid="identity-details-close"
                    onClick={() => setDetailsOpen(false)}
                  >
                    x
                  </button>
                </div>
                <div className="patterns-details-body identity-details-body">
                  {templateRows.formationShape && (
                    <div className="identity-detail-row" data-testid="identity-detail-formation">
                      <p className="patterns-details-kicker">Formation &amp; shape</p>
                      <p>{templateRows.formationShape}</p>
                    </div>
                  )}
                  <div className="identity-detail-row" data-testid="identity-detail-core-idea">
                    <p className="patterns-details-kicker">Core idea</p>
                    <p>{templateRows.idea}</p>
                  </div>
                  {selection.signature_pattern_codes.length > 0 && (
                    <div className="identity-detail-row" data-testid="identity-detail-signature-patterns">
                      <p className="patterns-details-kicker">Signature patterns</p>
                      <div className="identity-tags">
                        {selection.signature_pattern_codes.map((code) => (
                          <span key={code} className="identity-tag">
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selection.keystone_roles && selection.keystone_roles.length > 0 && (
                    <div className="identity-detail-row" data-testid="identity-detail-keystone-roles">
                      <p className="patterns-details-kicker">Keystone roles</p>
                      <ul className="identity-keystone-list">
                        {selection.keystone_roles.map((role, i) => (
                          <li key={i}>{keystoneRoleLabel(role)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selection.pass_risk && (
                    <div className="identity-detail-row" data-testid="identity-detail-pass-risk">
                      <p className="patterns-details-kicker">Passing menu</p>
                      <p>
                        <span className="identity-risk-encouraged">Encouraged:</span>{" "}
                        {selection.pass_risk.encouraged.join(", ")}
                        <br />
                        <span className="identity-risk-discouraged">Off-menu:</span>{" "}
                        {selection.pass_risk.discouraged.join(", ")}
                        <br />
                        <span className="identity-risk-tempo">Tempo: {selection.pass_risk.tempo_rule}</span>
                      </p>
                    </div>
                  )}
                  <div className="identity-detail-row" data-testid="identity-detail-youth-takeaway">
                    <p className="patterns-details-kicker">Youth takeaway</p>
                    <p>{selection.youth_takeaway}</p>
                  </div>
                  <div className="identity-detail-row" data-testid="identity-detail-age-hint">
                    <p className="patterns-details-kicker">Age hint</p>
                    <p>{selection.age_hint}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="patterns-sheet">
            <button
              type="button"
              className="patterns-sheet-handle"
              data-testid="identity-sheet-handle"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((o) => !o)}
            >
              <span className="patterns-sheet-grip" aria-hidden="true" />
              Browse identities
              <span className="patterns-sheet-chevron" aria-hidden="true">
                {sheetOpen ? "⌄" : "⌃"}
              </span>
            </button>

            {sheetOpen && (
              <div className="patterns-sheet-body" data-testid="identity-sheet-body">
                <div className="patterns-tabs" role="tablist" aria-label="Identity segment">
                  {SEGMENTS.map((seg) => (
                    <button
                      key={seg.key}
                      type="button"
                      role="tab"
                      aria-selected={segment === seg.key}
                      className={segment === seg.key ? "patterns-tab patterns-tab-active" : "patterns-tab"}
                      data-testid={`identity-seg-${seg.key}`}
                      onClick={() => switchSegment(seg.key)}
                    >
                      {seg.label}
                    </button>
                  ))}
                </div>

                <input
                  type="search"
                  className="patterns-search"
                  placeholder="Search teams, styles, ideas..."
                  aria-label="Search identities"
                  data-testid="identity-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <div className="patterns-grid" data-testid="identity-grid">
                  {tiles.map((item) => {
                    const { tokens } = identityPreview(item);
                    return (
                      <button
                        key={`identity-${item.id}`}
                        type="button"
                        className="patterns-tile"
                        data-testid="identity-tile"
                        onClick={() => selectIdentity(item)}
                      >
                        <TileThumb tokens={tokens} />
                        <span className="patterns-tile-category">{humanizeSlug(item.kind)}</span>
                        <span className="patterns-tile-name">{item.name}</span>
                      </button>
                    );
                  })}
                  {tiles.length === 0 && (
                    <p className="patterns-empty-result" data-testid="identity-empty-result">
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
