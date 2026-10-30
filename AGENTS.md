<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules for AI agents in this repo

Care Track is a learning and portfolio project. See [README.md](README.md) for what the app aims to be. AI agents may write code, but the team must always understand how the system is built. These rules apply to every AI agent (Claude Code, Copilot, Cursor, Codex, and others).

## Do NOT work on the backend

- Never write or edit backend code. That includes API route handlers (`app/api/**`), server actions, database schemas and queries, authentication and session logic, `proxy.ts`, and anything else that runs on the server.
- When asked for backend work, reply with suggestions and step-by-step guidance instead: what to build, which files to touch, and which docs to read. The developer writes the code.

## What agents may do

- **Write code:** front-end logic and UI, tooling, tests, and CI. Backend code is still off limits (see above).
- **Keep the team on track:** review plans and code, point out bugs, explain concepts, and suggest next steps.
- **Write documentation:** README, files in `docs/`, guides, and code comments.

## Explain what you build

Whenever you write code, explain how it works so the developers can maintain it without you:

- Say what you changed and why, file by file, and how the pieces connect.
- Call out decisions and trade-offs, and point to the docs you followed.
- The larger the task, the more this matters. For multi-file or architectural changes, outline the plan before writing code, and finish with a walkthrough of the result.
