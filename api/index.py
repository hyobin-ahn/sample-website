from http.server import BaseHTTPRequestHandler
import json
import os
from google import genai

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode('utf-8'))
            hexagram_name = data.get('name', '')
            hexagram_text = data.get('text', '')
        except Exception:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
            return

        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "API key not configured"}).encode('utf-8'))
            return

        try:
            client = genai.Client(api_key=api_key)
            prompt = f"""당신은 주역(I Ching)에 정통한 동양철학자입니다.
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
  }}
]
결과는 오직 유효한 JSON 배열 형식으로만 반환해야 합니다. 다른 말은 덧붙이지 마세요."""
            
            interaction = client.interactions.create(
                model='gemini-3.5-flash-lite',
                input=prompt,
            )
            
            response_text = interaction.output_text.strip() if interaction.output_text else ""
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response_text.encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
