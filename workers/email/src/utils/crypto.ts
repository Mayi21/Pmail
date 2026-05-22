/**
 * Email Content Encryption Utilities
 * Uses AES-GCM for authenticated encryption
 */

/**
 * Derive encryption key from environment secret
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(secret);

  // Hash the secret to get consistent 256-bit key
  const keyHash = await crypto.subtle.digest('SHA-256', keyMaterial);

  return crypto.subtle.importKey(
    'raw',
    keyHash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt email content using AES-GCM
 * Returns base64 encoded string: version(1) + iv(12) + ciphertext + authTag(16)
 *
 * @param plaintext - The content to encrypt (can be null/undefined)
 * @param encryptionKey - The encryption key from environment
 * @returns Encrypted content in base64 format, or null if input is null
 */
export async function encryptEmailContent(
  plaintext: string | null | undefined,
  encryptionKey: string
): Promise<string | null> {
  // Handle null/empty cases
  if (!plaintext) {
    return null;
  }

  try {
    // Derive key from secret
    const key = await deriveKey(encryptionKey);

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encode plaintext
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine version byte + IV + ciphertext
    // Version 1 = AES-GCM-256
    const version = new Uint8Array([1]);
    const result = new Uint8Array(1 + iv.length + encrypted.byteLength);
    result.set(version, 0);
    result.set(iv, 1);
    result.set(new Uint8Array(encrypted), 1 + iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...result));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt email content');
  }
}

/**
 * Decrypt email content using AES-GCM
 *
 * @param encryptedData - Base64 encoded encrypted data
 * @param encryptionKey - The encryption key from environment
 * @returns Decrypted plaintext, or null if input is null
 */
export async function decryptEmailContent(
  encryptedData: string | null | undefined,
  encryptionKey: string
): Promise<string | null> {
  // Handle null/empty cases
  if (!encryptedData) {
    return null;
  }

  try {
    // Decode base64
    const decoded = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract version
    const version = decoded[0];
    if (version !== 1) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }

    // Extract IV (12 bytes)
    const iv = decoded.slice(1, 13);

    // Extract ciphertext
    const ciphertext = decoded.slice(13);

    // Derive key from secret
    const key = await deriveKey(encryptionKey);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    // Decode to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt email content');
  }
}

/**
 * Check if content appears to be encrypted
 * Encrypted content starts with base64 and version byte
 */
export function isEncryptedContent(content: string | null | undefined): boolean {
  if (!content || content.length < 20) {
    return false;
  }

  try {
    // Try to decode base64
    const decoded = atob(content);
    // Check if first byte is version 1
    return decoded.charCodeAt(0) === 1;
  } catch {
    return false;
  }
}
