/**
 * SQLite数据库管理模块
 * 负责数据库初始化、表创建和基本操作
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../logger.js';

/**
 * 数据库管理器类
 */
export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    // 确保数据库目录存在
    const dbDir = join(process.cwd(), 'data');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      logger.info('创建数据库目录', { dbDir });
    }
    
    this.dbPath = join(dbDir, 'config.sqlite');
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    try {
      this.db = new Database(this.dbPath);
      
      // 启用WAL模式以提高并发性能
      this.db.pragma('journal_mode = WAL');
      
      // 创建配置表
      this.createTables();
      
      logger.info('SQLite数据库初始化成功', {
        dbPath: this.dbPath,
        journalMode: this.db.pragma('journal_mode', { simple: true })
      });
      
    } catch (error) {
      logger.error('SQLite数据库初始化失败', {
        dbPath: this.dbPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`数据库初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    // 创建配置表（单表设计，通过enable标记控制当前使用的版本）
    const createConfigTable = `
      CREATE TABLE IF NOT EXISTS prompt_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        analysis_prompt TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 创建基础配置表
    const createBasicConfigTable = `
      CREATE TABLE IF NOT EXISTS basic_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT,
        config_type TEXT NOT NULL DEFAULT 'string',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 创建索引
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_enabled ON prompt_configs (enabled)',
      'CREATE INDEX IF NOT EXISTS idx_created_at ON prompt_configs (created_at DESC)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_enabled_unique ON prompt_configs (enabled) WHERE enabled = TRUE',
      'CREATE INDEX IF NOT EXISTS idx_basic_config_key ON basic_configs (config_key)'
    ];

    try {
      this.db.exec(createConfigTable);
      this.db.exec(createBasicConfigTable);
      
      createIndexes.forEach(indexSql => {
        this.db!.exec(indexSql);
      });
      
      logger.debug('数据库表创建完成');
      
    } catch (error) {
      logger.error('创建数据库表失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取数据库连接
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('数据库连接已关闭');
    }
  }

  /**
   * 执行数据库备份
   */
  async backup(backupPath?: string): Promise<string> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const finalBackupPath = backupPath || `${this.dbPath}.backup.${Date.now()}`;
    
    try {
      await this.db.backup(finalBackupPath);
      logger.info('数据库备份完成', { backupPath: finalBackupPath });
      return finalBackupPath;
    } catch (error) {
      logger.error('数据库备份失败', {
        backupPath: finalBackupPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): any {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const totalCount = this.db.prepare('SELECT COUNT(*) as count FROM prompt_configs').get() as { count: number };
    const enabledCount = this.db.prepare('SELECT COUNT(*) as count FROM prompt_configs WHERE enabled = TRUE').get() as { count: number };
    
    return {
      totalConfigs: totalCount.count,
      enabledConfigs: enabledCount.count,
      dbSize: this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get(),
      journalMode: this.db.pragma('journal_mode', { simple: true })
    };
  }
}

// 导出单例实例
export const databaseManager = new DatabaseManager();
