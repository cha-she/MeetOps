import { useCallback, useEffect, useState } from "react";

// Appearance settings, remembered per browser:
//   theme  - light / dark / follow the system
//   accent - the highlight colour used for buttons, links and selection

export type Theme = "light" | "dark" | "system";
export type Accent = "teal" | "indigo" | "violet" | "rose" | "orange";

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "teal", label: "Teal", swatch: "#0d9488" },
  { value: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { value: "violet", label: "Violet", swatch: "#7c3aed" },
  { value: "rose", label: "Rose", swatch: "#e11d48" },
  { value: "orange", label: "Orange", swatch: "#ea580c" },
];

const THEME_KEY = "meetops.theme";
const ACCENT_KEY = "meetops.accent";
const DEFAULT_ACCENT: Accent = "teal";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the choice lasts for this visit only
  }
}

function storedTheme(): Theme {
  const v = read(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function storedAccent(): Accent {
  const v = read(ACCENT_KEY);
  return ACCENTS.some((a) => a.value === v) ? (v as Accent) : DEFAULT_ACCENT;
}

function systemDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent;
}

// Apply the saved appearance before React renders, so the page never flashes.
export function applyStoredAppearance() {
  applyTheme(storedTheme());
  applyAccent(storedAccent());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    write(THEME_KEY, t === "system" ? null : t);
    setThemeState(t);
  }, []);

  return [theme, setTheme];
}

export function useAccent(): [Accent, (a: Accent) => void] {
  const [accent, setAccentState] = useState<Accent>(storedAccent);

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  const setAccent = useCallback((a: Accent) => {
    write(ACCENT_KEY, a);
    setAccentState(a);
  }, []);

  return [accent, setAccent];
}

// Current accent as a CSS colour, for charts that cannot use Tailwind classes.
export function accentColor(alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "13 148 136";
  const rgb = v.split(/\s+/).join(", ");
  return alpha < 1 ? `rgba(${rgb}, ${alpha})` : `rgb(${rgb})`;
}
