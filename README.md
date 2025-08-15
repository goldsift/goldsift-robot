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
- **Web框架**: 原生HTTP服务器
- **数据库**: SQLite (better-sqlite3)
- **Telegram集成**: node-telegram-bot-api
- **交易所API**: Binance REST API
- **AI服务**: OpenAI兼容API
- **配置管理**: Web管理界面 + SQLite存储
- **日志**: 文件日志系统

## 项目结构

```
robot/
├── src/
│   ├── config/
│   │   ├── database-manager.ts      # SQLite数据库管理
│   │   ├── prompt-manager-sqlite.ts # 基于SQLite的提示词管理
│   │   └── default-prompts.json     # 默认提示词配置
│   ├── routes/
│   │   └── config-routes.ts         # 配置管理API路由
│   ├── web/
│   │   └── admin.html              # Web管理界面
│   ├── bot.ts                      # Telegram Bot主逻辑
│   ├── analyzer.ts                 # AI意图识别+交易对提取  
│   ├── binance.ts                  # 币安K线数据获取
│   ├── ai.ts                       # AI交易分析
│   ├── logger.ts                   # 简单文件日志
│   └── index.ts                    # 应用入口
├── data/                           # SQLite数据库文件目录
├── logs/                           # 日志文件目录
├── config/                         # 运行时配置文件目录
├── .env                           # 环境变量配置
├── package.json
└── Dockerfile                     # 单机部署配置
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

# Web管理界面配置
ADMIN_PASSWORD=your_admin_password  # 可选，管理界面访问密码
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

#### 方式一：使用 Docker Compose（推荐）

```bash
# 复制环境变量文件
cp .env.example .env
# 编辑 .env 文件，配置必要的环境变量

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

#### 方式二：直接使用 Docker

```bash
# 构建镜像
docker build -t crypto-bot .

# 运行容器
docker run -d \
  --name crypto-bot \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  crypto-bot

# 查看日志
docker logs -f crypto-bot

# 停止容器
docker stop crypto-bot && docker rm crypto-bot
```

#### Docker 特性

- **基于 Node.js v18.20.4**: 使用官方 Alpine 镜像，体积小巧
- **健康检查**: 内置健康检查端点 `/health`
- **优雅关闭**: 支持 SIGTERM 信号处理
- **日志持久化**: 日志文件挂载到宿主机
- **非 root 用户**: 容器内使用非特权用户运行

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

### 🛠️ AI机器人配置管理 (v3.0)

现在支持**双配置管理系统**！通过Web界面管理AI提示词和基础运行配置。

#### 🎯 核心特性
- **双配置管理**: 提示词配置 + 基础运行配置分离管理
- **数据库存储**: 使用SQLite数据库存储所有配置，支持版本控制
- **Web管理界面**: 直观的双标签页管理界面
- **开箱即用**: 最小化环境变量依赖，大部分配置通过Web界面管理
- **热更新**: 提示词配置修改后立即生效，基础配置重启后生效

#### 📝 提示词配置管理
- **版本控制**: 每次修改提示词都会创建新版本，支持版本间切换
- **单表设计**: 使用SQLite数据库单表存储，通过`enabled`标记控制当前使用版本
- **变量提示**: 界面显示可用的上下文变量，便于编写模板

**管理界面功能:**
- 💾 **保存为新版本并使用**: 创建新版本并自动设为当前使用
- 🔄 **使用当前版本**: 重新加载当前版本到编辑器
- 💾 **保存当前版本**: 更新当前版本（不创建新版本）
- 🗑️ **删除当前版本**: 删除当前版本并自动切换到其他版本
- **版本切换**: 通过下拉菜单快速切换到历史版本

**可用变量:**
- `{question}` - 用户的问题或分析需求
- `{symbol}` - 交易对符号
- `{timezone}` - 当前配置的时区
- `{currentTime}` - 当前分析时间
- `{klineData}` - 完整的多时间框架K线数据JSON

#### ⚙️ 基础配置管理
管理机器人的核心运行参数：
- **Telegram Bot Token**: 机器人令牌
- **OpenAI API配置**: API密钥、服务器地址、模型名称、提供商类型
- **时区设置**: 全局时区配置
- **币安API配置**: 可选的币安API密钥（用于获取K线数据）
- **并发控制**: 最大并发分析数量
- **功能开关**: 新成员欢迎消息等

#### 🌐 API端点

**提示词配置API:**
- `GET /api/config/prompts` - 获取当前提示词配置
- `POST /api/config/prompts/save-new` - 保存为新版本
- `POST /api/config/prompts/update-current` - 更新当前版本
- `POST /api/config/prompts/switch/{id}` - 切换到指定版本
- `DELETE /api/config/prompts/delete-current` - 删除当前版本
- `GET /api/config/prompts/versions` - 获取所有版本列表

**基础配置API:**
- `GET /api/basic-config` - 获取基础配置
- `POST /api/basic-config` - 保存基础配置
- `POST /api/basic-config/test` - 测试配置连接

#### 🔐 访问控制
管理界面和API使用Basic Auth认证：
- 用户名: `admin`
- 密码: 环境变量`ADMIN_PASSWORD`（默认: `admin123`）

### 🚀 **部署流程**

#### 1. **开箱即用部署**
```bash
# 克隆项目
git clone <repo-url>
cd robot

# 安装依赖
npm install

# 启动服务（无需预先配置）
npm start
```

#### 2. **首次配置**
服务启动后会显示：
```
⚠️ 配置不完整，仅启动管理界面
📋 缺少必要配置项：
  1. Telegram Bot Token - 从 @BotFather 获取
  2. OpenAI API Key - OpenAI或兼容API的密钥
  3. 配置完成后点击重启服务按钮
```

#### 3. **完成配置**
1. 访问 `http://localhost:3000/admin`
2. 点击"基础配置管理"标签页
3. 填写必要配置：
   - **Telegram Bot Token**: 从 @BotFather 获取
   - **OpenAI API Key**: 您的API密钥
   - **其他可选配置**: 时区、币安API等
4. 点击"💾 保存基础配置"
5. 点击"🚀 重新启动服务"

#### 4. **验证部署**
配置完成后，服务将显示：
```
✅ 应用程序完全启动成功
🤖 Telegram Bot 启动成功
```

### 💡 **智能启动特性**
- **配置检查**: 自动检测必要配置是否完整
- **优雅降级**: 配置不完整时仅启动管理界面
- **热重载**: 配置完成后可通过管理界面重新启动服务
- **零依赖**: 无需预先配置.env文件

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