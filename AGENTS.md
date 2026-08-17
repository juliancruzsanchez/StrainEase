# AGENTS.md — StrainEase / strain-finder

Auto-loaded context for AI coding agents (Claude Code, Cursor, Copilot,
Codex, Aider, Gemini CLI, Devin, etc.). Read this before doing anything
non-trivial in this repo.

If you're a human reading this: see `README.md` for the user-facing
conventions. This file is for machines.

## TL;DR

- **Stack:** Vite + React 19 + Tailwind v4 + shadcn/ui (frontend) +
  **Firebase end-to-end** (Auth + Firestore + Cloud Functions). There is
  no Convex, no other backend — don't add one without a real reason.
- **Package manager:** bun for the app, npm for `functions/`.
- **Local dev:** `bun run dev` from the repo root.
- **Deploy backend:** `cd functions && npm run build && firebase deploy --only functions,firestore:rules --force`
  (`--force` is required once to set the Artifact Registry cleanup
  policy; subsequent deploys don't need it). Frontend deploys through
  Cloudflare Pages (`.github/workflows/cloudflare-pages.yml`).
- Don't write innovative code, write reliable code.

## Architecture map

| Concern              | Lives in                              | Auth              |
| -------------------- | ------------------------------------- | ----------------- |
| UI / routing         | `src/pages/`, `src/components/`       | Firebase Auth via `useAuth` |
| User profile / saved strains / notes | Firebase Firestore (see `firestore.rules`) | Firebase UID |
| Strain data (read)   | `functions/src/leafly.ts` (scrape)    | None (public)     |
| AI compare / recommend | `functions/src/index.ts`            | Firebase ID token |

The frontend talks to Firebase through three surfaces:

- **`firebase/auth`** for sign-in / sign-out (`src/pages/Auth.tsx`,
  `src/hooks/use-auth.ts`).
- **`firebase/firestore`** for saved strains and notes
  (`src/components/saved/*`).
- **`firebase/functions`** via `httpsCallable` from
  `src/lib/strain-api.ts` for the AI callables.

## Frontend conventions

See `README.md` for the full list. The bits AI agents most often miss:

- Use `useAuth` from `@/hooks/use-auth` — never roll your own auth check.
- Route guards go through `<RequireAuth>` from `src/components/RequireAuth.tsx`.
- Pages live in `src/pages/`. After adding one, register the route in `src/main.tsx`.
- Shadcn primitives in `src/components/ui/` — don't rebuild them.
- Tailwind v4 with `oklch` colors, theme via `dark`/`light` parent class.
- Toasts via `sonner`: `import { toast } from "sonner"`.
- Animate with `framer-motion`. No CSS transitions for entrance/exit.
- **No shadows.** Borders only. **No nested cards.** **No skeletons** —
  use `<Loader2 />` for loading states.

## Firebase Auth conventions

- The hook is `useAuth` in `src/hooks/use-auth.ts` (uses
  `onAuthStateChanged` from `firebase/auth`).
- Sign-in UI lives in `src/pages/Auth.tsx` — email/password, Google via
  Google Identity Services (GIS) directly (not Firebase popup/redirect),
  and Apple via `OAuthProvider('apple.com')` + `signInWithPopup` in
  `src/lib/apple-auth.ts`. Don't add new providers without updating
  Firebase console too. Apple on the web also needs a Services ID, Team
  ID, Key ID, and `.p8` key in the Apple provider settings.
- Google sign-in needs `VITE_GOOGLE_CLIENT_ID` — the Web client ID from
  Firebase console → Authentication → Sign-in method → Google → Web SDK
  configuration. The implementation in `src/lib/google-auth.ts` uses
  `accounts.google.com/gsi/client` (`initTokenClient`) to get an access
  token, then exchanges it via
  `signInWithCredential(auth, GoogleAuthProvider.credential(null, accessToken))`.
  GIS's token client never returns an ID token — do not look for one.
- Auth state is shared via the hook, not a context provider — there is no
  `AuthProvider` and you should not add one.
- If Firebase isn't configured (no env vars), `useAuth` returns
  `isAuthenticated: false` and `isLoading: false`. Code that depends on
  auth must guard against this.

## Firebase Functions conventions

### Deploying functions

`firebase deploy` alone is **not** enough. Cloud Functions source is
TypeScript in `functions/src/` and must be compiled to `functions/lib/`
first:

```bash
cd functions
npm install        # one-time per machine / whenever deps change
npm run build      # tsc → lib/
cd ..
firebase deploy --only functions,firestore:rules --force
```

The CI workflow at `.github/workflows/firebase-functions-deploy.yml`
does the same `npm ci && npm run build` before deploy. Mirror it locally.

If you skip the build, you'll see:

```
Error: There was an error reading functions/package.json:
 functions/lib/index.js does not exist, can't deploy Cloud Functions
```

That's the error this section exists to prevent. **Build first, deploy second.**

### Secrets

`GROQ_API_KEY` is a Firebase Secret (not an env var). It is set with:

```bash
firebase functions:secrets:set GROQ_API_KEY
```

Then redeploy. `functions/src/index.ts` declares it via `defineSecret`
and the AI callables reference it through `AI_OPTIONS`. The deploy step
auto-grants the compute service account access on first deploy.

### Functions source layout

```
functions/
  src/
    index.ts         # callable function exports (the entry point)
    leafly.ts        # public Leafly scrape, no auth
    groq.ts          # Groq client + JSON extraction helpers
    types.ts         # shared response types
  lib/               # compiled output, gitignored, DO NOT edit
  package.json       # main: "lib/index.js", engines.node: "22"
  tsconfig.json
```

Node 20 is the runtime. It's deprecated on GCP (see deprecation warning
in deploy output) — when you upgrade, bump both `engines.node` here and
the `Setup Node.js` step in `firebase-functions-deploy.yml`.

### Adding a new callable

1. Add the export in `functions/src/index.ts`. Use `onCall` (not
   `onRequest`) for client-driven calls, and gate with `request.auth` if
   it requires sign-in.
2. Add a typed wrapper in `src/lib/strain-api.ts` (use the existing
   `callFn` helper for consistency).
3. Re-export from the same file. Don't import `firebase/functions` from
   a component.

## Firestore conventions

- Rules live in `firestore.rules`. Deploy them together with functions:
  `firebase deploy --only functions,firestore:rules`.
- Data shape is small today: `users/{uid}` and `users/{uid}/savedStrains/{strainId}`.
  See the rules file for the current shape; if you add a collection,
  add the rule.
- Security review changes go through the `firebase-security-rules-auditor` skill.
- Client reads/writes go through `src/lib/firebase.ts` (`db` export).
  Don't initialize Firestore anywhere else.

## Things agents should NOT do

- Do not edit anything in `functions/lib/` (compiled, gitignored).
- Do not introduce a new backend (Convex, Supabase, a custom Node API,
  etc.). The whole point of the Firebase-only stack is one auth + one DB.
- Do not add a shadow class or nest `<Card>` inside another `<Card>`.
- Do not run `npm run build` from the repo root expecting it to build
  functions — the root `package.json` only builds the frontend.
- Do not add new env vars without documenting them in `README.md` and
  adding them to the Cloudflare Pages deploy workflow
  (`.github/workflows/cloudflare-pages.yml`).

## Working style for this codebase

- Vibe-coding friendly, but stay inside the conventions above. The
  README is a contract; if a request would break a "AVOID…" rule, push
  back once before doing it.
- Use bun for app deps (`bun add <pkg>`), npm for `functions/` deps
  (`cd functions && npm i <pkg>`). Mixing them causes lock-file drift.
- Before adding a new page, check that the routing change goes in
  `src/main.tsx` (not `App.tsx` — there is no `App.tsx`).
- When wiring a new Firebase callable, add the typed wrapper in
  `src/lib/strain-api.ts` and re-export it from there. Don't import
  `firebase/functions` directly in a component.

# Remember:

- Always ensure platform parity
- Write functional code not innovative code