/**
 * Pishva Telegram Bot - Worker: pishvabot
 * Database: pishva-db
 */

const ITEMS = {
  "bat": { type: "weapon", price: 1000, val: 50, name: "چوب بیسبال 🏏" },
  "knife": { type: "weapon", price: 1200, val: 65, name: "چاقو 🔪" },
  "pistol": { type: "weapon", price: 5200, val: 100, name: "پیستول 🔫" },
  "grenade": { type: "weapon", price: 6000, val: 200, name: "نارنجک 💣" },
  "shotgun": { type: "weapon", price: 7000, val: 210, name: "شاتگان 💥" },
  "sniper": { type: "weapon", price: 10000, val: 300, name: "اسنایپر 🎯" },
  "rpg": { type: "weapon", price: 10000, val: 300, name: "آرپی‌جی 🚀" },
  
  "mask": { type: "armor", price: 1000, val: 0, name: "ماسک صورت 🎭" },
  "vest1": { type: "armor", price: 1000, val: 200, name: "جلیقه سطح ۱ 🛡" },
  "vest3": { type: "armor", price: 2800, val: 600, name: "جلیقه سطح ۳ 🛡" },
  "vest5": { type: "armor", price: 3999, val: 1000, name: "جلیقه سطح ۵ 🛡" },
  "knee": { type: "armor", price: 2000, val: 400, name: "زانوبند 🦵" },
  "cop": { type: "armor", price: 8000, val: 2500, name: "لباس جعلی پلیس 👮‍♂️" }
};

const BANKS = [
  { val: 1000, minHp: 50, minDmg: 20, winRatio: 1.2 },
  { val: 3000, minHp: 100, minDmg: 40, winRatio: 1.3 },
  { val: 6000, minHp: 200, minDmg: 100, winRatio: 1.5 },
  { val: 9000, minHp: 300, minDmg: 150, winRatio: 2.0 },
  { val: 10000, minHp: 400, minDmg: 200, winRatio: 3.5 },
  { val: 17000, minHp: 600, minDmg: 300, winRatio: 4.0 },
  { val: 20000, minHp: 800, minDmg: 400, winRatio: 4.5 },
  { val: 22000, minHp: 1000, minDmg: 500, winRatio: 5.0 }
];

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Pishvabot Worker is Running!");
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      if (!env.DB) {
        throw new Error("اتصال D1 یافت نشد! در تنظیمات ورکر Variable name را برابر DB بگذارید.");
      }
      
      // ساخت خودکار جدول‌ها در صورت عدم وجود
      await initDb(env.DB);
      
      await handleUpdate(update, env);
    } catch (error) {
      const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
      const messageId = update?.message?.message_id || update?.callback_query?.message?.message_id;

      if (chatId) {
        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: `🚨 **ارور دیتابیس پیشوا!**\n\n\`\`\`\n${error.message}\n\`\`\``,
          parse_mode: "Markdown",
          reply_to_message_id: messageId
        });
      }
    }

    return new Response("OK");
  }
};

async function initDb(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        marks INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        dorood_count INTEGER DEFAULT 0,
        punish_count INTEGER DEFAULT 0,
        bank_rob_count INTEGER DEFAULT 0,
        soldier_rob_count INTEGER DEFAULT 0,
        last_dorood_time INTEGER DEFAULT 0,
        last_bank_rob INTEGER DEFAULT 0,
        last_soldier_rob INTEGER DEFAULT 0,
        pending_action TEXT DEFAULT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS inventory (
        user_id INTEGER,
        item_type TEXT,
        item_id TEXT,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      );
    `)
  ]);
}

async function handleUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  }
}

async function sendTelegram(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN || "8820980497:AAH7pJaEBk9gOYBAPllruazDLDLWlPW5hrI";
  return await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function calculateLevel(marks) {
  if (marks >= 10000) return 5;
  if (marks >= 6000) return 4;
  if (marks >= 4000) return 3;
  if (marks >= 3000) return 2;
  return 1;
}

async function getUser(db, from) {
  let user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(from.id).first();
  if (!user) {
    await db.prepare("INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)")
      .bind(from.id, from.username || "", from.first_name || "").run();
    user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(from.id).first();
  }
  return user;
}

async function getUserInventoryStats(db, userId) {
  const items = await db.prepare("SELECT item_id FROM inventory WHERE user_id = ?").bind(userId).all();
  let damage = 0;
  let hp = 0;
  let weaponList = [];
  let armorList = [];

  if (items && items.results) {
    for (const row of items.results) {
      const item = ITEMS[row.item_id];
      if (item) {
        if (item.type === "weapon") {
          damage += item.val;
          weaponList.push(item.name);
        } else if (item.type === "armor") {
          hp += item.val;
          armorList.push(item.name);
        }
      }
    }
  }
  return { damage, hp, weaponList, armorList };
}

async function handleMessage(msg, env) {
  if (!msg.text) return;
  const db = env.DB;
  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const user = await getUser(db, msg.from);

  const reply = (txt, markup = null) => {
    const payload = {
      chat_id: chatId,
      text: `🗿 **فرمانده:**\n\n${txt}`,
      parse_mode: "Markdown",
      reply_to_message_id: messageId
    };
    if (markup) payload.reply_markup = markup;
    return sendTelegram(env, "sendMessage", payload);
  };

  const forbiddenWords = ["های", "سلام", "هلو"];
  if (forbiddenWords.some(w => text.toLowerCase().includes(w))) {
    const penalties = { 1: 120, 2: 130, 3: 140, 4: 4000, 5: 5000, 6: 5000 };
    const penalty = penalties[user.level] || 120;
    const newMarks = Math.max(0, user.marks - penalty);
    const newLevel = calculateLevel(newMarks);

    await db.prepare("UPDATE users SET marks = ?, level = ?, punish_count = punish_count + 1 WHERE user_id = ?")
      .bind(newMarks, newLevel, user.user_id).run();

    return reply(`⚠️ **نقض قوانین سیستم نظامی!**\nشما از کلمات ضعیف استفاده کردید.\n🔻 جریمه: **${penalty}-** مارک\nموجودی فعلی: ${newMarks} مارک.`);
  }

  if (text === "درود") {
    const cooldowns = { 1: 30, 2: 30, 3: 60, 4: 150, 5: 120, 6: 120 };
    const now = Math.floor(Date.now() / 1000);
    const cd = cooldowns[user.level] || 30;

    if (now - user.last_dorood_time < cd) {
      const wait = cd - (now - user.last_dorood_time);
      return reply(`⏳ **ارتباط زودهنگام!**\nسرباز، برای ارسال درود بعدی باید **${wait} ثانیه** صبر کنی.`);
    }

    const rewards = { 1: [50, 120], 2: [120, 130], 3: [130, 140], 4: [250, 320], 5: [420, 500], 6: [1000, 1000] };
    const range = rewards[user.level] || [50, 120];
    const reward = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];

    const newMarks = user.marks + reward;
    const newLevel = calculateLevel(newMarks);

    await db.prepare("UPDATE users SET marks = ?, level = ?, last_dorood_time = ?, dorood_count = dorood_count + 1 WHERE user_id = ?")
      .bind(newMarks, newLevel, now, user.user_id).run();

    return reply(`🎖 **درود دریافت شد سرباز!**\nپاداش اراده شما: **${reward}+** مارک.\nموجودی فعلی: ${newMarks} مارک.`);
  }

  if (text === "بازار سیاه") {
    const markup = {
      inline_keyboard: [
        [{ text: "⚔️ تجهیزات نظامی (سلاح)", callback_data: "shop_weapons" }],
        [{ text: "🛡 تجهیزات دفاعی (لباس/جلیقه)", callback_data: "shop_armors" }]
      ]
    };
    return reply("💣 **به بازار سیاه خوش آمدی سرباز.**\nمستقیماً انتخاب کن چه تجهیزاتی برای نبرد نیاز داری:", markup);
  }

  if (text === "راهنما" || text === "/start") {
    const helpTxt = `🪖 **پروتکل راهنمای مقر فرماندهی (پیشوا)**

🔹 **کسب درآمد:**
- ارسال کلمه \`درود\`

⚠️ **جرایم نظامی:**
- کلمات ضعیف (سلام، های، هلو) جریمه مارک دارد.

💣 **بازار سیاه:**
- ارسال کلمه \`بازار سیاه\` برای خرید تجهیزات.

🔫 **عملیات دزدی:**
- \`دزدی از بانک\`
- \`دزدی از سرباز\`

📊 **آمار:**
- ارسال کلمه \`امار\` یا \`امارش\`

💸 **انتقال:**
- \`انتقال 500\` (به صورت ریپلای)`;
    return reply(helpTxt);
  }

  if (text === "امار" || text === "آمار" || text === "امارش") {
    let targetUser = user;
    if (msg.reply_to_message) {
      targetUser = await getUser(db, msg.reply_to_message.from);
    }
    return sendUserStats(env, chatId, messageId, db, targetUser);
  }
}

async function handleCallback(cb, env) {
  const db = env.DB;
  const userId = cb.from.id;
  const data = cb.data;
  const messageId = cb.message.message_id;
  const chatId = cb.message.chat.id;

  const editMsg = (txt, markup = null) => {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: `🗿 **فرمانده:**\n\n${txt}`,
      parse_mode: "Markdown"
    };
    if (markup) payload.reply_markup = markup;
    return sendTelegram(env, "editMessageText", payload);
  };

  const user = await getUser(db, cb.from);

  if (data === "shop_weapons") {
    const markup = {
      inline_keyboard: [
        [{ text: "چوب بیسبال (1000 مارک)", callback_data: "buy_bat" }],
        [{ text: "چاقو (1200 مارک)", callback_data: "buy_knife" }],
        [{ text: "پیستول (5200 مارک)", callback_data: "buy_pistol" }]
      ]
    };
    return editMsg("⚔️ **تسلیحات نظامی:**", markup);
  }

  if (data.startsWith("buy_")) {
    const itemId = data.replace("buy_", "");
    const item = ITEMS[itemId];
    if (user.marks < item.price) {
      return editMsg(`❌ **مارک کافی نداری!** نیاز به ${item.price} مارک داری.`);
    }

    const newMarks = user.marks - item.price;
    const newLevel = calculateLevel(newMarks);

    await db.prepare("UPDATE users SET marks = ?, level = ? WHERE user_id = ?").bind(newMarks, newLevel, userId).run();
    await db.prepare("INSERT OR REPLACE INTO inventory (user_id, item_type, item_id) VALUES (?, ?, ?)")
      .bind(userId, item.type, itemId).run();

    return editMsg(`✅ **خرید انجام شد!**\nآیتم **${item.name}** خریداری شد.`);
  }
}

async function sendUserStats(env, chatId, messageId, db, targetUser) {
  const inv = await getUserInventoryStats(db, targetUser.user_id);
  const statsTxt = `📊 **شناسنامه نظامی:**\n\n👤 نام: ${targetUser.first_name}\n🎖 سطح: **${targetUser.level}**\n💰 مارک: **${targetUser.marks}**\n⚔️ قدرت: **${inv.damage}** | 🛡 دفاع: **${inv.hp}**`;

  return sendTelegram(env, "sendMessage", {
    chat_id: chatId,
    text: statsTxt,
    parse_mode: "Markdown",
    reply_to_message_id: messageId
  });
}
 
