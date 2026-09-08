/**
 * Pishva Telegram Bot - Worker: pishvabot
 * Database: pishva-db (39675e9e-1442-4444-9032-b19fd80f2ca7)
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
  { val: 1000, minHp: 50, maxHp: 200, minDmg: 20, maxDmg: 100, winRatio: 1.2 },
  { val: 3000, minHp: 100, maxHp: 300, minDmg: 40, maxDmg: 150, winRatio: 1.3 },
  { val: 6000, minHp: 200, maxHp: 400, minDmg: 100, maxDmg: 200, winRatio: 1.5 },
  { val: 9000, minHp: 300, maxHp: 500, minDmg: 150, maxDmg: 250, winRatio: 2.0 },
  { val: 10000, minHp: 400, maxHp: 9999, minDmg: 200, maxDmg: 9999, winRatio: 3.5 },
  { val: 17000, minHp: 600, maxHp: 9999, minDmg: 300, maxDmg: 9999, winRatio: 4.0 },
  { val: 20000, minHp: 800, maxHp: 9999, minDmg: 400, maxDmg: 9999, winRatio: 4.5 },
  { val: 22000, minHp: 1000, maxHp: 9999, minDmg: 500, maxDmg: 9999, winRatio: 5.0 }
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
      await handleUpdate(update, env);
    } catch (error) {
      // سیستم دیباگ و گزارش خطای هوشمند
      const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
      const messageId = update?.message?.message_id || update?.callback_query?.message?.message_id;

      if (chatId) {
        const errorMsg = `🚨 **ارور سیستم پیشوا!**\n\n` +
                         `⚠️ متن خطا:\n\`\`\`\n${error.message}\n\`\`\`\n` +
                         `📌 بخش خطا:\n\`\`\`\n${error.stack ? error.stack.substring(0, 300) : "نامشخص"}\n\`\`\``;

        await sendTelegram(env, "sendMessage", {
          chat_id: chatId,
          text: errorMsg,
          parse_mode: "Markdown",
          reply_to_message_id: messageId
        });
      }
    }

    return new Response("OK");
  }
};

async function handleUpdate(update, env) {
  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  }
}

async function sendTelegram(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN;
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
  } else if (from.username && user.username !== from.username) {
    await db.prepare("UPDATE users SET username = ? WHERE user_id = ?").bind(from.username, from.id).run();
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

    const rewards = {
      1: [50, 120],
      2: [120, 130],
      3: [130, 140],
      4: [250, 320],
      5: [420, 500],
      6: [1000, 1000]
    };
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
- ارسال کلمه \`درود\` (دارای زمان انتظار بر اساس سطح)

⚠️ **جرایم نظامی:**
- استفاده از کلمات ضعیف (سلام، های، هلو) موجب کسر سنگین مارک می‌شود.

💣 **بازار سیاه:**
- ارسال کلمه \`بازار سیاه\` برای خرید تسلیحات و جلیقه‌ها.

🔫 **عملیات دزدی:**
- \`دزدی از بانک\` (هر ۱ ساعت) - نیازمند سلاح و زره
- \`دزدی از سرباز\` (هر ۱۰ دقیقه) - نبرد با نزدیک‌ترین سرباز هم‌سطح

📊 **آمار و اطلاعات:**
- ارسال کلمه \`امار\` یا ریپلای \`امارش\` یا \`امار @username\`

💸 **انتقال دارایی:**
- ریپلای: \`انتقال 500\`
- با آیدی: \`انتقال 500 @username\``;
    return reply(helpTxt);
  }

  if (text === "امار" || text === "آمار" || text === "امارش") {
    let targetUser = user;
    if (msg.reply_to_message) {
      targetUser = await getUser(db, msg.reply_to_message.from);
    }
    return sendUserStats(env, chatId, messageId, db, targetUser);
  }

  if (text.startsWith("امار @") || text.startsWith("آمار @")) {
    const targetUsername = text.split("@")[1].trim();
    const targetUser = await db.prepare("SELECT * FROM users WHERE username = ?").bind(targetUsername).first();
    if (!targetUser) return reply("❌ **خطا:** سرباز مورد نظر در سامانه یافت نشد.");
    return sendUserStats(env, chatId, messageId, db, targetUser);
  }

  if (text === "دزدی از بانک") {
    const now = Math.floor(Date.now() / 1000);
    if (now - user.last_bank_rob < 3600) {
      const wait = Math.ceil((3600 - (now - user.last_bank_rob)) / 60);
      return reply(`🚫 **توقف عملیات!**\nپلیس‌ها منطقه را زیر نظر دارند. برای حمله بعدی به بانک باید **${wait} دقیقه** صبر کنی.`);
    }

    const stats = await getUserInventoryStats(db, user.user_id);
    const confirmMarkup = {
      inline_keyboard: [
        [
          { text: "🔥 تایید و شروع حمله", callback_data: "confirm_bank_rob" },
          { text: "❌ انصراف", callback_data: "cancel_action" }
        ]
      ]
    };

    return reply(
      `🏛 **بررسی نقشه سرقت از بانک**\n\n` +
      `⚔️ قدرت ضربه شما: **${stats.damage}**\n` +
      `🛡 میزان خون/دفاع شما: **${stats.hp}**\n\n` +
      `آیا از اجرای این عملیات پرخطر اطمینان کامل داری؟`,
      confirmMarkup
    );
  }

  if (text === "دزدی از سرباز") {
    const now = Math.floor(Date.now() / 1000);
    if (now - user.last_soldier_rob < 600) {
      const wait = Math.ceil((600 - (now - user.last_soldier_rob)) / 60);
      return reply(`⏳ **تجدید قوا!**\nبرای حمله مجدد به سربازان باید **${wait} دقیقه** صبر کنی.`);
    }

    const confirmMarkup = {
      inline_keyboard: [
        [
          { text: "⚔️ تایید و حمله به سرباز", callback_data: "confirm_soldier_rob" },
          { text: "❌ انصراف", callback_data: "cancel_action" }
        ]
      ]
    };

    return reply("🪖 **شناسایی هدف:**\nآیا برای درگیر شدن و دزدی از نزدیک‌ترین سرباز آماده‌ای؟", confirmMarkup);
  }

  if (text.startsWith("انتقال ")) {
    const parts = text.split(" ");
    const amount = parseInt(parts[1]);

    if (isNaN(amount) || amount <= 0) {
      return reply("❌ **خطا:** مقدار انتقال نامعتبر است.");
    }
    if (user.marks < amount) {
      return reply("❌ **عدم موجودی!** مارک کافی برای این انتقال نداری.");
    }

    let targetUser = null;
    if (msg.reply_to_message) {
      targetUser = await getUser(db, msg.reply_to_message.from);
    } else if (parts[2] && parts[2].startsWith("@")) {
      const uname = parts[2].replace("@", "").trim();
      targetUser = await db.prepare("SELECT * FROM users WHERE username = ?").bind(uname).first();
    }

    if (!targetUser) {
      return reply("❌ **خطا:** دریافت‌کننده نامشخص است. ریپلای کنید یا آیدی کاربر (@) را وارد کنید.");
    }

    if (targetUser.user_id === user.user_id) {
      return reply("❌ نمی‌توانی به خودت مارک انتقال دهی!");
    }

    await db.prepare("UPDATE users SET pending_action = ? WHERE user_id = ?")
      .bind(`transfer:${targetUser.user_id}:${amount}`, user.user_id).run();

    const markup = {
      inline_keyboard: [
        [
          { text: "✅ تایید انتقال", callback_data: "confirm_transfer" },
          { text: "❌ لغو", callback_data: "cancel_action" }
        ]
      ]
    };

    return reply(`💸 **تاییدیه انتقال مارک**\n\nآیا از انتقال **${amount}** مارک به کاربر **${targetUser.first_name}** مطمئن هستی؟`, markup);
  }
}

async function handleCallback(cb, env) {
  const db = env.DB;
  const userId = cb.from.id;
  const data = cb.data;
  const messageId = cb.message.message_id;
  const chatId = cb.message.chat.id;

  const answer = (txt) => sendTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: txt, show_alert: true });
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

  if (data === "cancel_action") {
    await db.prepare("UPDATE users SET pending_action = NULL WHERE user_id = ?").bind(userId).run();
    return editMsg("❌ عملیات با موفقیت لغو شد.");
  }

  if (data === "shop_weapons") {
    const markup = {
      inline_keyboard: [
        [{ text: "چوب بیسبال (1000 مارک)", callback_data: "buy_bat" }],
        [{ text: "چاقو (1200 مارک)", callback_data: "buy_knife" }],
        [{ text: "پیستول (5200 مارک)", callback_data: "buy_pistol" }],
        [{ text: "نارنجک (6000 مارک)", callback_data: "buy_grenade" }],
        [{ text: "شاتگان (7000 مارک)", callback_data: "buy_shotgun" }],
        [{ text: "اسنایپر (10000 مارک)", callback_data: "buy_sniper" }],
        [{ text: "آرپی‌جی (10000 مارک)", callback_data: "buy_rpg" }],
        [{ text: "🔙 بازگشت", callback_data: "shop_back" }]
      ]
    };
    return editMsg("⚔️ **بخش تسلیحات نظامی:**\nسلاح مورد نظر خود را انتخاب کنید:", markup);
  }

  if (data === "shop_armors") {
    const markup = {
      inline_keyboard: [
        [{ text: "ماسک صورت (1000 مارک)", callback_data: "buy_mask" }],
        [{ text: "جلیقه سطح ۱ (1000 مارک)", callback_data: "buy_vest1" }],
        [{ text: "جلیقه سطح ۳ (2800 مارک)", callback_data: "buy_vest3" }],
        [{ text: "جلیقه سطح ۵ (3999 مارک)", callback_data: "buy_vest5" }],
        [{ text: "زانوبند (2000 مارک)", callback_data: "buy_knee" }],
        [{ text: "لباس جعلی پلیس (8000 مارک)", callback_data: "buy_cop" }],
        [{ text: "🔙 بازگشت", callback_data: "shop_back" }]
      ]
    };
    return editMsg("🛡 **بخش تجهیزات دفاعی:**\nلباس یا زره مورد نظر خود را انتخاب کنید:", markup);
  }

  if (data === "shop_back") {
    const markup = {
      inline_keyboard: [
        [{ text: "⚔️ تجهیزات نظامی (سلاح)", callback_data: "shop_weapons" }],
        [{ text: "🛡 تجهیزات دفاعی (لباس/جلیقه)", callback_data: "shop_armors" }]
      ]
    };
    return editMsg("💣 **بازار سیاه:**", markup);
  }

  if (data.startsWith("buy_")) {
    const itemId = data.replace("buy_", "");
    const item = ITEMS[itemId];
    if (!item) return answer("آیتم یافت نشد!");

    if (user.marks < item.price) {
      return answer(`❌ مارک کافی نداری! نیاز به ${item.price} مارک داری.`);
    }

    const newMarks = user.marks - item.price;
    const newLevel = calculateLevel(newMarks);

    await db.prepare("UPDATE users SET marks = ?, level = ? WHERE user_id = ?").bind(newMarks, newLevel, userId).run();
    await db.prepare("INSERT OR REPLACE INTO inventory (user_id, item_type, item_id) VALUES (?, ?, ?)")
      .bind(userId, item.type, itemId).run();

    return editMsg(`✅ **خرید با موفقیت انجام شد!**\nشما آیتم **${item.name}** را با قیمت **${item.price}** مارک خریداری کردید.`);
  }

  if (data === "confirm_bank_rob") {
    const now = Math.floor(Date.now() / 1000);
    const stats = await getUserInventoryStats(db, userId);

    if (stats.damage === 0 && stats.hp === 0) {
      return editMsg("💥 **شکست مطلق!**\nشما بدون هیچ سلاح و تجهیزاتی به بانک حمله کردید و توسط نیروهای امنیتی سرکوب شدید!");
    }

    const bank = BANKS[Math.floor(Math.random() * BANKS.length)];
    let success = false;
    let reward = 0;

    if (stats.hp >= bank.minHp && stats.damage >= bank.minDmg) {
      success = true;
      reward = Math.floor(bank.val * bank.winRatio);
    } else {
      reward = Math.floor(bank.val * 0.2);
    }

    const newMarks = user.marks + reward;
    const newLevel = calculateLevel(newMarks);

    await db.prepare("UPDATE users SET marks = ?, level = ?, last_bank_rob = ?, bank_rob_count = bank_rob_count + 1 WHERE user_id = ?")
      .bind(newMarks, newLevel, now, userId).run();

    if (success) {
      return editMsg(`🏛 **حمله موفقیت‌آمیز به بانک!**\nشما به بانکی با خزانه **${bank.val}** مارک حمله کردید و با موفقیت **${reward}+** مارک غنیمت گرفتید!🔥`);
    } else {
      return editMsg(`🏛 **حمله ناموفق!**\nتجهیزات شما برای این بانک کافی نبود. تنها **${reward}** مارک غنیمت به دست آمد و خسارت دیدید.`);
    }
  }

  if (data === "confirm_soldier_rob") {
    const now = Math.floor(Date.now() / 1000);
    const opponent = await db.prepare("SELECT * FROM users WHERE user_id != ? ORDER BY RANDOM() LIMIT 1").bind(userId).first();

    if (!opponent) {
      return editMsg("❌ هیچ سربازی در منطقه برای حمله یافت نشد!");
    }

    const myStats = await getUserInventoryStats(db, userId);
    const oppStats = await getUserInventoryStats(db, opponent.user_id);

    const myPower = myStats.damage + myStats.hp;
    const oppPower = oppStats.damage + oppStats.hp;

    let myReward = 0;
    let oppReward = 0;
    let resultTxt = "";

    if (myPower >= oppPower) {
      myReward = Math.floor(myPower * 1.02);
      oppReward = Math.floor(oppPower * 1.011);
      resultTxt = `⚔️ **پیروزی در نبرد!**\nشما به سرباز **${opponent.first_name}** حمله کردید و او را شکست دادید.\nسود شما: **${myReward}+** مارک.`;
    } else {
      myReward = Math.floor(myPower * 1.011);
      oppReward = Math.floor(oppPower * 1.02);
      resultTxt = `💥 **عقب‌نشینی!**\nسرباز **${opponent.first_name}** قدرتمندتر بود و شما شکست خوردید.\nسود ناچیزی به دست آمد: **${myReward}+** مارک.`;
    }

    await db.prepare("UPDATE users SET marks = marks + ?, last_soldier_rob = ?, soldier_rob_count = soldier_rob_count + 1 WHERE user_id = ?")
      .bind(myReward, now, userId).run();

    await db.prepare("UPDATE users SET marks = marks + ? WHERE user_id = ?")
      .bind(oppReward, opponent.user_id).run();

    sendTelegram(env, "sendMessage", {
      chat_id: opponent.user_id,
      text: `🚨 **هشدار حمله!**\nسرباز **${user.first_name}** به شما حمله کرد.\nنتیجه نبرد: غنیمت دریافتی شما: ${oppReward} مارک.`
    });

    return editMsg(resultTxt);
  }

  if (data === "confirm_transfer") {
    if (!user.pending_action || !user.pending_action.startsWith("transfer:")) {
      return answer("هیچ درخواستی یافت نشد.");
    }

    const [, targetIdStr, amountStr] = user.pending_action.split(":");
    const targetId = parseInt(targetIdStr);
    const amount = parseInt(amountStr);

    if (user.marks < amount) {
      return answer("موجودی کافی نیست!");
    }

    const targetUser = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(targetId).first();

    await db.prepare("UPDATE users SET marks = marks - ?, pending_action = NULL WHERE user_id = ?").bind(amount, userId).run();
    await db.prepare("UPDATE users SET marks = marks + ? WHERE user_id = ?").bind(amount, targetId).run();

    sendTelegram(env, "sendMessage", {
      chat_id: targetId,
      text: `💸 **دریافت مارک!**\nمبلغ **${amount}** مارک از طرف **${user.first_name}** به حساب شما واریز شد.`
    });

    return editMsg(`✅ **انتقال موفقیت‌آمیز!**\nمبلغ **${amount}** مارک با موفقیت به **${targetUser.first_name}** منتقل شد.`);
  }
}

async function sendUserStats(env, chatId, messageId, db, targetUser) {
  const inv = await getUserInventoryStats(db, targetUser.user_id);
  const weapons = inv.weaponList.length > 0 ? inv.weaponList.join("، ") : "هیچ";
  const armors = inv.armorList.length > 0 ? inv.armorList.join("، ") : "هیچ";

  const statsTxt = `📊 **شناسنامه نظامی سرباز:**

👤 نام: ${targetUser.first_name}
🆔 آیدی: \`${targetUser.user_id}\`
🎖 سطح (Level): **${targetUser.level}**
💰 موجودی مارک: **${targetUser.marks}**

⚔️ مجموع قدرت سلاح: **${inv.damage}**
🛡 مجموع میزان خون/زره: **${inv.hp}**

🎒 سلاح‌ها: ${weapons}
🦺 تجهیزات دفاعی: ${armors}

📜 **کارنامه عملیاتی:**
- تعداد درودها: ${targetUser.dorood_count}
- تعداد سرقت از بانک: ${targetUser.bank_rob_count}
- تعداد سرقت از سرباز: ${targetUser.soldier_rob_count}
- تعداد تخلفات و جریمه‌ها: ${targetUser.punish_count}`;

  return sendTelegram(env, "sendMessage", {
    chat_id: chatId,
    text: statsTxt,
    parse_mode: "Markdown",
    reply_to_message_id: messageId
  });
}
 
