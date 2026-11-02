import pino from "pino";
import pretty from "pino-pretty";

// Field paths pino replaces with "[REDACTED]" before a log line is written.
// Add new PII fields (patient names, DOB, ...) here as the schema grows.
export const REDACT_PATHS = [
    "password", "*.password",
    "token", "*.token",
    "email", "*.email",
    "headers.authorization", "*.headers.authorization",
    "headers.cookie", "*.headers.cookie",
];

// Readable, colored logs in dev; plain JSON lines to stdout in production.
// pino-pretty is passed as a stream, not as `transport: { target: "pino-pretty" }`:
// a transport makes pino look the package up from the caller's file path, which
// fails inside Next's bundled server code ("unable to determine transport target").
export const logger = pino(
    {
        level: process.env.LOG_LEVEL ?? "info",
        redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
    process.env.NODE_ENV === "production" ? undefined : pretty({ colorize: true, sync: true }),
);

// Child logger tagged with the id that proxy.ts puts on every request.
export function requestLogger(request: Request) {
    return logger.child({ requestId: request.headers.get("x-request-id") });
}
