import OpenAI from 'openai';
import { config } from './config.js';

let openaiClient = null;

/**
 * Get OpenAI client (lazy initialization)
 */
function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiClient;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text) {
  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts) {
  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: texts,
  });

  return response.data.map(d => d.embedding);
}

/**
 * Chunk text into smaller pieces for embedding
 */
export function chunkText(text, maxChunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const breakPoints = ['\n\n', '\n', '. ', '! ', '? '];
      for (const bp of breakPoints) {
        const lastBreak = text.lastIndexOf(bp, end);
        if (lastBreak > start + maxChunkSize / 2) {
          end = lastBreak + bp.length;
          break;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 0);
}
