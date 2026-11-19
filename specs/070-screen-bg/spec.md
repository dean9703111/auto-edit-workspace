# 070 錄影四周的底色：純黑（預設）／純白

## 作者原話

- 「另外我發現應該要有使用螢幕錄影時，背景白色還是黑色的選項，預設為黑色底」
- 「這個能夠在 setting.json 上設定紀錄」
- 「是指純白或純黑」（附錄影畫面框外是米白底、框裡左右補黑邊的截圖）

## 定案

- 新設定 `screenBg`：`"black"`＝純黑 #000000（預設）、`"white"`＝純白 #FFFFFF。
- 順序：這一集 plan.json 第一層 `screenBg` → `shared/setting.json` 的 `screenBg` → 純黑。寫錯：plan ✖；setting ⚠ 並先用純黑。
- 有沒有錄影畫面框都套用：框外（`.mbg`）和框裡沒蓋到的地方（`.mwin`）同色。`tape` 的紙底不變。
  - 原本有框時框外是主題的淺底（亮色 #FFF8F3、暗色 #0E1014），070 起預設改成純黑（作者說預設黑色底）。
- 設定方式：
  - 以後每集：`brand.mjs screen-bg black|white|off`（不給值＝印目前的預設）。
  - 只有這一集：`build.mjs --set screenBg=white`、`--unset screenBg`。
- build 摘要多一行「錄影四周：黑底／白底（出處）」。
- 這台的 `shared/setting.json` 已經用 `brand.mjs screen-bg black` 記下純黑。

## 改了哪些檔

- `shared/template/tools/lib/screen-frame.mjs`：`SCREEN_BGS`
- `shared/template/tools/lib/plan.mjs`：`TOP_KEYS`、解析與檢查、傳給 `validateMedia`、摘要那一行
- `shared/template/tools/lib/project.mjs`：`screenBgDefault`
- `shared/template/tools/lib/plan-set.mjs`：`screenBg` 鍵
- `shared/template/tools/lib/media.mjs`：`m.bg`、`.mbg--white`、`.mwin--white`、欄位說明
- `shared/template/kit/media.css`：拿掉 `.mbg--frame` 的主題淺底；加 `.mbg--white`、`.mwin--white`
- `shared/template/tools/brand.mjs`：`screen-bg` 子指令與說明
- `shared/template/USAGE.md` 5.3 錄影畫面框下面一條；`.agents/skills/auto-edit-style/SKILL.md`「開始前」一列
- 測試：`dev/tests/screen-frame.test.mjs`
