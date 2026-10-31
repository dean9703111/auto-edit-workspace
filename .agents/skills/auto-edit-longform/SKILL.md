---
name: auto-edit-longform
description: 長片總指揮：判斷 projects/<專案> 做到哪一步、第一次開工填開工決策表、把工作交給對應的階段 Skill、維護 work/製作進度.md 的階段表與停點紀錄。當使用者說「用 auto-edit-longform 剪 projects/X」「剪這支影片」「繼續」「繼續 projects/X」「下一集」「做到哪了」「剪成短影片」「做直式」時使用。只做單一階段（只剪乾淨、只換主色、只開剪輯台）時不要用，直接用那個階段的 Skill（auto-edit-rough、auto-edit-style、auto-edit-review）。
version: 0.1.0
---
# 總指揮：做到哪、交給誰

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `projects/<專案>/` | `status.mjs` | `work/製作進度.md` | 製作進度.md 有開工決策表、階段表、停點紀錄；交出去的 Skill＝路由表那一列 | 沿用各階段（本檔不自己停） |

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 提示詞沒指定專案，`projects/` 只有 1 個 | 用那一個 |
| 沒指定，`projects/` 有 2 個以上 | 列出來問，回覆最後一行 `❓ 請回：專案名稱` |
| `素材/真人錄影/`、`素材/聲音/` 都是空的 | 照 AGENTS.md「開新專案」第 2 點告訴使用者放什麼，最後一行 `→ 下一步：素材放好後說「剪乾淨」` |

一次只處理一個專案，不讀寫其他專案的 `work/`、`成片/`（AGENTS.md「專案」）。

## 步驟

**1. 看進度**

```
node shared/template/tools/status.mjs --project projects/<專案>
```

講者調光瘦臉還沒好時（構圖預覽或 build 之前），「下一步」是 look 的說明，下一行單獨一行是要執行的指令：整行複製執行，不要自己加參數。其他時候「下一步」是一句說明（例「跑 media.mjs cutpoints」），完整指令照接手的那支 Skill 那一步寫的。
完成判準：讀到 `目前在：`、`下一步：`、`下一個停點：`、`待回覆停點：`、`下一輪回饋編號：`、`依據：` 六行（講者調光瘦臉還沒好時，`下一步：` 下面多一行指令）。
常見錯誤：status 印的和 `work/製作進度.md` 不一致 → 退路表第 1 列。

**2. 第一次開工**（沒有 `work/製作進度.md`）

```
Mac：mkdir -p projects/<專案>/work && cp .agents/skills/auto-edit-longform/references/progress-template.md projects/<專案>/work/製作進度.md
Windows（PowerShell）：New-Item -ItemType Directory -Force projects\<專案>\work; Copy-Item .agents\skills\auto-edit-longform\references\progress-template.md projects\<專案>\work\製作進度.md
ffprobe -v error -show_entries format=duration -of csv=p=0 "<主軌>"
```

照範本「開工決策表」逐欄跑「怎麼看」，把值填進去（規則在 AGENTS.md「開工」）。「版式」照 AGENTS.md「版式」的判斷順序填，開頭兩個字固定寫「直式」或「橫式」、括號寫理由；直式時提醒寫 plan.json 第一層加 `"format": "portrait"`。
完成判準：開工決策表 7 欄都有值，構圖倍率寫「待停點 ②」。
常見錯誤：主軌有好幾支 → 長度先寫各支相加，標「待停點 ① 確認順序」。

**3. 有待回覆的停點**（status 的 `待回覆停點` 不是 `無`）

```
（不用指令：重貼那個停點的最後一行，和它要看的檔）
```

完成判準：回覆最後一行＝AGENTS.md「停點總表」那個停點的原文。
常見錯誤：使用者這句話其實就是在回覆那個停點 → 照那個停點的「我可以回」做，不要重貼。

**4. 交棒**

```
（不用指令：照下面路由表，讀那支 Skill 的 SKILL.md，從它的「開始前」做起）
```

| 條件（第一個符合的那列） | 交給 |
|---|---|
| 找不到 `node`／`ffmpeg`，或使用者說裝工具 | `auto-edit-setup` |
| 沒有 `work/rough.mp4`，或沒有 `work/cutpoints.json` | `auto-edit-rough` |
| 有 `work/rough.mp4`、`work/rough.srt`；停點 ③ 沒有「通過」 | `auto-edit-storyboard` |
| ③ 通過；plan.json 有 `"type": "custom"` 的段、對應的 `compositions/x-*.html` 不存在或還是範例原文 | `auto-edit-motion`（每段一次；有子代理可以平行，選用） |
| ③ 通過、情境動畫都做完；④ 沒有「通過」 | `auto-edit-review` |
| ④ 通過；沒有 `成片/final.mp4` | `auto-edit-deliver` |
| 有 `成片/final.mp4`，而且 `qc.mjs final` 0 個 ✖ | 完成 → 回報 |

完成判準：交出去的 Skill＝表上第一個符合的那列。
常見錯誤：status 印的和表不一樣 → 以 status 為準；兩者都和實際檔案不符 → 以產物為準（退路表第 1 列）。

**5. 每過一個停點、每做完一個階段**

```
（不用指令：改 work/製作進度.md）
```

階段表改狀態；停點紀錄**新增**一列（不改舊列），格式照 AGENTS.md「進度與回饋紀錄」。
完成判準：停點紀錄最後一列和剛剛的回覆一致。
常見錯誤：改了舊的「待回覆」列 → 舊列不動，另加一列。

可以全自動、不用問的：轉逐字稿、`--check`、build、audit、snapshot、`qc.mjs`、`status.mjs`。一定要停的：AGENTS.md「停點總表」的 ①–⑥。

## 自我核對

- [ ] 專案只有一個、確定了
- [ ] `work/製作進度.md` 存在
- [ ] 開工決策表 7 欄有值
- [ ] 交出去的 Skill 對到路由表
- [ ] 停點紀錄最後一列正確
- [ ] 沒讀寫其他專案的 `work/`

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| status 印的和 `work/製作進度.md` 不一致 | 以產物為準，改製作進度.md，回報裡提醒一句 | — |
| 使用者說「繼續」但沒有 `work/` | 當作第一次開工（步驟 2） | — |

## 工具呼叫預算

接手（步驟 1–4）最多 4 次（AGENTS.md「階段預算」）。超過就停下來回報卡在哪；交棒之後照那支 Skill 的預算。

## 回報格式

```
專案：projects/<專案>
目前在：<status 原文>
下一步：<status 原文>
交給：<Skill 名稱>
（第一次開工）開工決策表：<主軌>｜<講稿 有／沒有>｜<錄影 有／沒有>｜<長度>s｜<業配>
<最後一行：交出去那支 Skill 的停點原文，或 → 下一個停點：…>
```

## 什麼時候讀 references/

- `references/progress-template.md`：步驟 2 第一次開工、或退路表第 1 列以產物判斷階段時才讀（「產物 → 階段」表）。
