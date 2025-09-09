/**
 * 审计日志管理模块
 * 负责记录电报机器人的交互审计日志
 */

import { logger } from './logger.js';
import { databaseManager } from './config/database-manager.js';
import { 
  AuditLog, 
  CreateAuditLogParams, 
  AuditSourceType,
  TelegramMessage,
  DashboardStats,
  UserStats,
  UserDetail,
  PaginatedResponse
} from './types.js';

/**
 * 审计日志管理器类
 */
export class AuditLogger {
  private insertStmt: any = null;
  private selectStmt: any = null;

  /**
   * 初始化预编译语句
   */
  private initializeStatements(): void {
    const db = databaseManager.getDatabase();
    
    if (!this.insertStmt) {
      this.insertStmt = db.prepare(`
        INSERT INTO audit_logs (
          timestamp, telegram_user_id, telegram_username, telegram_display_name, chat_id, chat_type,
          source_type, question_text, identified_currency, currency_type,
          result_status, error_message, response_length, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
    }

    if (!this.selectStmt) {
      this.selectStmt = db.prepare(`
        SELECT * FROM audit_logs 
        WHERE id = ? OR (chat_id = ? AND telegram_user_id = ?)
        ORDER BY timestamp DESC
        LIMIT ?
      `);
    }
  }

  /**
   * 记录审计日志
   */
  async log(params: CreateAuditLogParams): Promise<number> {
    try {
      this.initializeStatements();
      
      const timestamp = new Date().toISOString();
      
      const result = this.insertStmt.run(
        timestamp,
        params.telegramUserId,
        params.telegramUsername || null,
        params.telegramDisplayName || null,
        params.chatId,
        params.chatType,
        params.sourceType,
        params.questionText,
        params.identifiedCurrency || null,
        params.currencyType || null,
        params.resultStatus,
        params.errorMessage || null,
        params.responseLength || null,
        params.processingTimeMs || null
      );

      logger.debug('审计日志记录成功', {
        logId: result.lastInsertRowid,
        userId: params.telegramUserId,
        displayName: params.telegramDisplayName,
        chatId: params.chatId,
        resultStatus: params.resultStatus
      });

      return result.lastInsertRowid as number;
      
    } catch (error) {
      logger.error('审计日志记录失败', {
        error: error instanceof Error ? error.message : String(error),
        params: {
          userId: params.telegramUserId,
          displayName: params.telegramDisplayName,
          chatId: params.chatId,
          resultStatus: params.resultStatus
        }
      });
      throw error;
    }
  }

  /**
   * 确定消息来源类型
   */
  determineSourceType(msg: TelegramMessage): AuditSourceType {
    const chatType = msg.chat.type;
    
    if (chatType === 'private') {
      return 'private_chat';
    }
    
    if (chatType === 'group' || chatType === 'supergroup') {
      // 检查是否是回复机器人的消息
      if (msg.reply_to_message) {
        return 'group_reply';
      }
      // 否则就是@提及
      return 'group_mention';
    }
    
    // 默认返回私聊（不应该到达这里）
    return 'private_chat';
  }

  /**
   * 生成用户显示名称
   * 使用 firstName + lastName 组合，这是用户在 Telegram 中显示的真实姓名
   */
  generateDisplayName(user: { username?: string; first_name?: string; last_name?: string }): string {
    // 使用 first_name + last_name 作为显示名称
    if (user.first_name) {
      const fullName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
      return fullName;
    }
    
    // 如果连 first_name 都没有（理论上不应该发生，因为 first_name 是必需的）
    // 那就返回 username 作为备选
    if (user.username) {
      return `@${user.username}`;
    }
    
    // 都没有的话返回空字符串
    return '';
  }

  /**
   * 记录处理开始（用于计算处理时间）
   */
  startTiming(): number {
    return Date.now();
  }

  /**
   * 计算处理时间
   */
  calculateProcessingTime(startTime: number): number {
    return Date.now() - startTime;
  }

  /**
   * 查询最近的审计日志
   */
  async getRecentLogs(chatId?: number, userId?: number, limit: number = 50): Promise<AuditLog[]> {
    try {
      this.initializeStatements();
      
      const db = databaseManager.getDatabase();
      
      let query = 'SELECT * FROM audit_logs';
      const params: any[] = [];
      
      if (chatId !== undefined || userId !== undefined) {
        const conditions: string[] = [];
        if (chatId !== undefined) {
          conditions.push('chat_id = ?');
          params.push(chatId);
        }
        if (userId !== undefined) {
          conditions.push('telegram_user_id = ?');
          params.push(userId);
        }
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      
      return rows.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        telegramUserId: row.telegram_user_id,
        telegramUsername: row.telegram_username,
        telegramDisplayName: row.telegram_display_name,
        chatId: row.chat_id,
        chatType: row.chat_type,
        sourceType: row.source_type,
        questionText: row.question_text,
        identifiedCurrency: row.identified_currency,
        currencyType: row.currency_type,
        resultStatus: row.result_status,
        errorMessage: row.error_message,
        responseLength: row.response_length,
        processingTimeMs: row.processing_time_ms,
        createdAt: row.created_at
      }));
      
    } catch (error) {
      logger.error('查询审计日志失败', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId,
        limit
      });
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number;
    successCount: number;
    errorCount: number;
    avgProcessingTime: number;
    topCurrencies: Array<{ currency: string; count: number }>;
  }> {
    try {
      const db = databaseManager.getDatabase();
      
      // 总数统计
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs');
      const total = (totalStmt.get() as { count: number }).count;
      
      // 成功数统计
      const successStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE result_status = ?');
      const successCount = (successStmt.get('success') as { count: number }).count;
      
      // 错误数统计
      const errorCount = total - successCount;
      
      // 平均处理时间
      const avgTimeStmt = db.prepare('SELECT AVG(processing_time_ms) as avg FROM audit_logs WHERE processing_time_ms IS NOT NULL');
      const avgResult = avgTimeStmt.get() as { avg: number | null };
      const avgProcessingTime = avgResult.avg || 0;
      
      // 热门货币统计
      const topCurrenciesStmt = db.prepare(`
        SELECT identified_currency as currency, COUNT(*) as count 
        FROM audit_logs 
        WHERE identified_currency IS NOT NULL 
        GROUP BY identified_currency 
        ORDER BY count DESC 
        LIMIT 10
      `);
      const topCurrencies = topCurrenciesStmt.all() as Array<{ currency: string; count: number }>;
      
      return {
        total,
        successCount,
        errorCount,
        avgProcessingTime: Math.round(avgProcessingTime),
        topCurrencies
      };
      
    } catch (error) {
      logger.error('获取审计日志统计失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取Dashboard基本统计信息
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const db = databaseManager.getDatabase();
      
      // 总调用量
      const totalCallsStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs');
      const totalCalls = (totalCallsStmt.get() as { count: number }).count;
      
      // 当日调用量（基于 timestamp 字段）
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartISO = todayStart.toISOString();
      
      const todayCallsStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= ?');
      const todayCalls = (todayCallsStmt.get(todayStartISO) as { count: number }).count;
      
      // 成功率计算
      const successCallsStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE result_status = ?');
      const successCalls = (successCallsStmt.get('success') as { count: number }).count;
      const successRate = totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0;
      
      // 总用户数
      const totalUsersStmt = db.prepare('SELECT COUNT(DISTINCT telegram_user_id) as count FROM audit_logs');
      const totalUsers = (totalUsersStmt.get() as { count: number }).count;
      
      return {
        totalCalls,
        todayCalls,
        successRate: Math.round(successRate * 100) / 100, // 保留2位小数
        totalUsers
      };
      
    } catch (error) {
      logger.error('获取Dashboard统计失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 获取用户调用统计排行
   */
  async getUserStats(page: number = 1, limit: number = 10): Promise<PaginatedResponse<UserStats>> {
    try {
      const db = databaseManager.getDatabase();
      const offset = (page - 1) * limit;
      
      // 获取用户统计数据
      const userStatsStmt = db.prepare(`
        SELECT 
          telegram_user_id,
          telegram_username,
          telegram_display_name,
          COUNT(*) as total_calls,
          SUM(CASE WHEN result_status = 'success' THEN 1 ELSE 0 END) as success_calls,
          MAX(timestamp) as last_call_time
        FROM audit_logs 
        GROUP BY telegram_user_id 
        ORDER BY total_calls DESC 
        LIMIT ? OFFSET ?
      `);
      
      const userStatsData = userStatsStmt.all(limit, offset) as Array<{
        telegram_user_id: number;
        telegram_username?: string;
        telegram_display_name?: string;
        total_calls: number;
        success_calls: number;
        last_call_time: string;
      }>;
      
      // 获取总用户数（用于分页）
      const totalUsersStmt = db.prepare('SELECT COUNT(DISTINCT telegram_user_id) as count FROM audit_logs');
      const totalUsers = (totalUsersStmt.get() as { count: number }).count;
      
      // 转换数据格式
      const userStats: UserStats[] = userStatsData.map(row => {
        const result: UserStats = {
          telegramUserId: row.telegram_user_id,
          totalCalls: row.total_calls,
          successCalls: row.success_calls,
          successRate: row.total_calls > 0 ? Math.round((row.success_calls / row.total_calls) * 100 * 100) / 100 : 0,
          lastCallTime: row.last_call_time
        };
        
        // 只有非空时才添加可选字段
        if (row.telegram_username) {
          result.telegramUsername = row.telegram_username;
        }
        if (row.telegram_display_name) {
          result.telegramDisplayName = row.telegram_display_name;
        }
        
        return result;
      });
      
      // 分页信息
      const totalPages = Math.ceil(totalUsers / limit);
      
      return {
        data: userStats,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalUsers,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      logger.error('获取用户统计失败', {
        error: error instanceof Error ? error.message : String(error),
        page,
        limit
      });
      throw error;
    }
  }

  /**
   * 获取指定用户的调用详情
   */
  async getUserDetails(userId: number, page: number = 1, limit: number = 10): Promise<PaginatedResponse<UserDetail>> {
    try {
      const db = databaseManager.getDatabase();
      const offset = (page - 1) * limit;
      
      // 获取用户详细记录
      const userDetailsStmt = db.prepare(`
        SELECT * FROM audit_logs 
        WHERE telegram_user_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `);
      
      const userDetailsData = userDetailsStmt.all(userId, limit, offset);
      
      // 获取该用户的总记录数
      const totalRecordsStmt = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE telegram_user_id = ?');
      const totalRecords = (totalRecordsStmt.get(userId) as { count: number }).count;
      
      // 转换数据格式
      const userDetails: UserDetail[] = userDetailsData.map((row: any) => {
        const result: UserDetail = {
          id: row.id,
          timestamp: row.timestamp,
          telegramUserId: row.telegram_user_id,
          chatId: row.chat_id,
          chatType: row.chat_type,
          sourceType: row.source_type,
          questionText: row.question_text,
          resultStatus: row.result_status,
          createdAt: row.created_at
        };
        
        // 只有非空时才添加可选字段
        if (row.telegram_username) {
          result.telegramUsername = row.telegram_username;
        }
        if (row.telegram_display_name) {
          result.telegramDisplayName = row.telegram_display_name;
        }
        if (row.identified_currency) {
          result.identifiedCurrency = row.identified_currency;
        }
        if (row.currency_type) {
          result.currencyType = row.currency_type;
        }
        if (row.error_message) {
          result.errorMessage = row.error_message;
        }
        if (row.response_length) {
          result.responseLength = row.response_length;
        }
        if (row.processing_time_ms) {
          result.processingTimeMs = row.processing_time_ms;
        }
        
        return result;
      });
      
      // 分页信息
      const totalPages = Math.ceil(totalRecords / limit);
      
      return {
        data: userDetails,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalRecords,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      logger.error('获取用户详情失败', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        page,
        limit
      });
      throw error;
    }
  }
}

// 导出单例实例
export const auditLogger = new AuditLogger();