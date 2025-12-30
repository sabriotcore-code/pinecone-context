#!/usr/bin/env node
/**
 * Test Script - Verify Pinecone and OpenAI connections
 * Run: npm test
 */

import { validateConfig, config } from '../config.js';
import { getPinecone, getIndexStats } from '../pinecone.js';
import { generateEmbedding } from '../embeddings.js';

async function main() {
  console.log('=== Connection Test ===\n');

  // 1. Validate config
  console.log('1. Checking configuration...');
  validateConfig();
  console.log('   Configuration OK\n');

  // 2. Test Pinecone connection
  console.log('2. Testing Pinecone connection...');
  try {
    const pc = getPinecone();
    const indexes = await pc.listIndexes();
    console.log(`   Connected! Found ${indexes.indexes?.length || 0} index(es)`);

    if (indexes.indexes?.some(idx => idx.name === config.pinecone.indexName)) {
      const stats = await getIndexStats();
      console.log(`   Index "${config.pinecone.indexName}" has ${stats.totalRecordCount || 0} vectors`);
    } else {
      console.log(`   Index "${config.pinecone.indexName}" not found. Run: npm run setup`);
    }
  } catch (err) {
    console.error('   Pinecone Error:', err.message);
    process.exit(1);
  }
  console.log();

  // 3. Test OpenAI embeddings
  console.log('3. Testing OpenAI embeddings...');
  try {
    const testText = 'This is a test embedding for Pinecone context storage.';
    const embedding = await generateEmbedding(testText);
    console.log(`   Generated embedding with ${embedding.length} dimensions`);
  } catch (err) {
    console.error('   OpenAI Error:', err.message);
    process.exit(1);
  }
  console.log();

  console.log('=== All Tests Passed ===');
}

main().catch(console.error);
