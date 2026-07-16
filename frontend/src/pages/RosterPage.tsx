// Roster page (Brief step 19, PNG 12 desktop / 20 phone): player CRUD,
// role + work-rate chips, six coach-rated 1-5 attribute sliders, and the
// double-exposure flank fit warning banner (coach-only, README roles
// table: "fit warnings ... never renders in player views"). Coach gets
// full CRUD; a player gets read-only sliders/work-rates and never sees
// the fit-warning banner or any create/edit/delete control (those
// elements are absent from the DOM for a player, not merely hidden,
// mirroring the API's own role gate in backend/app/routers/roster.py).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  approveSuggestion,
  createPlayer,
  deletePlayer,
  dismissSuggestion,
  fetchPendingSuggestions,
  fetchPlayerSuggestions,
  fetchRoleCatalog,
  fetchRoster,
  submitSuggestion,
  updatePlayer,
  type AttributeKey,
  type FitWarningWire,
  type Flank,
  type PlayerAttributesWire,
  type PlayerWire,
  type PlayerWriteWire,
  type PreferredFoot,
  type Role,
  type RoleCatalogWire,
  type SuggestionWire,
  type WorkRate,
} from "../rosterApi";
import { ApiError } from "../api";
import "./RosterPage.css";

type Mode = "view" | "create" | "edit";

interface FormState {
  name: string;
  jerseyNumber: string;
  preferredFoot: PreferredFoot;
  roleCode: string;
  flank: Flank | "";
  awr: WorkRate;
  dwr: WorkRate;
  attributes: PlayerAttributesWire;
}

const DEFAULT_ATTRIBUTES: PlayerAttributesWire = {
  pace: 3,
  passing_range: 3,
  carrying_1v1: 3,
  positional_discipline: 3,
  aerial_physical: 3,
  pressing_engine: 3,
};

const EMPTY_FORM: FormState = {
  name: "",
  jerseyNumber: "",
  preferredFoot: "R",
  roleCode: "",
  flank: "",
  awr: "med",
  dwr: "med",
  attributes: { ...DEFAULT_ATTRIBUTES },
};

function formFromPlayer(player: PlayerWire): FormState {
  return {
    name: player.name,
    jerseyNumber: player.jersey_number === null ? "" : String(player.jersey_number),
    preferredFoot: player.preferred_foot,
    roleCode: player.role_code ?? "",
    flank: player.flank ?? "",
    awr: player.awr,
    dwr: player.dwr,
    attributes: { ...player.attributes },
  };
}

function toWritePayload(form: FormState): PlayerWriteWire {
  const jersey = form.jerseyNumber.trim();
  return {
    name: form.name.trim(),
    jersey_number: jersey === "" ? null : Number(jersey),
    preferred_foot: form.preferredFoot,
    role_code: form.roleCode === "" ? null : form.roleCode,
    flank: form.flank === "" ? null : form.flank,
    awr: form.awr,
    dwr: form.dwr,
    attributes: form.attributes,
  };
}

const WORK_RATE_LABEL: Record<WorkRate, string> = { low: "Low", med: "Med", high: "High" };
const FLANK_LABEL: Record<Flank, string> = { left: "Left", right: "Right", center: "Center" };

function workRateChip(awr: WorkRate, dwr: WorkRate): string {
  return `${WORK_RATE_LABEL[awr]} / ${WORK_RATE_LABEL[dwr]}`;
}

export function RosterPage({ role }: { role: Role }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerWire[]>([]);
  const [fitWarnings, setFitWarnings] = useState<FitWarningWire[] | undefined>(undefined);
  const [roles, setRoles] = useState<RoleCatalogWire[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Playstyle suggestion flow (Brief step 22, PNG 24/25/27; T-041).
  // pendingSuggestions is the coach-only team-wide queue (README: "coach
  // sees a gold badge on the row"); ownPendingSuggestion is a player's own
  // latest pending submission for whichever profile they're viewing.
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionWire[]>([]);
  const [ownPendingSuggestion, setOwnPendingSuggestion] = useState<SuggestionWire | null>(null);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // Re-reads just the roster (not the role catalog, not the page loading
  // flag) after a create/update/delete: fit warnings can shift with any
  // roster edit, and re-fetching keeps them correct without duplicating
  // the server's own rule client-side, but without flashing the whole
  // page back to its initial loading state on every save.
  const refreshRoster = useCallback(async () => {
    const roster = await fetchRoster();
    setPlayers(roster.players);
    // Undefined for a player caller (the key is absent on the wire, not
    // an empty array): keep that distinction instead of defaulting it.
    setFitWarnings(roster.fit_warnings);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [roster, roleCatalog] = await Promise.all([fetchRoster(), fetchRoleCatalog()]);
      setPlayers(roster.players);
      setFitWarnings(roster.fit_warnings);
      setRoles(roleCatalog);
    } catch {
      setLoadError("Could not load the roster. Try reloading.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedId) ?? null,
    [players, selectedId]
  );

  const isCoach = role === "coach";

  const pendingPlayerIds = useMemo(
    () => new Set(pendingSuggestions.map((s) => s.player_id)),
    [pendingSuggestions]
  );

  const pendingSuggestionForSelected = useMemo(
    () =>
      selectedPlayer
        ? pendingSuggestions.find((s) => s.player_id === selectedPlayer.id) ?? null
        : null,
    [pendingSuggestions, selectedPlayer]
  );

  // Coach-only team-wide pending queue: backs the roster row badge and,
  // filtered by selectedPlayer below, the review card. 403s for a player
  // caller (README: suggestion review is coach-only), so this never runs
  // for one.
  const refreshPendingSuggestions = useCallback(async () => {
    if (!isCoach) return;
    try {
      setPendingSuggestions(await fetchPendingSuggestions());
    } catch {
      // Non-fatal: the roster itself already loaded; leave the queue as-is
      // rather than failing the whole page over a secondary fetch.
    }
  }, [isCoach]);

  useEffect(() => {
    refreshPendingSuggestions();
  }, [refreshPendingSuggestions]);

  // A player's own suggestion history, only ever fetched for their own
  // claimed row (README: "free text on own profile"). Re-runs whenever the
  // selection changes so switching away from, then back to, your own row
  // reflects the latest state.
  useEffect(() => {
    setSuggestionError(null);
    setSuggestionText("");
    if (isCoach || !selectedPlayer?.is_you) {
      setOwnPendingSuggestion(null);
      return;
    }
    let cancelled = false;
    fetchPlayerSuggestions(selectedPlayer.id)
      .then((rows) => {
        if (cancelled) return;
        setOwnPendingSuggestion(rows.find((r) => r.status === "pending") ?? null);
      })
      .catch(() => {
        if (!cancelled) setOwnPendingSuggestion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isCoach, selectedPlayer]);

  const rolesByPosition = useMemo(() => {
    const grouped = new Map<string, RoleCatalogWire[]>();
    for (const r of roles) {
      const list = grouped.get(r.position_code) ?? [];
      list.push(r);
      grouped.set(r.position_code, list);
    }
    return grouped;
  }, [roles]);

  function selectPlayer(id: number) {
    setSelectedId(id);
    setMode("view");
    setSaveError(null);
  }

  function startCreate() {
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, attributes: { ...DEFAULT_ATTRIBUTES } });
    setMode("create");
    setSaveError(null);
  }

  function startEdit(player: PlayerWire) {
    setForm(formFromPlayer(player));
    setMode("edit");
    setSaveError(null);
  }

  function cancelForm() {
    setMode("view");
    setSaveError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toWritePayload(form);
      if (mode === "create") {
        const created = await createPlayer(payload);
        setPlayers((prev) => [...prev, created]);
        setSelectedId(created.id);
      } else if (mode === "edit" && selectedPlayer) {
        const updated = await updatePlayer(selectedPlayer.id, payload);
        setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
      await refreshRoster();
      setMode("view");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save, try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPlayer) return;
    setSaving(true);
    setSaveError(null);
    try {
      await deletePlayer(selectedPlayer.id);
      setPlayers((prev) => prev.filter((p) => p.id !== selectedPlayer.id));
      setSelectedId(null);
      setMode("view");
      await refreshRoster();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not delete, try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateAttribute(key: AttributeKey, value: number) {
    setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [key]: value } }));
  }

  // Brief step 22 DoD: "player submits, sees pending". Only reachable for a
  // player viewing their own claimed row (see PlayerDetail below), so
  // selectedPlayer here is always the caller's own row when this runs.
  async function handleSubmitSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlayer) return;
    setSuggestionSaving(true);
    setSuggestionError(null);
    try {
      const created = await submitSuggestion(selectedPlayer.id, suggestionText.trim());
      setOwnPendingSuggestion(created);
      setSuggestionText("");
    } catch (err) {
      setSuggestionError(
        err instanceof ApiError ? err.message : "Could not send suggestion, try again."
      );
    } finally {
      setSuggestionSaving(false);
    }
  }

  // "coach approves; note appears merged on the profile": re-reads the
  // roster so the merged playstyle_note and the cleared queue both land.
  async function handleApproveSuggestion(suggestionId: number) {
    setSuggestionSaving(true);
    setSuggestionError(null);
    try {
      await approveSuggestion(suggestionId);
      await Promise.all([refreshRoster(), refreshPendingSuggestions()]);
    } catch (err) {
      setSuggestionError(
        err instanceof ApiError ? err.message : "Could not approve, try again."
      );
    } finally {
      setSuggestionSaving(false);
    }
  }

  // "dismiss clears it": no roster re-read needed (no note is merged), just
  // the queue.
  async function handleDismissSuggestion(suggestionId: number) {
    setSuggestionSaving(true);
    setSuggestionError(null);
    try {
      await dismissSuggestion(suggestionId);
      await refreshPendingSuggestions();
    } catch (err) {
      setSuggestionError(
        err instanceof ApiError ? err.message : "Could not dismiss, try again."
      );
    } finally {
      setSuggestionSaving(false);
    }
  }

  return (
    <section className="roster-page">
      <h2 className="app-page-heading">
        Roster
        <span
          className="app-page-info"
          aria-hidden="true"
          title="Add players, set roles and work rates, and rate their six attributes."
        >
          i
        </span>
      </h2>

      {loadError && (
        <p role="alert" className="roster-error">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="roster-loading">Loading roster...</p>
      ) : (
        <>
          {/* Roster DoD: "the double-exposure warning fires ... and only
              renders for coaches." fitWarnings is undefined for a player
              (the wire key is absent), so this block never renders for one. */}
          {isCoach &&
            fitWarnings?.map((warning) => (
              <div
                key={`${warning.code}-${warning.flank}`}
                className="fit-warning"
                role="alert"
                data-testid={`fit-warning-${warning.flank}`}
              >
                <span className="fit-warning-tag">FIT</span>
                <div className="fit-warning-body">
                  <strong>
                    Double exposure, {FLANK_LABEL[warning.flank]} flank: {warning.wide_player_name}{" "}
                    and {warning.back_player_name}.
                  </strong>
                  <p>{warning.message}</p>
                </div>
              </div>
            ))}

          <div className="roster-layout">
            <div className="roster-list-col">
              <ul className="roster-list">
                {players.map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      className={
                        "roster-row" + (player.id === selectedId ? " roster-row-active" : "")
                      }
                      data-testid={`roster-row-${player.id}`}
                      onClick={() => selectPlayer(player.id)}
                    >
                      <span className="roster-row-number">{player.jersey_number ?? "-"}</span>
                      <span className="roster-row-text">
                        <span className="roster-row-name">
                          {player.name}
                          {player.is_you && <span className="roster-you"> (you)</span>}
                          {/* README: "coach sees a gold badge on the row"
                              for a pending playstyle suggestion. Absent
                              from the DOM for a player, not just hidden:
                              pendingSuggestions is only ever populated for
                              a coach caller (refreshPendingSuggestions
                              above). */}
                          {isCoach && pendingPlayerIds.has(player.id) && (
                            <span
                              className="suggestion-badge"
                              data-testid={`suggestion-badge-${player.id}`}
                              title="Playstyle suggestion pending review"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="roster-row-role">{player.role_name ?? "Unassigned"}</span>
                      </span>
                      <span className="roster-row-chip">{workRateChip(player.awr, player.dwr)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {isCoach && (
                <button
                  type="button"
                  className="roster-add"
                  data-testid="roster-add-player"
                  onClick={startCreate}
                >
                  + Add player
                </button>
              )}
            </div>

            <div className="roster-detail-col" data-testid="roster-detail">
              {mode === "view" && selectedPlayer && (
                <PlayerDetail
                  player={selectedPlayer}
                  isCoach={isCoach}
                  onEdit={() => startEdit(selectedPlayer)}
                  onDelete={handleDelete}
                  saving={saving}
                  ownPendingSuggestion={ownPendingSuggestion}
                  suggestionText={suggestionText}
                  onSuggestionTextChange={setSuggestionText}
                  onSubmitSuggestion={handleSubmitSuggestion}
                  pendingSuggestion={pendingSuggestionForSelected}
                  onApproveSuggestion={handleApproveSuggestion}
                  onDismissSuggestion={handleDismissSuggestion}
                  suggestionSaving={suggestionSaving}
                  suggestionError={suggestionError}
                />
              )}
              {mode === "view" && !selectedPlayer && (
                <p className="roster-placeholder">Select a player to view details.</p>
              )}
              {(mode === "create" || mode === "edit") && (
                <PlayerForm
                  form={form}
                  setForm={setForm}
                  rolesByPosition={rolesByPosition}
                  onSubmit={handleSubmit}
                  onCancel={cancelForm}
                  onAttributeChange={updateAttribute}
                  saving={saving}
                  error={saveError}
                  isCreate={mode === "create"}
                />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PlayerDetail({
  player,
  isCoach,
  onEdit,
  onDelete,
  saving,
  ownPendingSuggestion,
  suggestionText,
  onSuggestionTextChange,
  onSubmitSuggestion,
  pendingSuggestion,
  onApproveSuggestion,
  onDismissSuggestion,
  suggestionSaving,
  suggestionError,
}: {
  player: PlayerWire;
  isCoach: boolean;
  onEdit: () => void;
  onDelete: () => void;
  saving: boolean;
  ownPendingSuggestion: SuggestionWire | null;
  suggestionText: string;
  onSuggestionTextChange: (value: string) => void;
  onSubmitSuggestion: (event: FormEvent<HTMLFormElement>) => void;
  pendingSuggestion: SuggestionWire | null;
  onApproveSuggestion: (suggestionId: number) => void;
  onDismissSuggestion: (suggestionId: number) => void;
  suggestionSaving: boolean;
  suggestionError: string | null;
}) {
  return (
    <div className="player-detail">
      <div className="player-detail-header">
        <p className="player-detail-title">
          {player.jersey_number !== null ? `#${player.jersey_number} ` : ""}
          {player.name.toUpperCase()}
          {player.role_name ? ` - ${player.role_name.toUpperCase()}` : ""}
        </p>
        {isCoach && (
          <div className="player-detail-actions">
            <button type="button" className="ctl-ghost" data-testid="player-edit" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="ctl-ghost"
              data-testid="player-delete"
              disabled={saving}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {player.role_description && <p className="player-detail-note">{player.role_description}</p>}

      {/* Approved playstyle suggestion, merged onto the profile (doc 03
          section 3; Brief step 22 DoD: "note appears merged on the
          profile"). Visible to both roles, same as the rest of the
          profile. */}
      {player.playstyle_note && (
        <div className="player-detail-block" data-testid="playstyle-note">
          <p className="player-detail-label">Playstyle note</p>
          <p className="player-detail-value">{player.playstyle_note}</p>
        </div>
      )}

      <div className="player-detail-block">
        <p className="player-detail-label">
          Work rates (attacking / defensive)
          {!isCoach && <span className="view-only-tag"> (view only)</span>}
        </p>
        <p className="player-detail-value">
          {WORK_RATE_LABEL[player.awr]} / {WORK_RATE_LABEL[player.dwr]}
        </p>
      </div>

      <div className="player-detail-block">
        <p className="player-detail-label">
          Attributes (coach-rated, 1-5)
          {!isCoach && <span className="view-only-tag"> (view only)</span>}
        </p>
        {ATTRIBUTE_KEYS.map((key) => (
          <div className="attribute-row" key={key}>
            <span className="attribute-label">{ATTRIBUTE_LABELS[key]}</span>
            <span className="attribute-bar">
              <span
                className="attribute-bar-fill"
                style={{ width: `${(player.attributes[key] / 5) * 100}%` }}
              />
            </span>
            <span className="attribute-value" data-testid={`attr-value-${key}`}>
              {player.attributes[key]}
            </span>
          </div>
        ))}
      </div>

      {/* Brief step 22 / PNG 24-25: a player suggests a change to their own
          playstyle, then sees it pending. Only ever rendered for a player
          viewing their own claimed row: absent from the DOM entirely for a
          coach (this whole block) and absent for a player viewing a
          teammate's row (player.is_you false there). */}
      {!isCoach && player.is_you && (
        <>
          {ownPendingSuggestion ? (
            <div
              className="suggestion-card suggestion-pending"
              data-testid="suggestion-pending-card"
            >
              <p className="suggestion-card-label">Your suggestion, pending coach review</p>
              <p className="suggestion-card-text">&ldquo;{ownPendingSuggestion.text}&rdquo;</p>
            </div>
          ) : (
            <form
              className="suggestion-card suggestion-composer"
              data-testid="suggestion-composer"
              onSubmit={onSubmitSuggestion}
            >
              <p className="suggestion-card-label">Suggest a change to your playstyle</p>
              <p className="suggestion-card-hint">
                Tell your coach how you see your game: role, runs, what you want to work on. The
                coach reviews before anything changes.
              </p>
              <textarea
                data-testid="suggestion-text"
                value={suggestionText}
                onChange={(e) => onSuggestionTextChange(e.target.value)}
                placeholder="e.g. I feel more dangerous starting wider right and cutting in. Could we try me as a touchline winger for a session?"
                required
                minLength={1}
              />
              {suggestionError && (
                <p role="alert" className="roster-error">
                  {suggestionError}
                </p>
              )}
              <button type="submit" data-testid="suggestion-send" disabled={suggestionSaving}>
                Send suggestion
              </button>
            </form>
          )}
        </>
      )}

      {/* PNG 27: coach review card for this player's pending suggestion.
          Approve/Dismiss are coach-only controls, API-enforced (403 for a
          player, backend/app/routers/suggestions.py), and absent from the
          DOM here for a player since pendingSuggestion is only ever
          populated by the coach-only pending-queue fetch. */}
      {isCoach && pendingSuggestion && (
        <div className="suggestion-card suggestion-review" data-testid="suggestion-review-card">
          <p className="suggestion-card-label">
            Playstyle suggestion from {pendingSuggestion.player_name}
          </p>
          <p className="suggestion-card-text">&ldquo;{pendingSuggestion.text}&rdquo;</p>
          {suggestionError && (
            <p role="alert" className="roster-error">
              {suggestionError}
            </p>
          )}
          <div className="suggestion-card-actions">
            <button
              type="button"
              data-testid="suggestion-approve"
              disabled={suggestionSaving}
              onClick={() => onApproveSuggestion(pendingSuggestion.id)}
            >
              Approve, add to profile
            </button>
            <button
              type="button"
              className="ctl-ghost"
              data-testid="suggestion-dismiss"
              disabled={suggestionSaving}
              onClick={() => onDismissSuggestion(pendingSuggestion.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerForm({
  form,
  setForm,
  rolesByPosition,
  onSubmit,
  onCancel,
  onAttributeChange,
  saving,
  error,
  isCreate,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  rolesByPosition: Map<string, RoleCatalogWire[]>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onAttributeChange: (key: AttributeKey, value: number) => void;
  saving: boolean;
  error: string | null;
  isCreate: boolean;
}) {
  return (
    <form className="player-form" onSubmit={onSubmit}>
      <h3>{isCreate ? "Add player" : "Edit player"}</h3>
      <label className="player-form-field">
        Name
        <input
          data-testid="player-name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          required
        />
      </label>
      <div className="player-form-row">
        <label className="player-form-field">
          Jersey number
          <input
            data-testid="player-jersey"
            type="number"
            min={1}
            max={99}
            value={form.jerseyNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, jerseyNumber: e.target.value }))}
          />
        </label>
        <label className="player-form-field">
          Preferred foot
          <select
            data-testid="player-foot"
            value={form.preferredFoot}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, preferredFoot: e.target.value as PreferredFoot }))
            }
          >
            <option value="L">Left</option>
            <option value="R">Right</option>
            <option value="B">Both</option>
          </select>
        </label>
      </div>

      <div className="player-form-row">
        <label className="player-form-field">
          Role
          <select
            data-testid="player-role"
            value={form.roleCode}
            onChange={(e) => setForm((prev) => ({ ...prev, roleCode: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {Array.from(rolesByPosition.entries()).map(([position, roleList]) => (
              <optgroup key={position} label={position}>
                {roleList.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="player-form-field">
          Flank
          <select
            data-testid="player-flank"
            value={form.flank}
            onChange={(e) => setForm((prev) => ({ ...prev, flank: e.target.value as Flank | "" }))}
          >
            <option value="">Unassigned</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="center">Center</option>
          </select>
        </label>
      </div>

      <div className="player-form-row">
        <label className="player-form-field">
          AWR (attacking work rate)
          <select
            data-testid="player-awr"
            value={form.awr}
            onChange={(e) => setForm((prev) => ({ ...prev, awr: e.target.value as WorkRate }))}
          >
            <option value="low">Low</option>
            <option value="med">Med</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="player-form-field">
          DWR (defensive work rate)
          <select
            data-testid="player-dwr"
            value={form.dwr}
            onChange={(e) => setForm((prev) => ({ ...prev, dwr: e.target.value as WorkRate }))}
          >
            <option value="low">Low</option>
            <option value="med">Med</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <div className="player-form-attributes">
        <p className="player-detail-label">Attributes (coach-rated, 1-5)</p>
        {ATTRIBUTE_KEYS.map((key) => (
          <label className="attribute-slider-row" key={key}>
            <span className="attribute-label">{ATTRIBUTE_LABELS[key]}</span>
            <input
              data-testid={`player-attr-${key}`}
              type="range"
              min={1}
              max={5}
              step={1}
              value={form.attributes[key]}
              onChange={(e) => onAttributeChange(key, Number(e.target.value))}
            />
            <span className="attribute-value">{form.attributes[key]}</span>
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="roster-error">
          {error}
        </p>
      )}

      <div className="player-form-actions">
        <button type="submit" data-testid="player-save" disabled={saving}>
          Save
        </button>
        <button type="button" className="ctl-ghost" data-testid="player-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
