import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptRefreshToken, encryptRefreshToken } from "./token-crypto";

describe("Google refresh token encryption", () => {
    beforeEach(() => {
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    });

    it("round-trips a token without storing it in plaintext", () => {
        const token = "refresh-token-that-must-stay-secret";
        const encrypted = encryptRefreshToken(token);

        expect(encrypted).not.toContain(token);
        expect(decryptRefreshToken(encrypted)).toBe(token);
    });

    it("rejects a token encrypted with another key", () => {
        const encrypted = encryptRefreshToken("refresh-token");
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");

        expect(() => decryptRefreshToken(encrypted)).toThrow();
    });
});
