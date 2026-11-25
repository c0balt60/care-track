// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicSecretOnDeployment, PUBLIC_DEV_SECRET } from "./public-secret";

describe("isPublicSecretOnDeployment", () => {
  it("flags the public example secret on production and preview deployments", () => {
    expect(isPublicSecretOnDeployment(PUBLIC_DEV_SECRET, "production")).toBe(true);
    expect(isPublicSecretOnDeployment(PUBLIC_DEV_SECRET, "preview")).toBe(true);
  });

  it("allows it locally, and allows any other secret anywhere", () => {
    expect(isPublicSecretOnDeployment(PUBLIC_DEV_SECRET, undefined)).toBe(false);
    expect(isPublicSecretOnDeployment(PUBLIC_DEV_SECRET, "development")).toBe(false);
    expect(isPublicSecretOnDeployment("a-real-secret", "production")).toBe(false);
  });

  it("knows the value that's actually in .env.example", () => {
    // If someone changes the example secret, this fails until PUBLIC_DEV_SECRET follows,
    // so the deployment check can't quietly stop matching.
    const example = readFileSync(".env.example", "utf8");
    const values = [...example.matchAll(/^(BETTER_AUTH_SECRET|CRON_SECRET)=(.*)$/gm)].map((m) => m[2]);
    expect(values).toEqual([PUBLIC_DEV_SECRET, PUBLIC_DEV_SECRET]);
  });
});
