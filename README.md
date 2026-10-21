# ChatAI - Ứng Dụng Chat AI Thông Minh

Ứng dụng web chat AI thông minh hỗ trợ kết nối trực tiếp với **9Router** và các cổng AI tiêu chuẩn, quản lý khóa API cục bộ an toàn, bảng thống kê tài nguyên & chi phí token đa tháng với biểu đồ Recharts, phân tích hình ảnh và tùy chỉnh tham số mô hình.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Bằng NPM

### 1. Yêu Cầu Hệ Thống
- **Node.js**: Phiên bản 18 trở lên (khuyên dùng Node.js 20 LTS).
- **npm**: Đi kèm sẵn với Node.js.

### 2. Cài Đặt Các Thư Viện Quan Trọng
Mở cửa sổ dòng lệnh (Terminal / Command Prompt / PowerShell) tại thư mục chứa mã nguồn của dự án và chạy:

```bash
npm install
```

Lệnh này sẽ tự động tải và cài đặt toàn bộ các thư viện cốt lõi vào thư mục `node_modules`.

### 3. Khởi Chạy Ứng Dụng (Development Mode)
Sau khi cài đặt xong, chạy lệnh sau để khởi động máy chủ:

```bash
npm run dev
```

- Máy chủ sẽ chạy tại cổng mặc định: `http://localhost:8088` (hoặc cổng cấu hình qua biến môi trường `PORT`).
- Bạn mở trình duyệt web và truy cập vào `http://localhost:8088` để bắt đầu sử dụng.

### 4. Đóng Gói Sản Phẩm (Build Production)
Khi muốn biên dịch mã nguồn để triển khai lên máy chủ thật:

```bash
npm run build
```

Để chạy phiên bản đã build:
```bash
npm start
```

---

## 📦 Danh Sách Thư Viện Quan Trọng Đã Được Sử Dụng

1. **`express` & `@types/express`**: Máy chủ backend Node.js, cung cấp các cổng API `/api/models`, `/api/verify-key`, `/api/chat/stream` (SSE streaming) và đóng vai trò proxy bảo vệ API Key.
2. **`tsx`**: Trình thực thi TypeScript siêu tốc cho Node.js, giúp chạy trực tiếp `server.ts` mà không cần cấu hình biên dịch phức tạp.
3. **`react` & `react-dom`**: Thư viện giao diện người dùng hiện đại phiên bản mới nhất (React 19).
4. **`vite` & `@vitejs/plugin-react`**: Nền tảng xây dựng và đóng gói ứng dụng web tốc độ cao.
5. **`recharts`**: Thư viện biểu đồ thanh tương tác, hiển thị trực quan mức tiêu thụ token theo ngày và so sánh các tháng gần nhất.
6. **`lucide-react`**: Bộ icon giao diện sắc nét, tối giản và chuyên nghiệp.
7. **`marked`**: Trình hiển thị định dạng Markdown và mã nguồn lập trình có định dạng dễ nhìn.
8. **`tailwindcss` & `@tailwindcss/vite`**: Framework CSS thiết kế giao diện sáng (pure light mode) tinh tế.
9. **`@google/genai`**: SDK kết nối trí tuệ nhân tạo.
10. **`dotenv`**: Nạp các biến môi trường cấu hình cổng và kết nối.

---

## ⚙️ Thiết Lập Khóa API & 5 Nhà Cung Cấp Hỗ Trợ

Khi ứng dụng vừa mở, mục mô hình AI sẽ ở trạng thái **trống trơn** theo đúng thiết kế bảo mật:
1. Bấm vào nút **Cài đặt Key** trên góc phải màn hình hoặc trên thanh bên.
2. Chọn 1 trong 5 nhà cung cấp hỗ trợ trực tiếp:
   - **OpenAI (ChatGPT)**: Nhập OpenAI API Key (`sk-...`), tự động kết nối mô hình hàng đầu: GPT-4o, GPT-4o-mini, o1, o3-mini...
   - **Google (AI Studio)**: Nhập Google API Key (`AIzaSy...`), kết nối trực tiếp Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 Flash...
   - **Claude (Anthropic)**: Nhập Anthropic API Key (`sk-ant-...`), đàm thoại với Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus...
   - **9Router**: Nhập API Key do 9Router cung cấp để sử dụng cổng định tuyến AI thông minh.
   - **Khác / Tùy chỉnh**: Chọn nhanh DeepSeek, Groq Cloud, OpenRouter, Together AI, Mistral AI, Ollama chạy máy tính cục bộ, hoặc tự nhập bất kỳ URL máy chủ nào.
3. Bấm **Kiểm tra kết nối** hoặc **Lưu cấu hình**.
4. Hệ thống sẽ tự động gọi API lấy danh sách toàn bộ các mô hình AI và hiển thị để bạn chọn lựa và bắt đầu đàm thoại.

---

## 📊 Cơ Chế Tự Động Lưu Thống Kê (Auto-Save)
- Toàn bộ dữ liệu số lượng token, số cuộc hội thoại và ước tính chi phí được **tự động lưu liên tục vào Local Storage** trên trình duyệt của bạn mà không cần bất kỳ thao tác bấm nút lưu nào.
- Bảng thống kê hỗ trợ:
  - Xem chi tiết từng ngày của các tháng gần nhất (Tháng hiện tại và các tháng trước).
  - Chế độ so sánh tổng hợp 6 tháng gần nhất kèm biểu đồ và bảng số liệu rõ ràng.
