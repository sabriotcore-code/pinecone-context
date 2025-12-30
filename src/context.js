import { getIndex } from './pinecone.js';
import { generateEmbedding, generateEmbeddings, chunkText } from './embeddings.js';
import crypto from 'crypto';

/**
 * Generate a unique ID for a context entry
 */
function generateId(text, metadata = {}) {
  const hash = crypto.createHash('md5')
    .update(text + JSON.stringify(metadata))
    .digest('hex')
    .slice(0, 16);
  return `ctx_${hash}`;
}

/**
 * Store context in Pinecone
 * @param {string} text - The text content to store
 * @param {object} metadata - Additional metadata (project, file, type, etc.)
 */
export async function storeContext(text, metadata = {}) {
  const index = await getIndex();

  // Chunk if text is too long
  const chunks = chunkText(text);
  const embeddings = await generateEmbeddings(chunks);

  const vectors = chunks.map((chunk, i) => ({
    id: generateId(chunk, { ...metadata, chunkIndex: i }),
    values: embeddings[i],
    metadata: {
      ...metadata,
      text: chunk,
      chunkIndex: i,
      totalChunks: chunks.length,
      timestamp: new Date().toISOString(),
    },
  }));

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await index.upsert(batch);
  }

  console.log(`Stored ${vectors.length} vector(s) for context`);
  return vectors.map(v => v.id);
}

/**
 * Search for relevant context
 * @param {string} query - The search query
 * @param {object} filter - Metadata filter (e.g., { project: 'rei-dashboard' })
 * @param {number} topK - Number of results to return
 */
export async function searchContext(query, filter = {}, topK = 5) {
  const index = await getIndex();

  const queryEmbedding = await generateEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    includeMetadata: true,
  });

  return results.matches.map(match => ({
    id: match.id,
    score: match.score,
    text: match.metadata?.text,
    metadata: match.metadata,
  }));
}

/**
 * Store a conversation turn
 */
export async function storeConversation(role, content, metadata = {}) {
  return storeContext(content, {
    ...metadata,
    type: 'conversation',
    role,
  });
}

/**
 * Store a code file
 */
export async function storeCodeFile(filePath, content, metadata = {}) {
  return storeContext(content, {
    ...metadata,
    type: 'code',
    filePath,
    language: getLanguageFromPath(filePath),
  });
}

/**
 * Store project documentation
 */
export async function storeDocumentation(title, content, metadata = {}) {
  return storeContext(content, {
    ...metadata,
    type: 'documentation',
    title,
  });
}

/**
 * Get relevant context for a query (combines multiple types)
 */
export async function getRelevantContext(query, options = {}) {
  const {
    project = null,
    types = null,
    topK = 10,
  } = options;

  const filter = {};
  if (project) filter.project = project;
  if (types && types.length > 0) {
    filter.type = { $in: types };
  }

  const results = await searchContext(query, filter, topK);

  // Group by type for easier consumption
  const grouped = {
    conversation: [],
    code: [],
    documentation: [],
    other: [],
  };

  for (const result of results) {
    const type = result.metadata?.type || 'other';
    if (grouped[type]) {
      grouped[type].push(result);
    } else {
      grouped.other.push(result);
    }
  }

  return {
    all: results,
    grouped,
    contextString: formatContextForPrompt(results),
  };
}

/**
 * Format context results into a string for LLM prompt
 */
function formatContextForPrompt(results) {
  if (results.length === 0) return '';

  const sections = results.map(r => {
    const meta = r.metadata || {};
    let header = '';

    if (meta.type === 'code') {
      header = `[Code: ${meta.filePath}]`;
    } else if (meta.type === 'conversation') {
      header = `[${meta.role}]`;
    } else if (meta.type === 'documentation') {
      header = `[Doc: ${meta.title}]`;
    } else {
      header = `[Context]`;
    }

    return `${header}\n${r.text}`;
  });

  return sections.join('\n\n---\n\n');
}

/**
 * Delete context by filter
 */
export async function deleteContext(filter) {
  const index = await getIndex();
  await index.deleteMany(filter);
  console.log('Deleted context matching filter:', filter);
}

/**
 * Helper to detect language from file path
 */
function getLanguageFromPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
  };
  return langMap[ext] || 'unknown';
}
