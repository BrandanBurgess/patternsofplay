import { useCallback, useEffect, useState } from "react";

export const THEMES = ["pitch", "dark", "board"] as const;
export type Theme = (typeof THEMES)[number];

const DEFAULT_THEME: Theme = "pitch";

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

function readInitialTheme(): Theme {
  // The html[data-theme] attribute (set in index.html) is the only
  // starting point. No client-side persistence: per Brief section 7,
  // "No localStorage for app state; server is the source of truth."
  // A durable per-user theme preference is a later, server-backed
  // ticket once auth lands; until then a switch lasts the session only.
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.getAttribute("data-theme");
    if (isTheme(fromDom)) return fromDom;
  }
  return DEFAULT_THEME;
}

/** Applies the active theme to html[data-theme]. The three themes and
 * every color a component draws on both come from
 * frontend/src/styles/tokens.css; this hook only ever writes the
 * attribute, it never sets a color itself. In-session only: no
 * localStorage, cookies, or sessionStorage (Brief section 7). */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
