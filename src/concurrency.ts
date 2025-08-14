/**
 * 并发控制管理器
 * 严格遵守 300 行以内规范
 */

import { logger } from './logger.js';
import { config } from './config.js';
import type { ConcurrencyManager } from './types.js';

/**
 * 并发控制管理器实现
 */
class ConcurrencyManagerImpl implements ConcurrencyManager {
  /** 当前全局并发数 */
  public globalCount: number = 0;
  
  /** 每个群的并发状态 - true表示该群正在进行分析 */
  public groupAnalysis: Map<number, boolean> = new Map();
  
  /**
   * 检查是否可以开始新的分析
   */
  canStartAnalysis(chatId: number): boolean {
    // 检查全局并发限制
    if (this.globalCount >= config.maxConcurrentAnalysis) {
      logger.debug('全局并发已达上限', {
        currentGlobal: this.globalCount,
        maxConcurrent: config.maxConcurrentAnalysis,
        chatId
      });
      return false;
    }
    
    // 检查该群是否已在分析中
    if (this.groupAnalysis.get(chatId) === true) {
      logger.debug('该群已有分析在进行中', {
        chatId,
        currentGlobal: this.globalCount
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * 开始分析（增加计数）
   */
  startAnalysis(chatId: number): void {
    if (!this.canStartAnalysis(chatId)) {
      throw new Error('Cannot start analysis: concurrency limit exceeded');
    }
    
    this.globalCount++;
    this.groupAnalysis.set(chatId, true);
    
    logger.info('开始分析', {
      chatId,
      globalCount: this.globalCount,
      maxConcurrent: config.maxConcurrentAnalysis
    });
  }
  
  /**
   * 完成分析（减少计数）
   */
  finishAnalysis(chatId: number): void {
    if (this.groupAnalysis.get(chatId) === true) {
      this.globalCount = Math.max(0, this.globalCount - 1);
      this.groupAnalysis.set(chatId, false);
      
      logger.info('完成分析', {
        chatId,
        globalCount: this.globalCount,
        maxConcurrent: config.maxConcurrentAnalysis
      });
    } else {
      logger.warn('尝试完成未开始的分析', {
        chatId,
        globalCount: this.globalCount
      });
    }
  }
  
  /**
   * 获取当前状态信息
   */
  getStatus(): {
    globalCount: number;
    maxConcurrent: number;
    activeGroups: number[];
  } {
    const activeGroups: number[] = [];
    for (const [chatId, isActive] of this.groupAnalysis.entries()) {
      if (isActive) {
        activeGroups.push(chatId);
      }
    }
    
    return {
      globalCount: this.globalCount,
      maxConcurrent: config.maxConcurrentAnalysis,
      activeGroups
    };
  }
  
  /**
   * 清理过期的群状态（可选的维护方法）
   */
  cleanup(): void {
    let cleanedCount = 0;
    for (const [chatId, isActive] of this.groupAnalysis.entries()) {
      if (!isActive) {
        this.groupAnalysis.delete(chatId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('清理并发状态', {
        cleanedGroups: cleanedCount,
        remainingGroups: this.groupAnalysis.size
      });
    }
  }
}

/**
 * 全局并发控制管理器实例
 */
export const concurrencyManager: ConcurrencyManager = new ConcurrencyManagerImpl();

/**
 * 并发控制装饰器 - 用于包装需要并发控制的异步函数
 */
export function withConcurrencyControl<T extends any[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async function(...args: T): Promise<R> {
    // 假设第一个参数包含 chatId
    const chatId = (args[0] as any)?.chat?.id;
    
    if (typeof chatId !== 'number') {
      throw new Error('Cannot apply concurrency control: chatId not found');
    }
    
    if (!concurrencyManager.canStartAnalysis(chatId)) {
      throw new Error('Analysis request rejected due to concurrency limits');
    }
    
    concurrencyManager.startAnalysis(chatId);
    
    try {
      const result = await fn(...args);
      return result;
    } finally {
      concurrencyManager.finishAnalysis(chatId);
    }
  };
}
