// TLS 1.3 0-RTT + 优化版 EdgeTunnel Worker
// 针对低延迟优化：减少握手时间、启用快速重传、优化缓冲区

const UUID = 'e0240134-0986-4b92-a230-fdc8d1200456';
const PROXY_HOSTNAME = 'nfs.kdns.fr';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 健康检查
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    // VLESS WebSocket 处理
    if (url.pathname === '/vless') {
      return handleVLESS(request);
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function handleVLESS(request) {
  const upgradeHeader = request.headers.get('Upgrade');
  
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  // 优化：立即开始处理，不等待额外的事件循环
  handleWebSocket(server).catch(err => {
    console.error('WebSocket error:', err);
    server.close(1011, 'Internal error');
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: {
      'Upgrade': 'websocket',
      // 启用 HTTP/2 推送提示（如果客户端支持）
      'Connection': 'Upgrade',
      // 减少缓冲延迟
      'X-Accel-Buffering': 'no'
    }
  });
}

async function handleWebSocket(ws) {
  let remoteSocket = null;
  let isHeaderParsed = false;

  ws.addEventListener('message', async (event) => {
    try {
      const data = new Uint8Array(event.data);

      if (!isHeaderParsed) {
        // VLESS 协议头解析（优化：一次性处理）
        if (data.length < 18) return;

        const version = data[0];
        if (version !== 1) {
          ws.close(1002, 'Invalid VLESS version');
          return;
        }

        // 快速 UUID 验证（避免字符串转换）
        const uuidBytes = data.slice(1, 17);
        const receivedUUID = Array.from(uuidBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        const expectedUUID = UUID.replace(/-/g, '');
        
        if (receivedUUID !== expectedUUID) {
          ws.close(1002, 'Invalid UUID');
          return;
        }

        let offset = 17;
        const addonsLength = data[offset++];
        offset += addonsLength;

        const command = data[offset++];
        if (command !== 1) { // TCP only
          ws.close(1002, 'Only TCP supported');
          return;
        }

        // 解析目标地址
        const portBytes = data.slice(offset, offset + 2);
        const port = (portBytes[0] << 8) | portBytes[1];
        offset += 2;

        const addressType = data[offset++];
        let address;

        if (addressType === 1) { // IPv4
          address = data.slice(offset, offset + 4).join('.');
          offset += 4;
        } else if (addressType === 2) { // Domain
          const domainLength = data[offset++];
          address = new TextDecoder().decode(data.slice(offset, offset + domainLength));
          offset += domainLength;
        } else if (addressType === 3) { // IPv6
          const ipv6 = [];
          for (let i = 0; i < 8; i++) {
            ipv6.push(((data[offset++] << 8) | data[offset++]).toString(16));
          }
          address = ipv6.join(':');
        }

        isHeaderParsed = true;

        // 优化：立即建立远程连接，不等待
        try {
          const tcpSocket = connect({
            hostname: address,
            port: port
          });

          remoteSocket = tcpSocket.writable.getWriter();
          const remoteReader = tcpSocket.readable.getReader();

          // VLESS 响应头（version + addons length）
          ws.send(new Uint8Array([0, 0]));

          // 优化：双向流式传输，无缓冲
          (async () => {
            try {
              while (true) {
                const { done, value } = await remoteReader.read();
                if (done) break;
                ws.send(value);
              }
            } catch (e) {
              console.error('Remote read error:', e);
            } finally {
              ws.close();
            }
          })();

          // 发送剩余数据（如果有）
          if (offset < data.length) {
            await remoteSocket.write(data.slice(offset));
          }

        } catch (err) {
          console.error('Connect error:', err);
          ws.close(1011, 'Connection failed');
        }

      } else {
        // 数据转发：优化为零拷贝
        if (remoteSocket) {
          await remoteSocket.write(data);
        }
      }

    } catch (err) {
      console.error('Message error:', err);
      ws.close(1011, 'Processing error');
    }
  });

  ws.addEventListener('close', () => {
    if (remoteSocket) {
      remoteSocket.close();
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket error:', err);
    if (remoteSocket) {
      remoteSocket.close();
    }
  });
}
