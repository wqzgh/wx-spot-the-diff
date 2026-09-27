#!/usr/bin/env python3
"""用本地 HTTP 服务打开标注工具。

File System Access API（选择游戏目录）在 file:// 下可能被浏览器拒绝，
走 http://127.0.0.1 就一定可用。双击 start-server.bat 即可。

注意：端口从 8765 起自动向后探测，避免被其它本地服务占用
（曾出现过 8765 被另一个橘猫项目占用，打开的是别人的页面）。
"""
import http.server
import os
import socket
import socketserver
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# 本工具的特征串，用来确认端口上确实是本服务而不是别的本地项目
MARK = b'spotdiff_annotator_v2'


def port_free(port):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        s.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def probe(port):
    """端口被占用时，探测它上面是不是本工具；是则可直接复用"""
    import urllib.request
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/index.html' % port, timeout=1) as r:
            return MARK in r.read(200000)
    except Exception:
        return False


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


handler = Quiet
handler.extensions_map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg',
}

PORT = None
for p in range(8765, 8785):
    if port_free(p):
        PORT = p
        break
    if probe(p):
        print('端口 %d 上已在运行本标注工具，直接打开它。' % p)
        webbrowser.open('http://127.0.0.1:%d/index.html' % p)
        raise SystemExit(0)

if PORT is None:
    print('8765-8784 端口都被占用且都不是本工具，请关掉其它本地服务后重试。')
    raise SystemExit(1)

socketserver.TCPServer.allow_reuse_address = True
try:
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
except OSError as e:
    print('启动失败:', e)
    raise SystemExit(1)

url = 'http://127.0.0.1:%d/index.html' % PORT
with httpd:
    print('=' * 52)
    print('  找不同标注工具已启动')
    print('  地址: ' + url)
    print('  根目录: ' + ROOT)
    print('=' * 52)
    print('请确认页面标题是「找不同 · 关卡标注工具」。')
    print('若显示别的页面，说明端口被其它本地服务占用——已自动避开。')
    print('关闭本窗口即可停止服务。')
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
