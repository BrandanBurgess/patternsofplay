// Sessions page (Brief step 23, PNG 21-23, 26, 28): the classroom loop.
//
// Coach: a session rail on the left, the selected session on the right.
// A draft carries a coach note, an ordered content list (library presets
// and the team's own recordings, each with its mini-board thumbnail), and
// a "+ Add from library" picker; sending it stamps the gold SENT pill and
// turns the "Will receive" list into per-player read receipts with an x/y
// viewed counter (design README Sessions spec).
//
// Player: the same rail, sent sessions only, read-only. Every content row
// has a Watch button that opens that item playing on the board (portrait
// on a phone viewport, like every other board surface), plus Mark as
// watched, which feeds the coach's counter.
//
// Receipts are coach-only and that is enforced by the API, not here: a
// player's payload has no receipt key at all (sessionsApi.ts types this
// as two distinct shapes narrowed by isCoachSession), so there is no
// branch in this file that could render another player's status even if
// the role prop were wrong.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Orientation } from "../board/coords";
import PatternPreviewBoard from "../board/PatternPreviewBoard";
import type { Role } from "../api";
import { listLibraryItems, type LibraryItemOutWire } from "../libraryApi";
import { listPatterns, type SavedPatternOutWire } from "../whiteboardApi";
import {
  addSessionItem,
  createSession,
  isCoachSession,
  listSessions,
  markSessionWatched,
  moveSessionItem,
  removeSessionItem,
  sendSession,
  updateSession,
  type SessionItemWire,
  type SessionWire,
} from "../sessionsApi";
import { libraryItemPreview, savedPatternPreview } from "./patternPreview";
import { TileThumb } from "./PatternsPage";
import { matchesSearch } from "./search";
import "./SessionsPage.css";

type PickerTab = "library" | "saved";

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function itemPreview(item: SessionItemWire) {
  if (item.library_item) return libraryItemPreview(item.library_item);
  if (item.saved_pattern) return savedPatternPreview(item.saved_pattern);
  return { tokens: [], playback: null };
}

function itemKicker(item: SessionItemWire): string {
  if (item.library_item) return item.library_item.code;
  return item.saved_pattern?.author_label ?? "";
}

function itemName(item: SessionItemWire): string {
  return item.library_item?.name ?? item.saved_pattern?.name ?? "Untitled";
}

interface SessionsPageProps {
  orientation: Orientation;
  role: Role;
}

export function SessionsPage({ orientation, role }: SessionsPageProps) {
  const isCoach = role === "coach";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionWire[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Coach-only: the draft builder's picker sources.
  const [libraryItems, setLibraryItems] = useState<LibraryItemOutWire[]>([]);
  const [savedPatterns, setSavedPatterns] = useState<SavedPatternOutWire[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>("library");
  const [pickerQuery, setPickerQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // The Watch deep-link (README: "Watch buttons, jump straight to the
  // pattern playing"): the selected item plays full width on the board.
  const [watching, setWatching] = useState<SessionItemWire | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loads: [Promise<SessionWire[]>, Promise<LibraryItemOutWire[]>, Promise<SavedPatternOutWire[]>] =
      [
        listSessions(),
        isCoach ? listLibraryItems("pattern") : Promise.resolve([]),
        isCoach ? listPatterns() : Promise.resolve([]),
      ];
    Promise.all(loads)
      .then(([rows, library, saved]) => {
        if (cancelled) return;
        setSessions(rows);
        setLibraryItems(library);
        setSavedPatterns(saved);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load sessions. Try reloading.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCoach]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId]
  );

  // Keep the note editor in step with whichever session is on screen; a
  // note being typed is never carried across to a different session.
  useEffect(() => {
    setNoteDraft(selected?.coach_note ?? "");
    setPickerOpen(false);
    setWatching(null);
    setActionError(null);
  }, [selectedId]);

  const replace = useCallback((updated: SessionWire) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
      } catch {
        setActionError(`Could not ${label}, try again.`);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    await run("create the session", async () => {
      const created = await createSession({ title });
      setSessions((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setNewTitle("");
    });
  }

  async function handleSaveNote(sessionId: number) {
    await run("save the note", async () => replace(await updateSession(sessionId, { coach_note: noteDraft })));
  }

  async function handleAddLibrary(sessionId: number, libraryItemId: number) {
    await run("add that pattern", async () =>
      replace(await addSessionItem(sessionId, { item_kind: "library", library_item_id: libraryItemId }))
    );
  }

  async function handleAddSaved(sessionId: number, savedPatternId: number) {
    await run("add that recording", async () =>
      replace(
        await addSessionItem(sessionId, { item_kind: "saved_pattern", saved_pattern_id: savedPatternId })
      )
    );
  }

  async function handleMove(sessionId: number, itemId: number, position: number) {
    await run("reorder the session", async () =>
      replace(await moveSessionItem(sessionId, itemId, position))
    );
  }

  async function handleRemove(sessionId: number, itemId: number) {
    await run("remove that item", async () => replace(await removeSessionItem(sessionId, itemId)));
  }

  async function handleSend(sessionId: number) {
    await run("send the session", async () => replace(await sendSession(sessionId)));
  }

  async function handleMarkWatched(sessionId: number) {
    await run("mark this as watched", async () => replace(await markSessionWatched(sessionId)));
  }

  const pickerRows = useMemo(() => {
    if (pickerTab === "saved") {
      return savedPatterns.filter((p) => matchesSearch([p.name, p.author_label], pickerQuery));
    }
    return libraryItems.filter((item) =>
      matchesSearch([item.name, item.code, item.category, item.blurb], pickerQuery)
    );
  }, [pickerTab, pickerQuery, libraryItems, savedPatterns]);

  if (loading) {
    return (
      <section className="sessions-page">
        <SessionsHeading />
        <p className="sessions-loading">Loading sessions...</p>
      </section>
    );
  }

  // --- The Watch view: one item playing full width on the board ---------
  if (watching) {
    const preview = itemPreview(watching);
    return (
      <section className="sessions-page">
        <SessionsHeading />
        <div className="sessions-watch" data-testid="session-watch-view">
          <div className="sessions-watch-bar">
            <button
              type="button"
              className="ctl-ghost"
              data-testid="session-watch-back"
              onClick={() => setWatching(null)}
            >
              Back to session
            </button>
            <span className="sessions-watch-title" data-testid="session-watch-title">
              {itemKicker(watching) ? `${itemKicker(watching)}: ` : ""}
              {itemName(watching)}
            </span>
          </div>
          <PatternPreviewBoard
            orientation={orientation}
            tokens={preview.tokens}
            playback={preview.playback}
          />
          {selected && !isCoachSession(selected) && !selected.you_watched && (
            <button
              type="button"
              className="sessions-primary"
              data-testid="session-mark-watched-inline"
              disabled={busy}
              onClick={() => handleMarkWatched(selected.id)}
            >
              Mark as watched
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="sessions-page">
      <SessionsHeading />

      {loadError && (
        <p role="alert" className="sessions-error">
          {loadError}
        </p>
      )}

      <div className="sessions-stage">
        <aside className="sessions-rail" aria-label="Sessions">
          {isCoach && (
            <div className="sessions-new">
              <label className="sr-only" htmlFor="sessions-new-title">
                Session title
              </label>
              <input
                id="sessions-new-title"
                type="text"
                className="sessions-input"
                data-testid="sessions-new-title"
                placeholder="New session title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <button
                type="button"
                className="sessions-primary"
                data-testid="sessions-create"
                disabled={busy || newTitle.trim().length === 0}
                onClick={handleCreate}
              >
                New session
              </button>
            </div>
          )}

          {sessions.length === 0 ? (
            <p className="sessions-rail-empty" data-testid="sessions-empty">
              {isCoach
                ? "No sessions yet. Name one above, add a pattern or a recording, then send it to the team."
                : "Nothing sent yet. Your coach's sessions will show up here."}
            </p>
          ) : (
            <ul className="sessions-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={`sessions-list-item${
                      session.id === selectedId ? " sessions-list-item-active" : ""
                    }`}
                    data-testid="session-list-item"
                    aria-current={session.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(session.id)}
                  >
                    <span className="sessions-list-title">{session.title}</span>
                    <span className="sessions-list-tag">{railTag(session)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="sessions-detail">
          {!selected ? (
            <p className="sessions-detail-empty" data-testid="session-detail-empty">
              Pick a session on the left to see what is in it.
            </p>
          ) : (
            <>
              <header className="sessions-detail-head">
                <div>
                  <h3 className="sessions-detail-title" data-testid="session-detail-title">
                    {selected.title}
                  </h3>
                  <p className="sessions-detail-meta">
                    {formatSessionDate(selected.sent_at ?? selected.created_at)}
                  </p>
                </div>
                <div className="sessions-detail-actions">
                  {isCoachSession(selected) ? (
                    selected.status === "sent" ? (
                      <span className="sessions-sent-pill" data-testid="session-sent-pill">
                        SENT
                        <span data-testid="session-viewed-counter">
                          {selected.viewed_count} of {selected.recipient_count} viewed
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="sessions-draft-pill" data-testid="session-draft-pill">
                          DRAFT
                        </span>
                        <button
                          type="button"
                          className="sessions-primary"
                          data-testid="session-send"
                          disabled={busy || selected.items.length === 0}
                          onClick={() => handleSend(selected.id)}
                        >
                          Send to players
                        </button>
                      </>
                    )
                  ) : selected.you_watched ? (
                    <span className="sessions-watched-pill" data-testid="session-watched-state">
                      Watched
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="sessions-primary"
                      data-testid="session-mark-watched"
                      disabled={busy}
                      onClick={() => handleMarkWatched(selected.id)}
                    >
                      Mark as watched
                    </button>
                  )}
                </div>
              </header>

              {actionError && (
                <p role="alert" className="sessions-error">
                  {actionError}
                </p>
              )}

              {/* Coach note (PNG 21, 22, 26): editable while the session is
                  still a draft, read-only once it has been sent. */}
              {isCoachSession(selected) && selected.status === "draft" ? (
                <div className="sessions-note sessions-note-edit">
                  <p className="sessions-kicker">Coach note</p>
                  <textarea
                    className="sessions-textarea"
                    data-testid="session-note-input"
                    rows={3}
                    placeholder="What should they look for before training?"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ctl-ghost"
                    data-testid="session-note-save"
                    disabled={busy}
                    onClick={() => handleSaveNote(selected.id)}
                  >
                    Save note
                  </button>
                </div>
              ) : (
                selected.coach_note && (
                  <div className="sessions-note" data-testid="session-note">
                    <p className="sessions-kicker">Coach note</p>
                    <p className="sessions-note-body">{selected.coach_note}</p>
                  </div>
                )
              )}

              <h4 className="sessions-section-title">
                Session content{!isCoach && <span className="sessions-hint"> . tap to watch</span>}
              </h4>

              {selected.items.length === 0 ? (
                <p className="sessions-items-empty" data-testid="session-items-empty">
                  Nothing in this session yet. Add a pattern from the library or one of your own
                  recordings.
                </p>
              ) : (
                <ul className="sessions-items">
                  {selected.items.map((item, index) => {
                    const { tokens } = itemPreview(item);
                    return (
                      <li key={item.id} className="sessions-item" data-testid="session-item">
                        <span className="sessions-item-thumb">
                          <TileThumb tokens={tokens} />
                        </span>
                        <span className="sessions-item-text">
                          <span className="sessions-item-kicker">{itemKicker(item)}</span>
                          <span className="sessions-item-name">{itemName(item)}</span>
                        </span>
                        {isCoachSession(selected) ? (
                          selected.status === "draft" && (
                            <span className="sessions-item-controls">
                              <button
                                type="button"
                                className="sessions-icon-btn"
                                data-testid="session-item-up"
                                aria-label={`Move ${itemName(item)} up`}
                                disabled={busy || index === 0}
                                onClick={() => handleMove(selected.id, item.id, index - 1)}
                              >
                                ^
                              </button>
                              <button
                                type="button"
                                className="sessions-icon-btn"
                                data-testid="session-item-down"
                                aria-label={`Move ${itemName(item)} down`}
                                disabled={busy || index === selected.items.length - 1}
                                onClick={() => handleMove(selected.id, item.id, index + 1)}
                              >
                                v
                              </button>
                              <button
                                type="button"
                                className="sessions-icon-btn"
                                data-testid="session-item-remove"
                                aria-label={`Remove ${itemName(item)}`}
                                disabled={busy}
                                onClick={() => handleRemove(selected.id, item.id)}
                              >
                                x
                              </button>
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            className="sessions-watch-btn"
                            data-testid="session-watch"
                            onClick={() => setWatching(item)}
                          >
                            Watch
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Draft builder: "+ Add from library" opens the picker with
                  presets and My patterns, each with its mini-board
                  thumbnail (design README Sessions spec, PNG 22). */}
              {isCoachSession(selected) && selected.status === "draft" && (
                <div className="sessions-picker-wrap">
                  <button
                    type="button"
                    className="ctl-ghost"
                    data-testid="session-add-item"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((open) => !open)}
                  >
                    + Add from library
                  </button>

                  {pickerOpen && (
                    <div className="sessions-picker" data-testid="session-picker">
                      <div className="sessions-picker-tabs" role="tablist" aria-label="Picker source">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={pickerTab === "library"}
                          className={
                            pickerTab === "library"
                              ? "sessions-tab sessions-tab-active"
                              : "sessions-tab"
                          }
                          data-testid="session-picker-tab-library"
                          onClick={() => setPickerTab("library")}
                        >
                          Patterns
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={pickerTab === "saved"}
                          className={
                            pickerTab === "saved"
                              ? "sessions-tab sessions-tab-active"
                              : "sessions-tab"
                          }
                          data-testid="session-picker-tab-saved"
                          onClick={() => setPickerTab("saved")}
                        >
                          My patterns
                        </button>
                      </div>
                      <input
                        type="search"
                        className="sessions-input"
                        data-testid="session-picker-search"
                        aria-label="Search the picker"
                        placeholder="Search patterns and recordings..."
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                      />
                      <ul className="sessions-picker-list">
                        {pickerTab === "library"
                          ? (pickerRows as LibraryItemOutWire[]).map((item) => (
                              <li key={`lib-${item.id}`}>
                                <button
                                  type="button"
                                  className="sessions-picker-row"
                                  data-testid="session-picker-row"
                                  disabled={busy}
                                  onClick={() => handleAddLibrary(selected.id, item.id)}
                                >
                                  <span className="sessions-item-thumb">
                                    <TileThumb tokens={libraryItemPreview(item).tokens} />
                                  </span>
                                  <span className="sessions-picker-label">
                                    {item.code} . {item.name}
                                  </span>
                                </button>
                              </li>
                            ))
                          : (pickerRows as SavedPatternOutWire[]).map((pattern) => (
                              <li key={`saved-${pattern.id}`}>
                                <button
                                  type="button"
                                  className="sessions-picker-row"
                                  data-testid="session-picker-row"
                                  disabled={busy}
                                  onClick={() => handleAddSaved(selected.id, pattern.id)}
                                >
                                  <span className="sessions-item-thumb">
                                    <TileThumb tokens={savedPatternPreview(pattern).tokens} />
                                  </span>
                                  <span className="sessions-picker-label">
                                    {pattern.author_label} . {pattern.name}
                                  </span>
                                </button>
                              </li>
                            ))}
                        {pickerRows.length === 0 && (
                          <li className="sessions-picker-empty" data-testid="session-picker-empty">
                            {pickerTab === "saved"
                              ? "No recordings yet. Record one on the whiteboard first."
                              : "No matches. Try a different search."}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Receipts (PNG 21). Coach-only by construction: this whole
                  block is inside an isCoachSession narrowing, and a
                  player's payload carries no receipt field to render. */}
              {isCoachSession(selected) && (
                <>
                  <h4 className="sessions-section-title">Players</h4>
                  {selected.receipts.length === 0 ? (
                    <p className="sessions-items-empty" data-testid="session-no-recipients">
                      No players have joined this team yet. Share the player join code and they will
                      show up here.
                    </p>
                  ) : (
                    <ul className="sessions-receipts">
                      {selected.receipts.map((receipt) => (
                        <li
                          key={receipt.player_user_id}
                          className="sessions-receipt"
                          data-testid="session-receipt"
                        >
                          <span className="sessions-receipt-badge" aria-hidden="true">
                            {receipt.jersey_number ?? "-"}
                          </span>
                          <span className="sessions-receipt-name">{receipt.display_name}</span>
                          <span
                            className={`sessions-receipt-state${
                              receipt.viewed ? " sessions-receipt-viewed" : ""
                            }`}
                            data-testid="session-receipt-state"
                          >
                            {selected.status === "draft"
                              ? "Will receive"
                              : receipt.viewed
                                ? "Viewed"
                                : "Not yet"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SessionsHeading() {
  return (
    <h2 className="app-page-heading">
      Sessions
      <span
        className="app-page-info"
        aria-hidden="true"
        title="Bundle patterns and your own recordings into a session, then send it to the team."
      >
        i
      </span>
    </h2>
  );
}

function railTag(session: SessionWire): string {
  if (isCoachSession(session)) return session.status === "sent" ? "Sent" : "Draft";
  return session.you_watched ? "Watched" : "New";
}
