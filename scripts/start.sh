#!/bin/bash

# 生产环境启动脚本

echo "🚀 启动生产环境..."

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "⚠️  .env 文件不存在，请复制 .env.example 并配置相关参数"
    exit 1
fi

# 确保日志目录存在
mkdir -p logs

# 每次都要构建文件
echo "📦 开始构建..."
./scripts/build.sh


# 启动生产服务
echo "🔥 启动生产服务器..."
NODE_ENV=production node dist/index.js

echo "✅ 生产环境已启动"