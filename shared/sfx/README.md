# 音效清單

18 個音效：取自 CC0（公眾領域）素材，或作者合成並以 CC0 釋出；可以放進自己的影片、改編、商用，不用標示出處。
逐檔的下載網址、sha256、處理方式、峰值秒數與響度在 `sources.json`；每顆在成片裡的大小（相對人聲的 dB）與使用時機在 `shared/template/kit/sfx.json`。

| 檔名 | 聽起來像 | 用在哪 | 來源 | 授權 |
|---|---|---|---|---|
| `pop.wav` | 短促圓潤的「啵」，尾音往上揚 | 下方字卡揭開、第一張卡片出現 | OpenGameArt「Pop sounds」（cogitollc） `pop7.ogg` | CC0 1.0 |
| `tick.wav` | 實體開關輕輕「嗒」一下 | 條列逐條出現、步驟切換，每條一顆 | Kenney UI Audio `switch13.ogg` | CC0 1.0 |
| `swipe.wav` | 手快速揮過的「咻」 | 側邊欄推入、角標滑入 | OpenGameArt「Wind, hit, time morph」（qubodup (Iwan Gabovitch)） `60009__qubodup__swosh_22.flac` | CC0 1.0 |
| `whoosh.wav` | 空氣被大力揮開的「咻——」 | 全畫面幕進場（04a–d）、從講者切到螢幕錄影的第一段（章節轉場改用 chapter） | OpenGameArt「Wind, hit, time morph」（qubodup (Iwan Gabovitch)） `qubodup-slomo1.wav` | CC0 1.0 |
| `ding.wav` | 平穩的電子提示音「滴——」 | 講重點、提醒（「提醒一下大家」）、答案揭曉 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `ding-a`） | CC0 1.0（作者合成並釋出） |
| `success.wav` | 鐘琴上行琶音「叮叮叮叮～」 | 解法、成果、完成、問題解決 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `success-a`） | CC0 1.0（作者合成並釋出） |
| `alert.wav` | 低音電子蜂鳴「嗶-嗶—」 | 千萬不要、踩坑、錯誤、限制 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `alert-a`） | CC0 1.0（作者合成並釋出） |
| `impact.wav` | 合成大鼓「咚、咚」 | 蓋章、重擊、數字或金句落定 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `impact-c`） | CC0 1.0（作者合成並釋出） |
| `flip.wav` | 紙牌「刷—啪」甩到桌上 | 翻牌、翻卡、切換 | Kenney Casino Audio 1.1 `card-place-1.ogg` | CC0 1.0 |
| `type.wav` | 機械鍵盤快速連打五下 | 打字機動畫起手 | OpenGameArt「Keyboard Soundpack 1」（unicaegames） `keypress-017.wav`、`keypress-004.wav`、`keypress-006.wav`、`keypress-030.wav`、`keypress-019.wav` | CC0 1.0 |
| `glitch.wav` | 數位訊號卡住「嗞嗞—嗞」 | 出錯、系統崩潰、bug | Kenney Sci-fi Sounds `computerNoise_002.ogg` | CC0 1.0 |
| `riser.wav` | 倒放的金屬聲，越來越大聲後收住 | 揭曉前的鋪墊（峰值在結尾） | OpenGameArt「4 Metal Dings/Rings」（starninjas） `ding.1.ogg` | CC0 1.0 |
| `click.wav` | 滑鼠按下＋放開「喀-喀」 | 螢幕錄影或情境動畫裡看得到游標按下的地方，一下一顆 | Kenney UI Audio `mouseclick1.ogg`、`mouserelease1.ogg` | CC0 1.0 |
| `chapter.wav` | 合成重低音「嘭——」 | 章節轉場（01） | 程式合成（`dev/tools/make-sfx.mjs` 配方 `chapter-c`） | CC0 1.0（作者合成並釋出） |
| `sparkle.wav` | 仙女棒閃粉「刷啦啦～」 | 入場、介紹主角（14 講者介紹）、金句閃亮（15） | 程式合成（`dev/tools/make-sfx.mjs` 配方 `sparkle-a`） | CC0 1.0（作者合成並釋出） |
| `shine.wav` | 閃亮的上行鐘琴「登登登～」 | 轉折亮點：本集最得意的設計、關鍵詞大字進場 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `shine-d`） | CC0 1.0（作者合成並釋出） |
| `thunder.wav` | 低沉的雷聲「轟隆」 | 負面情緒：壓力、焦慮、晴天霹靂（15 金句 tone warn 預設） | 程式合成（`dev/tools/make-sfx.mjs` 配方 `thunder-c`） | CC0 1.0（作者合成並釋出） |
| `bgm-outro.wav` | 溫暖的鋼琴琶音鋪底 | 結語金句講完到片尾，plan.json 寫 outro 才有 | 程式合成（`dev/tools/make-sfx.mjs` 配方 `bgm-d`） | CC0 1.0（作者合成並釋出） |

Kenney 素材出自 https://kenney.nl ，OpenGameArt 素材的作品頁網址在 `sources.json` 的 `source_url`，
`zip_sha256` 是當初下載的檔案（zip 或單一音檔）的 sha256，`sha256` 是 wav 檔本身。

`thunder.wav`、`bgm-outro.wav` 目前是程式合成版；`sources.json` 的 `pending_author_check`（待作者瀏覽器確認）列了 OpenGameArt 的 CC0 候選，作者在瀏覽器確認授權欄並試聽後才會換檔。

作者端重新產生（只要 Node 與 ffmpeg；會重新下載 Kenney 素材並核對 sha256）：

```
node dev/tools/make-sfx.mjs --candidates --only <名稱> --out <工作區外的資料夾>   # 試聽候選
node dev/tools/make-sfx.mjs --write --only <名稱>                                 # 寫進 shared/sfx/
```

`pop` `tick` `swipe` `whoosh` `flip` `type` `glitch` `riser` 是凍結的舊檔（由已退役的 `dev/tools/make_sfx.py` 產生），處理方式記在 `sources.json` 的 `processing`，不再重產。
