# URL兼容性处理文档

## 概述

参考Cherry Studio的URL处理逻辑，我们实现了智能的API URL构建功能，支持多种配置方式，提升不同AI服务商的兼容性。

## URL处理规则

### 1. 强制使用原始地址 (`#` 结尾)

当`OPENAI_BASE_URL`以`#`结尾时，强制使用输入的完整地址，不做任何修改。

```bash
# 示例配置
OPENAI_BASE_URL=https://api.openai.com/v1/chat/completions#

# 实际请求URL
https://api.openai.com/v1/chat/completions
```

**使用场景**：
- 代理服务或网关已经包含完整路径
- 自定义API端点
- 需要精确控制URL的场景

### 2. 忽略版本号 (`/` 结尾)

当`OPENAI_BASE_URL`以`/`结尾时，忽略默认版本号，直接拼接端点。

```bash
# 示例配置
OPENAI_BASE_URL=https://api.openai.com/

# 对于OpenAI API
# 实际请求URL: https://api.openai.com/chat/completions

# 对于Gemini API  
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/
# 实际请求URL: https://generativelanguage.googleapis.com/models/gemini-2.5-flash:generateContent
```

**使用场景**：
- 使用自定义版本号的API
- 代理服务已经处理版本号
- 需要直接拼接端点的场景

### 3. 智能版本检测（默认行为）

当URL不包含特殊标记时，系统会智能检测并添加适当的版本号。

```bash
# 示例配置
OPENAI_BASE_URL=https://api.openai.com

# 自动检测并添加版本号
# OpenAI: https://api.openai.com/v1/chat/completions
# Gemini: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
```

**检测逻辑**：
1. 如果URL已包含`/v1`或`/v1beta`，直接使用
2. 根据AI提供商自动添加对应版本号：
   - OpenAI: `/v1`
   - Gemini: `/v1beta`

## 配置示例

### OpenAI官方API
```bash
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4
```

### Azure OpenAI
```bash
OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-15-preview#
OPENAI_MODEL=gpt-4
```

### Gemini API
```bash
OPENAI_BASE_URL=https://generativelanguage.googleapis.com
OPENAI_MODEL=gemini-2.5-flash
```

### 自定义代理
```bash
# 代理已处理版本号
OPENAI_BASE_URL=https://your-proxy.com/
OPENAI_MODEL=gpt-4

# 代理包含完整路径
OPENAI_BASE_URL=https://your-proxy.com/api/v1/chat/completions#
OPENAI_MODEL=gpt-4
```

## 错误处理

系统会详细记录API请求失败的信息：

```typescript
logger.error('API请求失败', {
  url: apiUrl,           // 实际请求的URL
  status: response.status, // HTTP状态码
  error: errorText        // 错误详情
});
```

这有助于调试不同配置下的URL构建问题。

## 兼容性

该URL处理逻辑与以下工具兼容：
- Cherry Studio
- 各种OpenAI代理服务
- Azure OpenAI Service
- Google Gemini API
- 其他OpenAI兼容的API服务

## 测试建议

在配置新的API服务时，建议按以下顺序测试：

1. **默认配置**：先尝试基础URL，让系统自动检测
2. **强制路径**：如果失败，尝试使用`#`标记强制指定完整路径
3. **忽略版本**：如果API不需要版本号，使用`/`标记
4. **查看日志**：检查实际请求的URL是否正确 