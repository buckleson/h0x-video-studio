"""Offline stand-in for the edge_tts package, used by engine.test.mjs through PYTHONPATH.

Each line becomes silence (0.25 s per word, made with ffmpeg) plus one WordBoundary per word,
so the real tts.py runs end to end without the network. Every spoken line is appended to
$FAKE_TTS_LOG, so tests can check which lines were (re)spoken.
"""
import os, subprocess, tempfile

__version__ = "fake"
WORD = 0.25


class Communicate:
    def __init__(self, text, voice, rate="+0%", boundary=None, **_):
        self.text = text
        self.words = text.split()

    async def stream(self):
        log = os.environ.get("FAKE_TTS_LOG")
        if log:
            with open(log, "a", encoding="utf-8") as f:
                f.write(self.text + "\n")
        fd, tmp = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        try:
            subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                                   "-t", str(WORD * len(self.words)), "-c:a", "libmp3lame", "-b:a", "48k", tmp])
            with open(tmp, "rb") as f:
                yield {"type": "audio", "data": f.read()}
        finally:
            os.remove(tmp)
        for i, w in enumerate(self.words):
            yield {"type": "WordBoundary", "offset": int(i * WORD * 1e7), "duration": int(0.2 * 1e7), "text": w.strip(".,!?")}
