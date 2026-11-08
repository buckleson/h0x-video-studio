"""Voice-over + timings for an explainer.

usage: python tts.py <script.json> <outDir> [voice]

script.json: {"voice": "...", "rate": "+0%", "gap": 0.35, "lines": [{"id": "s1", "text": "...", "pause": 0.6}]}
Writes <outDir>/voice.mp3, timings.json ({total, lines:[{id,start,end,text,cues:[{start,end,text}]}]}) and subs.srt.
Cues are subtitle chunks (<= 2 lines of ~42 chars) timed from the voice's word boundaries.
"""
import asyncio, json, os, re, subprocess, sys

import edge_tts

MAX_CUE = 84  # characters per cue (two lines of ~42)


def ffprobe_duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


async def speak(text, voice, rate, mp3, tries=6):
    for attempt in range(tries):
        try:
            return await _speak(text, voice, rate, mp3)
        except Exception as e:  # the free endpoint rate-limits bursts (HTTP 429)
            if attempt == tries - 1:
                raise
            wait = 5 * 2 ** attempt
            print(f"  tts retry in {wait}s: {str(e)[:60]}", flush=True)
            await asyncio.sleep(wait)


async def _speak(text, voice, rate, mp3):
    words = []
    com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7, "text": chunk["text"]})
    return words


def chunk_cues(text, words, offset):
    """Split a line into subtitle cues on word boundaries, preferring sentence/comma breaks."""
    cues, cur = [], []
    for w in words:
        cur.append(w)
        joined = " ".join(x["text"] for x in cur)
        punct = w["text"][-1:] in ".!?;:," if w["text"] else False
        if len(joined) >= MAX_CUE - 12 or (punct and len(joined) >= 28):
            cues.append(cur)
            cur = []
    if cur:
        if cues and len(" ".join(x["text"] for x in cur)) < 14:
            cues[-1] += cur
        else:
            cues.append(cur)
    # Map each cue back onto the source text by walking EVERY word in order, so a word that
    # repeats earlier in the line (e.g. "of") can never cut the cue short.
    out, pos = [], 0
    for c in cues:
        s, e = -1, pos
        for w in c:
            i = text.find(w["text"], e)
            if i < 0:
                continue
            if s < 0:
                s = i
            e = i + len(w["text"])
        if s < 0:
            seg = " ".join(x["text"] for x in c)
        else:
            while e < len(text) and text[e] in ".,!?;:'\")—-":
                e += 1
            seg = text[s:e].strip()
            pos = e
        out.append({"start": round(offset + c[0]["start"], 3), "end": round(offset + c[-1]["end"], 3), "text": seg})
    # Whatever is left after the last cue (unmatched words) joins the final cue.
    tail = text[pos:].strip()
    if out and tail:
        out[-1]["text"] = (out[-1]["text"] + " " + tail).strip()
    return out


def display(text, mapping):
    """Spoken spelling -> on-screen spelling (e.g. "Hyper-Ox" -> "Hyper 0X")."""
    for spoken, shown in mapping.items():
        text = re.sub(r"(?<![\w-])" + re.escape(spoken) + r"(?![\w-])", shown, text)
    return text


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


async def main():
    script = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else script.get("voice", "en-US-AvaMultilingualNeural")
    rate, gap = script.get("rate", "+0%"), script.get("gap", 0.35)
    lead = script.get("lead", 0.8)
    os.makedirs(f"{out}/lines", exist_ok=True)
    t, lines, parts = lead, [], []
    silence = f"{out}/lines/silence.mp3"
    for i, line in enumerate(script["lines"]):
        mp3 = f"{out}/lines/{i:02}-{line['id']}.mp3"
        cache = f"{out}/lines/{i:02}-{line['id']}.words.json"
        key = {"text": line["text"], "voice": voice, "rate": rate}
        cached = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) and os.path.exists(mp3) else None
        if cached and cached.get("key") == key:
            words = cached["words"]  # same text/voice/rate: reuse audio, so timings stay identical
        else:
            words = await speak(line["text"], voice, rate, mp3)
            json.dump({"key": key, "words": words}, open(cache, "w", encoding="utf-8"))
        # Never split a multi-word display phrase (e.g. "pavii dot tech") across two subtitles.
        for phrase in [k for k in script.get("display", {}) if " " in k]:
            n = len(phrase.split())
            i = 0
            while i + n <= len(words):
                if " ".join(w["text"] for w in words[i:i + n]).lower() == phrase.lower():
                    words[i:i + n] = [{"start": words[i]["start"], "end": words[i + n - 1]["end"], "text": phrase}]
                i += 1
        dur = ffprobe_duration(mp3)
        pause = line.get("pause", gap)
        lines.append({"id": line["id"], "start": round(t, 3), "end": round(t + dur, 3), "text": line["text"],
                      "cues": chunk_cues(line["text"], words, t),
                      "words": [{"start": round(t + w["start"], 3), "end": round(t + w["end"], 3), "text": w["text"]} for w in words]})
        parts.append((mp3, t))
        t += dur + pause
    total = round(t + script.get("tail", 1.5), 3)
    # Mix every line at its exact start time onto one track.
    args = ["ffmpeg", "-v", "error", "-y"]
    for mp3, _ in parts:
        args += ["-i", mp3]
    delays = "".join(f"[{i}:a]adelay={int(st * 1000)}:all=1[a{i}];" for i, (_, st) in enumerate(parts))
    mix = "".join(f"[a{i}]" for i in range(len(parts)))
    args += ["-filter_complex", f"{delays}{mix}amix=inputs={len(parts)}:normalize=0,apad,atrim=0:{total}[out]",
             "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", f"{out}/voice.mp3"]
    subprocess.check_call(args)
    mapping = script.get("display", {})
    for line in lines:
        line["text"] = display(line["text"], mapping)
        for c in line["cues"]:
            c["text"] = display(c["text"], mapping)
    data = {"total": total, "lines": lines}
    json.dump(data, open(f"{out}/timings.json", "w", encoding="utf-8"), indent=1)
    # Scenes load timings with a <script> tag (file:// pages cannot fetch JSON).
    open(f"{out}/timings.js", "w", encoding="utf-8").write("window.TIMINGS = " + json.dumps(data) + ";\n")
    n = 0
    with open(f"{out}/subs.srt", "w", encoding="utf-8") as f:
        for line in lines:
            for c in line["cues"]:
                n += 1
                f.write(f"{n}\n{srt_time(c['start'])} --> {srt_time(c['end'] + 0.15)}\n{c['text']}\n\n")
    print(f"voice ok: {len(lines)} lines, {total:.1f}s, {n} cues")


asyncio.run(main())
