import { describe, expect, it } from "vitest";
import { shortAddr, shortCredential } from "./wallet-cash";

describe("wallet display", () => {
  it("shortens addresses and passkey ids", () => {
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortCredential("abcdefghijklmnopqrstuvwxyz")).toBe("abcdefgh…uvwxyz");
    expect(shortCredential("short")).toBe("short");
  });
});
