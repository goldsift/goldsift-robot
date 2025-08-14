# Telegram Markdown格式错误修复文档

## 🔍 问题分析

### 错误现象
```
ETELEGRAM: 400 Bad Request: can't parse entities: Can't find end of the entity starting at byte offset XXXX
```

### 根本原因
1. **流式内容截断**：AI流式返回时，内容可能在Markdown标记中间被截断
2. **未闭合的标记**：`*`、`_`、`` ` ``等Markdown标记数量不匹配
3. **字节偏移错误**：Telegram无法找到某个格式标记的结束位置

## 🛠️ 解决方案

### 1. Markdown标记完整性检查

新增`sanitizeMarkdown()`函数，确保所有格式标记都正确配对：

```typescript
function sanitizeMarkdown(text: string): string {
  // 计算各种Markdown标记的数量
  const boldCount = (text.match(/\*/g) || []).length;
  const codeCount = (text.match(/`/g) || []).length;
  const underlineCount = (text.match(/_/g) || []).length;
  
  // 移除未配对的标记
  if (boldCount % 2 !== 0) {
    // 移除最后一个未配对的*
  }
  // ... 其他标记处理
}
```

### 2. 分阶段格式化策略

- **流式阶段**：只做基本的内容显示，避免复杂格式化
- **完成阶段**：进行完整的Markdown格式化

```typescript
function formatStreamingContent(content: string, symbol: string, isComplete: boolean) {
  // 只在内容完整时进行复杂的格式化
  if (isComplete) {
    // 应用价格、百分比等格式化
    formattedContent = formattedContent
      .replace(/(\$?[\d,]+\.?\d*\s*USDT?)/g, '`$1`')
      .replace(/([+-]?\d+\.?\d*%)/g, '`$1`');
  }
  
  // 修复Markdown格式问题
  return sanitizeMarkdown(formattedContent);
}
```

### 3. 降级处理机制

改进`editSafeMessage()`函数，支持格式降级：

```typescript
async function editSafeMessage(chatId: number, messageId: number, text: string) {
  try {
    // 首先尝试Markdown格式
    return await bot.editMessageText(text, { parse_mode: 'Markdown' });
  } catch (error) {
    // Markdown失败，降级为纯文本
    const plainText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // 移除粗体
      .replace(/\*(.*?)\*/g, '$1')      // 移除斜体
      .replace(/`(.*?)`/g, '$1')        // 移除代码块
      .replace(/_(.*?)_/g, '$1');       // 移除下划线
    
    return await bot.editMessageText(plainText, { parse_mode: undefined });
  }
}
```

### 4. 失败恢复策略

在流式更新中添加失败恢复：

```typescript
const editResult = await editSafeMessage(chatId, messageId, content);

// 如果编辑失败且分析已完成，发送新消息
if (!editResult && isComplete) {
  analysisMessage = await sendSafeMessage(chatId, content);
}
```

## ✅ 修复效果

### 修复前
- 频繁出现Markdown解析错误
- 流式更新中断
- 用户体验差

### 修复后
- **格式完整性保证**：自动修复未闭合的Markdown标记
- **降级处理**：Markdown失败时自动降级为纯文本
- **恢复机制**：编辑失败时发送新消息
- **用户体验提升**：流式更新更稳定

## 🔧 技术细节

### 标记检查算法
1. 统计各类型标记的数量
2. 检查是否为偶数（配对）
3. 移除多余的未配对标记

### 错误处理层级
1. **第一层**：Markdown格式修复
2. **第二层**：格式降级（纯文本）
3. **第三层**：发送新消息（最后手段）

### 性能优化
- 只在必要时进行格式化处理
- 避免在流式阶段进行复杂的正则替换
- 缓存格式化结果

## 📊 测试建议

在部署后，监控以下指标：
1. Markdown解析错误频率
2. 消息编辑成功率
3. 流式更新完成率
4. 用户体验反馈

通过这些修复，应该能显著减少Telegram Markdown解析错误，提升流式分析的稳定性。 