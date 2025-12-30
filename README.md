# Pinecone Context

Claude Code context persistence using Pinecone vector database. Store conversations, code files, and documentation for semantic retrieval.

## Quick Start

### 1. Get Your API Keys

**Pinecone:**
1. Go to [pinecone.io](https://www.pinecone.io/)
2. Sign up for free account
3. Create an API key in the console
4. Copy the API key

**OpenAI (for embeddings):**
- You already have this: Use your existing `OPENAI_API_KEY`

### 2. Configure Environment

```bash
# Clone the repo
git clone https://github.com/sabriotcore-code/pinecone-context.git
cd pinecone-context

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit `.env`:
```env
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=claude-context
OPENAI_API_KEY=your-openai-api-key
```

### 3. Setup & Test

```bash
# Test connections
npm test

# Create the Pinecone index (first time only)
npm run setup
```

## Usage

### Index Content

```bash
# Index a single file
npm run index -- --file ./src/app.js --project rei-dashboard

# Index a directory
npm run index -- --dir ./src --project rei-dashboard --ext js,ts

# Index documentation
npm run index -- --file ./README.md --project rei-dashboard --type doc

# Index raw text
npm run index -- --text "Important context here" --project rei-dashboard
```

### Search Context

```bash
# Basic search
npm run search -- --query "how does authentication work"

# Search within a project
npm run search -- --query "API endpoints" --project rei-dashboard

# Get more results
npm run search -- --query "error handling" --top 10 --verbose
```

### Programmatic Usage

```javascript
import {
  storeContext,
  storeCodeFile,
  searchContext,
  getRelevantContext
} from './src/index.js';

// Store context
await storeContext('This is important context', {
  project: 'my-project',
  type: 'note'
});

// Store a code file
await storeCodeFile('./src/app.js', fileContent, {
  project: 'my-project'
});

// Search
const results = await searchContext('how to handle errors', {
  project: 'my-project'
}, 5);

// Get formatted context for LLM
const context = await getRelevantContext('authentication flow', {
  project: 'my-project',
  types: ['code', 'documentation'],
  topK: 10
});

console.log(context.contextString); // Ready for prompt injection
```

## Architecture

```
pinecone-context/
├── src/
│   ├── index.js        # Main exports
│   ├── config.js       # Configuration & validation
│   ├── pinecone.js     # Pinecone client & index management
│   ├── embeddings.js   # OpenAI embedding generation
│   ├── context.js      # High-level context operations
│   └── scripts/
│       ├── setup-index.js      # npm run setup
│       ├── test-connection.js  # npm test
│       ├── index-context.js    # npm run index
│       └── search.js           # npm run search
├── .env.example
├── package.json
└── README.md
```

## Metadata Schema

Each vector stored includes:
- `text` - The actual content chunk
- `type` - conversation | code | documentation | text
- `project` - Project identifier for filtering
- `timestamp` - When it was indexed
- `filePath` - (for code) Original file path
- `language` - (for code) Detected programming language
- `role` - (for conversation) user | assistant
- `title` - (for documentation) Document title
- `chunkIndex` - Position in chunked content
- `totalChunks` - Total chunks for this content

## Cost Estimates

| Component | Free Tier | Paid |
|-----------|-----------|------|
| Pinecone | 100K vectors | $0.00033/1K vectors/hr |
| OpenAI text-embedding-3-small | - | $0.00002/1K tokens |

**Example:** 10K code files (~50K vectors, ~5M tokens)
- Monthly Pinecone: ~$12
- One-time indexing: ~$0.10
- Queries: ~$0.02/1000 searches

## License

MIT
