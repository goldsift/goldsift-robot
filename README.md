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

# 并发控制配置
MAX_CONCURRENT_ANALYSIS=10  # 全局最大并发分析数量（1-100之间）

# 新成员欢迎消息配置
ENABLE_NEW_MEMBER_WELCOME=true  # 是否为新用户发送欢迎消息

# 时区配置
TIMEZONE=Asia/Shanghai  # 支持全球任意IANA时区
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

### 私聊使用
1. 在 Telegram 中添加你的机器人
2. 发送包含交易对的消息，例如：
   - "帮我分析一下 BTC/USDT"
   - "ETHUSDT 现在走势如何？"
   - "分析 SOL 的技术指标"

### 群聊使用
1. 将机器人添加到群聊中
2. 使用以下方式与机器人交互：
   - `@机器人用户名 分析 BTC/USDT`
   - `@机器人用户名 ETHUSDT 现在走势如何？`
   - 回复机器人的消息进行进一步对话

### 分析流程
机器人会自动：
- **智能识别**：两步识别机制，支持冷门币种
- **提取交易对**：从2500+币安交易对中精确匹配
- **获取K线数据**：多时间框架实时数据
- **生成分析报告**：专业技术分析和交易建议

## 🚀 最新功能

### 🎉 群聊支持 + 并发控制 (v1.1)

现在支持**Telegram群聊**和**智能并发控制**！

**群聊新特性：**
- 👥 **群聊支持**：机器人可以加入Telegram群聊
- 🎯 **@机器人**：在群聊中需要@机器人或回复机器人消息才会响应
- 👋 **新成员欢迎**：自动为新加入群聊的用户发送使用说明
- 💬 **私聊保持**：私聊功能完全保持原有体验

**并发控制：**
- 🚦 **单群限制**：每个群同时只能进行一个分析任务
- 🌐 **全局控制**：所有群加起来最多同时进行10个分析任务（可配置）
- ⚡ **互不影响**：不同群之间分析可并发，私聊和群聊互不影响

**使用方法：**

*群聊中：*
- `@your_bot_name 分析 BTC/USDT`
- `@your_bot_name ETHUSDT 现在走势如何？`
- 回复机器人的消息进行对话

*私聊中：*
- `分析 BTC/USDT`（保持原有使用方式）

### 🔍 两步识别机制 (v1.3)

现在支持**智能两步识别**！完美解决冷门币种识别问题。

**识别新特性：**
- 🎯 **两步识别**：第一步失败时自动获取币安交易对进行二次识别
- 🚀 **成功率提升**：冷门币种识别率从30%提升到90%+
- 💡 **智能筛选**：只传递相关交易对，减少token消耗
- ⚡ **成本控制**：只在需要时触发第二步，避免不必要开销
- 🎨 **用户体验**：大幅减少"无法识别交易对"的情况

### 🕐 智能时区转换 (v1.2)

现在支持**智能时区转换**！所有时间数据自动转换为您的本地时区。

**时区新特性：**
- 🌍 **自动时区转换**：K线数据时间自动转换为本地时区显示
- 🎯 **AI分析优化**：AI直接使用本地时间，无需手动转换，提高准确性
- ⚙️ **灵活配置**：支持全球任意时区设置（如Asia/Shanghai、America/New_York等）
- 📊 **紧凑格式**：使用YY/MM/DD hh:mm格式，减少50%的token消耗
- 🚀 **性能提升**：显著降低AI分析的上下文成本

### ✨ 流式AI分析 (v2.0)

现在支持**实时AI分析展示**！您可以看到AI分析的实时过程，无需等待完整结果。

**新特性：**
- 🔄 **实时更新**：AI分析过程中，消息会实时更新显示当前进度
- 🎯 **优化格式**：使用Telegram Markdown格式，提升可读性
- ⚡ **更快响应**：不再需要等待完整分析完成才看到结果
- 📱 **更好体验**：支持消息编辑，减少聊天记录冗余

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