// build.mjs --gallery 產生，不要手改
window.__SFX_DATA = {
  "generated": "2026-11-02T03:15:21.838Z",
  "sounds": {
    "ding": {
      "kind": "sfx",
      "zh": "提示「滴」",
      "use": "講重點、提醒（「提醒一下大家」）、答案揭曉",
      "event": "重點字出現那一格",
      "peak": 0.01,
      "volume": 0.468,
      "targetDb": -12.6,
      "additive": false,
      "maxPerVideo": null
    },
    "success": {
      "kind": "sfx",
      "zh": "完成音",
      "use": "解法、成果、完成、問題解決",
      "event": "綠勾或結果出現那一格",
      "peak": 0.137,
      "volume": 0.692,
      "targetDb": -5.2,
      "additive": false,
      "maxPerVideo": null
    },
    "alert": {
      "kind": "sfx",
      "zh": "錯誤「嗶嗶」",
      "use": "千萬不要、踩坑、錯誤、限制",
      "event": "紅章或警告出現那一格",
      "peak": 0.018,
      "volume": 0.569,
      "targetDb": -6.9,
      "additive": false,
      "maxPerVideo": null
    },
    "impact": {
      "kind": "sfx",
      "zh": "綜藝「咚咚」",
      "use": "蓋章、重擊、數字或金句落定",
      "event": "落定、蓋章落地那一格（第一下）",
      "peak": 0.134,
      "volume": 0.617,
      "targetDb": -6.2,
      "additive": false,
      "maxPerVideo": null
    },
    "click": {
      "kind": "sfx",
      "zh": "滑鼠點擊",
      "use": "螢幕錄影或情境動畫裡看得到游標按下的地方，一下一顆",
      "event": "游標按下那一格",
      "peak": 0.015,
      "volume": 0.422,
      "targetDb": -19.6,
      "additive": true,
      "maxPerVideo": null
    },
    "chapter": {
      "kind": "sfx",
      "zh": "章節「嘭」",
      "use": "章節轉場（01）",
      "event": "章名落定那一格（01 的 titleAt＝段起點＋0.45 s）",
      "peak": 0.021,
      "volume": 0.891,
      "targetDb": -3,
      "additive": false,
      "maxPerVideo": null
    },
    "sparkle": {
      "kind": "sfx",
      "zh": "閃粉",
      "use": "入場、介紹主角（14 講者介紹）、金句閃亮（15）",
      "event": "主角或金句出現完成那一格",
      "peak": 0.18,
      "volume": 0.638,
      "targetDb": -5.9,
      "additive": false,
      "maxPerVideo": 6
    },
    "shine": {
      "kind": "sfx",
      "zh": "閃亮登場",
      "use": "轉折亮點：本集最得意的設計、關鍵詞大字進場",
      "event": "關鍵詞到位那一格",
      "peak": 0.699,
      "volume": 0.891,
      "targetDb": -3,
      "additive": false,
      "maxPerVideo": 3
    },
    "thunder": {
      "kind": "sfx",
      "zh": "打雷",
      "use": "負面情緒：壓力、焦慮、晴天霹靂（15 金句 tone warn 預設）",
      "event": "負面問句或壞消息出現那一格",
      "peak": 0.2,
      "volume": 0.891,
      "targetDb": -3,
      "additive": false,
      "maxPerVideo": 3
    },
    "bgm-cylinder-five": {
      "kind": "bgm",
      "zh": "片尾配樂〈Cylinder Five〉",
      "use": "結語金句講完到片尾；預設不配，plan.json 的 outro 寫 \"music\":    \"bgm-cylinder-five\" 才有",
      "event": "outro.from 那句字幕的起點",
      "peak": 0,
      "volume": 0.562,
      "targetDb": -11,
      "additive": false,
      "maxPerVideo": null,
      "fadeIn": 3.2,
      "fadeOut": 1.85,
      "credit": "Music: \"Cylinder Five\" by Chris Zabriskie (http://chriszabriskie.com/cylinders/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)"
    }
  },
  "scenes": {
    "chapter": {
      "zh": "章節轉場",
      "no": "01",
      "main": {
        "sound": "chapter",
        "at": 0.45
      },
      "extra": []
    },
    "chapter-tag": {
      "zh": "章節角標",
      "no": "02",
      "main": null,
      "extra": []
    },
    "side-panel": {
      "zh": "半版側邊欄",
      "no": "03",
      "main": null,
      "extra": []
    },
    "fs-list": {
      "zh": "全畫面清單",
      "no": "04a",
      "main": null,
      "extra": []
    },
    "fs-compare": {
      "zh": "全畫面對照",
      "no": "04b",
      "main": null,
      "extra": []
    },
    "fs-flow": {
      "zh": "全畫面流程",
      "no": "04c",
      "main": null,
      "extra": []
    },
    "fs-table": {
      "zh": "全畫面表格",
      "no": "04d",
      "main": null,
      "extra": []
    },
    "two-sides": {
      "zh": "兩側",
      "no": "05",
      "main": null,
      "extra": []
    },
    "concept": {
      "zh": "一般字卡",
      "no": "06",
      "main": null,
      "extra": []
    },
    "key-point": {
      "zh": "重點字卡",
      "no": "07",
      "main": {
        "sound": "ding",
        "at": 0.15
      },
      "extra": []
    },
    "steps": {
      "zh": "Step 字卡",
      "no": "08",
      "main": null,
      "extra": []
    },
    "qa": {
      "zh": "QA 字卡",
      "no": "09",
      "main": null,
      "extra": [
        {
          "sound": "ding",
          "at": 1.9
        }
      ]
    },
    "tips": {
      "zh": "Tips 字卡",
      "no": "10",
      "main": null,
      "extra": []
    },
    "summary": {
      "zh": "總結字卡",
      "no": "11",
      "main": null,
      "extra": []
    },
    "keywords": {
      "zh": "關鍵詞條列",
      "no": "12",
      "main": null,
      "extra": []
    },
    "title-list": {
      "zh": "標題條列",
      "no": "13",
      "main": null,
      "extra": []
    },
    "speaker": {
      "zh": "講者介紹",
      "no": "14",
      "main": {
        "sound": "sparkle",
        "at": 0.1
      },
      "extra": []
    },
    "quote": {
      "zh": "金句字卡",
      "no": "15",
      "main": {
        "sound": "sparkle",
        "at": 0.1
      },
      "extra": []
    }
  },
  "fx": {
    "16": {
      "sound": "impact",
      "at": 0
    },
    "24": {
      "sound": "impact",
      "at": 0
    },
    "29": {
      "sound": "ding",
      "at": 1.8
    },
    "01": {
      "sound": "impact",
      "at": 0.42
    },
    "02": {
      "sound": "impact",
      "at": 0.22
    },
    "03": {
      "sound": "impact",
      "at": 0.3
    }
  }
};
