type ChromaCollectionName = 'user_context' | 'tool_examples' | 'selector_memory';

export type ChromaSearchResult = {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  distance?: number;
};

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export async function generateEmbedding(text: string, dims = 384): Promise<number[]> {
  const safeText = (text ?? '').trim();
  if (!safeText) return new Array(dims).fill(0);

  const vector = new Array(dims).fill(0);
  [...safeText].forEach((char, index) => {
    const code = char.charCodeAt(0);
    const offset = (index * 7 + code) % dims;
    vector[offset] += (code + 1) / 10;
  });

  const seed = hashText(safeText);
  for (let i = 0; i < dims; i += 1) {
    vector[i] += ((seed >> (i % 16)) & 0xff) / 256;
  }

  return vector.map((value) => Number(value.toFixed(6)));
}

function loadChromaModule(): any | null {
  try {
    return require('chromadb');
  } catch {
    return null;
  }
}

async function getClient(): Promise<any | null> {
  const chroma = loadChromaModule();
  if (!chroma) return null;

  const ChromaClient = chroma.ChromaClient ?? chroma.default ?? null;
  if (!ChromaClient) return null;

  try {
    const path = process.env.CHROMA_URL ?? 'http://localhost:8000';
    return new ChromaClient({ path });
  } catch {
    try {
      return new ChromaClient();
    } catch {
      return null;
    }
  }
}

async function getCollection(name: ChromaCollectionName): Promise<any | null> {
  const client = await getClient();
  if (!client) return null;

  try {
    return await client.getOrCreateCollection({
      name,
      metadata: { 'hnsw:space': 'cosine' },
    });
  } catch {
    return null;
  }
}

async function addDocument(collectionName: ChromaCollectionName, payload: {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  userId?: string;
}): Promise<void> {
  const collection = await getCollection(collectionName);
  if (!collection) return;

  const embedding = await generateEmbedding(payload.text, 384);
  const record: Record<string, unknown> = {
    ...payload.metadata,
    ...(payload.userId ? { userId: payload.userId } : {}),
  };

  try {
    await collection.upsert({
      ids: [payload.id],
      embeddings: [embedding],
      metadatas: [record],
      documents: [payload.text],
    });
  } catch (error) {
    console.warn('[Chroma] Upsert failed for collection', collectionName, (error as Error).message);
  }
}

async function searchDocuments(
  collectionName: ChromaCollectionName,
  query: string,
  limit: number,
  where?: Record<string, unknown>,
): Promise<ChromaSearchResult[]> {
  const collection = await getCollection(collectionName);
  if (!collection) return [];

  const embedding = await generateEmbedding(query, 384);

  try {
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: where && Object.keys(where).length > 0 ? where : undefined,
    });

    const documents: ChromaSearchResult[] = (result.documents ?? [[]])[0]?.map((doc: string, index: number) => ({
      id: (result.ids ?? [[]])[0]?.[index] ?? `${collectionName}-${index}`,
      document: doc,
      metadata: (result.metadatas ?? [[]])[0]?.[index] ?? {},
      distance: (result.distances ?? [[]])[0]?.[index] ?? undefined,
    })) ?? [];

    return documents;
  } catch (error) {
    console.warn('[Chroma] Query failed for collection', collectionName, (error as Error).message);
    return [];
  }
}

export async function addUserMemory(input: {
  userId: string;
  summary: string;
  intent: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await addDocument('user_context', {
    id: `user-${input.userId}-${Date.now()}`,
    text: `${input.intent}\n${input.summary}`,
    userId: input.userId,
    metadata: {
      userId: input.userId,
      intent: input.intent,
      summary: input.summary,
      createdAt: new Date().toISOString(),
      ...(input.metadata ?? {}),
    },
  });
}

export async function searchUserContext(userId: string, query: string, limit = 3): Promise<ChromaSearchResult[]> {
  return searchDocuments('user_context', query, limit, { userId });
}

export async function addToolExample(input: {
  category: string;
  request: string;
  keywords: string[];
  steps: unknown[];
}): Promise<void> {
  await addDocument('tool_examples', {
    id: `tool-${input.category}-${Date.now()}`,
    text: `${input.category}\n${input.request}\n${input.keywords.join(' ')}`,
    metadata: {
      category: input.category,
      request: input.request,
      keywords: input.keywords,
      steps: input.steps,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function searchToolExamples(query: string, limit = 3): Promise<ChromaSearchResult[]> {
  return searchDocuments('tool_examples', query, limit);
}

export async function addSelectorMemory(input: {
  domain: string;
  hint: string;
  selector: string;
  description?: string;
}): Promise<void> {
  await addDocument('selector_memory', {
    id: `selector-${input.domain}-${hashText(input.hint + input.selector)}`,
    text: `${input.domain}\n${input.hint}\n${input.description ?? input.selector}`,
    metadata: {
      domain: input.domain,
      hint: input.hint,
      selector: input.selector,
      description: input.description ?? input.selector,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function searchSelectorMemory(domain: string, hint: string, limit = 3): Promise<ChromaSearchResult[]> {
  return searchDocuments('selector_memory', `${domain} ${hint}`, limit, { domain });
}
