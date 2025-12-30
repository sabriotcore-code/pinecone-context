#!/usr/bin/env node
/**
 * Setup Script - Creates the Pinecone index
 * Run: npm run setup
 */

import { validateConfig } from '../config.js';
import { createIndexIfNotExists, getIndexStats } from '../pinecone.js';

async function main() {
  console.log('=== Pinecone Index Setup ===\n');

  validateConfig();
  console.log('Configuration validated.\n');

  await createIndexIfNotExists();

  const stats = await getIndexStats();
  console.log('\nIndex Stats:');
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n=== Setup Complete ===');
}

main().catch(console.error);
