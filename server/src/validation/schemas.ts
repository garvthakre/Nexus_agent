import { z } from 'zod';

export const promptSchema = z.object({
  prompt: z.string().trim().min(1).max(10000),
});

export const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

export const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

export const apiKeySchema = z.object({
  provider: z.enum(['groq', 'openai', 'anthropic', 'gemini']),
  key: z.string().trim().min(1).max(500),
});
