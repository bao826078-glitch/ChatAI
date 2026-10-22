<div align="center">

# 🤖 ChatAI - Modern Multi-Provider AI Assistant

<p align="center">
  <strong>Ứng dụng Chat AI đa nhà cung cấp, tốc độ cao, giao diện tinh tế & bảo mật tuyệt đối</strong>
</p>

<p align="center">
  <!-- Version & Package -->
  <a href="https://www.npmjs.com/package/@bao826078/chatai"><img src="https://img.shields.io/npm/v/@bao826078/chatai?color=3b82f6&label=npm%20package&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/bao826078-glitch/ChatAI/releases"><img src="https://img.shields.io/github/v/release/bao826078-glitch/ChatAI?color=10b981&label=Release" alt="GitHub release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?logo=apache" alt="License" /></a>
  
  <!-- Docker & Platforms -->
  <a href="https://hub.docker.com/r/bao826078/chatai"><img src="https://img.shields.io/docker/pulls/bao826078/chatai?color=0284c7&logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey?logo=linux" alt="Platforms" />
  <img src="https://img.shields.io/badge/Docker%20Arch-amd64%20%7C%20arm64-blue?logo=docker" alt="Docker Arch" />

  <!-- Tech Stack -->
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8.3-646cff?logo=vite" alt="Vite" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS v4" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?logo=node.js" alt="Node.js" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/Database-SQLite%20(sql.js)-003b57?logo=sqlite" alt="SQLite" /></a>
</p>

<p align="center">
  <a href="#-tính-năng-nổi-bật">Tính Năng</a> •
  <a href="#-cài-đặt--khởi-chạy-nhanh">Cài Đặt Nhanh</a> •
  <a href="#-triển-khai-docker--docker-compose">Docker</a> •
  <a href="#-nhà-cung-cấp-ai-hỗ-trợ">Nhà Cung Cấp</a> •
  <a href="#-cấu-trúc-dự-án">Cấu Trúc</a> •
  <a href="#-biến-môi-trường">Cấu Hình</a> •
  <a href="#-giấy-phép">Giấy Phép</a>
</p>

---

</div>

## 🌟 Giới Thiệu

**ChatAI** là ứng dụng trò chuyện AI trực quan, nhẹ và linh hoạt, được thiết kế để kết nối trực tiếp với các nhà cung cấp AI hàng đầu thế giới mà không phụ thuộc vào một dịch vụ trung gian cố định. 

Ứng dụng hỗ trợ cơ chế lưu trữ hai lớp (trình duyệt qua LocalStorage và máy chủ backend qua SQLite lưu trữ bền vững), tính năng SSE Realtime Streaming siêu mượt, nhận diện giọng nói (Voice-to-Text), đọc to văn bản (TTS), cùng trang phân tích và biểu đồ tiêu thụ Token chi tiết theo ngày & tháng.

---

## ✨ Tính Năng Nổi Bật

### 🔌 Đa Nhà Cung Cấp & Tự Động Quét Model
- **Hỗ trợ 5 nhóm nhà cung cấp**: OpenAI, Google Gemini, Anthropic Claude, 9Router, và bất kỳ API tương thích chuẩn OpenAI (DeepSeek, Groq, Ollama, OpenRouter, Together AI, Mistral AI, Local LLM...).
- **Fetch Model Dynamic**: Khi nhập API Key, ứng dụng tự động gọi endpoint truy vấn danh sách model thực tế mà tài khoản sở hữu — **không hardcode**, luôn luôn cập nhật các model mới nhất.
- **Bảo Mật API Key Tuyệt Đối**: API Key được mã hóa và lưu tại phía Client (hoặc cấu hình qua biến môi trường server), backend chỉ đóng vai trò ủy quyền kết nối (proxy), không làm rò rỉ key.

### ⚡ Trải Nghiệm Chat Thời Gian Thực (Streaming & Markdown)
- **Server-Sent Events (SSE)**: Phản hồi streaming từ máy chủ đến giao diện người dùng mượt mà theo thời gian thực.
- **Markdown & Code Highlighting**: Hiển thị bảng, trích dẫn, công thức, khối mã lập trình với nút **Sao chép mã** 1-click.
- **Giọng Nói (Voice-to-Text & Text-to-Speech)**: Tích hợp Web Speech API tiếng Việt (`vi-VN`) giúp nhập liệu bằng giọng nói và phát âm phản hồi của trợ lý AI.
- **Tùy Chỉnh Sâu**: Cho phép điều chỉnh `Temperature`, nhập `System Instruction` riêng hoặc chọn nhanh mẫu prompt thông minh (Trợ lý chung, Chuyên gia Lập trình, Dịch thuật...).

### 📊 Thống Kê & Dự Toán Chi Phí Token Chuyên Nghiệp
- **Biểu đồ trực quan (Recharts)**: Phân tích số lượng Token, số tin nhắn và lượt hội thoại theo từng ngày trong tháng.
- **Dự toán chi phí đa tiền tệ**: Quy đổi chi phí ước tính theo USD ($) và Việt Nam Đồng (₫).
- **So sánh 6 tháng gần nhất**: Giúp dễ dàng theo dõi chi phí sử dụng API qua từng giai đoạn.
- **Lưu trữ kép (Local + SQLite)**: Dữ liệu thống kê được lưu tự động (auto-save) liên tục vào `LocalStorage` và đồng bộ vào cơ sở dữ liệu `SQLite` (qua `sql.js`).

### 📦 Dễ Dàng Đóng Gói & Triển Khai
- Sẵn sàng chạy bằng `npx`, `npm`, Docker đa nền tảng (`amd64`, `arm64`) và Docker Compose.
- Giao diện Pure Light Mode tinh giản, hiện đại, tối ưu cho năng suất làm việc dài hạn.

---

## 🚀 Cài Đặt & Khởi Chạy Nhanh

### Yêu Cầu Hệ Thống
- **Node.js**: Phiên bản 18.0 trở lên (khuyên dùng Node.js 20 LTS hoặc 22 LTS).
- **npm** / **bun** / **yarn** / **pnpm**.

### 1. Chạy trực tiếp bằng CLI (Không cần clone repo)
```bash
npx @bao826078/chatai
```
> Hoặc cài đặt toàn cục:
```bash
npm install -g @bao826078/chatai
chatai --port 8088
```

---

### 2. Phát triển từ mã nguồn (Development)

```bash
# 1. Clone repository
git clone https://github.com/bao826078-glitch/ChatAI.git
cd ChatAI

# 2. Cài đặt dependencies
npm install

# 3. Khởi chạy máy chủ phát triển (kèm Vite HMR)
npm run dev
```

Truy cập trình duyệt tại: **`http://localhost:8088`**

---

### 3. Build & Chạy Production

```bash
# Xây dựng bản phân phối
npm run build

# Chạy bản production
npm start
```

---

## 🐳 Triển Khai Docker & Docker Compose

### Sử Dụng Docker CLI
```bash
docker run -d \
  --name chatai \
  -p 8088:8088 \
  -v chatai_data:/data \
  --restart unless-stopped \
  bao826078/chatai:latest
```

### Sử Dụng Docker Compose

Tạo file `docker-compose.yml`:

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
      # - GEMINI_API_KEY=AIzaSy... (Tùy chọn nếu muốn nạp sẵn key hệ thống)
    volumes:
      - chatai_data:/data

volumes:
  chatai_data:
```

Khởi chạy container:
```bash
docker compose up -d
```

---

## 🔌 Nhà Cung Cấp AI Hỗ Trợ

| Nhà Cung Cấp | Định Dạng Khóa API | Mô Hình Tiêu Biểu | Ghi Chú |
|:---|:---|:---|:---|
| **OpenAI** | `sk-...` | GPT-4o, GPT-4o-mini, o1, o3-mini | Streaming SSE, tự động lấy model từ `/v1/models` |
| **Google Gemini** | `AIzaSy...` | Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 | Hỗ trợ qua `@google/genai` SDK chính hãng |
| **Anthropic** | `sk-ant-...` | Claude 3.5 Sonnet, Claude 3.5 Haiku, Opus | Giao thức chuẩn Anthropic Message API |
| **9Router** | Custom Key | Tất cả models tích hợp | Cổng định tuyến AI thông minh & tối ưu chi phí |
| **Custom / OpenAI-Compatible** | Tùy chọn | DeepSeek-V3/R1, Llama 3.3, Qwen, Mistral | Groq Cloud, OpenRouter, Together AI, Ollama... |

---

## ⚙️ Biến Môi Trường (.env)

Bạn có thể tạo file `.env` tại thư mục gốc để cấu hình các thiết lập mặc định:

```env
# Cổng chạy ứng dụng (Mặc định: 8088)
PORT=8088

# Môi trường chạy ('production' hoặc 'development')
NODE_ENV=production

# Đường dẫn lưu trữ cơ sở dữ liệu SQLite
DB_PATH=data/chatai.db

# (Tùy chọn) API Key mặc định của Gemini nếu bạn muốn chia sẻ cho người dùng trong mạng nội bộ
GEMINI_API_KEY=
```

---

## 📁 Cấu Trúc Dự Án

```
ChatAI/
├── .github/
│   └── workflows/
│       └── docker-image.yml   # Tự động build Docker multi-arch (amd64, arm64)
├── bin/
│   └── cli.cjs                # CLI binary thực thi gói npx/npm
├── server/
│   └── db.ts                  # Quản lý SQLite database (Hội thoại, Tin nhắn, Token Usage)
├── src/
│   ├── components/
│   │   ├── AnalyticsModal.tsx # Bảng báo cáo phân tích Token & Chi phí (Recharts)
│   │   ├── ApiKeyModal.tsx    # Cửa sổ cấu hình API Key và Gateway nhà cung cấp
│   │   ├── ChatInput.tsx      # Thanh nhập liệu, đính kèm voice-to-text
│   │   ├── ChatMessage.tsx    # Bong bóng chat, đọc văn bản TTS, copy
│   │   ├── Header.tsx         # Thanh điều hướng trên cùng
│   │   ├── HelpModal.tsx      # Cửa sổ hướng dẫn sử dụng và phím tắt
│   │   ├── MarkdownView.tsx   # Trình render Markdown & Syntax Highlighting
│   │   └── Sidebar.tsx        # Danh sách hội thoại, cấu hình Temperature, Prompt
│   ├── utils/
│   │   ├── analytics.ts       # Logic tính toán thống kê token theo ngày/tháng
│   │   └── tokenEstimator.ts  # Thuật toán ước tính token đa ngôn ngữ
│   ├── App.tsx                # Giao diện chính kết hợp State Machine của Chat
│   ├── index.css              # Tinh chỉnh CSS & Tailwind styling
│   ├── main.tsx               # Điểm nhập React 19 Client
│   └── types.ts               # Định nghĩa TypeScript Interface toàn cục
├── Dockerfile                 # Đóng gói tối ưu multi-stage build với Alpine Linux
├── Docker-Compose-example.yaml# Tệp mẫu triển khai dịch vụ bằng Compose
├── package.json               # Khai báo thư viện & kịch bản lệnh
├── server.ts                  # Backend Express, Proxy SSE Streaming đa cổng AI
├── tsconfig.json              # Cấu hình trình biên dịch TypeScript
└── vite.config.ts             # Cấu hình đóng gói Vite v8 & React Plugin
```

---

## 🛠️ Công Nghệ Nền Tảng

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Motion (Framer Motion)](https://motion.dev/), [Lucide React](https://lucide.dev/).
- **Backend**: [Express.js](https://expressjs.com/), [tsx](https://github.com/privatenumber/tsx), [esbuild](https://esbuild.github.io/).
- **Database & Storage**: [sql.js](https://sql.js.org/) (SQLite in WebAssembly/Node), LocalStorage Client Sync.
- **AI SDK**: [@google/genai](https://www.npmjs.com/package/@google/genai), Fetch Streaming Native SSE.
- **Charts & Data**: [Recharts](https://recharts.org/), [Marked](https://marked.js.org/).

---

## 📜 Giấy Phép

Dự án được phân phối dưới giấy phép **Apache License 2.0**. Xem chi tiết tại tệp [LICENSE](LICENSE).

<div align="center">
  <sub>Xây dựng với ❤️ bởi <a href="https://github.com/bao826078-glitch">bao826078</a></sub>
</div>
