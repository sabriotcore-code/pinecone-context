#!/usr/bin/env node
/**
 * Search Script - Query Pinecone for relevant context
 * Run: npm run search -- --query "your search" --project <name>
 */

import { validateConfig } from '../config.js';
import { getRelevantContext, searchContext } from '../context.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result[key] = value;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

async function main() {
  validateConfig();

  const args = parseArgs();

  if (!args.query) {
    console.log('Usage:');
    console.log('  npm run search -- --query "your search query" [--project <name>] [--top 5]');
    process.exit(1);
  }

  const topK = parseInt(args.top) || 5;

  console.log(`\nSearching for: "${args.query}"`);
  if (args.project) console.log(`Project filter: ${args.project}`);
  console.log(`Top K: ${topK}\n`);

  const results = await getRelevantContext(args.query, {
    project: args.project || null,
    topK,
  });

  console.log(`Found ${results.all.length} results:\n`);

  for (let i = 0; i < results.all.length; i++) {
    const r = results.all[i];
    console.log(`--- Result ${i + 1} (score: ${r.score.toFixed(4)}) ---`);
    console.log(`Type: ${r.metadata?.type || 'unknown'}`);
    if (r.metadata?.filePath) console.log(`File: ${r.metadata.filePath}`);
    if (r.metadata?.title) console.log(`Title: ${r.metadata.title}`);
    console.log(`\n${r.text?.slice(0, 500)}${r.text?.length > 500 ? '...' : ''}\n`);
  }

  // Show context string that would go to LLM
  if (args.verbose) {
    console.log('\n=== Context String for LLM ===\n');
    console.log(results.contextString);
  }
}

main().catch(console.error);
