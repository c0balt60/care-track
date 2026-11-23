// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, close, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({});
  const close = vi.fn();
  return { sendMail, close, createTransport: vi.fn(() => ({ sendMail, close })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("./logger", () => ({ logger: { child: () => ({ info: vi.fn() }) } }));

import { sendEmail } from "./email";

const message = { to: "pat@example.com", subject: "Hello", text: "Hi there" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT"]) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sendEmail without a Resend key (local development)", () => {
  it("sends over SMTP to Mailpit's default port", async () => {
    await sendEmail({ ...message, html: "<p>Hi there</p>" });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "localhost", port: 1025 }));
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pat@example.com", subject: "Hello", text: "Hi there", html: "<p>Hi there</p>" }),
    );
    expect(close).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the host and port from SMTP_HOST and SMTP_PORT", async () => {
    vi.stubEnv("SMTP_HOST", "mail.test");
    vi.stubEnv("SMTP_PORT", "2525");
    await sendEmail(message);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "mail.test", port: 2525 }));
  });

  it("closes the connection even when sending fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("connection refused"));
    await expect(sendEmail(message)).rejects.toThrow("connection refused");
    expect(close).toHaveBeenCalled();
  });
});

describe("sendEmail with a Resend key", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("EMAIL_FROM", "CareTrack <hello@example.com>");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("posts to the Resend API and leaves SMTP alone", async () => {
    await sendEmail(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_123");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "CareTrack <hello@example.com>",
      to: ["pat@example.com"],
      subject: "Hello",
      text: "Hi there",
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("throws when Resend rejects the message", async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"domain is not verified"}', { status: 403 }));
    await expect(sendEmail(message)).rejects.toThrow(/403/);
  });

  it("throws when EMAIL_FROM is missing", async () => {
    vi.stubEnv("EMAIL_FROM", undefined);
    await expect(sendEmail(message)).rejects.toThrow(/EMAIL_FROM/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendEmail in production without a key", () => {
  it("fails loudly instead of trying localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail(message)).rejects.toThrow(/RESEND_API_KEY/);
    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendEmail input checks", () => {
  it("rejects a bad recipient and a subject with line breaks, sending nothing", async () => {
    await expect(sendEmail({ ...message, to: "not-an-address" })).rejects.toThrow(/recipient/);
    await expect(sendEmail({ ...message, to: "a@b.com\r\nBcc: x@y.com" })).rejects.toThrow(/recipient/);
    await expect(sendEmail({ ...message, subject: "Hi\r\nBcc: x@y.com" })).rejects.toThrow(/subject/);
    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});