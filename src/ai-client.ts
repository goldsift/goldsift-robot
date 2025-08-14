/**
 * 通用AI客户端模块
 * 支持多种AI提供商：OpenAI、Gemini、Claude等
 */

import { config } from './config.js';
import { logger } from './logger.js';

// 通用AI消息类型
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 通用AI响应类型
export interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  thoughts?: string;
}

// 流式响应块类型
export interface AIStreamChunk {
  content: string;
  finished: boolean;
}

// 从 types.ts 导入 AIProvider 类型
import type { AIProvider } from './types.js';

/**
 * 获取AI提供商类型（从配置中读取）
 */
function getAIProvider(): AIProvider {
  return config.aiProvider;
}

/**
 * 智能URL构建器 - 参考Cherry Studio的处理逻辑
 * @param baseUrl 基础URL
 * @param endpoint 端点路径
 * @returns 完整的API URL
 */
function buildApiUrl(baseUrl: string, endpoint: string): string {
  let processedBaseUrl = baseUrl.trim();
  
  // 处理特殊标记
  if (processedBaseUrl.endsWith('#')) {
    // # 结尾：强制使用输入地址，不做任何修改
    processedBaseUrl = processedBaseUrl.slice(0, -1);
    return `${processedBaseUrl}${endpoint}`;
  }
  
  if (processedBaseUrl.endsWith('/')) {
    // / 结尾：忽略v1版本，直接拼接端点
    processedBaseUrl = processedBaseUrl.slice(0, -1);
    return `${processedBaseUrl}${endpoint}`;
  }
  
  // 默认处理：检查是否已包含版本号
  if (processedBaseUrl.includes('/v1') || processedBaseUrl.includes('/v1beta')) {
    // 已包含版本号，直接拼接
    return `${processedBaseUrl}${endpoint}`;
  }
  
  // 根据AI提供商添加默认版本号
  const provider = getAIProvider();
  switch (provider) {
    case 'openai':
      return `${processedBaseUrl}/v1${endpoint}`;
    case 'gemini':
      return `${processedBaseUrl}/v1beta${endpoint}`;
    default:
      return `${processedBaseUrl}${endpoint}`;
  }
}

/**
 * OpenAI API调用
 */
async function callOpenAI(messages: AIMessage[], options: any): Promise<AIResponse> {
  const apiUrl = buildApiUrl(config.openaiBaseUrl, '/chat/completions');
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: messages,
      temperature: options.temperature || 0.3,
      max_tokens: options.maxTokens || 8000,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('OpenAI API请求失败', {
      url: apiUrl,
      status: response.status,
      error: errorText
    });
    throw new Error(`OpenAI API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // 获取响应文本
  const responseText = await response.text();
  
  // 记录原始响应内容以便调试
  logger.debug('OpenAI API原始响应', {
    url: apiUrl,
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''),
    responseText: responseText // 完整响应内容
  });

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    logger.error('OpenAI API响应解析失败', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      responseText: responseText,
      responseLength: responseText.length,
      contentType: response.headers.get('content-type')
    });
    throw new Error(`AI响应解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage
  };
}

/**
 * Gemini API调用
 */
async function callGemini(messages: AIMessage[], options: any): Promise<AIResponse> {
  // 转换消息格式为Gemini格式
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));

  // 分离系统指令
  const systemInstruction = contents.find(c => c.role === 'system');
  const conversationContents = contents.filter(c => c.role !== 'system');

  const requestBody: any = {
    contents: conversationContents,
    generationConfig: {
      temperature: options.temperature || 0.3,
      maxOutputTokens: options.maxTokens || 8000
    }
  };

  // 添加系统指令
  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: systemInstruction.parts
    };
  }

  // 添加思考配置（如果支持）
  if (config.openaiModel.includes('2.5')) {
    requestBody.generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: options.thinkingBudget || -1
    };
  }

  // 构建Gemini API URL
  const apiUrl = buildApiUrl(config.openaiBaseUrl, `/models/${config.openaiModel}:generateContent?key=${config.openaiApiKey}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Gemini API请求失败', {
      url: apiUrl,
      status: response.status,
      error: errorText
    });
    throw new Error(`Gemini API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // 获取响应文本
  const responseText = await response.text();
  
  // 记录原始响应内容以便调试
  logger.debug('Gemini API原始响应', {
    url: apiUrl,
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''),
    responseText: responseText // 完整响应内容
  });

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    logger.error('Gemini API响应解析失败', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      responseText: responseText,
      responseLength: responseText.length,
      contentType: response.headers.get('content-type')
    });
    throw new Error(`AI响应解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  const candidate = data.candidates?.[0];
  
  if (!candidate) {
    logger.error('Gemini API返回了空的候选结果', {
      responseData: data,
      responseText: responseText
    });
    throw new Error('Gemini API返回了空的候选结果');
  }

  // 处理Gemini的思考模式响应
  const parts = candidate.content?.parts || [];
  let content = '';
  let thoughts = '';
  
  // 分离思考过程和实际结果
  for (const part of parts) {
    if (part.thought) {
      // 这是思考过程
      thoughts += part.text || '';
    } else {
      // 这是实际结果
      content += part.text || '';
    }
  }
  
  // 如果没有明确的结果部分，使用最后一个部分
  if (!content && parts.length > 0) {
    content = parts[parts.length - 1]?.text || '';
  }
  
  return {
    content: content,
    ...(thoughts && { thoughts }),
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0
    }
  };
}

/**
 * OpenAI流式API调用
 */
async function* callOpenAIStream(messages: AIMessage[], options: any): AsyncGenerator<AIStreamChunk> {
  const apiUrl = buildApiUrl(config.openaiBaseUrl, '/chat/completions');
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: messages,
      temperature: options.temperature || 0.3,
      max_tokens: options.maxTokens || 8000,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('OpenAI流式API请求失败', {
      url: apiUrl,
      status: response.status,
      error: errorText
    });
    throw new Error(`OpenAI API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { content: '', finished: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield { content: delta, finished: false };
            }
          } catch (e) {
            // 记录解析错误以便调试
            logger.debug('OpenAI流式响应解析错误', {
              error: e instanceof Error ? e.message : String(e),
              lineData: data,
              lineLength: data.length
            });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Gemini流式API调用
 */
async function* callGeminiStream(messages: AIMessage[], options: any): AsyncGenerator<AIStreamChunk> {
  // 转换消息格式
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));

  const systemInstruction = contents.find(c => c.role === 'system');
  const conversationContents = contents.filter(c => c.role !== 'system');

  const requestBody: any = {
    contents: conversationContents,
    generationConfig: {
      temperature: options.temperature || 0.3,
      maxOutputTokens: options.maxTokens || 8000
    }
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: systemInstruction.parts
    };
  }

  // 构建Gemini流式API URL
  const apiUrl = buildApiUrl(config.openaiBaseUrl, `/models/${config.openaiModel}:streamGenerateContent?alt=sse&key=${config.openaiApiKey}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Gemini流式API请求失败', {
      url: apiUrl,
      status: response.status,
      error: errorText
    });
    throw new Error(`Gemini流式API错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield { content: text, finished: false };
            }
            
            // 检查是否完成
            if (parsed.candidates?.[0]?.finishReason) {
              yield { content: '', finished: true };
              return;
            }
          } catch (e) {
            // 记录解析错误以便调试
            logger.debug('Gemini流式响应解析错误', {
              error: e instanceof Error ? e.message : String(e),
              lineData: data,
              lineLength: data.length
            });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 统一的聊天完成接口
 */
export async function createChatCompletion(
  messages: AIMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    enableThinking?: boolean;
    thinkingBudget?: number;
  }
): Promise<AIResponse> {
  const provider = getAIProvider();
  
  logger.info('调用AI API', {
    provider,
    model: config.openaiModel,
    messageCount: messages.length
  });

  try {
    let result: AIResponse;

    switch (provider) {
      case 'openai':
        result = await callOpenAI(messages, options || {});
        break;
      case 'gemini':
        result = await callGemini(messages, options || {});
        break;
      case 'claude':
        throw new Error('Claude API暂未实现');
      default:
        throw new Error(`不支持的AI提供商: ${provider}`);
    }

    logger.info('AI API调用成功', {
      provider,
      responseLength: result.content.length,
      tokensUsed: result.usage?.total_tokens || 'unknown'
    });

    return result;
  } catch (error) {
    logger.error('AI API调用失败', {
      provider,
      error: error instanceof Error ? error.message : String(error),
      model: config.openaiModel
    });
    throw error;
  }
}

/**
 * 流式聊天完成接口
 */
export async function createStreamingChatCompletion(
  messages: AIMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    enableThinking?: boolean;
    thinkingBudget?: number;
  }
): Promise<AsyncGenerator<AIStreamChunk>> {
  const provider = getAIProvider();
  
  logger.info('调用流式AI API', {
    provider,
    model: config.openaiModel,
    messageCount: messages.length
  });

  try {
    switch (provider) {
      case 'openai':
        return callOpenAIStream(messages, options || {});
      case 'gemini':
        return callGeminiStream(messages, options || {});
      case 'claude':
        throw new Error('Claude流式API暂未实现');
      default:
        throw new Error(`不支持的AI提供商: ${provider}`);
    }
  } catch (error) {
    logger.error('流式AI API调用失败', {
      provider,
      error: error instanceof Error ? error.message : String(error),
      model: config.openaiModel
    });
    throw error;
  }
} 