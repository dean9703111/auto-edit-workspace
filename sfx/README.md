# 音效清單

12 個音效都取自 CC0（公眾領域）素材，可以放進自己的影片、改編、商用，不用標示出處。
逐檔的下載網址、sha256、處理方式、峰值秒數與建議音量在 `sources.json`。

| 檔名 | 聽起來像 | 用在哪 | 來源 | 授權 |
|---|---|---|---|---|
| `pop.wav` | 短促圓潤的「啵」，尾音往上揚 | 字卡、條列、卡片揭開 | OpenGameArt「Pop sounds」（cogitollc） `pop7.ogg` | CC0 1.0 |
| `tick.wav` | 實體開關輕輕「嗒」一下 | 條列逐條出現，每條一顆 | Kenney UI Audio `switch13.ogg` | CC0 1.0 |
| `swipe.wav` | 手快速揮過的「咻」 | 面板、角標滑入 | OpenGameArt「Wind, hit, time morph」（qubodup (Iwan Gabovitch)） `60009__qubodup__swosh_22.flac` | CC0 1.0 |
| `whoosh.wav` | 空氣被大力揮開的「咻——」 | 章節轉場、全畫面幕 | OpenGameArt「Wind, hit, time morph」（qubodup (Iwan Gabovitch)） `qubodup-slomo1.wav` | CC0 1.0 |
| `ding.wav` | 清亮的「叮——」，餘韻長 | 講重點、答案揭曉 | OpenGameArt「UI Sound Effects」（robin-lamb，取自 VCSL／VSCO 2 CE 公眾領域樂器取樣） `ding_deep.wav` | CC0 1.0 |
| `success.wav` | 快速往上爬的「叮叮叮叮」 | 好結果、完成 | Kenney Interface Sounds 1.0 `confirmation_002.ogg` | CC0 1.0 |
| `alert.wav` | 低沉的「咚、咚」往下走 | 踩雷、警告 | OpenGameArt「UI Sound Effects」（robin-lamb，取自 VCSL／VSCO 2 CE 公眾領域樂器取樣） `dum.wav` | CC0 1.0 |
| `impact.wav` | 重物砸在木頭上的「咚」 | 字卡動態的印章、爆發 | Kenney Impact Sounds 1.0 `impactWood_heavy_003.ogg` | CC0 1.0 |
| `flip.wav` | 紙牌「刷—啪」甩到桌上 | 卡片翻面 | Kenney Casino Audio 1.1 `card-place-1.ogg` | CC0 1.0 |
| `type.wav` | 機械鍵盤快速連打五下 | 打字機動態起手 | OpenGameArt「Keyboard Soundpack 1」（unicaegames） `keypress-017.wav`、`keypress-004.wav`、`keypress-006.wav`、`keypress-030.wav`、`keypress-019.wav` | CC0 1.0 |
| `glitch.wav` | 數位訊號卡住「嗞嗞—嗞」 | 故障字效 | Kenney Sci-fi Sounds `computerNoise_002.ogg` | CC0 1.0 |
| `riser.wav` | 倒放的金屬聲，越來越大聲後收住 | 揭曉前的鋪墊（結尾對齊畫面事件） | OpenGameArt「4 Metal Dings/Rings」（starninjas） `ding.1.ogg` | CC0 1.0 |

Kenney 素材出自 https://kenney.nl ，OpenGameArt 素材的作品頁網址在 `sources.json` 的 `source_url`，
`zip_sha256` 是當初下載的檔案（zip 或單一音檔）的 sha256。

作者端重新產生（腳本在作者的素材 repo，不隨工作區發布；會重新下載素材並核對 sha256）：

```
uv run --with numpy,scipy,soundfile python3 video/minimax/素材/tools/make_sfx.py
```
