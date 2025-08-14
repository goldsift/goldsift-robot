# 群聊功能故障排查指南

## 问题描述
机器人在群聊中@它没有反应，后台也没有日志打印。

## 排查步骤

### 1. 重启机器人并查看启动日志

重启机器人后，查看启动日志中的关键信息：

```bash
npm run build && npm start
```

**关注启动日志中的以下信息：**
```
Bot启动成功 {
  "botId": 123456789,
  "botUsername": "your_bot_name",
  "botName": "Your Bot Name",
  "botCanJoinGroups": true,
  "botCanReadAllGroupMessages": false,  // 这个很重要！
  "maxConcurrentAnalysis": 10
}

机器人配置信息 {
  "username": "your_bot_name",
  "groupChatSupport": true,
  "readAllMessages": false,  // 这个是关键！
  "mentionFormat": "@your_bot_name"
}
```

### 2. 检查机器人权限设置

**重要：** `botCanReadAllGroupMessages` 和 `readAllMessages` 应该为 `true`

如果这两个值为 `false`，说明机器人没有读取群聊所有消息的权限，需要：

1. **找到 @BotFather**
2. **发送 `/setprivacy`**
3. **选择你的机器人**
4. **选择 `Disable`** （这样机器人就能读取所有消息了）

### 3. 在群聊中测试并查看日志

在群聊中发送消息：`@your_bot_name 测试`

**正常情况下应该看到以下日志：**

```
接收到消息 {
  "chatId": -1001234567890,
  "chatType": "supergroup",
  "messageId": 123,
  "fromUserId": 987654321,
  "fromUsername": "testuser",
  "text": "@your_bot_name 测试",
  "isCommand": false,
  "hasText": true
}

检查消息是否给机器人 {
  "chatId": -1001234567890,
  "chatType": "supergroup", 
  "textPreview": "@your_bot_name 测试",
  "botInfoExists": true,
  "botUsername": "your_bot_name",
  "botId": 123456789,
  "hasReplyToMessage": false,
  "replyToMessageFromId": null
}

检测到@机器人 {
  "chatId": -1001234567890,
  "botMention": "@your_bot_name",
  "textContainsMention": true
}
```

### 4. 常见问题和解决方案

#### 问题1：没有收到任何消息日志
**可能原因：** 机器人权限问题
**解决方案：** 
1. 确保机器人在 BotFather 中设置了 Privacy = Disable
2. 确保机器人是群聊管理员或有发送消息权限

#### 问题2：收到消息但 `botInfoExists: false`
**可能原因：** 机器人启动时获取信息失败
**解决方案：** 重启机器人，检查网络连接

#### 问题3：`botCanReadAllGroupMessages: false`
**可能原因：** 机器人隐私设置问题
**解决方案：** 
1. 找到 @BotFather
2. 发送 `/setprivacy`
3. 选择你的机器人
4. 选择 `Disable`

#### 问题4：收到消息但检测不到@机器人
**可能原因：** 用户名不匹配或格式问题
**解决方案：** 
1. 检查日志中的 `botUsername`
2. 确保@的格式正确：`@exact_bot_username`
3. 注意用户名大小写敏感

### 5. 测试命令

测试以下几种消息格式：

```
@your_bot_name 分析 BTC/USDT
@your_bot_name 测试
回复机器人的消息
```

### 6. 日志级别设置

确保 `.env` 文件中的日志级别设置正确：

```env
LOG_LEVEL=info  # 或者设置为 debug 获取更详细信息
```

### 7. 如果问题仍然存在

1. **检查机器人是否被群聊封禁**
2. **确认机器人有发送消息的权限**
3. **尝试将机器人设为群聊管理员**
4. **检查 Telegram API 是否有网络问题**

## BotFather 设置步骤详解

1. 在 Telegram 中找到 @BotFather
2. 发送 `/setprivacy`
3. 选择你的机器人
4. 你会看到两个选项：
   - **Enable** - 机器人只能看到以 / 开头的命令和回复它的消息
   - **Disable** - 机器人可以看到群聊中的所有消息
5. **选择 Disable** 
6. 重启你的机器人

## 验证设置是否成功

重启机器人后，在启动日志中应该看到：
```
"botCanReadAllGroupMessages": true,
"readAllMessages": true
```

如果看到这个，说明设置成功！

---

**注意：** 修改隐私设置后，需要将机器人重新添加到群聊中，或者重启机器人服务。
