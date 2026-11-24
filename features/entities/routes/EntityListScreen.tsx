"use client";

/**
 * `/entities` - "Select Company", the hub's first page (it replaced Flask's /entity on
 * 2026-09-29). The whole screen is the page (the user's calls, 2026-09-29 - it was Flask's
 * phone-shaped card fixed in the centre): the header bar across the top (the Minty mark at the
 * left, the title in the middle, the initials and the ≡ at the right), and under it Flask's
 * column in the middle - its widths (640 px from 640, 768 from 1024, 1024 from 1200; the whole
 * width on a phone) and its spacing: the doors, the search box and the companies' rows.
 *
 * Under the header the screen scrolls as one, so the scrollbar is the screen's own right edge;
 * the header stays, the search box stays at the top while the rows scroll under it, and the
 * "+" is held to the bottom-right corner - except on the empty page, whose own button says it.
 * (The "+" was "Create company" in the Minty cat's pop-up 2026-11-05 to 2026-11-11; owner.)
 *
 * Archived companies (2026-11-10, superusers only): "Archive companies" under the search - the
 * list's manage mode, where each company offers Archive, asked first - the
 * All / Active / Archived switch above the search, and each archived company's Restore, asked
 * first. Nobody else sees any of it.
 *
 * AI allowances (owner, 2026-11-18; a list mode like Archive since 2026-11-19, no page of its own):
 * a superuser's "AI allowances" beside "Archive companies" turns each row into the company's AI
 * allowance - what is left of its grants, its reads - with Manage opening the company: its grants,
 * the "Give a grant" form and its last reads (`components/AiGrantDialog.tsx`). One mode at a time.
 *
 * Tabs (owner, 2026-11-20): AI allowances, Archive companies, Refresh - no "Done". The open mode's
 * tab looks selected; clicking it again closes the mode, clicking the other tab moves there.
 *
 * Refresh (2026-11-20, superusers): reads the list again without reloading the page - companies
 * made, archived or changed elsewhere since - the rows staying until the new list arrives.
 */

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NoticeDialog } from "@/components/ui/NoticeDialog";

import { AiGrantDialog } from "@/features/entities/components/AiGrantDialog";
import { EntityCard } from "@/features/entities/components/EntityCard";
import {
  AddEntityButton,
  ArchivedFilterSwitch,
  CompanySearch,
  DoorsHero,
  EntityListEmpty,
  EntityListError,
  EntityListLoading,
  EntityListNoMatch,
  SelectCompanyHeader,
} from "@/features/entities/components/EntityListParts";
import { useEntityList, type UseEntityListArgs } from "@/features/entities/hooks/useEntityList";
import {
  ARCHIVE_COMPANY,
  ARCHIVE_TEXT,
  ARCHIVE_TITLE,
  MANAGE_AI,
  MANAGE_ARCHIVE,
  RESTORE,
  RESTORE_TEXT,
  RESTORE_TITLE,
} from "@/features/entities/lib/entityRows";

const MODE_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[12px] border border-border-default bg-white px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";
/** A mode tab, the open one looking selected like the All / Active / Archived switch above it
 * (owner, 2026-11-20). Its colours never sit beside MODE_BUTTON's: two classes setting one property
 * are decided by the stylesheet's order, not the class list's. */
const MODE_TAB = (on: boolean) =>
  `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[12px] border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
    on
      ? "border-action-primary bg-state-selected text-text-link"
      : "border-border-default bg-white text-text-primary hover:bg-surface-sunk"
  }`;

export function EntityListScreen(args: UseEntityListArgs) {
  const list = useEntityList(args);
  const empty = list.status === "ready" && !list.hasEntities;

  return (
    <div className="flex h-dvh flex-col bg-surface-canvas">
      <SelectCompanyHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex min-h-full w-full flex-col p-6 pb-40 min-[640px]:w-[640px] min-[1024px]:w-[768px] min-[1200px]:w-[1024px]">
          {empty ? (
            <EntityListEmpty />
          ) : (
            <div className="flex flex-col gap-4">
              <DoorsHero />
              {list.isSuperuser ? (
                <ArchivedFilterSwitch value={list.archived} onChange={list.setArchived} />
              ) : null}
              <CompanySearch value={list.query} onChange={list.setQuery} />
              {list.status === "ready" && list.isSuperuser ? (
                <div className="-mt-2 flex flex-wrap justify-end gap-2">
                  {list.canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={list.toggleAiMode}
                        aria-pressed={list.aiMode}
                        className={MODE_TAB(list.aiMode)}
                      >
                        {MANAGE_AI}
                      </button>
                      <button
                        type="button"
                        onClick={list.toggleManaging}
                        aria-pressed={list.managing}
                        className={MODE_TAB(list.managing)}
                      >
                        {MANAGE_ARCHIVE}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={list.refresh}
                    disabled={list.refreshing}
                    className={`${MODE_BUTTON} disabled:cursor-wait disabled:opacity-60`}
                  >
                    {list.refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              ) : null}
              {list.aiMode && list.aiError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-status-danger-ink">{list.aiError}</p>
                  <button type="button" onClick={list.retryAi} className={MODE_BUTTON}>
                    Try again
                  </button>
                </div>
              ) : null}
              {list.status === "loading" ? <EntityListLoading /> : null}
              {list.status === "error" ? (
                <EntityListError message={list.error ?? ""} onRetry={list.retry} />
              ) : null}
              {list.status === "ready" ? (
                <ul className="flex flex-col gap-4" aria-label="Your companies">
                  {list.rows.map((row) => (
                    <EntityCard
                      key={row.id}
                      row={row}
                      onRestore={list.isSuperuser ? list.askRestore : undefined}
                      managing={list.managing}
                      onArchive={list.askArchive}
                      ai={
                        list.aiMode
                          ? { row: list.aiRows?.[row.id], onManage: list.openAi }
                          : undefined
                      }
                    />
                  ))}
                </ul>
              ) : null}
              {list.status === "ready" && list.rows.length === 0 ? <EntityListNoMatch /> : null}
            </div>
          )}
        </main>
      </div>
      {empty ? null : <AddEntityButton />}
      {list.aiOpen ? (
        <AiGrantDialog id={list.aiOpen.id} onClose={list.closeAi} onChanged={list.aiChanged} />
      ) : null}
      {list.pending ? (
        <ConfirmDialog
          title={
            list.pending.kind === "archive"
              ? ARCHIVE_TITLE(list.pending.row.name)
              : RESTORE_TITLE(list.pending.row.name)
          }
          image={list.pending.kind === "archive" ? "sad" : "thumbs_up"}
          busy={list.pendingBusy}
          confirmLabel={list.pending.kind === "archive" ? ARCHIVE_COMPANY : RESTORE}
          confirmTone={list.pending.kind === "archive" ? "red" : undefined}
          onConfirm={() => void list.confirmPending()}
          onBack={list.cancelPending}
        >
          <p>{list.pending.kind === "archive" ? ARCHIVE_TEXT : RESTORE_TEXT}</p>
          {list.pendingError ? (
            <p role="alert" className="text-status-danger-ink">
              {list.pendingError}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
      {list.dialogNotice ? (
        <NoticeDialog message={list.dialogNotice} onClose={list.dismissDialogNotice} />
      ) : null}
    </div>
  );
}
