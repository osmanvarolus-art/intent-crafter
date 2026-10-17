# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper>=1.1", "numpy", "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"]
# ///
"""Local speech-to-text for IntentCraft: faster-whisper kept loaded on the GPU.

POST /stt?lang=tr   body: any audio the browser records (webm/opus, ogg, wav)  ->  {"text", "ms", "language"}
GET  /health                                                                     ->  {"ok", "model", "device"}

Nothing leaves the machine. Same stack the owner measured in sesli-sohbet-yerel (large-v3-turbo, int8_float16).
"""
import ctypes
import glob
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# ctranslate2 dlopens CUDA 12 libraries; the pip wheels ship them outside the loader path, so load them first.
for pattern in ("nvidia/cublas/lib/libcublas*.so.12", "nvidia/cudnn/lib/libcudnn*.so.9"):
    for site in sys.path:
        for lib in sorted(glob.glob(os.path.join(site, pattern))):
            try:
                ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

MODEL = os.environ.get("STT_MODEL", "large-v3-turbo")
PORT = int(os.environ.get("STT_PORT", "8797"))
MAX_BYTES = 25 * 1024 * 1024
LANGS = {"tr", "en", "fr", "de", "nl"}


def load():
    try:
        return WhisperModel(MODEL, device="cuda", compute_type="int8_float16"), "cuda"
    except Exception as exc:  # no GPU or CUDA libraries: still work, slower
        print(f"stt: GPU unavailable ({exc}); using CPU", file=sys.stderr, flush=True)
        return WhisperModel(MODEL, device="cpu", compute_type="int8"), "cpu"


model, device = load()
lock = threading.Lock()


def decode(audio: bytes) -> np.ndarray:
    """Any container/codec the browser sends -> 16 kHz mono float32, via the system ffmpeg."""
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                         input=audio, capture_output=True, check=True, timeout=60).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0


def transcribe(audio: bytes, lang: str | None) -> dict:
    started = time.monotonic()
    samples = decode(audio)
    with lock:
        segments, info = model.transcribe(samples, language=lang, beam_size=5, vad_filter=True,
                                          condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "language": info.language, "ms": round((time.monotonic() - started) * 1000)}


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self.reply(200, {"ok": True, "model": MODEL, "device": device})
        self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/stt":
            return self.reply(404, {"error": "not found"})
        size = int(self.headers.get("content-length") or 0)
        if not 0 < size <= MAX_BYTES:
            return self.reply(413 if size else 400, {"error": "audio body required (max 25 MB)"})
        lang = parse_qs(url.query).get("lang", [""])[0] or None
        if lang and lang not in LANGS:
            lang = None  # unknown: let Whisper detect it
        try:
            self.reply(200, transcribe(self.rfile.read(size), lang))
        except Exception as exc:  # undecodable audio must not kill the service
            self.reply(422, {"error": f"could not transcribe: {exc}"[:300]})

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    print(f"stt: {MODEL} on {device}, http://127.0.0.1:{PORT}", file=sys.stderr, flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
