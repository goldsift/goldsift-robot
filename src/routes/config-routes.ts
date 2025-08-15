/**
 * 配置管理API路由
 * 提供提示词配置的CRUD操作
 */

import { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../logger.js';
import { promptManager } from '../config/prompt-manager-v2.js';
import { basicConfigManager } from '../config/basic-config-manager.js';
import crypto from 'crypto';

// 内存中存储的token及其过期时间
const tokenStore = new Map<string, { expireAt: number; createdAt: number }>();

/**
 * 生成访问token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 验证密码并生成token
 */
async function authenticateAndGenerateToken(password: string): Promise<string | null> {
  try {
    const adminPassword = await basicConfigManager.getConfigItem('adminPassword') || '123456';
    
    if (password === adminPassword) {
      const token = generateToken();
      const expireAt = Date.now() + 24 * 60 * 60 * 1000; // 24小时过期
      tokenStore.set(token, { expireAt, createdAt: Date.now() });
      
      // 清理过期token
      cleanupExpiredTokens();
      
      logger.info('新的访问token已生成', { tokenPrefix: token.substring(0, 8) });
      return token;
    }
    
    return null;
  } catch (error) {
    logger.error('认证失败', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * 验证token是否有效
 */
function validateToken(token: string): boolean {
  const tokenInfo = tokenStore.get(token);
  if (!tokenInfo) {
    return false;
  }
  
  if (Date.now() > tokenInfo.expireAt) {
    tokenStore.delete(token);
    return false;
  }
  
  return true;
}

/**
 * 清理过期token
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, info] of tokenStore.entries()) {
    if (now > info.expireAt) {
      tokenStore.delete(token);
    }
  }
}

/**
 * 简单的访问控制
 */
async function checkAuth(req: IncomingMessage): Promise<boolean> {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return false;
    }

    // 支持Bearer Token（推荐方式）
    if (auth.startsWith('Bearer ')) {
      const token = auth.substring(7);
      return validateToken(token);
    }

    // 仍然支持Basic Auth作为备用
    if (auth.startsWith('Basic ')) {
      const credentials = Buffer.from(auth.substring(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      const adminPassword = await basicConfigManager.getConfigItem('adminPassword') || '123456';
      return username === 'admin' && password === adminPassword;
    }

    return false;
  } catch (error) {
    logger.error('认证检查失败', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * 读取请求体
 */
function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

/**
 * 发送JSON响应
 */
function sendJsonResponse(res: ServerResponse, data: any, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

/**
 * 发送错误响应
 */
function sendErrorResponse(res: ServerResponse, message: string, statusCode = 500): void {
  logger.error('API错误响应', { message, statusCode });
  sendJsonResponse(res, { error: message }, statusCode);
}

/**
 * 处理配置API路由
 */
export async function handleConfigRoutes(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return true;
  }

  // 检查路径是否匹配配置API
  if (!pathname.startsWith('/api/config/') && !pathname.startsWith('/api/basic-config') && !pathname.startsWith('/api/auth/')) {
    return false;
  }

  try {
    // 登录API不需要认证检查
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readRequestBody(req);
      const { password } = JSON.parse(body);
      
      if (!password) {
        sendErrorResponse(res, '缺少密码字段', 400);
        return true;
      }
      
      const token = await authenticateAndGenerateToken(password);
      if (token) {
        sendJsonResponse(res, {
          success: true,
          token,
          message: '登录成功',
          expiresIn: 24 * 60 * 60 * 1000 // 24小时
        });
      } else {
        sendErrorResponse(res, '密码错误', 401);
      }
      return true;
    }

    // 其他API需要访问控制检查
    if (!(await checkAuth(req))) {
      sendErrorResponse(res, '访问被拒绝，请提供正确的授权令牌', 401);
      return true;
    }

    // 路由处理
    if (pathname === '/api/config/prompts' && req.method === 'GET') {
      // 获取当前配置
      const promptConfig = await promptManager.getConfig();
      const availableVariables = promptManager.getAvailableVariables();
      
      sendJsonResponse(res, {
        config: promptConfig,
        availableVariables
      });
      
    } else if (pathname === '/api/config/prompts/save-new' && req.method === 'POST') {
      // 保存为新版本并使用
      const body = await readRequestBody(req);
      const newConfig = JSON.parse(body);
      
      // 验证必需字段
      if (!newConfig.systemPrompt || !newConfig.analysisPrompt) {
        sendErrorResponse(res, '缺少必需字段：systemPrompt 或 analysisPrompt', 400);
        return true;
      }

      // 保存为新版本
      const savedConfig = await promptManager.saveAsNewVersion({
        version: newConfig.version || '1.0.0',
        lastModified: new Date().toISOString(),
        systemPrompt: newConfig.systemPrompt,
        analysisPrompt: newConfig.analysisPrompt
      });
      
      sendJsonResponse(res, { 
        success: true, 
        message: '新版本保存成功',
        config: savedConfig
      });
      
    } else if (pathname === '/api/config/prompts/update-current' && req.method === 'POST') {
      // 更新当前版本
      const body = await readRequestBody(req);
      const newConfig = JSON.parse(body);
      
      // 验证必需字段
      if (!newConfig.systemPrompt || !newConfig.analysisPrompt) {
        sendErrorResponse(res, '缺少必需字段：systemPrompt 或 analysisPrompt', 400);
        return true;
      }

      // 更新当前版本
      const updatedConfig = await promptManager.updateCurrentVersion({
        version: newConfig.version || '1.0.0',
        lastModified: new Date().toISOString(),
        systemPrompt: newConfig.systemPrompt,
        analysisPrompt: newConfig.analysisPrompt
      });
      
      sendJsonResponse(res, { 
        success: true, 
        message: '当前版本更新成功',
        config: updatedConfig
      });
      
    } else if (pathname === '/api/config/prompts/delete-current' && req.method === 'DELETE') {
      // 删除当前版本
      await promptManager.deleteCurrentVersion();
      
      // 获取新的当前版本
      const newCurrentConfig = await promptManager.getConfig();
      
      sendJsonResponse(res, { 
        success: true, 
        message: '当前版本已删除，已切换到其他版本',
        config: newCurrentConfig
      });
      
    } else if (pathname === '/api/config/prompts/reload' && req.method === 'POST') {
      // 重新加载配置
      const reloadedConfig = await promptManager.reloadConfig();
      
      sendJsonResponse(res, { 
        success: true, 
        message: '配置已重新加载',
        config: reloadedConfig
      });
      
    } else if (pathname === '/api/config/prompts/versions' && req.method === 'GET') {
      // 获取所有版本
      const versions = await promptManager.getAllVersions(50);
      
      sendJsonResponse(res, {
        success: true,
        versions
      });
      
    } else if (pathname.startsWith('/api/config/prompts/switch/') && req.method === 'POST') {
      // 切换版本
      const configId = parseInt(pathname.split('/').pop() || '0');
      if (!configId) {
        sendErrorResponse(res, '无效的配置ID', 400);
        return true;
      }
      
      const switchedConfig = await promptManager.switchToVersion(configId);
      
      sendJsonResponse(res, {
        success: true,
        message: `已切换到版本 ${switchedConfig.version}`,
        config: switchedConfig
      });
      
    } else if (pathname.startsWith('/api/config/prompts/delete/') && req.method === 'DELETE') {
      // 删除版本
      const configId = parseInt(pathname.split('/').pop() || '0');
      if (!configId) {
        sendErrorResponse(res, '无效的配置ID', 400);
        return true;
      }
      
      await promptManager.deleteVersion(configId);
      
      sendJsonResponse(res, {
        success: true,
        message: '版本删除成功'
      });
      
    } else if (pathname === '/api/config/stats' && req.method === 'GET') {
      // 获取统计信息
      const stats = await promptManager.getStats();
      
      sendJsonResponse(res, {
        success: true,
        stats
      });

    } else if (pathname === '/api/basic-config' && req.method === 'GET') {
      // 获取基础配置
      const basicConfig = await basicConfigManager.getConfig();
      const configItems = basicConfigManager.getConfigItems();
      
      sendJsonResponse(res, {
        success: true,
        config: basicConfig,
        configItems
      });

    } else if (pathname === '/api/basic-config' && req.method === 'POST') {
      // 保存基础配置
      const body = await readRequestBody(req);
      const newConfig = JSON.parse(body);
      
      await basicConfigManager.saveConfig(newConfig);
      
      sendJsonResponse(res, {
        success: true,
        message: '基础配置保存成功，需要重启服务以生效'
      });

    } else if (pathname === '/api/basic-config/test' && req.method === 'POST') {
      // 测试基础配置
      const testResults = await basicConfigManager.testConfig();
      const allSuccess = Object.values(testResults).every(result => result.success);
      
      sendJsonResponse(res, {
        success: true,
        results: testResults,
        allSuccess
      });

    } else if (pathname === '/api/basic-config/restart' && req.method === 'POST') {
      // 重新启动服务
      try {
        // 重新加载配置
        const { reloadConfig } = await import('../config.js');
        await reloadConfig();
        
        // 重新启动机器人服务
        const { stopBot, startBot } = await import('../bot.js');
        
        // 先停止现有的机器人
        await stopBot();
        
        // 等待一秒确保完全停止
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 启动机器人
        await startBot();
        
        sendJsonResponse(res, {
          success: true,
          message: '服务重新启动成功'
        });
        
      } catch (error) {
        logger.error('重新启动服务失败', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        sendJsonResponse(res, {
          success: false,
          message: `重新启动失败: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      
    } else if (pathname === '/api/basic-config/change-password' && req.method === 'POST') {
      // 修改管理员密码
      try {
        const body = await readRequestBody(req);
        const { oldPassword, newPassword } = JSON.parse(body);
        
        // 验证输入
        if (!oldPassword || !newPassword) {
          sendErrorResponse(res, '缺少必需字段：oldPassword 或 newPassword', 400);
          return true;
        }
        
        if (newPassword.length < 6) {
          sendErrorResponse(res, '新密码长度不能少于6位', 400);
          return true;
        }
        
        // 修改密码
        await basicConfigManager.changeAdminPassword(oldPassword, newPassword);
        
        sendJsonResponse(res, { 
          success: true, 
          message: '密码修改成功' 
        });
        
      } catch (error) {
        logger.error('修改密码失败', {
          error: error instanceof Error ? error.message : String(error)
        });
        sendErrorResponse(res, error instanceof Error ? error.message : String(error));
      }
      
    } else {
      sendErrorResponse(res, '未找到API端点', 404);
    }

    return true;
    
  } catch (error) {
    logger.error('配置API处理失败', {
      pathname,
      method: req.method,
      error: error instanceof Error ? error.message : String(error)
    });
    
    sendErrorResponse(res, `处理请求失败: ${error instanceof Error ? error.message : String(error)}`);
    return true;
  }
}
