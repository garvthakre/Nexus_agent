import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getKey(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error('ENCRYPTION_KEY is required');
  return createHashKey(value);
}

function createHashKey(value: string): Buffer {
  return Buffer.from(value.padEnd(32, '0').slice(0, 32), 'utf8');
}

export function encryptKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptKey(value: string): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split('.');
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error('Invalid encrypted API key');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivEncoded, 'base64'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
