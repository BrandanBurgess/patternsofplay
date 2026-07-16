// Thin fetch wrapper for the auth and teams endpoints. No app state is
// cached in localStorage; every screen re-reads from the server (Brief
// section 7). Cookies ride along automatically because the dev server
// proxies /api to the backend on the same origin (vite.config.ts).

export type Role = "coach" | "player";

export interface UserOut {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface TeamOut {
  id: number;
  name: string;
  age_group: string | null;
  level: string | null;
  colors_json: Record<string, unknown> | null;
  join_code: string;
  created_by: number;
  created_at: string;
}

export interface MembershipOut {
  team: TeamOut;
  role_on_team: Role;
  joined_at: string;
}

export interface MeOut {
  // Null when signed out: GET /api/auth/me is a 200 probe, not a 401
  // (see backend app/deps.py get_current_user_optional for why).
  user: UserOut | null;
  memberships: MembershipOut[];
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Body was not JSON; fall back to the status text already set.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchMe(): Promise<MeOut> {
  return request<MeOut>("/auth/me");
}

export function register(input: {
  email: string;
  password: string;
  display_name: string;
  role: Role;
}): Promise<UserOut> {
  return request<UserOut>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }): Promise<UserOut> {
  return request<UserOut>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

export function createTeam(input: {
  name: string;
  age_group?: string;
  level?: string;
}): Promise<TeamOut> {
  return request<TeamOut>("/teams", { method: "POST", body: JSON.stringify(input) });
}

export function joinTeam(input: { join_code: string }): Promise<TeamOut> {
  return request<TeamOut>("/teams/join", { method: "POST", body: JSON.stringify(input) });
}
