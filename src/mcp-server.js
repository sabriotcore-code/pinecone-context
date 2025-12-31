#!/usr/bin/env node
/**
 * Pinecone MCP Server
 * Provides Claude Code with tools to search and manage context in Pinecone
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Configuration
const config = {
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX_NAME || 'claude-context',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: 'text-embedding-3-small',
  },
};

// Lazy-initialized clients
let pinecone = null;
let openai = null;
let index = null;

function getPinecone() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: config.pinecone.apiKey });
  }
  return pinecone;
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openai;
}

async function getIndex() {
  if (!index) {
    index = getPinecone().index(config.pinecone.indexName);
  }
  return index;
}

// Generate embedding for search query
async function generateEmbedding(text) {
  const response = await getOpenAI().embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
  });
  return response.data[0].embedding;
}

// Tool implementations
async function searchContext(query, project = null, topK = 5) {
  const idx = await getIndex();
  const queryEmbedding = await generateEmbedding(query);

  const filter = project ? { project: { $eq: project } } : undefined;

  const results = await idx.query({
    vector: queryEmbedding,
    topK,
    filter,
    includeMetadata: true,
  });

  return results.matches.map(match => ({
    score: match.score,
    text: match.metadata?.text,
    project: match.metadata?.project,
    type: match.metadata?.type,
    filePath: match.metadata?.filePath,
  }));
}

async function listProjects() {
  const idx = await getIndex();
  const stats = await idx.describeIndexStats();
  return {
    totalVectors: stats.totalRecordCount,
    dimension: stats.dimension,
    namespaces: stats.namespaces,
  };
}

async function indexText(text, project, type = 'text', metadata = {}) {
  const idx = await getIndex();
  const embedding = await generateEmbedding(text);

  const id = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await idx.upsert([{
    id,
    values: embedding,
    metadata: {
      text,
      project,
      type,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  }]);

  return { id, success: true };
}

// Create MCP Server
const server = new Server(
  {
    name: 'pinecone-context',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'pinecone_search',
        description: 'Search for relevant context in the Pinecone vector database. Use this to find code, documentation, or conversation history related to a query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query - what you want to find context about',
            },
            project: {
              type: 'string',
              description: 'Optional: Filter by project name (e.g., "rei-dashboard", "cloud-orchestrator", "rei-api")',
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 5, max: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'pinecone_stats',
        description: 'Get statistics about the Pinecone index - total vectors, projects indexed, etc.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'pinecone_remember',
        description: 'Store important context in Pinecone for future retrieval. Use this to remember key information, decisions, or learnings.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text/context to remember',
            },
            project: {
              type: 'string',
              description: 'Project this context belongs to',
            },
            type: {
              type: 'string',
              description: 'Type of context: "note", "decision", "learning", "conversation"',
              enum: ['note', 'decision', 'learning', 'conversation'],
            },
          },
          required: ['text', 'project'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'pinecone_search': {
        const results = await searchContext(
          args.query,
          args.project || null,
          Math.min(args.topK || 5, 20)
        );

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No relevant context found.' }],
          };
        }

        const formatted = results.map((r, i) => {
          let header = `[${i + 1}] Score: ${r.score.toFixed(3)}`;
          if (r.project) header += ` | Project: ${r.project}`;
          if (r.type) header += ` | Type: ${r.type}`;
          if (r.filePath) header += `\nFile: ${r.filePath}`;
          return `${header}\n${r.text}`;
        }).join('\n\n---\n\n');

        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'pinecone_stats': {
        const stats = await listProjects();
        return {
          content: [{
            type: 'text',
            text: `Pinecone Index Stats:\n- Total Vectors: ${stats.totalVectors}\n- Dimensions: ${stats.dimension}\n- Index: ${config.pinecone.indexName}`,
          }],
        };
      }

      case 'pinecone_remember': {
        const result = await indexText(
          args.text,
          args.project,
          args.type || 'note'
        );
        return {
          content: [{
            type: 'text',
            text: `Stored context with ID: ${result.id}`,
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pinecone MCP Server running');
}

main().catch(console.error);
