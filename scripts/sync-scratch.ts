#!/usr/bin/env bun
/**
 * Mirror every GitHub issue into `.scratch/backup/<N>-<slug>.md` so the local
 * repo holds a recoverable copy if GitHub goes down or we go offline.
 *
 * Invoked by the pre-push lefthook stage and on demand via `bun scratch:sync`.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BACKUP_DIR = ".scratch/backup";

type Issue = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: { name: string }[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const ghJson = async <T>(args: string[]): Promise<T> => {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`gh ${args.join(" ")} failed: ${err}`);
  return JSON.parse(out) as T;
};

const fetchAll = (): Promise<Issue[]> =>
  ghJson<Issue[]>([
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,title,body,state,labels,createdAt,updatedAt,closedAt",
  ]);

const renderIssue = (issue: Issue): string => {
  const labels = issue.labels.map((l) => l.name).toSorted();
  const fm = [
    "---",
    `number: ${issue.number}`,
    `state: ${issue.state}`,
    `labels: [${labels.join(", ")}]`,
    `created_at: ${issue.createdAt}`,
    `updated_at: ${issue.updatedAt}`,
    issue.closedAt ? `closed_at: ${issue.closedAt}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  return `${fm}\n\n# ${issue.title}\n\n${issue.body.trim()}\n`;
};

const main = async (): Promise<void> => {
  const issues = await fetchAll();
  await mkdir(BACKUP_DIR, { recursive: true });

  const targets = issues.map((issue) => ({
    name: `${String(issue.number).padStart(3, "0")}-${slugify(issue.title)}.md`,
    content: renderIssue(issue),
  }));

  await Promise.all(targets.map((t) => writeFile(join(BACKUP_DIR, t.name), t.content)));

  const expected = new Set(targets.map((t) => t.name));
  const existing = await readdir(BACKUP_DIR);
  await Promise.all(
    existing
      .filter((f) => !expected.has(f) && /^\d{3}-.*\.md$/.test(f))
      .map((f) => rm(join(BACKUP_DIR, f))),
  );

  console.log(`Synced ${issues.length} issues to ${BACKUP_DIR}/`);
};

await main();
