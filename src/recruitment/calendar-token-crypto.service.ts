import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

@Injectable()
export class CalendarTokenCryptoService {
  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  decrypt(value: string) {
    const parts = value.split(".");
    if (parts.length !== 3) throw new Error("Invalid encrypted calendar token");
    const [iv, tag, encrypted] = parts.map((part) =>
      Buffer.from(part, "base64url"),
    );
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  }

  signState(payload: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body)}`;
  }

  verifyState<T>(state: string): T {
    const [body, signature] = state.split(".");
    if (!body || !signature) throw new Error("Invalid OAuth state");
    const actual = Buffer.from(signature);
    const expected = Buffer.from(this.signature(body));
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new Error("Invalid OAuth state signature");
    }
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  }

  private signature(value: string) {
    return createHmac("sha256", this.stateSecret())
      .update(value)
      .digest("base64url");
  }

  private encryptionKey() {
    return createHash("sha256")
      .update(
        process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ??
          process.env.JWT_REFRESH_SECRET ??
          "development-only-calendar-key",
      )
      .digest();
  }

  private stateSecret() {
    return (
      process.env.CALENDAR_OAUTH_STATE_SECRET ??
      process.env.JWT_ACCESS_SECRET ??
      "development-only-calendar-state"
    );
  }
}
