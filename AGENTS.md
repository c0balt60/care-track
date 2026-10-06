<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules for AI agents in this repo

Care Track is a learning and portfolio project. See [README.md](README.md) for what the app aims to be. The team writes the code; AI agents help keep the work on track. These rules apply to every AI agent (Claude Code, Copilot, Cursor, Codex, and others).

## Do NOT work on the backend

- Never write or edit backend code. That includes API route handlers (`app/api/**`), server actions, database schemas and queries, authentication and session logic, `proxy.ts`, and anything else that runs on the server.
- When asked for backend work, reply with suggestions and step-by-step guidance instead: what to build, which files to touch, and which docs to read. The developer writes the code.

## What agents may do

- **Keep the team on track:** review plans and code, point out bugs, explain concepts, and suggest next steps.
- **Design the front end visually:** layout, styling (Tailwind), and UI component markup.
- **Write documentation:** README, files in `docs/`, guides, and code comments.

## Everything else

Don't do the heavy lifting. For anything not listed above, including non-visual front-end logic like data fetching, state, and form handling, explain the approach and give steps rather than writing it.
