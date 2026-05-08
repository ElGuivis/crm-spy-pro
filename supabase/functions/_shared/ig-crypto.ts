/**
 * AES-256-GCM encryption/decryption for Instagram access tokens.
 * Backward-compatible: detects XOR-encrypted tokens (no IV prefix) and migrates them.
 */

const AES_KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // bits

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("ig-token-encryption-v2"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptTokenAES(token: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(token);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH },
    key,
    encoded
  );

  // Prefix: "aes:" + base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return "aes:" + btoa(String.fromCharCode(...combined));
}

export async function decryptTokenAES(encrypted: string, secret: string): Promise<string> {
  // Detect format
  if (encrypted.startsWith("aes:")) {
    // AES-256-GCM format
    const raw = encrypted.slice(4);
    const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const key = await deriveKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LENGTH },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  // Fallback: legacy XOR decryption
  return decryptTokenXOR(encrypted, secret);
}

/** Legacy XOR decryption for backward compatibility */
function decryptTokenXOR(encrypted: string, key: string): string {
  const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    decrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}
