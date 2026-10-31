import { beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer, requireRole } from "@/lib/auth";

// `server-only` throws on import outside a React Server environment, and tests aren't one.
vi.mock("server-only", () => ({}));

// Stand-in for the browser cookie the prototype bar's role switcher sets.
let previewRole: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "preview-role" && previewRole !== undefined ? { value: previewRole } : undefined),
  }),
}));

// In Next, redirect() and notFound() stop rendering by throwing. Throwing a readable
// error here lets each test check which one was called.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("notFound"); },
}));

beforeEach(() => {
  previewRole = undefined;
});

describe("getViewer", () => {
  it("defaults to the patient when no role is picked", async () => {
    expect(await getViewer()).toMatchObject({ role: "patient", patientId: "jordan" });
  });

  it("returns the viewer for the picked role", async () => {
    previewRole = "practitioner";
    expect(await getViewer()).toMatchObject({ role: "practitioner", practitionerId: "rivera" });
    previewRole = "staff";
    expect(await getViewer()).toMatchObject({ role: "staff", clinicId: "northside" });
  });

  it("returns null when signed out", async () => {
    previewRole = "out";
    expect(await getViewer()).toBeNull();
  });
});

describe("requireRole", () => {
  it("sends signed-out visitors to /login", async () => {
    previewRole = "out";
    await expect(requireRole("patient")).rejects.toThrow("redirect:/login");
  });

  it("hides the page from the wrong role", async () => {
    previewRole = "patient";
    await expect(requireRole("staff")).rejects.toThrow("notFound");
  });

  it("returns the viewer when the role is allowed", async () => {
    previewRole = "staff";
    const viewer = await requireRole("staff");
    // Type-checks only if requireRole narrows the return type to the staff viewer.
    expect(viewer.clinicId).toBe("northside");
  });

  it("accepts any of several roles", async () => {
    previewRole = "practitioner";
    expect(await requireRole("practitioner", "staff")).toMatchObject({ role: "practitioner" });
  });
});
