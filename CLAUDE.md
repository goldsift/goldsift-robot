# 任何项目都务必遵守的规则（极其重要！！！）

## Communication

- 永远使用简体中文进行思考和对话

## Documentation

- 编写 .md 文档时，也要用中文
- 正式文档写到项目的 docs/ 目录下
- 用于讨论和评审的计划、方案等文档，写到项目的 discuss/ 目录下

## Code Architecture

- 编写代码的硬性指标，包括以下原则：
  （1）对于 Python、JavaScript、TypeScript 等动态语言，尽可能确保每个代码文件不要超过 300 行
  （2）对于 Java、Go、Rust 等静态语言，尽可能确保每个代码文件不要超过 400 行
  （3）每层文件夹中的文件，尽可能不超过 8 个。如有超过，需要规划为多层子文件夹
- 除了硬性指标以外，还需要时刻关注优雅的架构设计，避免出现以下可能侵蚀我们代码质量的「坏味道」：
  （1）僵化 (Rigidity): 系统难以变更，任何微小的改动都会引发一连串的连锁修改。
  （2）冗余 (Redundancy): 同样的代码逻辑在多处重复出现，导致维护困难且容易产生不一致。
  （3）循环依赖 (Circular Dependency): 两个或多个模块互相纠缠，形成无法解耦的“死结”，导致难以测试与复用。
  （4）脆弱性 (Fragility): 对代码一处的修改，导致了系统中其他看似无关部分功能的意外损坏。
  （5）晦涩性 (Obscurity): 代码意图不明，结构混乱，导致阅读者难以理解其功能和设计。
  （6）数据泥团 (Data Clump): 多个数据项总是一起出现在不同方法的参数中，暗示着它们应该被组合成一个独立的对象。
  （7）不必要的复杂性 (Needless Complexity): 用“杀牛刀”去解决“杀鸡”的问题，过度设计使系统变得臃肿且难以理解。
- 【非常重要！！】无论是你自己编写代码，还是阅读或审核他人代码时，都要严格遵守上述硬性指标，以及时刻关注优雅的架构设计。
- 【非常重要！！】无论何时，一旦你识别出那些可能侵蚀我们代码质量的「坏味道」，都应当立即询问用户是否需要优化，并给出合理的优化建议。


## Run & Debug

- 必须首先在项目的 scripts/ 目录下，维护好 Run & Debug 需要用到的全部 .sh 脚本
- 对于所有 Run & Debug 操作，一律使用 scripts/ 目录下的 .sh 脚本进行启停。永远不要直接使用 npm、pnpm、uv、python 等等命令
- 如果 .sh 脚本执行失败，无论是 .sh 本身的问题还是其他代码问题，需要先紧急修复。然后仍然坚持用 .sh 脚本进行启停
- Run & Debug 之前，为所有项目配置 Logger with File Output，并统一输出到 logs/ 目录下


## TypeScript / JavaScript
- 严禁使用 commonjs 模块系统
- 尽可能使用 TypeScript。只有在构建工具完全不支持 TypeScript 的时候，才使用 JavaScript（如微信小程序的主工程）
- 数据结构尽可能全部定义成强类型。如果个别场景不得不使用 any 或未经结构化定义的 json，需要先停下来征求用户的同意


# Claude Code 项目配置文档

这是一个基于 Telegram 的加密货币交易分析机器人项目的 Claude Code 配置文档。

## 项目概述

**项目名称**: Crypto Trading Analysis Bot  
**技术栈**: Node.js + TypeScript + Telegram Bot API + Binance API + OpenAI API  
**架构特点**: 最小化设计，单机部署，实时处理

### 核心业务流程
```
Telegram消息 → AI意图识别+交易对提取 → 币安K线API → AI分析 → 返回结果
```

## 项目架构

### 目录结构
```
robot/
├── src/                    # 源代码目录
│   ├── bot.ts             # Telegram Bot主逻辑
│   ├── analyzer.ts        # AI意图识别+交易对提取
│   ├── binance.ts         # 币安K线数据获取
│   ├── ai.ts              # AI交易分析
│   ├── logger.ts          # 文件日志系统
│   ├── types.ts           # TypeScript类型定义
│   └── index.ts           # 应用入口点
├── logs/                   # 日志文件目录
│   ├── error.log          # 错误日志
│   └── info.log           # 信息日志
├── dist/                   # 编译输出目录
├── .env                    # 环境变量配置
├── .env.example           # 环境变量示例
├── package.json           # 项目依赖和脚本
├── tsconfig.json          # TypeScript配置
├── Dockerfile             # Docker部署配置
├── .gitignore             # Git忽略文件
├── README.md              # 项目说明文档
└── CLAUDE.md              # Claude Code配置文档
```

### 核心模块说明

#### bot.ts - Telegram机器人主逻辑
- 处理所有Telegram消息
- 调用意图识别和分析模块
- 错误处理和用户反馈

#### analyzer.ts - AI意图识别
- 使用AI判断是否为交易分析请求
- 从用户消息中提取交易对符号
- 返回结构化的分析结果

#### binance.ts - 数据获取
- 调用币安API获取K线数据
- 支持多时间框架：1m, 15m, 1h, 4h, 1d, 1w
- 每个时间框架获取100条历史数据

#### ai.ts - AI分析引擎
- 基于K线数据进行技术分析
- 生成专业的交易建议
- 支持自定义AI模型

## 开发环境配置

### 环境要求
- Node.js 18+
- npm 或 yarn
- TypeScript 5.0+

### 环境变量配置
创建 `.env` 文件：
```env
# Telegram Bot配置
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# OpenAI兼容API配置
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# 币安API配置（可选）
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

# 服务配置
PORT=3000
NODE_ENV=development
```

### 依赖安装
```bash
# 安装项目依赖
npm install

# 安装开发依赖
npm install --save-dev @types/node typescript ts-node nodemon
```

## 常用命令

### 开发相关
```bash
# 启动开发服务（热重载）
npm run dev

# 编译TypeScript
npm run build

# 启动生产服务
npm start

# 类型检查
npm run type-check

# 代码格式化
npm run format

# 代码检查
npm run lint
```

### 测试相关
```bash
# 运行所有测试
npm test

# 运行测试并监听变化
npm run test:watch

# 测试覆盖率
npm run test:coverage
```

### 部署相关
```bash
# Docker构建
docker build -t crypto-bot .

# Docker运行
docker run -d --name crypto-bot --env-file .env -p 3000:3000 crypto-bot

# 查看日志
docker logs crypto-bot

# 停止容器
docker stop crypto-bot
```

## 代码规范

### TypeScript规范
```typescript
// 使用接口定义数据结构
interface TradingPairAnalysis {
  isTradeAnalysis: boolean;
  tradingPair: string | null;
  confidence: number;
}

// 使用严格的类型检查
const analyzeMessage = async (message: string): Promise<TradingPairAnalysis> => {
  // 实现逻辑
};

// 错误处理
try {
  const result = await analyzeMessage(message);
} catch (error) {
  logger.error('Analysis failed', error);
  throw new Error('Analysis service unavailable');
}
```

### 文件命名规范
- 使用 kebab-case：`trading-analyzer.ts`
- 接口文件：`types.ts` 或 `interfaces.ts`
- 常量文件：`constants.ts`
- 工具函数：`utils.ts`

### 函数命名规范
```typescript
// 使用动词开头的驼峰命名
async function parseMessage(message: string) { }
async function getKlineData(symbol: string) { }
async function analyzeTrading(question: string, data: any) { }

// 布尔值返回的函数使用 is/has/can 前缀
function isValidTradingPair(symbol: string): boolean { }
function hasEnoughData(klines: any[]): boolean { }
```

### 错误处理规范
```typescript
// 统一的错误处理方式
class TradingAnalysisError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TradingAnalysisError';
  }
}

// 在函数中使用
if (!isValidSymbol) {
  throw new TradingAnalysisError('Invalid trading pair', 'INVALID_SYMBOL');
}
```

## 环境配置

### 开发环境设置
```json
// package.json scripts 配置
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

### TypeScript配置
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 调试和日志

### 日志系统
```typescript
// logger.ts 使用示例
import { logger } from './logger';

// 不同级别的日志
logger.info('Bot started successfully');
logger.warn('Rate limit approaching');
logger.error('API call failed', { error, symbol });
logger.debug('Processing message', { userId, message });
```

### 调试配置
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Bot",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## 性能优化建议

### API调用优化
- 币安API有频率限制，建议实现简单的请求间隔控制
- OpenAI API调用要处理超时和重试
- 考虑对相同交易对短时间内的重复请求进行简单去重

### 内存使用优化
- K线数据处理完后及时释放
- 避免在全局变量中缓存大量数据
- 定期清理过期的日志文件

## 部署注意事项

### 生产环境配置
```bash
# 设置生产环境变量
export NODE_ENV=production

# 使用PM2管理进程
npm install -g pm2
pm2 start dist/index.js --name crypto-bot

# 查看进程状态
pm2 status

# 查看日志
pm2 logs crypto-bot
```

### 安全注意事项
- 永远不要将 `.env` 文件提交到代码仓库
- 定期轮换API密钥
- 使用HTTPS和安全的Webhook URL
- 限制机器人的访问权限

## 故障排除

### 常见问题
1. **Bot无响应**: 检查 TELEGRAM_BOT_TOKEN 是否正确
2. **K线数据获取失败**: 检查网络连接和币安API状态
3. **AI分析失败**: 检查 OpenAI API密钥和额度
4. **交易对识别错误**: 检查AI模型响应格式

### 日志查看
```bash
# 查看错误日志
tail -f logs/error.log

# 查看所有日志
tail -f logs/info.log

# 搜索特定错误
grep "API_ERROR" logs/error.log
```

## 扩展开发

### 添加新的交易所支持
1. 在 `src/exchanges/` 目录下创建新的交易所模块
2. 实现统一的K线数据接口
3. 在 `analyzer.ts` 中添加交易所选择逻辑

### 添加新的分析功能
1. 在 `ai.ts` 中扩展分析提示词
2. 考虑添加技术指标计算
3. 支持图表生成功能

---

**最后更新**: 2025-01-13  
**维护者**: Crypto Bot Team