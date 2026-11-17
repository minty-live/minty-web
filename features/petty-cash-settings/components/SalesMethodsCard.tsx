"use client";

import { type DragEvent, useEffect, useId, useRef, useState } from "react";

import { SETTINGS_OUTLINE } from "@/components/ui/settingsButtons";
import { SETTINGS_FIELD_ERROR, SETTINGS_LABEL } from "@/components/ui/settingsFields";

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

/** What the card asks the page to send; each resolves true once the API said yes. */
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
 * field always there under them: the catalogue picker, or a new name typed into it, then + Add. Each
 * change is the API's at once; the page shows its answer. `region` names the block (inside an
 * account card) by its title.
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
  // the chip being dragged and the chip it is over
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  let note: string | null = null;
  if (!permissions.view_sales_methods)
    note = "You can't see the sales methods. Ask an Accountant or an Admin.";
  else if (!methods.length) note = `No ${kind.title.toLowerCase()} methods yet.`;

  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      {region ? (
        <p className="text-[13px] font-semibold text-set-mute">
          {kind.title} methods{canMove ? " · drag a chip to reorder" : ""}
        </p>
      ) : null}
      {note ? (
        <p className="text-sm text-set-mute" role="status">
          {note}
        </p>
      ) : null}
      <ul
        className="m-0 flex min-w-0 list-none flex-wrap gap-2 p-0"
        aria-label={`${kind.title} methods`}
      >
        {methods.map((method, index) => (
          <li
            key={method.id}
            data-method={method.name}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (dragOver !== index) setDragOver(index);
            }}
            onDragLeave={() => {
              if (dragOver === index) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== index) actions.place(type, dragFrom, index);
              setDragFrom(null);
              setDragOver(null);
            }}
            className={`inline-flex min-h-11 max-w-full min-w-0 items-center rounded-[10px] border bg-set-pill transition-[border-color,opacity] ${
              dragOver === index && dragFrom !== index ? "border-set-tab-ink" : "border-set-line"
            } ${dragFrom === index ? "opacity-45" : ""}`}
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
                  <ChipHandle
                    label={`Move ${method.name}`}
                    disabled={busy}
                    onDragStart={(e) => {
                      setDragFrom(index);
                      e.dataTransfer?.setData("text/plain", method.id);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onStep={(step) => actions.move(type, index, step)}
                  >
                    {method.name}
                  </ChipHandle>
                ) : (
                  <span className="min-w-0 truncate py-2 pr-1 pl-3 text-sm text-set-ink">
                    {method.name}
                  </span>
                )}
                {method.own && permissions.rename_sales_method ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRenaming(method.id)}
                    aria-label={`Edit ${method.name}`}
                    title="Edit"
                    className={CHIP_BUTTON}
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
                      method.own ? `Delete ${method.name}` : `Remove ${method.name} from my list`
                    }
                    title={method.own ? "Delete" : "Remove from my list"}
                    className={`${CHIP_BUTTON} enabled:hover:text-[#d9534f]`}
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
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

const CHIP_BUTTON =
  "inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-[10px] text-set-mute transition-colors enabled:hover:text-set-ink disabled:cursor-not-allowed";

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

/** The chip's name is its handle (owner, 2026-11-12: no Move up / Move down): drag it to reorder;
 * with the keyboard, the arrow keys move the method one place. */
function ChipHandle({
  label,
  disabled,
  onDragStart,
  onDragEnd,
  onStep,
  children,
}: {
  label: string;
  disabled: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onStep: (step: -1 | 1) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to reorder, or use the arrow keys"
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const on = e.key === "ArrowDown" || e.key === "ArrowRight";
        if (disabled || (!back && !on)) return;
        e.preventDefault();
        onStep(back ? -1 : 1);
      }}
      className="min-h-11 min-w-0 cursor-grab truncate rounded-[10px] py-2 pr-1 pl-3 text-left text-sm text-set-ink active:cursor-grabbing"
    >
      {children}
    </button>
  );
}

type Choice = { id: string; name: string } | "other" | null;

/** The add field under the chips: the catalogue picker - or a name typed into it, "+ Add '<name>' as
 * a new method" opening the Name box with it (owner, 2026-11-12: as the contact pickers) - then
 * + Add. Always there (Figma 529:675); it empties itself after an add. */
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
  const nameId = useId();
  const nameProblemId = useId();
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<Choice>(null);
  const [name, setName] = useState("");
  const [refusedEmpty, setRefusedEmpty] = useState(false);
  const catalog = useRef<HTMLInputElement | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const nameProblem =
    methodNameProblem(name, methods, ADD_NAME_MAX) ??
    (refusedEmpty && !name.trim() ? NAME_EMPTY : null);

  useEffect(() => {
    catalog.current = document.getElementById(catalogId) as HTMLInputElement | null;
  }, [catalogId]);

  function onClose() {
    setText("");
    setChoice(null);
    setName("");
    setRefusedEmpty(false);
  }

  useEffect(() => {
    if (choice === "other") nameBox.current?.focus();
  }, [choice]);

  function rows(query: string): ComboRow[] {
    const typed = query.trim();
    const offered = catalogueOptions(available, query);
    const out: ComboRow[] = [];
    // the note on top as soon as the list opens, as every contact picker has it
    if (!typed) out.push({ key: "hint", label: METHOD_HINT, info: true });
    out.push(...offered.map((m) => ({ key: m.id, label: m.name })));
    const known = (n: string) => n.trim().toLowerCase() === typed.toLowerCase();
    if (typed && !available.some((m) => known(m.name)) && !methods.some((m) => known(m.name)))
      out.push({ key: OTHER, label: `+ Add '${typed}' as a new method` });
    if (typed && !offered.length)
      out.push({ key: "none", label: `No matching ${kind.noun} found`, info: true });
    return out;
  }

  async function commit() {
    if (busy) return;
    if (choice === "other") {
      const wanted = name.trim();
      if (!wanted) {
        setRefusedEmpty(true);
        nameBox.current?.focus();
        return;
      }
      if (nameProblem) {
        nameBox.current?.focus();
        return;
      }
      if (await actions.add(type, { name: wanted })) onClose();
      return;
    }
    if (choice) {
      if (await actions.add(type, { sale_info_id: choice.id })) onClose();
      return;
    }
    actions.say("Pick a method from the list, or type a new name to add it.");
    catalog.current?.focus();
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
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
            onText={(t) => {
              // typing filters the list; nothing is chosen until a row is picked
              setText(t);
              setChoice(null);
            }}
            onPick={(key) => {
              if (key === OTHER) {
                // the typed name goes into the Name box, to check or change before Add
                setChoice("other");
                setName(text.trim());
                setRefusedEmpty(false);
                return;
              }
              const picked = available.find((m) => m.id === key);
              if (!picked) return;
              setChoice({ id: picked.id, name: picked.name });
              setText(picked.name);
            }}
            onBlur={() => setText((t) => (choice && choice !== "other" ? choice.name : t))}
          />
        </div>
        <button type="submit" disabled={busy} className={`${SETTINGS_OUTLINE} shrink-0`}>
          <Icon name="add" className="text-[20px]" />
          Add
        </button>
      </div>
      {choice === "other" ? (
        <div className="flex min-w-0 flex-col">
          <label className={SETTINGS_LABEL} htmlFor={nameId}>
            Name
          </label>
          <input
            ref={nameBox}
            id={nameId}
            type="text"
            autoComplete="off"
            placeholder={kind.enter}
            value={name}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? nameProblemId : undefined}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass(Boolean(nameProblem))} placeholder:text-set-mute`}
          />
          {nameProblem ? (
            <p id={nameProblemId} className={SETTINGS_FIELD_ERROR}>
              {nameProblem}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
