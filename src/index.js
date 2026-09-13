import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { createClient } from "@supabase/supabase-js";

// تنظیمات ثابت (اطلاعات Supabase تغییری نکرده است)
const BOT_TOKEN = "8820980497:AAH7pJaEBk9gOYBAPllruazDLDLWlPW5hrI";
const SUPABASE_URL = "https://ziodmekyeqqhggwjblrl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2RtZWt5ZXFxaGdnd2pibHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA2MTM5MiwiZXhwIjoyMTA0NjM3MzkyfQ.EcDkLO0H8x5hyXRI3X6P0vvu4ihIuQnoDOOPRxjP3pg";

const pishvabot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

pishvabot.catch((err) => {
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

// اطلاعات شکار
const HUNT_TARGETS = {
  hybrid: { name: "دورگه 🐕", price: 200 },
  non_pure: { name: "غیر اصیل 🐺", price: 400 },
  parasite: { name: "انگل 🐛", price: 800 },
  freeloader: { name: "مفت خور 🪰", price: 1600 },
  pests: { name: "آفت‌ها 🐀", price: 2000 },
  insects: { name: "حشرات موذی 🦟", price: 4000 }
};

const GUN_UPGRADES = {
  1: 100,
  2: 1200,
  3: 3000,
  4: 7000,
  5: 14000,
  6: 30000
};

// محاسبه سطح براساس مارک
function getLevel(marks) {
  const m = marks || 0;
  if (m >= 20000) return 6;
  if (m >= 10000) return 5;
  if (m >= 6000) return 4;
  if (m >= 4000) return 3;
  if (m >= 3000) return 2;
  return 1;
}

// تعیین لحن و درجه بر اساس سطح
function getTitleAndTone(level, name) {
  const safeName = name || "سرباز";
  if (level <= 3) return { title: `عنصر بی‌ارزش (${safeName}) 🗑`, prefix: "آهای آشغال! " };
  if (level <= 5) return { title: `سرباز ارشد (${safeName}) 🎖`, prefix: "جناب سرباز، " };
  return { title: `فرمانده کبیر (${safeName}) 👑⚡️`, prefix: "قربان! با احترام کامل، " };
}

// دریافت یا ایجاد کاربر
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
      await supabase.from("bank").insert([{ user_id: u.id, reichs_balance: 0, reichs_level: 0 }]);
      await supabase.from("hunting").insert([{ user_id: u.id, gun_level: 0 }]);
      user = insertedUser || newUser;
    } else if (u.username && user.username !== u.username) {
      await supabase.from("users").update({ username: u.username }).eq("user_id", u.id);
    }
    return user;
  } catch (e) {
    console.error("getUser error:", e);
    return { user_id: u.id, username: u.username || "", first_name: u.first_name || "سرباز", marks: 0 };
  }
}

// دریافت تجهیزات و قدرت
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

// ==========================================
// پردازش پیام‌های متنی
// ==========================================
pishvabot.on("message:text", async (ctx) => {
  try {
    const rawText = ctx.message.text.trim();
    const cleanText = rawText.replace(/\s+/g, "").toLowerCase();

    // ۱. بازار سیاه
    if (cleanText.includes("بازارسیاه")) {
      const kb = new InlineKeyboard()
        .text("🪵 چوب بیسبال (1000)", "buy_weapon_bat")
        .text("🔪 چاقو (1200)", "buy_weapon_knife").row()
        .text("🔫 پیستول (5200)", "buy_weapon_pistol")
        .text("💣 نارنجک (6000)", "buy_weapon_grenade").row()
        .text("💥 شاتگان (7000)", "buy_weapon_shotgun")
        .text("🎯 اسنایپر (10000)", "buy_weapon_sniper").row()
        .text("🚀 آر پی جی (10000)", "buy_weapon_rpg").row()
        .text("🎭 ماسک صورت (1000)", "buy_armor_mask")
        .text("🛡 جلیقه لول ۱ (1000)", "buy_armor_vest1").row()
        .text("🛡 جلیقه لول ۳ (2800)", "buy_armor_vest3")
        .text("🛡 جلیقه لول ۵ (3999)", "buy_armor_vest5").row()
        .text("🦵 زانوبند (2000)", "buy_armor_knee")
        .text("👮‍♂️ لباس پلیس (8000)", "buy_armor_police");

      return ctx.reply(`وارد بازار سیاه (مقر کاپو) شدید. تجهیزات مورد نیاز را انتخاب کنید: 🖤🕶`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    const user = await getUser(ctx);
    if (!user) return;

    const lvl = getLevel(user.marks);
    const tone = getTitleAndTone(lvl, user.first_name);

    // ۲. کلمات ممنوعه
    if (["سلام", "های", "هلو"].some(w => rawText.toLowerCase().includes(w))) {
      const penaltyMap = { 1: 120, 2: 130, 3: 140, 4: 4000, 5: 5000, 6: 5000 };
      const penalty = penaltyMap[lvl] || 120;
      
      await supabase.from("users").update({
        marks: Math.max(0, (user.marks || 0) - penalty),
        punish_count: (user.punish_count || 0) + 1
      }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}استفاده از کلمات غیرنظامی ممنوع است! 🚫\nجریمه: ${penalty} مارک کسر شد.`, { reply_to_message_id: ctx.message.message_id });
    }

    // ۳. سیستم درود
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

    // ۴. آمار
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

    // ۷. انتقال مارک
    if (cleanText.startsWith("انتقال")) {
      const parts = rawText.split(" ");
      const amount = parseInt(parts[1]);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`${tone.prefix}فرمان نامعتبر! فرمت صحیح:\nانتقال 500 (روی پیام) یا انتقال 500 @ali`, { reply_to_message_id: ctx.message.message_id });
      }

      let targetId = null;
      if (ctx.message.reply_to_message && ctx.message.reply_to_message.from) {
        targetId = ctx.message.reply_to_message.from.id;
      } else if (parts[2] && parts[2].startsWith("@")) {
        const targetUsername = parts[2].replace("@", "");
        const { data } = await supabase.from("users").select("user_id").eq("username", targetUsername).maybeSingle();
        if (data) targetId = data.user_id;
      }

      if (!targetId) return ctx.reply(`${tone.prefix}هدف مورد نظر یافت نشد!`, { reply_to_message_id: ctx.message.message_id });
      if ((user.marks || 0) < amount) return ctx.reply(`${tone.prefix}خزانه شما خالی است! موجودی کافی نیست. ❌`, { reply_to_message_id: ctx.message.message_id });

      const kb = new InlineKeyboard()
        .text("✅ تایید و انتقال", `confirm_transfer_${targetId}_${amount}`)
        .text("❌ انصراف", "cancel_action");

      return ctx.reply(`${tone.prefix}آیا از انتقال ${amount} مارک به فرد موردنظر اطمینان دارید؟ 💸`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    // ۸. بخش بانک و رایشس بانک
    if (cleanText === "بانک") {
      const { data: bankData } = await supabase.from("bank").select("*").eq("user_id", user.user_id).maybeSingle();
      const rBalance = bankData?.reichs_balance || 0;

      const kb = new InlineKeyboard()
        .text("📈 سود گرفتن از بانک", "bank_claim_profit").row()
        .text("⚡️ ارتقای رایشس بانک", "bank_upgrade");

      return ctx.reply(`🏦 **بانک مرکزی و رایشس بانک:**\n\n💰 موجودی شخصی: ${user.marks || 0} مارک\n🏛 موجودی در رایشس بانک: ${rBalance} مارک\n🎖 لول رایشس بانک: ${bankData?.reichs_level || 0}`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb,
        parse_mode: "Markdown"
      });
    }

        // ۸.۵. واریز به رایشس بانک (مثال: واریز به بانک 1000)
    if (cleanText.startsWith("واریزبهبانک")) {
      const parts = rawText.split(" ");
      const amount = parseInt(parts[1]);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`${tone.prefix}فرمان نامعتبر! فرمت صحیح:\n` + "`واریز به بانک 1000`", {
          reply_to_message_id: ctx.message.message_id,
          parse_mode: "Markdown"
        });
      }

      if ((user.marks || 0) < amount) {
        return ctx.reply(`${tone.prefix}موجودی مارک شما کافی نیست! ❌`, { reply_to_message_id: ctx.message.message_id });
      }

      // دریافت اطلاعات بانک کاربر
      const { data: bankData } = await supabase.from("bank").select("*").eq("user_id", user.user_id).maybeSingle();
      const currentBankBalance = bankData?.reichs_balance || 0;

      // کسر از حساب شخصی و افزودن به رایشس بانک
      await supabase.from("users").update({ marks: user.marks - amount }).eq("user_id", user.user_id);
      await supabase.from("bank").upsert({
        user_id: user.user_id,
        reichs_balance: currentBankBalance + amount,
        reichs_level: bankData?.reichs_level || 0
      });

      return ctx.reply(`${tone.prefix}مبلغ ${amount} مارک با موفقیت به رایشس بانک واریز شد. 🏛\nموجودی جدید بانک: ${currentBankBalance + amount} مارک`, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ۸.۶. برداشت از رایشس بانک (مثال: برداشت از بانک 1000)
    if (cleanText.startsWith("برداشتازبانک")) {
      const parts = rawText.split(" ");
      const amount = parseInt(parts[1]);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`${tone.prefix}فرمان نامعتبر! فرمت صحیح:\n` + "`برداشت از بانک 1000`", {
          reply_to_message_id: ctx.message.message_id,
          parse_mode: "Markdown"
        });
      }

      const { data: bankData } = await supabase.from("bank").select("*").eq("user_id", user.user_id).maybeSingle();
      const currentBankBalance = bankData?.reichs_balance || 0;

      if (currentBankBalance < amount) {
        return ctx.reply(`${tone.prefix}موجودی شما در رایشس بانک کافی نیست! ❌`, { reply_to_message_id: ctx.message.message_id });
      }

      // کسر از رایشس بانک و افزودن به حساب شخصی
      await supabase.from("bank").update({ reichs_balance: currentBankBalance - amount }).eq("user_id", user.user_id);
      await supabase.from("users").update({ marks: (user.marks || 0) + amount }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}مبلغ ${amount} مارک از رایشس بانک برداشت شد و به حساب شخصی شما منتقل گردید. 💵`, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ۹. تفنگ شکاری
    if (cleanText.includes("تفنگشکاری")) {
      const { data: hData } = await supabase.from("hunting").select("gun_level").eq("user_id", user.user_id).maybeSingle();
      const curLvl = hData?.gun_level || 0;
      const nextLvl = curLvl + 1;

      if (nextLvl > 6) {
        return ctx.reply(`${tone.prefix}تفنگ شکاری شما در حداکثر سطح ممکن (سطح ۶) قرار دارد! 🎯`, { reply_to_message_id: ctx.message.message_id });
      }

      const cost = GUN_UPGRADES[nextLvl];
      const kb = new InlineKeyboard()
        .text(`🎯 ارتقا به لول ${nextLvl} (${cost} مارک)`, `confirm_buy_gun_${nextLvl}_${cost}`)
        .text("❌ انصراف", "cancel_action");

      return ctx.reply(`${tone.prefix}سطح فعلی تفنگ شکاری شما: ${curLvl}\nهزینه ارتقا به لول ${nextLvl}: ${cost} مارک.\nآیا تایید می‌کنید؟`, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: kb
      });
    }

    // ۱۰. شکار کردن
    if (cleanText === "شکار") {
      const { data: hData } = await supabase.from("hunting").select("*").eq("user_id", user.user_id).maybeSingle();
      const gunLvl = hData?.gun_level || 0;

      if (gunLvl === 0) {
        return ctx.reply(`${tone.prefix}شما تفنگ شکاری ندارید! با فرستادن کلمه "تفنگ شکاری" اقدام به خرید کنید. 🎯`, { reply_to_message_id: ctx.message.message_id });
      }

      const rand = Math.random() * 100;
      let targetKey = "";

      if (gunLvl === 1) targetKey = "hybrid";
      else if (gunLvl === 2) targetKey = rand <= 10 ? "hybrid" : "non_pure";
      else if (gunLvl === 3) targetKey = rand <= 2 ? "hybrid" : rand <= 10 ? "non_pure" : "parasite";
      else if (gunLvl === 4) targetKey = rand <= 1 ? "hybrid" : rand <= 3 ? "non_pure" : rand <= 6 ? "parasite" : "freeloader";
      else if (gunLvl === 5) targetKey = rand <= 5 ? "freeloader" : "pests";
      else if (gunLvl === 6) targetKey = rand <= 30 ? "pests" : "insects";

      const targetObj = HUNT_TARGETS[targetKey];
      await supabase.from("hunting").update({
        [targetKey]: (hData[targetKey] || 0) + 1
      }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}عملیات شکار موفقیت‌آمیز بود! 🏹\nشما یک **${targetObj.name}** شکار کردید و به قفس منتقل شد.`, {
        reply_to_message_id: ctx.message.message_id,
        parse_mode: "Markdown"
      });
    }

    // ۱۱. قفس شکار
    if (cleanText === "قفس") {
      const { data: hData } = await supabase.from("hunting").select("*").eq("user_id", user.user_id).maybeSingle();
      
      let totalVal = 0;
      let text = "🕸 **محتویات قفس شکار شما:**\n\n";

      for (const [k, obj] of Object.entries(HUNT_TARGETS)) {
        const count = hData ? (hData[k] || 0) : 0;
        const val = count * obj.price;
        totalVal += val;
        text += `• ${obj.name}: ${count} عدد (ارزش: ${val} مارک)\n`;
      }

      text += `\n💰 **ارزش کل شکارها:** ${totalVal} مارک`;

      const kb = new InlineKeyboard().text("🏷 فروش شکارها", "sell_hunting_prompt");

      return ctx.reply(text, { reply_to_message_id: ctx.message.message_id, reply_markup: kb, parse_mode: "Markdown" });
    }

    // ۱۲. دستور فروش دستی
    if (cleanText.startsWith("فروش")) {
      const parts = rawText.split(" ");
      const count = parseInt(parts[1]);
      const name = parts[2];

      if (isNaN(count) || count <= 0 || !name) {
        return ctx.reply(`${tone.prefix}فرمان نامعتبر! فرمت صحیح: \nفروش 6 دورگه`, { reply_to_message_id: ctx.message.message_id });
      }

      let keyFound = null;
      for (const [k, obj] of Object.entries(HUNT_TARGETS)) {
        if (obj.name.includes(name)) {
          keyFound = k;
          break;
        }
      }

      if (!keyFound) return ctx.reply(`${tone.prefix}نوع شکار یافت نشد!`, { reply_to_message_id: ctx.message.message_id });

      const { data: hData } = await supabase.from("hunting").select("*").eq("user_id", user.user_id).maybeSingle();
      const currentCount = hData ? (hData[keyFound] || 0) : 0;

      if (currentCount < count) {
        return ctx.reply(`${tone.prefix}تعداد موجود در قفس کافی نیست! (موجودی: ${currentCount})`, { reply_to_message_id: ctx.message.message_id });
      }

      const totalEarned = count * HUNT_TARGETS[keyFound].price;

      await supabase.from("hunting").update({ [keyFound]: currentCount - count }).eq("user_id", user.user_id);
      await supabase.from("users").update({ marks: (user.marks || 0) + totalEarned }).eq("user_id", user.user_id);

      return ctx.reply(`${tone.prefix}تعداد ${count} عدد ${HUNT_TARGETS[keyFound].name} فروخته شد.\nمبلغ ${totalEarned} مارک به حساب شما اضافه شد. 💵`, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ۱۳. راهنما
    if (cleanText === "راهنما") {
      const help = `📜 **راهنمای جامع ربات پیشوا:**\n\n` +
        `🫡 **درود**: دریافت پاداش روزانه/دوره‌ای مارک\n` +
        `🖤 **بازار سیاه**: خرید سلاح و جلیقه دفاعی\n` +
        `🏦 **دزدی از بانک**: حمله مسلحانه به بانک‌ها\n` +
        `⚔️ **دزدی از سرباز**: نبرد تصادفی با سربازان\n` +
        `📊 **امار**: مشاهده پرونده نظامی خود یا دیگران\n` +
        `💸 **انتقال <مقدار>**: انتقال مارک به دیگران\n` +
        `🏦 **بانک**: ورود به سیستم رایشس بانک و مدیریت سود\n` +
        `🎯 **تفنگ شکاری**: خرید و ارتقای تفنگ شکاری\n` +
        `🏹 **شکار**: شکار حیوانات بر اساس سطح تفنگ\n` +
        `🕸 **قفس**: مشاهده و فروش شکارهای قفس\n` +
        `⚠️ **کلمات ممنوعه**: سلام، های، هلو (موجب جریمه سنگین)`;

      return ctx.reply(help, { reply_to_message_id: ctx.message.message_id, parse_mode: "Markdown" });
    }

  } catch (e) {
    console.error("Text Handler Error:", e);
  }
});

// ==========================================
// پردازش دکمه‌های شیشه‌ای (Callback Query)
// ==========================================
pishvabot.on("callback_query:data", async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;
    const user = await getUser(ctx);
    if (!user) return;

    if (data === "cancel_action") {
      await ctx.answerCallbackQuery("عملیات لغو شد.");
      return ctx.editMessageText("عملیات توسط کاربر لغو گردید. 🛑");
    }

    // خرید از بازار سیاه
    if (data.startsWith("buy_weapon_") || data.startsWith("buy_armor_")) {
      const isWeapon = data.startsWith("buy_weapon_");
      const itemKey = data.replace(isWeapon ? "buy_weapon_" : "buy_armor_", "");
      const item = isWeapon ? WEAPONS[itemKey] : ARMORS[itemKey];

      if ((user.marks || 0) < item.price) {
        return ctx.answerCallbackQuery({ text: "موجودی مارک شما کافی نیست! ❌", show_alert: true });
      }

      await supabase.from("users").update({ marks: user.marks - item.price }).eq("user_id", user.user_id);
      const { data: inv } = await supabase.from("inventory").select("*").eq("user_id", user.user_id).maybeSingle();
      const currentInv = inv || { weapons: [], armors: [] };

      if (isWeapon) {
        await supabase.from("inventory").upsert({ user_id: user.user_id, weapons: [...(currentInv.weapons || []), itemKey], armors: currentInv.armors || [] });
      } else {
        await supabase.from("inventory").upsert({ user_id: user.user_id, weapons: currentInv.weapons || [], armors: [...(currentInv.armors || []), itemKey] });
      }

      await ctx.answerCallbackQuery({ text: `خرید انجام شد: ${item.name}`, show_alert: true });
      return ctx.editMessageText(`تجهیزات [ ${item.name} ] خریداری شد و به انبار اضافه گردید. ⚔️`);
    }

    // تایید انتقال
    if (data.startsWith("confirm_transfer_")) {
      const [, , targetIdStr, amountStr] = data.split("_");
      const targetId = parseInt(targetIdStr);
      const amount = parseInt(amountStr);

      if ((user.marks || 0) < amount) {
        return ctx.answerCallbackQuery({ text: "موجودی کافی نیست!", show_alert: true });
      }

      const { data: target } = await supabase.from("users").select("*").eq("user_id", targetId).maybeSingle();
      if (!target) return ctx.editMessageText("کاربر مقصد یافت نشد.");

      await supabase.from("users").update({ marks: user.marks - amount }).eq("user_id", user.user_id);
      await supabase.from("users").update({ marks: (target.marks || 0) + amount }).eq("user_id", targetId);

      try {
        await pishvabot.api.sendMessage(user.user_id, `💸 شما مبلغ ${amount} مارک به ${target.first_name} منتقل کردید.`);
        await pishvabot.api.sendMessage(targetId, `🎁 شما مبلغ ${amount} مارک از طرف ${user.first_name} دریافت کردید.`);
      } catch (e) {}

      await ctx.answerCallbackQuery("انتقال انجام شد.");
      return ctx.editMessageText(`تراکنش تایید شد: ${amount} مارک به ${target.first_name} منتقل گردید. 🟢`);
    }

    // حمله به بانک
    if (data === "confirm_rob_bank") {
      const now = new Date();
      if (user.last_bank_rob_at && (now - new Date(user.last_bank_rob_at)) / 1000 < 3600) {
        return ctx.answerCallbackQuery({ text: "تا دزدی بعدی از بانک باید ۱ ساعت صبر کنید! ⏱", show_alert: true });
      }

      const { power, hp } = await getStats(user.user_id);
      const banks = [1000, 3000, 6000, 9000, 10000, 17000, 20000, 22000];
      const bankVal = banks[Math.floor(Math.random() * banks.length)];

      let profitRatio = 0.1;
      if (hp >= 100 && hp <= 400 && power >= 50 && power <= 200) profitRatio = 1.5 * 0.3;
      else if (hp > 400 && power > 200) profitRatio = 3.5 * 0.25;

      const profit = Math.floor(bankVal * profitRatio);

      await supabase.from("users").update({
        marks: (user.marks || 0) + profit,
        attack_count: (user.attack_count || 0) + 1,
        last_bank_rob_at: now.toISOString()
      }).eq("user_id", user.user_id);

      await ctx.answerCallbackQuery("حمله انجام شد!");
      return ctx.editMessageText(`💣 **نتیجه عملیات حمله به بانک (${bankVal} مارکی):**\n\nتیم شما موفق شد غنیمتی معادل ${profit} مارک استخراج کند! 💰`);
    }

    // دزدی از سرباز
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

      let isWin = myScore >= opScore;
      let reward = isWin ? Math.floor(myScore * 0.02) : Math.floor(myScore * 0.011);

      await supabase.from("users").update({
        marks: (user.marks || 0) + reward,
        attack_count: (user.attack_count || 0) + 1,
        last_user_rob_at: now.toISOString()
      }).eq("user_id", user.user_id);

      try {
        await pishvabot.api.sendMessage(opponent.user_id, `⚠️ **هشدار امنیتی:**\nسرباز ${user.first_name} به شما شبیخون زد!\nنتیجه نبرد: ${isWin ? "شکست شما" : "دفاع موفق"}`);
      } catch (e) {}

      await ctx.answerCallbackQuery("نبرد به پایان رسید.");
      return ctx.editMessageText(`⚔️ **نتیجه نبرد با ${opponent.first_name}:**\n\nوضعیت: ${isWin ? "پیروزی 🏆" : "شکست 💔"}\nسود حاصله: ${reward} مارک`);
    }

    // سود گرفتن از رایشس بانک
    if (data === "bank_claim_profit") {
      const { data: bankData } = await supabase.from("bank").select("*").eq("user_id", user.user_id).maybeSingle();
      const rBalance = bankData?.reichs_balance || 0;

      if (rBalance === 0) {
        return ctx.answerCallbackQuery({ text: "هیچ مارکی در رایشس بانک سرمایه‌گذاری نشده است!", show_alert: true });
      }

      const now = new Date();
      const lastClaim = new Date(bankData?.last_interest_claim || now);
      const hours = Math.floor((now - lastClaim) / (1000 * 60 * 60));

      if (hours < 1) {
        return ctx.answerCallbackQuery({ text: "هنوز ۱ ساعت از آخرین دریافت سود نگذشته است!", show_alert: true });
      }

      let baseRate = 0.1;
      if (rBalance > 10000) baseRate = 0.4;
      else if (rBalance > 6000) baseRate = 0.35;
      else if (rBalance > 2000) baseRate = 0.3;

      const multipliers = { 0: 1, 1: 1.7, 2: 2.3, 3: 2.8, 4: 3.5, 5: 4, 6: 5 };
      const levelMult = multipliers[bankData?.reichs_level || 0] || 1;

      const profitPerHour = (rBalance / 100) * baseRate * levelMult;
      const totalProfit = Math.floor(profitPerHour * hours);

      await supabase.from("users").update({ marks: (user.marks || 0) + totalProfit }).eq("user_id", user.user_id);
      await supabase.from("bank").update({ last_interest_claim: now.toISOString() }).eq("user_id", user.user_id);

      await ctx.answerCallbackQuery("سود واریز شد!");
      return ctx.editMessageText(`🏛 **خوش آمدید به رایشس بانک!**\n\nتعداد ساعت محاسبه‌شده: ${hours} ساعت\nسود واریزی به حساب: ${totalProfit} مارک 💵`);
    }

    // ارتقای رایشس بانک
    if (data === "bank_upgrade") {
      const { data: bankData } = await supabase.from("bank").select("*").eq("user_id", user.user_id).maybeSingle();
      const rBalance = bankData?.reichs_balance || 0;

      if (rBalance < 6000) {
        return ctx.answerCallbackQuery({ text: "برای ارتقای رایشس بانک باید حداقل 6000 مارک در آن سپرده داشته باشید!", show_alert: true });
      }

      const curLvl = bankData?.reichs_level || 0;
      const upgradeCosts = { 0: 2500, 1: 3200, 2: 4000, 3: 5200, 4: 6000, 5: 13000 };

      if (curLvl >= 6) {
        return ctx.answerCallbackQuery({ text: "رایشس بانک شما در سطح نهایی (۶) قرار دارد!", show_alert: true });
      }

      const cost = upgradeCosts[curLvl];
      if ((user.marks || 0) < cost) {
        return ctx.answerCallbackQuery({ text: `موجودی کافی نیست! هزینه ارتقا: ${cost} مارک`, show_alert: true });
      }

      await supabase.from("users").update({ marks: user.marks - cost }).eq("user_id", user.user_id);
      await supabase.from("bank").update({ reichs_level: curLvl + 1 }).eq("user_id", user.user_id);

      await ctx.answerCallbackQuery("ارتقا انجام شد!");
      return ctx.editMessageText(`⚡️ رایشس بانک شما با موفقیت به سطح ${curLvl + 1} ارتقا یافت.`);
    }

    // خرید/ارتقای تفنگ شکاری
    if (data.startsWith("confirm_buy_gun_")) {
      const [, , , lvlStr, costStr] = data.split("_");
      const targetLvl = parseInt(lvlStr);
      const cost = parseInt(costStr);

      if ((user.marks || 0) < cost) {
        return ctx.answerCallbackQuery({ text: "موجودی مارک کافی نیست!", show_alert: true });
      }

      await supabase.from("users").update({ marks: user.marks - cost }).eq("user_id", user.user_id);
      await supabase.from("hunting").update({ gun_level: targetLvl }).eq("user_id", user.user_id);

      await ctx.answerCallbackQuery("تفنگ ارتقا یافت!");
      return ctx.editMessageText(`🎯 تفنگ شکاری شما با موفقیت به سطح ${targetLvl} ارتقا یافت.`);
    }

    // راهنمای فروش قفس
    if (data === "sell_hunting_prompt") {
      await ctx.answerCallbackQuery();
      return ctx.reply(`برای فروش شکارها، دستور را به این شکل بفرستید:\n\n` + "`فروش 6 دورگه`", { parse_mode: "Markdown" });
    }

  } catch (e) {
    console.error("Callback Query Error:", e);
  }
});

// صادر کردن هاندر مخصو ص Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      return webhookCallback(pishvabot, "cloudflare-mod")(request);
    }
    return new Response("pishvabot is running successfully!");
  }
};
