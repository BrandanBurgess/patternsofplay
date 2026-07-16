import { THEMES, Theme, useTheme } from "./useTheme";
import "./theme-switcher.css";

const LABELS: Record<Theme, string> = {
  pitch: "Pitch",
  dark: "Dark",
  board: "Board",
};

/** Minimal theme switcher: swaps html[data-theme], nothing else.
 * Scope per T-002: no navigation, no new pages, just the token system
 * and this switcher. */
export default function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="Theme">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          data-testid={`theme-switch-${option}`}
          className={
            option === theme
              ? "theme-switcher-option theme-switcher-option-active"
              : "theme-switcher-option"
          }
          onClick={() => setTheme(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
