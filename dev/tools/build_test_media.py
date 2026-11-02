"""產生 MiniMax 集的測試素材（彩排用，正式拍攝換成實拍畫面）。

輸出（都在 video/minimax/素材/ 底下）：
  workspace/projects/測試/assets/camera/test-raw.mp4   macOS 語音合成的測試口播，刻意放 NG 重講、低音量自言自語、長停頓
  workspace/projects/測試/場地照-測試.jpg   固定機位示意圖（講者剪影在右側）
  workspace/projects/測試/講稿.md   從 projects/example/講稿.md 複製（測試口播照這份念）
  （測試專案獨立一個資料夾，不跟範例專案混在一起；projects/ 底下除了範例都在 .gitignore 裡，不會被發布）
  驗收/答案卷.md                  每段的原始時間碼與「應保留／應剪掉」，用來驗收 AI 初剪
                                  （放在 workspace 外面，避免 AI 讀到答案）

用法（在 repo 根目錄）：
  uv run --with pillow python video/minimax/素材/tools/build_test_media.py
真人實拍版（畫面換成作者實拍，音軌、長度、時間碼不變；不給 --footage 就畫剪影）：
  uv run --with pillow python video/minimax/素材/tools/build_test_media.py \\
    --footage /Volumes/video/esim/錄影/V_20261005_182254_ES0.mp4 --footage-start 60
  （esim 錄影的 4K／60fps 固定機位，作者坐在畫面中間；60 秒起的 108 秒動作最小。
    場地照改成新影片 5 秒處的截圖。）
相依：macOS say（Meijia 台灣中文語音）、ffmpeg／ffprobe。
"""

import argparse
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 兩種擺法：agent-skills 的 video/minimax/素材/tools/（工作區在 ../workspace）、獨立 repo 的 dev/tools/（工作區就是 ../..）
_HERE = Path(__file__).resolve().parent
if (_HERE.parent / "workspace" / "shared" / "template").is_dir():
    ROOT = _HERE.parent  # video/minimax/素材
    WORKSPACE = ROOT / "workspace"
else:
    WORKSPACE = _HERE.parents[1]  # auto-edit-workspace
    ROOT = WORKSPACE.parent
OUT_RAW = WORKSPACE / "projects" / "測試" / "assets" / "camera"
OUT_REF = WORKSPACE / "projects" / "測試"
SCRIPT_SRC = WORKSPACE / "projects" / "example" / "講稿.md"
OUT_KEY = ROOT / "驗收" if WORKSPACE.name == "workspace" else ROOT / f"{WORKSPACE.name}-驗收"  # 答案放在工作區外面，AI 讀不到
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
VOICE = "Meijia"
RATE = "185"
SR = 48000
W, H = 1920, 1080

# kind: speech（正常）／aside（低音量自言自語）／gap（靜音秒數）
# keep: 初剪後應保留 True、應剪掉 False；gap 的 keep 表示「縮短成正常換氣」
SEGMENTS = [
    ("gap", 1.2, False, "開機後的空白"),
    ("speech", "嗨！大家好，我是鼎淵，歡迎來到工程師下班有約。", True, ""),
    ("gap", 0.4, True, ""),
    ("speech", "做任何事情，有明確、而且適合自己的 SOP，才會有效率。", True, ""),
    ("gap", 0.4, True, ""),
    ("speech", "這支影片想跟大家分享，我是怎麼建立自己的影片工作流。", True, ""),
    ("gap", 0.5, True, ""),
    ("speech", "首先我會建立一個場地設定的檔案，提醒我桌子、椅子要放在", False, "NG①第一次（講錯、沒講完）"),
    ("gap", 0.3, False, ""),
    ("aside", "啊不對，等一下，我重講一次。", False, "NG①低音量自言自語"),
    ("gap", 2.5, False, "NG① 重講前的停頓"),
    ("speech", "首先，我會建立一份場地設定的文件，", True, "NG①重講（保留這次）"),
    ("gap", 0.3, True, ""),
    ("speech", "提醒我桌子、椅子、電腦、提詞器、攝影機，要放在哪裡。", True, ""),
    ("gap", 0.4, True, ""),
    ("speech", "千萬不要小看這份紀錄。", True, ""),
    ("gap", 0.3, True, ""),
    ("speech", "少了這份文件，每次場佈，你可能都要花半小時以上去喬角度。", True, ""),
    ("gap", 4.0, False, "長停頓（應縮短）"),
    ("speech", "影片拍完之後，我會先做初剪，把多餘的部分移除。", True, ""),
    ("gap", 0.4, True, ""),
    ("speech", "接著用 Whisper，把聲音轉成 SRT 字幕檔。", True, "專有名詞陷阱：Whisper、SRT"),
    ("gap", 0.4, True, ""),
    ("speech", "然後請 AI 檢查有沒有錯字，或是專有名詞沒有辨識出來，", True, ""),
    ("gap", 0.3, True, ""),
    ("speech", "比如 MiniMax Code、HyperFrames、Agent Skills 這些英文名詞。", True, "專有名詞陷阱"),
    ("gap", 0.5, True, ""),
    ("speech", "等 AI 處理完之後，我會人工，嗯，人工再", False, "NG②第一次（卡詞）"),
    ("gap", 1.8, False, "NG② 重講前的停頓"),
    ("speech", "等 AI 處理完之後，我會人工再看過一次，確保字幕是符合預期的。", True, "NG②重講（保留這次）"),
    ("gap", 0.4, True, ""),
    ("speech", "最後，我會把字幕交給 AI，請他標出適合放字卡和音效的位置。", True, ""),
    ("gap", 0.3, True, ""),
    ("speech", "這樣剪輯的時候，就能照著時間點批量處理。", True, ""),
    ("gap", 3.0, False, "長停頓（應縮短）"),
    ("speech", "這套流程能夠成立，靠的不是哪一個工具，", True, ""),
    ("gap", 0.3, True, ""),
    ("speech", "而是把每一次踩過的坑，都寫成下一次可以直接用的文件。", True, ""),
    ("gap", 0.6, True, ""),
    ("speech", "我是鼎淵，我們下班有約！大家掰掰！", True, "人名陷阱：鼎淵"),
    ("gap", 1.0, False, "結尾空白"),
]

# 工作區音效 workspace/shared/sfx/ 改由 tools/make_sfx.py 產生（CC0 素材），這支不再處理音效


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def to_wav(src, dst, gain=1.0):
    run(["ffmpeg", "-y", "-i", str(src), "-af", f"volume={gain}", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(dst)])


def silence(dst, sec):
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", f"{sec}", "-c:a", "pcm_s16le", str(dst)])


def fmt(sec):
    m, s = divmod(sec, 60)
    return f"{int(m):02d}:{s:06.3f}"


def build_audio(tmp):
    parts, timeline, t = [], [], 0.0
    for i, (kind, val, keep, note) in enumerate(SEGMENTS):
        wav = tmp / f"seg{i:02d}.wav"
        if kind == "gap":
            silence(wav, val)
        else:
            aiff = tmp / f"seg{i:02d}.aiff"
            run(["say", "-v", VOICE, "-r", RATE, "-o", str(aiff), val])
            to_wav(aiff, wav, gain=0.06 if kind == "aside" else 1.0)
        d = duration(wav)
        timeline.append({"kind": kind, "text": val if kind != "gap" else "", "start": t, "end": t + d, "keep": keep, "note": note})
        parts.append(wav)
        t += d
    listing = tmp / "concat.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    full = tmp / "full.wav"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c:a", "pcm_s16le", str(full)])
    return full, timeline, t


def draw_stage(label=True, timecode=None):
    img = Image.new("RGB", (W, H))
    px = ImageDraw.Draw(img)
    # 牆面：深藍黑漸層
    for y in range(H):
        k = y / H
        px.line([(0, y), (W, y)], fill=(int(14 + 12 * k), int(20 + 14 * k), int(36 + 18 * k)))
    # 書櫃示意（左側），讓畫面有可辨識的背景物件
    for col in range(3):
        x0 = 120 + col * 170
        px.rectangle([x0, 180, x0 + 150, 760], outline=(70, 62, 52), width=6)
        for shelf in range(4):
            y = 180 + shelf * 145
            px.line([(x0, y), (x0 + 150, y)], fill=(70, 62, 52), width=6)
    # 桌面
    px.rectangle([0, 860, W, H], fill=(48, 38, 30))
    # 講者剪影（右側三分之一）
    cx = 1300
    px.ellipse([cx - 110, 300, cx + 110, 540], fill=(150, 156, 170))
    px.rounded_rectangle([cx - 300, 560, cx + 300, 980], radius=150, fill=(150, 156, 170))
    if label:
        f = ImageFont.truetype(FONT, 34)
        px.text((60, 1000), "測試用場地示意圖｜正式拍攝請換成實拍畫面", font=f, fill=(255, 212, 0))
    if timecode is not None:
        f = ImageFont.truetype(FONT, 44)
        px.rectangle([40, 36, 520, 110], fill=(0, 0, 0))
        px.text((60, 46), f"原始時間 {timecode}", font=f, fill=(255, 255, 255))
    return img


def build_video(tmp, full_wav, total):
    frames = tmp / "frames"
    frames.mkdir()
    n = math.ceil(total) + 1
    for i in range(n):
        m, s = divmod(i, 60)
        draw_stage(timecode=f"{m:02d}:{s:02d}").save(frames / f"{i:04d}.png")
    OUT_RAW.mkdir(parents=True, exist_ok=True)
    OUT_REF.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-framerate", "1", "-i", str(frames / "%04d.png"), "-i", str(full_wav),
        "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", "-crf", "23",
        "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.3f}", str(OUT_RAW / "test-raw.mp4"),
    ])
    draw_stage(label=True).save(OUT_REF / "場地照-測試.jpg", quality=92)


def draw_timecode(timecode):
    # 跟 draw_stage 的時間碼同樣式（黑底方塊＋白字）；本機 ffmpeg 沒有 drawtext，改用小圖 overlay
    img = Image.new("RGB", (481, 75), (0, 0, 0))
    ImageDraw.Draw(img).text((20, 10), f"原始時間 {timecode}", font=ImageFont.truetype(FONT, 44), fill=(255, 255, 255))
    return img


def build_video_footage(tmp, full_wav, total, footage, start):
    tc = tmp / "tc"
    tc.mkdir()
    for i in range(math.ceil(total) + 1):
        m, s = divmod(i, 60)
        draw_timecode(f"{m:02d}:{s:02d}").save(tc / f"{i:04d}.png")
    OUT_RAW.mkdir(parents=True, exist_ok=True)
    OUT_REF.mkdir(parents=True, exist_ok=True)
    out = OUT_RAW / "test-raw.mp4"
    run([
        "ffmpeg", "-y", "-ss", f"{start}", "-t", f"{total:.3f}", "-i", str(footage),
        "-i", str(full_wav), "-framerate", "1", "-i", str(tc / "%04d.png"),
        "-filter_complex",
        "[0:v]fps=30,scale=1920:1080:flags=lanczos:out_range=tv,setpts=PTS-STARTPTS[v];[v][2:v]overlay=40:36:eof_action=repeat,format=yuv420p[out]",
        "-map", "[out]", "-map", "1:a", "-c:v", "libx264", "-crf", "23", "-preset", "medium",
        "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.3f}", str(out),
    ])
    frame = tmp / "ref.png"
    run(["ffmpeg", "-y", "-ss", "5", "-i", str(out), "-frames:v", "1", str(frame)])
    Image.open(frame).convert("RGB").save(OUT_REF / "場地照-測試.jpg", quality=90)


def write_answer_key(timeline, total):
    rows = []
    kept = 0.0
    for seg in timeline:
        d = seg["end"] - seg["start"]
        if seg["kind"] == "gap":
            if seg["keep"]:
                kept += d
                continue
            verdict = "縮短／剪掉"
            text = f"（靜音 {d:.1f} 秒）"
        else:
            verdict = "保留" if seg["keep"] else "剪掉"
            text = seg["text"] + ("（低音量）" if seg["kind"] == "aside" else "")
            if seg["keep"]:
                kept += d
        rows.append(f"| {fmt(seg['start'])} | {fmt(seg['end'])} | {text} | {verdict} | {seg['note']} |")
    md = [
        "# 答案卷：test-raw.mp4 的初剪驗收",
        "",
        "> 由 `tools/build_test_media.py` 自動產生，時間以實際合成結果為準。用來檢查 AI 的剪輯清單有沒有剪對：",
        "> 兩段 NG 只留後面那次、低音量的自言自語整段剪掉、超過 1 秒的停頓縮短。",
        "",
        f"- 原始長度：{total:.1f} 秒",
        f"- 理想初剪長度：約 {kept:.1f} 秒（只算應保留的語句與正常換氣；AI 留 0.2–0.4 秒呼吸空間，會略長幾秒屬正常）",
        "",
        "| 開始 | 結束 | 內容 | 預期處理 | 說明 |",
        "|---|---|---|---|---|",
        *rows,
        "",
        "正常換氣（0.3–0.6 秒）不列出，應保留。",
        "",
        "## 字幕校正要抓到的陷阱",
        "",
        "- 人名：鼎淵（Whisper 常聽成「鼎源」「頂淵」）",
        "- 英文專有名詞：SOP、Whisper、SRT、AI、MiniMax Code、HyperFrames、Agent Skills（語音合成會用中文腔念，轉錄很容易變成中文諧音）",
        "- 以 `workspace/projects/測試/講稿.md`（＝示範口播的講稿）為準校正，中英文之間加半形空格",
        "",
        "## 低音量段的判斷",
        "",
        "- 自言自語那段刻意壓低約 24 dB：平均音量約 -40 dB，正常語句約 -15 dB",
        "- 只用 `silencedetect=noise=-35dB` 抓不到它（它不是靜音），要用「比正常講話低 15 dB 以上」這種相對音量規則",
        "",
    ]
    OUT_KEY.mkdir(parents=True, exist_ok=True)
    (OUT_KEY / "答案卷.md").write_text("\n".join(md), encoding="utf-8")
    (OUT_KEY / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--footage", type=Path, help="真人實拍檔；有給就用它當畫面，沒給就畫剪影")
    ap.add_argument("--footage-start", type=float, default=60.0, help="實拍檔從第幾秒開始截（預設 60）")
    args = ap.parse_args()
    for tool in ("say", "ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"缺少 {tool}")
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        full_wav, timeline, total = build_audio(tmp)
        if args.footage:
            build_video_footage(tmp, full_wav, total, args.footage, args.footage_start)
        else:
            build_video(tmp, full_wav, total)
        write_answer_key(timeline, total)
    for d in ("voice", "screen", "images"):
        (OUT_REF / "assets" / d).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SCRIPT_SRC, OUT_REF / "講稿.md")
    print(f"完成：{OUT_RAW / 'test-raw.mp4'}（{total:.1f} 秒）")


if __name__ == "__main__":
    main()
