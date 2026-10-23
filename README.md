<div align="center">

#  ChatAI - Modern Multi-Provider AI Assistant

<p align="center">
  <strong>A blazing-fast, secure, and versatile AI assistant connecting to multiple AI providers</strong>
</p>

<p align="center">
  <!-- Version & Package -->
  <a href="https://www.npmjs.com/package/@bao826078/chatai"><img src="https://img.shields.io/npm/v/@bao826078/chatai?color=3b82f6&label=npm%20package&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/bao826078-glitch/ChatAI/releases"><img src="https://img.shields.io/github/v/release/bao826078-glitch/ChatAI?color=10b981&label=Release" alt="GitHub release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?logo=apache" alt="License" /></a>
  
  <!-- Docker & Platforms -->
  <a href="https://hub.docker.com/r/bao826078/chatai"><img src="https://img.shields.io/docker/pulls/bao826078/chatai?color=0284c7&logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey?logo=linux" alt="Platforms" />
  <img src="https://img.shields.io/badge/Docker%20Arch-amd64%20%7C%20arm64-blue?logo=docker" alt="Docker Architecture" />

  <!-- Tech Stack -->
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8.3-646cff?logo=vite" alt="Vite" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?logo=node.js" alt="Node.js" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/Database-SQLite%20(sql.js)-003b57?logo=sqlite" alt="SQLite" /></a>
</p>

<p align="center">
  🇻🇳 <a href="https://github.com/bao826078-glitch/ChatAI/blob/main/docs/README_VI.md">Xem tài liệu tiếng Việt</a>
  <br><br>
  <a href="#-features">Features</a> •
  <a href="#-quick-setup">Quick Setup</a> •
  <a href="#-docker--docker-compose">Docker</a> •
  <a href="#-ai-providers">AI Providers</a> •
  <a href="#-project-structure">Structure</a> •
  <a href="#-environmental-variables">Configuration</a> •
  <a href="#-license">License</a>
</p>

---

</div>

## 🌟 Introduction

**ChatAI** is a seamless, lightweight, and highly flexible AI-powered chat platform designed to connect directly with leading AI providers worldwide—without relying on any single fixed intermediary service.

The application features dual-layer persistence (localStorage via the browser and persistent SQLite backend), ultra-smooth real-time Server-Sent Events (SSE) streaming, Vietnamese speech recognition and synthesis, and a detailed analytics dashboard for tracking token usage, message volume, and project costs over time.

---

## ✨ Key Features

### 🔌 Multi-Provider Support with Dynamic Model Discovery
- **5 Major Provider Categories**: OpenAI, Google Gemini, Anthropic Claude, 9Router, and any OpenAI-compatible API (e.g., DeepSeek, Groq, Together AI, OpenRouter, Mistral, Local).
- **Dynamic Model Fetching**: Automatically queries the latest model listings using your API key—no hardcoded fallback lists, ensuring you always have access to the most up-to-date options.
- **Secure API Key Management**: API keys are encrypted and stored exclusively on the client-side (or configured via server-level environment variables). The backend acts solely as a connection proxy, preventing any key exposure.

### ⚡ Real-Time Interaction & Enhanced Markdown Rendering
- **Server-Sent Events (SSE) Streaming**: Delivers responses in real-time with a smooth, reactive user experience.
- **Rich Markdown Support**: Displays tables, code blocks, blockquotes, formulas, and more, with a convenient single-click code copy feature.
- **Voice and Text Capabilities**: Vietnamese (vi-VN) Web Speech API for dictation, customizable system prompts, and responsive Text-to-Speech (TTS) for reading AI replies aloud.
- **Advanced Configuration**: Fine-tune the `Temperature` parameter, enter custom system instructions, or choose from preset professional prompts (General Assistant, Code Developer, Translator, etc.).

### 📊 Professional Token Analytics & Cost Estimation
- **Visual Data Visualization (Recharts)**: Analyze token usage, message volume, and conversation trends by day within each month, accompanied by intuitive charts.
- **Multi-Currency Cost Estimation**: Display daily and monthly usage statistics in both USD and Vietnamese Dong (VND).
- **6-Month Comparative Analysis**: Compare consumption trends across the last 6 months with monthly breakdowns for better financial insights.
- **Dual Persistence Strategy**: Token metrics are auto-saved continuously to both LocalStorage at the browser level and SQLite in the backend for long-term reliability.

---

## 🚀 Quick Setup

### System Requirements
- **Node.js**: Version 18.0 or higher (Node.js 20 LTS or 22 LTS recommended).
- **Package Managers**: npm, yarn, pnpm, or bun.

### 1. Run Instantly without Cloning (npx Global Package)
If you only need to launch ChatAI now, you can run it directly via npx:
```bash
npx @bao826078/chatai
```

An alternative global installation:
```bash
npm install -g @bao826078/chatai
chatai --port 8088
```
Warning: This npm installation method is not currently supported. I will add support for it in the future!!
---

### 2. Development Mode (Clone & Run)

```bash
# Clone the repository
git clone https://github.com/bao826078-glitch/ChatAI.git
cd ChatAI

# Install dependencies
npm install

# Start development server (includes Vite HMR)
npm run dev
```

Access the application in your browser at: **`http://localhost:8088`**

---

### 3. Production Build & Deployment

```bash
# Build the distributable
npm run build

# Run the production build in Node.js
npm start
```

The app will run on port 8088 by default, or you can override it using:
```bash
npm run dev -- --port 3000
```

---

## 🐳 Docker & Docker Compose Deployment

### Using Docker CLI

```bash
docker run -d \
  --name chatai \
  -p 8088:8088 \
  -v chatai_data:/data \
  --restart unless-stopped \
  bao826078/chatai:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  chatai:
    image: bao826078/chatai:latest
    container_name: chatai
    restart: unless-stopped
    ports:
      - "8088:8088"
    environment:
      - NODE_ENV=production
      - PORT=8088
      - DB_PATH=/data/chatai.db
      # Optional: Pre-load a default Gemini API key for local networks
      # - GEMINI_API_KEY=AIzaSy...
    volumes:
      - chatai_data:/data

volumes:
  chatai_data:
```

Start the container:
```bash
docker compose up -d
```

Access ChatAI at `http://localhost:8088`.

---

## 🔌 Supported AI Providers

| Provider | API Key Format | Representative Models | Notes |
|:---|:---|:---|:---|
| **OpenAI** | `sk-...` | GPT-4o, GPT-4o-mini, o1, o3-mini | SSE streaming, dynamic model listing via `/v1/models` |
| **Google Gemini** | `AIzaSy...` | Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 | Native integration via `@google/genai` SDK |
| **Anthropic** | `sk-ant-...` | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | Anthropic Message API standard |
| **9Router** | Custom Key | Full suite of integrated models | Intelligent AI gateway and cost optimization |
| **Custom / OpenAI-Compatible** | Flexible | DeepSeek-V3/R1, Llama 3.3, Qwen, Mistral | Groq Cloud, OpenRouter, Together AI, Ollama, etc. |

---

## ⚙️ Environment Configuration (.env)

Create an `.env` file in the project root for configuration options:

```env
# Application port (default: 8088)
PORT=8088

# Environment mode ('production' or 'development')
NODE_ENV=production

# Local SQLite database path
DB_PATH=data/chatai.db

# Optional: Default system-wide Gemini API key (useful for sharing within internal network)
GEMINI_API_KEY=
```

---

## 📁 Project Structure

```
ChatAI/
├── .github/
│   └── workflows/
│       └── docker-image.yml   # Auto-builds multi-platform Docker images (amd64, arm64)
├── bin/
│   └── cli.cjs                # CLI entry point for running npx/npm distributions
├── server/
│   └── db.ts                  # SQLite database management (conversations, messages, token usage)
├── src/
│   ├── components/
│   │   ├── AnalyticsModal.tsx # Token & cost analytics dashboard (Recharts)
│   │   ├── ApiKeyModal.tsx    # API key and provider gateway configuration
│   │   ├── ChatInput.tsx      # Input toolbar with voice-to-text support
│   │   ├── ChatMessage.tsx    # Chat bubble, TTS playback, copy actions
│   │   ├── Header.tsx         # Top navigation bar
│   │   ├── HelpModal.tsx      # Help text and keyboard shortcuts guide
│   │   ├── MarkdownView.tsx   # Render Markdown with syntax highlighting
│   │   └── Sidebar.tsx        # Conversation list, temperature and system prompt settings
│   ├── utils/
│   │   ├── analytics.ts       # Token analytics calculation logic (daily/monthly)
│   │   └── tokenEstimator.ts  # Multi-language token estimation utility
│   ├── App.tsx                # Main application interface + Chat state management
│   ├── index.css              # Theme overrides and Tailwind CSS configuration
│   ├── main.tsx               # React 19 application entry point
│   └── types.ts               # Shared TypeScript type definitions
├── Dockerfile                 # Optimized multi-stage build with Alpine Linux
├── Docker-Compose-example.yaml# Production deployment configuration snippet
├── package.json               # Dependency declarations and script configuration
├── server.ts                  # Express backend with SSE streaming and multi-provider proxy
├── tsconfig.json              # TypeScript compiler configuration
└── vite.config.ts             # Vite build and bundling configuration
```

---

## 🛠️ Technology Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/).
- **Backend**: [Express.js](https://expressjs.com/), [tsx](https://github.com/privatenumber/tsx), [esbuild](https://esbuild.github.io/).
- **Database & Storage**: [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly/Node), LocalStorage client-side sync.
- **AI SDK**: [@google/genai](https://www.npmjs.com/package/@google/genai), SSE streaming via fetch.
- **Data Visualization**: [Recharts](https://recharts.org/), [Marked](https://marked.js.org/) for Markdown rendering.

---

## 📜 License

This project is released under the **Apache License 2.0**. See [LICENSE](LICENSE) for details.

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/bao826078-glitch">bao826078</a></sub>
</div>
