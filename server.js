/**
 * MediaPipe 离线演示 · 本地静态服务
 * 只监听 127.0.0.1，不对外暴露。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8777);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  /* 仅供 _selftest.html 自动化自检回报结果，正式使用可整段删除 */
  if (req.url === '/__selftest' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      try { fs.writeFileSync(path.join(ROOT, '_selftest_result.txt'), body, 'utf8'); } catch {}
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('bad request'); return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  // 防目录穿越
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('forbidden'); return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 未找到：' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isBinary = ['.wasm', '.task', '.tflite', '.png', '.ico'].includes(ext);

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': isBinary ? 'public, max-age=86400' : 'no-cache',
    });

    if (req.method === 'HEAD') { res.end(); return; }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { try { res.destroy(); } catch {} });
    stream.pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n端口 ${PORT} 已被占用。可能是之前启动的窗口没关。`);
    console.error(`处理办法：关掉旧的命令行窗口，或设置环境变量换端口，例如：`);
    console.error(`  set PORT=8778 && node server.js\n`);
  } else {
    console.error('服务启动失败：', e.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   MediaPipe 视觉实验室 · 离线版              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  访问地址：  ' + url);
  console.log('  运行模式：  纯本地，不联网');
  console.log('');
  console.log('  关闭此窗口即停止服务。');
  console.log('');

  if (!process.env.NO_OPEN) {
    exec(`start "" "${url}"`, { shell: 'cmd.exe' }, () => {});
  }
});
