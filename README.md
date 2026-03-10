# UC Davis AI Academic Advisor

An AI-powered academic advising assistant for UC Davis students. Ask questions about courses, prerequisites, degree requirements, and academic planning.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS 4**
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/react`)
- **OpenAI** GPT-4o-mini + text-embedding-3-small
- **RAG**: In-memory vector search over a static course catalog

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set your OpenAI API key

Create a `.env.local` file in the project root:

```
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Generate embeddings

This pre-computes vector embeddings for the course catalog (one-time step, requires your API key):

```bash
npm run generate-embeddings
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── api/chat/route.ts    # Streaming chat API with RAG
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Main page
│   └── globals.css          # Tailwind styles
├── components/
│   ├── chat.tsx             # Chat container with input
│   ├── message-list.tsx     # Scrollable message list
│   ├── message-bubble.tsx   # User/assistant message rendering
│   └── student-context-panel.tsx  # Major/year/courses sidebar
├── lib/
│   ├── rag.ts               # RAG retrieval
│   ├── embeddings.ts        # Vector search (cosine similarity)
│   ├── system-prompt.ts     # System prompt builder
│   └── course-data.ts       # TypeScript types
├── data/
│   ├── courses.json         # Course catalog (~65 courses)
│   ├── majors/              # Degree requirements
│   └── embeddings.json      # Pre-computed embeddings
└── scripts/
    └── generate-embeddings.ts  # Embedding generation script
```

## Deployment

Deploy to Vercel:

```bash
npx vercel
```

Set the `OPENAI_API_KEY` environment variable in the Vercel dashboard.

**Note:** Make sure `data/embeddings.json` is committed to the repo (not gitignored) so it's available at build time.
