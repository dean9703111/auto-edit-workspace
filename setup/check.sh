#!/bin/bash
# setup/check.sh：Mac 環境檢測。只檢查，不安裝、不寫檔，結束碼一律是 0。
# 用法（在工作區根目錄）：bash setup/check.sh
# 每項一行：✅ 可以用／⚠️ 裝了但這個視窗用不到／❌ 沒裝或太舊／ℹ️ 參考資訊。
# 最後一行「JSON: {...}」給 AI 解析，欄位說明在 setup/README.md。
# 要相容 macOS 內建的 bash 3.2：不要用關聯陣列、${var,,}、mapfile；
# 變數後面緊接中文或全形標點時一定要寫成 ${var}，不然 bash 3.2 會把字串弄壞。

NODE_MIN=22
MODEL_BYTES=487601967
SKILLS_DIR="$HOME/.minimax/skills"
MODEL_FILE="$HOME/.cache/hyperframes/whisper/models/ggml-small.bin"
RESTART_NOTE="已安裝，這個視窗還看不到，重開 MiniMax Code"

LINES=""
JSON_ITEMS=""
TODO=""
TODO_COUNT=0
NEED_RESTART=false
# 人話總結依步驟分組
GROUP_PATH=""
GROUP_INSTALL=""
GROUP_SKILL=""
GROUP_RESTART=""

if [ "$(uname -s 2>/dev/null)" != "Darwin" ]; then
  echo "這支腳本給 Mac 用。Windows 請改跑：powershell -NoProfile -ExecutionPolicy Bypass -File setup\\check.ps1"
  echo 'JSON: {"script":"check.sh","os":"other","all_ok":false,"need_restart":false,"todo":[],"items":{}}'
  exit 0
fi

# ---------- 小工具 ----------

json_str() {
  local s
  s=$(printf '%s' "$1" | tr -d '\000-\037')
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '"%s"' "$s"
}

disp() {
  case $1 in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# add_item <key> <名稱> <status> <版本> <路徑> <備註> <必要 1/0> <步驟>
add_item() {
  local key=$1 label=$2 status=$3 ver=$4 path=$5 note=$6 req=$7 step=$8 icon line reqj=false
  # step 是「下一步該做哪一步」：看不到的改指向重開（M8），路徑沒設定的改指向 M2
  case $status in
    restart) step=M8 ;;
    not_in_path) step=M2 ;;
  esac
  case $status in
    ok) icon="✅" ;;
    restart|not_in_path|incomplete) icon="⚠️" ;;
    info) icon="ℹ️" ;;
    *) icon="❌" ;;
  esac
  line="$icon $label"
  [ -n "$ver" ] && line="$line  $ver"
  [ -n "$path" ] && line="$line  $(disp "$path")"
  [ -n "$note" ] && line="$line  $note"
  LINES="$LINES$line
"
  [ "$req" = 1 ] && reqj=true
  [ -n "$JSON_ITEMS" ] && JSON_ITEMS="$JSON_ITEMS,"
  JSON_ITEMS="$JSON_ITEMS\"$key\":{\"status\":$(json_str "$status"),\"version\":$(json_str "$ver"),\"path\":$(json_str "$path"),\"required\":$reqj,\"step\":$(json_str "$step")}"
  if [ "$req" = 1 ] && [ "$status" != "ok" ]; then
    [ -n "$TODO" ] && TODO="$TODO,"
    TODO="$TODO\"$key\""
    TODO_COUNT=$((TODO_COUNT + 1))
    case $status in
      restart) NEED_RESTART=true; GROUP_RESTART="${GROUP_RESTART}${GROUP_RESTART:+、}${label}" ;;
      not_in_path) GROUP_PATH="${GROUP_PATH}${GROUP_PATH:+、}${label}" ;;
      *)
        case $step in
          S*) GROUP_SKILL="${GROUP_SKILL}${GROUP_SKILL:+、}${label#Skill：}（${step}）" ;;
          *)
            [ "$status" = "too_old" ] && label="${label} 太舊"
            GROUP_INSTALL="${GROUP_INSTALL}${GROUP_INSTALL:+、}${label}（${step}）" ;;
        esac ;;
    esac
  fi
}

# 登入 shell 的設定檔（不算註解行）裡有沒有出現任一個字串（MiniMax Code 啟動時用 $SHELL -ilc 讀這些檔）
profile_has() {
  local f p
  for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do
    [ -f "$f" ] || continue
    for p in "$@"; do
      if grep -v '^[[:space:]]*#' "$f" 2>/dev/null | grep -qF -- "$p"; then return 0; fi
    done
  done
  return 1
}

# 檔案在、但不在這個視窗的 PATH 上：
# 設定檔有登記這個資料夾 → restart（重開就好）；沒有 → not_in_path（做 M2 把資料夾加進設定檔）
offpath_status() {
  local dir rel found=1
  dir=$(dirname "$1")
  case $1 in
    /opt/homebrew/*) profile_has 'brew shellenv' '/opt/homebrew/bin' && found=0 ;;
    /usr/local/bin/*) found=0 ;;  # macOS 預設 PATH（/etc/paths）本來就有
    "$HOME"/.nvm/*) profile_has 'nvm.sh' && found=0 ;;
    "$HOME"/.volta/*) profile_has '.volta' && found=0 ;;
    */fnm/*) profile_has 'fnm env' && found=0 ;;
    "$HOME"/*)
      rel=${dir#"$HOME"}
      profile_has "$dir" "\$HOME$rel" "\${HOME}$rel" "~$rel" && found=0 ;;
    *) profile_has "$dir" && found=0 ;;
  esac
  if [ "$found" = 0 ]; then
    R_STATUS=restart; R_NOTE="${RESTART_NOTE}（mac.md 步驟 M8）"
  elif [ "$dir" = "/opt/homebrew/bin" ]; then
    R_STATUS=not_in_path; R_NOTE="已安裝，但 Homebrew 的路徑還沒寫進 ${PROFILE_HINT}（mac.md 步驟 M2）"
  else
    R_STATUS=not_in_path; R_NOTE="已安裝，但 $(disp "$dir") 沒寫進 ${PROFILE_HINT}，重開也看不到（mac.md 步驟 M2）"
  fi
}

# find_bin <指令> [其他候選路徑...] → R_PATH、R_ONPATH
find_bin() {
  local name=$1 c
  shift
  R_ONPATH=0
  R_PATH=$(command -v "$name" 2>/dev/null)
  if [ -n "$R_PATH" ]; then R_ONPATH=1; return 0; fi
  for c in "/opt/homebrew/bin/$name" "/usr/local/bin/$name" "$HOME/.local/bin/$name" "$@"; do
    if [ -x "$c" ]; then R_PATH=$c; return 0; fi
  done
  R_PATH=""
  return 1
}

# check_bin <指令> <沒裝時的步驟> [其他候選路徑...] → R_STATUS、R_PATH、R_NOTE
check_bin() {
  local name=$1 step=$2
  shift 2
  R_STATUS=missing; R_NOTE="沒裝（mac.md 步驟 ${step}）"
  if find_bin "$name" "$@"; then
    if [ "$R_ONPATH" = 1 ]; then R_STATUS=ok; R_NOTE=""; else offpath_status "$R_PATH"; fi
  fi
}

ver_num() {
  local v=${1#v} a b c
  a=${v%%.*}; v=${v#*.}; b=${v%%.*}; c=${v#*.}; c=${c%%[!0-9]*}
  case "$a$b$c" in ''|*[!0-9]*) echo 0; return ;; esac
  echo $((a * 1000000 + b * 1000 + c))
}

ver_major() {
  local v=${1#v}
  v=${v%%.*}
  case $v in ''|*[!0-9]*) echo 0 ;; *) echo "$v" ;; esac
}

# auto-editor：pip／uv 版是 Python 小腳本，第一次執行會下載執行檔，所以不執行，改讀套件資料夾名稱
ae_version() {
  local p=$1 py d
  if [ "$(head -c 2 "$p" 2>/dev/null)" = "#!" ]; then
    py=$(head -n 1 "$p" | sed 's/^#![[:space:]]*//; s/[[:space:]].*$//')
    for d in "$(dirname "$py")"/../lib/python*/site-packages/auto_editor-*.dist-info; do
      if [ -d "$d" ]; then d=${d##*/auto_editor-}; echo "${d%.dist-info}"; return; fi
    done
    echo ""
  else
    "$p" --version 2>/dev/null | head -n 1
  fi
}

# ---------- 作業系統 ----------

MACOS=$(/usr/bin/sw_vers -productVersion 2>/dev/null)
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then ARCH=arm64; KIND="Apple 晶片"; else ARCH=x86_64; KIND="Intel"; fi
CHIP=$(/usr/sbin/sysctl -n machdep.cpu.brand_string 2>/dev/null)
ROSETTA=false
[ "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ] && ROSETTA=true

# 登入 shell：決定 M2 要寫進哪個設定檔（zsh → ~/.zprofile，bash → ~/.bash_profile）
LOGIN_SHELL=${SHELL##*/}
if [ -z "$LOGIN_SHELL" ]; then
  LOGIN_SHELL=$(/usr/bin/dscl . -read "/Users/$(/usr/bin/id -un)" UserShell 2>/dev/null | awk '{print $2}')
  LOGIN_SHELL=${LOGIN_SHELL##*/}
fi
[ -z "$LOGIN_SHELL" ] && LOGIN_SHELL=zsh
if [ "$LOGIN_SHELL" = "bash" ]; then PROFILE_HINT="~/.bash_profile"; else PROFILE_HINT="~/.zprofile"; fi

# ---------- git ----------

check_bin git M3
G_STATUS=$R_STATUS; G_PATH=$R_PATH; G_NOTE=$R_NOTE; G_VER=""
# 沒裝 Command Line Tools 時，/usr/bin/git 是空殼，一執行就跳安裝視窗，所以不要執行它
if [ "$G_PATH" = "/usr/bin/git" ] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
  G_STATUS=missing; G_PATH=""; G_NOTE="只有系統的空殼 git（Command Line Tools 沒裝）"
fi
if [ -n "$G_PATH" ]; then G_VER=$("$G_PATH" --version 2>/dev/null | awk '{print $3}'); fi

# ---------- Node.js ----------

N_STATUS=missing; N_PATH=""; N_VER=""; N_NOTE="沒裝（mac.md 步驟 M4）"
NODE_ON=$(command -v node 2>/dev/null)
if [ -n "$NODE_ON" ]; then
  N_PATH=$NODE_ON
  N_VER=$("$NODE_ON" -v 2>/dev/null)
  if [ "$(ver_major "$N_VER")" -ge "$NODE_MIN" ]; then
    N_STATUS=ok; N_NOTE="需要 $NODE_MIN 以上"
  else
    N_STATUS=too_old; N_NOTE="版本太舊，需要 $NODE_MIN 以上（mac.md 步驟 M4）"
  fi
fi
if [ "$N_STATUS" != "ok" ]; then
  BEST=""; BEST_N=0; BEST_V=""
  for c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME/.volta/bin/node" \
           "$HOME/Library/Application Support/fnm/node-versions"/*/installation/bin/node "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node; do
    [ -x "$c" ] || continue
    [ "$c" = "$NODE_ON" ] && continue
    v=$("$c" -v 2>/dev/null); n=$(ver_num "$v")
    if [ "$n" -gt "$BEST_N" ]; then BEST=$c; BEST_N=$n; BEST_V=$v; fi
  done
  if [ -n "$BEST" ] && [ "$(ver_major "$BEST_V")" -ge "$NODE_MIN" ]; then
    if [ "$N_STATUS" = "too_old" ]; then
      N_NOTE="${N_NOTE}；另外在 $(disp "$BEST") 有 ${BEST_V}，但這個視窗用的是舊的"
    else
      offpath_status "$BEST"
      N_STATUS=$R_STATUS; N_PATH=$BEST; N_VER=$BEST_V; N_NOTE=$R_NOTE
    fi
  elif [ -n "$BEST" ] && [ "$N_STATUS" = "missing" ]; then
    N_STATUS=too_old; N_PATH=$BEST; N_VER=$BEST_V; N_NOTE="版本太舊，需要 $NODE_MIN 以上（mac.md 步驟 M4）"
  fi
fi

# ---------- npm（跟 Node.js 一起裝） ----------

M_STATUS=missing; M_PATH=""; M_VER=""; M_NOTE="Node.js 裝好就會有（mac.md 步驟 M4）"
NPM_ON=$(command -v npm 2>/dev/null)
if [ -n "$NPM_ON" ] && [ "$N_STATUS" = "ok" ]; then
  M_STATUS=ok; M_PATH=$NPM_ON; M_VER=$(npm -v 2>/dev/null); M_NOTE=""
elif [ -n "$N_PATH" ] && [ -x "$(dirname "$N_PATH")/npm" ]; then
  M_PATH="$(dirname "$N_PATH")/npm"
  M_VER=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$(dirname "$N_PATH")/../lib/node_modules/npm/package.json" 2>/dev/null | head -n 1)
  M_STATUS=$N_STATUS; M_NOTE="跟 Node.js 一樣處理"
fi
if [ "$M_STATUS" != "missing" ] && ! command -v npx >/dev/null 2>&1 && [ ! -x "$(dirname "$M_PATH")/npx" ]; then
  M_NOTE="${M_NOTE}；找不到 npx"
fi

# ---------- FFmpeg、FFprobe ----------

check_bin ffmpeg M5
F_STATUS=$R_STATUS; F_PATH=$R_PATH; F_NOTE=$R_NOTE; F_VER=""
[ -n "$F_PATH" ] && F_VER=$("$F_PATH" -version 2>/dev/null | head -n 1 | awk '{print $3}')

check_bin ffprobe M5
P_STATUS=$R_STATUS; P_PATH=$R_PATH; P_NOTE=$R_NOTE; P_VER=""
[ -n "$P_PATH" ] && P_VER=$("$P_PATH" -version 2>/dev/null | head -n 1 | awk '{print $3}')

# ---------- whisper-cli（HyperFrames 找的順序：環境變數 → PATH → Homebrew 兩個位置 → 自己編譯的） ----------

W_STATUS=missing; W_PATH=""; W_VER=""
W_NOTE="沒裝（mac.md 步驟 M6；不裝的話，第一次轉逐字稿 HyperFrames 會自己用 brew 安裝，畫面停 30–40 秒）"
W_ENV_NOTE=""
if [ -n "$HYPERFRAMES_WHISPER_PATH" ]; then
  if [ -x "$HYPERFRAMES_WHISPER_PATH" ]; then
    W_STATUS=ok; W_PATH=$HYPERFRAMES_WHISPER_PATH; W_NOTE="來自 HYPERFRAMES_WHISPER_PATH"
  else
    W_ENV_NOTE="HYPERFRAMES_WHISPER_PATH 指到的檔案不存在：$HYPERFRAMES_WHISPER_PATH"
  fi
fi
if [ "$W_STATUS" != "ok" ]; then
  WON=$(command -v whisper-cli 2>/dev/null)
  if [ -n "$WON" ]; then
    W_STATUS=ok; W_PATH=$WON; W_NOTE=""
  else
    for c in /opt/homebrew/bin/whisper-cli /usr/local/bin/whisper-cli \
             "$HOME/.cache/hyperframes/whisper/whisper.cpp/build/bin/whisper-cli" "$HOME/.cache/hyperframes/whisper/whisper.cpp/build/whisper-cli"; do
      if [ -x "$c" ]; then W_STATUS=ok; W_PATH=$c; W_NOTE="不在 PATH 上，但 HyperFrames 會直接找這個位置"; break; fi
    done
  fi
fi
[ -n "$W_ENV_NOTE" ] && W_NOTE="${W_NOTE:+${W_NOTE}；}${W_ENV_NOTE}"
[ -n "$W_PATH" ] && W_VER=$("$W_PATH" --version 2>&1 | sed -n 's/.*version:[[:space:]]*//p' | head -n 1)

# ---------- auto-editor ----------

check_bin auto-editor M7 "$HOME/.local/bin/auto-editor" /Library/Frameworks/Python.framework/Versions/*/bin/auto-editor
A_STATUS=$R_STATUS; A_PATH=$R_PATH; A_NOTE=$R_NOTE; A_VER=""
if [ -n "$A_PATH" ]; then
  A_VER=$(ae_version "$A_PATH")
  if [ "$(head -c 2 "$A_PATH" 2>/dev/null)" = "#!" ]; then
    A_NOTE="${A_NOTE:+${A_NOTE}；}pip／uv 版（第一次執行會先下載執行檔，稍等即可）"
  fi
fi

# ---------- Homebrew（只有還要裝東西時才需要） ----------

BREW_NEEDED=0
for st in "$G_STATUS" "$N_STATUS" "$M_STATUS" "$F_STATUS" "$P_STATUS" "$W_STATUS" "$A_STATUS"; do
  case $st in missing|too_old) BREW_NEEDED=1 ;; esac
done
B_REQ=$BREW_NEEDED; B_VER=""; B_NOTE=""
if find_bin brew /opt/homebrew/bin/brew /usr/local/bin/brew; then
  B_PATH=$R_PATH
  B_VER=$("$B_PATH" --version 2>/dev/null | head -n 1 | awk '{print $2}')
  if [ "$R_ONPATH" = 1 ]; then
    B_STATUS=ok
  else
    offpath_status "$B_PATH"; B_STATUS=$R_STATUS; B_NOTE=$R_NOTE; B_REQ=1
  fi
else
  B_PATH=""
  if [ "$BREW_NEEDED" = 1 ]; then
    B_STATUS=missing; B_NOTE="要先裝（mac.md 步驟 M1，要請使用者輸入電腦密碼）"
  else
    B_STATUS=info; B_NOTE="沒裝；其他工具都在，可以不裝"
  fi
fi
G_STEP=M3
if [ "$G_STATUS" = "missing" ] && [ "$B_STATUS" != "ok" ]; then
  G_STEP=M1; G_NOTE="沒裝；裝 Homebrew 時會一起裝好（mac.md 步驟 M1）"
fi

# ---------- 兩組 Skill ----------

skill_status() {
  local d="$SKILLS_DIR/$1"
  R_PATH=$d
  if [ -f "$d/SKILL.md" ]; then R_STATUS=ok; R_NOTE=""
  elif [ -d "$d" ]; then R_STATUS=missing; R_NOTE="資料夾在，但沒有 SKILL.md，重裝（README 共用步驟 $2）"
  else R_STATUS=missing; R_NOTE="沒裝（README 共用步驟 $2）"; fi
}

# ---------- 轉逐字稿模型（參考，不算必要） ----------

if [ -f "$MODEL_FILE" ]; then
  SIZE=$(stat -f %z "$MODEL_FILE" 2>/dev/null)
  if [ "$SIZE" = "$MODEL_BYTES" ]; then
    MODEL_STATUS=ok; MODEL_NOTE="已下載"
  else
    MODEL_STATUS=incomplete; MODEL_NOTE="下載不完整（$SIZE bytes），第一次轉逐字稿時會重新下載"
  fi
else
  MODEL_STATUS=info; MODEL_NOTE="還沒下載；第一次轉逐字稿時自動下載（約 488 MB），不用先處理"
fi

# ---------- 輸出 ----------

add_item brew "Homebrew" "$B_STATUS" "$B_VER" "$B_PATH" "$B_NOTE" "$B_REQ" "M1"
add_item git "git" "$G_STATUS" "$G_VER" "$G_PATH" "$G_NOTE" 1 "$G_STEP"
add_item node "Node.js" "$N_STATUS" "$N_VER" "$N_PATH" "$N_NOTE" 1 "M4"
add_item npm "npm" "$M_STATUS" "$M_VER" "$M_PATH" "$M_NOTE" 1 "M4"
add_item ffmpeg "FFmpeg" "$F_STATUS" "$F_VER" "$F_PATH" "$F_NOTE" 1 "M5"
add_item ffprobe "FFprobe" "$P_STATUS" "$P_VER" "$P_PATH" "$P_NOTE" 1 "M5"
add_item whisper "whisper-cli" "$W_STATUS" "$W_VER" "$W_PATH" "$W_NOTE" 1 "M6"
add_item auto_editor "auto-editor" "$A_STATUS" "$A_VER" "$A_PATH" "$A_NOTE" 1 "M7"
skill_status hyperframes S1
add_item skill_hyperframes "Skill：hyperframes" "$R_STATUS" "" "$R_PATH" "$R_NOTE" 1 "S1"
skill_status auto-editor S2
add_item skill_auto_editor "Skill：auto-editor" "$R_STATUS" "" "$R_PATH" "$R_NOTE" 1 "S2"

# 工作區的 HyperFrames（S3：npm install 照 package.json 釘的版本）
WS_ROOT=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)
HF_PIN=$(sed -n 's/.*"hyperframes"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WS_ROOT/package.json" 2>/dev/null | head -n 1)
HF_LOCAL=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WS_ROOT/node_modules/hyperframes/package.json" 2>/dev/null | head -n 1)
if [ -z "$HF_LOCAL" ]; then HL_STATUS=missing; HL_NOTE="沒裝（README 共用步驟 S3：在工作區根目錄 npm install）"
elif [ -n "$HF_PIN" ] && [ "$HF_LOCAL" != "$HF_PIN" ]; then HL_STATUS=too_old; HL_NOTE="和 package.json 釘的 $HF_PIN 不同（README 共用步驟 S3）"
else HL_STATUS=ok; HL_NOTE=""; fi
add_item hyperframes_local "工作區的 HyperFrames" "$HL_STATUS" "$HF_LOCAL" "$WS_ROOT/node_modules/hyperframes" "$HL_NOTE" 1 "S3"

# 9 支 auto-edit Skill（S4：node setup/install-skills.mjs）
AE_MISSING=""
for s in longform setup rough storyboard screen motion review deliver style; do
  [ -f "$SKILLS_DIR/auto-edit-$s/SKILL.md" ] || AE_MISSING="${AE_MISSING}${AE_MISSING:+、}auto-edit-$s"
done
if [ -z "$AE_MISSING" ]; then AE_STATUS=ok; AE_NOTE=""; else AE_STATUS=missing; AE_NOTE="少了 ${AE_MISSING}（README 共用步驟 S4）"; fi
add_item skill_auto_edit "Skill：auto-edit（9 支）" "$AE_STATUS" "" "$SKILLS_DIR" "$AE_NOTE" 1 "S4"

# 臉部偵測檔（S5：look.mjs ensure；瘦臉是選用，missing 不算進 todo）
MP_DIR="$WS_ROOT/shared/template/vendor/mediapipe"
MP_MISSING=""
for f in vision_bundle.mjs wasm/vision_wasm_internal.js wasm/vision_wasm_internal.wasm face_landmarker.task; do
  [ -f "$MP_DIR/$f" ] || MP_MISSING="${MP_MISSING}${MP_MISSING:+、}$f"
done
if [ -z "$MP_MISSING" ]; then MP_STATUS=ok; MP_NOTE="檔案都在；完整性用 look.mjs ensure 檢查（README 共用步驟 S5）"; else MP_STATUS=missing; MP_NOTE="少了 ${MP_MISSING}（README 共用步驟 S5；不裝也能剪，只是不瘦臉）"; fi
add_item mediapipe "臉部偵測檔（瘦臉用）" "$MP_STATUS" "" "$MP_DIR" "$MP_NOTE" 0 "S5"
add_item whisper_model "轉逐字稿模型" "$MODEL_STATUS" "" "$MODEL_FILE" "$MODEL_NOTE" 0 ""

HEAD="作業系統：macOS ${MACOS}（${KIND}"
[ -n "$CHIP" ] && HEAD="${HEAD}，${CHIP}"
HEAD="${HEAD}，${ARCH}）"
[ "$ROSETTA" = true ] && HEAD="${HEAD}（目前在 Rosetta 轉譯下執行）"
HEAD="${HEAD}；登入 shell：${LOGIN_SHELL}（設定檔 ${PROFILE_HINT}）"

echo "=== 環境檢測（Mac）==="
echo "$HEAD"
printf '%s' "$LINES"

ALL_OK=false
if [ "$TODO_COUNT" = 0 ]; then
  ALL_OK=true
  echo "結果：全部就緒 ✅"
elif [ -z "$GROUP_PATH$GROUP_INSTALL$GROUP_SKILL" ]; then
  echo "結果：工具都裝好了，只是這個視窗還看不到（重開 MiniMax Code，M8）：${GROUP_RESTART}"
else
  SUMMARY=""
  [ -n "$GROUP_PATH" ] && SUMMARY="路徑沒設定（M2 一步處理）：${GROUP_PATH}"
  [ -n "$GROUP_INSTALL" ] && SUMMARY="${SUMMARY}${SUMMARY:+／}要安裝：${GROUP_INSTALL}"
  [ -n "$GROUP_SKILL" ] && SUMMARY="${SUMMARY}${SUMMARY:+／}Skill：${GROUP_SKILL}"
  [ -n "$GROUP_RESTART" ] && SUMMARY="${SUMMARY}${SUMMARY:+／}重開 MiniMax Code 就看得到（M8）：${GROUP_RESTART}"
  echo "結果：${SUMMARY}"
fi

echo "JSON: {\"script\":\"check.sh\",\"os\":\"mac\",\"os_version\":$(json_str "$MACOS"),\"arch\":\"$ARCH\",\"chip\":$(json_str "$CHIP"),\"rosetta\":$ROSETTA,\"shell\":$(json_str "$LOGIN_SHELL"),\"all_ok\":$ALL_OK,\"need_restart\":$NEED_RESTART,\"todo\":[$TODO],\"items\":{$JSON_ITEMS}}"
exit 0
