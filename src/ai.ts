/**
 * AI 交易分析模块
 * 严格遵守 300 行以内规范
 */

import { config } from './config.js';
import { logger } from './logger.js';
import type { TimeframeKlineData } from './types.js';
import { TradingAnalysisError } from './types.js';
import { createChatCompletion, createStreamingChatCompletion, type AIMessage } from './ai-client.js';

/**
 * 构建交易分析提示词
 */
function buildAnalysisPrompt(
  question: string,
  symbol: string,
  klineData: TimeframeKlineData
): string {
  // 构建完整的K线数据，保留所有必要信息供技术分析
  const fullKlineData = Object.entries(klineData).map(([timeframe, data]) => {
    // 保留完整的K线数据，但格式化为更紧凑的形式
    const formattedData = data.map((kline: any) => ({
      closeTime: new Date(kline.closeTime).toISOString(),
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
      openTime: new Date(kline.openTime).toISOString()
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

  return `你是一位资深的加密货币交易分析师，拥有10年以上的金融市场经验。你精通各种主流金融分析和操盘理论，包括但不限于：
- **缠论**: 走势分解、笔段分析、背驰判断、买卖点识别
- **威科夫方法**: 供需关系分析、积累分发理论、春测/冰山测试
- **江恩理论**: 时间周期、价格几何、支撑阻力
- **道氏理论**: 趋势确认、主要次要趋势识别
- **波浪理论**: 推动浪调整浪、斐波那契回撤扩展
- **传统技术分析**: K线形态、均线系统、量价关系、RSI/MACD等指标

**当前分析时间**: ${new Date().toISOString()} (UTC时间，请在分析中转换为${config.timezone}时区显示，格式为：YY-MM-DD HH:mm)

请基于提供的多时间框架完整K线数据，对 ${symbol} 进行专业分析。目的是回答用户问题:** ${question} **

完整K线数据（包含15分钟到月线的不同时间框架的K线，每个时间框架最多包含最近100条K线，因为K线总量有限，所以不一定能包含该交易对的完整价格走向，特别是时间间隔小的K线，需要注意）:
${JSON.stringify(fullKlineData, null, 2)}

**重要提示**：
- 每个时间框架都提供了完整的K线序列，请充分利用这些数据进行技术分析
- **时间显示要求**：所有K线数据的时间均为UTC格式，在分析中引用具体时间时，请转换为${config.timezone}时区并以"YY-MM-DD HH:mm"格式显示，例如"25-08-14 10:30"
- **时间概念很重要**：K线数据包含具体的开盘和收盘时间，请根据时间距离当前的远近来判断：
  * **近期/短期**: 15分钟图几小时内，1小时图1-2天内，4小时图1周内
  * **中期**: 日线图1-3个月，周线图3-6个月
  * **长期**: 周线图6个月以上，月线图1年以上
- 分析时请明确区分时间概念，例如"周线20周前的高点"应称为"长期高点"而不是"近期高点"
- 可以观察K线形态、趋势线、支撑阻力位、成交量配合等
- 对于缠论分析，可以识别笔、段、中枢等结构
- 对于威科夫分析，可以观察积累、分发、春测等阶段
- 请结合多个时间框架进行综合判断



**重要：请按以下格式分段输出分析，每完成一段后添加标记，可以对回复段落进行裁剪和增加，关键是要回答用户的问题**

1. **市场概况与趋势分析**（150-200字，包含当前价格、主要趋势方向）
[SEGMENT_COMPLETE]

2. **技术指标分析**（150-200字，包含关键技术指标状态）
[SEGMENT_COMPLETE]

3. **关键价位识别**（100-150字，包含支撑位、阻力位、关键拐点）
[SEGMENT_COMPLETE]

4. **操作建议**（100-150字，包含具体的进场、出场、止损建议）
[SEGMENT_COMPLETE]

5. **风险提示与总结**（80-120字，包含风险评估和最终结论）
[ANALYSIS_COMPLETE]

**要求：**
- 回复不需要告诉客户你是什么人，直接给分析结果即可
- 关注用户的问题，回答简洁明了，避免冗长描述
- 必须包含具体的价格数据和K线开盘时间或者收盘时间引用
- **时间引用格式**：引用具体K线时间时，必须转换为${config.timezone}时区，格式为"YY-MM-DD HH:mm"，如"25-08-14 10:30"
- 严格按照上述格式输出，包含所有标记
- 可以运用不同的markdown样式对结果进行美化，关键文字可以使用不同颜色进行标记，可以适当增加一些小图标
`;
}

/**
 * 调用 AI API 进行交易分析
 */
async function callAnalysisAPI(prompt: string): Promise<string> {
  try {
    const messages: AIMessage[] = [
      {
        role: 'system' as const,
        content: '你是一位资深的加密货币交易分析师，拥有10年以上金融市场经验，精通缠论、威科夫、江恩、道氏、波浪等各种主流技术分析理论。你善于根据用户的具体需求，灵活运用相应的分析理论，提供专业、准确、实用的市场分析和交易建议。'
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
    const prompt = buildAnalysisPrompt(question, symbol, klineData);
    
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
    const prompt = buildAnalysisPrompt(question, symbol, klineData);
    
    const messages: AIMessage[] = [
      {
        role: 'system' as const,
        content: '你是一位资深的加密货币交易分析师，拥有10年以上金融市场经验，精通缠论、威科夫、江恩、道氏、波浪等各种主流技术分析理论。你善于根据用户的具体需求，灵活运用相应的分析理论，提供专业、准确、实用的市场分析和交易建议。'
      },
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    // 调用流式API
    const stream = await createStreamingChatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 8000,
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