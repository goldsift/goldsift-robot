/**
 * 文件日志系统
 * 严格遵守 300 行以内规范
 */

import fs from 'fs/promises';
import path from 'path';
import type { LogLevel, LogEntry } from './types.js';

class Logger {
  private readonly logsDir: string;

  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogsDirectory(): Promise<void> {
    try {
      await fs.access(this.logsDir);
    } catch {
      await fs.mkdir(this.logsDir, { recursive: true });
    }
  }

  /**
   * 格式化日志条目
   */
  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, message, data } = entry;
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${dataStr}\n`;
  }

  /**
   * 写入日志到文件
   */
  private async writeToFile(level: LogLevel, content: string): Promise<void> {
    const filename = path.join(this.logsDir, `${level}.log`);
    try {
      await fs.appendFile(filename, content, 'utf8');
    } catch (error) {
      console.error('日志写入失败:', error);
    }
  }

  /**
   * 通用日志方法
   */
  private async log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    const formattedEntry = this.formatLogEntry(entry);

    // 同时输出到控制台和文件
    console.log(formattedEntry.trim());
    await this.writeToFile(level, formattedEntry);

    // 错误日志同时写入 error.log 和对应级别文件
    if (level === 'error') {
      await this.writeToFile('error', formattedEntry);
    }
  }

  /**
   * 调试日志
   */
  async debug(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('debug', message, data);
  }

  /**
   * 信息日志
   */
  async info(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('info', message, data);
  }

  /**
   * 警告日志
   */
  async warn(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('warn', message, data);
  }

  /**
   * 错误日志
   */
  async error(message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log('error', message, data);
  }

  /**
   * 清理旧日志文件（保留最近N天）
   */
  async cleanOldLogs(retentionDays: number = 7): Promise<void> {
    try {
      const files = await fs.readdir(this.logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(`已清理过期日志文件: ${file}`);
        }
      }
    } catch (error) {
      console.error('清理日志文件失败:', error);
    }
  }
}

// 创建全局日志实例
export const logger = new Logger();

// 导出日志清理函数（可选择性使用）
export const cleanOldLogs = (retentionDays?: number) => 
  logger.cleanOldLogs(retentionDays);