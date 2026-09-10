const { Bot, InlineKeyboard, webhookCallback } = require("grammy");
const { createClient } = require("@supabase/supabase-js");

// تنظیمات کلیدها
const BOT_TOKEN = "8820980497:AAH7pJaEBk9gOYBAPllruazDLDLWlPW5hrI";
const SUPABASE_URL = "https://ziodmekyeqqhggwjblrl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2RtZWt5ZXFxaGdnd2pibHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA2MTM5MiwiZXhwIjoyMTA0NjM3MzkyfQ.EcDkLO0H8x5hyXRI3X6P0vvu4ihIuQnoDOOPRxjP3pg";

const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

bot.catch((err) => {
  console.error(`[ERROR] ${err.ctx.update.update_id}:`, err.error);
});

// داده‌های بازار سیاه
const WEAPONS = {
  bat: { name: "چوب بیسبال 🪵", price: 1000, power: 50 },
  knife: { name: "چاقو 🔪", price: 1200, power: 65 },
  pistol: { name: "پیستول 🔫", price: 5200, power: 100 },
  grenade: { name: "نارنجک 💣", price: 6000, power: 200 },
  shotgun: { name: "شاتگان 💥", price: 7000, power: 210 },
  sniper: { name: "اسنایپر 🎯", price: 10000, power: 300 },
  rpg: { name: "آر پی جی 🚀", price: 10000, power: 300 }
};

const ARMORS = {
  mask: { name: "ماسک صورت 🎭", price: 1000, hp: 0 },
  vest1: { name: "جلیقه سطح ۱ 🛡", price: 1000, hp: 200 },
  vest3: { name: "جلیقه سطح ۳ 🛡", price: 2800, hp: 600 },
  vest5: { name: "جلیقه سطح ۵ 🛡", price: 3999, hp: 1000 },
  knee: { name: "زانوبند 🦵", price: 2000, hp: 400 },
  police: { name: "لباس جعلی پلیس 👮‍♂️", price: 8000, hp: 2500 }
};

async function getUser(ctx) {
  const u = ctx.from;
  if (!u) return null;

  try {
    let { data: user } = await supabase.from("users").select("*").eq("user_id", u.id).maybeSingle();

    if (!user) {
      const newUser = { 
        user_id: u.id, 
        username: u.username || "", 
        first_name: u.first_name || "سرباز", 
        marks: 0,
        dorood_count: 0,
        punish_count: 0,
        attack_count: 0
      };
      
      const { data: insertedUser } = await supabase.from("users").insert([newUser]).select().single();
      await supabase.from("inventory").insert([{ user_id: u.id, weapons: [], armors: [] }]);
      user = insertedUser || newUser;
    } else if (u.username && user.username !== u.username) {
      await supabase.from("users").update({ username: u.username }).eq("user_id", u.id);
    }
    return user;
  } catch (e) {
    console.error("getUser error:", e);
    return { user_id: u.id, username: u.username || "", first_name: u.first_name || "سرباز", marks: 0, dorood_count: 0, punish_count: 0, attack_count: 0 };
  }
}

function getLevel(marks) {
  const m = marks || 0;
  if (m >= 20000) return 6;
  if (m >= 10000) return 5;
  if (m >= 6000) return 4;
  if (m >= 4000) return 3;
  if (m >= 3000) return 2;
  return 1;
}

function getTitleAndTone(level, name) {
  const safeName = name || "سرباز";
  if (level <= 3) return { title: `عنصر بی‌ارزش (${safeName}) 🗑`, prefix: "آهای آشغال! " };
  if (level <= 5) return { title: `سرباز ارشد (${safeName}) 🎖`, prefix: "جناب سرباز، " };
  return { title: `فرمانده کبیر (${safeName}) 👑⚡️`, prefix: "قربان! با احترام کامل، " };
}

async function getStats(userId) {
  try {
    const { data: inv } = await supabase.from("inventory").select("*").eq("user_id", userId).maybeSingle();
    let power = 0, hp = 100;
    if (inv) {
      (inv.weapons || []).forEach(w => power += (WEAPONS[w]?.power || 0));
      (inv.armors || []).forEach(a => hp += (ARMORS[a]?.hp || 0));
    }
    return { power, hp, inv };
  } catch (e) {
    return { power: 0, hp: 100, inv: null };
  }
}

// پردازش پیام‌های متنی
bot.on("message:text", async (ctx) => {
  try {
    const rawText = ctx.message.text.trim();
    const cleanText = rawText.replace(/\s+/g, "").toLowerCase();

    // ۴. بازار سیاه (پردازش سریع بدون انتظار دیتابیس)
    if (cleanText.includes("بازارسیاه")) {
      const kb = new InlineKeyboard()
        .text("🪓 چوب بیسبال (1000)", "buy_weapon_bat")
        .text("🔪 چاقو (1200)", "buy_weapon_knife").row()
        .text("🔫 پیستول (5200)", "buy_weapon_pistol")
        .text("💣 نارنجک (6000)", "buy_weapon_grenade").row()
        .text("💥 شاتگان (7000)", "buy_weapon_shotgun")
        .text("🎯 اسنایپر (10000)", "buy_weapon_sniper").row()
        .text("🚀 آر پی جی (10000)", "buy_weapon_rpg").row()
        .text("🎭 ماسک (1000)", "buy_armor_mask")
        .text("🛡 جلیقه لول ۱ (1000)", "buy_armor_vest1").row()
        .text("🛡 جلیقه لول ۳ (2800)", "buy_armor_vest3")
        .text("🛡 جلیقه لول ۵ (3999)", "buy_armor_vest5").row()
        .text("🦵 زانوبند (2000)", "buy_armor_knee")
        .text("👮‍♂️ لباس پلیس (8000)", "buy_armor_police");

      return ctx.reply(`وارد مقر کاپو (بازار سیاه) شدید. تجهیزات خود را انتخاب کنید: 🖤🕶`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    const user = await getUser(ctx);
    if (!user) return;

    const lvl = getLevel(user.marks);
    const tone = getTitleAndTone(lvl, user.first_name);

    // ۱. جریمه کلمات ممنوعه
    if (["سلام", "های", "هلو"].some(w => rawText.toLowerCase().includes(w))) {
      const penaltyMap = { 1: 120, 2: 130, 3: 140, 4: 4000, 5: 5000, 6: 5000 };
      const penalty = penaltyMap[lvl] || 120;
      
      await supabase.from("users").update({
        marks: Math.max(0, (user.marks || 0) - penalty),
        punish_count: (user.punish_count || 0) + 1
      }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}استفاده از کلمات غیرنظامی ممنوع است! 🚫\nجریمه: ${penalty} مارک کسر شد.`, { reply_to_message_id: ctx.message.message_id });
    }

    // ۲. سیستم درود
    if (cleanText === "درود") {
      const now = new Date();
      const cooldowns = { 1: 30, 2: 30, 3: 60, 4: 150, 5: 120, 6: 120 };
      const rewards = {
        1: [50, 120], 2: [120, 130], 3: [130, 140],
        4: [250, 320], 5: [420, 500], 6: [1000, 1000]
      };

      if (user.last_dorood_at) {
        const diff = (now - new Date(user.last_dorood_at)) / 1000;
        if (diff < cooldowns[lvl]) {
          const remaining = Math.ceil(cooldowns[lvl] - diff);
          return ctx.reply(`${tone.prefix}تجهیز مجدد زمان‌بر است! ${remaining} ثانیه دیگر صبر کنید ⏱`, { reply_to_message_id: ctx.message.message_id });
        }
      }

      const [min, max] = rewards[lvl];
      const prize = Math.floor(Math.random() * (max - min + 1)) + min;
      const newMarks = (user.marks || 0) + prize;

      await supabase.from("users").update({
        marks: newMarks,
        dorood_count: (user.dorood_count || 0) + 1,
        last_dorood_at: now.toISOString()
      }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}درود نظامی دریافت شد! 🫡\nپاداش: ${prize} مارک به خزانه اضافه شد.\nموجودی جدید: ${newMarks} مارک.`, { reply_to_message_id: ctx.message.message_id });
    }

    // ۳. آمار
    if (cleanText.startsWith("امار") || cleanText.startsWith("آمار") || cleanText === "امارش") {
      let targetUser = user;

      if (ctx.message.reply_to_message && ctx.message.reply_to_message.from) {
        const targetId = ctx.message.reply_to_message.from.id;
        const { data } = await supabase.from("users").select("*").eq("user_id", targetId).maybeSingle();
        if (data) targetUser = data;
      } else if (rawText.includes("@")) {
        const uname = rawText.split("@")[1].trim();
        const { data } = await supabase.from("users").select("*").eq("username", uname).maybeSingle();
        if (data) targetUser = data;
      }

      const targetLvl = getLevel(targetUser.marks);
      const targetTone = getTitleAndTone(targetLvl, targetUser.first_name);
      const { power, hp } = await getStats(targetUser.user_id);

      const msg = `📊 **پرونده پرسنلی نظامی:**\n` +
        `👤 هویت: ${targetTone.title}\n` +
        `🎖 درجه (سطح): ${targetLvl}\n` +
        `💰 دارایی (مارک): ${targetUser.marks || 0}\n` +
        `⚔️ قدرت تهاجمی: ${power}\n` +
        `🛡 زره و سلامت: ${hp}\n` +
        `🫡 تعداد درودها: ${targetUser.dorood_count || 0}\n` +
        `⚔️ تعداد حملات: ${targetUser.attack_count || 0}\n` +
        `❌ جریمه‌های انضباطی: ${targetUser.punish_count || 0}`;

      return ctx.reply(msg, { reply_to_message_id: ctx.message.message_id, parse_mode: "Markdown" });
    }

    // ۵. دزدی از بانک
    if (cleanText.includes("دزدیازبانک")) {
      const { power, hp } = await getStats(user.user_id);
      const kb = new InlineKeyboard()
        .text("💥 تایید حمله به بانک", "confirm_rob_bank")
        .text("❌ انصراف", "cancel_action");

      return ctx.reply(`${tone.prefix}بررسی وضعیت عملیاتی:\n⚔️ قدرت ضربه: ${power}\n🛡 سلامت: ${hp}\n\nآیا از حمله مسلحانه به بانک مرکزی اطمینان دارید؟ ⚠️`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    // ۶. دزدی از سرباز
    if (cleanText.includes("دزدیازسرباز")) {
      const kb = new InlineKeyboard()
        .text("⚔️ تایید حمله به نزدیک‌ترین سرباز", "confirm_rob_user")
        .text("❌ انصراف", "cancel_action");

      return ctx.reply(`${tone.prefix}شناسایی هدف در محدوده... آیا قصد شبیخون به یک سرباز را دارید؟ 🗡`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    // ۷. انتقال توکن
    if (cleanText.startsWith("انتقال")) {
      const parts = rawText.split(" ");
      const amount = parseInt(parts[1]);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`${tone.prefix}فرمان نامعتبر! فرمت صحیح: \n` + "`انتقال 500` (روی پیام) یا `انتقال 500 @ali`", { reply_to_message_id: ctx.message.message_id, parse_mode: "Markdown" });
      }

      let targetId = null;
      if (ctx.message.reply_to_message && ctx.message.reply_to_message.from) {
        targetId = ctx.message.reply_to_message.from.id;
      } else if (parts[2] && parts[2].startsWith("@")) {
        const targetUsername = parts[2].replace("@", "");
        const { data } = await supabase.from("users").select("user_id").eq("username", targetUsername).maybeSingle();
        if (data) targetId = data.user_id;
      }

      if (!targetId) {
        return ctx.reply(`${tone.prefix}هدف مورد نظر یافت نشد!`, { reply_to_message_id: ctx.message.message_id });
      }

      if ((user.marks || 0) < amount) {
        return ctx.reply(`${tone.prefix}خزانه شما خالی است! موجودی کافی نیست. ❌`, { reply_to_message_id: ctx.message.message_id });
      }

      const kb = new InlineKeyboard()
        .text("✅ تایید و انتقال", `confirm_transfer_${targetId}_${amount}`)
        .text("❌ انصراف", "cancel_action");

      return ctx.reply(`${tone.prefix}آیا از انتقال ${amount} مارک به فرد موردنظر اطمینان دارید؟ 💸`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    // ۸. راهنما
    if (cleanText === "راهنما") {
      const help = `📜 **راهنمای عملیاتی ربات سیگما:**\n\n` +
        `🫡 **درود**: دریافت پاداش روزانه/دوره‌ای مارک\n` +
        `🖤 **بازار سیاه**: خرید سلاح و زره دفاعی\n` +
        `🏦 **دزدی از بانک**: حمله و غارت بانک‌ها\n` +
        `⚔️ **دزدی از سرباز**: نبرد تصادفی با سربازان هم‌سطح\n` +
        `📊 **امار**: مشاهده کارنامه نظامی خود یا دیگران\n` +
        `💸 **انتقال <مقدار>**: انتقال مارک به دیگران\n` +
        `⚠️ **کلمات ممنوعه**: سلام، های، هلو (موجب جریمه مارک)`;

      return ctx.reply(help, { reply_to_message_id: ctx.message.message_id, parse_mode: "Markdown" });
    }
  } catch (e) {
    console.error("Text Handler Error:", e);
  }
});

// پردازش دکمه‌ها
bot.on("callback_query:data", async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;
    const user = await getUser(ctx);
    if (!user) return;

    if (data === "cancel_action") {
      await ctx.answerCallbackQuery("عملیات لغو شد.");
      return ctx.editMessageText("عملیات توسط کاربر لغو گردید. 🛑");
    }

    if (data.startsWith("buy_")) {
      const parts = data.split("_");
      const type = parts[1];
      const itemKey = parts[2];
      const item = type === "weapon" ? WEAPONS[itemKey] : ARMORS[itemKey];

      if ((user.marks || 0) < item.price) {
        return ctx.answerCallbackQuery({ text: "موجودی مارک شما کافی نیست! ❌", show_alert: true });
      }

      await supabase.from("users").update({ marks: user.marks - item.price }).eq("user_id", user.user_id);
      const { data: inv } = await supabase.from("inventory").select("*").eq("user_id", user.user_id).maybeSingle();
      
      const currentInv = inv || { weapons: [], armors: [] };

      if (type === "weapon") {
        const newW = [...(currentInv.weapons || []), itemKey];
        await supabase.from("inventory").upsert({ user_id: user.user_id, weapons: newW, armors: currentInv.armors || [] });
      } else {
        const newA = [...(currentInv.armors || []), itemKey];
        await supabase.from("inventory").upsert({ user_id: user.user_id, weapons: currentInv.weapons || [], armors: newA });
      }

      await ctx.answerCallbackQuery({ text: `خرید انجام شد: ${item.name}`, show_alert: true });
      return ctx.editMessageText(`تجهیزات [ ${item.name} ] خریداری شد و به انبار اضافه گردید. ⚔️`);
    }

    if (data.startsWith("confirm_transfer_")) {
      const parts = data.split("_");
      const targetId = parseInt(parts[2]);
      const amount = parseInt(parts[3]);

      if ((user.marks || 0) < amount) {
        return ctx.answerCallbackQuery({ text: "موجودی کافی نیست!", show_alert: true });
      }

      const { data: target } = await supabase.from("users").select("*").eq("user_id", targetId).maybeSingle();
      if (!target) return ctx.editMessageText("کاربر مقصد یافت نشد.");

      await supabase.from("users").update({ marks: user.marks - amount }).eq("user_id", user.user_id);
      await supabase.from("users").update({ marks: (target.marks || 0) + amount }).eq("user_id", targetId);

      try {
        await bot.api.sendMessage(user.user_id, `💸 شما مبلغ ${amount} مارک به ${target.first_name} منتقل کردید.`);
        await bot.api.sendMessage(targetId, `🎁 شما مبلغ ${amount} مارک از طرف ${user.first_name} دریافت کردید.`);
      } catch (e) {}

      await ctx.answerCallbackQuery("انتقال انجام شد.");
      return ctx.editMessageText(`تراکنش تایید شد: ${amount} مارک به ${target.first_name} منتقل گردید. 🟢`);
    }

    if (data === "confirm_rob_bank") {
      const now = new Date();
      if (user.last_bank_rob_at && (now - new Date(user.last_bank_rob_at)) / 1000 < 3600) {
        return ctx.answerCallbackQuery({ text: "تا دزدی بعدی از بانک باید ۱ ساعت صبر کنید! ⏱", show_alert: true });
      }

      const { power, hp } = await getStats(user.user_id);
      const banks = [1000, 3000, 6000, 9000, 10000, 17000, 20000, 22000];
      const bankVal = banks[Math.floor(Math.random() * banks.length)];

      let profit = 0;
      if (hp >= 100 && hp <= 400 && power >= 50 && power <= 200) {
        profit = Math.floor(bankVal * 0.15);
      } else if (hp > 400 && power > 200) {
        profit = Math.floor(bankVal * 0.35);
      } else {
        profit = Math.floor(bankVal * 0.05);
      }

      await supabase.from("users").update({
        marks: (user.marks || 0) + profit,
        attack_count: (user.attack_count || 0) + 1,
        last_bank_rob_at: now.toISOString()
      }).eq("user_id", user.user_id);

      await ctx.answerCallbackQuery("حمله انجام شد!");
      return ctx.editMessageText(`💣 **نتیجه عملیات حمله به بانک (${bankVal} مارکی):**\n\nتیم شما موفق شد غنیمتی معادل ${profit} مارک استخراج کند! 💰`);
    }

    if (data === "confirm_rob_user") {
      const now = new Date();
      if (user.last_user_rob_at && (now - new Date(user.last_user_rob_at)) / 1000 < 600) {
        return ctx.answerCallbackQuery({ text: "برای دزدی بعدی از سرباز ۱۰ دقیقه صبر کنید! ⏱", show_alert: true });
      }

      const { data: targets } = await supabase.from("users").select("*").neq("user_id", user.user_id).limit(10);
      if (!targets || targets.length === 0) {
        return ctx.editMessageText("هیچ سربازی برای حمله در محدوده پیدا نشد! 🤷‍♂️");
      }

      const opponent = targets[Math.floor(Math.random() * targets.length)];
      const myStats = await getStats(user.user_id);
      const opStats = await getStats(opponent.user_id);

      const myScore = myStats.power + myStats.hp;
      const opScore = opStats.power + opStats.hp;

      let msg = "";
      if (myScore >= opScore) {
        const reward = Math.floor((user.marks || 0) * 0.02) + 50;
        await supabase.from("users").update({ marks: (user.marks || 0) + reward, last_user_rob_at: now.toISOString() }).eq("user_id", user.user_id);
        msg = `⚔️ شما در نبرد با ${opponent.first_name} پیروز شدید و ${reward} مارک غنیمت گرفتید! 🔥`;
        
        try {
          await bot.api.sendMessage(opponent.user_id, `⚠️ سرباز ${user.first_name} به شما حمله کرد و در نبرد پیروز شد!`);
        } catch (e) {}
      } else {
        const reward = Math.floor((user.marks || 0) * 0.011);
        await supabase.from("users").update({ marks: (user.marks || 0) + reward, last_user_rob_at: now.toISOString() }).eq("user_id", user.user_id);
        msg = `💥 شما در نبرد با ${opponent.first_name} شکست خوردید اما ${reward} مارک غنیمت جزیی به دست آوردید.`;

        try {
          await bot.api.sendMessage(opponent.user_id, `🛡 سرباز ${user.first_name} به شما حمله کرد اما دفاع شما محکم بود!`);
        } catch (e) {}
      }

      await ctx.answerCallbackQuery("نبرد پایان یافت.");
      return ctx.editMessageText(msg);
    }
  } catch (e) {
    console.error("Callback Handler Error:", e);
  }
});

// خروجی ورسل
module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      const handleUpdate = webhookCallback(bot, "http");
      await handleUpdate(req, res);
    } else {
      res.status(200).send("Sigma Telegram Bot Server is Live!");
    }
  } catch (err) {
    console.error("Serverless Handler Error:", err);
    res.status(500).send("Internal Error");
  }
};
