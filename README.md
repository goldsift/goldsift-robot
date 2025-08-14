# Crypto Trading Analysis Bot

一个基于 Telegram 的加密货币交易对 AI 智能分析机器人后端服务。

## 功能概述

这是一个专门为 Telegram 机器人提供加密货币交易分析能力的后端服务，本质上是一个交易对分析师智能体。

### 核心功能

- **智能意图识别**：自动识别用户是否在询问加密货币交易分析
- **交易对提取**：从用户消息中智能提取交易对符号（如 BTC/USDT）
- **多时间框架分析**：获取 1m、15m、1h、4h、1d、1w 各 100 条 K线数据
- **AI 专业分析**：基于 K线数据提供技术分析和交易建议
- **即时响应**：通过 Telegram 机器人实时返回分析结果

### 技术架构

```
Telegram消息 → AI意图识别+交易对提取 → 币安K线API → AI分析 → 返回结果
```

## 技术栈

- **Runtime**: Node.js + TypeScript
- **Web框架**: Express.js
- **Telegram集成**: node-telegram-bot-api
- **交易所API**: binance-api-node (官方币安SDK)
- **AI服务**: OpenAI兼容API
- **日志**: 文件日志系统

## 项目结构

```
robot/
├── src/
│   ├── bot.ts          # Telegram Bot主逻辑
│   ├── analyzer.ts     # AI意图识别+交易对提取  
│   ├── binance.ts      # 币安K线数据获取
│   ├── ai.ts           # AI交易分析
│   ├── logger.ts       # 简单文件日志
│   └── index.ts        # 应用入口
├── logs/               # 日志文件目录
├── .env               # 环境变量配置
├── package.json
└── Dockerfile         # 单机部署配置
```

## 环境变量配置

创建 `.env` 文件：

```env
# Telegram Bot配置
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# OpenAI兼容API配置
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o  # 可自定义模型
AI_PROVIDER=openai   # AI提供商类型: openai, gemini, claude

# 币安API配置（可选，仅获取K线数据无需API Key）
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

# 服务配置
PORT=3000
```

## 安装和运行

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev
```

### 生产部署

```bash
# 构建项目
npm run build

# 启动生产服务
npm start
```

### Docker部署

```bash
# 构建镜像
docker build -t crypto-bot .

# 运行容器
docker run -d \
  --name crypto-bot \
  --env-file .env \
  -p 3000:3000 \
  crypto-bot
```

## 使用说明

1. 在 Telegram 中添加你的机器人
2. 发送包含交易对的消息，例如：
   - "帮我分析一下 BTC/USDT"
   - "ETHUSDT 现在走势如何？"
   - "分析 SOL 的技术指标"

3. 机器人会自动：
   - 识别这是交易分析请求
   - 提取交易对符号
   - 获取多时间框架K线数据
   - 生成专业分析报告

## 🚀 最新功能

### ✨ 流式AI分析 (v2.0)

现在支持**实时AI分析展示**！您可以看到AI分析的实时过程，无需等待完整结果。

**新特性：**
- 🔄 **实时更新**：AI分析过程中，消息会实时更新显示当前进度
- 🎯 **优化格式**：使用Telegram Markdown格式，提升可读性
- ⚡ **更快响应**：不再需要等待完整分析完成才看到结果
- 📱 **更好体验**：支持消息编辑，减少聊天记录冗余

**使用方法：**
1. 发送交易分析请求（如："分析BTC/USDT"）
2. 机器人会先获取市场数据
3. 开始AI分析时，您会看到实时更新的分析内容
4. 分析过程中会显示"⏳正在分析中..."状态
5. 完成后显示最终的完整分析报告

## 核心特性

- **最小化设计**：无缓存、无队列、直接实时处理
- **专业分析**：基于多时间框架K线数据的技术分析
- **智能识别**：AI驱动的意图识别和交易对提取
- **简单部署**：单机部署，文件日志，零维护成本
- **API兼容**：支持所有OpenAI兼容的AI服务

## 日志系统

日志文件存储在 `logs/` 目录下：
- `error.log` - 错误日志
- `info.log` - 信息日志

## 注意事项

- 币安API有频率限制，建议控制请求频率
- AI分析仅供参考，不构成投资建议
- 确保API密钥安全，不要提交到代码仓库

## License

MIT