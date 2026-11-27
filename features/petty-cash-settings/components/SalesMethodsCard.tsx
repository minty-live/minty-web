"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useId, useRef, useState } from "react";

import { SETTINGS_OUTLINE } from "@/components/ui/settingsButtons";
import { SETTINGS_FIELD_ERROR } from "@/components/ui/settingsFields";

import {
  Combo,
  Icon,
  PettyCashCard,
  inputClass,
  type ComboRow,
} from "@/features/petty-cash-settings/components/parts";
import {
  ADD_NAME_MAX,
  KIND,
  NAME_EMPTY,
  RENAME_NAME_MAX,
  catalogueOptions,
  kindFor,
  methodNameProblem,
  type CatalogueMethod,
  type MethodType,
  type SalesGroups,
  type SalesMethod,
  type SettingsPermissions,
} from "@/features/petty-cash-settings/lib/settings";

const OTHER = "__other__";
/** The picker's note, shown on top as the list opens (owner, 2026-11-12; the contact pickers' way). */
export const METHOD_HINT = "Type a method name to add a new method";

/** What the list does with a change. The fallback cards' actions send it to the API (each resolves
 * true once the API said yes; a removal asks first); the sales accounts card's are HELD (2026-11-20):
 * they change its own lists, x needs no question of its own, and nothing is sent until its Save
 * changes. */
export type MethodActions = {
  add: (type: MethodType, body: { sale_info_id: string } | { name: string }) => Promise<boolean>;
  rename: (method: SalesMethod, name: string) => Promise<boolean>;
  move: (type: MethodType, index: number, step: -1 | 1) => void;
  /** A dragged method dropped on the row at `to`. */
  place: (type: MethodType, from: number, to: number) => void;
  remove: (type: MethodType, method: SalesMethod) => void;
  /** The error toast. */
  say: (message: string) => void;
};

type ListProps = {
  type: MethodType;
  methods: SalesMethod[];
  available: CatalogueMethod[];
  permissions: SettingsPermissions;
  busy: boolean;
  actions: MethodActions;
  /** The API's `sales_groups`: a Non-cash company's electronic list is titled Non-cash. */
  groups?: SalesGroups;
};

/**
 * One of the Electronic / Delivery cards, for an API that does not send the sales accounts yet: the
 * methods (`SalesMethodsList`) in a card of their own, as before 2026-11-17.
 */
export function SalesMethodsCard(props: ListProps) {
  const kind = kindFor(props.type, props.groups);
  const p = props.permissions;
  const editable =
    p.add_sales_method || p.rename_sales_method || p.remove_sales_method || p.reorder_sales_methods;
  return (
    <PettyCashCard title={kind.title} lead={kind.sub} readOnly={!editable} testId={props.type}>
      <SalesMethodsList {...props} />
    </PettyCashCard>
  );
}

/**
 * A sales account's methods (owner, 2026-11-17; Figma 529:675): chips in order - drag one, or press
 * the arrow keys on it, to reorder; x takes it off (the company's own is deleted, Minty's only leaves
 * the list - owner, 2026-11-12); the company's own has a pencil for an inline rename - and the add
 * field always there under them: the catalogue picker, or a new name typed into it, then + Add. What
 * a change does is `actions`': inside the sales accounts card it is held there until Save changes
 * (its `available` then leaves out what the card holds); in a fallback card it is the API's at
 * once. `region` names the block (inside an account card) by its title.
 */
export function SalesMethodsList({
  type,
  methods,
  available,
  permissions,
  busy,
  actions,
  groups,
  region = false,
}: ListProps & { region?: boolean }) {
  const kind = kindFor(type, groups);
  const canMove = permissions.reorder_sales_methods && methods.length > 1;
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ---- dragging by the grip (onboarding's MethodList, 2026-11-26: pointer events, so a finger,
  // a mouse and a pen all reorder). The drag lives in a ref too, so the handlers never read a
  // stale render; the rows' bottoms are measured when it starts, as the moving row's own box lies.
  type Drag = { from: number; startY: number; dy: number; bottoms: number[] };
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  /** The row under the pointer: the first whose bottom is below it, or the last. */
  const indexAt = (bottoms: number[], y: number) => {
    const i = bottoms.findIndex((bottom) => y < bottom);
    return i === -1 ? bottoms.length - 1 : i;
  };
  const endDrag = () => {
    setDragBoth(null);
    setOverIdx(null);
  };
  // Escape drops a drag where it began, wherever the focus is.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragRef.current = null;
        setDrag(null);
        setOverIdx(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);
  const dragHandlers = (index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || e.button !== 0) return; // a right-click opens its menu, not a drag
      e.preventDefault(); // no text selection while dragging
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const bottoms = Array.from(listRef.current?.children ?? []).map(
        (row) => row.getBoundingClientRect().bottom,
      );
      setDragBoth({ from: index, startY: e.clientY, dy: 0, bottoms });
      setOverIdx(index);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      setDragBoth({ ...d, dy: e.clientY - d.startY });
      setOverIdx(indexAt(d.bottoms, e.clientY));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      endDrag();
      const to = indexAt(d.bottoms, e.clientY);
      if (to !== d.from) actions.place(type, d.from, to);
    },
    onPointerCancel: endDrag,
    onLostPointerCapture: () => {
      if (dragRef.current) endDrag();
    },
  });

  let note: string | null = null;
  if (!permissions.view_sales_methods)
    note = "You can't see the sales methods. Ask an Accountant or an Admin.";
  else if (!methods.length) note = `No ${kind.title.toLowerCase()} methods yet.`;

  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      {region ? (
        <p className="text-[13px] font-semibold text-set-mute">
          {kind.title} methods{canMove ? " · drag a row to reorder" : ""}
        </p>
      ) : null}
      {note ? (
        <p className="text-sm text-set-mute" role="status">
          {note}
        </p>
      ) : null}
      {/* The methods as full-width rows (the user, 2026-11-27: as onboarding's, rows instead of
          chips): the grip, the name, the pencil and the bin. */}
      {methods.length ? (
        <ul
          ref={listRef}
          className="m-0 flex min-w-0 list-none flex-col border-t border-set-line p-0"
          aria-label={`${kind.title} methods`}
        >
          {methods.map((method, index) => {
            const lifted = drag?.from === index;
            return (
              <li
                key={method.id}
                data-method={method.name}
                style={lifted ? { transform: `translateY(${drag.dy}px)` } : undefined}
                className={`relative flex min-h-11 min-w-0 items-center gap-1 border-b border-set-line py-1 last:border-b-0 ${
                  lifted
                    ? "z-10 rounded-[10px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
                    : overIdx === index && drag
                      ? "rounded-[10px] bg-set-pill"
                      : ""
                }`}
              >
                {renaming === method.id ? (
                  <RenameBox
                    method={method}
                    listed={methods}
                    onDone={() => setRenaming(null)}
                    onCommit={(name) => actions.rename(method, name)}
                  />
                ) : (
                  <>
                    {canMove ? (
                      <RowHandle
                        label={`Move ${method.name}`}
                        disabled={busy}
                        onStep={(step) => actions.move(type, index, step)}
                        {...dragHandlers(index)}
                      />
                    ) : null}
                    <span
                      className={`min-w-0 flex-1 py-2 text-[15px] break-words text-set-ink ${canMove ? "" : "pl-1"}`}
                    >
                      {method.name}
                    </span>
                    {method.own && permissions.rename_sales_method ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRenaming(method.id)}
                        aria-label={`Edit ${method.name}`}
                        title="Edit"
                        className={ROW_BUTTON}
                      >
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                    ) : null}
                    {permissions.remove_sales_method ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => actions.remove(type, method)}
                        aria-label={
                          method.own
                            ? `Delete ${method.name}`
                            : `Remove ${method.name} from my list`
                        }
                        title={method.own ? "Delete" : "Remove from my list"}
                        className={`${ROW_BUTTON} enabled:hover:bg-set-warn-bg enabled:hover:text-set-danger-ink`}
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {permissions.add_sales_method ? (
        <AddRow type={type} methods={methods} available={available} busy={busy} actions={actions} />
      ) : null}
    </div>
  );
  return region ? (
    <section aria-label={kind.title} data-methods={type} className="min-w-0">
      {body}
    </section>
  ) : (
    body
  );
}

const ROW_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-set-mute transition-colors enabled:hover:bg-set-pill enabled:hover:text-set-ink disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/** The rename: the name becomes a box; Enter or leaving saves, Escape puts it back. */
function RenameBox({
  method,
  listed,
  onDone,
  onCommit,
}: {
  method: SalesMethod;
  listed: SalesMethod[];
  onDone: () => void;
  onCommit: (name: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(method.name);
  const box = useRef<HTMLInputElement>(null);
  const problemId = useId();
  const problem = methodNameProblem(text, listed, RENAME_NAME_MAX, method.id);
  // a ref: Enter then the blur it causes must send once
  const done = useRef(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  async function finish(commit: boolean) {
    if (done.current) return;
    const next = text.trim();
    // nothing typed, or the same name: put it back, as Flask did
    if (!commit || !next || next === method.name) {
      done.current = true;
      onDone();
      return;
    }
    if (problem) return; // said under the box; the box stays
    done.current = true;
    await onCommit(next);
    onDone();
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col py-1.5">
      <input
        ref={box}
        type="text"
        value={text}
        aria-label={`Rename ${method.name}`}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            void finish(false);
          }
        }}
        onBlur={() => void finish(true)}
        className={`${inputClass(Boolean(problem))} max-w-80`}
      />
      {problem ? (
        <p id={problemId} className={SETTINGS_FIELD_ERROR}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** A row's grip (onboarding's, 2026-11-26): drag it - with a finger, a mouse or a pen - to reorder;
 * with the keyboard, the arrow keys move the method one place. */
function RowHandle({
  label,
  disabled,
  onStep,
  ...pointer
}: {
  label: string;
  disabled: boolean;
  onStep: (step: -1 | 1) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to reorder, or use the arrow keys"
      {...pointer}
      onKeyDown={(e) => {
        const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const on = e.key === "ArrowDown" || e.key === "ArrowRight";
        if (disabled || (!back && !on)) return;
        e.preventDefault();
        onStep(back ? -1 : 1);
      }}
      className="inline-flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] text-set-mute hover:bg-set-pill hover:text-set-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus active:cursor-grabbing"
    >
      <Icon name="drag_indicator" className="text-[20px]" />
    </button>
  );
}

/** The add field under the rows (the user, 2026-11-27: as onboarding's): type a name and + Add (or
 * Enter) adds it - Minty's method of that name when the catalogue has one, else a new one - and
 * picking a row from the list adds it at once, "+ Add '<name>' as a new method" included. No
 * second Name box. A name already on the list or too long says so under the field as it is typed;
 * Add with nothing typed says the name is still empty. The field empties and keeps the focus for
 * the next one. */
function AddRow({
  type,
  methods,
  available,
  busy,
  actions,
}: {
  type: MethodType;
  methods: SalesMethod[];
  available: CatalogueMethod[];
  busy: boolean;
  actions: MethodActions;
}) {
  const kind = KIND[type];
  const catalogId = useId();
  const problemId = useId();
  const [text, setText] = useState("");
  const [refusedEmpty, setRefusedEmpty] = useState(false);
  const typed = text.trim();
  const problem =
    methodNameProblem(typed, methods, ADD_NAME_MAX) ?? (refusedEmpty && !typed ? NAME_EMPTY : null);

  function focusField() {
    (document.getElementById(catalogId) as HTMLInputElement | null)?.focus();
  }

  function rows(query: string): ComboRow[] {
    const q = query.trim();
    const offered = catalogueOptions(available, query);
    const out: ComboRow[] = [];
    // the note on top as soon as the list opens, as every contact picker has it
    if (!q) out.push({ key: "hint", label: METHOD_HINT, info: true });
    out.push(...offered.map((m) => ({ key: m.id, label: m.name })));
    const known = (n: string) => n.trim().toLowerCase() === q.toLowerCase();
    if (q && !available.some((m) => known(m.name)) && !methods.some((m) => known(m.name)))
      out.push({ key: OTHER, label: `+ Add '${q}' as a new method` });
    if (q && !offered.length)
      out.push({ key: "none", label: `No matching ${kind.noun} found`, info: true });
    return out;
  }

  async function add(body: { sale_info_id: string } | { name: string }) {
    if (await actions.add(type, body)) {
      setText("");
      setRefusedEmpty(false);
    }
    focusField();
  }

  /** + Add or Enter: the typed name - Minty's method of that name, or a new one. */
  function commit() {
    if (busy) return;
    if (!typed) {
      setRefusedEmpty(true);
      focusField();
      return;
    }
    if (problem) {
      focusField();
      return;
    }
    const folded = typed.toLowerCase();
    const minty = available.find((m) => m.name.trim().toLowerCase() === folded);
    void add(minty ? { sale_info_id: minty.id } : { name: typed });
  }

  return (
    <form
      className="flex flex-col gap-1"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <label className="sr-only" htmlFor={catalogId}>
            Method
          </label>
          <Combo
            id={catalogId}
            value={text}
            placeholder={kind.pick}
            rows={rows}
            rotateChevron
            invalid={Boolean(problem)}
            describedBy={problem ? problemId : undefined}
            onText={(t) => {
              setText(t);
              setRefusedEmpty(false);
            }}
            onPick={(key) => {
              if (busy) return;
              if (key === OTHER) {
                commit();
                return;
              }
              const picked = available.find((m) => m.id === key);
              if (picked) void add({ sale_info_id: picked.id });
            }}
            onBlur={() => {}}
          />
        </div>
        <button type="submit" disabled={busy} className={`${SETTINGS_OUTLINE} shrink-0`}>
          <Icon name="add" className="text-[20px]" />
          Add
        </button>
      </div>
      {problem ? (
        <p id={problemId} className={SETTINGS_FIELD_ERROR}>
          {problem}
        </p>
      ) : null}
    </form>
  );
}
