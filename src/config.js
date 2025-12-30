import 'dotenv/config';

export const config = {
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX_NAME || 'claude-context',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: 'text-embedding-3-small', // Cost-effective, good quality
  },
  // Vector dimensions for text-embedding-3-small
  dimensions: 1536,
};

export function validateConfig() {
  const missing = [];
  if (!config.pinecone.apiKey) missing.push('PINECONE_API_KEY');
  if (!config.openai.apiKey) missing.push('OPENAI_API_KEY');

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Copy .env.example to .env and fill in your API keys');
    process.exit(1);
  }
}
