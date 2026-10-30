import { describe, expect, it } from "vitest";
import pino from "pino";
import { REDACT_PATHS } from "./logger";

describe("logger redaction", () => {
    it("hides passwords, tokens, emails and auth headers", () => {
        let line = "";
        const log = pino(
            { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
            { write: (s: string) => { line = s; } },
        );

        log.info({
            body: { email: "a@b.com", password: "123" },
            token: "abc",
            req: { headers: { authorization: "Bearer x", cookie: "s=1" } },
        });

        expect(line).not.toMatch(/a@b\.com|"123"|"abc"|Bearer x|s=1/);
        expect(line).toContain("[REDACTED]");
    });
});
