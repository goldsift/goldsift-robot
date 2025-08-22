/**
 * AI 意图识别和交易对提取模块
 * 严格遵守 300 行以内规范
 */

import { config } from './config.js';
import { logger } from './logger.js';
import type { MessageAnalysisResult } from './types.js';
import { TradingAnalysisError } from './types.js';
import { createChatCompletion, type AIMessage } from './ai-client.js';
import { getEnhancedTradingPairs } from './trading-pairs.js';

/**
 * 构建包含交易对上下文的二次识别提示词
 */
function buildAnalysisPromptWithContext(message: string, spotPairs: string[], futuresPairs: string[]): string {
  // 现货：只显示USDT交易对的名称和key值
  const spotUsdtPairs = spotPairs.filter(pair => pair.endsWith('USDT')).sort();
  
  // 合约：显示所有USDT交易对，不包含非USDT
  const futuresUsdtPairs = futuresPairs.filter(pair => pair.endsWith('USDT')).sort();
  
  // 构建显示列表
  const displaySpotPairs = spotUsdtPairs; // 现货只要USDT交易对
  const displayFuturesPairs = futuresUsdtPairs; // 合约显示所有USDT交易对

  // 打印上下文统计信息
  logger.info('二次识别上下文统计', {
    totalSpotPairs: spotPairs.length,
    totalFuturesPairs: futuresPairs.length,
    displaySpotPairs: displaySpotPairs.length,
    displayFuturesPairs: displayFuturesPairs.length,
    spotUsdtCount: spotUsdtPairs.length,
    futuresUsdtCount: futuresUsdtPairs.length
  });
  
  return `消息: "${message}"

现货USDT: ${displaySpotPairs.join(',')}

合约USDT: ${displayFuturesPairs.join(',')}

返回JSON格式:
{"isTradeAnalysis": true, "tradingPair": "BTCUSDT", "tradingPairType": "spot"}

规则: tradingPairType用"spot"或"futures"`;
}



/**
 * 构建意图识别提示词
 */
function buildAnalysisPrompt(message: string): string {
  return `请分析用户消息，判断是否为加密货币交易分析请求，如果是则提取交易对。

用户消息: "${message}"

请严格按照以下JSON格式返回，不要包含任何其他文字、解释或markdown格式:
{
  "isTradeAnalysis": true,
  "tradingPair": "BTCUSDT"
}

识别规则：
1. 如果用户询问任何加密货币的价格、走势、分析、技术指标等，返回 isTradeAnalysis: true
2. 分析方法不是关键字：缠论、威科夫、江恩等只是分析方法，重点是识别币种
3. 交易对格式统一为币安格式，如 BTCUSDT、ETHUSDT、SOLUSDT  
4. 常见币种映射：
   - 比特币/BTC → BTCUSDT
   - 以太坊/ETH → ETHUSDT  
   - 狗狗币/DOGE → DOGEUSDT
   - 索拉纳/SOL → SOLUSDT
5. 如果无法识别具体交易对，tradingPair 设为 null
6. 如果不是交易分析请求，返回 isTradeAnalysis: false, tradingPair: null

示例：
"分析比特币" → {"isTradeAnalysis": true, "tradingPair": "BTCUSDT"}
"使用缠论分析比特币" → {"isTradeAnalysis": true, "tradingPair": "BTCUSDT"}
"BTC走势如何" → {"isTradeAnalysis": true, "tradingPair": "BTCUSDT"}
"今天天气如何" → {"isTradeAnalysis": false, "tradingPair": null}`;
}

/**
 * 调用AI API进行意图识别
 */
async function callAIAPI(prompt: string): Promise<string> {
  try {
    const messages: AIMessage[] = [
      {
        role: 'user' as const,
        content: prompt
      }
    ];
    
    const response = await createChatCompletion(messages, {
      temperature: 0.1,
      maxTokens: 1000, // 增加输出token限制
      enableThinking: false, // 禁用思考模式减少token使用
      thinkingBudget: 0
    });

    const content = response.content;
    if (!content) {
      throw new Error('AI API响应中content为空');
    }

    // 打印思考过程（如果存在）
    if (response.thoughts) {
      logger.info('🧠 意图识别思考过程', {
        model: config.openaiModel,
        thoughts: response.thoughts.substring(0, 200) + (response.thoughts.length > 200 ? '...' : ''),
        thoughtsLength: response.thoughts.length
      });
    }

    logger.info('AI意图识别完成', {
      model: config.openaiModel,
      tokensUsed: response.usage?.total_tokens || 'unknown',
      hasThoughts: !!response.thoughts
    });

    return content.trim();
  } catch (error) {
    logger.error('AI意图识别失败', {
      error: error instanceof Error ? error.message : String(error),
      model: config.openaiModel
    });
    
    throw new TradingAnalysisError(
      `AI API 调用失败: ${error instanceof Error ? error.message : String(error)}`,
      'AI_API_ERROR'
    );
  }
}

/**
 * 解析 AI 响应结果
 */
function parseAIResponse(aiResponse: string): MessageAnalysisResult {
  try {
    // 清理响应内容，移除可能的markdown格式
    let cleanResponse = aiResponse.trim();
    
    logger.debug('原始AI响应', { 
      response: cleanResponse.substring(0, 500) + (cleanResponse.length > 500 ? '...' : ''),
      fullLength: cleanResponse.length 
    });
    
    // 如果包含markdown代码块，提取JSON部分
    const jsonMatch = cleanResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[1];
      logger.debug('从markdown代码块中提取JSON', { extractedJson: cleanResponse });
    } else {
      // 查找JSON对象（处理可能存在的其他文本）
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleanResponse = cleanResponse.substring(jsonStart, jsonEnd + 1);
        logger.debug('从文本中提取JSON对象', { extractedJson: cleanResponse });
      }
    }
    
    // 尝试解析 JSON
    const parsed = JSON.parse(cleanResponse);
    
    // 验证响应格式
    if (typeof parsed.isTradeAnalysis !== 'boolean') {
      throw new Error('isTradeAnalysis 必须为布尔值');
    }
    
    if (parsed.tradingPair !== null && typeof parsed.tradingPair !== 'string') {
      throw new Error('tradingPair 必须为字符串或 null');
    }

    // 验证交易对类型（如果存在）
    if (parsed.tradingPairType && !['spot', 'futures'].includes(parsed.tradingPairType)) {
      throw new Error('tradingPairType 必须为 "spot" 或 "futures"');
    }

    logger.debug('JSON解析成功', { parsed });

    return {
      isTradeAnalysis: parsed.isTradeAnalysis,
      tradingPair: parsed.tradingPair,
      tradingPairType: parsed.tradingPairType || 'spot', // 默认为现货
      confidence: 0.9 // 默认置信度
    };
    
  } catch (error) {
    logger.error('AI 响应解析失败', {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: aiResponse.substring(0, 200) + (aiResponse.length > 200 ? '...' : ''),
      responseLength: aiResponse.length
    });
    
    // 如果解析失败，返回默认值而不是抛出异常
    logger.warn('解析失败，返回默认响应');
    return {
      isTradeAnalysis: false,
      tradingPair: null,
      tradingPairType: 'spot',
      confidence: 0.0
    };
  }
}

/**
 * 验证交易对格式
 */
function validateTradingPair(pair: string | null): string | null {
  if (!pair) return null;
  
  // 基本格式验证：3-10个字母的组合
  const pairRegex = /^[A-Z]{3,10}[A-Z]{3,10}$/;
  if (!pairRegex.test(pair)) {
    logger.warn('交易对格式可能不正确', { pair });
  }
  
  return pair.toUpperCase();
}

/**
 * 二次分析用户消息（使用交易对上下文）
 */
async function analyzeMessageWithContext(message: string, spotPairs: string[], futuresPairs: string[]): Promise<MessageAnalysisResult> {
  try {
    logger.info('开始二次分析用户消息', { 
      spotPairsCount: spotPairs.length, 
      futuresPairsCount: futuresPairs.length 
    });
    
    // 构建包含交易对上下文的提示词
    const prompt = buildAnalysisPromptWithContext(message, spotPairs, futuresPairs);
    
    // 调用 AI 进行二次分析
    const aiResponse = await callAIAPI(prompt);
    
    // 解析 AI 响应
    const result = parseAIResponse(aiResponse);
    
    // 验证交易对格式
    result.tradingPair = validateTradingPair(result.tradingPair);
    
    logger.info('二次分析完成', {
      isTradeAnalysis: result.isTradeAnalysis,
      tradingPair: result.tradingPair,
      tradingPairType: result.tradingPairType,
      confidence: result.confidence
    });
    
    return result;
    
  } catch (error) {
    logger.error('二次分析失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // 二次分析失败时返回原始结果
    return {
      isTradeAnalysis: true, // 假设是交易分析请求
      tradingPair: null,
      tradingPairType: 'spot', // 默认现货
      confidence: 0.1
    };
  }
}

/**
 * 分析用户消息
 * 主要导出函数 - 实现两步识别机制
 */
export async function analyzeMessage(message: string): Promise<MessageAnalysisResult> {
  if (!message || message.trim().length === 0) {
    return {
      isTradeAnalysis: false,
      tradingPair: null,
      tradingPairType: 'spot',
      confidence: 1.0
    };
  }

  try {
    logger.info('开始分析用户消息');
    
    // 第一步：常规意图识别
    const prompt = buildAnalysisPrompt(message);
    const aiResponse = await callAIAPI(prompt);
    const result = parseAIResponse(aiResponse);
    result.tradingPair = validateTradingPair(result.tradingPair);
    
    logger.info('第一步分析完成', {
      isTradeAnalysis: result.isTradeAnalysis,
      tradingPair: result.tradingPair,
      confidence: result.confidence
    });
    
    // 检查是否需要二次识别
    if (result.isTradeAnalysis && result.tradingPair === null) {
      logger.info('第一步识别到交易分析请求但无法识别交易对，开始二次识别');
      
      try {
        // 获取现货和合约交易对
        const { spot, futures } = await getEnhancedTradingPairs();
        
        // 第二步：使用交易对上下文进行二次识别
        const secondResult = await analyzeMessageWithContext(message, spot, futures);
        
        if (secondResult.tradingPair) {
          logger.info('二次识别成功', {
            tradingPair: secondResult.tradingPair,
            tradingPairType: secondResult.tradingPairType,
            confidence: secondResult.confidence
          });
          return secondResult;
        } else {
          logger.info('二次识别仍未找到匹配的交易对');
        }
        
      } catch (error) {
        logger.error('二次识别过程失败', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return result;
    
  } catch (error) {
    logger.error('消息分析失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // 分析失败时的默认返回
    return {
      isTradeAnalysis: false,
      tradingPair: null,
      tradingPairType: 'spot',
      confidence: 0.0
    };
  }
}