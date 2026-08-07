"""브라우저 수집 데이터를 받는 로컬 POST 수신 서버 (수집 세션용, 임시 실행).

사용법: python3 scripts/collect_receiver.py <port> <out_dir>
POST /save?name=<파일명> 의 body를 <out_dir>/<파일명>.json 으로 저장한다.
localhost 전용이며 수집이 끝나면 종료한다.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            name = query.get("name", ["data"])[0]
            if not re.match(r"^[\w.-]{1,60}$", name):
                raise ValueError("잘못된 파일명")
            length = int(self.headers.get("Content-Length", 0))
            if length > 20_000_000:
                raise ValueError("본문이 너무 큽니다")
            body = self.rfile.read(length)
            json.loads(body)  # JSON 검증
            out = Path(sys.argv[2]) / f"{name}.json"
            out.write_bytes(body)
            self.send_response(200)
            self._cors()
            self.end_headers()
            self.wfile.write(b"OK")
            print(f"saved {out} ({length} bytes)")
        except Exception as exc:  # noqa: BLE001 — 수신 실패 사유를 응답으로 전달
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(str(exc).encode())

    def log_message(self, *args):  # 소음 억제
        pass


if __name__ == "__main__":
    port = int(sys.argv[1])
    Path(sys.argv[2]).mkdir(parents=True, exist_ok=True)
    print(f"listening on {port}")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
