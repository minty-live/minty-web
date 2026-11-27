/**
 * The teal banner at the top of the payer portal's pages (Figma 04: "Manage Subscriptions"),
 * with the way back - "‹ Back", every app's header back (`@minty/shared`'s `HeaderBack`, the user
 * 2026-11-27), named "Back to the previous page" - drawn in the header bar, above the banner's
 * left edge (`PortalBack`).
 */

import { HeaderBack } from "@minty/shared/ui";

import { PortalBack } from "@/features/subscription/components/PortalBack";

export function PortalHero({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <>
      {onBack && (
        <PortalBack>
          <HeaderBack onClick={onBack} ariaLabel="Back to the previous page" />
        </PortalBack>
      )}
      <div className="rounded-[32px] bg-action-primary px-6 py-7 sm:px-[54px] sm:py-10">
        <h1 className="text-[28px] font-bold leading-none text-white sm:text-[40px]">{title}</h1>
      </div>
    </>
  );
}
