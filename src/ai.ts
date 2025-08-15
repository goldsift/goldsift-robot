/**
 * AI 交易分析模块
 * 严格遵守 300 行以内规范
 */

import { config } from './config.js';
import { logger } from './logger.js';
import type { TimeframeKlineData } from './types.js';
import { TradingAnalysisError } from './types.js';
import { createChatCompletion, createStreamingChatCompletion, type AIMessage } from './ai-client.js';
import { getCurrentTime } from './timezone.js';
import { promptManager } from './config/prompt-manager-v2.js';

/**
 * 构建交易分析提示词
 */
async function buildAnalysisPrompt(
  question: string,
  symbol: string,
  klineData: TimeframeKlineData
): Promise<string> {
  // 构建完整的K线数据，使用格式化后的时间
  const fullKlineData = Object.entries(klineData).map(([timeframe, data]) => {
    // 使用格式化后的时间数据
    const formattedData = data.map((kline: any) => ({
      // 使用已经格式化好的本地时间
      openTime: kline.openTimeFormatted || kline.openTime,
      closeTime: kline.closeTimeFormatted || kline.closeTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume
    }));

    // 添加一些基础统计信息
    const latest = formattedData[formattedData.length - 1];
    const oldest = formattedData[0];
    const priceChangePercent = ((latest.close - oldest.close) / oldest.close * 100).toFixed(2);
    
    return {
      timeframe,
      dataCount: formattedData.length,
      timeRange: {
        from: oldest.openTime,
        to: latest.closeTime
      },
      priceRange: {
        start: oldest.close,
        end: latest.close,
        changePercent: priceChangePercent,
        high: Math.max(...formattedData.map((k: any) => k.high)),
        low: Math.min(...formattedData.map((k: any) => k.low))
      },
      klines: formattedData
    };
  });

  // 获取当前提示词配置
  const promptConfig = await promptManager.getConfig();
  
  // 替换提示词中的变量
  return promptManager.replaceVariables(promptConfig.analysisPrompt, {
    question,
    symbol,
    timezone: config.timezone,
    currentTime: getCurrentTime(),
    klineData: JSON.stringify(fullKlineData, null, 2)
  });
}

/**
 * 调用 AI API 进行交易分析
 */
async function callAnalysisAPI(prompt: string): Promise<string> {
  try {
    // 获取系统提示词配置
    const promptConfig = await promptManager.getConfig();
    
    const messages: AIMessage[] = [
      {
        role: 'system' as const,
        content: promptConfig.systemPrompt
      },
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    const response = await createChatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 8000,
      enableThinking: true,
      thinkingBudget: -1 // 启用动态思考
    });

    const analysisResult = response.content;
    
    if (!analysisResult) {
      throw new Error('AI返回了空的分析结果');
    }

    // 打印思考过程（如果存在）
    if (response.thoughts) {
      logger.info('🧠 AI思考过程', {
        model: config.openaiModel,
        thoughts: response.thoughts.substring(0, 500) + (response.thoughts.length > 500 ? '...' : ''),
        thoughtsLength: response.thoughts.length
      });
    }
    
    logger.info('AI交易分析完成', {
      responseLength: analysisResult.length,
      model: config.openaiModel,
      tokensUsed: response.usage?.total_tokens || 'unknown',
      hasThoughts: !!response.thoughts
    });
    
    return analysisResult.trim();
    
  } catch (error) {
    logger.error('AI分析API调用失败', {
      error: error instanceof Error ? error.message : String(error),
      model: config.openaiModel
    });
    
    throw new TradingAnalysisError(
      `AI分析服务调用失败: ${error instanceof Error ? error.message : String(error)}`,
      'AI_API_ERROR',
      { baseURL: config.openaiBaseUrl, model: config.openaiModel }
    );
  }
}

/**
 * 验证和清理分析结果
 */
function processAnalysisResult(result: string, symbol: string): string {
  if (!result || result.trim().length === 0) {
    throw new TradingAnalysisError(
      'AI返回了空的分析结果',
      'EMPTY_ANALYSIS_RESULT'
    );
  }

  // 使用与流式格式化一致的格式
  let formattedResult = result;
  
  // 对内容进行基本的Markdown格式化
  formattedResult = formattedResult
    // 确保标题使用粗体
    .replace(/^(\d+\.\s*[\u4e00-\u9fa5]+.*?):/gm, '*$1:*')
    // 确保重要价位使用代码块
    .replace(/(\$?[\d,]+\.?\d*\s*USDT?)/g, '`$1`')
    // 确保百分比使用代码块
    .replace(/([+-]?\d+\.?\d*%)/g, '`$1`');

  // 确保结果包含免责声明
  if (!formattedResult.includes('免责声明') && !formattedResult.includes('仅供参考')) {
    formattedResult += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ *免责声明*：以上分析仅供参考，不构成投资建议，投资有风险，请谨慎决策。';
  }

  // 在结果开头添加交易对信息
  const header = `📊 *${symbol} 交易分析报告*\n\n`;
  
  return header + formattedResult;
}

/**
 * 主要导出函数：执行交易分析
 */
export async function analyzeTrading(
  question: string,
  symbol: string,
  klineData: TimeframeKlineData
): Promise<string> {
  if (!question || question.trim().length === 0) {
    throw new TradingAnalysisError(
      '分析问题不能为空',
      'EMPTY_QUESTION'
    );
  }

  if (!symbol || symbol.trim().length === 0) {
    throw new TradingAnalysisError(
      '交易对符号不能为空',
      'EMPTY_SYMBOL'
    );
  }

  if (!klineData || Object.keys(klineData).length === 0) {
    throw new TradingAnalysisError(
      'K线数据不能为空',
      'EMPTY_KLINE_DATA'
    );
  }

  logger.info('开始AI交易分析', {
    symbol,
    klineTimeframes: Object.keys(klineData).length
  });

  try {
    // 构建分析提示词
    const prompt = await buildAnalysisPrompt(question, symbol, klineData);
    
    // 调用AI进行分析
    const rawResult = await callAnalysisAPI(prompt);
    
    // 处理和格式化结果
    const processedResult = processAnalysisResult(rawResult, symbol);
    
    logger.info('交易分析完成', {
      symbol,
      resultLength: processedResult.length
    });
    
    return processedResult;
    
  } catch (error) {
    logger.error('交易分析失败', {
      symbol,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error; // 重新抛出错误让上层处理
  }
}

/**
 * 流式交易分析 - 支持实时更新回调
 */
export async function analyzeStreamingTrading(
  question: string,
  symbol: string,
  klineData: TimeframeKlineData,
  onUpdate?: (content: string, isComplete: boolean, isNewSegment?: boolean) => Promise<void>
): Promise<string> {
  if (!question || question.trim().length === 0) {
    throw new TradingAnalysisError(
      '分析问题不能为空',
      'EMPTY_QUESTION'
    );
  }

  if (!symbol || symbol.trim().length === 0) {
    throw new TradingAnalysisError(
      '交易对符号不能为空',
      'EMPTY_SYMBOL'
    );
  }

  if (!klineData || Object.keys(klineData).length === 0) {
    throw new TradingAnalysisError(
      'K线数据不能为空',
      'EMPTY_KLINE_DATA'
    );
  }

  logger.info('开始流式AI交易分析', {
    symbol,
    klineTimeframes: Object.keys(klineData).length
  });

  try {
    // 构建分析提示词
    const prompt = await buildAnalysisPrompt(question, symbol, klineData);
    
    // 获取系统提示词配置
    const promptConfig = await promptManager.getConfig();
    
    const messages: AIMessage[] = [
      {
        role: 'system' as const,
        content: promptConfig.systemPrompt
      },
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    // 调用流式API
    const stream = await createStreamingChatCompletion(messages, {
      temperature: 0.8,
      maxTokens: 10000,
      enableThinking: true,
      thinkingBudget: -1
    });

    let fullContent = '';
    let currentSegment = '';
    let segmentCount = 0;

    // 处理流式响应
    for await (const chunk of stream) {
      if (chunk.content && !chunk.finished) {
        fullContent += chunk.content;
        currentSegment += chunk.content;
        
        // 检查是否有完成标记
        if (currentSegment.includes('[SEGMENT_COMPLETE]') || currentSegment.includes('[ANALYSIS_COMPLETE]')) {
          const isAnalysisComplete = currentSegment.includes('[ANALYSIS_COMPLETE]');
          
          // 找到标记的位置
          const segmentCompleteIndex = currentSegment.indexOf('[SEGMENT_COMPLETE]');
          const analysisCompleteIndex = currentSegment.indexOf('[ANALYSIS_COMPLETE]');
          
          let markerIndex = -1;
          if (segmentCompleteIndex !== -1 && analysisCompleteIndex !== -1) {
            markerIndex = Math.min(segmentCompleteIndex, analysisCompleteIndex);
          } else if (segmentCompleteIndex !== -1) {
            markerIndex = segmentCompleteIndex;
          } else if (analysisCompleteIndex !== -1) {
            markerIndex = analysisCompleteIndex;
          }
          
          if (markerIndex !== -1) {
            // 提取标记前的内容作为当前段落
            let currentSegmentContent = currentSegment.substring(0, markerIndex).trim();
            
            if (currentSegmentContent && onUpdate) {
              segmentCount++;
                          // 只发送新完成的段落内容
            const formattedContent = formatSegmentContent(currentSegmentContent, isAnalysisComplete);
              
              logger.info('检测到段落完成', {
                symbol,
                segmentCount,
                isAnalysisComplete,
                segmentLength: currentSegmentContent.length,
                segmentPreview: currentSegmentContent.substring(0, 100) + (currentSegmentContent.length > 100 ? '...' : '')
              });
              
              await onUpdate(formattedContent, isAnalysisComplete, true);
            }
            
            // 重置当前段落，保留标记后的内容作为下一段的开始
            const remainingContent = currentSegment.substring(markerIndex);
            if (isAnalysisComplete) {
              currentSegment = '';
            } else {
              // 移除已处理的标记，保留后续内容
              currentSegment = remainingContent
                .replace('[SEGMENT_COMPLETE]', '')
                .replace('[ANALYSIS_COMPLETE]', '');
            }
            
            if (isAnalysisComplete) {
              break;
            }
          }
        }
      } else if (chunk.finished) {
        break;
      }
    }

    const processedResult = processAnalysisResult(fullContent, symbol);
    
    logger.info('流式交易分析完成', {
      symbol,
      resultLength: processedResult.length,
      fullContentLength: fullContent.length,
      processedResultPreview: processedResult.substring(0, 300) + (processedResult.length > 300 ? '...' : '')
    });
    
    return processedResult;
    
  } catch (error) {
    logger.error('流式交易分析失败', {
      symbol,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}

/**
 * 修复Markdown格式，确保标记完整性
 */
function sanitizeMarkdown(text: string): string {
  let sanitized = text;
  
  // 计算各种Markdown标记的数量
  const boldCount = (sanitized.match(/\*/g) || []).length;
  const codeCount = (sanitized.match(/`/g) || []).length;
  const underlineCount = (sanitized.match(/_/g) || []).length;
  
  // 如果粗体标记数量是奇数，移除最后一个未配对的*
  if (boldCount % 2 !== 0) {
    const lastBoldIndex = sanitized.lastIndexOf('*');
    if (lastBoldIndex !== -1) {
      sanitized = sanitized.substring(0, lastBoldIndex) + sanitized.substring(lastBoldIndex + 1);
    }
  }
  
  // 如果代码标记数量是奇数，移除最后一个未配对的`
  if (codeCount % 2 !== 0) {
    const lastCodeIndex = sanitized.lastIndexOf('`');
    if (lastCodeIndex !== -1) {
      sanitized = sanitized.substring(0, lastCodeIndex) + sanitized.substring(lastCodeIndex + 1);
    }
  }
  
  // 如果下划线标记数量是奇数，移除最后一个未配对的_
  if (underlineCount % 2 !== 0) {
    const lastUnderlineIndex = sanitized.lastIndexOf('_');
    if (lastUnderlineIndex !== -1) {
      sanitized = sanitized.substring(0, lastUnderlineIndex) + sanitized.substring(lastUnderlineIndex + 1);
    }
  }
  
  return sanitized;
}

/**
 * 格式化段落内容
 */
function formatSegmentContent(content: string, isComplete: boolean): string {
  let formattedContent = content;
  
  // 保持AI原始的Markdown格式，只做最小的安全处理
  formattedContent = sanitizeMarkdown(formattedContent);
  
  // 如果是最后一段，添加免责声明
  if (isComplete && !content.includes('免责声明') && !content.includes('仅供参考')) {
    formattedContent += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ *免责声明*：以上分析仅供参考，不构成投资建议，投资有风险，请谨慎决策。';
  }
  
  // 最终安全检查：确保整个消息的Markdown格式正确
  return sanitizeMarkdown(formattedContent);
}