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
  createPlayer,
  deletePlayer,
  fetchRoleCatalog,
  fetchRoster,
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

  const isCoach = role === "coach";

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
}: {
  player: PlayerWire;
  isCoach: boolean;
  onEdit: () => void;
  onDelete: () => void;
  saving: boolean;
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
