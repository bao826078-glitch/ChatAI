import initSqlJs from 'sql.js';
import type { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';

export interface DbConversation {
  id: string;
  user_id?: string | null;
  title: string;
  model?: string;
  provider?: string;
  system_instruction?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'model' | 'assistant';
  sender: 'user' | 'ai';
  content: string;
  created_at: string;
  metadata?: string; // JSON string
}

export interface DbTokenUsage {
  id: string;
  user_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  usage_source: 'provider' | 'estimated';
  request_id?: string | null;
  status: 'success' | 'error' | 'aborted';
  created_at: string;
}

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isInitializing: Promise<void> | null = null;

  constructor() {
    const rawPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH || 'data/chatai.db';
    this.dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }

  public async init(): Promise<void> {
    if (this.db) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      try {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const SQL = await initSqlJs();

        if (fs.existsSync(this.dbPath)) {
          const fileBuffer = fs.readFileSync(this.dbPath);
          this.db = new SQL.Database(fileBuffer);
          console.log(`[Database] Loaded existing SQLite database from ${this.dbPath} (${fileBuffer.length} bytes)`);
        } else {
          this.db = new SQL.Database();
          console.log(`[Database] Initialized new SQLite database at ${this.dbPath}`);
        }

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON;');

        // Run migrations and schema setup
        this.runMigrations();

        // Save immediately to ensure file exists on disk
        this.persistNow();
      } catch (err: any) {
        console.error('[Database] Failed to initialize SQLite database:', err);
        throw err;
      }
    })();

    await this.isInitializing;
  }

  private runMigrations(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        model TEXT,
        provider TEXT,
        system_instruction TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        conversation_id TEXT,
        message_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0,
        usage_source TEXT NOT NULL DEFAULT 'provider',
        request_id TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_conv ON token_usage(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model ON token_usage(provider, model);
      CREATE INDEX IF NOT EXISTS idx_token_usage_request_id ON token_usage(request_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    `);

    console.log('[Database] Schema and indices verified successfully');
  }

  public scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persistNow();
    }, 150);
  }

  public persistNow(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tempPath = `${this.dbPath}.tmp`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, this.dbPath);
    } catch (err: any) {
      console.error('[Database] Failed to write database to disk:', err);
    }
  }

  private queryAll<T = any>(sql: string, params: SqlValue[] = []): T[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as T);
    }
    stmt.free();
    return results;
  }

  private queryOne<T = any>(sql: string, params: SqlValue[] = []): T | null {
    const list = this.queryAll<T>(sql, params);
    return list.length > 0 ? list[0] : null;
  }

  private run(sql: string, params: SqlValue[] = []): void {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    stmt.free();
    this.scheduleSave();
  }

  // ==================== CONVERSATIONS ====================

  public getConversations(userId?: string): DbConversation[] {
    let sql = `
      SELECT 
        c.id, 
        c.user_id, 
        c.title, 
        c.model, 
        c.provider, 
        c.system_instruction, 
        c.created_at, 
        c.updated_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
    `;
    const params: SqlValue[] = [];

    if (userId) {
      sql += ' WHERE c.user_id = ? ';
      params.push(userId);
    }

    sql += ' GROUP BY c.id ORDER BY c.updated_at DESC';

    return this.queryAll<DbConversation>(sql, params);
  }

  public getConversation(id: string): { conversation: DbConversation; messages: DbMessage[] } | null {
    const conv = this.queryOne<DbConversation>(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );
    if (!conv) return null;

    const messages = this.queryAll<DbMessage>(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    return { conversation: conv, messages };
  }

  public createConversation(data: {
    id: string;
    user_id?: string;
    title?: string;
    model?: string;
    provider?: string;
    system_instruction?: string;
    created_at?: string;
    updated_at?: string;
  }): DbConversation {
    const now = new Date().toISOString();
    const conv: DbConversation = {
      id: data.id,
      user_id: data.user_id || null,
      title: data.title || 'Đoạn chat mới',
      model: data.model || '',
      provider: data.provider || 'openai',
      system_instruction: data.system_instruction || '',
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
    };

    this.run(
      `INSERT OR REPLACE INTO conversations (id, user_id, title, model, provider, system_instruction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conv.id,
        conv.user_id || null,
        conv.title,
        conv.model || '',
        conv.provider || '',
        conv.system_instruction || '',
        conv.created_at,
        conv.updated_at,
      ]
    );

    return conv;
  }

  public updateConversation(
    id: string,
    updates: Partial<{
      title: string;
      model: string;
      provider: string;
      system_instruction: string;
      updated_at: string;
    }>
  ): DbConversation | null {
    const existing = this.queryOne<DbConversation>('SELECT * FROM conversations WHERE id = ?', [id]);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };

    this.run(
      `UPDATE conversations 
       SET title = ?, model = ?, provider = ?, system_instruction = ?, updated_at = ?
       WHERE id = ?`,
      [
        updated.title,
        updated.model || '',
        updated.provider || '',
        updated.system_instruction || '',
        updated.updated_at,
        id,
      ]
    );

    return updated;
  }

  public deleteConversation(id: string): boolean {
    const existing = this.queryOne<DbConversation>('SELECT id FROM conversations WHERE id = ?', [id]);
    if (!existing) return false;

    // With PRAGMA foreign_keys = ON, messages and token_usage cascade automatically
    this.run('DELETE FROM conversations WHERE id = ?', [id]);
    return true;
  }

  // ==================== MESSAGES ====================

  public saveMessage(msg: {
    id: string;
    conversation_id: string;
    role: 'user' | 'model' | 'assistant';
    sender: 'user' | 'ai';
    content: string;
    created_at?: string;
    metadata?: any;
  }): DbMessage {
    const now = msg.created_at || new Date().toISOString();
    const metadataStr = typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.metadata || {});

    // Ensure parent conversation exists
    const conv = this.queryOne<DbConversation>('SELECT id FROM conversations WHERE id = ?', [msg.conversation_id]);
    if (!conv) {
      this.createConversation({
        id: msg.conversation_id,
        title: msg.sender === 'user' ? (msg.content.slice(0, 30) || 'Đoạn chat mới') : 'Đoạn chat mới',
      });
    }

    this.run(
      `INSERT OR REPLACE INTO messages (id, conversation_id, role, sender, content, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.conversation_id, msg.role, msg.sender, msg.content, now, metadataStr]
    );

    // Update conversation updated_at
    this.run(
      'UPDATE conversations SET updated_at = ? WHERE id = ?',
      [now, msg.conversation_id]
    );

    return {
      id: msg.id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      sender: msg.sender,
      content: msg.content,
      created_at: now,
      metadata: metadataStr,
    };
  }

  // ==================== TOKEN USAGE ====================

  public recordTokenUsage(data: {
    id?: string;
    user_id?: string;
    conversation_id?: string;
    message_id?: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cached_input_tokens?: number;
    reasoning_tokens?: number;
    usage_source?: 'provider' | 'estimated';
    request_id?: string;
    status?: 'success' | 'error' | 'aborted';
    created_at?: string;
  }): DbTokenUsage {
    // Prevent duplicate entries for the same request_id if provided
    if (data.request_id) {
      const existing = this.queryOne<DbTokenUsage>(
        'SELECT * FROM token_usage WHERE request_id = ?',
        [data.request_id]
      );
      if (existing) {
        return existing;
      }
    }

    const id = data.id || 'usage-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const now = data.created_at || new Date().toISOString();

    const record: DbTokenUsage = {
      id,
      user_id: data.user_id || null,
      conversation_id: data.conversation_id || null,
      message_id: data.message_id || null,
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      input_tokens: Math.max(0, Number(data.input_tokens) || 0),
      output_tokens: Math.max(0, Number(data.output_tokens) || 0),
      total_tokens: Math.max(
        0,
        Number(data.total_tokens) || ((Number(data.input_tokens) || 0) + (Number(data.output_tokens) || 0))
      ),
      cached_input_tokens: Number(data.cached_input_tokens) || 0,
      reasoning_tokens: Number(data.reasoning_tokens) || 0,
      usage_source: data.usage_source || 'provider',
      request_id: data.request_id || null,
      status: data.status || 'success',
      created_at: now,
    };

    this.run(
      `INSERT INTO token_usage (
        id, user_id, conversation_id, message_id, provider, model,
        input_tokens, output_tokens, total_tokens, cached_input_tokens,
        reasoning_tokens, usage_source, request_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id || null,
        record.conversation_id || null,
        record.message_id || null,
        record.provider,
        record.model,
        record.input_tokens,
        record.output_tokens,
        record.total_tokens,
        record.cached_input_tokens || 0,
        record.reasoning_tokens || 0,
        record.usage_source,
        record.request_id || null,
        record.status,
        record.created_at,
      ]
    );

    return record;
  }

  // ==================== MONTHLY ANALYTICS ====================

  public getMonthlyAnalytics(targetMonthKey?: string) {
    const now = new Date();
    const activeMonthKey = targetMonthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = activeMonthKey.split('-');
    const targetYear = parseInt(yearStr, 10);
    const targetMonthIndex = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();

    // Fetch all token_usage rows for target month (created_at starts with targetMonthKey)
    const usageRows = this.queryAll<DbTokenUsage>(
      `SELECT * FROM token_usage 
       WHERE created_at LIKE ? AND status = 'success'
       ORDER BY created_at ASC`,
      [`${activeMonthKey}%`]
    );

    // Fetch conversation count active this month
    const activeConvs = this.queryAll<{ count: number }>(
      `SELECT COUNT(DISTINCT conversation_id) as count 
       FROM token_usage 
       WHERE created_at LIKE ? AND conversation_id IS NOT NULL`,
      [`${activeMonthKey}%`]
    );

    const USD_PER_TOKEN = 0.00000025;
    const USD_TO_VND_RATE = 25400;

    // Daily breakdown mapping
    const dailyMap = new Map<string, {
      date: string;
      displayDate: string;
      tokens: number;
      inputTokens: number;
      outputTokens: number;
      messages: number;
      costUsd: number;
    }>();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${activeMonthKey}-${dayStr}`;
      dailyMap.set(dateKey, {
        date: dateKey,
        displayDate: `${dayStr}/${monthStr}`,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        messages: 0,
        costUsd: 0,
      });
    }

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalMessages = usageRows.length;

    const byProvider: Record<string, { tokens: number; requests: number }> = {};
    const byModel: Record<string, { tokens: number; requests: number }> = {};
    const bySource: Record<string, number> = { provider: 0, estimated: 0 };

    for (const row of usageRows) {
      const dateKey = row.created_at.slice(0, 10);
      totalTokens += row.total_tokens;
      totalInputTokens += row.input_tokens;
      totalOutputTokens += row.output_tokens;

      // Provider breakdown
      if (!byProvider[row.provider]) {
        byProvider[row.provider] = { tokens: 0, requests: 0 };
      }
      byProvider[row.provider].tokens += row.total_tokens;
      byProvider[row.provider].requests += 1;

      // Model breakdown
      if (!byModel[row.model]) {
        byModel[row.model] = { tokens: 0, requests: 0 };
      }
      byModel[row.model].tokens += row.total_tokens;
      byModel[row.model].requests += 1;

      // Source breakdown
      const src = row.usage_source === 'estimated' ? 'estimated' : 'provider';
      bySource[src] = (bySource[src] || 0) + row.total_tokens;

      if (dailyMap.has(dateKey)) {
        const item = dailyMap.get(dateKey)!;
        item.tokens += row.total_tokens;
        item.inputTokens += row.input_tokens;
        item.outputTokens += row.output_tokens;
        item.messages += 1;
        item.costUsd = Number((item.tokens * USD_PER_TOKEN).toFixed(4));
      }
    }

    const dailyData = Array.from(dailyMap.values());
    const estimatedCostUsd = Number((totalTokens * USD_PER_TOKEN).toFixed(4));
    const estimatedCostVnd = Math.round(estimatedCostUsd * USD_TO_VND_RATE);

    // List of months that have recorded token data
    const allMonthsRaw = this.queryAll<{ monthKey: string }>(`
      SELECT DISTINCT SUBSTR(created_at, 1, 7) as monthKey 
      FROM token_usage 
      ORDER BY monthKey DESC
    `);
    const recordedMonths = allMonthsRaw.map(r => r.monthKey).filter(Boolean);
    if (!recordedMonths.includes(activeMonthKey)) {
      recordedMonths.unshift(activeMonthKey);
    }

    return {
      monthKey: activeMonthKey,
      monthLabel: `Tháng ${monthStr}/${yearStr}`,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalConversations: activeConvs[0]?.count || 0,
      totalMessages,
      estimatedCostUsd,
      estimatedCostVnd,
      dailyData,
      byProvider,
      byModel,
      bySource,
      recordedMonths,
    };
  }

  public getRecentMonthsSummary(count: number = 6) {
    const result: any[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      const analytics = this.getMonthlyAnalytics(key);

      result.push({
        monthKey: key,
        monthLabel: analytics.monthLabel,
        tokens: analytics.totalTokens,
        conversations: analytics.totalConversations,
        messages: analytics.totalMessages,
        costUsd: analytics.estimatedCostUsd,
        costVnd: analytics.estimatedCostVnd,
      });
    }

    return result;
  }
}

export const dbManager = new DatabaseManager();
