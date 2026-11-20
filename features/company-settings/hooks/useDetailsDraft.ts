"use client";

/**
 * The General tab's draft: the company's name, country and currency as typed, what
 * of it CHANGED (only that is sent - Flask's rule), and whether anything did.
 *
 * It lives here rather than inside `DetailsForm` because the leave guard
 * (`lib/leaveGuard.ts`) needs both the dirty flag and a way to put the saved values back, and a
 * component cannot hand those up. The draft follows what Flask holds: when the saved values change
 * - a save, a disconnect, a reload - the draft is set to them again. That is what the form's
 * `key` used to do by remounting; the stamp below is the same one it was keyed on, so the moment
 * is unchanged, but the dirty flag can no longer be left over from a form that has gone.
 *
 * The name counts only where the viewer may rename (an admin): a disabled field is never dirty.
 * An emptied name is still a change (the leave guard must hold it), but `nameMissing` stops the
 * form sending it: Flask refuses an empty name.
 *
 * What is typed is also kept as a browser draft (`settings.details`, `@minty/shared/drafts`; the
 * owner's decisions doc L1): 2 s after the last change, offered when the page opens again
 * (`offer`, Restore / Discard), stale - shown, never put back - once the saved values changed. A
 * save that went through (`clearDraft`) and "Discard changes" (`reset`) remove it.
 */

import { useState } from "react";

import { fingerprint, useAutoSaveDraft, type DraftOffer } from "@minty/shared/drafts";

import { useDraftScope } from "@/lib/draftScope";

import type { IntegrationPage } from "@/features/company-settings/api/companySettings";

export type DetailsChanges = { name?: string; country_code?: string; currency_id?: string };

export type DetailsDraft = {
  name: string;
  country: string;
  currency: string;
  setName: (value: string) => void;
  setCountry: (value: string) => void;
  setCurrency: (value: string) => void;
  /** Only what differs from the saved values - the body of the PATCH. */
  changes: DetailsChanges;
  dirty: boolean;
  /** The viewer may rename and the name is blank - nothing may be sent until one is typed. */
  nameMissing: boolean;
  /** "Discard changes": the saved values back, and the browser draft gone. */
  reset: () => void;
  /** A browser draft from an earlier visit, waiting for Restore or Discard. */
  offer: DraftOffer<DetailsFields> | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** After a save that went through. */
  clearDraft: () => void;
};

export type DetailsFields = { name: string; country: string; currency: string };
type Fields = DetailsFields;

const savedFields = (page: IntegrationPage | null): Fields => ({
  name: page?.company.name ?? "",
  country: page?.company.country_code ?? "",
  currency: page?.company.currency_id ?? "",
});

export function useDetailsDraft(page: IntegrationPage | null): DetailsDraft {
  const saved = savedFields(page);
  const stamp = `${saved.name}|${saved.country}|${saved.currency}`;

  const [draft, setDraft] = useState<Fields>(saved);
  const [seen, setSeen] = useState(stamp);

  // What Flask holds has changed: the draft is it again (React's "adjust state on prop change" -
  // no effect, so no render with the old values in it).
  if (seen !== stamp) {
    setSeen(stamp);
    setDraft(saved);
  }
  const fields = seen === stamp ? draft : saved;

  const changes: DetailsChanges = {};
  if (page?.can_rename && fields.name.trim() !== saved.name) changes.name = fields.name.trim();
  if (fields.country && fields.country !== saved.country) changes.country_code = fields.country;
  if (fields.currency && fields.currency !== saved.currency) changes.currency_id = fields.currency;
  const dirty = Object.keys(changes).length > 0;

  const scope = useDraftScope(page?.company.id);
  const auto = useAutoSaveDraft<Fields>({
    scope,
    form: "settings.details",
    record: "-",
    shape: 1,
    ready: Boolean(page?.can_edit),
    basedOn: fingerprint(saved),
    value: fields,
    dirty: Boolean(page?.can_edit) && dirty,
  });

  return {
    name: fields.name,
    country: fields.country,
    currency: fields.currency,
    setName: (value) => setDraft((was) => ({ ...was, name: value })),
    setCountry: (value) => setDraft((was) => ({ ...was, country: value })),
    setCurrency: (value) => setDraft((was) => ({ ...was, currency: value })),
    changes,
    dirty,
    nameMissing: Boolean(page?.can_rename) && !fields.name.trim(),
    reset: () => {
      auto.clear();
      setDraft(savedFields(page));
    },
    offer: auto.offer,
    restoreDraft: () => {
      const kept = auto.restore()?.value;
      if (!kept) return;
      // a value no longer on its list stays as saved
      const country = page?.countries.some((c) => c.code === kept.country);
      const currency = page?.currencies.some((c) => c.id === kept.currency);
      setDraft({
        name: page?.can_rename && typeof kept.name === "string" ? kept.name : saved.name,
        country: country ? kept.country : saved.country,
        currency: currency ? kept.currency : saved.currency,
      });
    },
    discardDraft: auto.discard,
    clearDraft: auto.clear,
  };
}
