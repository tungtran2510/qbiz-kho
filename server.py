from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os, sys, time, traceback

class QBizHandler(SimpleHTTPRequestHandler):
    extensions_map = SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
    })

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Silent to avoid pipe buffer blocking
        pass

if __name__ == '__main__':
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(cur_dir)
    ThreadingHTTPServer.allow_reuse_address = True
    for attempt in range(10):
        try:
            server = ThreadingHTTPServer(('0.0.0.0', 4180), QBizHandler)
            print(f"[QBiz Server] Running on http://0.0.0.0:4180 (multithreaded)")
            sys.stdout.flush()
            server.serve_forever()
            break
        except Exception as e:
            with open(os.path.join(cur_dir, "server_error.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.ctime()}] Attempt {attempt}: {traceback.format_exc()}\n")
            time.sleep(1)
