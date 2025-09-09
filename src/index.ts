/**
 * 应用程序入口点
 * 严格遵守 300 行以内规范
 */

import { logger } from './logger.js';
import { config, isDevelopment, initializeSyncConfig } from './config.js';
import { startBot, stopBot } from './bot.js';
import { createServer } from 'http';
import { parse } from 'url';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { handleConfigRoutes } from './routes/config-routes.js';
import { handleDashboardRoutes } from './routes/dashboard-routes.js';

// 全局变量存储HTTP服务器实例
let httpServer: any = null;

/**
 * 启动HTTP服务器（包含健康检查和管理界面）
 */
function startHttpServer(): Promise<void> {
  return new Promise((resolve) => {
    httpServer = createServer(async (req, res) => {
      const parsedUrl = parse(req.url || '', true);
      const pathname = parsedUrl.pathname || '/';

      try {
        // 健康检查端点
        if (pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'crypto-trading-bot'
          }));
          return;
        }

        // 管理界面
        if (pathname === '/admin' || pathname === '/') {
          try {
            const adminHtml = await readFile(join(process.cwd(), 'src', 'web', 'admin.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(adminHtml);
            return;
          } catch (error) {
            logger.error('加载管理界面失败', { error: error instanceof Error ? error.message : String(error) });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '管理界面加载失败' }));
            return;
          }
        }

        // 配置API路由
        if (await handleConfigRoutes(req, res, pathname)) {
          return;
        }

        // Dashboard API路由
        if (await handleDashboardRoutes(req, res, pathname)) {
          return;
        }

        // 404 处理
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));

      } catch (error) {
        logger.error('HTTP请求处理失败', {
          pathname,
          method: req.method,
          error: error instanceof Error ? error.message : String(error)
        });
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });

    httpServer.listen(config.port, config.host, () => {
      logger.info(`🌐 HTTP服务器启动`, {
        host: config.host,
        port: config.port,
        healthEndpoint: `/health`,
        adminInterface: `/admin`,
        configApi: `/api/config/prompts`,
        dashboardApi: `/api/dashboard/stats`,
        externalAccess: config.host === '0.0.0.0' ? '支持外部访问' : '仅本地访问'
      });
      resolve();
    });
  });
}

/**
 * 检查必要的配置是否完整
 */
async function checkRequiredConfigs(): Promise<boolean> {
  try {
    const requiredConfigs = ['telegramBotToken', 'openaiApiKey'];
    
    for (const configKey of requiredConfigs) {
      const value = config[configKey as keyof typeof config];
      if (!value || value === '') {
        logger.warn('缺少必要配置', { configKey });
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.error('配置检查失败', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * 应用程序启动函数
 */
async function startApplication(): Promise<void> {
  try {
    // 首先初始化配置
    await initializeSyncConfig();
    
    logger.info('🚀 启动加密货币交易分析机器人', {
      nodeEnv: config.nodeEnv,
      port: config.port,
      isDevelopment: isDevelopment()
    });

    // 启动HTTP服务器（总是启动，用于配置管理）
    await startHttpServer();

    // 检查配置是否完整
    const hasRequiredConfigs = await checkRequiredConfigs();
    
    if (hasRequiredConfigs) {
      // 配置完整，启动 Telegram Bot
      await startBot();
      
      logger.info('✅ 应用程序完全启动成功', {
        botStatus: 'running',
        logLevel: config.logLevel,
        adminUrl: config.host === '0.0.0.0' 
          ? `http://服务器IP:${config.port}/admin` 
          : `http://localhost:${config.port}/admin`
      });

      // 在开发环境下输出额外信息
      if (isDevelopment()) {
        logger.info('🔧 开发环境信息', {
          openaiBaseUrl: config.openaiBaseUrl,
          openaiModel: config.openaiModel,
          hasBinanceConfig: Boolean(config.binanceApiKey)
        });
      }
    } else {
      // 配置不完整，只启动管理界面
      logger.warn('⚠️ 配置不完整，仅启动管理界面', {
        adminUrl: config.host === '0.0.0.0' 
          ? `http://服务器IP:${config.port}/admin` 
          : `http://localhost:${config.port}/admin`,
        message: '请访问管理界面完成配置，然后重新启动服务'
      });
      
      logger.info('📋 缺少必要配置项：');
      logger.info('  1. Telegram Bot Token - 从 @BotFather 获取');
      logger.info('  2. OpenAI API Key - OpenAI或兼容API的密钥');
      logger.info(`  3. 配置完成后点击重启服务按钮`);
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
    
          // 关闭HTTP服务器
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => {
            logger.info('🌐 HTTP服务器已关闭');
            resolve();
          });
        });
      }
    
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