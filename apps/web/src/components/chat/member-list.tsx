import type { MemberView } from "./room-events";

type Props = {
  members: readonly MemberView[];
  myUserId: string | null;
};

export function MemberList({ members, myUserId }: Props): React.ReactElement {
  return (
    <aside className="bg-background w-48 shrink-0 border-l px-3 py-2">
      <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
        Members ({members.length})
      </h2>

      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block size-2 rounded-full ${
                m.online ? "bg-emerald-500" : "bg-muted-foreground/40"
              }`}
              aria-label={m.online ? "online" : "offline"}
            />

            <span className="truncate">
              {m.displayName}
              {m.userId === myUserId ? <span className="text-muted-foreground"> (you)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
