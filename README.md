## Overview

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Firebase Auth (for authentication)
- Cloud Firestore (for saved strains, notes, user data)
- Firebase Cloud Functions v2 (for Groq AI calls + Leafly scrape; uses Llama 3.3 70B)
- Framer Motion (for animations)
- Three js (for 3d models)

All relevant files live in the 'src' directory. Firebase Functions live in `functions/src/`.

Use bun for the app, npm for `functions/`.

## Setup

This project is set up already and running on a cloud environment.

## Environment Variables

The frontend needs Firebase config at build time (Vite). Set these in your `.env` (or in Cloudflare Pages environment variables for deploys):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_CLIENT_ID=...
```

`VITE_GOOGLE_CLIENT_ID` is the Google OAuth Web Client ID. Google sign-in uses Google Identity Services directly (not Firebase's built-in popup/redirect) to avoid Safari's storage-partitioning and IndexedDB-closing bugs. Get the value from the Firebase console → Authentication → Sign-in method → Google → "Web SDK configuration" → "Web client ID".

The backend uses Firebase Secrets for sensitive values. The only one in use today is `GROQ_API_KEY`, set with `firebase functions:secrets:set GROQ_API_KEY`.


# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

All Firebase Auth wiring is already in place. Email/password, Google, and Sign in with Apple are enabled in `src/pages/Auth.tsx`. Apple on the web uses Firebase's `OAuthProvider('apple.com')` popup — enable the Apple provider in the Firebase console and add a Services ID, Team ID, Key ID, and the `.p8` key (the iOS app only needs the provider flipped on).

## Using Firebase Auth on the frontend

The `/auth` page is already set up. Navigate to `/auth` for all sign-in / sign-up flows.

You MUST use this hook to get user data. Never do this yourself without the hook:

```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signOut } = useAuth();
```

The hook is backed by `onAuthStateChanged(auth, ...)` and returns:

- `user`: `{ uid, email, name } | null`
- `isAuthenticated`: `user !== null`
- `signOut`: a wrapper around `firebase/auth`'s `signOut`.

## Protected Routes

When protecting a page, use the auth hook and wrap with `<RequireAuth>` from `src/components/RequireAuth.tsx`. It redirects unauthenticated users to `/auth`.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Redirect authenticated pages and sign-in / sign-up flows to `/auth`.

## Authorization on the backend

Backend authorization lives in two places:

- **Cloud Functions:** check `request.auth` at the top of every auth-gated callable and throw `HttpsError("unauthenticated", ...)` when missing. See `compareStrains` and `recommendStrainsForConditions` in `functions/src/index.ts` for the pattern.
- **Firestore:** security rules in `firestore.rules`. Saved strains are scoped to the requesting user's UID.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Firebase backend

The backend is Firebase-only: Auth + Firestore + Cloud Functions v2. There is no other backend.

## Cloud Functions

Source lives in `functions/src/`. Four callables are exported:

- `popularStrains()` — public, no auth, returns Leafly's popular list.
- `searchStrain({ name })` — public, no auth, returns one Leafly profile.
- `compareStrains({ strainNames, condition })` — auth required, calls Groq (Llama 3.3 70B) for synthesis.
- `recommendStrainsForConditions({ conditions, potency })` — auth required, calls Groq (Llama 3.3 70B) for synthesis.

To add a new callable:

1. Add the export in `functions/src/index.ts`. Use `onCall` (not
   `onRequest`) for client-driven calls, and gate with `request.auth` if
   it requires sign-in.
2. Add a typed wrapper in `src/lib/strain-api.ts`. Re-use the existing
   `callFn` helper — don't import `firebase/functions` in a component.
3. Build + deploy:

   ```bash
   cd functions && npm install && npm run build && cd ..
   firebase deploy --only functions,firestore:rules --force
   ```

### Secrets

Sensitive values (e.g. `GROQ_API_KEY`) are Firebase Secrets, not env vars. Set with `firebase functions:secrets:set GROQ_API_KEY`, then redeploy.

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

## Firestore

- Rules live in `firestore.rules`. Ship them with `firebase deploy --only functions,firestore:rules`.
- Current data shape: `users/{uid}` and `users/{uid}/savedStrains/{strainId}`.
- Client reads/writes use the `db` export from `src/lib/firebase.ts`.

## Common Firebase Mistakes To Avoid

- **Build functions before deploying.** Skipping `npm run build` in `functions/` gives you `functions/lib/index.js does not exist, can't deploy Cloud Functions`.
- Don't import `firebase/functions` directly in components — use the typed wrappers in `src/lib/strain-api.ts`.
- Don't add new env vars without updating both `README.md` and the Cloudflare Pages deploy workflow.
- Cloud Functions code uses Node 20. If you bump the runtime, bump `engines.node` in `functions/package.json` and the `Setup Node.js` step in `.github/workflows/firebase-functions-deploy.yml`.
- Firestore rules are the security source of truth. Don't bypass them with admin SDKs in the client.
