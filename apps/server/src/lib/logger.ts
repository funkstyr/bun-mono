import type { Logger, LoggerOptions } from "pino";
import pino from "pino";

const logLevel = (process.env["LOG_LEVEL"] || "info") as pino.LevelWithSilent;
const isDevelopment = process.env.NODE_ENV !== "production";

const loggerOptions: LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || "development",
  },
};

// Pretty transport in dev for readability; raw JSON in prod so log
// aggregators can parse fields.
let logger: Logger;

if (isDevelopment && process.env["PINO_PRETTY"] !== "false") {
  logger = pino({
    ...loggerOptions,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  });
} else {
  logger = pino(loggerOptions);
}

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export { logger };

export default logger;
