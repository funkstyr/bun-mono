import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { streamText, convertToModelMessages, wrapLanguageModel } from "ai";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "@bun-mono/api/context";
import { appRouter } from "@bun-mono/api/routers/index";
import { auth } from "@bun-mono/auth";
import { env } from "@bun-mono/env/server";
import {
  authoriseRoomUpgrade,
  onRoomClose,
  onRoomMessage,
  onRoomOpen,
  type RoomUpgradeContext,
} from "@bun-mono/room-server/ws-upgrade";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<RoomUpgradeContext>>();

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
  return;
});

app.post("/ai", async (c) => {
  const body = await c.req.json();
  const uiMessages = body.messages || [];
  const model = wrapLanguageModel({
    model: google("gemini-2.5-flash"),
    middleware: devToolsMiddleware(),
  });
  const result = streamText({
    model,
    messages: await convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse();
});

app.get(
  "/ws/room/:slug",
  upgradeWebSocket(async (c) => {
    const slug = c.req.param("slug") ?? "";
    const result = await authoriseRoomUpgrade(c.req.raw, slug);

    if (!result.ok) {
      const closeCode = result.status === 401 ? 4401 : 4404;
      return {
        onOpen: (_ev, ws) => ws.close(closeCode, result.reason),
      };
    }

    const ctx = result.ctx;
    return {
      onOpen: async (_ev, ws) => {
        await onRoomOpen(
          ctx,
          (s) => ws.send(s),
          (code, reason) => ws.close(code, reason),
        );
      },
      onMessage: async (event, ws) => {
        // Bun's WS may surface `string`, `Blob`, or `ArrayBuffer`. `new Response()`
        // accepts all three; `.text()` decodes via UTF-8.
        const raw =
          typeof event.data === "string" ? event.data : await new Response(event.data).text();
        await onRoomMessage(
          ctx,
          raw,
          (s) => ws.send(s),
          (code, reason) => ws.close(code, reason),
        );
      },
      onClose: () => onRoomClose(ctx),
    };
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

export default {
  fetch: app.fetch,
  websocket,
};
