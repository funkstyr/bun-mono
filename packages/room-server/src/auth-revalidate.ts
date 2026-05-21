// Per-connection cache window for better-auth session lookups. The actor
// re-validates the handshake cookie on every Member intent, but a hot
// chatter would otherwise hammer the auth layer; one validate every ~60s
// is good enough to demote a revoked session before the User does any
// observable damage (their next-but-one send fails).
export const AUTH_REVALIDATE_TTL_MS = 60_000;

export class AuthRevalidationCache {
  private readonly validatedAt = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  isFresh(connectionId: string): boolean {
    const last = this.validatedAt.get(connectionId);
    return last !== undefined && this.now() - last < AUTH_REVALIDATE_TTL_MS;
  }

  markValidated(connectionId: string): void {
    this.validatedAt.set(connectionId, this.now());
  }

  evict(connectionId: string): void {
    this.validatedAt.delete(connectionId);
  }
}
