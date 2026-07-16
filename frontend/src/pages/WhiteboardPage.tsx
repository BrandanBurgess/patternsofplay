// The whiteboard page (Brief step 16, PNG 01-05, 14, 34): fetches the boards
// row and My Patterns on mount, wires Board's callbacks to the API, and
// debounces snapshot changes into a PUT so a reload restores thresholds,
// confirmed lanes, and zone toggles (doc 03 4.3). Board itself owns all
// rendering/interaction; this page owns persistence and is the only place
// that talks to whiteboardApi.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import Board from "../board/Board";
import type { Orientation } from "../board/coords";
import type { BoardSnapshot, Keyframe } from "../board/animationTypes";
import { fromWireSnapshot, toWireKeyframes, toWireSnapshot } from "../board/wire";
import {
  createPattern,
  deletePattern,
  fetchCurrentBoard,
  listPatterns,
  saveCurrentBoard,
  type SavedPatternOutWire,
} from "../whiteboardApi";
import type { Role } from "../api";
import "./WhiteboardPage.css";

// A drag commits to React state once (on pointer up), so this only coalesces
// bursts like several zone toggles or a threshold slider drag, not every frame.
const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function WhiteboardPage({ orientation, role }: { orientation: Orientation; role: Role }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<BoardSnapshot | undefined>(undefined);
  const [savedPatterns, setSavedPatterns] = useState<SavedPatternOutWire[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCurrentBoard(), listPatterns()])
      .then(([boardState, patterns]) => {
        if (cancelled) return;
        setInitialSnapshot(
          boardState.board ? fromWireSnapshot(boardState.board) : undefined
        );
        setSavedPatterns(patterns);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the whiteboard. Try reloading.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const debounceRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    []
  );

  // Whiteboard state persistence (doc 03 4.3): every committed change is
  // debounced into a PUT to /api/boards/current, the team's single live
  // board row, so a reload restores thresholds, confirmed lanes, and zones.
  const handleSnapshotChange = useCallback((snapshot: BoardSnapshot) => {
    setSaveStatus("saving");
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveCurrentBoard(toWireSnapshot(snapshot))
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const handleSavePattern = useCallback(
    async (name: string, snapshot: BoardSnapshot, keyframes: Keyframe[]) => {
      const created = await createPattern({
        name,
        board_snapshot: toWireSnapshot(snapshot),
        keyframes: toWireKeyframes(keyframes),
      });
      // Newest first, matching the API's own ordering (list_patterns).
      setSavedPatterns((prev) => [created, ...prev]);
    },
    []
  );

  const handleDeletePattern = useCallback(async (id: number) => {
    await deletePattern(id);
    setSavedPatterns((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <section className="whiteboard-page">
      <h2 className="app-page-heading">
        Whiteboard
        <span
          className="app-page-info"
          aria-hidden="true"
          title="Drag tokens, record a movement, and save it to My patterns."
        >
          i
        </span>
      </h2>

      {loadError && (
        <p role="alert" className="whiteboard-error">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="whiteboard-loading">Loading whiteboard...</p>
      ) : (
        <>
          <p className="save-status" data-testid="board-save-status" aria-live="polite">
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "All changes saved"}
            {saveStatus === "error" && "Could not save, changes may be lost"}
          </p>
          <Board
            orientation={orientation}
            role={role}
            initialSnapshot={initialSnapshot}
            onSnapshotChange={handleSnapshotChange}
            savedPatterns={savedPatterns}
            onSavePattern={handleSavePattern}
            onDeletePattern={role === "coach" ? handleDeletePattern : undefined}
          />
        </>
      )}
    </section>
  );
}
