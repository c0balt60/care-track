<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules for AI agents in this repo

Care Track is a learning and portfolio project. See [README.md](README.md) for what the app aims to be. AI agents may write code, but the team must always understand how the system is built. These rules apply to every AI agent (Claude Code, Copilot, Cursor, Codex, and others).

## Backend work needs a write-up

Agents may write backend code: API route handlers (`app/api/**`), server actions, database schemas and queries, authentication and session logic, `proxy.ts`, and anything else that runs on the server. Because this code handles patient data and access control, every backend change must come with a write-up for the developer that covers:

- **What it does:** the request or data flow from start to finish (who calls it, what it reads and writes, what it returns or redirects to).
- **Trust and safety:** how the current user is identified, what input is validated, and which access checks run. Flag any temporary stand-ins, such as mock auth, and mark them in the code.
- **Data changes:** tables and columns touched, and any migrations, with how to apply them.
- **How to verify:** the commands or manual steps that show it works.

## What agents may do

- **Write code:** front-end logic and UI, backend code (with the write-up above), tooling, tests, and CI.
- **Keep the team on track:** review plans and code, point out bugs, explain concepts, and suggest next steps.
- **Write documentation:** README, files in `docs/`, guides, and code comments.

## Explain what you build

Whenever you write code, explain how it works so the developers can maintain it without you:

- Say what you changed and why, file by file, and how the pieces connect.
- Call out decisions and trade-offs, and point to the docs you followed.
- The larger the task, the more this matters. For multi-file or architectural changes, outline the plan before writing code, and finish with a walkthrough of the result.
