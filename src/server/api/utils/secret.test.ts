import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import {
  decodeSecretIdToken,
  encodeSecretIdToken,
  getClientIp,
  getCreatorFingerprint,
  hashAuthToken,
  verifyAuthToken,
} from "./secret";

const xff = (value: string) => new Headers({ "x-forwarded-for": value });

describe("getClientIp", () => {
  it("ignores addresses the client prepended to X-Forwarded-For", () => {
    expect(getClientIp(xff("1.1.1.1, 2.2.2.2, 198.51.100.4"), 1)).toBe(
      "198.51.100.4",
    );
  });

  it("picks the address appended by the outermost trusted proxy", () => {
    expect(getClientIp(xff("1.1.1.1, 198.51.100.4, 10.0.0.2"), 2)).toBe(
      "198.51.100.4",
    );
  });

  it("uses the right-most entry without a proxy", () => {
    expect(getClientIp(xff("198.51.100.4"), 0)).toBe("198.51.100.4");
  });

  it("falls back to the left-most entry when there are fewer entries than proxies", () => {
    expect(getClientIp(xff("198.51.100.4"), 3)).toBe("198.51.100.4");
  });

  it("returns an empty string without the header", () => {
    expect(getClientIp(new Headers(), 1)).toBe("");
  });
});

describe("getCreatorFingerprint", () => {
  it("depends on the IP only, so changing the User-Agent doesn't help", () => {
    expect(getCreatorFingerprint({ ip: "198.51.100.4" })).toBe(
      getCreatorFingerprint({ ip: "198.51.100.4" }),
    );
    expect(getCreatorFingerprint({ ip: "198.51.100.4" })).not.toBe(
      getCreatorFingerprint({ ip: "198.51.100.5" }),
    );
  });

  it("changes daily when a date is given", () => {
    const ip = "198.51.100.4";
    expect(
      getCreatorFingerprint({ ip, date: new Date("2026-01-01T10:00:00Z") }),
    ).not.toBe(
      getCreatorFingerprint({ ip, date: new Date("2026-01-02T10:00:00Z") }),
    );
  });
});

describe("id tokens", () => {
  it("round-trips and rejects tampering", () => {
    const id = randomUUID();
    const token = encodeSecretIdToken(id);
    expect(decodeSecretIdToken(token)).toBe(id);

    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(() => decodeSecretIdToken(tampered)).toThrow(
      /unable to authenticate data/,
    );
  });
});

describe("auth token hashing", () => {
  it("verifies the right token only and salts every hash", async () => {
    const hash = await hashAuthToken("token-a");
    expect(await verifyAuthToken("token-a", hash)).toBe(true);
    expect(await verifyAuthToken("token-b", hash)).toBe(false);
    expect(await hashAuthToken("token-a")).not.toBe(hash);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyAuthToken("token-a", "garbage")).toBe(false);
  });
});
