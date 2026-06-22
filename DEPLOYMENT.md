# 优化版 VLESS 节点部署指南

## ✅ 已完成
1. ✅ GitHub 仓库已创建：https://github.com/fushuain-collab/vless-node-optimized
2. ✅ 优化版 Worker 代码已推送
3. ✅ 初始订阅文件已生成（3个节点）

## 📋 需要手动操作

### 步骤 1：创建 CF Pages 项目
1. 访问 CF Pages 控制台：https://dash.cloudflare.com/2a59ea0bbb2b91a2c98768cff534bec3/pages
2. 点击 **"Create a project"**
3. 选择 **"Connect to Git"**
4. 选择仓库：`fushuain-collab/vless-node-optimized`
5. 配置构建设置：
   - **Project name**: `edgetunnel-optimized`
   - **Production branch**: `main`
   - **Build command**: 留空
   - **Build output directory**: `/`
6. 点击 **"Save and Deploy"**

### 步骤 2：配置自定义域名（可选）
如果你想用 `nfs.kdns.fr` 的子域名：
1. 在 Pages 项目设置中添加自定义域名
2. 例如：`optimized.nfs.kdns.fr`
3. 更新订阅文件中的 `host` 和 `sni` 参数

### 步骤 3：等待部署完成
部署通常需要 1-2 分钟。

---

## 🔗 订阅链接

### 原始链接
```
https://raw.githubusercontent.com/fushuain-collab/vless-node-optimized/main/sub.txt
```

### 加速链接（推荐）
```
https://ghfast.top/https://raw.githubusercontent.com/fushuain-collab/vless-node-optimized/main/sub.txt
```

---

## 📊 当前节点配置

目前包含 3 个测试节点：
- **优化版-1**: 172.66.0.7（你测试的最优 IP，82ms）
- **优化版-2**: 172.66.0.1
- **优化版-3**: 172.66.0.2

---

## 🧪 测试步骤

1. **在 Karing 中添加订阅**：
   - 复制上面的加速链接
   - 在 Karing 中添加新订阅
   - 刷新订阅

2. **测速对比**：
   - 先测试你原有的订阅（82ms 基准）
   - 再测试这个优化版订阅
   - 对比延迟是否降低

3. **连接测试**：
   - 选择延迟最低的优化版节点
   - 测试能否正常连接
   - 测试实际使用体验

---

## 🔧 优化原理

这个优化版 Worker 做了以下改进：

### 1. 零拷贝数据转发
```javascript
// 原版：逐块读取缓冲
for await (const chunk of reader) { ... }

// 优化版：直接管道转发
remoteSocket.readable.pipeTo(webSocket.writable)
```

### 2. 减少协议解析开销
- 预分配缓冲区
- 减少 UUID 验证次数
- 优化字节序转换

### 3. 快速失败机制
- 连接超时：5秒（原版 10秒）
- 立即关闭无效连接
- 减少等待时间

### 4. 优化的缓冲区管理
```javascript
// 设置更激进的 buffer hints
{ highWaterMark: 16384 }  // 16KB，原版 64KB
```

---

## 💡 预期效果

**理论优化空间：5-15ms**

- 如果你的延迟从 82ms → 70ms：✅ 优化成功
- 如果还是 82ms：说明瓶颈在网络路由，不在协议层
- 如果 > 82ms：可能需要调整参数

---

## 🔄 后续优化方向

如果这版优化效果有限，可以尝试：

1. **换用 gRPC 传输**（需要换平台）
2. **多路复用**（multiplex）
3. **付费中转**（香港 CN2 GIA）

---

## 📝 对比表

| 项目 | 原版 | 优化版 |
|------|------|--------|
| 仓库 | vless-node | vless-node-optimized |
| 延迟基准 | 82ms | 待测试 |
| 数据转发 | 逐块读取 | 零拷贝管道 |
| 连接超时 | 10s | 5s |
| 缓冲区 | 64KB | 16KB |

---

## 🆘 故障排查

如果优化版节点无法连接：

1. **检查 Pages 部署状态**：
   - 访问 CF Pages 控制台
   - 确认部署成功（绿色勾）

2. **检查 Worker 代码**：
   - 确认 `_worker.js` 已正确部署
   - 检查 CF Pages 日志

3. **DNS 传播**：
   - 如果用了自定义域名，等待 DNS 生效（5-10分钟）

4. **回滚**：
   - 如果优化版有问题，你的原版订阅完全不受影响
   - 可以随时切回原版
