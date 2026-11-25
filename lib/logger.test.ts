import { describe, expect, it } from "vitest";
import pino from "pino";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { LOG_OPTIONS } from "./logger";

/** A logger with the app's real settings that writes into `lines`. */
function capture() {
    const lines: string[] = [];
    const log = pino(LOG_OPTIONS, { write: (s: string) => { lines.push(s); } });
    return { log, text: () => lines.join("\n") };
}

describe("logger redaction", () => {
    it("hides passwords, tokens, emails and auth headers", () => {
        const { log, text } = capture();

        log.info({
            body: { email: "a@b.com", password: "123" },
            token: "abc",
            req: { headers: { authorization: "Bearer x", cookie: "s=1" } },
        });

        expect(text()).not.toMatch(/a@b\.com|"123"|"abc"|Bearer x|s=1/);
        expect(text()).toContain("[REDACTED]");
    });
});

describe("logged errors (CMP-2 #40)", () => {
    it("keep what failed but not the patient data the query carried", () => {
        const { log, text } = capture();
        // What a failed sign-up insert into patients looks like: Drizzle wraps the Postgres error
        // and puts the parameters in its message; Postgres puts the row values in `detail`.
        const pgError = Object.assign(new Error("duplicate key value violates unique constraint \"patients_user_unique\""), {
            code: "23505",
            constraint: "patients_user_unique",
            detail: "Key (phone)=((518) 555-0110) already exists.",
        });
        const err = new DrizzleQueryError(
            'insert into "patients" ("user_id", "name", "dob", "phone") values ($1, $2, $3, $4)',
            ["11111111-1111-4111-8111-111111111111", "Jordan Lee", "1990-04-12", "(518) 555-0110"],
            pgError,
        );

        log.error({ err }, "Sign-up profile step failed");

        expect(text()).not.toMatch(/Jordan Lee|1990-04-12|555-0110/);
        expect(text()).toContain("Failed query: insert into"); // still says which query
        expect(text()).toContain("23505");
        expect(text()).toContain("patients_user_unique");
    });

    it("masks email addresses in error messages", () => {
        const { log, text } = capture();
        log.error({ err: new Error("could not send to jordan@example.com") }, "send failed");
        expect(text()).not.toContain("jordan@example.com");
        expect(text()).toContain("[email]");
    });
});
