#!/bin/bash

# 安装AI API相关依赖脚本
# 用于支持统一的AI API调用

echo "🚀 安装AI API相关依赖..."

# 安装OpenAI官方库
echo "📦 安装OpenAI官方库..."
npm install openai

# 检查安装状态
if [ $? -eq 0 ]; then
    echo "✅ OpenAI库安装成功"
else
    echo "❌ OpenAI库安装失败"
    exit 1
fi

# 更新类型定义
echo "🔧 更新TypeScript类型定义..."
npm install --save-dev @types/node

echo "🎉 所有依赖安装完成！"
echo ""
echo "现在你可以通过配置环境变量来使用不同的AI提供商："
echo "- OPENAI_BASE_URL: AI API的基础URL"
echo "- OPENAI_API_KEY: AI API的密钥"
echo "- OPENAI_MODEL: 使用的模型名称"
echo ""
echo "支持的AI提供商包括："
echo "- OpenAI (https://api.openai.com/v1)"
echo "- Gemini (https://generativelanguage.googleapis.com/v1beta/)"
echo "- 其他OpenAI兼容的API服务" 