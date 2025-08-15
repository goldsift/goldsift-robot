#!/bin/bash

# 构建脚本

echo "🔨 开始构建项目..."


# 清理旧的构建文件
if [ -d "dist" ]; then
    echo "🧹 清理旧的构建文件..."
    rm -rf dist
fi

# TypeScript 类型检查
echo "📝 进行 TypeScript 类型检查..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript 类型检查失败"
    exit 1
fi


# 编译 TypeScript
echo "📦 编译 TypeScript 代码..."
npx tsc
if [ $? -ne 0 ]; then
    echo "❌ TypeScript 编译失败"
    exit 1
fi

echo "✅ 项目构建完成"