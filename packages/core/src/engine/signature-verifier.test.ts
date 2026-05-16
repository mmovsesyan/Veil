import { describe, it, expect } from "vitest";
import { verifyFeedSignature } from "./signature-verifier.js";

describe("Signature Verifier", () => {
  it("verifies a valid Ed25519 signature", async () => {
    // Generate a test key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    );

    const data = "! Title: Test\n||example.com^";
    const dataBytes = new TextEncoder().encode(data);
    const signature = await crypto.subtle.sign("Ed25519", keyPair.privateKey, dataBytes);
    const sigB64 = Buffer.from(signature).toString("base64");

    const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const pubB64 = Buffer.from(rawPub).toString("base64");

    const valid = await verifyFeedSignature(data, sigB64, pubB64);
    expect(valid).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    );

    const data = "||example.com^";
    const otherData = "||other.com^";
    const dataBytes = new TextEncoder().encode(otherData);
    const signature = await crypto.subtle.sign("Ed25519", keyPair.privateKey, dataBytes);
    const sigB64 = Buffer.from(signature).toString("base64");

    const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const pubB64 = Buffer.from(rawPub).toString("base64");

    const valid = await verifyFeedSignature(data, sigB64, pubB64);
    expect(valid).toBe(false);
  });

  it("rejects a forged key", async () => {
    const kp1 = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const kp2 = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

    const data = "||example.com^";
    const sig = await crypto.subtle.sign("Ed25519", kp1.privateKey, new TextEncoder().encode(data));
    const sigB64 = Buffer.from(sig).toString("base64");
    const pub2B64 = Buffer.from(await crypto.subtle.exportKey("raw", kp2.publicKey)).toString("base64");

    const valid = await verifyFeedSignature(data, sigB64, pub2B64);
    expect(valid).toBe(false);
  });
});
