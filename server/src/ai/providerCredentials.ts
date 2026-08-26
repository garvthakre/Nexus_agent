import { prisma } from '../db/prisma';
import { decryptKey } from '../utils/encryption';

const environmentKeys: Record<string, string> = {
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export async function getProviderKey(provider: string, userId?: string): Promise<string | undefined> {
  if (userId) {
    const stored = await prisma.userApiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (stored) return decryptKey(stored.encryptedKey);
  }
  return process.env[environmentKeys[provider]];
}
