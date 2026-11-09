import { ArrowRightIcon, HeartIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import {
  useGenerateApps,
  useEditApps,
  getBadgeStyles,
  goToApp,
  type FullAppItem,
} from "~/config/appMenu";
import { useTabStore } from "~/pages/Stores/TabState";

const FAVORITES_APP = {
  id: "favorites",
  label: "Favorites",
  description: "Your hearted images and videos in one place.",
  icon: HeartIcon,
  category: "edit",
} as FullAppItem;

const GRID =
  "grid grid-flow-dense auto-rows-[minmax(140px,auto)] grid-cols-2 gap-3 md:grid-cols-4";

export const AppsIndexPage = () => {
  const generateApps = useGenerateApps();
  const editApps = useEditApps();

  return (
    // The scroll container spans the full window width so its scrollbar sits
    // flush against the right edge; horizontal padding lives on the inner
    // wrapper instead.
    <div className="fixed inset-0 overflow-y-auto bg-ui-background pt-[56px] text-base-fg">
      <main
        className={twMerge(
          GRID,
          "mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12",
        )}
      >
        <section className="col-span-2 row-span-2 flex flex-col justify-between rounded-tile border border-ui-border bg-ui-panel p-6 shadow-sm sm:p-8">
          <img
            src="/resources/logo/h0x-icon.png"
            alt="H0x"
            className="h-12 w-12"
          />
          <div>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
              What will you <span className="text-ui-accent-ink">create</span>{" "}
              today?
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-base-fg/70 sm:text-base">
              Start with an idea. Choose a tool to bring it to life.
            </p>
          </div>
        </section>

        {generateApps.map((app, index) => (
          <AppTile key={app.id} app={app} wide={index < 2} />
        ))}

        <AppTile
          app={FAVORITES_APP}
          onOpen={() => useTabStore.getState().setActiveTab("FAVORITES")}
        />

        <section className="col-span-full mt-6">
          <h2 className="hud-label mb-3 text-base-fg/70">Edit</h2>
          <div className={GRID}>
            {editApps.map((app) => (
              <AppTile key={app.id} app={app} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

function AppTile({
  app,
  wide = false,
  onOpen,
}: {
  app: FullAppItem;
  wide?: boolean;
  onOpen?: () => void;
}) {
  const enabled = !!app.action || !!onOpen;

  return (
    <button
      onClick={onOpen ?? (() => goToApp(app.action))}
      disabled={!enabled}
      className={twMerge(
        "group flex h-full flex-col justify-between gap-4 rounded-tile border border-ui-border bg-ui-panel p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:border-primary",
        wide && "col-span-2",
        enabled
          ? "cursor-pointer"
          : "cursor-default opacity-60 hover:translate-y-0 hover:border-ui-border hover:shadow-sm",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <app.icon weight="duotone" className="text-xl" />
        </span>
        {enabled && (
          <ArrowRightIcon weight="bold" className="h-4 w-4 text-base-fg/40 transition-colors group-hover:text-primary" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-tight text-ui-ink">
            {app.label}
          </h3>
          {app.badge && (
            <span
              className={twMerge(
                "shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] font-medium leading-none tracking-wider",
                app.badge === "SOON"
                  ? getBadgeStyles(app.badge)
                  : "border-primary/30 text-ui-accent-ink",
              )}
            >
              {app.badge}
            </span>
          )}
        </div>
        <p
          className={twMerge(
            "mt-1 text-sm leading-relaxed text-base-fg/70",
            !wide && "line-clamp-2",
          )}
        >
          {app.description}
        </p>
      </div>
    </button>
  );
}
