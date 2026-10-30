import { CheckIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { Label } from "@storyteller/ui-label";
import { useEffect, useMemo, useState } from "react";

type AppTheme = "light" | "gray";

const THEME_STORAGE_KEY = "st-theme";

function getStoredTheme(): AppTheme {
  const value = (localStorage.getItem(THEME_STORAGE_KEY) || "").trim();
  return value === "light" ? "light" : "gray";
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  const toRemove: string[] = [];
  root.classList.forEach((c) => {
    if (c.startsWith("theme-")) toRemove.push(c);
  });
  toRemove.forEach((c) => root.classList.remove(c));
  root.classList.add(`theme-${theme}`);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export const AppearanceSettingsPane = () => {
  const [selected, setSelected] = useState<AppTheme>(getStoredTheme());

  useEffect(() => {
    applyTheme(selected);
  }, [selected]);

  const themes = useMemo(
    () => [
      {
        id: "light" as const,
        label: "Light",
        swatch: <Swatch background="#fdfdfd" />,
      },
      {
        id: "gray" as const,
        label: "Dark",
        swatch: <Swatch background="#0a0a0a" />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 pt-3 text-base-fg">
      <div className="flex flex-col gap-0.5">
        <Label>Themes</Label>
        <p className="text-xs opacity-70">
          Choose your preferred look. Applies instantly.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              className={twMerge(
                "group flex items-center gap-3 border p-2 text-left transition-colors duration-100",
                isSelected
                  ? "border-base-fg/70 bg-base-fg/10"
                  : "border-ui-panel-border bg-base-fg/[0.03] hover:border-base-fg/30 hover:bg-base-fg/[0.06]",
              )}
              onClick={() => setSelected(t.id)}
              aria-pressed={isSelected}
            >
              {t.swatch}
              <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
                {t.label}
              </span>
              {isSelected && (
                <CheckIcon aria-hidden className="mr-1 h-3.5 w-3.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Swatch = ({ background }: { background: string }) => (
  <div
    className="h-8 w-8 shrink-0 border border-base-fg/20"
    style={{ background }}
  />
);
