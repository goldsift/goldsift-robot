/**
 * 应用程序入口点
 * 严格遵守 300 行以内规范
 */

import { logger } from './logger.js';
import { config, isDevelopment } from './config.js';
import { startBot, stopBot } from './bot.js';

/**
 * 应用程序启动函数
 */
async function startApplication(): Promise<void> {
  try {
    logger.info('🚀 启动加密货币交易分析机器人', {
      nodeEnv: config.nodeEnv,
      port: config.port,
      isDevelopment
    });

    // 启动 Telegram Bot
    await startBot();

    logger.info('✅ 应用程序启动成功', {
      botStatus: 'running',
      logLevel: config.logLevel
    });

    // 在开发环境下输出额外信息
    if (isDevelopment) {
      logger.info('🔧 开发环境信息', {
        openaiBaseUrl: config.openaiBaseUrl,
        openaiModel: config.openaiModel,
        hasBinanceConfig: Boolean(config.binanceApiKey)
      });
    }

  } catch (error) {
    logger.error('❌ 应用程序启动失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // 启动失败时退出进程
    process.exit(1);
  }
}

/**
 * 应用程序关闭函数
 */
async function shutdownApplication(signal: string): Promise<void> {
  logger.info(`📴 接收到${signal}信号，开始关闭应用程序...`);

  try {
    // 停止 Telegram Bot
    await stopBot();
    
    logger.info('✅ 应用程序已安全关闭');
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ 应用程序关闭过程中发生错误', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // 强制退出
    process.exit(1);
  }
}

/**
 * 设置进程信号处理器
 */
function setupSignalHandlers(): void {
  // 处理 SIGTERM (Docker stop)
  process.on('SIGTERM', () => {
    shutdownApplication('SIGTERM');
  });

  // 处理 SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    shutdownApplication('SIGINT');
  });

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logger.error('❌ 未捕获的异常', {
      error: error.message,
      stack: error.stack
    });
    
    // 异常情况下也要尝试优雅关闭
    shutdownApplication('UNCAUGHT_EXCEPTION');
  });

  // 处理未处理的Promise拒绝
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ 未处理的Promise拒绝', {
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise)
    });
    
    // Promise拒绝通常不需要立即退出，记录日志即可
  });
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 设置进程信号处理器
  setupSignalHandlers();

  // 启动应用程序
  await startApplication();
}

// 执行主函数
main().catch((error) => {
  console.error('主函数执行失败:', error);
  process.exit(1);
});