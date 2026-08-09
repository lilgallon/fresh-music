import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getEncryptionKey(): Buffer {
    const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!encoded) {
        throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
    }

    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) {
        throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }
    return key;
}

export function isTokenEncryptionConfigured(): boolean {
    try {
        getEncryptionKey();
        return true;
    } catch {
        return false;
    }
}

export function encryptRefreshToken(refreshToken: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [VERSION, iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptRefreshToken(payload: string): string {
    const [version, encodedIv, encodedAuthTag, encodedCiphertext] = payload.split(":");
    if (version !== VERSION || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
        throw new Error("Stored Google refresh token has an unsupported format");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(encodedIv, "base64")
    );
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64")),
        decipher.final(),
    ]).toString("utf8");
}
