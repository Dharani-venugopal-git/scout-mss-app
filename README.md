# Scout MSS Weekly Report — shared web app

This turns the single-file dashboard into a **shared** web app: everyone opens one
link, types a team passcode once, and edits the **same** board. No Microsoft sign-in,
no IT app-registration. The shared data lives in Cloudflare's own storage.

## What's in this folder

- `public/index.html` — the dashboard itself (same tool you already have, with the
  section-sort fix and shared-storage built in).
- `src/index.js` — a tiny Cloudflare "Worker" that serves the dashboard and provides
  the shared-storage API.
- `wrangler.toml` — the settings file. You edit exactly one line in it (a KV id).

## Good to know before you start

- **The file already works on its own.** Double-click `public/index.html` and it opens
  and runs on your computer, exactly as before (its data stays on that computer). The
  Cloudflare steps below are only to make it **shared** across the team.
- **Shared mode needs a one-time setup by someone comfortable running one command.**
  Cloudflare's drag-and-drop upload can only host a *static* page — and a static page
  can't share data. To get the shared storage, the setup below runs a single command
  (`wrangler deploy`). It takes ~10 minutes, once. After that, nobody touches a terminal
  again — the team just uses the link.
- **Passcode = a light gate, not full security.** Anyone with the link **and** the
  passcode can read and edit. Store only status info (RAG, updates, next steps) here.
- **The data lives on Cloudflare**, under whatever Cloudflare account you create — outside
  Scout's Microsoft tenant. If Scout requires the data to stay inside its own systems,
  use the SharePoint route instead (that one needs IT). Prefer an **Accenture-owned**
  Cloudflare account, not a personal one.

---

## Setup (recommended: one command)

You need a free Cloudflare account and Node.js installed. If you don't have Node:
https://nodejs.org (pick the "LTS" version, install with all defaults).

**1. Open a terminal in this folder.**
- Windows: open this folder in File Explorer, click the address bar, type `cmd`, press Enter.
- Mac: right-click the folder → Services → "New Terminal at Folder".

**2. Sign in to Cloudflare** (opens your browser once to approve):
```
npx wrangler login
```

**3. Create the shared storage** (a "KV namespace"):
```
npx wrangler kv namespace create MSS_KV
```
This prints a block that includes an `id = "…"`. Copy that id.
Open `wrangler.toml`, and replace `PASTE_YOUR_KV_NAMESPACE_ID_HERE` with it (keep the quotes).

**4. Set the team passcode** (choose any passcode; you'll share it with the team):
```
npx wrangler secret put TEAM_PASSCODE
```
It asks you to type the passcode, then press Enter. (Nothing shows as you type — that's normal.)

**5. Publish it:**
```
npx wrangler deploy
```
When it finishes it prints your live link, like:
`https://scout-mss-dashboard.<your-name>.workers.dev`

**Done.** Open that link, type the passcode, and you'll see the shared board. Send the
link + passcode to the team. Everyone edits the same data; Dave opens the same link and
presents (▶ Present, or export the PPT).

### To change the passcode later
Run step 4 again with a new value, then step 5 (`npx wrangler deploy`). Or change it in
the Cloudflare dashboard: **Workers & Pages → your Worker → Settings → Variables & Secrets**.

### To push a new version of the dashboard later
Replace `public/index.html` with the new file and run step 5 again. The shared data is
untouched.

---

## How sharing behaves

- Everyone opens the same link, types the passcode once, and lands on the **same board**
  (the current reporting week). Edits **auto-save** — there is no Save button.
- **Safe for concurrent editing.** Each workstream ("track") and each board field is saved
  as its own record, so two leads editing *different* workstreams never overwrite each other
  — exactly the "everyone updates their own columns on Monday" case.
- The board **auto-refreshes** every few seconds so other people's updates appear on their
  own (it never interrupts a field you're actively editing). A "● Shared" chip sits
  bottom-right; tap it to pull the very latest immediately.
- The only overlap left is two people editing the *same* field of the *same* workstream in
  the same second — there, the last save wins. Rare when each lead owns their own track.
- The shared board is the **current** reporting week. Archived/past weeks stay on your own
  computer, and history is preserved via the PowerPoint export as before.

---

## No-terminal alternative (two pieces, all in the dashboard)

If nobody can run the command above, you can do it entirely point-and-click, but it's a
bit more fiddly because it's two separate pieces:

1. **Host the page:** in the Cloudflare dashboard, create a **Pages** project and
   drag-and-drop the `public` folder. You get a link like `…pages.dev`.
2. **Add the API:** create a **Worker** in the dashboard editor, paste the contents of
   `src/index.js`, and in that Worker's **Settings → Bindings** add a **KV namespace**
   bound as `MSS_KV`, and under **Variables & Secrets** add `TEAM_PASSCODE`. Deploy it.
   You get a link like `…workers.dev`.
3. **Connect the two:** open `public/index.html` in Notepad/TextEdit, find the line
   `const CF={apiBase:'',…}` and put the Worker's URL between the quotes, e.g.
   `apiBase:'https://scout-mss-api.yourname.workers.dev'`. Re-upload the `public` folder to Pages.

The single-command route above avoids all of this, which is why it's recommended.

---

*Note: this project was assembled and its logic tested offline. The Cloudflare deploy
steps follow Cloudflare's current documented flow, but the live deployment hasn't been
run end-to-end here — if any screen looks different or a step errors, send a screenshot
and it can be sorted quickly.*
