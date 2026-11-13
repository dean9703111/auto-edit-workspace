"""已由 dev/tools/make-sfx.mjs 取代；只保留當凍結 8 顆（pop tick swipe whoosh flip type glitch riser）的處理紀錄。
重跑會把新音效蓋回舊檔、把 sources.json 縮回 12 筆，所以直接執行會停下來（specs/005-sfx/spec.md FR-038）。

（以下是退役前的說明）產生工作區 shared/sfx/ 的 12 顆音效：從 CC0 素材（Kenney、OpenGameArt）挑選、剪輯、統一響度。

輸出（都在 video/minimax/素材/ 底下）：
  workspace/shared/sfx/<12 個>.wav     48 kHz、立體聲、pcm_s16le
  workspace/shared/sfx/sources.json    每顆的來源、下載網址、sha256、授權、處理鏈、峰值秒數、響度、建議音量
  workspace/shared/sfx/README.md       給觀眾看的音效清單
  sfx-candidates/               （加 --candidates）每個槽的全部候選＋試聽頁 index.html

用法（在 repo 根目錄）：
  uv run --with numpy,scipy,soundfile python3 video/minimax/素材/tools/make_sfx.py
  uv run --with numpy,scipy,soundfile python3 video/minimax/素材/tools/make_sfx.py --zips <已下載的資料夾> --candidates

--zips：放原始下載檔的資料夾（Kenney 是 <slug>.zip，OpenGameArt 是 oga-<頁面>__<檔名>）。
缺的檔會自動下載到這裡；沒給就用系統暫存資料夾。每個檔都核對 sha256，不符就停下來。
原始檔只讀進記憶體解碼，不解壓到磁碟、不執行任何內容。

換音效：試聽 sfx-candidates/index.html 後，改下面 CHOICE 的候選編號再跑一次。
"""

import argparse
import hashlib
import html
import http.cookiejar
import io
import json
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from math import gcd
from pathlib import Path

RETIRED = "✖ make_sfx.py 已由 dev/tools/make-sfx.mjs 取代；只保留當凍結 8 顆的處理紀錄 → 改跑 node dev/tools/make-sfx.mjs --help"
if __name__ == "__main__":
    sys.exit(RETIRED)  # 放在 numpy 等第三方 import 之前：沒裝 numpy 的機器也印得出這句

import numpy as np
import soundfile as sf
from scipy.signal import lfilter, resample_poly

# 兩種擺法：agent-skills 的 video/minimax/素材/tools/（工作區在 ../workspace）、獨立 repo 的 dev/tools/（工作區就是 ../..）
_HERE = Path(__file__).resolve().parent
if (_HERE.parent / "workspace" / "shared" / "template").is_dir():
    ROOT = _HERE.parent  # video/minimax/素材
    OUT_SFX = ROOT / "workspace" / "shared" / "sfx"
    OUT_CAND = ROOT / "sfx-candidates"
else:
    WS = _HERE.parents[1]  # auto-edit-workspace
    OUT_SFX = WS / "shared" / "sfx"
    OUT_CAND = WS.parent / f"{WS.name}-sfx-candidates"  # 候選音效不進工作區
SR = 48000
TP_CEIL = -1.2  # true peak 上限（dBTP），比 −1 再留 0.2 dB 給量測差異
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
CC0 = ("CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/")

# 試聽後要換，就改這裡（值是下面 CANDIDATES 的 id）
CHOICE = {
    "pop": "pop-a",
    "tick": "tick-a",
    "swipe": "swipe-a",
    "whoosh": "whoosh-a",
    "ding": "ding-a",
    "success": "success-a",
    "alert": "alert-a",
    "impact": "impact-a",
    "flip": "flip-a",
    "type": "type-a",
    "glitch": "glitch-a",
    "riser": "riser-a",
}

# limit：檔長上限（秒）；target：momentary max 響度（LUFS）；vol：建議 data-volume 基準
SLOTS = {
    "pop": dict(zh="輕彈 pop", use="字卡、條列、卡片揭開", limit=0.35, target=-16, vol=0.5),
    "tick": dict(zh="輕點 tick", use="條列逐條出現，每條一顆", limit=0.15, target=-20, vol=0.3),
    "swipe": dict(zh="短 swoosh", use="面板、角標滑入", limit=0.6, target=-16, vol=0.45),
    "whoosh": dict(zh="轉場 whoosh", use="章節轉場、全畫面幕", limit=1.0, target=-16, vol=0.5),
    "ding": dict(zh="單音鈴", use="講重點、答案揭曉", limit=1.2, target=-16, vol=0.4),
    "success": dict(zh="完成音", use="好結果、完成", limit=1.2, target=-16, vol=0.45),
    "alert": dict(zh="錯誤提醒", use="踩雷、警告", limit=0.6, target=-16, vol=0.4),
    "impact": dict(zh="悶重落地", use="字卡動態的印章、爆發", limit=0.8, target=-16, vol=0.5),
    "flip": dict(zh="翻牌", use="卡片翻面", limit=0.4, target=-16, vol=0.4),
    "type": dict(zh="鍵盤連打", use="打字機動態起手", limit=0.7, target=-20, vol=0.3),
    "glitch": dict(zh="數位故障", use="故障字效", limit=0.6, target=-16, vol=0.35),
    "riser": dict(zh="上升張力", use="揭曉前的鋪墊（結尾對齊畫面事件）", limit=1.5, target=-16, vol=0.45),
}

# 下載單位：Kenney 一包一個 zip；OpenGameArt 一頁可能有多個檔。page 的授權欄都已確認是 CC0。
SOURCES = {
    "kenney-interface": dict(kenney="interface-sounds", pack="Kenney Interface Sounds 1.0", author="Kenney",
                             files={"interface-sounds.zip": "f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232"}),
    "kenney-ui": dict(kenney="ui-audio", pack="Kenney UI Audio", author="Kenney",
                      files={"ui-audio.zip": "946fc23a63d535d693eb31b2eabb80c8c28d6351e2186b344ceb71b2cb1d5eb6"}),
    "kenney-impact": dict(kenney="impact-sounds", pack="Kenney Impact Sounds 1.0", author="Kenney",
                          files={"impact-sounds.zip": "029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8"}),
    "kenney-jingles": dict(kenney="music-jingles", pack="Kenney Music Jingles", author="Kenney",
                           files={"music-jingles.zip": "b729ba57959bd58793d2c5cafa348aaf2655d354f3da35ec4729e03ec77197b8"}),
    "kenney-rpg": dict(kenney="rpg-audio", pack="Kenney RPG Audio", author="Kenney",
                       files={"rpg-audio.zip": "6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b"}),
    "kenney-casino": dict(kenney="casino-audio", pack="Kenney Casino Audio 1.1", author="Kenney",
                          files={"casino-audio.zip": "f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18"}),
    "kenney-scifi": dict(kenney="sci-fi-sounds", pack="Kenney Sci-fi Sounds", author="Kenney",
                         files={"sci-fi-sounds.zip": "119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04"}),
    "oga-pop-sounds": dict(oga="pop-sounds", pack="OpenGameArt「Pop sounds」", author="cogitollc",
                           files={"pop7.ogg": "ac3147642a0d078d6a380ece05ebae519ab64eeccdaab8f24bd7829304e990e6",
                                  "pop5.ogg": "0433b2f016b2521df36a7e0dde006c0839af4fb97df7ca626f5fb7a4c4eb561e"}),
    "oga-qubodup-swosh": dict(oga="wind-hit-time-morph", pack="OpenGameArt「Wind, hit, time morph」", author="qubodup (Iwan Gabovitch)",
                              files={"qubodup-timehitwind.zip": "8ed235b84ed19a5a72c47771e33d347406e67750b2a6ba72a2f558e64cc6205e"}),
    "oga-air-move": dict(oga="air-woosh-move", pack="OpenGameArt「Air Woosh Move」", author="almitory",
                         files={"air_move.wav": "b4e7bdf9f0c3d79dd4d48a0d56a5861847256b31e97bb74b948e95d5cb2fa26e"}),
    "oga-ui-vcsl": dict(oga="ui-sound-effects-button-clicks-user-feedback-notifications",
                        pack="OpenGameArt「UI Sound Effects」", author="robin-lamb", note="取自 VCSL／VSCO 2 CE 公眾領域樂器取樣",
                        files={"ui_wav.zip": "8e4e23dd4ec501776dab1428c5f1e405b5065e296518feb04816f2892d163053"}),
    "oga-metal-impact": dict(oga="metal-impact-sounds", pack="OpenGameArt「Metal Impact Sounds」", author="bmaczero",
                             files={"bing1.wav": "d14941ce27e6b409e0cd941eaad7201d613070a4c3eb9c3627fec4cf3ae686e4",
                                    "bong1.wav": "a6558d186f2843aefa212d567963b0ad79a6f78614bcf650f519620fc1549a6d"}),
    "oga-metal-dings": dict(oga="4-metal-dingsrings", pack="OpenGameArt「4 Metal Dings/Rings」", author="starninjas",
                            files={"ding_-_starninjas.zip": "2da62025a7eb90c91a62f68b6b25a7c54e632ccb82bca9446f6eda7110a6ebe2"}),
    "oga-kalimba": dict(oga="kalimba-two-notes", pack="OpenGameArt「Kalimba two notes」", author="railkill",
                        files={"kalimba.wav": "6ab4a504576a0ed66a0a2b7a73d6407e2c916f2ae62f5b04c77d369462cdfe25"}),
    "oga-thwack": dict(oga="thwack-sounds", pack="OpenGameArt「Thwack Sounds」", author="AntumDeluge (Jordan Irwin)",
                       files={"thwack-1.0.zip": "8edb002735a01369ef4d6259573be4885f9fe32c9a9efa89dfbbb14067c8c8e5"}),
    "oga-keyboard": dict(oga="keyboard-soundpack-1-typing-and-single-keystrokes", pack="OpenGameArt「Keyboard Soundpack 1」",
                         author="unicaegames",
                         files={"unicae_games_keyboard_soundpack_1_0.zip": "935eae2fa5c3742eacdd38c4ea0e9047f3887faa0701996498492c256db1b351"}),
    "oga-typewriter": dict(oga="typewriter-sounds", pack="OpenGameArt「Typewriter sounds」", author="cassie-orbitgames",
                           files={"typewriter2.wav": "b40c17fe45c9e3a6ad8a617f7831da5ccb3c8baab1fa0eb368f8ba3ade52c8a4"}),
}

# 參照：(SOURCES 的 key, 下載檔名, zip 內路徑或 None)
KI = lambda m: ("kenney-interface", "interface-sounds.zip", f"Audio/{m}")  # noqa: E731
KU = lambda m: ("kenney-ui", "ui-audio.zip", f"Audio/{m}")  # noqa: E731
KM = lambda m: ("kenney-impact", "impact-sounds.zip", f"Audio/{m}")  # noqa: E731
KR = lambda m: ("kenney-rpg", "rpg-audio.zip", f"Audio/{m}")  # noqa: E731
KC = lambda m: ("kenney-casino", "casino-audio.zip", f"Audio/{m}")  # noqa: E731
KS = lambda m: ("kenney-scifi", "sci-fi-sounds.zip", f"Audio/{m}")  # noqa: E731
SW = lambda m: ("oga-qubodup-swosh", "qubodup-timehitwind.zip", m)  # noqa: E731
VC = lambda m: ("oga-ui-vcsl", "ui_wav.zip", f"ui_wav/{m}")  # noqa: E731
KB = lambda m: ("oga-keyboard", "unicae_games_keyboard_soundpack_1_0.zip", m)  # noqa: E731

# 每個槽 ≥3 個候選。like＝聽起來像（給 README），desc＝挑選依據（給試聽頁）。
CANDIDATES = {
    "pop": [
        dict(id="pop-a", src=[("oga-pop-sounds", "pop7.ogg", None)], like="短促圓潤的「啵」，尾音往上揚",
             desc="iPhone 實錄的 pop 聲：0.14 s、音高約 470→1060 Hz 上揚、能量集中在 150 Hz–1 kHz，短而圓，不刺耳"),
        dict(id="pop-b", src=[("oga-pop-sounds", "pop5.ogg", None)], like="短促的「啵」",
             desc="同一組實錄，0.16 s，起音比 a 稍軟（約 310→1070 Hz）"),
        dict(id="pop-c", src=[KI("drop_004.ogg")], like="水滴「啵」往上滑",
             desc="Kenney 設計音：純音 600→1230 Hz 上滑、0.29 s，比較像 UI 音、偏電子"),
        dict(id="pop-d", src=[KI("drop_002.ogg")], like="短促的「啵」",
             desc="Kenney 設計音：740–850 Hz 短 bloop、0.19 s，乾淨但偏電子"),
    ],
    "tick": [
        dict(id="tick-a", src=[KU("switch13.ogg")], like="實體開關輕輕「嗒」一下",
             desc="實體開關錄音：30 ms、97% 能量在 4 kHz 以上，和人聲的主要頻段（150 Hz–4 kHz）錯開，疊在講話下幾乎不搶"),
        dict(id="tick-b", src=[KU("mouseclick1.ogg")], like="滑鼠點一下",
             desc="滑鼠按鍵錄音：55 ms、能量都在 4 kHz 以上，比 a 多一點按壓感"),
        dict(id="tick-c", src=[KI("tick_001.ogg")], like="極乾的「滴」",
             desc="Kenney 設計音：15 ms 噪音型 tick，質心約 5.9 kHz，最短最乾"),
        dict(id="tick-d", src=[KU("click4.ogg")], like="塑膠按鍵「喀」",
             desc="按鍵錄音：40 ms，1.6 kHz 與 5.8 kHz 兩段能量，比 a 更清楚但比較搶人聲"),
    ],
    "swipe": [
        dict(id="swipe-a", src=[SW("60009__qubodup__swosh_22.flac")], like="手快速揮過的「咻」",
             desc="竹棍在麥克風前揮過的實錄：0.32 s，主體 250–500 Hz，1–4 kHz 有空氣嘶聲（約 −20 dB），像真的揮動"),
        dict(id="swipe-b", src=[KC("card-slide-4.ogg")], like="紙牌在桌上滑過",
             desc="紙牌滑過桌面的摩擦聲：主體約 0.2 s，4–8 kHz 能量多，比較「沙」"),
        dict(id="swipe-c", src=[KI("open_003.ogg")], like="UI 面板往上刷開",
             desc="Kenney 設計音：濾波噪音 830 Hz→13 kHz 上掃、0.31 s、峰值在結尾，最像 App 面板音"),
        dict(id="swipe-d", src=[SW("qubodup-megaswosh2.wav")], like="較重的揮動「咻」",
             desc="同一支竹棍 swoosh 處理過的重版本：0.59 s，前段就到峰值"),
    ],
    "whoosh": [
        dict(id="whoosh-a", src=[SW("qubodup-slomo1.wav")], like="空氣被大力揮開的「咻——」",
             desc="同一支竹棍 swoosh 放慢的版本：0.97 s 漸強、峰值在 0.77 s 附近，空氣感厚，適合章節轉場"),
        dict(id="whoosh-b", src=[SW("qubodup-megaswosh1.wav")], like="短一點的轉場「咻」",
             desc="0.53 s，對稱的漸強漸弱，比 a 短、比較輕"),
        dict(id="whoosh-c", src=[("oga-air-move", "air_move.wav", None)], like="風壓掃過",
             desc="影片用的空氣快速移動聲，1.4 s（截到 1.0 s），125 Hz 風壓明顯"),
        dict(id="whoosh-d", build="synth_whoosh", src=[], like="合成的轉場「咻」",
             desc="程式合成：帶通粉紅噪音中心 300→3 kHz 掃頻再回落、左右聲像移動、軟尾"),
    ],
    "ding": [
        dict(id="ding-a", src=[VC("ding_deep.wav")], like="清亮的「叮——」，餘韻長",
             desc="VCSL／VSCO 公眾領域樂器取樣的敲擊單音：D7（2.35 kHz）、乾淨、餘韻超過 1 秒（截到 1.2 s 淡出）"),
        dict(id="ding-b", src=[("oga-metal-impact", "bing1.wav", None)], like="敲金屬的「叮」",
             desc="敲擊金屬的實錄：2.16 kHz 加 4／8 kHz 泛音，餘韻 0.6 s，比 a 更有敲擊感"),
        dict(id="ding-c", src=[("oga-metal-dings", "ding_-_starninjas.zip", "ding.4.ogg")], like="金屬輕響",
             desc="金屬 ding 實錄：1.9／3.1 kHz 兩個泛音、0.64 s，較雜"),
    ],
    "success": [
        dict(id="success-a", src=[KI("confirmation_002.ogg")], like="快速往上爬的「叮叮叮叮」",
             desc="四音上行（約 1.2→1.8→2.3→3.5 kHz）、0.54 s"),
        dict(id="success-b", src=[KI("confirmation_004.ogg")], like="圓潤的上行音階",
             desc="六段上行 0.66→3.3 kHz、0.49 s，比 a 圓"),
        dict(id="success-c", src=[("oga-kalimba", "kalimba.wav", None)], like="拇指琴兩音往上",
             desc="拇指琴實錄：C4→G4 兩音上行、0.9 s，溫暖，但音域和人聲重疊，較容易被講話蓋住"),
        dict(id="success-d", src=[("kenney-jingles", "music-jingles.zip", "Audio/Pizzicato jingles/jingles_PIZZI16.ogg")],
             like="弦樂撥奏兩音往上", desc="弦樂撥奏兩音上行（約 D4→A#4）、0.46 s，音域低"),
    ],
    "alert": [
        dict(id="alert-a", build="alert_double", src=[VC("dum.wav")], like="低沉的「咚、咚」往下走",
             desc="VCSL／VSCO 公眾領域樂器取樣的低音單音（約 165 Hz，泛音到 1 kHz）敲兩下：第一下升小三度、第二下原音高，間隔 0.17 s；兩個短音、下行、不刺耳"),
        dict(id="alert-b", src=[KI("error_004.ogg")], like="短促的「啵」",
             desc="Kenney 設計音：單下 0.1 s、500 Hz 為主，最短但只有一下"),
        dict(id="alert-c", src=[KI("error_006.ogg")], like="低沉的「咚」",
             desc="Kenney 設計音：0.5 s、150 Hz 為主，比較悶，手機喇叭偏小聲"),
        dict(id="alert-d", src=[KI("question_004.ogg")], like="兩音下行「嘟嚕」",
             desc="Kenney 設計音：純音 492→328 Hz 下行、0.33 s，最柔但偏電子"),
    ],
    "impact": [
        dict(id="impact-a", src=[KM("impactWood_heavy_003.ogg")], like="重物砸在木頭上的「咚」",
             desc="重擊木頭的錄音：起音 3 ms、質心約 125 Hz、250 Hz 只低 4 dB（小喇叭也聽得到）、0.31 s 就收乾淨"),
        dict(id="impact-b", src=[("oga-thwack", "thwack-1.0.zip", "PCM/thwack-05.wav")], like="悶悶的敲擊",
             desc="敲東西的實錄：60–250 Hz 為主、帶一點中頻，0.33 s"),
        dict(id="impact-c", src=[KR("bookPlace2.ogg")], like="書本拍在桌上",
             desc="書本放到桌上：中頻多（質心約 0.9 kHz），最像蓋章，但不夠「重」"),
        dict(id="impact-d", src=[KM("impactSoft_heavy_002.ogg")], like="很深的悶擊",
             desc="軟性重擊：99% 能量在 150 Hz 以下，耳機很有份量，手機喇叭幾乎聽不到"),
    ],
    "flip": [
        dict(id="flip-a", src=[KC("card-place-1.ogg")], like="紙牌「刷—啪」甩到桌上",
             desc="紙牌錄音：一小段 swish 接拍到桌面（主體 0.15 s），低頻到高頻都有，最像翻牌"),
        dict(id="flip-b", src=[KC("card-place-2.ogg")], like="彈一下紙牌",
             desc="紙牌錄音：較脆，4 kHz 以上占 42%"),
        dict(id="flip-c", src=[KC("card-place-4.ogg")], like="紙牌滑出再落下",
             desc="紙牌錄音：前段 swish 較長"),
        dict(id="flip-d", src=[KR("bookFlip3.ogg")], like="翻書頁",
             desc="翻書頁錄音：0.23 s 沙沙聲，沒有落下的「啪」"),
    ],
    "type": [
        dict(id="type-a", build="keys", like="機械鍵盤快速連打五下",
             src=[KB(f"Single Keys/keypress-{n:03d}.wav") for n in (17, 4, 6, 30, 19)],
             desc="Cherry 鍵盤、SM7B 錄的單鍵實錄（含按下與回彈），固定亂數排成 5 擊：間隔 90–130 ms、第一擊最大聲（峰值對齊畫面時落在第一擊）"),
        dict(id="type-b", src=[KB("Human Typing/human_vel-007.wav")], start=2.659, end=3.22, like="真人在鍵盤上連打五下",
             desc="同一把鍵盤的真人打字，截一段剛好 5 擊（間隔 104–116 ms），最自然；但最大聲的是第 4 擊，峰值對齊時前 3 擊會先響"),
        dict(id="type-c", src=[("oga-typewriter", "typewriter2.wav", None)], like="機械打字機「喀喀喀」",
             desc="手機錄的機械打字機 3 擊、0.66 s，高頻多"),
        dict(id="type-d", build="keys", like="UI 點擊拼成的連打",
             src=[KU("click4.ogg"), KU("click5.ogg"), KI("click_003.ogg"), KU("click4.ogg"), KU("click5.ogg")],
             desc="Kenney UI click 三種音色拼 5 擊（原規格的做法），最不像鍵盤"),
    ],
    "glitch": [
        dict(id="glitch-a", build="glitch_stutter", src=[KS("computerNoise_002.ogg")], like="數位訊號卡住「嗞嗞—嗞」",
             desc="電腦雜訊剪成 stutter：60 ms 段接兩次 30 ms 重複、斷開、3 次 22 ms 快閃、再拉一段 80 ms 收尾；其中兩段降取樣，數位感更重"),
        dict(id="glitch-b", src=[KS("computerNoise_000.ogg")], start=1.2, end=1.55, like="連續的電腦資料聲",
             desc="同一包的電腦雜訊直接截 0.35 s，沒有斷點，比較像背景"),
        dict(id="glitch-c", build="glitch_clicks", src=[KI(f"glitch_00{n}.ogg") for n in (1, 2, 3, 4)], like="一串數位爆音",
             desc="Kenney 四顆 10–30 ms 的數位爆音排成一串（0.2 s），最乾、最短"),
    ],
    "riser": [
        dict(id="riser-a", build="reverse", src=[("oga-metal-dings", "ding_-_starninjas.zip", "ding.1.ogg")],
             like="倒放的金屬聲，越來越大聲後收住",
             desc="金屬 ding 實錄倒放：1.5 s 漸強，最後收進撞擊點（像倒放鈸），1–8 kHz 都有能量"),
        dict(id="riser-b", build="reverse", src=[("oga-metal-impact", "bong1.wav", None)], like="倒放的低沉金屬聲",
             desc="金屬 bong 倒放：216／416 Hz 為主，比 a 低沉"),
        dict(id="riser-c", build="reverse", src=[VC("chimes.wav")], like="倒放的風鈴",
             desc="風鈴（mark tree）倒放：4 kHz 以上為主，亮、像魔法揭曉"),
        dict(id="riser-d", build="synth_riser", src=[], like="合成的上升音",
             desc="程式合成：濾波噪音 400 Hz→6 kHz 上掃＋音高 220→880 Hz 滑音"),
    ],
}


# ───────────── 下載與解碼 ─────────────

def cache_name(key, fname):
    s = SOURCES[key]
    return fname if "kenney" in s else f"oga-{s['oga']}__{fname}"


def page_url(key):
    s = SOURCES[key]
    return f"https://kenney.nl/assets/{s['kenney']}" if "kenney" in s else f"https://opengameart.org/content/{s['oga']}"


def download_url(key, fname):
    s = SOURCES[key]
    if "kenney" in s:
        return f"https://kenney.nl/download-link/{('assets/' + s['kenney']).encode().hex()}"
    return "https://opengameart.org/sites/default/files/" + urllib.parse.quote(fname)


def fetch(key, fname):
    s = SOURCES[key]
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA)]
    page = page_url(key)
    if "kenney" in s:
        # Kenney：先開素材頁拿 cookie，download-link 會回一個有時效的簽章網址
        op.open(page, timeout=60).read()
        req = urllib.request.Request(download_url(key, fname), headers={"Referer": page})
        url = json.loads(op.open(req, timeout=60).read())["url"]
    else:
        url = download_url(key, fname)
    req = urllib.request.Request(url, headers={"Referer": page})
    return op.open(req, timeout=300).read()


_BLOBS = {}


def blob(key, fname, cache):
    if (key, fname) in _BLOBS:
        return _BLOBS[(key, fname)]
    want = SOURCES[key]["files"][fname]
    p = cache / cache_name(key, fname)
    if p.exists():
        data = p.read_bytes()
    else:
        print(f"  下載 {page_url(key)} → {p.name}")
        data = fetch(key, fname)
        if hashlib.sha256(data).hexdigest() == want:
            p.write_bytes(data)
    got = hashlib.sha256(data).hexdigest()
    if got != want:
        sys.exit(f"sha256 不符：{p.name}\n  預期 {want}\n  實際 {got}\n來源可能改版，請重新挑選、更新 SOURCES。")
    _BLOBS[(key, fname)] = data
    return data


def load(ref, cache):
    key, fname, member = ref
    data = blob(key, fname, cache)
    if member:
        data = zipfile.ZipFile(io.BytesIO(data)).read(member)
    x, sr = sf.read(io.BytesIO(data), dtype="float64", always_2d=True)
    x = x[:, :2]
    ch = x.shape[1]
    if sr != SR:
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    return x, sr, ch


# ───────────── 量測 ─────────────

def kweight(x):
    # ITU-R BS.1770 的 48 kHz K 加權
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def m_max(x):
    """momentary loudness（400 ms 窗、10 ms 步進）的最大值，LUFS。前後補 0.4 s 靜音，短音效也量得到。"""
    pad = np.zeros((int(0.4 * SR), x.shape[1]))
    y = kweight(np.vstack([pad, x, pad]))
    c = np.concatenate([[0.0], np.cumsum((y ** 2).sum(axis=1))])
    w, hop = int(0.4 * SR), int(0.01 * SR)
    e = (c[w::hop] - c[:-w:hop][: len(c[w::hop])]) / w
    mx = e.max()
    return -0.691 + 10 * np.log10(mx) if mx > 0 else -120.0


def true_peak_db(x):
    return 20 * np.log10(max(np.abs(resample_poly(x, 4, 1, axis=0)).max(), 1e-12))


def measure(y):
    x = y.astype(np.float64) / 32767
    a = np.abs(x).max(axis=1)
    on = np.nonzero(a > 10 ** (-40 / 20))[0]
    m = x.mean(axis=1)
    sp = np.abs(np.fft.rfft(m)) ** 2
    f = np.fft.rfftfreq(len(m), 1 / SR)
    return dict(
        duration_sec=round(len(x) / SR, 3),
        peak_sec=round(int(a.argmax()) / SR, 3),
        onset_ms=round(on[0] / SR * 1000, 1) if len(on) else None,
        max_m_lufs=round(m_max(x), 1),
        true_peak_dbtp=round(true_peak_db(x), 2),
        centroid_hz=int((sp * f).sum() / sp.sum()),
    )


# ───────────── 素材建構（處理鏈之前） ─────────────

def fade(n, kind="out"):
    t = np.linspace(0, 1, n, endpoint=False) if n else np.zeros(0)
    w = np.sin(t * np.pi / 2) ** 2
    return (w if kind == "in" else w[::-1])[:, None]


def first_above(x, rel_db):
    a = np.abs(x).max(axis=1)
    return int(np.nonzero(a > a.max() * 10 ** (rel_db / 20))[0][0])


def pitch(x, semitones):
    """重取樣改音高（長度跟著變），semitones>0 變高變短。"""
    r = 2 ** (semitones / 12)
    up, down = 1000, int(round(1000 * r))
    g = gcd(up, down)
    return resample_poly(x, up // g, down // g, axis=0)


def place(out, x, at, gain_db=0.0):
    i = int(round(at * SR))
    need = i + len(x)
    if need > len(out):
        out = np.vstack([out, np.zeros((need - len(out), 2))])
    out[i:need] += x * 10 ** (gain_db / 20)
    return out


def build_alert_double(srcs, notes):
    x = srcs[0][first_above(srcs[0], -40):]
    hits = [(0.0, 3, 0.20, 0.05, 0.0), (0.17, 0, 0.26, 0.08, -1.0)]  # (起點秒, 半音, 保留秒, 淡出秒, 增益)
    out = np.zeros((0, 2))
    for at, st, keep, fo, g in hits:
        h = pitch(x, st)[: int(keep * SR)].copy()
        h[-int(fo * SR):] *= fade(int(fo * SR))
        out = place(out, h, at, g)
    notes.append("取起音後的單音，敲兩下：0 s 升 3 半音（留 0.20 s）、0.17 s 原音高（留 0.26 s、−1 dB）")
    return out


def build_glitch_stutter(srcs, notes):
    x = srcs[0]
    # (輸出秒, 來源秒, 長度秒, 增益 dB, 降取樣倍數)
    pat = [(0.000, 1.200, 0.060, 0, 1), (0.060, 1.200, 0.030, -1, 1), (0.090, 1.200, 0.030, -2, 6),
           (0.140, 2.730, 0.045, -3, 1), (0.185, 0.410, 0.022, -4, 1), (0.207, 0.410, 0.022, -4, 1),
           (0.229, 0.410, 0.022, -5, 8), (0.275, 3.900, 0.080, -6, 1)]
    out = np.zeros((0, 2))
    ramp = int(0.001 * SR)
    for k, (at, src, dur, g, hold) in enumerate(pat):
        s = x[int(src * SR): int((src + dur) * SR)].copy()
        if hold > 1:  # sample-and-hold 降取樣，做出數位破音
            s = s[(np.arange(len(s)) // hold) * hold]
        s[:ramp] *= fade(ramp, "in")
        tail = int(0.03 * SR) if k == len(pat) - 1 else ramp
        s[-tail:] *= fade(tail)
        out = place(out, s, at, g)
    notes.append("截 8 小段（22–80 ms）排成 stutter，第 3、7 段做 6×／8× sample-and-hold 降取樣")
    return out


def build_glitch_clicks(srcs, notes):
    out = np.zeros((0, 2))
    for (s, at, g) in zip([srcs[2], srcs[0], srcs[3], srcs[1], srcs[2]], [0, 0.035, 0.07, 0.12, 0.17], [0, -1, -2, -2, -4]):
        out = place(out, s, at, g)
    notes.append("glitch_003／001／004／002／003 依序放在 0、35、70、120、170 ms")
    return out


def build_keys(srcs, notes, seed=20261029):
    rng = np.random.default_rng(seed)
    gaps = rng.uniform(0.09, 0.13, len(srcs) - 1)
    # 第一擊最大聲：程式用峰值秒數對齊畫面，峰值要落在第一擊
    gains = np.concatenate([[0.0], rng.uniform(-4, -1, len(srcs) - 1)])
    out, at = np.zeros((0, 2)), 0.0
    for i, s in enumerate(srcs):
        s = s[first_above(s, -40):]
        out = place(out, s / np.abs(s).max(), at, gains[i])
        if i < len(gaps):
            at += gaps[i]
    notes.append(f"各擊先對齊峰值，排成 {len(srcs)} 擊：間隔 {'、'.join(f'{g*1000:.0f}' for g in gaps)} ms，"
                 f"音量 {'／'.join(f'{g:.1f}' for g in gains)} dB（亂數種子 {seed}）")
    return out


def build_reverse(srcs, notes, dur=1.5, fade_in=0.6):
    x = srcs[0]
    i = int(np.abs(x).max(axis=1).argmax())  # 從最響的那一點開始取，倒放後剛好收在峰值
    seg = x[i: i + int(dur * SR)][::-1].copy()
    n = int(fade_in * SR)
    seg[:n] *= fade(n, "in")
    notes.append(f"從撞擊峰值起取 {len(seg)/SR:.2f} s 倒放（結尾就是峰值），前 {fade_in} s 淡入")
    return seg


def pink(n, rng):
    w = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, w)


def sweep_bandpass(x, fc, q):
    """逐 256 樣本更新係數的帶通（RBJ biquad），濾波器狀態延續。"""
    out = np.zeros_like(x)
    zi = np.zeros(2)
    blk = 256
    for s in range(0, len(x), blk):
        w0 = 2 * np.pi * fc[s] / SR
        al = np.sin(w0) / (2 * q)
        b = np.array([al, 0, -al]) / (1 + al)
        a = np.array([1, -2 * np.cos(w0) / (1 + al), (1 - al) / (1 + al)])
        out[s:s + blk], zi = lfilter(b, a, x[s:s + blk], zi=zi)
    return out


def build_synth_whoosh(srcs, notes, seed=11):
    rng = np.random.default_rng(seed)
    T, tp = 0.9, 0.45
    n = int(T * SR)
    t = np.arange(n) / SR
    up = t < tp
    fc = np.where(up, 300 * (3000 / 300) ** (t / tp), 3000 * (600 / 3000) ** ((t - tp) / (T - tp)))
    env = np.where(up, np.sin(np.pi / 2 * t / tp) ** 2, np.exp(-4.5 * (t - tp) / (T - tp)) * np.cos(np.pi / 2 * (t - tp) / (T - tp)))
    body = lfilter([1 - 0.98], [1, -0.98], pink(n, rng))  # 低頻身體
    chans = []
    for _ in range(2):
        nz = sweep_bandpass(pink(n, rng), fc, 1.2)
        chans.append(nz / np.abs(nz).max() + 0.3 * body / np.abs(body).max())
    pan = np.clip((t - tp) / 0.35, -1, 1) * 0.7  # 左→右
    L = chans[0] * env * np.sqrt((1 - pan) / 2)
    R = chans[1] * env * np.sqrt((1 + pan) / 2)
    notes.append("程式合成 synth_whoosh：粉紅噪音帶通 300→3000→600 Hz、Q 1.2、0.45 s 峰值、聲像左→右、低頻身體 −10 dB（種子 11）")
    return np.stack([L, R], axis=1)


def build_synth_riser(srcs, notes, seed=7):
    rng = np.random.default_rng(seed)
    T = 1.4
    n = int(T * SR)
    t = np.arange(n) / SR
    fc = 400 * (6000 / 400) ** ((t / T) ** 1.5)
    f0 = 220 * (880 / 220) ** (t / T)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    tone = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)
    env = (t / T) ** 2.2
    chans = []
    for _ in range(2):
        nz = sweep_bandpass(pink(n, rng), fc, 2.5)
        chans.append((nz / np.abs(nz).max() + 0.2 * tone / np.abs(tone).max()) * env)
    notes.append("程式合成 synth_riser：粉紅噪音帶通 400→6000 Hz（Q 2.5）＋ 220→880 Hz 滑音 −14 dB、包絡 t^2.2（種子 7）")
    return np.stack(chans, axis=1)


BUILDERS = {
    "alert_double": build_alert_double, "glitch_stutter": build_glitch_stutter, "glitch_clicks": build_glitch_clicks,
    "keys": build_keys, "reverse": build_reverse, "synth_whoosh": build_synth_whoosh, "synth_riser": build_synth_riser,
}


# ───────────── 統一處理鏈 ─────────────

def gain_db_for(x, target):
    loud = target - m_max(x)
    tp = TP_CEIL - true_peak_db(x)
    return min(loud, tp), tp < loud


def finish(x, slot, notes):
    cfg = SLOTS[slot]
    limit = int(cfg["limit"] * SR)
    riser = slot == "riser"
    g, _ = gain_db_for(x, cfg["target"])
    lin = 10 ** (g / 20)
    if not riser:
        # 去前導靜音：最終檔第一個超過 −40 dBFS 的樣本前只留 2 ms，前段淡入
        a = np.abs(x).max(axis=1) * lin
        on = int(np.nonzero(a > 10 ** (-40 / 20))[0][0])
        pre = int(0.002 * SR)
        st = max(0, on - pre)
        x = x[st:].copy()
        x[: on - st] *= fade(on - st, "in")
        notes.append(f"去前導靜音（切掉 {st / SR * 1000:.0f} ms，起音前留 2 ms）" if st else "去前導靜音（原檔已在 2 ms 內起音，不切）")
    # 去尾端靜音：最後一個超過 −60 dBFS 的樣本後留 10 ms
    a = np.abs(x).max(axis=1) * lin
    last = int(np.nonzero(a > 10 ** (-60 / 20))[0][-1])
    x = x[: min(len(x), last + int(0.01 * SR))].copy()
    if len(x) > limit:
        if riser:
            x = x[-limit:].copy()
            x[: int(0.3 * SR)] *= fade(int(0.3 * SR), "in")
            notes.append(f"保留最後 {cfg['limit']} s（前 0.3 s 淡入）")
        else:
            fo = int(0.08 * SR)
            x = x[:limit].copy()
            x[-fo:] *= fade(fo)
            notes.append(f"截到 {cfg['limit']} s，最後 80 ms 淡出")
    else:
        e = int((0.003 if riser else 0.005) * SR)
        x[-e:] *= fade(e)
    g, tp_limited = gain_db_for(x, cfg["target"])
    x = x * 10 ** (g / 20)
    why = f"true peak 頂到 −1.2 dBTP，momentary max 停在 {m_max(x):.1f} LUFS" if tp_limited else f"momentary max {cfg['target']} LUFS"
    notes.append(f"增益 {g:+.1f} dB（{why}）")
    notes.append("48 kHz、立體聲、pcm_s16le")
    return np.round(np.clip(x, -1, 1) * 32767).astype(np.int16)


def suggested_volume(slot, mlufs):
    cfg = SLOTS[slot]
    v = cfg["vol"] * 10 ** ((cfg["target"] - mlufs) / 20)  # 被 true peak 壓住而偏小聲的，音量補回來
    return round(min(1.0, round(v / 0.05) * 0.05), 2)


def build(slot, cand, cache):
    notes = []
    srcs = [load(r, cache) for r in cand["src"]]
    rates = sorted({sr for _, sr, _ in srcs})
    if cand.get("build"):
        x = BUILDERS[cand["build"]]([s for s, _, _ in srcs], notes)
    else:
        x = srcs[0][0]
        if "start" in cand:
            x = x[int(cand["start"] * SR): int(cand["end"] * SR)].copy()
            notes.append(f"截取 {cand['start']:.3f}–{cand['end']:.3f} s")
    head = []
    if rates and rates != [SR]:
        head.append(f"{'／'.join(f'{r/1000:g}' for r in rates)} kHz 轉 48 kHz（resample_poly）")
    if any(ch == 1 for _, _, ch in srcs):
        head.append("單聲道複製成雙聲道")
    if head:
        notes.insert(0, "、".join(head))
    y = finish(x, slot, notes)
    return y, notes


# ───────────── 輸出 ─────────────

def src_text(cand):
    if not cand["src"]:
        return "程式合成（make_sfx.py " + cand["build"] + "）", "作者自有（CC0 釋出）"
    groups = {}
    for key, fname, member in cand["src"]:
        name = Path(member or fname).name
        if name not in groups.setdefault(key, []):
            groups[key].append(name)
    parts = []
    for key, names in groups.items():
        s = SOURCES[key]
        who = "" if "kenney" in s else "（" + "，".join(filter(None, [s["author"], s.get("note")])) + "）"
        parts.append(f"{s['pack']}{who} " + "、".join(f"`{n}`" for n in names))
    return "＋".join(parts), CC0[0]


def entry(slot, cand, y, notes):
    m = measure(y)
    keys = list(dict.fromkeys(r[0] for r in cand["src"]))
    one = lambda vals: vals[0] if len(vals) == 1 else vals  # noqa: E731
    e = dict(file=f"{slot}.wav", zh=SLOTS[slot]["zh"], candidate=cand["id"], like=cand["like"])
    if keys:
        e.update(
            source_pack=one([SOURCES[k]["pack"] for k in keys]),
            source_author=one([SOURCES[k]["author"] for k in keys]),
            source_file=one(list(dict.fromkeys((f"{f}:{mb}" if mb else f) for _, f, mb in cand["src"]))),
            source_url=one([page_url(k) for k in keys]),
            download_url=one(list(dict.fromkeys(download_url(k, f) for k, f, _ in cand["src"]))),
            zip_sha256=one(list(dict.fromkeys(SOURCES[k]["files"][f] for k, f, _ in cand["src"]))),
            license=CC0[0], license_url=CC0[1])
        note = [SOURCES[k]["note"] for k in keys if SOURCES[k].get("note")]
        if note:
            e["source_note"] = one(note)
    else:
        e.update(source=f"程式合成（make_sfx.py {cand['build']}）", license="作者自有（CC0 釋出）", license_url=CC0[1])
    e["processing"] = " → ".join(notes)
    e.update(m)
    e["suggested_volume"] = suggested_volume(slot, m["max_m_lufs"])
    return e


def write_readme(entries):
    lines = [
        "# 音效清單",
        "",
        "12 個音效都取自 CC0（公眾領域）素材，可以放進自己的影片、改編、商用，不用標示出處。",
        "逐檔的下載網址、sha256、處理方式、峰值秒數與建議音量在 `sources.json`。",
        "",
        "| 檔名 | 聽起來像 | 用在哪 | 來源 | 授權 |",
        "|---|---|---|---|---|",
    ]
    for e in entries:
        cand = next(c for c in CANDIDATES[e["file"][:-4]] if c["id"] == e["candidate"])
        src, lic = src_text(cand)
        lines.append(f"| `{e['file']}` | {e['like']} | {SLOTS[e['file'][:-4]]['use']} | {src} | {lic} |")
    lines += [
        "",
        "Kenney 素材出自 https://kenney.nl ，OpenGameArt 素材的作品頁網址在 `sources.json` 的 `source_url`，",
        "`zip_sha256` 是當初下載的檔案（zip 或單一音檔）的 sha256。",
        "",
        "作者端重新產生（腳本在作者的素材 repo，不隨工作區發布；會重新下載素材並核對 sha256）：",
        "",
        "```",
        "uv run --with numpy,scipy,soundfile python3 video/minimax/素材/tools/make_sfx.py",
        "```",
        "",
    ]
    (OUT_SFX / "README.md").write_text("\n".join(lines), encoding="utf-8")


def write_index(rows):
    css = """
:root{--bg:#fafaf7;--fg:#1d1d1b;--mut:#6b6b66;--line:#e2e1db;--card:#fff;--acc:#c27c00}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ecebe6;--mut:#9a9993;--line:#2c2c2a;--card:#1d1d1c;--acc:#ffd400}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"PingFang TC","Noto Sans TC",sans-serif;padding:24px 16px}
main{max-width:1100px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}p.lead{color:var(--mut);margin:0 0 24px}
section{margin:0 0 28px}h2{font-size:17px;margin:0 0 8px}h2 small{color:var(--mut);font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.c{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.c.on{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}.id{font-weight:600}.star{color:var(--acc)}
audio{width:100%;height:32px;margin:6px 0}.m{font:12px/1.5 ui-monospace,Menlo,monospace;color:var(--mut)}
.d{font-size:13px;margin:4px 0}.s{font-size:12px;color:var(--mut);word-break:break-all}
"""
    out = ["<!doctype html><html lang='zh-Hant'><head><meta charset='utf-8'>",
           "<meta name='viewport' content='width=device-width,initial-scale=1'><title>音效候選試聽</title>",
           f"<style>{css}</style></head><body><main>",
           "<h1>音效候選試聽</h1>",
           "<p class='lead'>★ 是目前 <code>make_sfx.py</code> 的 CHOICE。每顆都已照同一條處理鏈做完（去前導靜音、截長、響度、true peak、48 kHz 立體聲）。"
           "想換：改 CHOICE 的 id 再跑一次 make_sfx.py。數字：長度／峰值秒數／momentary max／true peak／頻譜質心。</p>"]
    for slot, cands in rows.items():
        cfg = SLOTS[slot]
        out.append(f"<section><h2>{slot}.wav <small>{html.escape(cfg['zh'])}｜{html.escape(cfg['use'])}｜上限 {cfg['limit']} s｜目標 {cfg['target']} LUFS</small></h2><div class='grid'>")
        for cand, m in cands:
            on = CHOICE[slot] == cand["id"]
            src, lic = src_text(cand)
            out.append(
                f"<div class='c{' on' if on else ''}'><div class='id'>{'<span class=star>★</span> ' if on else ''}{cand['id']}"
                f" <span class='d'>{html.escape(cand['like'])}</span></div>"
                f"<audio controls preload='none' src='{cand['id']}.wav'></audio>"
                f"<div class='m'>{m['duration_sec']:.3f} s｜peak {m['peak_sec']:.3f} s｜{m['max_m_lufs']} LUFS｜{m['true_peak_dbtp']} dBTP｜{m['centroid_hz']} Hz</div>"
                f"<div class='d'>{html.escape(cand['desc'])}</div>"
                f"<div class='s'>{html.escape(src.replace('`', ''))}｜{html.escape(lic)}</div></div>")
        out.append("</div></section>")
    out.append("</main></body></html>")
    (OUT_CAND / "index.html").write_text("\n".join(out), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zips", type=Path, help="原始下載檔的資料夾（缺的會下載到這裡）")
    ap.add_argument("--candidates", action="store_true", help="另外輸出全部候選與試聽頁到 sfx-candidates/")
    args = ap.parse_args()
    cache = args.zips or Path(tempfile.gettempdir()) / "make_sfx_cache"
    cache.mkdir(parents=True, exist_ok=True)
    OUT_SFX.mkdir(parents=True, exist_ok=True)
    entries, rows = [], {}
    for slot in SLOTS:
        rows[slot] = []
        for cand in CANDIDATES[slot]:
            chosen = CHOICE[slot] == cand["id"]
            if not (chosen or args.candidates):
                continue
            y, notes = build(slot, cand, cache)
            if chosen:
                sf.write(OUT_SFX / f"{slot}.wav", y, SR, subtype="PCM_16", format="WAV")
                entries.append(entry(slot, cand, y, notes))
            if args.candidates:
                OUT_CAND.mkdir(parents=True, exist_ok=True)
                sf.write(OUT_CAND / f"{cand['id']}.wav", y, SR, subtype="PCM_16", format="WAV")
                rows[slot].append((cand, measure(y)))
        e = entries[-1]
        print(f"{slot:8s} {e['candidate']:10s} {e['duration_sec']:.3f}s peak {e['peak_sec']:.3f}s "
              f"{e['max_m_lufs']:6.1f} LUFS {e['true_peak_dbtp']:6.2f} dBTP onset {e['onset_ms']} ms vol {e['suggested_volume']}")
    (OUT_SFX / "sources.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_readme(entries)
    if args.candidates:
        write_index(rows)
        print(f"候選：{OUT_CAND / 'index.html'}")


if __name__ == "__main__":
    main()
