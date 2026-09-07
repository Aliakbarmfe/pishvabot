const BOT_TOKEN = "8820980497:AAH7pJaEBk9gOYBAPllruazDLDLWlPW5hrI";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// اطلاعات قیمت، خون و قدرت تجهیزات
const SHOP_ITEMS = {
  // سلاح‌ها
  "چوب بیسبال": { type: "weapon", price: 1000, value: 50 },
  "چاقو": { type: "weapon", price: 1200, value: 65 },
  "پیستول": { type: "weapon", price: 5200, value: 100 },
  "نارنجک": { type: "weapon", price: 6000, value: 200 },
  "شاتگان": { type: "weapon", price: 7000, value: 210 },
  "اسنایپر": { type: "weapon", price: 10000, value: 300 },
  "آرپی‌جی": { type: "weapon", price: 10000, value: 300 },
  // لباس‌ها
  "ماسک": { type: "armor", price: 1000, value: 0 },
  "جلیقه سطح ۱": { type: "armor", price: 1000, value: 200 },
  "جلیقه سطح ۳": { type: "armor", price: 2800, value: 600 },
  "جلیقه سطح ۵": { type: "armor", price: 3999, value: 1000 },
  "زانوبند": { type: "armor", price: 2000, value: 400 },
  "لباس پلیس": { type: "armor", price: 8000, value: 2500 }
};

// لیست بانک‌ها
const BANKS = [1000, 3000, 6000, 9000, 10000, 17000, 20000, 22000];

export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env.DB);
      } catch (e) {
        console.error(e);
      }
    }
    return new Response("OK");
  }
};

async function handleUpdate(update, db) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, db);
    return;
  }

  if (!update.message || !update.message.text) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  let user = await getOrCreateUser(db, userId);

  // بررسی کلمات ممنوعه
  if (["های", "سلام", "هلو"].includes(text)) {
    const penalties = { 1: 120, 2: 130, 3: 140, 4: 4000, 5: 5000 };
    const penalty = penalties[user.level] || 120;
    user.marks = Math.max(0, user.marks - penalty);
    await updateUserData(db, user);

    await sendMessage(chatId, `⚠️ **هشدار مجازات!**\n\nکاربر [${msg.from.first_name}](tg://user?id=${userId}) از کلمه ممنوعه استفاده کرد!\n🔥 **${penalty} مارک** از دست دادی.\n💰 موجودی فعلی: **${user.marks} مارک**`);
    return;
  }

  // بررسی کلمه درود
  if (text === "درود") {
    const cooldowns = { 1: 300, 2: 240, 3: 180, 4: 300, 5: 480 }; // ثانیه
    const now = Math.floor(Date.now() / 1000);
    const cooldown = cooldowns[user.level] || 300;

    if (now - user.last_drod < cooldown) {
      const wait = cooldown - (now - user.last_drod);
      const mins = Math.floor(wait / 60);
      const secs = wait % 60;
      await sendMessage(chatId, `⏳ **صبر کن رفیق!**\nبرای درود بعدی باید **${mins} دقیقه و ${secs} ثانیه** صبر کنی.`);
      return;
    }

    const rewards = {
      1: getRandom(50, 120),
      2: getRandom(120, 130),
      3: getRandom(130, 140),
      4: getRandom(250, 320),
      5: getRandom(420, 500)
    };
    const reward = rewards[user.level] || 50;

    user.marks += reward;
    user.last_drod = now;
    user = checkLevelUp(user);
    await updateUserData(db, user);

    await sendMessage(chatId, `✨ **درود و احترام!**\nپاداش شما: **+${reward} مارک**\n💰 موجودی: **${user.marks} مارک** | ⭐️ لول: **${user.level}**`);
    return;
  }

  // دستور بازار سیاه
  if (text === "بازار سیاه") {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🗡 بخش سلاح‌ها", callback_data: "shop_weapons" },
          { text: "🛡 بخش لباس‌ها", callback_data: "shop_armors" }
        ],
        [{ text: "🎒 تجهیزات من", callback_data: "my_inventory" }]
      ]
    };
    await sendMessage(chatId, "🖤 **به بازار سیاه خوش آمدید!**\nیکی از بخش‌های زیر را برای خرید تجهیزات انتخاب کنید:", keyboard);
    return;
  }

  // دزدی از بانک
  if (text === "دزدی از بانک") {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔥 آره، حمله کنیم!", callback_data: "confirm_bank_rob" },
          { text: "❌ انصراف", callback_data: "cancel_rob" }
        ]
      ]
    };
    await sendMessage(chatId, `💣 **نقشه سرقت از بانک**\n\n📊 **وضعیت تجهیزات شما:**\n⚔️ قدرت ضربه: **${user.attack}**\n❤️ میزان خون/دفاع: **${user.health}**\n\nآیا از حمله به بانک مطمئن هستی؟`, keyboard);
    return;
  }

  // دزدی از سرباز ناشناس
  if (text === "دزدی از سرباز ناشناس رندوم") {
    if (user.attack < 50) {
      await sendMessage(chatId, "⚠️ برای سرقت از سرباز حداقل به یک سلاح (حداقل ۵۰ قدرت ضربه) نیاز داری! از **بازار سیاه** خرید کن.");
      return;
    }
    const success = Math.random() > 0.4;
    if (success) {
      const looted = getRandom(200, 1500);
      user.marks += looted;
      user = checkLevelUp(user);
      await updateUserData(db, user);
      await sendMessage(chatId, `🥷 **سرقت موفقیت‌آمیز!**\nشما به یک سرباز گشت حمله کردید و **${looted} مارک** غنیمت گرفتید!`);
    } else {
      const lost = getRandom(100, 500);
      user.marks = Math.max(0, user.marks - lost);
      await updateUserData(db, user);
      await sendMessage(chatId, `🚑 **کمین خوردید!**\nسرباز متوجه حضور شما شد و درگیری رخ داد.\nشما **${lost} مارک** جریمه شدید!`);
    }
    return;
  }
}

// مدیریت کلیک روی دکمه‌های شیشه‌ای
async function handleCallback(cq, db) {
  const chatId = cq.message.chat.id;
  const userId = cq.from.id;
  const data = cq.data;

  let user = await getOrCreateUser(db, userId);

  if (data === "shop_weapons") {
    const keyboard = {
      inline_keyboard: [
        [{ text: "چوب بیسبال (1000M - 50 Atk)", callback_data: "buy_چوب بیسبال" }],
        [{ text: "چاقو (1200M - 65 Atk)", callback_data: "buy_چاقو" }],
        [{ text: "پیستول (5200M - 100 Atk)", callback_data: "buy_پیستول" }],
        [{ text: "نارنجک (6000M - 200 Atk)", callback_data: "buy_نارنجک" }],
        [{ text: "شاتگان (7000M - 210 Atk)", callback_data: "buy_شاتگان" }],
        [{ text: "اسنایپر (10000M - 300 Atk)", callback_data: "buy_اسنایپر" }],
        [{ text: "آرپی‌جی (10000M - 300 Atk)", callback_data: "buy_آرپی‌جی" }]
      ]
    };
    await editMessage(chatId, cq.message.message_id, "⚔️ **منوی خرید سلاح:**", keyboard);
    return;
  }

  if (data === "shop_armors") {
    const keyboard = {
      inline_keyboard: [
        [{ text: "ماسک (1000M - 0 HP)", callback_data: "buy_ماسک" }],
        [{ text: "جلیقه سطح ۱ (1000M - 200 HP)", callback_data: "buy_جلیقه سطح ۱" }],
        [{ text: "جلیقه سطح ۳ (2800M - 600 HP)", callback_data: "buy_جلیقه سطح ۳" }],
        [{ text: "جلیقه سطح ۵ (3999M - 1000 HP)", callback_data: "buy_جلیقه سطح ۵" }],
        [{ text: "زانوبند (2000M - 400 HP)", callback_data: "buy_زانوبند" }],
        [{ text: "لباس پلیس (8000M - 2500 HP)", callback_data: "buy_لباس پلیس" }]
      ]
    };
    await editMessage(chatId, cq.message.message_id, "🛡 **منوی خرید لباس و تجهیزات دفاعی:**", keyboard);
    return;
  }

  if (data.startsWith("buy_")) {
    const itemName = data.replace("buy_", "");
    const item = SHOP_ITEMS[itemName];

    if (!item) return;

    if (user.marks < item.price) {
      await answerCallback(cq.id, "❌ سکه مارک کافی ندارید!", true);
      return;
    }

    user.marks -= item.price;
    if (item.type === "weapon") user.attack += item.value;
    if (item.type === "armor") user.health += item.value;

    user = checkLevelUp(user);
    await updateUserData(db, user);
    await db.prepare("INSERT OR REPLACE INTO inventory (user_id, item_name, item_type, value) VALUES (?, ?, ?, ?)")
            .bind(userId, itemName, item.type, item.value).run();

    await answerCallback(cq.id, `✅ ${itemName} با موفقیت خریداری شد!`);
    await editMessage(chatId, cq.message.message_id, `🎉 خرید انجام شد!\nآیتم: **${itemName}**\n💰 موجودی جدید: **${user.marks} مارک**`);
    return;
  }

  if (data === "cancel_rob") {
    await editMessage(chatId, cq.message.message_id, "❌ نقشه سرقت لغو شد.");
    return;
  }

  if (data === "confirm_bank_rob") {
    const bankVal = BANKS[Math.floor(Math.random() * BANKS.length)];
    let loot = 0;
    let description = "";

    // سیستم محاسبه سود و زیان منطقی سرقت
    if (user.health >= 400 && user.attack >= 200) {
      const lossVal = Math.floor(user.marks * 0.75);
      loot = Math.floor(lossVal * 3.5) + Math.floor(bankVal * 0.5);
      user.marks = user.marks - lossVal + loot;
      description = `💥 **عملیات بزرگ موفق!**\nشما به بانکی با خزانه **${bankVal} مارک** حمله کردید.\nمقدار تجهیزات مصرف شده: ${lossVal} مارک\n🔥 **سود خالص: +${loot} مارک**`;
    } else if (user.health >= 100 && user.attack >= 50) {
      const lossVal = Math.floor(user.marks * 0.70);
      loot = Math.floor(lossVal * 1.5) + Math.floor(bankVal * 0.2);
      user.marks = user.marks - lossVal + loot;
      description = `⚡️ **سرقت موفقیت‌آمیز!**\nشما به بانکی با خزانه **${bankVal} مارک** زده و با دست پر خارج شدید!\n🔥 **سود خالص: +${loot} مارک**`;
    } else {
      const penalty = Math.floor(user.marks * 0.3);
      user.marks = Math.max(0, user.marks - penalty);
      description = `🚑 **شکست سنگین!**\nبدون تجهیزات کافی به بانک با خزانه **${bankVal} مارک** حمله کردید و توسط آژیر خطر به دام افتادید!\n🚨 **${penalty} مارک** خسارت دیدید.`;
    }

    user = checkLevelUp(user);
    await updateUserData(db, user);
    await editMessage(chatId, cq.message.message_id, description);
    return;
  }
}

// توابع کمکی دیتابیس و سطح کاربر
async function getOrCreateUser(db, userId) {
  let user = await db.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first();
  if (!user) {
    await db.prepare("INSERT INTO users (user_id, marks, level, last_drod, health, attack) VALUES (?, 0, 1, 0, 100, 0)").bind(userId).run();
    user = { user_id: userId, marks: 0, level: 1, last_drod: 0, health: 100, attack: 0 };
  }
  return user;
}

async function updateUserData(db, user) {
  await db.prepare("UPDATE users SET marks = ?, level = ?, last_drod = ?, health = ?, attack = ? WHERE user_id = ?")
          .bind(user.marks, user.level, user.last_drod, user.health, user.attack, user.user_id).run();
}

function checkLevelUp(user) {
  if (user.marks >= 10000) user.level = 5;
  else if (user.marks >= 6000) user.level = 4;
  else if (user.marks >= 4000) user.level = 3;
  else if (user.marks >= 3000) user.level = 2;
  else user.level = 1;
  return user;
}

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ارسال پیام به تلگرام
async function sendMessage(chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };
  if (keyboard) payload.reply_markup = keyboard;

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function editMessage(chatId, messageId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "Markdown"
  };
  if (keyboard) payload.reply_markup = keyboard;

  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function answerCallback(cqId, text, showAlert = false) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cqId, text: text, show_alert: showAlert })
  });
}
