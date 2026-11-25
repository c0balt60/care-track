import pino, { type LoggerOptions } from "pino";
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

type ErrorLike = Error & { code?: string; constraint?: string; cause?: unknown };

/**
 * How `logger.error({ err }, ...)` writes an error: what went wrong, never the data it went
 * wrong on (CMP-2 #40). Errors carry row values in ways redact paths can't reach: Drizzle puts
 * the query parameters in its message ("Failed query: ...\nparams: Jordan Lee,1990-04-12"),
 * and Postgres puts them in `detail` ("Key (email)=(a@b.c) already exists"). So this keeps the
 * error type, the first line of the message, the Postgres code and constraint, and the stack
 * frames, and drops everything else.
 */
export function safeError(err: unknown, depth = 0): Record<string, unknown> {
    if (!(err instanceof Error)) return { type: typeof err };
    const e = err as ErrorLike;
    return {
        type: e.name,
        message: e.message.split("\n")[0].replace(/\S+@\S+/g, "[email]"),
        ...(e.code && { code: e.code }),
        ...(e.constraint && { constraint: e.constraint }),
        // The stack's first lines repeat the message (params included), so keep only the frames.
        stack: e.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")).join("\n"),
        ...(e.cause !== undefined && depth < 3 && { cause: safeError(e.cause, depth + 1) }),
    };
}

/** Shared by the app logger and its test, so the test checks the real settings. */
export const LOG_OPTIONS: LoggerOptions = {
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    serializers: { err: safeError },
};

// Readable, colored logs in dev; plain JSON lines to stdout in production.
// pino-pretty is passed as a stream, not as `transport: { target: "pino-pretty" }`:
// a transport makes pino look the package up from the caller's file path, which
// fails inside Next's bundled server code ("unable to determine transport target").
export const logger = pino(
    { ...LOG_OPTIONS, level: process.env.LOG_LEVEL ?? "info" },
    process.env.NODE_ENV === "production" ? undefined : pretty({ colorize: true, sync: true }),
);

// Child logger tagged with the id that proxy.ts puts on every request.
export function requestLogger(request: Request) {
    return logger.child({ requestId: request.headers.get("x-request-id") });
}
