# Issue tracker: GitHub (with local `.scratch/backup/` mirror)

Issues and PRDs for this repo live as GitHub issues. The `gh` CLI is the primary interface. A local mirror at `.scratch/backup/` exists for disaster recovery and offline reference; it is gitignored.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. Capture the issue number from the URL `gh` prints.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

The `prd` label distinguishes parent product-requirements issues from their child slice issues. Slice issues reference their PRD with `Parent: #<prd-number>` in the body.

Infer the repo from `git remote -v` — `gh` does this automatically inside a clone.

## Local mirror — `.scratch/backup/`

Every GitHub issue is mirrored to `.scratch/backup/<NNN>-<slug>.md`, with a YAML frontmatter block containing `number`, `state`, `labels`, and timestamps, followed by the title and body.

Two paths keep the mirror current:

1. **Dual-write on creation.** When a skill creates a new GitHub issue, it should run `bun run scratch:sync` immediately after, or invoke the importer directly, so the new issue lands in `.scratch/backup/` right away. Don't try to hand-author the backup file — `bun run scratch:sync` is the only writer.
2. **Pre-push sync.** `lefthook.yml` runs `bun run scratch:sync` on `pre-push`, so any GitHub-side changes (new comments, label edits, closes) land in the mirror before code leaves the laptop.

The sync script (`scripts/sync-scratch.ts`):

- Lists every issue (`--state all`) via `gh`.
- Writes one file per issue to `.scratch/backup/`, padded with the GitHub issue number for stable sort order.
- Deletes any `.scratch/backup/*.md` whose number no longer exists on GitHub.
- Does not touch the legacy feature-grouped directories (`.scratch/chat/`, `.scratch/royalty/`, etc.) — those are the pre-migration snapshot and stay untouched as a historical artifact.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh issue create`. Then run `bun run scratch:sync` so the new issue lands in `.scratch/backup/`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`. If GitHub is unreachable, fall back to `.scratch/backup/<NNN>-*.md`.
