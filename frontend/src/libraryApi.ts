// Wire types and fetch calls for the library content routes (doc 03
// section 4; Brief step 17): the three browsable libraries (patterns,
// deliveries, rotations) the Patterns page's browser sheet lists. Mirrors
// backend/app/schemas.py LibraryItemOut field for field.

import { request } from "./api";

export type LibraryItemType = "pattern" | "delivery" | "rotation";

export interface AnimationSlotWire {
  slot: string;
  role_hint?: string | null;
  side?: "opponent";
  start: { x: number; y: number };
}

export interface AnimationMoveWire {
  slot: string;
  to: { x: number; y: number };
  arc?: string | null;
}

export interface AnimationBallToWire {
  bind_slot: string;
  trajectory: "ground" | "driven" | "whipped" | "floated" | "clipped";
}

export interface AnimationStepWire {
  n: number;
  caption: string;
  moves: AnimationMoveWire[];
  ball_to?: AnimationBallToWire | null;
}

export interface AnimationSpecWire {
  slots: AnimationSlotWire[];
  ball: { holder_slot: string };
  steps: AnimationStepWire[];
  loop: boolean;
}

export interface LibraryItemOutWire {
  id: number;
  code: string;
  item_type: LibraryItemType;
  name: string;
  category: string;
  blurb: string;
  when_to_use: string;
  coaching_points: string[];
  youth_takeaway: string;
  age_hint: string;
  roles_involved: string[];
  animation_spec: AnimationSpecWire | null;
  // Shape depends on item_type: delivery carries trajectory/delivery_zone/
  // target_corridor, rotation carries trigger/creates/defenders_dilemma
  // (backend/app/models/library.py).
  extras: Record<string, string> | null;
}

export function listLibraryItems(itemType?: LibraryItemType): Promise<LibraryItemOutWire[]> {
  const qs = itemType ? `?item_type=${itemType}` : "";
  return request<LibraryItemOutWire[]>(`/library/items${qs}`);
}
