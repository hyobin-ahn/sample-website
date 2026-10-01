import http.server
import urllib.request
import json
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, parse_qs
import os
from dotenv import load_dotenv

try:
    from google import genai
except ImportError:
    genai = None

load_dotenv()

PORT = 8000

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        '': 'application/octet-stream',
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.ics': 'text/calendar; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Force fresh response by ignoring If-Modified-Since and If-None-Match
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']

        parsed_path = urlparse(self.path)
        
        super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/iching':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                hexagram_name = data.get('name', '')
                hexagram_text = data.get('text', '')
            except Exception:
                self.send_error_json(400, "Invalid JSON data")
                return

            api_key = os.environ.get('GEMINI_API_KEY')
            if not api_key or not genai:
                self.send_error_json(500, "GEMINI_API_KEY is not set or google-genai is not installed")
                return

            try:
                client = genai.Client(api_key=api_key)
                prompt = f"""
당신은 주역(I Ching)에 정통한 동양철학자입니다.
다음은 주역의 '{hexagram_name}' 괘의 원문(괘사와 효사)입니다.

[원문]
{hexagram_text}

이 괘의 괘사(卦辭)와 각 효사(爻辭)별로, 다음 7명의 학자들의 주석을 각각 작성해주세요:
1. 왕필 (Wang Bi)
2. 공영달 (Kong Yingda)
3. 소식 (Su Shi)
4. 정이 (Cheng Yi)
5. 주희 (Zhu Xi)
6. 쌍호호씨 (Shuanghu Hu Shi)
7. 운봉호씨 (Yunfeng Hu Shi)

반드시 다음 JSON 배열(Array) 형식으로만 반환하세요:
[
  {{
    "title": "괘사",
    "wangbi": "왕필의 해석",
    "kongyingda": "공영달의 해석",
    "sushi": "소식의 해석",
    "chengyi": "정이의 해석",
    "zhuxi": "주희의 해석",
    "shuanghu": "쌍호호씨의 해석",
    "yunfeng": "운봉호씨의 해석"
  }},
  {{
    "title": "초효(예: 초구, 초육 등 이름 사용)",
    "wangbi": "...",
    "kongyingda": "...",
    "sushi": "...",
    "chengyi": "...",
    "zhuxi": "...",
    "shuanghu": "...",
    "yunfeng": "..."
  }}
  // ... 나머지 2효~상효까지 순차적으로 객체 추가 (총 7개의 객체: 괘사 1개 + 효사 6개)
]
결과는 오직 유효한 JSON 배열 형식으로만 반환해야 합니다. 마크다운 블록(```json) 없이 순수 JSON 문자열만 반환하거나 마크다운 블록을 사용해도 파싱할 수 있게 해주세요. 다른 말은 덧붙이지 마세요.
"""
                for attempt in range(3):
                    try:
                        interaction = client.interactions.create(
                            model='gemini-3.5-flash-lite',
                            input=prompt,
                        )
                        break
                    except Exception as e:
                        if attempt == 2:
                            raise e
                        import time
                        time.sleep(1.5)
                
                response_text = interaction.output_text.strip() if interaction.output_text else ""
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                if response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                response_text = response_text.strip()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(response_text.encode('utf-8'))
            except Exception as e:
                print(f"Error calling Gemini API: {e}")
                self.send_error_json(500, str(e))
        else:
            self.send_error_json(404, "Not Found")

    def send_error_json(self, code, message):
        try:
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'error': message}).encode('utf-8'))
        except Exception:
            pass


class ThreadingServer(http.server.ThreadingHTTPServer):
    pass

if __name__ == '__main__':
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadingServer(server_address, ProxyHandler)
    print(f"Multi-threaded server running at http://0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()

