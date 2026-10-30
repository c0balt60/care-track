import pino from "pino";

// Field paths pino replaces with "[REDACTED]" before a log line is written.
// Add new PII fields (patient names, DOB, ...) here as the schema grows.
export const REDACT_PATHS = [
    "password", "*.password",
    "token", "*.token",
    "email", "*.email",
    "headers.authorization", "*.headers.authorization",
    "headers.cookie", "*.headers.cookie",
];

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    // Readable, colored logs in dev; plain JSON lines in production.
    transport: process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty" },
});

// Child logger tagged with the id that proxy.ts puts on every request.
export function requestLogger(request: Request) {
    return logger.child({ requestId: request.headers.get("x-request-id") });
}
