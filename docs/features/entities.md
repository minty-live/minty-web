# The entity list — "Select Company" (`features/entities`)

`/entities` — where a person picks a company, and the hub's first page (`/` and a landing with
no `next` go here). It replaced Minty's Jinja `/entity` on 2026-09-29, as Part 3 step 4's first
piece, pulled forward at the user's word. The contents are Flask's page, moved as they were (Figma
02, `43YI3MYtTfX5Xzz6dRoRuT` 1410:2898, draws the side menu over a screenshot of it); the frame
is the whole screen (the layout, below).

## How a person gets here

- **From Minty.** Flask's `GET /entity` (the page every login lands on, and the target of
  seventy-odd redirects) mints an unscoped token and sends the browser to
  `/landing?next=/entities` — whether or not the person owes a Terms acceptance: this app's
  Terms gate takes it (`authentication.md`), and since 2026-10-12 the document it shows is this
  app's too ([legal.md](legal.md)). Always, since phase 2 (2026-10-05): the
  `MINTY_WEB_HUB` switch and Flask's own list are gone.
- **From this app.** The side menu's _Select Entity_, the portal overview's _Back to the entity
  dashboard_ when no company is in the cookie, the empty Manage Subscriptions list and `mintyEntryUrl`'s fallback all
  lead here (`HUB_PATHS.entities`).
- **A token minted inside a company** (the menu's Select Entity from a company page) is traded
  first for an unscoped one through Flask's re-handoff: a person choosing a company is in none,
  and every page after this one must stop describing the company just left.

## The layout (the user's calls, 2026-09-29)

Flask drew the list as a phone-shaped card fixed in the middle of the screen. Here:

- **The header bar spans the screen** (`components/ui/AppHeader`, `showLogo` + `centerTitle`):
  the Minty mark at the left, "Select Company" in the middle, the initials and the ≡ at the
  right. It stays put.
- **Under it, Flask's column in the middle** — its widths (640 px from 640, 768 from 1024, 1024
  from 1200; the whole width on a phone), its 24 px padding and its spacing: the doors in
  Flask's box (at least 160 px tall, 120 from 640 — taller than the picture, which is what leaves
  65 px above the search box, 76 on a phone), the search box, then the rows 24 px under it.
- **The screen scrolls as one** under the header, so the scrollbar is the screen's own right
  edge; **the search box stays** at the top while the rows scroll under it; the "+" is held to
  the screen's bottom-right corner, left out on the empty page, whose own _Create Entity_ says it.
  From 2026-11-05 to 2026-11-11 the "+" was "Create company" in the Minty cat's pop-up; the owner
  brought the button back (the cat, tucked to a tab by default since `@minty/shared` v0.18, no
  longer offers it).

Tried and dropped the same day: a grid of cards, then the rows in a 70% column — the user asked
for Flask's widths and spacing instead.

## What it shows, and where it comes from

One read: Flask's `GET /api/me/entities` (`blueprints/entity/routes/me_api.py`), the SAME
builder the Jinja list draws from (`services/entity_list.build_entity_list`); a superuser sees
every company. Flask sends them onboarding first, then most recently opened; minty-web re-sorts
(`lib/entityRows.sortRows`, user's choice 2026-10-05): "Setup in progress" first, then A→Z by
name (case-insensitive, "Scenario 2" before "Scenario 10"). Flask's own Jinja list keeps its order. Per card (`components/EntityCard`):
the "Setup in progress" pill, the name, the free-trial badge (the design's own tag, named
"Free trial: <modules>"), one badge per module that is on, the Xero badge for a `connected`
company (the Xero mark; on hover the organisation's name alone, `xero_org_name` - "Connected to Xero"
only when none was sent - and "Xero: <name>" to a screen reader; 2026-11-16, since two companies may share a name; a disconnected company
keeps its organisation but gets none), the last-opened clock ("9 Jun 5:42
PM" in the viewer's zone, "By <name>" on hover, grey "Not opened yet" when nobody has) and the
chevron. **The card's layout (owner, 2026-11-16):** one row - name, then the badges, clock and chevron -
while the whole name fits beside them, at any width. A name too long for that is never cut short:
it goes lower left (wrapping if it must), the badges and clock top right, the chevron lower right.
CSS alone (the row wraps in reverse, so the badges are what moves, and they move up). Search is Flask's: case-insensitive, anywhere in the name. The "+" and the empty
state's _Create Entity_ go to Minty's `/entity/create` (the onboarding wizard).

**A card leads into its company** through Minty's `/entity/<id>/enter?next=/entity/<id>/modules`
(`lib/mintyEntry.ts::mintyEnterCompanyUrl`): `/enter` goes on with the accounts-api session (or
signs the person in first - no token in the address since gap 4, 2026-11-09), and the module selector checks the membership, records the visit on the clock and picks
the module (or resumes the wizard for a company still in onboarding).

## AI allowances (2026-11-18, a list mode since 2026-11-19)

**AI allowances is a mode of this list, like Archive, for superusers only** (owner, 2026-11-19: no
page of its own; every superuser may give grants). Beside **Archive companies** under the search, a
superuser gets **AI allowances** (`aria-pressed`); one mode at a time, its button reading **Done**.
It asks minty-accounts-api for exactly the companies listed and not archived
(`GET /api/me/ai/companies?ids=...`, at most 500) and turns each row into that company's AI
allowance (`AiCard` in `components/EntityCard.tsx`): the name and its badges (as browsing), a
**Used up** pill when it can't read, "75% left · 5,000 of 20,000 tokens used", its reads and last read ("No reads yet · gets the
default grant on its first read" for a company never given anything), its "Setup in progress" pill
while onboarding, and **Manage** - a 44px icon button (`tune`, named "Manage the AI allowance of
<name>", tooltip "Manage AI allowance"; not a link into the company while the mode is on). An archived company
keeps its archived row.

**Manage** opens the company (`components/AiGrantDialog.tsx`, the app's form dialog: full width on
a phone, 640px from tablet): what is left, its grants newest first (Default grant / Grant, an Open /
Used up / Ended pill, used of given, who gave it and when, its end date and note), the **Give a
grant** form and its reads, the 5 newest first, with **Show more reads** (owner, 2026-11-19): a
press shows the rest of the 20 the company's answer brought, then each press asks `GET
/api/me/ai/companies/<id>/reads?before=` for 20 older ones, until none are left - focus moves to
the first read it showed. The form - Tokens, Reads (optional), Ends after days
(optional), Note (optional) - checks each field as it is typed (tokens 1-10,000,000, reads
1-10,000, days 1-3,650, note 255; commas allowed); "The grant gives nothing yet. Add tokens, reads
or both to continue." only on a refused submit; one problem moves focus to its field, two or more
show the error summary. `POST /api/me/ai/companies/<id>/grants` checks again (422 per field). A
given grant shows at once in the dialog and on the row, with a toast. The models, the default grant
and the extra caps are not here (owner: grants only). API: minty-accounts-api's
`docs/features/ai-allowances.md`. Code: `api/aiAllowances.ts`, `lib/aiGrant.ts`, the hook's
`aiMode`. Tests: `__tests__/EntityListAi.test.tsx`, `__tests__/aiGrant.test.ts`,
`e2e/12_ai_allowances.spec.ts` (360, 768, 1440).

## Archived companies (2026-11-10)

**Archive is on this list, in its manage mode, for superusers only** (owner, 2026-11-10 - not in
Settings, not for a company's admins, and not on the browsing rows, where a phone needs the whole
width for the name). Under the search, a superuser (`is_superuser` on the answer) gets **Archive
companies** (`aria-pressed`); it turns the list into manage mode: every row is its name and its
badges (`CompanyBadges`, the browsing row's - trial, modules, Xero, last opened; owner, 2026-11-19),
not a link, with its "Setup in progress" pill while onboarding, and each company not archived yet
(`canArchive`) offers **Archive** - a 44px icon button (`archive`, named "Archive company <name>",
its tooltip "Archive company"; owner, 2026-11-19). **Done** leaves it, and
it also ends once no listed company is left to archive. Archive asks first (`ConfirmDialog`, red,
"Archive <name>?" / "It disappears for everyone. Only Minty support can bring it back."), then
`POST /api/me/entities/<id>/archive`, a toast with the API's sentence and a fresh read. A refusal -
409 while the company still has a paid subscription - stays in the dialog. Everyone else, admins
included, never sees the button.

An archived company still in onboarding shows **Setup in progress** beside its **Archived** pill
(owner, 2026-11-19).

An archived company (`entities.archived_at` set) is left out of everyone's list by
minty-accounts-api. **A superuser is still sent them**, with `is_superuser: true` on the answer and
`archived_at` on each row:

- an **All / Active / Archived** switch above the search (`ArchivedFilterSwitch`, three equal 44 px
  segments on every width, `aria-pressed`), asked of the API as `?archived=active|archived`
  (nothing for All, the API's own default). Archived with none is "No companies found.", never
  the empty "No Entity Found" page;
- archived rows sort last, carry a Neutral **Archived** pill and are not links - an archived
  company never opens until it is restored;
- **Restore** on each archived row asks first (`ConfirmDialog`, "Restore <name>?" / "It comes back
  for everyone who belongs to it."), then `POST /api/me/entities/<id>/restore`, a toast with the
  API's sentence and a fresh read. A refusal stays in the dialog.

## What Flask flashed on the way

Seventy-odd Flask routes `flash()` a message and redirect to `/entity` ("I looked everywhere but
couldn't find that one", "you don't have permission to look there"). minty-web cannot read
Flask's session, so the redirect drains the flashes, signs them (`itsdangerous`, salt
`hub-flash`) into `/entities?flash=…`, and the API verifies them and answers `notices`. Each is a
toast, once; the spent `flash` leaves the URL. Forged or older than five minutes, it says
nothing (and Flask logs it).

Only flashes meant for this hop arrive. Flask drops the queue, and logs it, on any redirect into
another app (onboarding, minty-web, the payments app), because those apps never show it. Before
2026-10-02 onboarding's Xero connect flashed on every attempt. Finishing the wizard (→ `/entity`)
then opened this list under a stack of stale "Connected to Xero!" / "Connection failed" toasts.

## A company's module choice (`/entity/<shortid>/<name>`, phase 2 - 2026-10-05)

The address is SINGULAR, and so is everything under it (the settings tabs): it names ONE company.
It was the plural `/entities/<shortid>/<name>/…` until 2026-10-07 - `proxy.ts` 307s the old
form, so the links already out there still land. The plural `/entities` is the LIST alone, and
nothing lives below it (`HUB_PATHS.company` vs `HUB_PATHS.entities`, `lib/hubPaths.ts`).

Clicking a row goes through Minty's `/entity/<id>/enter` to its router, `/entity/<co>/modules`
(Minty `routes/modules.py::module_selector`): a company still onboarding resumes its wizard, one
module switched on goes straight into it, and **two come back here**, to "Choose Module Type"
(`features/entities/routes/ModuleChoiceScreen.tsx`) with a token scoped to the company. It was
minty-payment-request-web's `/module-selection` until 2026-10-05 and looks as it did: the mark,
the company, two doors (`components/ModuleChoiceButton.tsx`, Minty peeking out on hover). The
doors are the DATABASE's modules - the list's row, `GET /api/me/entities` - never the token's
claims; each enters its module through Minty's `/enter` (`lib/moduleChoice.ts`): on to
`/handoff/petty-cash-web` (minty-petty-cash-web's dashboard, Step 5) or
`/entity/<id>/payment-request`, each minting its app's token. Opened some
other way (a bookmark), one module goes straight in and none says so with the way to the
Module tab; a failed read says so, logs it and offers Try again. The company comes from the
address (`components/ui/CompanyFromAddress`), a wrong name corrected in place. Header: Back
(where the person came from, else the list), the initials and the menu. The browser tab reads
"Choose Module Type - <company>" (`lib/companyTitle.ts`, as for the settings tabs -
`docs/features/company-settings.md`).

## The header and the sidebar

On the right of the bar, the person's initials (`components/ui/ViewerBadge`) and the ≡
(`components/ui/NavMenu`). Both open **the sidebar** (`components/ui/Sidebar.tsx`, the user's
call 2026-09-29: one sidebar, two views, over the page — nothing navigates):

- the initials open it on **My Profile** (`profile.md`) — their name still shows on hover. This
  reverses the morning's rule that the badge was not a button;
- the ≡ opens it on **the menu** (`components/ui/SideMenu.tsx`, the Figma 02 design on every
  page): the Minty mark; the person (avatar + name), which switches to My Profile; Select Entity;
  Manage subscriptions (only while subscriptions are on); inside a company only, its Petty Cash
  and Payment Request sections; the cat (Flask's `sidepanel_cat`), above the last group;
  Settings (inside a company only — never on this list) and Logout.

The initials and name come from Flask's `GET /api/me/profile`, read once per token
(`lib/viewer.ts`); the read is decoration, so a failure leaves the badge empty and never moves
the page.

## Tests

Module choice: `features/entities/__tests__/ModuleChoiceScreen.test.tsx` (the doors, one
module straight in, none, a failed read) and `features/entities/e2e/11_module_choice.spec.ts`
(the doors' addresses, a corrected name, one module, 360 / 768 / 1440); Flask's router:
Minty's `tests/test_module_selector.py`.

`features/entities/__tests__/` (the rules, the screen with its states and notices, the
re-export guard), `components/ui/__tests__/{NavMenu,Sidebar}.test.tsx`,
`lib/__tests__/{viewer,mintyFetch}`, Playwright `features/entities/e2e/07_entity_list.spec.ts`
(stubbed Flask; the layout is measured - Flask's widths, the 65 / 24 px, the search box that
stays). Flask's side: Minty's `tests/test_hub_entity_list.py`. Archived companies: the manage-mode, Archive and superuser cases in
`EntityListScreen.test.tsx` and `entityRows.test.ts`, and 07's manage-mode archive and superuser specs
(360 / 768 / 1440, 44 px targets, asked first); the API side is minty-accounts-api's.
