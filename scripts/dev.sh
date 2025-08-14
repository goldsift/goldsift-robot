#!/bin/bash

# 开发环境启动脚本

echo "🚀 启动开发环境..."

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "⚠️  .env 文件不存在，请复制 .env.example 并配置相关参数"
    exit 1
fi

# 确保日志目录存在
mkdir -p logs

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装项目依赖..."
    npm install
fi

# 启动开发服务（热重载）
echo "🔥 启动热重载开发服务器..."
npx nodemon --exec "node --import tsx" src/index.ts

echo "✅ 开发环境已启动"