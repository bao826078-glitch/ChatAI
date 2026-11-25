
<div align="center">

# ChatAI - Trợ lý AI đa nhà cung cấp hiện đại

<p align="center">
  <strong>Trợ lý AI mạnh mẽ, tốc độ cao, bảo mật và linh hoạt, kết nối với nhiều nhà cung cấp AI khác nhau</strong>
</p>

<p align="center">
  <!-- Version & Package -->
  <a href="https://www.npmjs.com/package/@bao826078/chatai"><img src="https://img.shields.io/npm/v/@bao826078/chatai?color=3b82f6&label=npm%20package&logo=npm" alt="Phiên bản npm" /></a>
  <a href="https://github.com/bao826078-glitch/ChatAI/releases"><img src="https://img.shields.io/github/v/release/bao826078-glitch/ChatAI?color=10b981&label=Release" alt="Bản phát hành GitHub" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?logo=apache" alt="Giấy phép" /></a>
  
  <!-- Docker & Platforms -->
  <a href="https://hub.docker.com/r/bao826078/chatai"><img src="https://img.shields.io/docker/pulls/bao826078/chatai?color=0284c7&logo=docker&label=Docker%20Pulls" alt="Lượt tải Docker" /></a>
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey?logo=linux" alt="Nền tảng hỗ trợ" />
  <img src="https://img.shields.io/badge/Docker%20Arch-amd64%20%7C%20arm64-blue?logo=docker" alt="Kiến trúc Docker" />

  <!-- Tech Stack -->
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-8.3-646cff?logo=vite" alt="Vite" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?logo=node.js" alt="Node.js" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/Database-SQLite%20(sql.js)-003b57?logo=sqlite" alt="Cơ sở dữ liệu SQLite" /></a>
</p>

<p align="center">
  🇻🇳 <a href="https://github.com/bao826078-glitch/ChatAI/blob/main/README.md">Tài liệu tiếng Anh</a>
  <br><br>
  <a href="#-tính-năng-nổi-bật">Tính năng</a> •
  <a href="#-cài-đặt-nhanh">Cài đặt nhanh</a> •
  <a href="#-triển-khai-với-docker--docker-compose">Docker</a> •
  <a href="#-các-nhà-cung-cấp-ai">Nhà cung cấp AI</a> •
  <a href="#-cấu-hình-biến-môi-trường">Cấu hình</a> •
  <a href="#-giấy-phép">Giấy phép</a>
</p>

---

</div>

## 🌟 Giới thiệu

**ChatAI** là nền tảng trò chuyện AI hiện đại, gọn nhẹ và linh hoạt, được thiết kế để kết nối trực tiếp với các nhà cung cấp trí tuệ nhân tạo hàng đầu trên thế giới mà không phụ thuộc vào bất kỳ dịch vụ trung gian cố định nào.

Ứng dụng được trang bị cơ chế lưu trữ dữ liệu hai lớp (LocalStorage trên trình duyệt và cơ sở dữ liệu SQLite trên máy chủ), khả năng truyền tải phản hồi theo thời gian thực thông qua Server-Sent Events (SSE), tính năng nhận diện và tổng hợp giọng nói tiếng Việt, cùng bảng điều khiển phân tích chi tiết giúp theo dõi lượng token sử dụng, số lượng tin nhắn và chi phí theo thời gian.

---

## ✨ Tính năng nổi bật

### 🔌 Hỗ trợ nhiều nhà cung cấp AI và tự động khám phá mô hình

- **5 nhóm nhà cung cấp AI chính**: OpenAI, Google Gemini, Anthropic Claude, 9Router và các API tương thích với OpenAI (ví dụ: DeepSeek, Groq, Together AI, OpenRouter, Mistral, Local).
- **Tự động lấy danh sách mô hình**: Truy vấn danh sách mô hình mới nhất thông qua API Key của bạn, không phụ thuộc vào danh sách mô hình được mã hóa cứng, giúp bạn luôn có thể tiếp cận những lựa chọn mới nhất từ nhà cung cấp.
- **Quản lý API Key an toàn**: API Key được mã hóa và lưu trữ hoàn toàn ở phía máy khách (hoặc được cấu hình thông qua biến môi trường cấp máy chủ). Backend chỉ đóng vai trò trung gian xử lý kết nối, giúp hạn chế nguy cơ lộ khóa API.

### ⚡ Tương tác thời gian thực và hiển thị Markdown nâng cao

- **Truyền tải phản hồi bằng SSE**: Hiển thị câu trả lời ngay khi AI tạo nội dung, mang lại trải nghiệm tương tác mượt mà và phản hồi nhanh chóng.
- **Hỗ trợ Markdown phong phú**: Hiển thị bảng, khối mã, trích dẫn, công thức toán học và nhiều định dạng khác, đi kèm tính năng sao chép mã chỉ với một cú nhấp chuột.
- **Tính năng giọng nói và văn bản**: Hỗ trợ nhận diện giọng nói tiếng Việt (vi-VN) thông qua Web Speech API, tùy chỉnh chỉ dẫn hệ thống (System Prompt) và chuyển văn bản thành giọng nói (TTS) để đọc câu trả lời của AI.
- **Tùy chỉnh nâng cao**: Điều chỉnh tham số `Temperature`, nhập chỉ dẫn hệ thống tùy chỉnh hoặc lựa chọn các mẫu thiết lập chuyên nghiệp có sẵn (Trợ lý tổng quát, Lập trình viên, Biên dịch viên, v.v.).

### 📊 Phân tích Token và ước tính chi phí chuyên nghiệp

- **Trực quan hóa dữ liệu (Recharts)**: Phân tích lượng token tiêu thụ, số lượng tin nhắn và xu hướng hội thoại theo từng ngày trong tháng thông qua các biểu đồ trực quan.
- **Ước tính chi phí đa tiền tệ**: Hiển thị thống kê mức sử dụng hằng ngày và hằng tháng bằng cả USD và Việt Nam Đồng (VND).
- **Phân tích và so sánh trong 6 tháng**: Theo dõi xu hướng tiêu thụ trong 6 tháng gần nhất, kèm thống kê chi tiết theo từng tháng để quản lý chi phí hiệu quả hơn.
- **Cơ chế lưu trữ dữ liệu kép**: Các chỉ số sử dụng token được tự động đồng bộ liên tục vào cả LocalStorage trên trình duyệt và SQLite ở backend, đảm bảo khả năng lưu trữ dữ liệu lâu dài và đáng tin cậy.

---

## 🚀 Cài đặt nhanh

### Yêu cầu hệ thống

- **Node.js**: Phiên bản 18.0 trở lên (khuyến nghị Node.js 20 LTS hoặc 22 LTS).
- **Trình quản lý gói**: npm, yarn, pnpm hoặc bun.

### 1. Khởi chạy ngay không cần Clone mã nguồn (Gói npx)

Nếu bạn chỉ muốn khởi chạy ChatAI nhanh chóng mà không cần tải mã nguồn về máy, có thể sử dụng trực tiếp npx:

```bash
npx @bao826078/chatai
```

Một phương pháp khác là cài đặt gói trên toàn hệ thống:

```bash
npm install -g @bao826078/chatai
chatai --port 8088
```

**Lưu ý:** Phương thức cài đặt thông qua npm này hiện chưa được hỗ trợ. Tôi sẽ bổ sung hỗ trợ trong các phiên bản tương lai!

---

### 2. Chế độ phát triển (Clone mã nguồn và khởi chạy)

```bash
# Clone the repository
git clone https://github.com/bao826078-glitch/ChatAI.git
cd ChatAI

# Install dependencies
npm install

# Start development server (includes Vite HMR)
npm run dev
```

Mở trình duyệt và truy cập ứng dụng tại: **`http://localhost:8088`**

---

### 3. Build và triển khai phiên bản Production

```bash
# Build the distributable
npm run build

# Run the production build in Node.js
npm start
```

Theo mặc định, ứng dụng sẽ chạy trên cổng 8088. Bạn có thể thay đổi cổng bằng lệnh:

```bash
npm run dev -- --port 3000
```

---

## 🐳 Triển khai với Docker & Docker Compose

### Sử dụng Docker CLI

```bash
docker run -d \
  --name chatai \
  -p 8088:8088 \
  -v chatai_data:/data \
  --restart unless-stopped \
  bao826078/chatai:latest
```

### Sử dụng Docker Compose

Tạo tệp `docker-compose.yml` với nội dung sau:

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

Khởi chạy container bằng lệnh:

```bash
docker compose up -d
```

Sau khi khởi chạy, truy cập ChatAI tại địa chỉ `http://localhost:8088`.

---

## 🔌 Các nhà cung cấp AI được hỗ trợ

| Nhà cung cấp | Định dạng API Key | Các mô hình tiêu biểu | Ghi chú |
|:---|:---|:---|:---|
| **OpenAI** | `sk-...` | GPT-4o, GPT-4o-mini, o1, o3-mini | Hỗ trợ SSE Streaming, tự động lấy danh sách mô hình thông qua `/v1/models` |
| **Google Gemini** | `AIzaSy...` | Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 | Tích hợp trực tiếp thông qua SDK `@google/genai` |
| **Anthropic** | `sk-ant-...` | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | Sử dụng chuẩn Anthropic Message API |
| **9Router** | Khóa tùy chỉnh | Toàn bộ hệ sinh thái mô hình được tích hợp | Cổng kết nối AI thông minh, hỗ trợ tối ưu hóa chi phí |
| **Tùy chỉnh / Tương thích OpenAI** | Linh hoạt | DeepSeek-V3/R1, Llama 3.3, Qwen, Mistral | Hỗ trợ Groq Cloud, OpenRouter, Together AI, Ollama, v.v. |

---

## ⚙️ Cấu hình biến môi trường (.env)

Tạo tệp `.env` tại thư mục gốc của dự án để thiết lập các tùy chọn cấu hình:

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

## 🛠️ Công nghệ sử dụng

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/).
- **Backend**: [Express.js](https://expressjs.com/), [tsx](https://github.com/privatenumber/tsx), [esbuild](https://esbuild.github.io/).
- **Cơ sở dữ liệu & Lưu trữ**: [sql.js](https://sql.js.org/) (SQLite được biên dịch sang WebAssembly/Node), đồng bộ dữ liệu phía máy khách thông qua LocalStorage.
- **SDK AI**: [@google/genai](https://www.npmjs.com/package/@google/genai), hỗ trợ truyền tải dữ liệu theo thời gian thực thông qua SSE.
- **Trực quan hóa dữ liệu**: [Recharts](https://recharts.org/), [Marked](https://marked.js.org/) để hiển thị nội dung Markdown.

---

## 📜 Giấy phép

Dự án được phát hành theo **Apache License 2.0**. Vui lòng xem tệp [LICENSE](LICENSE) để biết thêm chi tiết.

### Thông báo về cơ chế cấp phép phần mềm

Kể từ phiên bản này, phần mềm được quản lý thông qua hệ thống cấp phép dựa trên License Key (khóa bản quyền).

Nếu bạn cần License Key, vui lòng liên hệ:

📧 **admin@afovr.blog**

Hệ thống License Key là cơ chế bổ sung phục vụ việc quản lý cấp phép và phân phối phần mềm. Cơ chế này không làm thay đổi các quyền được cấp theo Apache License 2.0 đối với mã nguồn được phân phối theo giấy phép đó. Vui lòng tham khảo tệp `LICENSE` để biết các điều khoản cấp phép áp dụng.

<div align="center">
  <sub>Được xây dựng với ❤️ bởi <a href="https://github.com/bao826078-glitch">bao826078</a></sub>
</div>
