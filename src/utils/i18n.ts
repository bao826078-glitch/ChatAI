export type AppLanguage = 'en' | 'vi';

export const translations = {
  en: {
    // Header
    newChatTitle: 'New chat',
    noModelWarning: 'No model (API Key required)',
    monthlyStatsBtn: 'Monthly Stats',
    monthlyStatsBtnShort: 'Stats',
    monthlyStatsTooltip: 'Open token usage & monthly cost analytics',
    apiKeyBtn: 'API Key',
    apiKeyBtnCustom: 'Custom Key',
    apiKeyBtnInvalid: 'Key Error',
    apiKeyTooltip: 'Configure API Key & AI endpoints',
    clearChatTooltip: 'Clear current chat messages',
    helpTooltip: 'Guide, Information & npm setup',
    hideSidebar: 'Hide sidebar (Dashboard)',
    showSidebar: 'Show sidebar (Dashboard)',
    switchLanguage: 'Switch language (EN / VI)',

    // Sidebar
    newChatBtn: 'New chat',
    searchPlaceholder: 'Search conversations...',
    chatHistoryTitle: 'Chat History',
    noMatchingChats: 'No matching chats found',
    noChatsYet: 'No conversations yet',
    modelSectionTitle: 'AI Model',
    noModelsAvailable: 'No models available. Click API Key Settings to retrieve your models.',
    fetchingModels: 'Fetching available models from provider...',
    refreshModels: 'Refresh model list',
    creativityTitle: 'Creativity (Temperature)',
    preciseTemp: 'Precise (0.2)',
    balancedTemp: 'Balanced (0.7)',
    creativeTemp: 'Creative (1.0)',
    systemPromptTitle: 'System Instructions (Prompt)',
    systemPromptPlaceholder: 'e.g. You are a senior software architect with 15 years of experience...',
    presetGeneral: 'General Assistant',
    presetGeneralPrompt: 'You are a helpful, concise, and standard AI assistant. Always respond with clear, well-structured logic.',
    presetCoding: 'Coding Expert',
    presetCodingPrompt: 'You are a senior software engineer. Write clean, optimal code following best practices, and explain logic clearly.',
    presetTranslator: 'Translator',
    presetTranslatorPrompt: 'You are a professional bilingual translator. Translate accurately preserving natural context and technical terms.',
    presetWriter: 'Copywriter',
    presetWriterPrompt: 'You are an experienced copywriter. Use polished, engaging, and professional language tailored to the context.',
    presetPromptCustom: 'Custom preset prompt applied',
    apiKeySettings: 'API Key Settings',
    keySaved: 'Key: Saved',
    noKeyYet: 'No API Key yet',
    databaseLabel: 'Database:',
    exportMd: 'MD',
    exportJson: 'JSON',
    exportMdTooltip: 'Export conversation as Markdown',
    exportJsonTooltip: 'Export conversation as JSON',
    clearAllChats: 'Clear all',
    clearAllConfirm: 'Are you sure you want to delete all saved conversations?',

    // ChatInput
    inputPlaceholder: 'Ask anything, give instructions or paste code... (Shift+Enter for new line for pc)',
    voiceInput: 'Voice input',
    voiceListening: 'Listening...',
    sendTooltip: 'Send message (Enter)',
    stopTooltip: 'Stop response generation',
    requireKeyAlert: 'Please configure your API Key to start chatting',
    tokensCount: 'tokens',

    // ChatMessage
    copyCode: 'Copy',
    copiedCode: 'Copied!',
    copyMessage: 'Copy message',
    copiedMessage: 'Copied!',
    modelUsedLabel: 'Model',
    errorMessagePrefix: 'Error:',
    regenerate: 'Regenerate response',

    // Starter prompts
    starterCodingTitle: 'Coding & Algorithms',
    starterCodingDesc: 'Write a TypeScript QuickSort with time complexity explanation',
    starterCodingPrompt: 'Please write a QuickSort algorithm in TypeScript with a detailed explanation of its O(n log n) time complexity and a runnable example.',
    starterEmailTitle: 'Professional Email',
    starterEmailDesc: 'Draft a polite time-off request or project proposal email',
    starterEmailPrompt: 'Please help me draft a formal, polite, and professional 2-day leave request email to send to my engineering manager.',
    starterTranslationTitle: 'Technical Explanation',
    starterTranslationDesc: 'Explain differences between SSE and WebSockets with trade-offs',
    starterTranslationPrompt: 'Please explain the technical differences, pros/cons, and recommended use cases for Server-Sent Events (SSE) versus WebSockets.',
    starterDebugTitle: 'Debug & Optimization',
    starterDebugDesc: 'Detect memory leaks and optimize React useEffect hooks',
    starterDebugPrompt: 'How can memory leaks be avoided when using React useEffect? Provide concrete examples and proper cleanup patterns.',

    // Empty Welcome
    welcomeTitle: 'How can I assist you today?',
    welcomeSubtitle: 'Connect with OpenAI, Google Gemini, Anthropic Claude, 9Router or custom OpenAI-compatible endpoints with persistent SQLite storage.',

    // ApiKeyModal
    apiKeyModalTitle: 'API Key & Provider Settings',
    apiKeyModalSubtitle: 'Select your AI provider and enter your API Key to load models directly.',
    providerLabel: 'Provider',
    apiKeyInputLabel: 'API Key',
    apiKeyPlaceholder: 'Enter your API key (e.g. sk-... or AIza...)',
    baseUrlLabel: 'Custom Base URL (Optional)',
    baseUrlPlaceholder: 'https://api.your-endpoint.com/v1',
    verifyKeyBtn: 'Verify Connection',
    verifyingKeyBtn: 'Verifying...',
    saveBtn: 'Save Settings',
    cancelBtn: 'Cancel',

    // AnalyticsModal
    analyticsModalTitle: 'Resource & Token Analytics',
    analyticsAutoSaved: 'Persisted in SQLite',
    analyticsSubtitle: 'Track token consumption, conversation counts, and estimated cost across recent months',
    tabSingleMonth: 'Monthly Detail',
    tabCompare: 'Compare 6 Months',
    selectMonthLabel: 'Select month:',
    currentMonthTag: '(Current)',
    totalTokensCard: 'Total Tokens',
    interactionsCard: 'Total Interactions',
    costCard: 'Estimated Cost',
    tokensChartTitle: 'Daily token consumption in',
    metricTokens: 'Tokens',
    metricConversations: 'Interactions',
    metricBoth: 'Both',
    tokenAnalysisTitle: 'Token breakdown:',
    tokenInput: 'Input',
    tokenOutput: 'Output',
    byProviderTitle: 'By Provider:',
    multiMonthChartTitle: 'Token consumption comparison across months',
    multiMonthTableTitle: 'Summary table for recent months',
    colMonth: 'Month',
    colTokens: 'Total Tokens',
    colInteractions: 'Interactions',
    colCostUsd: 'Cost (USD)',
    colCostVnd: 'Cost (VND)',
    colAction: 'Action',
    actionViewDay: 'View Days',
    closeBtn: 'Close',

    // HelpModal
    helpModalTitle: 'Information & User Guide',
  },
  vi: {
    // Header
    newChatTitle: 'Đoạn chat mới',
    noModelWarning: 'Chưa có mô hình (cần API Key)',
    monthlyStatsBtn: 'Thống kê tháng',
    monthlyStatsBtnShort: 'Thống kê',
    monthlyStatsTooltip: 'Mở bảng điều khiển thống kê token và chi phí các tháng gần nhất',
    apiKeyBtn: 'Cài đặt Key',
    apiKeyBtnCustom: 'Key cá nhân',
    apiKeyBtnInvalid: 'Khóa lỗi',
    apiKeyTooltip: 'Cài đặt khóa API & URL gọi AI',
    clearChatTooltip: 'Xóa nội dung đoạn chat hiện tại',
    helpTooltip: 'Thông tin, Hướng dẫn & Cách chạy npm',
    hideSidebar: 'Ẩn thanh bên (Dashboard)',
    showSidebar: 'Hiện thanh bên (Dashboard)',
    switchLanguage: 'Chuyển đổi ngôn ngữ (EN / VI)',

    // Sidebar
    newChatBtn: 'Đoạn chat mới',
    searchPlaceholder: 'Tìm kiếm cuộc trò chuyện...',
    chatHistoryTitle: 'Lịch sử trò chuyện',
    noMatchingChats: 'Không tìm thấy cuộc trò chuyện phù hợp',
    noChatsYet: 'Chưa có cuộc trò chuyện nào',
    modelSectionTitle: 'Mô hình AI',
    noModelsAvailable: 'Chưa có mô hình nào. Vui lòng bấm Cài đặt API Key để lấy danh sách mô hình từ nhà cung cấp.',
    fetchingModels: 'Đang tải danh sách mô hình từ máy chủ...',
    refreshModels: 'Làm mới danh sách mô hình',
    creativityTitle: 'Độ sáng tạo (Temperature)',
    preciseTemp: 'Chính xác (0.2)',
    balancedTemp: 'Cân bằng (0.7)',
    creativeTemp: 'Sáng tạo (1.0)',
    systemPromptTitle: 'Chỉ dẫn hệ thống (System Prompt)',
    systemPromptPlaceholder: 'Ví dụ: Bạn là chuyên gia kiến trúc phần mềm với 15 năm kinh nghiệm...',
    presetGeneral: 'Trợ lý tổng quát',
    presetGeneralPrompt: 'Bạn là trợ lý AI hữu ích, súc tích và chuẩn mực. Luôn trả lời bằng tiếng Việt rõ ràng, logic và có cấu trúc dễ đọc.',
    presetCoding: 'Chuyên gia Lập trình',
    presetCodingPrompt: 'Bạn là lập trình viên chuyên nghiệp. Viết code sạch, tối ưu, tuân thủ tiêu chuẩn kỹ thuật và giải thích logic cặn kẽ.',
    presetTranslator: 'Dịch thuật viên',
    presetTranslatorPrompt: 'Bạn là chuyên viên dịch thuật song ngữ. Dịch chuẩn xác theo ngữ cảnh tự nhiên và giữ đúng thuật ngữ chuyên môn.',
    presetWriter: 'Viết lách & Văn bản',
    presetWriterPrompt: 'Bạn là người biên soạn nội dung chuyên nghiệp. Sử dụng từ ngữ trang trọng, mạch lạc và phù hợp mục đích giao tiếp.',
    presetPromptCustom: 'Đã áp dụng mẫu chỉ dẫn',
    apiKeySettings: 'Cài đặt API Key',
    keySaved: 'Khóa: Đã lưu',
    noKeyYet: 'Chưa có API Key',
    databaseLabel: 'Cơ sở dữ liệu:',
    exportMd: 'MD',
    exportJson: 'JSON',
    exportMdTooltip: 'Xuất tệp Markdown',
    exportJsonTooltip: 'Xuất tệp JSON',
    clearAllChats: 'Xóa tất cả',
    clearAllConfirm: 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử các cuộc hội thoại không?',

    // ChatInput
    inputPlaceholder: 'Hỏi bất kỳ điều gì, nhập hướng dẫn hoặc dán code... (Shift+Enter để xuống dòng dành cho pc)',
    voiceInput: 'Nhập bằng giọng nói',
    voiceListening: 'Đang lắng nghe...',
    sendTooltip: 'Gửi tin nhắn (Enter)',
    stopTooltip: 'Dừng sinh phản hồi',
    requireKeyAlert: 'Vui lòng nhập API Key để bắt đầu trò chuyện',
    tokensCount: 'tokens',

    // ChatMessage
    copyCode: 'Sao chép',
    copiedCode: 'Đã sao chép!',
    copyMessage: 'Sao chép nội dung',
    copiedMessage: 'Đã chép!',
    modelUsedLabel: 'Mô hình',
    errorMessagePrefix: 'Lỗi:',
    regenerate: 'Tạo lại câu trả lời',

    // Starter prompts
    starterCodingTitle: 'Lập trình & Thuật toán',
    starterCodingDesc: 'Viết mã QuickSort bằng TypeScript kèm giải thích độ phức tạp',
    starterCodingPrompt: 'Hãy viết thuật toán QuickSort (sắp xếp nhanh) bằng TypeScript, kèm theo giải thích chi tiết về độ phức tạp thời gian O(n log n) và ví dụ chạy thử.',
    starterEmailTitle: 'Viết email chuyên nghiệp',
    starterEmailDesc: 'Soạn email xin nghỉ phép hoặc đề xuất dự án mới',
    starterEmailPrompt: 'Hãy giúp tôi soạn thảo một email xin nghỉ phép 2 ngày gửi cho quản lý bằng văn phong trang trọng, lịch sự và chuyên nghiệp.',
    starterTranslationTitle: 'Dịch thuật chuyên sâu',
    starterTranslationDesc: 'Dịch và trau chuốt bài viết kỹ thuật sang tiếng Việt',
    starterTranslationPrompt: 'Hãy giải thích và dịch thuật ngữ "Server-Sent Events" và "WebSockets" sang tiếng Việt, so sánh ưu nhược điểm và tình huống sử dụng của từng loại.',
    starterDebugTitle: 'Debug & Tối ưu hóa',
    starterDebugDesc: 'Tìm lỗi tiềm ẩn và cải thiện hiệu năng mã nguồn',
    starterDebugPrompt: 'Làm thế nào để tránh tình trạng memory leak trong ứng dụng React useEffect? Nêu các ví dụ cụ thể và cách xử lý cleanup đúng cách.',

    // Empty Welcome
    welcomeTitle: 'Tôi có thể hỗ trợ gì cho bạn hôm nay?',
    welcomeSubtitle: 'Kết nối trực tiếp OpenAI, Google Gemini, Anthropic Claude, 9Router hoặc cổng AI tùy chỉnh với cơ sở dữ liệu SQLite bền vững.',

    // ApiKeyModal
    apiKeyModalTitle: 'Cài đặt API Key & Nhà cung cấp AI',
    apiKeyModalSubtitle: 'Chọn nhà cung cấp và nhập API Key để tự động tải danh sách mô hình tương ứng.',
    providerLabel: 'Nhà cung cấp',
    apiKeyInputLabel: 'Khóa API Key',
    apiKeyPlaceholder: 'Nhập API key của bạn (ví dụ sk-... hoặc AIza...)',
    baseUrlLabel: 'Địa chỉ Base URL tùy chỉnh (Tùy chọn)',
    baseUrlPlaceholder: 'https://api.your-endpoint.com/v1',
    verifyKeyBtn: 'Kiểm tra kết nối',
    verifyingKeyBtn: 'Đang kiểm tra...',
    saveBtn: 'Lưu cấu hình',
    cancelBtn: 'Hủy bỏ',

    // AnalyticsModal
    analyticsModalTitle: 'Bảng Thống Kê Tài Nguyên & Chi Phí',
    analyticsAutoSaved: 'Đã lưu trong SQLite',
    analyticsSubtitle: 'Theo dõi mức tiêu thụ token, số lượt trao đổi và chi phí theo các tháng gần nhất',
    tabSingleMonth: 'Chi tiết từng tháng',
    tabCompare: 'So sánh 6 tháng gần nhất',
    selectMonthLabel: 'Chọn tháng:',
    currentMonthTag: '(Hiện tại)',
    totalTokensCard: 'Tổng Token',
    interactionsCard: 'Số Lượt Tương Tác',
    costCard: 'Ước Tính Chi Phí',
    tokensChartTitle: 'Biểu đồ tiêu thụ theo từng ngày trong',
    metricTokens: 'Token',
    metricConversations: 'Tương tác',
    metricBoth: 'Cả hai',
    tokenAnalysisTitle: 'Phân tích token:',
    tokenInput: 'Đầu vào (Input)',
    tokenOutput: 'Đầu ra (Output)',
    byProviderTitle: 'Theo nhà cung cấp:',
    multiMonthChartTitle: 'Biểu đồ so sánh lượng Token tiêu thụ qua các tháng',
    multiMonthTableTitle: 'Bảng tổng hợp chi tiết các tháng gần nhất',
    colMonth: 'Tháng',
    colTokens: 'Tổng Token',
    colInteractions: 'Hội thoại / Tin nhắn',
    colCostUsd: 'Chi phí (USD)',
    colCostVnd: 'Chi phí (VNĐ)',
    colAction: 'Thao tác',
    actionViewDay: 'Xem ngày',
    closeBtn: 'Đóng',

    // HelpModal
    helpModalTitle: 'Thông Tin & Hướng Dẫn Sử Dụng',
  },
};

export function getStoredLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem('app_language');
    if (saved === 'vi' || saved === 'en') {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return 'en'; // Default is English as requested
}

export function saveStoredLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem('app_language', lang);
  } catch (e) {
    // ignore
  }
}
