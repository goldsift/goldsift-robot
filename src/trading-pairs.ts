/**
 * 币安交易对获取模块
 * 严格遵守 300 行以内规范
 */

import axios from 'axios';
import { logger } from './logger.js';
import { TradingAnalysisError } from './types.js';

// 币安公开API基础URL
const BINANCE_API_BASE = 'https://api.binance.com/api/v3';
// 币安合约API基础URL  
const BINANCE_FUTURES_API_BASE = 'https://fapi.binance.com/fapi/v1';

/**
 * 获取现货交易对信息
 */
async function getSpotTradingPairs(): Promise<string[]> {
  try {
    logger.debug('获取现货交易对信息');
    
    const response = await axios.get(`${BINANCE_API_BASE}/exchangeInfo`, {
      timeout: 10000
    });

    const symbols = response.data.symbols
      .filter((symbol: any) => symbol.status === 'TRADING') // 只获取正在交易的
      .map((symbol: any) => symbol.symbol);

    logger.debug('现货交易对信息获取成功', { 
      totalSymbols: symbols.length 
    });
    
    return symbols;
    
  } catch (error) {
    logger.error('获取现货交易对信息失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new TradingAnalysisError(
      '获取现货交易对信息失败',
      'BINANCE_API_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * 获取合约交易对信息
 */
async function getFuturesTradingPairs(): Promise<string[]> {
  try {
    logger.debug('获取合约交易对信息');
    
    const response = await axios.get(`${BINANCE_FUTURES_API_BASE}/exchangeInfo`, {
      timeout: 10000
    });

    const symbols = response.data.symbols
      .filter((symbol: any) => symbol.status === 'TRADING') // 只获取正在交易的
      .map((symbol: any) => symbol.symbol);

    logger.debug('合约交易对信息获取成功', { 
      totalSymbols: symbols.length 
    });
    
    return symbols;
    
  } catch (error) {
    logger.error('获取合约交易对信息失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new TradingAnalysisError(
      '获取合约交易对信息失败',
      'BINANCE_FUTURES_API_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * 获取所有币安交易对信息（现货+合约）
 */
export async function getAllTradingPairs(): Promise<string[]> {
  try {
    logger.debug('获取所有交易对信息（现货+合约）');
    
    // 并行获取现货和合约交易对
    const [spotSymbols, futuresSymbols] = await Promise.all([
      getSpotTradingPairs(),
      getFuturesTradingPairs()
    ]);

    // 合并去重
    const allSymbols = Array.from(new Set([...spotSymbols, ...futuresSymbols]));

    logger.debug('所有交易对信息获取成功', { 
      spotCount: spotSymbols.length,
      futuresCount: futuresSymbols.length,
      totalCount: allSymbols.length
    });
    
    return allSymbols;
    
  } catch (error) {
    logger.error('获取所有交易对信息失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new TradingAnalysisError(
      '获取所有交易对信息失败',
      'BINANCE_API_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * 获取增强的交易对列表（包含类型信息）
 */
export async function getEnhancedTradingPairs(): Promise<{spot: string[], futures: string[]}> {
  try {
    logger.debug('获取增强的交易对信息');
    
    // 并行获取现货和合约交易对
    const [spotSymbols, futuresSymbols] = await Promise.all([
      getSpotTradingPairs(),
      getFuturesTradingPairs()
    ]);

    logger.debug('增强交易对信息获取成功', { 
      spotCount: spotSymbols.length,
      futuresCount: futuresSymbols.length
    });
    
    return {
      spot: spotSymbols,
      futures: futuresSymbols
    };
    
  } catch (error) {
    logger.error('获取增强交易对信息失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new TradingAnalysisError(
      '获取增强交易对信息失败',
      'BINANCE_API_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * 检测交易对类型（现货或合约）
 */
export async function detectTradingPairType(symbol: string): Promise<'spot' | 'futures' | null> {
  try {
    const symbolUpper = symbol.toUpperCase();
    const { spot, futures } = await getEnhancedTradingPairs();
    
    const isSpot = spot.includes(symbolUpper);
    const isFutures = futures.includes(symbolUpper);
    
    if (isSpot && isFutures) {
      // 如果同时存在，优先返回现货
      return 'spot';
    } else if (isSpot) {
      return 'spot';
    } else if (isFutures) {
      return 'futures';
    } else {
      return null;
    }
    
  } catch (error) {
    logger.error('检测交易对类型失败', {
      symbol,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}