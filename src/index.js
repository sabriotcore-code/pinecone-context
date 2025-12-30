// Main exports for the pinecone-context package
export { config, validateConfig } from './config.js';
export {
  getPinecone,
  getIndex,
  createIndexIfNotExists,
  deleteIndex,
  getIndexStats,
} from './pinecone.js';
export {
  generateEmbedding,
  generateEmbeddings,
  chunkText,
} from './embeddings.js';
export {
  storeContext,
  searchContext,
  storeConversation,
  storeCodeFile,
  storeDocumentation,
  getRelevantContext,
  deleteContext,
} from './context.js';
