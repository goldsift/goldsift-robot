/**
 * 项目配置管理
 * 严格遵守 300 行以内规范
 */

import { config as loadEnv } from 'dotenv';
import type { Config, LogLevel } from './types.js';
import { basicConfigManager } from './config/basic-config-manager.js';

// 加载环境变量
loadEnv();

// 全局配置缓存
let globalConfig: Config | null = null;



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
 * 从数据库创建项目配置
 */
async function createConfigFromDatabase(): Promise<Config> {
  try {
    // 从数据库加载基础配置
    const basicConfig = await basicConfigManager.getConfig();
    
    return {
      // 从数据库加载的配置
      telegramBotToken: basicConfig.telegramBotToken,
      openaiApiKey: basicConfig.openaiApiKey,
      openaiBaseUrl: basicConfig.openaiBaseUrl,
      openaiModel: basicConfig.openaiModel,
      aiProvider: basicConfig.aiProvider,
      timezone: validateTimezone(basicConfig.timezone),
      binanceApiKey: basicConfig.binanceApiKey,
      binanceSecret: basicConfig.binanceSecret,
      maxConcurrentAnalysis: validateMaxConcurrency(String(basicConfig.maxConcurrentAnalysis)),
      enableNewMemberWelcome: basicConfig.enableNewMemberWelcome,
      
      // 仍然从环境变量加载的配置
      port: validatePort(process.env.PORT || '3000'),
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: validateLogLevel(process.env.LOG_LEVEL || 'info')
    };
  } catch (error) {
    console.error('配置加载失败:', error);
    process.exit(1);
  }
}

/**
 * 初始化配置
 */
async function initializeConfig(): Promise<Config> {
  if (globalConfig) {
    return globalConfig;
  }
  
  globalConfig = await createConfigFromDatabase();
  return globalConfig;
}

/**
 * 获取配置实例（异步）
 */
export async function getConfig(): Promise<Config> {
  return await initializeConfig();
}

/**
 * 重新加载配置
 */
export async function reloadConfig(): Promise<Config> {
  globalConfig = null;
  const newConfig = await initializeConfig();
  // 更新全局config对象
  Object.assign(config, newConfig);
  return newConfig;
}

// 为了向后兼容，保留同步导出（在应用启动时初始化）
export let config: Config;

/**
 * 初始化同步配置（在应用启动时调用）
 */
export async function initializeSyncConfig(): Promise<void> {
  config = await initializeConfig();
}

/**
 * 检查是否为开发环境
 */
export function isDevelopment(): boolean {
  return config?.nodeEnv === 'development';
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
  return config?.nodeEnv === 'production';
}

