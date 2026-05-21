// Per-User soft cap on `room_member` rows. A pre-existing User over the
// cap is grandfathered in; they just can't join or create more.
export const MEMBERSHIP_CAP = 10;
