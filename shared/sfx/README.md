# 音效清單

9 個音效：取自 CC0（公眾領域）素材，或 AI 生成並以 CC0 釋出；可以放進自己的影片、改編、商用，不用標示出處。
片尾配樂 `bgm-cylinder-five.wav` 是 CC BY 4.0：預設不配，plan.json 的 outro 寫 "music": "bgm-cylinder-five" 才會用；用到的影片要在說明欄標示「Music: "Cylinder Five" by Chris Zabriskie (http://chriszabriskie.com/cylinders/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)」。
同類變體：`ding`（`ding-2.wav`、`ding-3.wav`）、`success`（`success-2.wav`、`success-3.wav`）、`alert`（`alert-2.wav`、`alert-3.wav`）、`impact`（`impact-2.wav`、`impact-3.wav`） 是同一顆升降一個半音，build 照出現順序輪著放，同一顆不會連著一模一樣；來源與授權同本尊。plan.json 還是只寫本尊的名稱。
逐檔的下載網址、sha256、處理方式、峰值秒數與響度在 `sources.json`；每顆在完成影片裡的大小（相對人聲的 dB）與使用時機在 `shared/template/kit/sfx.json`。

| 檔名 | 聽起來像 | 用在哪 | 來源 | 授權 |
|---|---|---|---|---|
| `ding.wav` | 帶拍動的電子提示音「滴～」 | 提醒、小技巧、總結、答案揭曉 | AI 生成（`dev/tools/make-sfx.mjs` 配方 `ding-c`） | CC0 1.0（AI 生成、作者釋出） |
| `success.wav` | 鐘琴四音「叮叮叮叮～」 | 解法、成果、完成、問題解決 | AI 生成（`dev/tools/make-sfx.mjs` 配方 `success-c`） | CC0 1.0（AI 生成、作者釋出） |
| `alert.wav` | 低沉的電子蜂鳴「嗶、嗶——」 | 千萬不要、踩坑、錯誤、限制 | AI 生成（`dev/tools/make-sfx.mjs` 配方 `alert-d`） | CC0 1.0（AI 生成、作者釋出） |
| `impact.wav` | 綜藝低鼓「咚、咚」 | 重點句、蓋章、重擊、數字或金句落定 | AI 生成（`dev/tools/make-sfx.mjs` 配方 `impact-d`） | CC0 1.0（AI 生成、作者釋出） |
| `click.wav` | 滑鼠按下＋放開「喀-喀」 | 螢幕錄影或情境動畫裡看得到游標按下的地方，一下一顆 | Kenney UI Audio `mouseclick1.ogg`、`mouserelease1.ogg` | CC0 1.0 |
| `chapter.wav` | 「喀喀」接有音高的「嘭」、低鼓鼓起來 | 章節轉場（01） | AI 生成（`dev/tools/make-sfx.mjs` 配方 `chapter-o`） | CC0 1.0（AI 生成、作者釋出） |
| `sparkle.wav` | 高音一簇亮起＋鐘聲「鏘～叮鈴」 | 入場、介紹主角（14 講者介紹）、金句閃亮（15） | AI 生成（`dev/tools/make-sfx.mjs` 配方 `sparkle-h`） | CC0 1.0（AI 生成、作者釋出） |
| `shine.wav` | 鐘琴音階刷上去「嘩啦啦～叮」 | 轉折亮點：本集最得意的設計、關鍵詞大字進場 | AI 生成（`dev/tools/make-sfx.mjs` 配方 `shine-e`） | CC0 1.0（AI 生成、作者釋出） |
| `thunder.wav` | 翻滾的雷「喀啦——轟隆」 | 負面情緒：壓力、焦慮、晴天霹靂（15 金句 tone warn 預設） | AI 生成（`dev/tools/make-sfx.mjs` 配方 `thunder-h`） | CC0 1.0（AI 生成、作者釋出） |
| `bgm-cylinder-five.wav` | 原曲開頭，最輕 | 結語金句講完到片尾；預設不配，plan.json 的 outro 寫 "music":   "bgm-cylinder-five" 才有 | Chris Zabriskie〈Cylinder Five〉剪輯 | CC BY 4.0（要標示出處） |

Kenney 素材出自 https://kenney.nl ，`zip_sha256` 是當初下載的 zip 的 sha256；片尾配樂的 `source_sha256` 是作者本機原曲的 sha256；`sha256` 是 wav 檔本身。

`thunder.wav` 目前是 AI 生成版；`sources.json` 的 `pending_author_check`（待作者瀏覽器確認）列了 OpenGameArt 的 CC0 候選，作者在瀏覽器確認授權欄並試聽後才會換檔。

作者端重新產生（只要 Node 與 ffmpeg；會重新下載 Kenney 素材並核對 sha256）：

```
node dev/tools/make-sfx.mjs --candidates --only <名稱> --out <工作區外的資料夾>   # 試聽候選
node dev/tools/make-sfx.mjs --write --only <名稱>                                 # 寫進 shared/sfx/
node dev/tools/make-sfx.mjs --variants                                            # 同類變體（重做某一顆之後要再跑）
node dev/tools/make-sfx.mjs --write --only bgm-cylinder-five --src <原曲 mp3>     # 片尾配樂要給作者本機的原曲
```
