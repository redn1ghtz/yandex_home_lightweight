#!/usr/bin/env python3
"""
Прокси-сервер для обхода CORS и проблем TLS.
Сервер отдаёт статику и проксирует запросы к api.iot.yandex.net.
Запуск: python3 proxy.py
Порт: 8080 по умолчанию, или PORT=3000 python3 proxy.py
"""

import http.server
import os
import re
import urllib.request
import urllib.error
import urllib.parse
import json
import ssl
import uuid

PORT = int(os.environ.get('PORT', 8080))
API_HOST = 'https://api.iot.yandex.net'

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/stream'):
            self.proxy_stream()
        elif self.path.startswith('/api/'):
            self.proxy_request('GET')
        else:
            self.serve_static()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request('POST')
        else:
            self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_request('DELETE')
        else:
            self.send_error(405)

    def proxy_stream(self):
        """Проксирует видеопоток для обхода CORS. Поддерживает Range для iOS Safari."""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        url = params.get('url', [None])[0]
        if not url:
            self.send_error(400, 'Missing url parameter')
            return
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46')
            range_hdr = self.headers.get('Range')
            if range_hdr:
                req.add_header('Range', range_hdr)
            with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
                ctype = resp.headers.get('Content-Type', 'application/octet-stream')
                is_m3u8 = 'mpegurl' in ctype or '.m3u8' in url
                if is_m3u8:
                    content = resp.read()
                    content = self._rewrite_m3u8(content.decode('utf-8', errors='replace'), url)
                    content = content.encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/vnd.apple.mpegurl' if '.m3u8' in url else ctype)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-cache')
                    self.end_headers()
                    self.wfile.write(content)
                else:
                    status = getattr(resp, 'status', 200)
                    self.send_response(status)
                    self.send_header('Content-Type', self._content_type_for_url(url, ctype))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-cache')
                    self.send_header('Accept-Ranges', 'bytes')
                    for h in ('Content-Length', 'Content-Range'):
                        v = resp.headers.get(h)
                        if v:
                            self.send_header(h, v)
                    self.end_headers()
                    try:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _content_type_for_url(self, url, fallback):
        """Правильные MIME-типы для Safari (iOS 9)."""
        url_lower = url.lower()
        if '.m3u8' in url_lower:
            return 'application/vnd.apple.mpegurl'
        if '.m4s' in url_lower or 'segment' in url_lower:
            return 'video/mp4'
        if '.mp4' in url_lower or 'init' in url_lower:
            return 'video/mp4'
        return fallback or 'video/mp4'

    def _rewrite_m3u8(self, content, base_url):
        """Переписывает URL в m3u8 чтобы сегменты шли через прокси."""
        base = base_url.rsplit('/', 1)[0] + '/' if '/' in base_url else ''

        def make_proxy_url(url):
            if not url.startswith('http'):
                url = urllib.parse.urljoin(base, url)
            return '/api/stream?url=' + urllib.parse.quote(url, safe='')

        lines = content.split('\n')
        result = []
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith('#'):
                url = make_proxy_url(stripped)
                result.append(url)
            elif 'URI="' in stripped or "URI='" in stripped:
                matches = list(re.finditer(r'URI=(["\'])([^"\']+)\1', stripped))
                for match in reversed(matches):
                    orig_url = match.group(2)
                    proxy_url = make_proxy_url(orig_url)
                    q = match.group(1)
                    new_val = 'URI=%s%s%s' % (q, proxy_url, q)
                    stripped = stripped[:match.start()] + new_val + stripped[match.end():]
                result.append(stripped)
            else:
                result.append(stripped if stripped else line.rstrip())
        return '\n'.join(result)

    def proxy_request(self, method):
        path = self.path[4:]  # убираем /api
        url = API_HOST + path
        auth = self.headers.get('Authorization', '')

        try:
            body = None
            if method == 'POST' and 'Content-Length' in self.headers:
                length = int(self.headers['Content-Length'])
                body = self.rfile.read(length)

            req = urllib.request.Request(url, data=body, method=method)
            req.add_header('Authorization', auth)
            req.add_header('Content-Type', 'application/json')
            req.add_header('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 YaApp/3.0')
            req.add_header('X-Request-Id', str(uuid.uuid4()))
            req.add_header('Accept-Language', 'ru-RU,ru;q=0.9')

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            timeout = 60 if method == 'POST' else 30
            with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            body = e.read() if e.fp else b''
            try:
                json.loads(body.decode())
                resp_body = body
            except (ValueError, UnicodeDecodeError):
                resp_body = json.dumps({'message': body.decode('utf-8', errors='replace') or 'Ошибка ' + str(e.code)}).encode()
            self.wfile.write(resp_body)
        except Exception as e:
            print("ERROR proxy_request: %s" % e)
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def serve_static(self):
        path = self.path.split('?')[0]
        if path == '/':
            path = '/index.html'
        path = path.lstrip('/')
        if not path:
            path = 'index.html'

        try:
            with open(path, 'rb') as f:
                content = f.read()
            content_type = 'text/html' if path.endswith('.html') else \
                          'text/css' if path.endswith('.css') else \
                          'application/javascript' if path.endswith('.js') else \
                          'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)
        except Exception as e:
            self.send_error(500, str(e))

    def log_message(self, format, *args):
        print("%s - %s" % (self.log_date_time_string(), format % args))

if __name__ == '__main__':
    server = http.server.HTTPServer(('', PORT), ProxyHandler)
    print('Сервер: http://0.0.0.0:%d' % PORT)
    print('Откройте в браузере: http://localhost:%d' % PORT)
    print('С других устройств: http://IP_ЭТОГО_СЕРВЕРА:%d' % PORT)
    print('Нажмите Ctrl+C для остановки')
    server.serve_forever()
