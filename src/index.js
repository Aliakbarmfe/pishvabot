export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json();
      if (update.message && update.message.text) {
        await handleMessage(update.message, env);
      }
    } catch (err) {
      console.error(err);
    }

    return new Response("OK", { status: 200 });
  }
};

// توکن مستقیم قرار داده شد
const BOT_TOKEN = "8820980497:AAH7pJaEBk9gOYBAPllruazDLDLWlPW5hrI";

// تنظیمات مربوط به لول‌ها و جوایز/جریمه‌ها
const LEVEL_CONFIG = [
  { level: 1, minMark: 0, rewardMin: 50, rewardMax: 120, cooldownSec: 300, penalty: 120 },
  { level: 2, minMark: 3000, rewardMin: 120, rewardMax: 130, cooldownSec: 240, penalty: 130 },
  { level: 3, minMark: 4000, rewardMin: 130, rewardMax: 140, cooldownSec: 180, penalty: 140 },
  { level: 4, minMark: 6000, rewardMin: 250, rewardMax: 320, cooldownSec: 300, penalty: 4000 },
  { level: 5, minMark: 10000, rewardMin: 420, rewardMax: 500, cooldownSec: 480, penalty: 5000 }
];

function getLevelInfo(marks) {
  let currentLevel = LEVEL_CONFIG[0];
  for (let i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
    if (marks >= LEVEL_CONFIG[i].minMark) {
      currentLevel = LEVEL_CONFIG[i];
      break;
    }
  }
  return currentLevel;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const messageId = message.message_id;
  const text = message.text.trim().toLowerCase();

  const isReward = text === "درود";
  const isPenalty = ["سلام", "های", "هلو"].includes(text);

  if (!isReward && !isPenalty) return;

  // دریافت اطلاعات کاربر از KV یا حافظه موقت
  const kvKey = `user:${userId}`;
  let userData = { marks: 0, lastRewardTime: 0 };
  
  if (env.USER_STORE) {
    const userDataRaw = await env.USER_STORE.get(kvKey);
    if (userDataRaw) userData = JSON.parse(userDataRaw);
  }

  let currentConfig = getLevelInfo(userData.marks);
  const now = Math.floor(Date.now() / 1000);

  if (isReward) {
    const timePassed = now - userData.lastRewardTime;
    if (timePassed < currentConfig.cooldownSec) {
      const waitTime = Math.ceil((currentConfig.cooldownSec - timePassed) / 60);
      const replyMsg = `⏳ شما باید ${waitTime} دقیقه دیگر برای دریافت جایزه صبر کنید.`;
      await sendTelegramReply(chatId, messageId, replyMsg);
      return;
    }

    const reward = getRandomInt(currentConfig.rewardMin, currentConfig.rewardMax);
    userData.marks += reward;
    userData.lastRewardTime = now;

    const newConfig = getLevelInfo(userData.marks);
    let replyText = `🎉 آفرین! شما ${reward} مارک جایزه گرفتید.\n💰 کل مارک‌های شما: ${userData.marks}\n📊 لول فعلی: ${newConfig.level}`;

    if (newConfig.level > currentConfig.level) {
      replyText += `\n🚀 تبریک! لول شما به ${newConfig.level} ارتقا یافت!`;
    }

    if (env.USER_STORE) {
      await env.USER_STORE.put(kvKey, JSON.stringify(userData));
    }
    await sendTelegramReply(chatId, messageId, replyText);

  } else if (isPenalty) {
    const penaltyAmount = currentConfig.penalty;
    userData.marks = Math.max(0, userData.marks - penaltyAmount);

    const newConfig = getLevelInfo(userData.marks);
    let replyText = `⚠️ شما از کلمه ممنوعه استفاده کردید!\n🔻 ${penaltyAmount} مارک از شما کسر شد.\n💰 کل مارک‌های شما: ${userData.marks}\n📊 لول فعلی: ${newConfig.level}`;

    if (newConfig.level < currentConfig.level) {
      replyText += `\nافت لول! لول شما به ${newConfig.level} کاهش یافت.`;
    }

    if (env.USER_STORE) {
      await env.USER_STORE.put(kvKey, JSON.stringify(userData));
    }
    await sendTelegramReply(chatId, messageId, replyText);
  }
}

async function sendTelegramReply(chatId, replyToMessageId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_to_message_id: replyToMessageId
    })
  });
}
