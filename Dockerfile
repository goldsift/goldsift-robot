# 使用官方 Node.js v18.20.4 镜像作为基础镜像
FROM node:18.20.4-alpine

# 安装必要的系统依赖
RUN apk add --no-cache curl

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建 TypeScript 项目
RUN npm run build

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 创建日志目录并设置权限
RUN mkdir -p /app/logs && chown -R nextjs:nodejs /app/logs

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
CMD ["npm", "start"]
