# Nocturne — AI character chat

Nocturne is a dark, anime-inspired web app for discovering, creating and chatting with AI characters. It's built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4. Data lives in Supabase (Postgres, Auth and Storage, protected by Row Level Security). AI replies come from Claude through the **official Anthropic TypeScript SDK** (`@anthropic-ai/sdk`), which sits behind a small provider interface so you can swap or add providers.

Without credentials the app still runs in a clearly labelled **local development mode**. That mode has a single local user, a JSON-file database and demo characters, so you can explore everything before setting anything up.

---

## Features

- **Discover**: a featured carousel; Trending (ranked by real conversation counts); Recommended (based on your favorites and chats); Recently added; category filters and sorting.
- **Search**: server-side search across names, descriptions, tags and categories. It is debounced, shareable through the URL, and has loading and empty states.
- **Character profiles**: portrait, tagline, about, personality and traits, scenario, greeting preview, background, the full definition (collapsible), creator and a real chat count.
- **Chat**:
  - Responses stream token by token.
  - **Stop** keeps the partial reply, and you can retry or regenerate.
  - You can edit and resend your last message, copy any message, and pin, rename or delete a conversation.
  - Auto-scroll respects your reading position (a "Jump to latest" button appears when you scroll up).
  - Enter sends; Shift+Enter adds a new line.
  - The server blocks duplicate submissions.
- **Character studio**:
  - Create, edit, duplicate and delete characters.
  - Validation runs on both client and server, with a live preview.
  - Avatars can be uploaded (type sniffed from the file bytes, 2 MB limit), set from an https URL, or picked from the built-in art.
  - Characters can be public or private.
- **Library**: conversations (pinned first), favorites, and your own characters.
- **Auth** (Supabase): sign up, sign in, sign out, email confirmation callback, session refresh in `proxy.ts`, protected pages and guest browsing.
- **UX**:
  - Skeleton loaders, toasts, empty states, confirmation dialogs, error boundaries and keyboard-accessible menus and dialogs.
  - Supports reduced motion.
  - Responsive layout: a collapsible sidebar on desktop and a drawer on mobile.
- **10 original demo characters** with procedurally drawn SVG portraits (`scripts/generate-portraits.mjs`). The art belongs to this project, so there are no external image links to break.

## Project structure

```
nocturne/
├── app/
│   ├── page.tsx                      Discover
│   ├── search/                       Search
│   ├── characters/[id]/              Profile (+ /edit studio)
│   ├── create/                       Character studio (new)
│   ├── chat/[conversationId]/        Chat
│   ├── library/                      Conversations, favorites, my characters
│   ├── login/ signup/ auth/callback/ Authentication
│   ├── actions/                      Server actions (characters, conversations, auth)
│   ├── api/chat/                     Streaming generation (POST) + /stop
│   ├── api/conversations/[id]/messages/  Message sync (GET)
│   ├── api/upload/ api/uploads/      Avatar upload + local-mode file serving
│   ├── layout.tsx globals.css        Shell + design tokens
│   └── error.tsx not-found.tsx loading.tsx …
├── components/
│   ├── ui/          Button, Field, Avatar, Dialog, Dropdown, Badge, Skeleton, EmptyState…
│   ├── layout/      AppShell, Sidebar, Topbar, Logo
│   ├── characters/  Cards, grid/rows, hero, chips, sort, favorite, owner actions
│   ├── chat/        ChatView, MessageItem, Composer, ChatHeader, RichText
│   ├── studio/      CharacterStudio, AvatarPicker, ChipInput
│   └── library/ auth/
├── lib/
│   ├── ai/          Provider interface, Anthropic SDK provider, demo provider,
│   │                prompt builder, context-window management
│   ├── chat/        Stream event types, NDJSON client, in-flight generation registry
│   ├── data/        Domain types, DataStore interface, LocalStore, SupabaseStore,
│   │                search, seed characters, request context
│   ├── supabase/    Server client
│   ├── config.ts validation.ts rate-limit.ts images.ts http.ts utils.ts
├── supabase/
│   ├── migrations/  Schema, RLS policies, grants, triggers, search RPC, storage bucket
│   └── seed.sql     Demo characters (generated from lib/data/seed.ts)
├── tests/           Vitest unit + SDK integration tests, RLS SQL tests
├── e2e/             Playwright end-to-end tests + fake Anthropic server
├── scripts/         Portrait generator, seed SQL generator, RLS test runner
├── proxy.ts         Session refresh + optimistic route protection
└── .env.example
```

## Quick start (local mode — no accounts needed)

Requires Node.js 20.9 or later.

```bash
cd nocturne
npm install
cp .env.example .env.local      # optional; add ANTHROPIC_API_KEY to get real AI replies
npm run dev                     # http://localhost:3000
```

In local mode:

- There is **no sign-in**. Every visitor to the dev server acts as a single user called "Local Explorer".
- Data is stored in `.data/nocturne.json`, and uploads go to `.data/uploads/`. Delete the folder to reset.
- A banner explains these limitations. Local mode is **refused in production builds** unless you set `NOCTURNE_ALLOW_LOCAL_MODE=true`.
- Without an API key, the chat says the AI provider isn't configured. To try the UI anyway, set `AI_PROVIDER=demo`. That gives clearly labelled, scripted placeholder replies, and it is disabled in production.

## Configure the AI provider

The app calls Claude with the official **Anthropic TypeScript SDK**. The key is only read on the server, by the SDK, from `ANTHROPIC_API_KEY`. It never appears in client bundles or responses.

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5-5        # any Claude model id
AI_EFFORT=medium                # low | medium | high | xhigh | max | off
```

What the integration does (`lib/ai/anthropic.ts`):

- **Streaming** with `client.beta.messages.stream()`. Text deltas are forwarded to the browser as NDJSON events.
- **Character consistency**: the system prompt (`lib/ai/prompt.ts`) wraps the character's full definition and role-play rules. It is byte-stable across turns and marked with `cache_control`, so prompt caching cuts cost and latency on long chats.
- **Context management** (`lib/ai/context.ts`): sends the most recent history that fits `AI_CONTEXT_MAX_TOKENS` and notes when older turns were dropped.
- **Safety fallbacks**: for models that support it (Opus 5.5, Opus 5, Sonnet 5.5, Fable 5.1), requests opt into `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). A safety-declined request is then retried server-side on Anthropic's recommended fallback model. Set `AI_SERVER_FALLBACKS=false` to turn this off. Refusals that still happen are shown gracefully.
- **Errors and timeouts**: the SDK retries 429, 5xx and connection errors twice, with a timeout of `AI_TIMEOUT_MS`. Typed SDK errors become friendly messages (rate limit, overloaded, auth, timeout, network) with a Retry button. Secrets are never echoed.
- **Stop and interruption**: Stop (or closing the tab) aborts the SDK stream through an `AbortSignal`, and the partial reply is saved and marked as interrupted.
- **Abuse protection**: there is a per-user rate limit (`AI_RATE_LIMIT_PER_MINUTE`), and only one generation can run per conversation at a time.

**Adding another provider:** implement `ChatProvider` (`lib/ai/types.ts`) in a new file and register it in `lib/ai/index.ts`. Then select it with `AI_PROVIDER=<id>`. The UI, the chat route and storage don't change.

## Set up Supabase (accounts + Postgres)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations and seed. Use one of these options:
   - **Supabase CLI**: `supabase link --project-ref <ref>`, then `supabase db push`. Load the seed with `psql "$DATABASE_URL" -f supabase/seed.sql`, or paste `seed.sql` into the SQL editor.
   - **SQL editor**: run `supabase/migrations/20261017000001_init.sql`, then `20261017000002_storage.sql`, then `supabase/seed.sql`.
3. **Authentication → URL configuration**: set the Site URL to your app's origin and add `https://<your-domain>/auth/callback` (plus `http://localhost:3000/auth/callback` for development) to the redirect URLs. Email confirmation can stay on; the app handles the confirmation link.
4. Add your project's URL and anon key to the environment:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   The anon key is public by design. No service-role key is used anywhere.

The schema has five tables: `profiles`, `characters`, `conversations`, `messages` and `favorites`. Foreign keys cascade on delete, there are indexes for the main queries, and a trigger creates the profile and maintains the real chat counts. Security comes from three layers:

- **RLS on every table.** Users can only see their own conversations, messages and favorites, plus public characters and their own private ones. Only creators can change or delete their characters.
- **Column-level grants.** Users cannot forge `featured`, `chat_count`, `creator_id` or `user_id`.
- **A security-invoker view and search RPC**, so search respects the same policies.

Avatar uploads go to a public `avatars` bucket, limited to 2 MB and raster image types (no SVG). Each user can only write to their own folder.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | for AI replies | – | Anthropic key, read server-side by the SDK |
| `AI_PROVIDER` | no | `anthropic` | `anthropic`, or `demo` (development only) |
| `AI_MODEL` | no | `claude-opus-5-5` | Model id |
| `AI_EFFORT` | no | `medium` | `low`/`medium`/`high`/`xhigh`/`max`/`off` |
| `AI_MAX_OUTPUT_TOKENS` | no | `16000` | Per-reply cap (includes internal reasoning) |
| `AI_CONTEXT_MAX_TOKENS` | no | `24000` | History budget per request |
| `AI_TIMEOUT_MS` | no | `120000` | SDK request timeout |
| `AI_SERVER_FALLBACKS` | no | `true` | Server-side refusal fallbacks |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `12` | Chat requests per user per minute (per instance) |
| `NEXT_PUBLIC_SUPABASE_URL` | for accounts | – | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for accounts | – | Supabase anon key |
| `NOCTURNE_DATA_DIR` | no | `.data` | Local-mode storage directory |
| `NOCTURNE_ALLOW_LOCAL_MODE` | no | `false` | Allow local mode in production |

## Scripts

```bash
npm run dev            # development server
npm run build && npm start
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest unit + SDK integration tests
npm run test:rls       # migrations + RLS policy tests on a throwaway PostgreSQL (needs initdb/pg_ctl/psql)
npm run test:e2e       # Playwright: full app (local mode) + real SDK against a fake Anthropic server
npm run test:all       # all of the above
npm run gen:portraits  # regenerate the demo character art
npm run gen:seed       # regenerate supabase/seed.sql from lib/data/seed.ts
```

For the end-to-end tests, run `npx playwright install chromium` once, or point `PW_CHROMIUM_PATH` at an existing Chromium.

## Deployment

1. Set up Supabase (above) and add all the environment variables to your host, for example Vercel → Project → Settings → Environment Variables. Keep `ANTHROPIC_API_KEY` server-only and never prefix it with `NEXT_PUBLIC_`.
2. Build with `npm run build` and run with `npm start`, or deploy the `nocturne/` directory as a Next.js project.
3. Add the production `/auth/callback` URL to Supabase's redirect allow-list.

## Known limitations

- **Supabase mode hasn't been tested against a live Supabase project.** The SQL schema, RLS policies, grants and triggers are tested against real PostgreSQL with a stand-in for Supabase's `auth` schema (`npm run test:rls`). The `SupabaseStore` data-access code and the Supabase auth flow are implemented against the official clients but not exercised end to end. Verify them once a project is configured.
- The rate limiter and the "one generation per conversation" lock are in-memory, so they are per server instance. On multi-instance deployments, use a shared store such as Redis. Stop falls back to dropping the stream client-side if the generation is running on another instance.
- Local mode is single-user and file-based. It's meant for development, not hosting.
- Search uses substring matching (accent-insensitive in local mode, case-insensitive in Postgres). There is no full-text ranking or fuzzy matching yet.
- "Trending" is ranked by total conversations started, not by recent activity. New installs start at zero; no statistics are invented.
- There's no profile settings page yet (display name and avatar come from sign-up). There's no password reset UI, though Supabase's hosted reset email works.
- AI-generated personalities aren't fully deterministic. The prompt and context strategy keep characters consistent but can't guarantee it.
