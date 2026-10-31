# 第 0 輪（基準）　2026-10-31

## 這輪改了什麼
- 還沒改工具；只加了 `.specify/`、`specs/`、`dev/check-all.mjs`、`dev/loop/`。這輪是升級前的基準。

## check-all（`node dev/check-all.mjs --render`）
| 步驟 | 結果 | 細節 |
|---|---|---|
| node --test dev/tests | ✖ | 247 測試、242 過、**5 個升級前就失敗**（見下） |
| 合成測試專案 | ✓ | 70 s、20 句、8 段（概念卡、章節、側邊欄、全畫面清單、字卡動態、custom x-process、media、金句） |
| build --check | ✓ | 0 ✖、7 ⚠（開場 30 秒 3 張、露臉 < 3 s、蓋講者 25%、items[0].at 早於 head） |
| build | ✓ | 人聲 −21.9 → −13.9 LUFS；剪接點微淡化 2 個 |
| audit --all | ✓ | 0 ✖、2 ⚠ |
| snapshot ×3 | ✓ | 1.5／30／58.5 s |
| --test 3 s render draft | ✓ | video＋audio |

升級前就失敗的 5 個測試（要在對應工作線修，先確認是程式對還是測試對）：
| 測試 | 檔案 | 歸誰 |
|---|---|---|
| 壓到子母畫面：只在全畫面、這一刻有子母畫面時判 | `dev/tests/audit.test.mjs` | 003 |
| pip-frame.png：用原本的黃色重畫…／換色後直邊是新主色… | `dev/tests/brand.test.mjs` | 004（主色已被作者改成 #F6630F，測試還認舊黃色） |
| 產生專案：CRLF 字幕、底片重新編碼…（期望 data-duration="44"，實際 44.1） | `dev/tests/build.test.mjs` | 002 |
| 子母畫面裁切：講者置中用預設框，偏右時以講者框為中心（pipGeometry 數字） | `dev/tests/plan.test.mjs` | 002 |

## 弱模型試跑
未跑（升級前不跑）。

## 審查員
未跑。

## 下一輪要做
1. 001–006 實作完成後跑 `node dev/check-all.mjs --render`，5 個舊失敗要歸零。
2. 範例專案跑「剪乾淨」後再跑 `--real projects/範例`。
3. 弱模型試跑（Sonnet）到停點 ③。
