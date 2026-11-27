/**
 * Every company settings tab's page (Figma 353:999, owner 2026-11-10): the app's bar (the way
 * back, "Settings", then the company - as in every app's header - the initials and the menu),
 * then the side rail (`SettingsRail`: the tabs and the open tab's cards, the user 2026-11-27) and
 * the tab's own cards in an 880px column beside it - the rail is a bar and a sheet below `lg`. The
 * page draws no name or heading of its own (the user, 2026-11-27: the header says both). Shared
 * chrome, so the Module tab (features/subscription) and the other five (features/company-settings
 * and the two module settings features) draw one page. Which tabs show is the caller's `access`.
 */

"use client";

import { useRef, type ReactNode } from "react";

import { AppHeader } from "@/components/ui/AppHeader";
import { SettingsRail } from "@/components/ui/SettingsRail";
import type { CompanySettingsTab } from "@/lib/hubPaths";
import type { ModuleClaims } from "@/lib/moduleClaims";
import { settingsBackLink, settingsTabs } from "@/lib/settingsTabs";
import type { Viewer } from "@/lib/viewer";

export function SettingsPage({
  company,
  access,
  tab,
  viewer,
  children,
}: {
  company: { id: string; name: string };
  access: ModuleClaims;
  tab: CompanySettingsTab;
  /** The person looking, when the page's model already names them. */
  viewer?: Viewer | null;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    // One scroll: the document's, under the sticky header (owner, 2026-11-12). The frame used to lock
    // the window and scroll inside <main>, so a long list drew a second scroll bar beside it.
    <div className="flex min-h-dvh min-w-0 max-w-full flex-col bg-white">
      <AppHeader
        title="Settings"
        back={settingsBackLink(company.id)}
        companyName={company.name || "Loading…"}
        viewer={viewer}
        nav={{ modules: access }}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-clip pb-[env(safe-area-inset-bottom,0px)]">
        {/* Below lg the rail's bar sits right under the header; from lg the rail and the cards
            start together under a gap. */}
        <div className="mx-auto flex w-full max-w-[928px] min-w-0 flex-col gap-6 px-4 pb-14 sm:px-6 lg:max-w-[1200px] lg:pt-10">
          {/* A card jumped to clears the header (and below lg the rail's bar): --settings-offset is
              its scroll margin (SettingsCard). */}
          <div className="flex min-w-0 flex-col gap-6 [--settings-offset:calc(var(--app-header-h)+4.5rem)] lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:[--settings-offset:calc(var(--app-header-h)+1.5rem)]">
            <SettingsRail tabs={settingsTabs(company, access, tab)} content={content} />
            <div ref={content} data-settings-content className="flex min-w-0 flex-col gap-6">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
