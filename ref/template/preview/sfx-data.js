// build.mjs --gallery 產生，不要手改
window.__SFX_DATA = {
  "generated": "2026-10-29T13:46:47.122Z",
  "sounds": {
    "pop": {
      "zh": "泡泡 pop",
      "use": "下方字卡揭開、第一張卡片出現",
      "peak": 0.01,
      "volume": 0.6
    },
    "tick": {
      "zh": "輕 tick",
      "use": "條列逐條出現、步驟切換，每條一顆",
      "peak": 0.005,
      "volume": 0.55
    },
    "swipe": {
      "zh": "短 swoosh",
      "use": "側邊欄推入、角標滑入",
      "peak": 0.07,
      "volume": 0.55
    },
    "whoosh": {
      "zh": "空氣 whoosh",
      "use": "章節轉場、全畫面幕進場",
      "peak": 0.743,
      "volume": 0.5
    },
    "ding": {
      "zh": "清亮鈴聲",
      "use": "講重點、答案揭曉",
      "peak": 0.016,
      "volume": 0.4
    },
    "success": {
      "zh": "完成 chime",
      "use": "解法、成果、完成",
      "peak": 0,
      "volume": 0.45
    },
    "alert": {
      "zh": "柔和錯誤音",
      "use": "千萬不要、踩坑、注意",
      "peak": 0.039,
      "volume": 0.4
    },
    "impact": {
      "zh": "悶重 thud",
      "use": "蓋章、重擊、字爆發",
      "peak": 0.003,
      "volume": 0.9
    },
    "flip": {
      "zh": "翻牌",
      "use": "翻牌、翻卡、切換",
      "peak": 0.078,
      "volume": 0.8
    },
    "type": {
      "zh": "打字短串",
      "use": "打字機動畫起手",
      "peak": 0.005,
      "volume": 0.3
    },
    "glitch": {
      "zh": "數位故障",
      "use": "出錯、系統崩潰、bug",
      "peak": 0.016,
      "volume": 0.35
    },
    "riser": {
      "zh": "上升張力音",
      "use": "隧道、穿越、揭曉前的鋪墊（峰值在結尾）",
      "peak": 1.472,
      "volume": 0.45
    }
  },
  "scenes": {
    "chapter": {
      "zh": "章節轉場",
      "no": "01",
      "main": {
        "sound": "whoosh",
        "at": -0.15
      },
      "extra": []
    },
    "chapter-tag": {
      "zh": "章節角標",
      "no": "02",
      "main": {
        "sound": "swipe",
        "at": 0
      },
      "extra": []
    },
    "side-panel": {
      "zh": "半版側邊欄",
      "no": "03",
      "main": {
        "sound": "swipe",
        "at": 0
      },
      "extra": [
        {
          "sound": "tick",
          "at": 1.3
        },
        {
          "sound": "tick",
          "at": 1.9
        },
        {
          "sound": "tick",
          "at": 2.5
        }
      ]
    },
    "fs-list": {
      "zh": "全畫面清單",
      "no": "04a",
      "main": {
        "sound": "whoosh",
        "at": -0.15
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.5
        },
        {
          "sound": "tick",
          "at": 0.85
        },
        {
          "sound": "tick",
          "at": 1.2
        }
      ]
    },
    "fs-compare": {
      "zh": "全畫面對照",
      "no": "04b",
      "main": {
        "sound": "whoosh",
        "at": -0.15
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.5
        },
        {
          "sound": "tick",
          "at": 2.5
        }
      ]
    },
    "fs-flow": {
      "zh": "全畫面流程",
      "no": "04c",
      "main": {
        "sound": "whoosh",
        "at": -0.15
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.5
        },
        {
          "sound": "tick",
          "at": 0.85
        },
        {
          "sound": "tick",
          "at": 1.2
        },
        {
          "sound": "tick",
          "at": 1.55
        }
      ]
    },
    "fs-table": {
      "zh": "全畫面表格",
      "no": "04d",
      "main": {
        "sound": "whoosh",
        "at": -0.15
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.85
        },
        {
          "sound": "tick",
          "at": 1.2
        },
        {
          "sound": "tick",
          "at": 1.55
        }
      ]
    },
    "two-sides": {
      "zh": "兩側",
      "no": "05",
      "main": {
        "sound": "pop",
        "at": 0.2
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.55
        },
        {
          "sound": "tick",
          "at": 0.9
        },
        {
          "sound": "tick",
          "at": 1.25
        }
      ]
    },
    "concept": {
      "zh": "一般字卡",
      "no": "06",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
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
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": [
        {
          "sound": "tick",
          "at": 2.75
        },
        {
          "sound": "tick",
          "at": 5.35
        }
      ]
    },
    "qa": {
      "zh": "QA 字卡",
      "no": "09",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
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
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": []
    },
    "summary": {
      "zh": "總結字卡",
      "no": "11",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": []
    },
    "keywords": {
      "zh": "關鍵詞條列",
      "no": "12",
      "main": {
        "sound": "pop",
        "at": 0.2
      },
      "extra": [
        {
          "sound": "tick",
          "at": 0.7
        },
        {
          "sound": "tick",
          "at": 1.2
        }
      ]
    },
    "title-list": {
      "zh": "標題條列",
      "no": "13",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": [
        {
          "sound": "tick",
          "at": 2.55
        },
        {
          "sound": "tick",
          "at": 4.95
        }
      ]
    },
    "speaker": {
      "zh": "講者介紹",
      "no": "14",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": []
    },
    "quote": {
      "zh": "金句字卡",
      "no": "15",
      "main": {
        "sound": "pop",
        "at": 0.1
      },
      "extra": []
    }
  },
  "fx": {
    "12": {
      "sound": "swipe",
      "at": 0
    },
    "13": {
      "sound": "swipe",
      "at": 0
    },
    "16": {
      "sound": "impact",
      "at": 0
    },
    "17": {
      "sound": "riser",
      "at": 2.67
    },
    "18": {
      "sound": "riser",
      "at": 3
    },
    "20": {
      "sound": "riser",
      "at": 3.52
    },
    "21": {
      "sound": "riser",
      "at": 2.77
    },
    "23": {
      "sound": "flip",
      "at": 1
    },
    "24": {
      "sound": "impact",
      "at": 0
    },
    "25": {
      "sound": "flip",
      "at": 0.39
    },
    "26": {
      "sound": "flip",
      "at": 1
    },
    "27": {
      "sound": "type",
      "at": 0.4
    },
    "28": {
      "sound": "flip",
      "at": 1.7
    },
    "29": {
      "sound": "ding",
      "at": 1.8
    },
    "30": {
      "sound": "swipe",
      "at": 0.65
    },
    "32": {
      "sound": "swipe",
      "at": 0.67
    },
    "33": {
      "sound": "pop",
      "at": 0.6
    },
    "34": {
      "sound": "glitch",
      "at": 0.68
    },
    "35": {
      "sound": "pop",
      "at": 0
    },
    "36": {
      "sound": "pop",
      "at": 0
    },
    "37": {
      "sound": "riser",
      "at": 1.48
    },
    "38": {
      "sound": "swipe",
      "at": 0.3
    },
    "39": {
      "sound": "flip",
      "at": 0.75
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
    },
    "04": {
      "sound": "whoosh",
      "at": 0.35
    },
    "05": {
      "sound": "pop",
      "at": 0.4
    },
    "06": {
      "sound": "pop",
      "at": 0.38
    },
    "07": {
      "sound": "whoosh",
      "at": 0.84
    },
    "08": {
      "sound": "pop",
      "at": 0.75
    },
    "09": {
      "sound": "swipe",
      "at": 0
    }
  }
};
