"use client";

/**
 * The select-company list: load it, search it as a person types, and say what Flask flashed
 * on the way here. The screen calls this and renders what it returns.
 *
 * - A person choosing a company is in none. A token minted INSIDE one (the side menu's Select
 *   Entity from a company page) goes back through Flask for an unscoped one first, so the
 *   menu, the profile and every page after this one stop describing the company just left.
 * - `flash` (Flask's signed hand-over, `?flash=`) comes back from the API as `notices` - each
 *   is toasted once, and the parameter is dropped from the URL so a reload says nothing. It is
 *   read ONCE, at mount: dropping it from the URL must not read the list a second time.
 * - Order: "Setup in progress" first, then A→Z (`sortRows`), not Flask's most-recently-opened.
 * - Search is Flask's `filterCompanies`: case-insensitive, anywhere in the name, as typed.
 * - `fixture`: dev-only, `?fixture=LIST|EMPTY` (`__fixtures__/entities.ts`).
 * - Archived companies (2026-11-10): only a superuser archives. They turn on the list's manage
 *   mode ("Archive companies") and archive a company from its row, asked first (refused while a
 *   module is still paid for - the API's sentence stays in the dialog). Only a
 *   superuser is sent archived companies: their list carries an All / Active / Archived filter
 *   (asked of the API, so a long list is never filtered here) and a Restore on each archived row,
 *   asked first. Either way the list is read again afterwards.
 * - AI allowances (owner, 2026-11-18; a list mode like "Archive companies", 2026-11-19): a
 *   superuser turns on "AI allowances" and each company's row shows what is left of its AI grants,
 *   asked of minty-accounts-api for exactly the rows listed (`?ids=`); "Manage" opens the company
 *   (`components/AiGrantDialog.tsx`), whose given grant updates the row. One mode at a time.
 * - Refresh (2026-11-20): a superuser reads the list again (and, in AI mode, its allowances)
 *   without reloading the page; the rows stay on screen until the new list arrives.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { splitNotices } from "@/components/ui/NoticeDialog";
import { useToast, type ToastType } from "@/components/ui/Toast";
import { ApiError } from "@/lib/apiClient";
import { isEntityScoped } from "@/lib/auth";
import { redirectToHandoff } from "@/lib/handoff";

import {
  fetchAiCompanies,
  type AiCompany,
  type AiCompanyRow,
} from "@/features/entities/api/aiAllowances";
import {
  archiveEntity,
  fetchEntities,
  restoreEntity,
  type ArchivedFilter,
  type EntityListAnswer,
  type EntityRow,
} from "@/features/entities/api/entities";
import {
  ARCHIVED_DONE,
  canArchive,
  filterRows,
  LOAD_FAILED,
  RESTORED,
  sortRows,
} from "@/features/entities/lib/entityRows";
import { ENTITIES_BASE_PATH } from "@/features/entities/lib/paths";

export type UseEntityListArgs = { flash?: string | null; fixture?: string | null };

export type EntityListStatus = "loading" | "error" | "ready";

/** The row whose Archive or Restore is being asked, in its confirm dialog. */
export type PendingAction = { kind: "archive" | "restore"; row: EntityRow };

type Loaded = {
  attempt: number;
  archived: ArchivedFilter;
  answer: EntityListAnswer | null;
  error: string | null;
};

async function load(
  flash: string | null,
  fixture: string | null,
  archived: ArchivedFilter,
  signal: AbortSignal,
): Promise<EntityListAnswer> {
  if (process.env.NODE_ENV !== "production" && fixture) {
    const f = await import("@/features/entities/__fixtures__/entities");
    if (f.isEntityFixture(fixture)) return f.FIXTURES[fixture];
  }
  // "all" is the API's own default for a superuser, so the first read asks nothing extra.
  return fetchEntities({ flash, archived: archived === "all" ? undefined : archived, signal });
}

const failure = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong on my end. Mind trying again?";

export function useEntityList({ flash = null, fixture = null }: UseEntityListArgs = {}) {
  const router = useRouter();
  const { showToast } = useToast();
  // The hand-over is read once: the URL loses it below, and that must not re-read the list.
  const [handOver] = useState(flash);
  const [attempt, setAttempt] = useState(0);
  // A Refresh in flight: the last list stays on screen until the new one arrives.
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [query, setQuery] = useState("");
  const [archived, setArchivedState] = useState<ArchivedFilter>("all");
  const [managing, setManaging] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [ai, setAi] = useState<{ rows: Record<string, AiCompanyRow>; error: string | null } | null>(
    null,
  );
  const [aiOpen, setAiOpen] = useState<EntityRow | null>(null);
  const [aiAttempt, setAiAttempt] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const told = useRef(false);
  // A hand-over notice to act on (category `dialog`), shown in a modal until closed.
  const [dialogNotice, setDialogNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isEntityScoped()) {
      redirectToHandoff(ENTITIES_BASE_PATH);
      return;
    }
    const controller = new AbortController();
    // The hand-over rides only the first read: the filter re-reads without it.
    load(
      attempt === 0 && archived === "all" ? handOver : null,
      fixture,
      archived,
      controller.signal,
    )
      .then((answer) => {
        if (controller.signal.aborted) return;
        setLoaded({ attempt, archived, answer, error: null });
        // Only the first read carries the hand-over, so this opens once.
        const dialog = splitNotices(answer.notices).dialog;
        if (dialog) setDialogNotice(dialog);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // A 401 has already sent the browser for a fresh token; there is nothing to show.
        if (err instanceof ApiError && err.status === 401) return;
        setRefreshing(false);
        setLoaded({
          attempt,
          archived,
          answer: null,
          error: err instanceof ApiError ? err.message : LOAD_FAILED,
        });
      });
    return () => controller.abort();
  }, [attempt, handOver, fixture, archived]);

  // Say what Flask flashed on the way here, once; then drop the spent hand-over from the URL.
  useEffect(() => {
    if (!loaded?.answer || told.current) return;
    told.current = true;
    for (const notice of splitNotices(loaded.answer.notices).toasts)
      showToast(notice.message, notice.category as ToastType);
    if (handOver) router.replace(ENTITIES_BASE_PATH);
  }, [loaded, handOver, router, showToast]);

  // While refreshing, the list last read (same filter) is still the one shown.
  const showingLast =
    refreshing && loaded !== null && loaded.archived === archived && !loaded.error;
  const status: EntityListStatus =
    loaded === null || (loaded.attempt !== attempt && !showingLast) || loaded.archived !== archived
      ? "loading"
      : loaded.error
        ? "error"
        : "ready";
  const all = useMemo<EntityRow[]>(
    () => (status === "ready" ? sortRows(loaded?.answer?.entities ?? []) : []),
    [status, loaded],
  );
  const rows = useMemo(() => filterRows(all, query), [all, query]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const aiOnRef = useRef(false);
  const setArchived = useCallback((next: ArchivedFilter) => setArchivedState(next), []);
  const isSuperuser = Boolean(loaded?.answer?.is_superuser);
  // Only a superuser archives (owner, 2026-11-10), so only they get manage mode.
  const canManage = isSuperuser && all.some(canArchive);
  const aiOn = aiMode && isSuperuser;
  useEffect(() => {
    aiOnRef.current = aiOn;
  }, [aiOn]);
  // the companies AI mode asks about: every one listed that is not archived (the API's limit: 500)
  const aiIds = useMemo(
    () =>
      aiOn
        ? all
            .filter(canArchive)
            .map((r) => r.id)
            .slice(0, 500)
        : [],
    [aiOn, all],
  );
  const aiKey = aiIds.join(",");

  useEffect(() => {
    if (!aiKey) return;
    const controller = new AbortController();
    fetchAiCompanies(aiKey.split(","), controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        setAi({ rows: Object.fromEntries(answer.companies.map((c) => [c.id, c])), error: null });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setAi({ rows: {}, error: failure(err) });
      });
    return () => controller.abort();
  }, [aiKey, aiAttempt]);

  /** A grant given in the dialog: the company's row shows it at once. */
  const aiChanged = useCallback((company: AiCompany) => {
    const open = company.grants.filter((g) => g.open && g.tokens_total !== null);
    setAi((before) => {
      const row = before?.rows[company.company.id];
      if (!before || !row) return before;
      return {
        ...before,
        rows: {
          ...before.rows,
          [row.id]: {
            ...row,
            percent_left: company.allowance.percent_left,
            blocked: company.allowance.blocked,
            has_grant: company.grants.length > 0,
            tokens_used: open.length ? open.reduce((n, g) => n + g.tokens_used, 0) : null,
            tokens_given: open.length ? open.reduce((n, g) => n + (g.tokens_total ?? 0), 0) : null,
          },
        },
      };
    });
  }, []);

  return {
    /** The hand-over's notice to act on (a Xero connect refused for another currency), in a modal. */
    dialogNotice,
    dismissDialogNotice: useCallback(() => setDialogNotice(null), []),
    status,
    error: status === "error" ? (loaded?.error ?? LOAD_FAILED) : null,
    rows,
    // A superuser looking at "Archived" with none is a no-match, not the "no company at all" page.
    hasEntities: all.length > 0 || (isSuperuser && archived !== "all"),
    query,
    setQuery,
    retry,
    /** Read the list again (and the AI allowances in AI mode), the rows staying meanwhile. */
    refreshing,
    refresh: useCallback(() => {
      setRefreshing(true);
      setAttempt((n) => n + 1);
      if (aiOnRef.current) setAiAttempt((n) => n + 1);
    }, []),
    isSuperuser,
    archived,
    setArchived,
    /** Manage mode: a superuser's, while a listed company is not archived yet. */
    canManage,
    managing: managing && canManage,
    toggleManaging: useCallback(() => {
      setAiMode(false);
      setManaging((on) => !on);
    }, []),
    /** AI allowances mode: a superuser's; each row shows what is left of the company's AI grants. */
    aiMode: aiOn,
    toggleAiMode: useCallback(() => {
      setManaging(false);
      setAi(null);
      setAiMode((on) => !on);
    }, []),
    /** Each listed company's allowance by id; null while it is asked for. */
    aiRows: ai?.rows ?? null,
    aiError: ai?.error ?? null,
    retryAi: useCallback(() => {
      setAi(null);
      setAiAttempt((n) => n + 1);
    }, []),
    /** The company whose AI allowance is open in its dialog. */
    aiOpen,
    openAi: useCallback((row: EntityRow) => setAiOpen(row), []),
    closeAi: useCallback(() => setAiOpen(null), []),
    aiChanged,
    /** The Archive or Restore being asked, with its dialog's state. */
    pending,
    pendingBusy,
    pendingError,
    askArchive: useCallback((row: EntityRow) => {
      setPendingError("");
      setPending({ kind: "archive", row });
    }, []),
    askRestore: useCallback((row: EntityRow) => {
      setPendingError("");
      setPending({ kind: "restore", row });
    }, []),
    cancelPending: useCallback(() => {
      setPending(null);
      setPendingError("");
    }, []),
    // The refusal stays IN the dialog, so the person can read it and try again or go back.
    confirmPending: useCallback(async () => {
      if (!pending) return;
      setPendingBusy(true);
      setPendingError("");
      try {
        const answer =
          pending.kind === "archive"
            ? await archiveEntity(pending.row.id)
            : await restoreEntity(pending.row.id);
        showToast(
          answer.message || (pending.kind === "archive" ? ARCHIVED_DONE : RESTORED),
          "success",
        );
        setPending(null);
        setAttempt((n) => n + 1);
      } catch (err) {
        setPendingError(failure(err));
      } finally {
        setPendingBusy(false);
      }
    }, [pending, showToast]),
  };
}
