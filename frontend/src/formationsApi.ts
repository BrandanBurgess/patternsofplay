// Wire types and fetch calls for the formations route (doc 03 section 5;
// Brief step 18): the six-preset formations library, each with its
// keystones and rondo zones embedded. Mirrors backend/app/schemas.py
// FormationOut field for field, the same convention libraryApi.ts follows
// for LibraryItemOut.

import { request } from "./api";

export interface FormationPositionWire {
  slot: string;
  position_code: string;
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
  polygon: { x: number; y: number }[];
  trains_pattern_codes: string[];
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
