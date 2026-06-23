# Emoji -> Lucide icon name map for fuluckpet.com de-emoji refactor.
# Values must match an SVG filename in /Users/lauralyu/Desktop/svg/icons/<name>.svg
# Emoji NOT in this map are left untouched (arrows, bullets, gender handled separately).

MAP = {
    # paws & cats & animals
    "🐾": "paw-print", "🐱": "cat", "🐈": "cat", "🐈‍⬛": "cat", "🐕": "dog",
    # awards / ratings / celebrate
    "🏆": "trophy", "🥇": "trophy", "🥈": "medal", "🏅": "medal",
    "⭐": "star", "★": "star", "✨": "sparkles", "👏": "sparkles", "🎉": "party-popper",
    # contact / messaging
    "💬": "message-circle", "📞": "phone", "📲": "smartphone", "📱": "smartphone",
    "📧": "mail", "📩": "mail", "✉": "mail", "📨": "mail",
    # time
    "📅": "calendar-check", "⏱": "timer", "⏰": "alarm-clock", "🕐": "clock", "⏸": "circle-pause",
    # docs / info / knowledge
    "📖": "book-open", "📘": "book-open", "📚": "library", "📋": "clipboard-list",
    "📝": "square-pen", "📄": "file-text", "📃": "file-text", "💡": "lightbulb",
    "🔬": "microscope", "🧬": "dna", "📐": "ruler", "📌": "pin", "❓": "circle-help",
    "📊": "chart-column", "📈": "trending-up",
    # place / building
    "📍": "map-pin", "🏠": "house", "🏡": "house", "🏢": "building-2", "🏬": "building-2", "🏥": "hospital",
    # checks / alerts / security
    "✅": "circle-check", "✓": "check", "☑": "square-check", "⚠": "triangle-alert",
    "🚫": "ban", "🛡": "shield-check", "🔒": "lock", "🔐": "lock-keyhole", "🔗": "link", "⚖": "scale",
    # nature / health
    "🌿": "leaf", "🌱": "sprout", "🩺": "stethoscope", "💊": "pill", "💧": "droplet",
    "❄": "snowflake", "🌡": "thermometer", "🌞": "sun", "🌙": "moon", "🌐": "globe", "🌏": "globe",
    "🤧": "wind", "😴": "moon",
    # money / shop
    "💰": "japanese-yen", "🛒": "shopping-cart",
    # media
    "📷": "camera", "📸": "camera", "🖼": "image", "📹": "video", "🎬": "clapperboard",
    "📺": "tv", "🎵": "music", "🔊": "volume-2",
    # files / cloud / actions
    "💾": "save", "☁": "cloud", "📤": "upload", "📥": "download", "🔄": "refresh-cw",
    "📂": "folder-open", "📁": "folder", "🗑": "trash-2", "👁": "eye", "👀": "eye",
    "🖌": "brush", "✕": "x", "✂": "scissors",
    # transport / travel
    "🚚": "truck", "🚗": "car", "✈": "plane", "🚪": "door-open", "🧳": "luggage", "🎒": "backpack",
    # people / emotion
    "🤝": "handshake", "❤": "heart", "💕": "heart", "😊": "smile", "😄": "smile",
    "🧠": "brain", "🤲": "hand-heart", "✋": "hand", "👫": "users", "👶": "baby",
    "👨": "users", "👩": "users", "👧": "users", "💪": "dumbbell",
    # household / cat supplies (guide checklists)
    "🍽": "utensils", "🥫": "utensils", "🚽": "toilet", "🚿": "bath", "🛁": "bath",
    "🪵": "package", "🪨": "package", "🧱": "brick-wall", "🛏": "bed", "🧸": "gift",
    "🧴": "spray-can", "🧣": "shirt", "🧵": "fish", "🪟": "blinds", "🧹": "brush-cleaning",
    "⚡": "zap", "🎣": "fish", "🐟": "fish", "🦴": "bone", "🌬": "wind",
    # settings / misc
    "⚙": "settings", "🔍": "search",
    # gender (kitten cards)
    "♀": "venus", "♂": "mars",
}

# Pure-text glyphs to KEEP (not emoji): arrows, bullets, etc. Listed for documentation.
KEEP = set("←→↑↓↗↘↙↖↔↕↶↷•·▼▲◀▶")
