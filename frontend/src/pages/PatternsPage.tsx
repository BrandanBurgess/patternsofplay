// Patterns page (Brief step 17, PNG 05-10, 29-31, 15-18, 35): visual-first,
// empty board by default; a swipe-up sheet holds three libraries (Patterns,
// Deliveries, Rotations per the content bible) with category chips and a
// search scoped to whichever library is active; selecting a tile closes the
// sheet and plays the pattern on the big board; the floating meta bar gives
// Details, Open on whiteboard, and Clear.

import { useEffect, useMemo, useState } from "react";
import type { Orientation } from "../board/coords";
import type { TokenSide } from "../board/tokens";
import PatternPreviewBoard, { type PreviewToken } from "../board/PatternPreviewBoard";
import { listLibraryItems, type LibraryItemOutWire, type LibraryItemType } from "../libraryApi";
import { listPatterns, saveCurrentBoard, type SavedPatternOutWire } from "../whiteboardApi";
import { toWireSnapshot } from "../board/wire";
import {
  libraryItemBoardSnapshot,
  libraryItemPreview,
  savedPatternBoardSnapshot,
  savedPatternPreview,
} from "./patternPreview";
import "./PatternsPage.css";

type Selection =
  | { kind: "library"; item: LibraryItemOutWire }
  | { kind: "saved"; item: SavedPatternOutWire };

const LIBRARY_TABS: { key: LibraryItemType; label: string }[] = [
  { key: "pattern", label: "Patterns" },
  { key: "delivery", label: "Deliveries" },
  { key: "rotation", label: "Rotations" },
];

// Category chips (design README / PNG 07-08): patterns only. Deliveries and
// rotations have no chip row in the PNGs (29, 30 show tabs + search only),
// so none render there (do not invent surfaces beyond the PNGs).
const PATTERN_CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "combination", label: "Combination" },
  { key: "space", label: "Space" },
  { key: "transition", label: "Transition" },
  { key: "pressing", label: "Pressing" },
  { key: "mine", label: "My patterns" },
];

function humanizeSlug(slug: string): string {
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function matchesSearch(haystack: (string | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => h?.toLowerCase().includes(q));
}

function TileThumb({ tokens }: { tokens: { id: string; side: TokenSide; pos: { x: number; y: number } }[] }) {
  const W = 105;
  const H = 68;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tile-thumb" aria-hidden="true">
      <rect x={0} y={0} width={W} height={H} rx={3} className="tile-thumb-bg" />
      {tokens.map((t) => (
        <circle
          key={t.id}
          cx={(t.pos.x / 100) * W}
          cy={(t.pos.y / 100) * H}
          r={t.side === "ball" ? 1.6 : 2.6}
          className={`tile-thumb-token tile-thumb-${t.side}`}
        />
      ))}
    </svg>
  );
}

interface PatternsPageProps {
  orientation: Orientation;
  /** Called once the pattern's board state has been PUT to /api/boards/current
   * (Brief step 17 DoD: "Open on whiteboard carries the pattern's board
   * state to the whiteboard"); the page itself owns navigating there. */
  onOpenOnWhiteboard: () => void;
}

export function PatternsPage({ orientation, onOpenOnWhiteboard }: PatternsPageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemsByType, setItemsByType] = useState<Record<LibraryItemType, LibraryItemOutWire[]>>({
    pattern: [],
    delivery: [],
    rotation: [],
  });
  const [savedPatterns, setSavedPatterns] = useState<SavedPatternOutWire[]>([]);

  const [library, setLibrary] = useState<LibraryItemType>("pattern");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listLibraryItems("pattern"),
      listLibraryItems("delivery"),
      listLibraryItems("rotation"),
      listPatterns(),
    ])
      .then(([patterns, deliveries, rotations, saved]) => {
        if (cancelled) return;
        setItemsByType({ pattern: patterns, delivery: deliveries, rotation: rotations });
        setSavedPatterns(saved);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the pattern library. Try reloading.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Search filters the ACTIVE library only (Brief step 17 DoD): switching
  // tabs resets the query and, for Patterns, the category chip, rather than
  // silently carrying a search term across into a library it was never
  // typed against.
  function switchLibrary(next: LibraryItemType) {
    setLibrary(next);
    setCategoryFilter("all");
    setSearchQuery("");
  }

  const showingMine = library === "pattern" && categoryFilter === "mine";

  const libraryTiles = useMemo(() => {
    const items = itemsByType[library];
    return items
      .filter((item) => library !== "pattern" || categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) =>
        matchesSearch([item.name, item.category, item.blurb, item.code, ...item.roles_involved], searchQuery)
      );
  }, [itemsByType, library, categoryFilter, searchQuery]);

  const savedTiles = useMemo(
    () => savedPatterns.filter((p) => matchesSearch([p.name, p.author_label], searchQuery)),
    [savedPatterns, searchQuery]
  );

  function selectLibraryItem(item: LibraryItemOutWire) {
    setSelection({ kind: "library", item });
    setSheetOpen(false);
    setDetailsOpen(false);
    setOpenError(null);
  }

  function selectSavedPattern(item: SavedPatternOutWire) {
    setSelection({ kind: "saved", item });
    setSheetOpen(false);
    setDetailsOpen(false);
    setOpenError(null);
  }

  function clearSelection() {
    setSelection(null);
    setDetailsOpen(false);
    setOpenError(null);
  }

  const preview = useMemo((): { tokens: PreviewToken[]; playback: ReturnType<typeof libraryItemPreview>["playback"] } => {
    if (!selection) return { tokens: [], playback: null };
    return selection.kind === "library" ? libraryItemPreview(selection.item) : savedPatternPreview(selection.item);
  }, [selection]);

  const hasBoardState =
    selection !== null &&
    (selection.kind === "saved" || libraryItemBoardSnapshot(selection.item) !== null);

  async function handleOpenOnWhiteboard() {
    if (!selection) return;
    const snapshot =
      selection.kind === "saved"
        ? savedPatternBoardSnapshot(selection.item)
        : libraryItemBoardSnapshot(selection.item);
    if (!snapshot) return;
    setOpening(true);
    setOpenError(null);
    try {
      await saveCurrentBoard(toWireSnapshot(snapshot));
      onOpenOnWhiteboard();
    } catch {
      setOpenError("Could not open this pattern on the whiteboard, try again.");
    } finally {
      setOpening(false);
    }
  }

  const metaTitle =
    selection?.kind === "library"
      ? `${selection.item.code}: ${selection.item.name}`
      : selection?.kind === "saved"
        ? selection.item.name
        : "";

  return (
    <section className="patterns-page">
      <h2 className="app-page-heading">
        Patterns
        <span
          className="app-page-info"
          aria-hidden="true"
          title="Browse patterns, deliveries, and rotations, then play one on the board."
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
        <p className="patterns-loading">Loading patterns...</p>
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
                    Empty board.
                    <br />
                    Pull up <strong>Browse patterns</strong> below to load one, or record your own
                    on the whiteboard.
                  </>
                ) : undefined
              }
            />

            {selection && (
              <div className="patterns-meta-bar" data-testid="patterns-meta-bar">
                <span className="patterns-meta-title" data-testid="patterns-meta-title">
                  {metaTitle}
                </span>
                {selection.kind === "saved" && (
                  <span className="patterns-meta-author" data-testid="patterns-meta-author">
                    {selection.item.author_label}
                  </span>
                )}
                <button
                  type="button"
                  className="patterns-details-btn"
                  data-testid="patterns-details-toggle"
                  aria-pressed={detailsOpen}
                  onClick={() => setDetailsOpen((o) => !o)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="ctl-ghost"
                  data-testid="patterns-open-whiteboard"
                  disabled={!hasBoardState || opening}
                  onClick={handleOpenOnWhiteboard}
                >
                  {opening ? "Opening..." : "Open on whiteboard"}
                </button>
                <button
                  type="button"
                  className="ctl-ghost"
                  data-testid="patterns-clear"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>
            )}
            {openError && (
              <p role="alert" className="patterns-error patterns-error-overlay">
                {openError}
              </p>
            )}

            {playing && (
              <div className="patterns-playing-pill" data-testid="patterns-playing-pill">
                <span className="patterns-playing-dot" aria-hidden="true" />
                Playing
              </div>
            )}

            {detailsOpen && selection && (
              <div className="patterns-details-panel" data-testid="patterns-details-panel">
                <div className="patterns-details-head">
                  <h3>{metaTitle}</h3>
                  <button
                    type="button"
                    className="patterns-details-close"
                    aria-label="Close details"
                    data-testid="patterns-details-close"
                    onClick={() => setDetailsOpen(false)}
                  >
                    x
                  </button>
                </div>
                <PatternDetails selection={selection} />
              </div>
            )}
          </div>

          <div className="patterns-sheet">
            <button
              type="button"
              className="patterns-sheet-handle"
              data-testid="patterns-sheet-handle"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((o) => !o)}
            >
              <span className="patterns-sheet-grip" aria-hidden="true" />
              Browse patterns
              <span className="patterns-sheet-chevron" aria-hidden="true">
                {sheetOpen ? "⌄" : "⌃"}
              </span>
            </button>

            {sheetOpen && (
              <div className="patterns-sheet-body" data-testid="patterns-sheet-body">
                <div className="patterns-tabs" role="tablist" aria-label="Library">
                  {LIBRARY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={library === tab.key}
                      className={library === tab.key ? "patterns-tab patterns-tab-active" : "patterns-tab"}
                      data-testid={`patterns-tab-${tab.key}`}
                      onClick={() => switchLibrary(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <input
                  type="search"
                  className="patterns-search"
                  placeholder="Search patterns, roles, concepts..."
                  aria-label="Search the active library"
                  data-testid="patterns-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {library === "pattern" && (
                  <div className="patterns-chips" role="group" aria-label="Category">
                    {PATTERN_CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={categoryFilter === c.key ? "patterns-chip patterns-chip-active" : "patterns-chip"}
                        data-testid={`patterns-chip-${c.key}`}
                        onClick={() => setCategoryFilter(c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="patterns-grid" data-testid="patterns-grid">
                  {showingMine
                    ? savedTiles.map((p) => {
                        const { tokens } = savedPatternPreview(p);
                        return (
                          <button
                            key={`saved-${p.id}`}
                            type="button"
                            className="patterns-tile"
                            data-testid="patterns-tile"
                            onClick={() => selectSavedPattern(p)}
                          >
                            <TileThumb tokens={tokens} />
                            <span className="patterns-tile-category">{p.author_label}</span>
                            <span className="patterns-tile-name">{p.name}</span>
                          </button>
                        );
                      })
                    : libraryTiles.map((item) => {
                        const { tokens } = libraryItemPreview(item);
                        return (
                          <button
                            key={`lib-${item.id}`}
                            type="button"
                            className="patterns-tile"
                            data-testid="patterns-tile"
                            onClick={() => selectLibraryItem(item)}
                          >
                            <TileThumb tokens={tokens} />
                            <span className="patterns-tile-category">
                              {item.code} - {humanizeSlug(item.category)}
                            </span>
                            <span className="patterns-tile-name">{item.name}</span>
                          </button>
                        );
                      })}
                  {(showingMine ? savedTiles.length === 0 : libraryTiles.length === 0) && (
                    <p className="patterns-empty-result" data-testid="patterns-empty-result">
                      No matches. Try a different search or category.
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

function PatternDetails({ selection }: { selection: Selection }) {
  if (selection.kind === "saved") {
    return (
      <div className="patterns-details-body">
        <p className="patterns-details-kicker">What it is</p>
        <p>Recorded on the whiteboard by {selection.item.author_label}.</p>
      </div>
    );
  }

  const item = selection.item;

  if (item.item_type === "delivery") {
    return (
      <div className="patterns-details-body">
        <p className="patterns-details-kicker">What it is</p>
        <p>{item.blurb}</p>
        <div className="patterns-details-cards">
          <div className="patterns-details-card">
            <p className="patterns-details-kicker">Delivery zone</p>
            <p>{item.extras ? humanizeSlug(item.extras.delivery_zone ?? "") : ""}</p>
          </div>
          <div className="patterns-details-card">
            <p className="patterns-details-kicker">Target corridor</p>
            <p>{item.extras ? humanizeSlug(item.extras.target_corridor ?? "") : ""}</p>
          </div>
        </div>
      </div>
    );
  }

  if (item.item_type === "rotation") {
    return (
      <div className="patterns-details-body">
        <p className="patterns-details-kicker">What it is</p>
        <p>{item.blurb}</p>
        <div className="patterns-details-cards">
          <div className="patterns-details-card">
            <p className="patterns-details-kicker">What it creates</p>
            <p>{item.extras?.creates ?? ""}</p>
          </div>
          <div className="patterns-details-card">
            <p className="patterns-details-kicker">The defender's dilemma</p>
            <p>{item.extras?.defenders_dilemma ?? ""}</p>
          </div>
        </div>
      </div>
    );
  }

  // item_type "pattern": the animation's own steps, read as a play-by-play
  // (PNG 10: numbered captions, not the separate coaching-points list).
  return (
    <div className="patterns-details-body">
      <p className="patterns-details-kicker">What it is</p>
      <p>{item.blurb}</p>
      {item.animation_spec && (
        <ol className="patterns-details-steps">
          {item.animation_spec.steps.map((step) => (
            <li key={step.n} data-testid="patterns-details-step">
              <span className="patterns-details-step-n">{step.n}</span>
              <span>{step.caption}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
