/**
 * 项目核心类型定义
 */

// Telegram Bot 相关类型定义
export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
  [key: string]: any; // 其他可能的字段
}

// 消息解析结果
export interface MessageAnalysisResult {
  /** 是否为交易分析请求 */
  isTradeAnalysis: boolean;
  /** 提取的交易对符号 */
  tradingPair: string | null;
  /** 识别置信度 */
  confidence?: number;
}

// K线数据结构
export interface KlineData {
  /** 开盘时间（UTC ISO字符串格式） */
  openTime: string;
  /** 开盘价 */
  open: string;
  /** 最高价 */
  high: string;
  /** 最低价 */
  low: string;
  /** 收盘价 */
  close: string;
  /** 成交量 */
  volume: string;
  /** 收盘时间（UTC ISO字符串格式） */
  closeTime: string;
  /** 格式化的开盘时间（本地时区） */
  openTimeFormatted?: string;
  /** 格式化的收盘时间（本地时区） */
  closeTimeFormatted?: string;
}

// 多时间框架K线数据
export interface TimeframeKlineData {
  '15m': KlineData[];
  '1h': KlineData[];
  '4h': KlineData[];
  '1d': KlineData[];
  '1w': KlineData[];
  '1M': KlineData[];
}

// 时间框架类型
export type TimeframeType = '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志条目
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | undefined;
}

// AI提供商类型
export type AIProvider = 'openai' | 'gemini' | 'claude';

// 环境变量配置
export interface Config {
  telegramBotToken: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** AI提供商类型，明确指定使用哪种AI服务 */
  aiProvider: AIProvider;
  binanceApiKey: string | undefined;
  binanceSecret: string | undefined;
  port: number;
  nodeEnv: string;
  logLevel: LogLevel;
  /** 时区配置，格式如 'Asia/Shanghai', 'America/New_York' 等 */
  timezone: string;
  /** 全局最大并发分析数量 */
  maxConcurrentAnalysis: number;
  /** 是否启用新成员欢迎消息 */
  enableNewMemberWelcome: boolean;
}

// 并发控制相关类型
export interface ConcurrencyManager {
  /** 当前全局并发数 */
  globalCount: number;
  /** 每个群的并发状态 */
  groupAnalysis: Map<number, boolean>;
  /** 检查是否可以开始新的分析 */
  canStartAnalysis(chatId: number): boolean;
  /** 开始分析（增加计数） */
  startAnalysis(chatId: number): void;
  /** 完成分析（减少计数） */
  finishAnalysis(chatId: number): void;
  /** 获取当前状态信息 */
  getStatus(): {
    globalCount: number;
    maxConcurrent: number;
    activeGroups: number[];
  };
}

// API错误类型
export class TradingAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TradingAnalysisError';
  }
}