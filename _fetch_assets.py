# -*- coding: utf-8 -*-
"""下载 MediaPipe 离线版所需全部资源。

校验策略：以服务器返回的 Content-Length 为准，不靠猜大小。
（历史教训：拿估算的字节数当门槛，遇到实际文件更小会陷入无限重试。）
"""
import os
import ssl
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))

# (相对路径, URL, 硬下限字节数)  —— 硬下限只用于识别明显的半截文件
WASM_MIN = 6 * 1024 * 1024
ASSETS = [
    ("vendor/vision_bundle.js",
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js", 500 * 1024),
    ("vendor/wasm/vision_wasm_internal.js",
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/vision_wasm_internal.js", 100 * 1024),
    ("vendor/wasm/vision_wasm_internal.wasm",
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/vision_wasm_internal.wasm", WASM_MIN),
    ("vendor/wasm/vision_wasm_nosimd_internal.js",
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/vision_wasm_nosimd_internal.js", 100 * 1024),
    ("vendor/wasm/vision_wasm_nosimd_internal.wasm",
     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/vision_wasm_nosimd_internal.wasm", WASM_MIN),

    ("models/face_landmarker.task",
     "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", 2 * 1024 * 1024),
    ("models/hand_landmarker.task",
     "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", 4 * 1024 * 1024),
    ("models/pose_landmarker_lite.task",
     "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", 3 * 1024 * 1024),
    ("models/efficientdet_lite0.tflite",
     "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", 3 * 1024 * 1024),
    ("models/gesture_recognizer.task",
     "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", 5 * 1024 * 1024),
    ("models/selfie_segmenter.tflite",
     "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite", 150 * 1024),
]

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(rel, url, minhard):
    dst = os.path.join(ROOT, rel)
    if os.path.exists(dst) and os.path.getsize(dst) >= minhard:
        print("[skip] %-44s %d" % (rel, os.path.getsize(dst)), flush=True)
        return True
    os.makedirs(os.path.dirname(dst), exist_ok=True)

    for attempt in range(1, 6):
        expect = 0
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                expect = int(r.headers.get("Content-Length") or 0)
                got = 0
                with open(dst, "wb") as f:
                    while True:
                        chunk = r.read(262144)
                        if not chunk:
                            break
                        f.write(chunk)
                        got += len(chunk)
            size = os.path.getsize(dst)
            if expect and size != expect:
                print("[bad]  %-44s %d != %d, retry" % (rel, size, expect), flush=True)
            elif size < minhard:
                print("[bad]  %-44s %d < %d, retry" % (rel, size, minhard), flush=True)
            else:
                print("[ok]   %-44s %d bytes" % (rel, size), flush=True)
                return True
        except Exception as e:
            print("[err]  %-44s %s (attempt %d)" % (rel, type(e).__name__, attempt), flush=True)
        time.sleep(2)
    return False


def main():
    bad = []
    for rel, url, minhard in ASSETS:
        if not fetch(rel, url, minhard):
            bad.append(rel)
    if bad:
        print("\nFAILED: " + ", ".join(bad), flush=True)
        sys.exit(1)
    total = sum(os.path.getsize(os.path.join(ROOT, r)) for r, _, _ in ASSETS)
    print("\nALL OK, total %.1f MB" % (total / 1048576.0), flush=True)


if __name__ == "__main__":
    main()
