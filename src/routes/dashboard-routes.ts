/**
 * Dashboard API路由
 * 提供审计日志Dashboard相关的API接口
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { logger } from '../logger.js';
import { auditLogger } from '../audit-logger.js';

/**
 * 发送JSON响应
 */
function sendJsonResponse(res: ServerResponse, data: any, statusCode: number = 200): void {
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
function sendErrorResponse(res: ServerResponse, message: string, statusCode: number = 500): void {
  logger.error('Dashboard API错误', { message, statusCode });
  sendJsonResponse(res, { error: message }, statusCode);
}

/**
 * 获取Dashboard基本统计信息
 * GET /api/dashboard/stats
 */
async function handleGetStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const stats = await auditLogger.getDashboardStats();
    sendJsonResponse(res, {
      success: true,
      data: stats
    });
  } catch (error) {
    sendErrorResponse(res, '获取统计信息失败');
  }
}

/**
 * 获取用户排行列表
 * GET /api/dashboard/users?page=1&limit=10
 */
async function handleGetUsers(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const parsedUrl = parse(req.url || '', true);
    const query = parsedUrl.query;
    
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    
    // 限制limit范围
    const validLimit = Math.min(Math.max(limit, 1), 50);
    
    const userStats = await auditLogger.getUserStats(page, validLimit);
    
    sendJsonResponse(res, {
      success: true,
      data: userStats.data,
      pagination: userStats.pagination
    });
  } catch (error) {
    sendErrorResponse(res, '获取用户列表失败');
  }
}

/**
 * 获取指定用户的详细调用记录
 * GET /api/dashboard/user/:userId?page=1&limit=10
 */
async function handleGetUserDetails(req: IncomingMessage, res: ServerResponse, userId: string): Promise<void> {
  try {
    const parsedUrl = parse(req.url || '', true);
    const query = parsedUrl.query;
    
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const userIdNumber = parseInt(userId);
    
    if (isNaN(userIdNumber)) {
      sendErrorResponse(res, '无效的用户ID', 400);
      return;
    }
    
    // 限制limit范围
    const validLimit = Math.min(Math.max(limit, 1), 50);
    
    const userDetails = await auditLogger.getUserDetails(userIdNumber, page, validLimit);
    
    sendJsonResponse(res, {
      success: true,
      data: userDetails.data,
      pagination: userDetails.pagination
    });
  } catch (error) {
    sendErrorResponse(res, '获取用户详情失败');
  }
}

/**
 * 处理Dashboard API路由
 */
export async function handleDashboardRoutes(
  req: IncomingMessage, 
  res: ServerResponse, 
  pathname: string
): Promise<boolean> {
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

  // Dashboard API路由匹配
  if (pathname.startsWith('/api/dashboard/')) {
    const apiPath = pathname.replace('/api/dashboard/', '');
    
    try {
      if (req.method === 'GET') {
        // GET /api/dashboard/stats - 获取基本统计
        if (apiPath === 'stats') {
          await handleGetStats(req, res);
          return true;
        }
        
        // GET /api/dashboard/users - 获取用户列表
        if (apiPath === 'users') {
          await handleGetUsers(req, res);
          return true;
        }
        
        // GET /api/dashboard/user/:userId - 获取用户详情
        const userDetailsMatch = apiPath.match(/^user\/(\d+)$/);
        if (userDetailsMatch) {
          const userId = userDetailsMatch[1];
          await handleGetUserDetails(req, res, userId);
          return true;
        }
      }
      
      // 未匹配到路由
      sendErrorResponse(res, 'Dashboard API路由未找到', 404);
      return true;
      
    } catch (error) {
      logger.error('Dashboard API处理异常', {
        pathname,
        method: req.method,
        error: error instanceof Error ? error.message : String(error)
      });
      sendErrorResponse(res, 'Dashboard API内部错误');
      return true;
    }
  }
  
  return false;
}