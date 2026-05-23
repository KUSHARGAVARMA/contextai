# ContextAI — Your Personal Document Intelligence Assistant

> Ask anything about your documents. Get instant answers. No more Ctrl+F.

---

## The Problem

As an engineer, my Google Drive looks like a crime scene.

Resumes in 6 versions. Project specs from 3 years ago. Agreements, statements, notes — all buried somewhere. Every time I needed something specific, I'd spend 10 minutes opening files, searching, scrolling.

So I built ContextAI — an AI assistant that reads all my documents and answers questions about them instantly.

---

## What It Does

```
You ask → "What are my key skills from my latest resume?"
              ↓
Agent searches Google Drive automatically
              ↓
Finds the relevant file
              ↓
RAG pipeline: chunks → embeds → stores in Pinecone
              ↓
Retrieves only the relevant 500 words (not the whole 50,000)
              ↓
Claude answers with full context
              ↓
Next time same file? Instant. (Cache hit ⚡)
```

---

## Features

- 🔍 **Natural language queries** over your Google Drive files
- 🧠 **RAG pipeline** — no token overflow, no hallucination on large docs
- ⚡ **Smart caching** — files indexed once, reused forever
- 🔗 **MCP architecture** — standard protocol, easily extendable to Gmail, Notion, Slack
- 🤖 **Fully autonomous** — agent decides which files to read, no manual selection

---

## Architecture

```
User Question
      ↓
Claude (Anthropic API)
      ↓
MCP Client ──────────► MCP Server (drive-mcp-server.js)
                              ↓
                        Google Drive API
                              ↓
                        File Content
                              ↓
                        RAG Pipeline
                        ┌─────────────┐
                        │  Chunk text │
                        │  Voyage AI  │  ← Embeddings
                        │  Pinecone   │  ← Vector Store
                        │  Search     │  ← Similarity
                        └─────────────┘
                              ↓
                        Relevant Chunks
                              ↓
                        Claude → Final Answer
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Claude (Anthropic) — claude-haiku-4-5 |
| Embeddings | Voyage AI — voyage-3 (1024 dimensions) |
| Vector Store | Pinecone — dense index |
| Drive Integration | Google Drive API v3 + OAuth2 |
| Agent Protocol | MCP (Model Context Protocol) |
| Runtime | Node.js (ESM) |

---

## Project Structure

```
contextai/
├── mcp-agent.js          # Main agent — connects MCP + RAG + Claude
├── drive-mcp-server.js   # MCP server — exposes Google Drive as tools
├── rag-drive.js          # RAG pipeline — embed, store, cache, search
├── index.js              # Standalone web research agent
├── credentials.json      # Google OAuth (gitignored)
├── token.json            # OAuth token (gitignored)
└── .env                  # API keys (gitignored)
```

---

## How It Works — RAG Deep Dive

**The token overflow problem:**

A typical resume is ~5,000 tokens. A rent agreement is ~15,000. Reading 10 Drive files at once = 150,000+ tokens sent to Claude. That's expensive, slow, and hits context limits.

**The RAG solution:**

1. **Chunk** — split document into 2000 character pieces
2. **Embed** — convert each chunk to a 1024-dimension vector via Voyage AI
3. **Store** — save vectors in Pinecone with file metadata
4. **Cache** — check if file already indexed before re-embedding
5. **Search** — embed the question, find top 3 similar chunks
6. **Answer** — send only those 3 chunks (~1500 tokens) to Claude

Result: 100x fewer tokens. Faster. Cheaper. More accurate.

---

## Setup

### Prerequisites
- Node.js v18+
- Anthropic API key
- Voyage AI API key
- Pinecone account (free tier works)
- Google Cloud project with Drive API enabled

### Installation

```bash
git clone https://github.com/KUSHARGAVARMA/contextai
cd contextai
npm install
```

### Environment Variables

```bash
# .env
ANTHROPIC_API_KEY=your_key
VOYAGE_API_KEY=your_key
PINECONE_API_KEY=your_key
```

### Google Drive Setup

1. Go to console.cloud.google.com
2. Create project → Enable Google Drive API
3. Create OAuth2 credentials (Desktop App type)
4. Download as `credentials.json`
5. Run once to authenticate:

```bash
node drive-mcp-server.js
# Opens browser for Google OAuth
# Token saved automatically as token.json
```

### Run

```bash
node mcp-agent.js
```

---

## Example Output

```
🔍 Question: Summarise my latest resume and tell me my key skills

📂 Calling tool: list_files { query: 'resume' }
📂 Calling tool: read_file { fileId: '1oWkk_...' }

🧠 Running RAG on file...
🆕 New file — indexing now...
📄 Indexing: Kushagra_Varma_Resume.pdf
   57 chunks created
   ✅ Indexed 57 chunks

📦 Found 3 relevant chunks

✅ Answer:
Based on your resume, here are your key skills:

Frontend: React.js, JavaScript, HTML, CSS
Backend: Node.js, REST APIs
AI/ML: Claude API, RAG pipelines, MCP, Voyage AI, Pinecone
Tools: Git, Postman, VS Code
Experience: 4.5 years across IoT systems, MarTech, and AI engineering
```

---

## What's Next

- [ ] Source citations — "I found this in file X, page Y"
- [ ] Multi-file reasoning — answer from multiple documents at once
- [ ] Gmail integration — same RAG pipeline over emails
- [ ] Web UI — chat interface for non-technical users
- [ ] Streaming responses

---

## Built By

**Kushagra Varma** — Senior Frontend Engineer · AI Systems  
[GitHub](https://github.com/KUSHARGAVARMA) · [LinkedIn](https://linkedin.com/in/kushagra-varma-97433418b/) · [Portfolio](https://kushagra-varma.vercel.app)

---

*Built in one week. Zero tutorials. Just docs, errors, and stubbornness.*
