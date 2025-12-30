#!/usr/bin/env node
/**
 * Index Context Script - Add content to Pinecone
 * Run: npm run index -- --file <path> --project <name>
 *      npm run index -- --text "some text" --project <name>
 */

import fs from 'fs';
import path from 'path';
import { validateConfig } from '../config.js';
import { storeContext, storeCodeFile, storeDocumentation } from '../context.js';

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
  console.log('=== Index Context ===\n');

  validateConfig();

  const args = parseArgs();

  if (!args.file && !args.text) {
    console.log('Usage:');
    console.log('  npm run index -- --file <path> --project <name> [--type code|doc|text]');
    console.log('  npm run index -- --text "content" --project <name>');
    console.log('  npm run index -- --dir <path> --project <name> --ext js,ts,py');
    process.exit(1);
  }

  const metadata = {
    project: args.project || 'default',
  };

  // Index a single file
  if (args.file) {
    const filePath = path.resolve(args.file);
    const content = fs.readFileSync(filePath, 'utf-8');

    if (args.type === 'doc') {
      await storeDocumentation(path.basename(filePath), content, metadata);
    } else {
      await storeCodeFile(filePath, content, metadata);
    }
    console.log(`Indexed: ${filePath}`);
  }

  // Index raw text
  if (args.text) {
    await storeContext(args.text, { ...metadata, type: args.type || 'text' });
    console.log('Indexed text content');
  }

  // Index a directory
  if (args.dir) {
    const dirPath = path.resolve(args.dir);
    const extensions = (args.ext || 'js,ts,py,md').split(',').map(e => `.${e.trim()}`);

    const files = getAllFiles(dirPath, extensions);
    console.log(`Found ${files.length} files to index`);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      await storeCodeFile(file, content, metadata);
      console.log(`Indexed: ${file}`);
    }
  }

  console.log('\n=== Indexing Complete ===');
}

function getAllFiles(dir, extensions) {
  const files = [];

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        // Skip common non-code directories
        if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(item.name)) {
          walk(fullPath);
        }
      } else if (extensions.some(ext => item.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

main().catch(console.error);
