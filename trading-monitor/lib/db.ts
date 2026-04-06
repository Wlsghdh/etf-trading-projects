import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = process.env.COMMUNITY_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'monitor.db');

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initTables(_db);
  }
  return _db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      model TEXT,
      content TEXT NOT NULL,
      symbol TEXT,
      analysis_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_user_session ON chat_messages(user_id, session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at)');

  // 기본 관리자 계정 (없으면 생성)
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('ahnbi2');
  if (!admin) {
    const hash = hashPassword('bigdata');
    db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)').run(
      'ahnbi2', hash, 'Admin', 'admin'
    );
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'etf-salt-2026').digest('hex');
}

// ── User 관련 ──

export function authenticateUser(username: string, password: string) {
  const db = getDB();
  const hash = hashPassword(password);
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE username = ? AND password_hash = ?').get(username, hash) as {
    id: number; username: string; display_name: string; role: string;
  } | undefined;

  if (user) {
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  }
  return user || null;
}

// ── Chat 관련 ──

export function saveChatMessage(userId: number, sessionId: string, role: string, model: string, content: string, symbol?: string, analysisData?: string) {
  const db = getDB();
  return db.prepare(
    'INSERT INTO chat_messages (user_id, session_id, role, model, content, symbol, analysis_data) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, sessionId, role, model, content, symbol || null, analysisData || null);
}

export function getChatHistory(userId: number, limit = 50) {
  const db = getDB();
  return db.prepare(
    'SELECT id, session_id, role, model, content, symbol, analysis_data, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

export function getChatSession(userId: number, sessionId: string) {
  const db = getDB();
  return db.prepare(
    'SELECT id, role, model, content, symbol, analysis_data, created_at FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC'
  ).all(userId, sessionId);
}

export function getChatSessions(userId: number, limit = 20) {
  const db = getDB();
  return db.prepare(`
    SELECT session_id, MIN(created_at) as started_at, MAX(created_at) as last_at,
           COUNT(*) as message_count, MAX(symbol) as last_symbol
    FROM chat_messages WHERE user_id = ?
    GROUP BY session_id ORDER BY last_at DESC LIMIT ?
  `).all(userId, limit);
}
