// Wire types and fetch calls for the formations route (doc 03 section 5;
// Brief step 18): the six-preset formations library, each with its
// keystones and rondo zones embedded. Mirrors backend/app/schemas.py
// FormationOut field for field, the same convention libraryApi.ts follows
// for LibraryItemOut.

import { request } from "./api";

export interface FormationPositionWire {
  slot: string;
  position_code: string;
  /**
   * Doc 06 section 2.6's slot family (`gk`, `cb_central`, `cb_wide`, `fb`,
   * `wb`, `six`, `eight`, `ten`, `wide_forward`, `nine`): the key T-107's
   * personnel panel needs for GET /archetypes and GET /archetypes/suggest.
   * T-110 seeded it on every base formation slot; T-107 is what finally
   * puts it on the wire (backend/app/schemas.py FormationPositionOut).
   * Optional because GET /formations/{code}/phases reuses this same type
   * for a formation_phases row's positions_json, which carries no
   * slot_family of its own (backend/app/schemas.py docstring) and comes
   * back null there. The personnel panel only ever reads it off a
   * formation's own base `positions`, never off a phase variant.
   */
  slot_family: string | null;
  x: number;
  y: number;
}

export interface FormationKeystoneWire {
  slot: string;
  title: string;
  blurb: string;
}

export interface RondoZoneWire {
  zone_key: string;
  rondo_name: string;
  teaches: string;
  /**
   * The seeded polygon. On a ball_relative_circle zone this only BOUNDS the
   * region the circle is coached in (seeds/rondo_zones.json puts the
   * counterpress ring's bound at half the pitch); it is not the zone, and
   * the Rondo Map must never draw it as one.
   */
  polygon: { x: number; y: number }[];
  trains_pattern_codes: string[];
  /**
   * doc 06 section 2.3's fallback ratio, shown MUTED when no opposition is
   * placed and not read at all once one is. Null means no fallback chip,
   * never an empty one.
   */
  canonical_rondo: string | null;
  /**
   * polygon | ball_relative_circle (doc 06 section 2.3). Typed as string
   * rather than a union on purpose: this is seeded content, and a client
   * that fails to compile or to parse on an unrecognised value would turn a
   * content edit into an outage. Callers compare against
   * BALL_RELATIVE_CIRCLE and treat anything else as a polygon.
   */
  zone_kind: string;
  /** Model units. Non-null only on a ball_relative_circle zone. */
  radius: number | null;
}

export interface FormationOutWire {
  code: string;
  name: string;
  shape_blurb: string;
  strengths: string[];
  vulnerabilities: string[];
  natural_identities: string[];
  positions: FormationPositionWire[];
  keystones: FormationKeystoneWire[];
  rondo_zones: RondoZoneWire[];
}

export function listFormations(): Promise<FormationOutWire[]> {
  return request<FormationOutWire[]>("/formations");
}
