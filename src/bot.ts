/**
 * Telegram Bot 主逻辑模块
 * 严格遵守 300 行以内规范
 */

import { createRequire } from 'node:module';

// 使用 createRequire 加载 CommonJS 模块
const require = createRequire(import.meta.url);
const TelegramBot = require('node-telegram-bot-api');
import { config } from './config.js';
import { logger } from './logger.js';
import { analyzeMessage } from './analyzer.js';
import { getKlineData } from './binance.js';
import { analyzeStreamingTrading } from './ai.js';
import { TradingAnalysisError, TelegramMessage } from './types.js';
import { concurrencyManager } from './concurrency.js';

// Telegram Bot 实例（延迟初始化）
let bot: any = null;

// 机器人信息缓存
let botInfo: any = null;

/**
 * 发送安全的消息（处理长消息）
 */
async function sendSafeMessage(chatId: number, text: string, options?: any): Promise<TelegramMessage> {
  const MAX_LENGTH = 4000; // Telegram 消息长度限制
  
  // 默认使用Markdown格式
  const messageOptions = {
    parse_mode: 'Markdown',
    ...options
  };
  
  if (text.length <= MAX_LENGTH) {
    logger.debug('发送消息', {
      chatId,
      messageLength: text.length,
      messagePreview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
    });
    return await bot.sendMessage(chatId, text, messageOptions);
  }

  // 分割长消息
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    chunks.push(text.slice(i, i + MAX_LENGTH));
  }

  logger.debug('发送长消息', {
    chatId,
    totalLength: text.length,
    chunksCount: chunks.length
  });

  let lastMessage: TelegramMessage;
  for (const chunk of chunks) {
    lastMessage = await bot.sendMessage(chatId, chunk, messageOptions);
    // 短暂延迟避免频率限制
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return lastMessage!;
}

/**
 * 安全地编辑消息（处理Markdown格式错误）
 */
async function editSafeMessage(
  chatId: number, 
  messageId: number, 
  text: string, 
  options?: any
): Promise<TelegramMessage | null> {
  const MAX_LENGTH = 4000; // Telegram 消息长度限制
  
  // 如果消息太长，截断处理
  let finalText = text;
  if (text.length > MAX_LENGTH) {
    finalText = text.slice(0, MAX_LENGTH - 100) + '\n\n...(内容过长，已截断)';
  }
  
  // 默认使用Markdown格式
  const messageOptions = {
    parse_mode: 'Markdown',
    ...options
  };
  
  try {
    // 首先尝试使用Markdown格式
    logger.debug('尝试编辑消息', {
      chatId,
      messageId,
      contentLength: finalText.length,
      contentPreview: finalText.substring(0, 200) + (finalText.length > 200 ? '...' : '')
    });
    return await bot.editMessageText(finalText, {
      chat_id: chatId,
      message_id: messageId,
      ...messageOptions
    });
  } catch (error: any) {
    logger.debug('Markdown格式编辑失败，尝试纯文本', {
      chatId,
      messageId,
      error: error.message
    });
    
    try {
      // 如果Markdown失败，移除所有格式标记后重试
      const plainText = finalText
        .replace(/\*\*(.*?)\*\*/g, '$1')  // 移除粗体
        .replace(/\*(.*?)\*/g, '$1')      // 移除斜体
        .replace(/`(.*?)`/g, '$1')        // 移除代码块
        .replace(/_(.*?)_/g, '$1');       // 移除下划线
      
      return await bot.editMessageText(plainText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: undefined  // 使用纯文本模式
      });
    } catch (secondError: any) {
      logger.debug('消息编辑失败', {
        chatId,
        messageId,
        error: secondError.message
      });
      return null;
    }
  }
}

/**
 * 发送欢迎消息
 */
async function sendWelcomeMessage(chatId: number): Promise<void> {
  const welcomeText = `🤖 *欢迎使用加密货币交易分析机器人！*

我可以帮助您分析各种加密货币交易对。

📝 *使用示例：*
• "分析一下 BTC/USDT"
• "ETHUSDT 现在走势如何？"
• "帮我看看 SOL 的技术指标"

⚡ *我会自动：*
• 识别您的分析需求
• 获取实时K线数据
• 提供专业技术分析
• 给出交易建议

💡 支持所有币安交易对，开始提问吧！

✨ *新功能*：现在支持实时分析展示，您可以看到AI分析的实时过程！`;

  await sendSafeMessage(chatId, welcomeText);
}

/**
 * 检查消息是否是对机器人的回复或@提及
 */
function isMessageForBot(msg: TelegramMessage): boolean {
  const text = msg.text || '';
  const chatType = msg.chat.type;
  const chatId = msg.chat.id;
  
  logger.info('检查消息是否给机器人', {
    chatId,
    chatType,
    textPreview: text.substring(0, 100),
    botInfoExists: !!botInfo,
    botUsername: botInfo?.username,
    botId: botInfo?.id,
    hasReplyToMessage: !!msg.reply_to_message,
    replyToMessageFromId: msg.reply_to_message?.from?.id
  });
  
  // 私聊消息总是处理
  if (chatType === 'private') {
    logger.info('私聊消息，直接处理', { chatId });
    return true;
  }
  
  // 群聊消息需要检查是否@了机器人
  if (chatType === 'group' || chatType === 'supergroup') {
    // 检查botInfo是否正确获取
    if (!botInfo || !botInfo.username) {
      logger.error('botInfo未正确获取', {
        chatId,
        botInfo: botInfo ? { id: botInfo.id, username: botInfo.username } : null
      });
      return false;
    }
    
    // 检查是否@了机器人（使用用户名）
    const botMention = `@${botInfo.username}`;
    if (text.includes(botMention)) {
      logger.info('检测到@机器人', {
        chatId,
        botMention,
        textContainsMention: true
      });
      return true;
    }
    
    // 检查是否是回复机器人的消息
    if (msg.reply_to_message && msg.reply_to_message.from) {
      const isReplyToBot = msg.reply_to_message.from.id === botInfo.id;
      logger.info('检查回复消息', {
        chatId,
        replyToMessageFromId: msg.reply_to_message.from.id,
        botId: botInfo.id,
        isReplyToBot
      });
      return isReplyToBot;
    }
    
    logger.info('群聊消息未@机器人且非回复', {
      chatId,
      botMention,
      textIncludes: text.includes(botMention),
      hasReply: !!msg.reply_to_message
    });
    return false;
  }
  
  logger.info('未知聊天类型', { chatId, chatType });
  return false;
}

/**
 * 清理消息文本（移除@机器人的部分）
 */
function cleanMessageText(text: string): string {
  if (!botInfo || !botInfo.username) {
    return text;
  }
  
  const botMention = `@${botInfo.username}`;
  return text.replace(new RegExp(botMention, 'gi'), '').trim();
}

/**
 * 处理分析错误
 */
async function handleAnalysisError(
  chatId: number, 
  error: unknown, 
  context: string
): Promise<void> {
  let errorMessage = '❌ 分析过程中发生错误，请稍后重试。';

  if (error instanceof TradingAnalysisError) {
    switch (error.code) {
      case 'INVALID_SYMBOL':
        errorMessage = '❌ 无效的交易对符号，请检查拼写是否正确。';
        break;
      case 'RATE_LIMIT':
        errorMessage = '⏰ 请求过于频繁，请稍等片刻再试。';
        break;
      case 'CONCURRENCY_LIMIT':
        errorMessage = '🚦 当前正在分析，请稍后再试。';
        break;
      case 'OPENAI_ERROR_401':
        errorMessage = '❌ AI服务认证失败，请联系管理员。';
        break;
      case 'BINANCE_API_ERROR':
        errorMessage = '❌ 获取市场数据失败，请稍后重试。';
        break;
      default:
        errorMessage = `❌ ${error.message}`;
    }
  }

  logger.error(`${context}处理失败`, {
    chatId,
    error: error instanceof Error ? error.message : String(error)
  });

  await sendSafeMessage(chatId, errorMessage);
}

/**
 * 处理文本消息 - 支持流式分析
 */
async function handleTextMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const originalText = msg.text;

  if (!originalText) {
    await sendSafeMessage(chatId, '❌ 请发送文本消息。');
    return;
  }
  
  // 检查消息是否是给机器人的
  if (!isMessageForBot(msg)) {
    logger.debug('忽略非机器人消息', {
      chatId,
      chatType: msg.chat.type,
      text: originalText.substring(0, 100)
    });
    return;
  }
  
  // 清理消息文本
  const messageText = cleanMessageText(originalText);
  
  if (!messageText.trim()) {
    await sendSafeMessage(chatId, '❌ 请发送有效的文本消息。');
    return;
  }

  logger.info('收到用户消息', {
    chatId,
    chatType: msg.chat.type,
    userId: msg.from?.id,
    username: msg.from?.username,
    messageLength: messageText.length,
    isGroupMessage: msg.chat.type !== 'private'
  });

  // 检查并发限制
  if (!concurrencyManager.canStartAnalysis(chatId)) {
    const status = concurrencyManager.getStatus();
    logger.warn('分析请求被拒绝 - 并发限制', {
      chatId,
      globalCount: status.globalCount,
      maxConcurrent: status.maxConcurrent,
      isGroupBusy: concurrencyManager.groupAnalysis.get(chatId) === true
    });
    
    await handleAnalysisError(chatId, new TradingAnalysisError(
      '当前分析请求过多，请稍后再试',
      'CONCURRENCY_LIMIT'
    ), '并发控制');
    return;
  }
  
  // 开始分析（增加并发计数）
  concurrencyManager.startAnalysis(chatId);
  
  try {
    // 发送处理中消息
    await bot.sendChatAction(chatId, 'typing');

    // 1. AI意图识别和交易对提取
    const parseResult = await analyzeMessage(messageText);

    if (!parseResult.isTradeAnalysis) {
      await sendSafeMessage(
        chatId,
        '💡 我是加密货币交易分析专家。请发送包含交易对的分析请求，例如：\n\n• "分析BTC/USDT"\n• "ETHUSDT走势如何？"\n• "帮我看看SOL的技术指标"'
      );
      return;
    }

    if (!parseResult.tradingPair) {
      await sendSafeMessage(
        chatId,
        '❓ 未能识别到具体的交易对，请明确指定要分析的币种，例如："分析BTC/USDT"'
      );
      return;
    }

    // 发送数据获取中消息
    await bot.sendChatAction(chatId, 'typing');
    let statusMessage: TelegramMessage | null = await sendSafeMessage(chatId, `📊 正在获取 *${parseResult.tradingPair}* 的市场数据...`);

    // 2. 获取K线数据
    const klineData = await getKlineData(parseResult.tradingPair);

    // 更新状态消息
    if (statusMessage) {
      await editSafeMessage(chatId, statusMessage.message_id, `🤖 AI正在分析，请稍候...\n\n_实时分析中，内容将动态更新_ ⏳`);
    }

    // 3. 流式AI分析
    let fullContent = '';
    
    await analyzeStreamingTrading(
      messageText,
      parseResult.tradingPair,
      klineData,
      async (content: string, isComplete: boolean, isNewSegment?: boolean) => {
        try {
          if (isNewSegment) {
            // 新段落，发送新消息
            fullContent = content; // 记录当前段落内容
            await sendSafeMessage(chatId, content);
            
            // 如果这是第一个段落，删除状态消息
            if (statusMessage) {
              try {
                const msgId = statusMessage.message_id;
                await bot.deleteMessage(chatId, msgId);
              } catch (e) {
                // 删除失败不影响主流程
              }
              statusMessage = null; // 避免重复删除
            }
          }
          
          // 保持typing状态
          if (!isComplete) {
            await bot.sendChatAction(chatId, 'typing');
          }
        } catch (error) {
          logger.error('流式更新消息失败', {
            chatId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );

    logger.info('流式分析完成', {
      chatId,
      tradingPair: parseResult.tradingPair,
      resultLength: fullContent.length
    });

  } catch (error) {
    await handleAnalysisError(chatId, error, '消息');
  } finally {
    // 完成分析（减少并发计数）
    concurrencyManager.finishAnalysis(chatId);
  }
}

/**
 * 初始化 Bot 事件监听
 */
function initializeBotHandlers(): void {
  // 处理 /start 命令
  bot.onText(/\/start/, async (msg: TelegramMessage) => {
    logger.info('用户启动Bot', {
      chatId: msg.chat.id,
      userId: msg.from?.id,
      username: msg.from?.username
    });
    await sendWelcomeMessage(msg.chat.id);
  });

  // 处理所有文本消息
  bot.on('message', async (msg: TelegramMessage) => {
    logger.info('接收到消息', {
      chatId: msg.chat.id,
      chatType: msg.chat.type,
      messageId: msg.message_id,
      fromUserId: msg.from?.id,
      fromUsername: msg.from?.username,
      text: msg.text?.substring(0, 200),
      isCommand: msg.text?.startsWith('/'),
      hasText: !!msg.text
    });
    
    // 忽略命令消息，已经在 onText 中处理
    if (msg.text?.startsWith('/')) {
      logger.info('忽略命令消息', { chatId: msg.chat.id, text: msg.text });
      return;
    }
    
    // 只处理文本消息
    if (msg.text) {
      await handleTextMessage(msg);
    } else {
      logger.info('忽略非文本消息', {
        chatId: msg.chat.id,
        messageType: typeof msg.text
      });
    }
  });
  
  // 处理新成员加入群聊事件
  bot.on('new_chat_members', async (msg: TelegramMessage) => {
    logger.info('检测到新成员加入', {
      chatId: msg.chat.id,
      chatTitle: msg.chat.title,
      newMembersCount: msg.new_chat_members?.length || 0
    });
    
    if (msg.new_chat_members) {
      // 检查是否是机器人自己加入群聊
      const botJoined = msg.new_chat_members.some((member: any) => 
        member.id === botInfo?.id
      );
      
      if (botJoined) {
        logger.info('机器人加入新群', {
          chatId: msg.chat.id,
          chatTitle: msg.chat.title,
          chatType: msg.chat.type
        });
        
        const groupWelcomeText = `🤖 *感谢邀请我加入群聊！*

我是加密货币交易分析机器人，可以帮助分析各种交易对。

📝 *在群聊中使用方法：*
• @我 分析 BTC/USDT
• @我 ETHUSDT 现在走势如何？
• 回复我的消息进行对话

⚡ *并发控制：*
• 每个群同时只能进行一个分析
• 全局最多支持 ${config.maxConcurrentAnalysis} 个并发分析
• 私聊和群聊分析互不影响

💡 支持所有币安交易对，@我开始分析吧！`;
        
        // 使用纯文本模式发送欢迎消息，避免Markdown解析错误
        await sendSafeMessage(msg.chat.id, groupWelcomeText, { parse_mode: undefined });
      } else if (config.enableNewMemberWelcome) {
        // 普通用户加入群聊（仅在启用欢迎消息时）
        const newMembers = msg.new_chat_members.filter((member: any) => 
          !member.is_bot && member.id !== botInfo?.id
        );
        
        if (newMembers.length > 0) {
          logger.info('普通用户加入群聊', {
            chatId: msg.chat.id,
            newMembersCount: newMembers.length,
            usernames: newMembers.map((m: any) => m.username || m.first_name)
          });
          
          // 为新成员生成欢迎消息
          const memberNames = newMembers.map((member: any) => {
            if (member.username) {
              return `@${member.username}`;
            } else {
              return member.first_name || '新朋友';
            }
          }).join(' ');
          
          const newMemberWelcomeText = `🎉 *欢迎 ${memberNames} 加入群聊！*

我是群里的加密货币交易分析机器人 🤖，可以为大家提供专业的交易分析服务。

📊 *如何使用我：*
• @我 分析 BTC/USDT
• @我 ETHUSDT 走势如何？
• @我 帮我看看 SOL 的技术指标
• 回复我的任何消息进行进一步对话

⚡ *使用规则：*
• 每个群同时只能进行一个分析（避免刷屏）
• 支持所有币安交易对
• 提供多时间框架技术分析
• 实时流式分析展示

💡 *使用提示：*
直接@我并说出你想分析的交易对即可，我会自动识别并提供专业分析！

🚀 开始体验吧，@我试试看！`;
          
          // 使用纯文本模式发送欢迎消息，避免Markdown解析错误
          await sendSafeMessage(msg.chat.id, newMemberWelcomeText, { parse_mode: undefined });
        }
      }
    }
  });

  // 错误处理
  bot.on('error', (error: Error) => {
    logger.error('Bot错误', { error: error.message });
  });

  // 轮询错误处理
  bot.on('polling_error', (error: Error) => {
    logger.error('轮询错误', { error: error.message });
  });
}

/**
 * 启动 Telegram Bot
 */
export async function startBot(): Promise<void> {
  try {
    // 初始化 Telegram Bot 实例
    if (!bot) {
      bot = new TelegramBot(config.telegramBotToken, { polling: true });
    }
    
    logger.info('初始化Telegram Bot', {
      botToken: config.telegramBotToken.slice(-10), // 只显示后10位
      polling: true
    });

    // 初始化事件处理器
    initializeBotHandlers();

    // 获取Bot信息并缓存
    botInfo = await bot.getMe();
    logger.info('Bot启动成功', {
      botId: botInfo.id,
      botUsername: botInfo.username,
      botName: botInfo.first_name,
      botCanJoinGroups: botInfo.can_join_groups,
      botCanReadAllGroupMessages: botInfo.can_read_all_group_messages,
      maxConcurrentAnalysis: config.maxConcurrentAnalysis
    });
    
    // 输出重要的使用信息
    logger.info('机器人配置信息', {
      username: botInfo.username,
      groupChatSupport: botInfo.can_join_groups,
      readAllMessages: botInfo.can_read_all_group_messages,
      mentionFormat: `@${botInfo.username}`
    });

  } catch (error) {
    logger.error('Bot启动失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * 停止 Telegram Bot
 */
export async function stopBot(): Promise<void> {
  try {
    if (bot) {
      await bot.stopPolling();
      bot = null;
    }
    logger.info('Bot已停止');
  } catch (error) {
    logger.error('Bot停止失败', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}