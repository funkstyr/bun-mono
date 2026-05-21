import type { MemberView } from "./room-events";

type Props = {
  typingUserIds: readonly string[];
  members: readonly MemberView[];
  myUserId: string | null;
};

const VAGUE_THRESHOLD = 4;

export function TypingIndicator({
  typingUserIds,
  members,
  myUserId,
}: Props): React.ReactElement | null {
  // The server broadcasts chat.typing to every Member including the sender,
  // so we filter ourselves out here rather than asking the actor to skip
  // self-sends — keeps the broadcast lane uniform.
  const otherIds = typingUserIds.filter((id) => id !== myUserId);
  if (otherIds.length === 0) return null;

  const text = formatTypingText(otherIds, members);

  return (
    <div
      aria-live="polite"
      className="text-muted-foreground bg-background px-4 py-1 text-xs italic"
    >
      {text}
    </div>
  );
}

function formatTypingText(userIds: readonly string[], members: readonly MemberView[]): string {
  if (userIds.length >= VAGUE_THRESHOLD) return "Several people are typing…";

  const names = userIds.map((id) => displayNameFor(id, members));

  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  // Three typers — Oxford-comma form.
  return `${names[0]}, ${names[1]}, and ${names[2]} are typing…`;
}

function displayNameFor(userId: string, members: readonly MemberView[]): string {
  return members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);
}
