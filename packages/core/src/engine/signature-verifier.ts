/**
 * Ed25519 signature verification for remote rule feeds.
 *
 * Uses the Web Crypto API (available in browsers and Node.js 20+).
 */

/**
 * Import an Ed25519 public key from a Base64-encoded SPKI string.
 */
async function importPublicKey(base64: string): Promise<CryptoKey> {
  const raw = Buffer.from(base64, "base64");
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}

/**
 * Verify a detached Ed25519 signature over UTF-8 data.
 *
 * @param data            The raw rule list text.
 * @param signatureBase64 Base64-encoded signature.
 * @param publicKeyBase64 Base64-encoded 32-byte Ed25519 public key.
 * @returns true if the signature is valid.
 */
export async function verifyFeedSignature(
  data: string,
  signatureBase64: string,
  publicKeyBase64: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicKeyBase64);
    const signature = Buffer.from(signatureBase64, "base64");
    const dataBytes = new TextEncoder().encode(data);
    return crypto.subtle.verify("Ed25519", key, signature, dataBytes);
  } catch {
    return false;
  }
}
