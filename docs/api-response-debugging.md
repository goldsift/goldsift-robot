# API响应调试功能文档

## 🔍 问题背景

在使用AI服务时，经常遇到以下JSON解析错误：
```
AI 响应解析失败 | {"error":"Unexpected token * in JSON at position 0"}
```

这类错误通常是因为：
1. **API返回格式错误**：服务返回的不是标准JSON格式
2. **网络传输问题**：响应被截断或损坏
3. **API服务异常**：服务返回错误页面而非JSON数据
4. **编码问题**：响应包含特殊字符导致解析失败

## 🛠️ 解决方案

### 1. 详细响应日志记录

为所有AI API调用添加了详细的响应日志：

```typescript
// 获取响应文本
const responseText = await response.text();

// 记录原始响应内容以便调试
logger.debug('API原始响应', {
  url: apiUrl,
  responseLength: responseText.length,
  responsePreview: responseText.substring(0, 500) + '...',
  responseText: responseText // 完整响应内容
});
```

### 2. JSON解析错误处理

改进JSON解析逻辑，提供详细错误信息：

```typescript
let data;
try {
  data = JSON.parse(responseText);
} catch (parseError) {
  logger.error('API响应解析失败', {
    error: parseError.message,
    responseText: responseText,
    responseLength: responseText.length,
    contentType: response.headers.get('content-type')
  });
  throw new Error(`AI响应解析失败: ${parseError.message}`);
}
```

### 3. 流式响应错误处理

为流式API添加解析错误记录：

```typescript
try {
  const parsed = JSON.parse(data);
  // 处理解析后的数据
} catch (e) {
  logger.debug('流式响应解析错误', {
    error: e.message,
    lineData: data,
    lineLength: data.length
  });
}
```

## 📊 调试信息层级

### DEBUG级别日志
- **API原始响应**：完整的响应内容
- **响应预览**：前500字符的预览
- **流式解析错误**：单行数据解析失败

### ERROR级别日志
- **API请求失败**：HTTP错误状态码
- **响应解析失败**：JSON解析错误详情
- **空候选结果**：API返回结构异常

## 🔧 使用方法

### 1. 启用DEBUG日志

修改环境变量或配置文件：
```bash
LOG_LEVEL=debug
```

### 2. 查看详细响应

当出现JSON解析错误时，查看日志文件：
```bash
tail -f logs/debug.log | grep "API原始响应"
```

### 3. 分析错误原因

根据日志信息判断错误类型：

**情况1：HTML错误页面**
```json
{
  "responseText": "<!DOCTYPE html><html><head><title>Error</title>...",
  "contentType": "text/html"
}
```
→ API服务返回错误页面，检查URL和认证

**情况2：部分响应**
```json
{
  "responseText": "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"分析开始*",
  "responseLength": 45
}
```
→ 响应被截断，可能是网络问题

**情况3：非JSON格式**
```json
{
  "responseText": "*开始分析BTC/USDT的技术走势...",
  "contentType": "text/plain"
}
```
→ API返回纯文本，检查API配置

## 🚨 常见错误模式

### Gemini API错误
- **403 Forbidden**：API密钥无效或配额不足
- **400 Bad Request**：请求格式错误
- **HTML响应**：API端点错误

### OpenAI API错误
- **401 Unauthorized**：API密钥无效
- **429 Too Many Requests**：频率限制
- **502 Bad Gateway**：服务暂时不可用

## 📈 监控建议

### 1. 错误频率监控
```bash
# 统计JSON解析错误频率
grep "响应解析失败" logs/error.log | wc -l
```

### 2. 响应内容分析
```bash
# 查看最近的响应内容
grep -A 5 "API原始响应" logs/debug.log | tail -20
```

### 3. 错误模式识别
```bash
# 查找HTML响应错误
grep "<!DOCTYPE html" logs/debug.log
```

## ✅ 修复效果

### 修复前
- 只有简单的"JSON解析失败"错误
- 无法知道实际的响应内容
- 难以定位问题根因

### 修复后
- **完整响应记录**：可以看到API返回的确切内容
- **详细错误信息**：包含解析错误位置和原因
- **分层错误处理**：区分不同类型的错误
- **调试友好**：便于快速定位和解决问题

通过这些改进，现在可以快速识别和解决各种API响应问题，显著提升系统的稳定性和可维护性。 