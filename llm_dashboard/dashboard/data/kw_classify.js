/**
 * 关键词分类配置 (可手动编辑)
 * manual: 手动指定分类 { "关键词": "分类名" }
 * rules: 自动分类的优先级规则（从高到低匹配，命中即停止）
 *   pattern: 正则模式，用 /.../ 包裹
 *   type: 分类名
 */
window.KW_CLASSIFY = {
  "manual": {
    "laminator": "核心大词",
    "laminators": "核心大词",
    "laminator machine": "核心大词",
    "laminating machine": "核心大词",
    "thermal laminator": "二级词",
    "cold laminator": "二级词",
    "a4 laminator": "属性词",
    "laminator a4": "属性词",
    "laminating sheets": "关联词",
    "laminator pouches": "关联词",
    "vacuum sealer": "核心大词",
    "vacuum sealer machine": "核心大词",
    "food vacuum sealer": "二级词",
    "food sealer": "二级词",
    "sealer machine": "二级词",
    "adhesive hooks": "核心大词",
    "heavy duty hooks": "二级词",
    "wall hooks": "二级词",
    "sticky hooks": "属性词",
    "command hooks": "属性词",
    "bathroom hooks": "属性词",
    "hanger hooks": "属性词",
    "hanger connectors": "属性词",
    "clothes hanger hooks": "属性词",
    "portable fan": "核心大词",
    "handheld fan": "核心大词",
    "mini fan": "二级词",
    "rechargeable fan": "属性词",
    "desk fan": "属性词",
    "usb fan": "属性词",
    "neck fan": "属性词",
    "night light": "核心大词",
    "night lights": "核心大词",
    "led night light": "二级词",
    "kids night light": "属性词",
    "klebehaken": "核心大词",
    "laminiergerät": "核心大词",
    "laminiergerät a4": "属性词",
    "envasadora al vacio": "核心大词",
    "ganchos adhesivos": "核心大词"
  },
  "rules": [
    {"pattern": "/^\\d+词$/", "type": "自动投放"},
    {"pattern": "/^(紧密匹配|宽泛匹配|同类商品|与您的落地页相关的关键词|商品|分类|关键词组)/", "type": "自动投放"},
    {"pattern": "/^B0[A-Z0-9]{8}$/", "type": "竞品ASIN"},
    {"pattern": "/^[A-Z0-9]{10}$/", "type": "竞品ASIN"},
    {"pattern": "/^[^-]+-[^-]+-[^-]+-[^-]+$/", "type": "自动投放"},
    {"pattern": "/商品[：:]/", "type": "竞品ASIN"},
    {"pattern": "/^[a-zA-Z]+$|^[a-zA-ZäöüÄÖÜéèêëàâîïôûç]+$/", "type": "核心大词"},
    {"pattern": "/^[a-zA-Z]+ [a-zA-Z]+$/|^[a-zA-Zäöü]+ [a-zA-Zäöü]+$/", "type": "二级词"},
    {"pattern": "/^.+ .+ .+$/", "type": "属性词/长尾词"}
  ],
  "negKeywords": []
};
