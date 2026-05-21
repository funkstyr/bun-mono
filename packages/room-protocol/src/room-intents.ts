import { type } from "arktype";

export const leaveRoomPayload = type({});

export type LeaveRoomPayload = typeof leaveRoomPayload.infer;
