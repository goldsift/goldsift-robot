#!/bin/bash

# 清理脚本

echo "🧹 开始清理项目..."

# 清理构建文件
if [ -d "dist" ]; then
    echo "📁 清理 dist 目录..."
    rm -rf dist
fi

# 清理依赖
if [ -d "node_modules" ]; then
    echo "📦 清理 node_modules 目录..."
    rm -rf node_modules
fi

# 清理日志文件（保留目录）
if [ -d "logs" ]; then
    echo "📝 清理日志文件..."
    rm -f logs/*.log
fi

# 清理临时文件
echo "🗑️  清理临时文件..."
find . -name "*.tmp" -type f -delete
find . -name "*.temp" -type f -delete

echo "✅ 项目清理完成"