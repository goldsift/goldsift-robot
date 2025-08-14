/**
 * 币安 K线数据获取模块（使用官方 REST API）
 * 严格遵守 300 行以内规范
 */

import axios from 'axios';
import { logger } from './logger.js';
import type { TimeframeKlineData, TimeframeType, KlineData } from './types.js';
import { TradingAnalysisError } from './types.js';

// 币安公开API基础URL
const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

/**
 * 支持的时间框架
 */
const TIMEFRAMES = [
  '15m',  // 15分钟
  '1h',   // 1小时
  '4h',   // 4小时
  '1d',   // 1天
  '1w',   // 1周
  '1M'    // 1月
] as const;

/**
 * 转换币安原始K线数据格式
 * 币安API返回格式：[开盘时间, 开盘价, 最高价, 最低价, 收盘价, 成交量, 收盘时间, ...]
 */
function transformKlineData(rawData: any[]): KlineData[] {
  return rawData.map(item => ({
    openTime: new Date(parseInt(item[0])).toISOString(),
    open: item[1],
    high: item[2],
    low: item[3],
    close: item[4],
    volume: item[5],
    closeTime: new Date(parseInt(item[6])).toISOString()
  }));
}

/**
 * 获取单个时间框架的K线数据（使用币安REST API）
 */
async function getSingleTimeframeKlines(
  symbol: string,
  interval: TimeframeType,
  limit: number = 100
): Promise<KlineData[]> {
  try {
    logger.debug(`获取K线数据`, { symbol, interval, limit });
    
    const response = await axios.get(`${BINANCE_API_BASE}/klines`, {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit
      },
      timeout: 10000
    });

    const transformedData = transformKlineData(response.data);
    
    logger.debug(`K线数据获取成功`, { 
      symbol, 
      interval, 
      count: transformedData.length 
    });
    
    return transformedData;
    
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : String(error);
    let errorCode = 'BINANCE_API_ERROR';
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      
      if (status === 400 && data?.msg?.includes('Invalid symbol')) {
        errorCode = 'INVALID_SYMBOL';
        errorMessage = `无效的交易对: ${symbol}`;
      } else if (status === 429) {
        errorCode = 'RATE_LIMIT';
        errorMessage = '请求频率限制，请稍后重试';
      } else {
        errorMessage = `币安API错误: ${data?.msg || error.message}`;
      }
    }
    
    logger.error(`获取K线数据失败`, {
      symbol,
      interval,
      error: errorMessage
    });
    
    throw new TradingAnalysisError(
      errorMessage,
      errorCode,
      { symbol, interval }
    );
  }
}

/**
 * 并行获取多时间框架K线数据
 */
async function getMultiTimeframeKlines(
  symbol: string, 
  limit: number = 100
): Promise<TimeframeKlineData> {
  logger.info(`开始获取多时间框架K线数据`, { symbol, limit });
  
  try {
    // 并行获取所有时间框架的数据
    const promises = TIMEFRAMES.map(timeframe => 
      getSingleTimeframeKlines(symbol, timeframe, limit)
    );
    
    const results = await Promise.all(promises);
    
    // 组装结果对象
    const klineData: TimeframeKlineData = {
      '15m': results[0],
      '1h': results[1],
      '4h': results[2],
      '1d': results[3],
      '1w': results[4],
      '1M': results[5]
    };
    
    logger.info(`多时间框架K线数据获取完成`, { 
      symbol,
      timeframes: TIMEFRAMES.length,
      totalDataPoints: Object.values(klineData).reduce((sum, data) => sum + data.length, 0)
    });
    
    return klineData;
    
  } catch (error) {
    logger.error(`获取多时间框架K线数据失败`, {
      symbol,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error; // 重新抛出错误，让上层处理
  }
}

/**
 * 验证交易对是否存在（可选功能）
 */
async function validateSymbol(symbol: string): Promise<boolean> {
  try {
    // 尝试获取最近的一条K线数据来验证交易对
    await axios.get(`${BINANCE_API_BASE}/klines`, {
      params: {
        symbol: symbol.toUpperCase(),
        interval: '1h',
        limit: 1
      },
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 主要导出函数：获取K线数据
 */
export async function getKlineData(
  symbol: string, 
  limit: number = 100
): Promise<TimeframeKlineData> {
  if (!symbol || symbol.trim().length === 0) {
    throw new TradingAnalysisError(
      '交易对符号不能为空',
      'EMPTY_SYMBOL'
    );
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  
  logger.info(`开始获取K线数据`, { 
    symbol: cleanSymbol, 
    limit
  });

  return await getMultiTimeframeKlines(cleanSymbol, limit);
}

/**
 * 导出交易对验证函数（可选使用）
 */
export { validateSymbol };