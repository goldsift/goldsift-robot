/**
 * 项目配置管理
 * 严格遵守 300 行以内规范
 */

import { config as loadEnv } from 'dotenv';
import type { Config, LogLevel, AIProvider } from './types.js';

// 加载环境变量
loadEnv();

/**
 * 验证必需的环境变量
 */
function validateRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`缺少必需的环境变量: ${key}`);
  }
  return value;
}

/**
 * 验证日志级别
 */
function validateLogLevel(level: string): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(level as LogLevel)) {
    throw new Error(`无效的日志级别: ${level}`);
  }
  return level as LogLevel;
}

/**
 * 验证端口号
 */
function validatePort(portStr: string): number {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`无效的端口号: ${portStr}`);
  }
  return port;
}

/**
 * 验证最大并发数
 */
function validateMaxConcurrency(concurrencyStr: string): number {
  const concurrency = parseInt(concurrencyStr, 10);
  if (isNaN(concurrency) || concurrency < 1 || concurrency > 100) {
    throw new Error(`无效的最大并发数: ${concurrencyStr}，应在1-100之间`);
  }
  return concurrency;
}

/**
 * 验证时区格式
 */
function validateTimezone(timezone: string): string {
  try {
    // 测试时区是否有效
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch (error) {
    throw new Error(`无效的时区格式: ${timezone}`);
  }
}

/**
 * 验证AI提供商类型
 */
function validateAIProvider(provider: string): AIProvider {
  const validProviders: AIProvider[] = ['openai', 'gemini', 'claude'];
  if (!validProviders.includes(provider as AIProvider)) {
    throw new Error(`无效的AI提供商类型: ${provider}。支持的类型: ${validProviders.join(', ')}`);
  }
  return provider as AIProvider;
}

/**
 * 创建项目配置
 */
function createConfig(): Config {
  try {
    return {
      // Telegram 配置（必需）
      telegramBotToken: validateRequiredEnv('TELEGRAM_BOT_TOKEN'),
      
      // OpenAI 配置（必需）
      openaiApiKey: validateRequiredEnv('OPENAI_API_KEY'),
      openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
      
      // AI提供商类型配置（必需）
      aiProvider: validateAIProvider(process.env.AI_PROVIDER || 'openai'),
      
      // 币安配置（可选）
      binanceApiKey: process.env.BINANCE_API_KEY,
      binanceSecret: process.env.BINANCE_SECRET,
      
      // 服务配置
      port: validatePort(process.env.PORT || '3000'),
      nodeEnv: process.env.NODE_ENV || 'development',
      
      // 日志配置
      logLevel: validateLogLevel(process.env.LOG_LEVEL || 'info'),
      
      // 时区配置
      timezone: validateTimezone(process.env.TIMEZONE || 'Asia/Shanghai'),
      
      // 并发控制配置
      maxConcurrentAnalysis: validateMaxConcurrency(process.env.MAX_CONCURRENT_ANALYSIS || '10'),
      
      // 新成员欢迎配置
      enableNewMemberWelcome: process.env.ENABLE_NEW_MEMBER_WELCOME !== 'false'
    };
  } catch (error) {
    console.error('配置验证失败:', error);
    process.exit(1);
  }
}

/**
 * 导出全局配置实例
 */
export const config = createConfig();

/**
 * 检查是否为开发环境
 */
export const isDevelopment = config.nodeEnv === 'development';

/**
 * 检查是否为生产环境
 */
export const isProduction = config.nodeEnv === 'production';

