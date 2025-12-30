import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './config.js';

let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize Pinecone client (lazy initialization)
 */
export function getPinecone() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
  }
  return pineconeClient;
}

/**
 * Get or create the Pinecone index
 */
export async function getIndex() {
  if (!pineconeIndex) {
    const pc = getPinecone();
    pineconeIndex = pc.index(config.pinecone.indexName);
  }
  return pineconeIndex;
}

/**
 * Create the index if it doesn't exist (serverless)
 */
export async function createIndexIfNotExists() {
  const pc = getPinecone();
  const indexList = await pc.listIndexes();

  const exists = indexList.indexes?.some(idx => idx.name === config.pinecone.indexName);

  if (!exists) {
    console.log(`Creating index: ${config.pinecone.indexName}`);
    await pc.createIndex({
      name: config.pinecone.indexName,
      dimension: config.dimensions,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    console.log('Index created. Waiting for it to be ready...');

    // Wait for index to be ready
    let ready = false;
    while (!ready) {
      await new Promise(r => setTimeout(r, 5000));
      const desc = await pc.describeIndex(config.pinecone.indexName);
      ready = desc.status?.ready;
      if (!ready) console.log('Still initializing...');
    }
    console.log('Index is ready!');
  } else {
    console.log(`Index ${config.pinecone.indexName} already exists`);
  }
}

/**
 * Delete the index (use with caution!)
 */
export async function deleteIndex() {
  const pc = getPinecone();
  await pc.deleteIndex(config.pinecone.indexName);
  console.log(`Index ${config.pinecone.indexName} deleted`);
}

/**
 * Get index statistics
 */
export async function getIndexStats() {
  const index = await getIndex();
  const stats = await index.describeIndexStats();
  return stats;
}
