import { twMerge } from "tailwind-merge";
import {
  useGenerateApps,
  useEditApps,
  getAppCardPalette,
  getBadgeStyles,
  goToApp,
  type FullAppItem,
} from "~/config/appMenu";

export const AppsQuickMenu = () => {
  const generateApps = useGenerateApps();
  const editApps = useEditApps();
  return (
    <div className="grid w-[680px] grid-cols-2 gap-3">
      <AppsQuickMenuSection title="Create" apps={generateApps} />
      <AppsQuickMenuSection title="Edit" apps={editApps} />
    </div>
  );
};

const AppsQuickMenuSection = ({
  title,
  apps,
}: {
  title: string;
  apps: FullAppItem[];
}) => (
  <div>
    <h3 className="hud-label mb-2 px-2 text-base-fg/50">{title}</h3>
    <div className="space-y-1">
      {apps.map((app) => {
        const palette = getAppCardPalette(app.id);
        return (
          <button
            key={app.id}
            onClick={() => goToApp(app.action)}
            disabled={!app.action}
            className={twMerge(
              "group flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors",
              app.action
                ? "cursor-pointer hover:border-white/10 hover:bg-white/[0.06]"
                : "cursor-default opacity-60",
            )}
          >
            <div
              className={twMerge(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                palette.iconBg,
                palette.iconColor,
              )}
            >
              <app.icon weight="duotone" className="text-base" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-[13px] font-medium">
                  {app.label}
                </div>
                {app.badge && (
                  <span
                    className={twMerge(
                      "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.12em]",
                      getBadgeStyles(app.badge),
                    )}
                  >
                    {app.badge}
                  </span>
                )}
              </div>
              <div className="truncate text-[11px] text-base-fg/60">
                {app.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);
