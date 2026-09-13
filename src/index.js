/**
 * PishvaBot - Telegram Bot Engine on Cloudflare Workers & Supabase
 */

const SUPABASE_URL = "https://ziodmekyeqqhggwjblrl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2RtZWt5ZXFxaGdnd2pibHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA2MTM5MiwiZXhwIjoyMTA0NjM3MzkyfQ.EcDkLO0H8x5hyXRI3X6P0vvu4ihIuQnoDOOPRxjP3pg";

// ------------------- SUPABASE CLIENT UTILS -------------------
async function dbFetch(endpoint, options = {}) {
    options.headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        ...options.headers
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`DB Error [${res.status}]: ${err}`);
    }
    return res.json();
}

async function getOrCreateUser(tgUser) {
    const data = await dbFetch(`users?user_id=eq.${tgUser.id}`);
    if (data.length > 0) {
        if (tgUser.username && data[0].username !== tgUser.username) {
            await dbFetch(`users?user_id=eq.${tgUser.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ username: tgUser.username, first_name: tgUser.first_name })
            });
        }
        return data[0];
    }
    const newUser = {
        user_id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || "سرباز",
        marks: 0,
        level: 1,
        bank_balance: 0,
        reichsbank_level: 0
    };
    const created = await dbFetch(`users`, {
        method: 'POST',
        body: JSON.stringify(newUser)
    });
    return created[0];
}

async function getUserByUsername(username) {
    const cleanUsername = username.replace('@', '');
    const data = await dbFetch(`users?username=eq.${cleanUsername}`);
    return data[0] || null;
}

// ------------------- GAME CONSTANTS -------------------
const WEAPONS = {
    'چوب بیسبال': { price: 1000, damage: 50 },
    'چاقو': { price: 1200, damage: 65 },
    'پیستول': { price: 5200, damage: 100 },
    'نارنجک': { price: 6000, damage: 200 },
    'شاتگان': { price: 7000, damage: 210 },
    'اسنایپر': { price: 10000, damage: 300 },
    'آر پی جی': { price: 10000, damage: 300 }
};

const ARMORS = {
    'ماسک پوشاندن صورت': { price: 1000, health: 0 },
    'جلیقه سطح ۱': { price: 1000, health: 200 },
    'جلیقه سطح ۳': { price: 2800, health: 600 },
    'جلیقه سطح ۵': { price: 3999, health: 1000 },
    'زانو بند': { price: 2000, health: 400 },
    'لباس جعلی پلیس': { price: 8000, health: 2500 }
};

const RIFLE_LEVELS = {
    1: 100,
    2: 1200,
    3: 3000,
    4: 7000,
    5: 14000,
    6: 30000
};

const TROPHIES = {
    'دورگه': 200,
    'غیر اصیل': 400,
    'انگل': 800,
    'مفت خور': 1600,
    'آفت': 2000,
    'حشرات موذی': 4000
};

// ------------------- HELPER FUNCTIONS -------------------
function getTitle(level) {
    if (level <= 3) return "🎖️ سرباز صفر";
    if (level <= 5) return "⚔️ جناب سروان";
    return "👑 افسر ارشد پیشوا";
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ------------------- TELEGRAM API WRAPPER -------------------
async function sendTg(token, method, payload) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

// ------------------- WORKER ENTRY POINT -------------------
export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return new Response('PishvaBot Active!', { status: 200 });
        
        const token = env.BOT_TOKEN;
        try {
            const update = await request.json();
            
            if (update.message) {
                await handleMessage(token, update.message);
            } else if (update.callback_query) {
                await handleCallback(token, update.callback_query);
            }
        } catch (err) {
            console.error("Worker Error:", err);
        }
        return new Response('OK', { status: 200 });
    }
};

// ------------------- MESSAGE HANDLER -------------------
async function handleMessage(token, msg) {
    if (!msg.from || msg.from.is_bot) return;

    const user = await getOrCreateUser(msg.from);
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const replyMsgId = msg.message_id;

    // 1. مجازات برای کلمات ممنوعه
    if (['سلام', 'های', 'هلو'].includes(text.toLowerCase())) {
        let fine = 120;
        if (user.level === 2) fine = 130;
        if (user.level === 3) fine = 140;
        if (user.level === 4) fine = 4000;
        if (user.level >= 5) fine = 5000;

        const newMarks = Math.max(0, user.marks - fine);
        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ marks: newMarks, total_punishments: user.total_punishments + 1 })
        });

        const replyText = `🚨 **نقض قوانین نظامی!** 🚨\n\n` +
            `🔰 **درجه شما:** ${getTitle(user.level)}\n` +
            `🛑 **خطا:** استفاده از کلمات سوسول‌بازی (${text})\n` +
            `💸 **جریمه:** **-${fine}** مارک از حساب کسر شد!\n` +
            `⚡️ _جدی باش سرباز! اینجا پادگان است!_ ⚡️`;
        return sendTg(token, 'sendMessage', { chat_id: chatId, text: replyText, reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
    }

    // 2. دستور درود (جایزه)
    if (text === 'درود') {
        const cooldowns = { 1: 30, 2: 30, 3: 60, 4: 150, 5: 120, 6: 120 };
        const cdSec = cooldowns[user.level] || 30;

        if (user.last_dorood) {
            const diffSec = (new Date() - new Date(user.last_dorood)) / 1000;
            if (diffSec < cdSec) {
                const rem = Math.ceil(cdSec - diffSec);
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: `⌛ **صبر کن سرباز!**\n\n⏱ برای ادا احترام بعدی باید **${rem} ثانیه** دیگر منتظر بمانی! ⏳`,
                    reply_to_message_id: replyMsgId,
                    parse_mode: 'Markdown'
                });
            }
        }

        let reward = 0;
        if (user.level === 1) reward = getRandomInt(50, 120);
        else if (user.level === 2) reward = getRandomInt(120, 130);
        else if (user.level === 3) reward = getRandomInt(130, 140);
        else if (user.level === 4) reward = getRandomInt(250, 320);
        else if (user.level === 5) reward = getRandomInt(420, 500);
        else if (user.level === 6) reward = 1000;

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks + reward,
                last_dorood: new Date().toISOString(),
                total_doroods: user.total_doroods + 1
            })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🫡 **درود بر پیشوا!** 👑\n\n` +
                `💎 **پاداش وفاداری:** **+${reward}** مارک 💸\n` +
                `💰 **موجودی کل:** **${user.marks + reward}** مارک⚡️`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'Markdown'
        });
    }

    // 3. راهنما
    if (text === 'راهنما') {
        const helpText = `⚔️ 🔥 **پایگاه اطلاعاتی پیشوا بات** 🔥 ⚔️\n` +
            `✨ ────────────────── ✨\n\n` +
            `🫡 **درود** ➔ دریافت پاداش روزانه (دارای زمان انتظار)\n` +
            `📊 **آمار / آمارش** ➔ مشاهده شناسنامه رزمی و مالی شما\n` +
            `💀 **بازار سیاه** ➔ خرید تسلیحات سنگین و زره‌های نظامی\n` +
            `🏛 **بانک** ➔ مدیریت سرمایه و سپرده‌گذاری در رایشس بانک\n` +
            `💳 **واریز به بانک [مقدار]** ➔ انتقال پول از جیب به رایشس بانک\n` +
            `🏦 **دزدی از بانک** ➔ سرقت مسلحانه از خزانه (پرخطر!)\n` +
            `🗡 **دزدی از سرباز** ➔ درگیری خیابانی و غارت سایر سربازان\n` +
            `💸 **انتقال [مقدار]** ➔ انتقال مستقیم مارک به سایر بازیکنان\n` +
            `🦅 **شکار / قفس** ➔ شکار موجودات و فروش صیدها در بازار\n\n` +
            `🚨 **هشدار:** کلمات احوالپرسی غیرنظامی جریمه سنگین دارند! 🧨`;
        return sendTg(token, 'sendMessage', { chat_id: chatId, text: helpText, reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
    }

    // 4. دریافت آمار
    if (text === 'آمار' || text === 'امار' || text === 'آمارش' || text === 'امارش' || text.startsWith('آمار @') || text.startsWith('امار @')) {
        let targetUser = user;

        if (msg.reply_to_message) {
            targetUser = await getOrCreateUser(msg.reply_to_message.from);
        } else if (text.includes('@')) {
            const parts = text.split('@');
            if (parts[1]) {
                const found = await getUserByUsername(parts[1].trim());
                if (found) targetUser = found;
                else return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **کاربر مورد نظر در مقر پیدا نشد!** 🔎', reply_to_message_id: replyMsgId });
            }
        }

        const inv = await dbFetch(`user_inventory?user_id=eq.${targetUser.user_id}`);
        let power = 0, health = 0;
        inv.forEach(i => {
            if (WEAPONS[i.item_name]) power += WEAPONS[i.item_name].damage * i.quantity;
            if (ARMORS[i.item_name]) health += ARMORS[i.item_name].health * i.quantity;
        });

        const statsText = `📜 🔮 **شناسنامه و آمار نظامی:** 🔮 📜\n` +
            `✨ ────────────────── ✨\n\n` +
            `👤 **نام رزمنده:** ${targetUser.first_name}\n` +
            `🎖 **درجه نظامی:** ${getTitle(targetUser.level)} (سطح ${targetUser.level})\n` +
            `💎 **موجودی جیب:** **${targetUser.marks}** مارک 💵\n` +
            `🏛 **سپرده رایشس بانک:** **${targetUser.bank_balance}** مارک 🏦\n` +
            `🗡 **قدرت تهاجمی:** **${power}** HP 💣\n` +
            `🛡 **قدرت دفاعی (زره):** **${health}** HP 🛡\n` +
            `🦅 **سطح تفنگ شکاری:** **${targetUser.hunting_rifle_level}** 🎯\n` +
            `🫡 **تعداد ادای احترام:** **${targetUser.total_doroods}** بار\n` +
            `⚠️ **سابقه جریمه:** **${targetUser.total_punishments}** بار 🚨\n` +
            `⚔️ **تعداد نبردها:** **${targetUser.total_attacks}** جنگ 💥`;

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: statsText, reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
    }

    // 5. انتقال توکن
    if (text.startsWith('انتقال')) {
        let amount = 0;
        let targetUser = null;

        if (msg.reply_to_message) {
            amount = parseInt(text.replace('انتقال', '').trim());
            targetUser = await getOrCreateUser(msg.reply_to_message.from);
        } else if (text.includes('@')) {
            const parts = text.split(' ');
            amount = parseInt(parts[1]);
            if (parts[2]) targetUser = await getUserByUsername(parts[2]);
        }

        if (isNaN(amount) || amount <= 0 || !targetUser) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚫 **فرمت اشتباه!**\nمثال: `انتقال 500` رو پیام طرف یا `انتقال 500 @username` ⚡️', reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
        }

        if (user.user_id === targetUser.user_id) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **نمی‌توانی به خودت پول منتقل کنی!** 🤡', reply_to_message_id: replyMsgId });
        }

        if (user.marks < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '💸 **موجودی ناکافی!** این مقدار مارک در جیب نداری! ❌', reply_to_message_id: replyMsgId });
        }

        const keyboard = {
            inline_keyboard: [[
                { text: '💎 تایید و واریز 🚀', callback_data: `confirm_transfer:${targetUser.user_id}:${amount}` },
                { text: '🔥 انصراف ✖️', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚠️ 💸 **تاییدیه انتقال وجه نظامی:** 💸\n\n` +
                `آیا از انتقال **${amount}** مارک به **${targetUser.first_name}** اطمینان دارید؟ 🤔`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 6. قابلیت جدید: واریز پول به رایشس بانک
    if (text.startsWith('واریز به بانک')) {
        const amount = parseInt(text.replace('واریز به بانک', '').trim());
        if (isNaN(amount) || amount <= 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚫 **فرمت اشتباه!**\nمثال: `واریز به بانک 1000` 🏦', reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
        }

        if (user.marks < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '💸 **موجودی کیف پول شما کافی نیست!**', reply_to_message_id: replyMsgId });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks - amount,
                bank_balance: (user.bank_balance || 0) + amount
            })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 🚀 **سپرده‌گذاری در رایشس بانک با موفقیت انجام شد!** 🚀\n\n` +
                `💵 **مبلغ واریزی:** **+${amount}** مارک\n` +
                `🏛 **سپرده جدید بانک:** **${user.bank_balance + amount}** مارک 💎\n` +
                `💰 **کیف پول باقی‌مانده:** **${user.marks - amount}** مارک⚡️`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'Markdown'
        });
    }

    // 7. بازار سیاه
    if (text === 'بازار سیاه') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '⚔️ اسلحه خانه سنگین 💣', callback_data: 'bm_weapons' }, { text: '🛡 تجهیزات زرهی و دفاعی 🥷', callback_data: 'bm_armors' }],
                [{ text: '🦅 ارتقای تفنگ شکاری 🎯', callback_data: 'bm_rifle' }]
            ]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `💀 ⚡️ **به بازار سیاه زیرزمینی کاپو خوش آمدید!** ⚡️ 💀\n\n` +
                `🔥 _اینجا قوانین قانون‌مداران ارزشی ندارد؛ فقط مارک‌های شما حرف اول را می‌زند!_\n` +
                `چه تجهیزاتی لازم داری رزمنده؟ 🧨`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 8. تفنگ شکاری
    if (text === 'تفنگ شکاری') {
        const nextLvl = user.hunting_rifle_level + 1;
        if (nextLvl > 6) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🦅 **تفنگ شکاری شما در حداکثر سطح ممکن (سطح ۶ - افسانه‌ای) قرار دارد!** 👑', reply_to_message_id: replyMsgId });
        }
        const cost = RIFLE_LEVELS[nextLvl];
        const keyboard = {
            inline_keyboard: [[
                { text: `🚀 ارتقا به سطح ${nextLvl} (${cost} مارک) 💎`, callback_data: `buy_rifle:${nextLvl}:${cost}` },
                { text: '🔥 انصراف ✖️', callback_data: 'cancel' }
            ]]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🦅 🎯 **ارتقای سلاح شکاری:**\n\n` +
                `🔹 سطح کنونی: **${user.hunting_rifle_level}**\n` +
                `🔸 هزینه ارتقا به سطح **${nextLvl}**: **${cost}** مارک 💸\n\n` +
                `آیا تصمیم به ارتقا داری سرباز؟ ⚡️`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 9. دزدی از بانک
    if (text === 'دزدی از بانک') {
        if (user.last_bank_heist) {
            const diffMin = (new Date() - new Date(user.last_bank_heist)) / (1000 * 60);
            if (diffMin < 60) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🚨 **آژیرهای خطر به صدا درآمده‌اند!**\nپلیس‌ها منطقه را زیر نظر دارند. باید **${Math.ceil(60 - diffMin)} دقیقه** دیگر برای سرقت بعدی صبر کنی! 🕵️‍♂️`, reply_to_message_id: replyMsgId });
            }
        }

        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}`);
        let power = 0, health = 0;
        inv.forEach(i => {
            if (WEAPONS[i.item_name]) power += WEAPONS[i.item_name].damage * i.quantity;
            if (ARMORS[i.item_name]) health += ARMORS[i.item_name].health * i.quantity;
        });

        const keyboard = {
            inline_keyboard: [[
                { text: '🧨 شلیک و حمله به بانک! 💣', callback_data: 'confirm_bank_heist' },
                { text: '🏃‍♂️ عقب‌نشینی ✖️', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 🚨 **اتاق عملیات: نقشه سرقت مسلحانه از بانک مرکزی** 🚨\n\n` +
                `🗡 قدرت تخریب سلاح‌ها: **${power} HP** 💣\n` +
                `🛡 میزان جلیقه و استقامت: **${health} HP** 🛡\n\n` +
                `⚠️ آیا از نفوذ به خزانه محافظت‌شده مطمئن هستید؟ 🔥`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 10. دزدی از سرباز
    if (text === 'دزدی از سرباز') {
        if (user.last_soldier_attack) {
            const diffMin = (new Date() - new Date(user.last_soldier_attack)) / (1000 * 60);
            if (diffMin < 10) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🚨 **ردیابی شده‌ای!** برای حمله به سربازان بعدی **${Math.ceil(10 - diffMin)} دقیقه** کمین کن! 🥷`, reply_to_message_id: replyMsgId });
            }
        }

        const keyboard = {
            inline_keyboard: [[
                { text: '⚔️ ردگیری و شلیک به سرباز 💣', callback_data: 'confirm_soldier_attack' },
                { text: '✖️ لغو عملیات', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚔️ 🩸 **عملیات درگیری خیابانی:** 🩸 ⚔️\n\n` +
                `آیا می‌خواهی به اولین سرباز شناسایی‌شده در منطقه کمین بزنی و غارتش کنی؟ 🔥`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 11. بانک شخصی و رایشس بانک
    if (text === 'بانک') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '💎 برداشت سود ساعتی رایشس بانک 🚀', callback_data: 'reichsbank_menu' }],
                [{ text: '💵 واریز 1000 مارک 📥', callback_data: 'quick_deposit_1000' }, { text: '💵 واریز کل جیب 📥', callback_data: 'quick_deposit_all' }],
                [{ text: '📈 ارتقای سطح رایشس بانک 👑', callback_data: 'upgrade_reichsbank' }]
            ]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 💎 **مدیریت سرمایه و رایشس بانک** 💎 🏛\n` +
                `✨ ────────────────── ✨\n\n` +
                `💰 موجودی در جیب: **${user.marks}** مارک 💵\n` +
                `🏛 موجودی در رایشس بانک: **${user.bank_balance}** مارک 🏦\n` +
                `👑 سطح فعلی رایشس بانک: **سطح ${user.reichsbank_level}**⚡️\n\n` +
                `💡 _برای واریز مبالغ خاص می‌توانید دستور ` + "`واریز به بانک [مقدار]`" + ` را بفرستید._`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        });
    }

    // 12. شکار کردن
    if (text === 'شکار') {
        if (user.hunting_rifle_level === 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **برای شکار ابتدا باید تفنگ شکاری تهیه کنی!** (ارسال کلمه: `تفنگ شکاری`) 🎯', reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
        }

        const rand = Math.random() * 100;
        let hunted = '';

        if (user.hunting_rifle_level === 1) hunted = 'دورگه';
        else if (user.hunting_rifle_level === 2) hunted = rand <= 10 ? 'دورگه' : 'غیر اصیل';
        else if (user.hunting_rifle_level === 3) {
            if (rand <= 2) hunted = 'دورگه';
            else if (rand <= 10) hunted = 'غیر اصیل';
            else hunted = 'انگل';
        } else if (user.hunting_rifle_level === 4) {
            if (rand <= 1) hunted = 'دورگه';
            else if (rand <= 3) hunted = 'غیر اصیل';
            else if (rand <= 6) hunted = 'انگل';
            else hunted = 'مفت خور';
        } else if (user.hunting_rifle_level === 5) {
            hunted = rand <= 5 ? 'مفت خور' : 'آفت';
        } else if (user.hunting_rifle_level === 6) {
            hunted = rand <= 30 ? 'آفت' : 'حشرات موذی';
        }

        const existing = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${hunted}`);
        if (existing.length > 0) {
            await dbFetch(`user_inventory?id=eq.${existing[0].id}`, {
                method: 'PATCH',
                body: JSON.stringify({ quantity: existing[0].quantity + 1 })
            });
        } else {
            await dbFetch(`user_inventory`, {
                method: 'POST',
                body: JSON.stringify({ user_id: user.user_id, item_type: 'trophy', item_name: hunted, quantity: 1 })
            });
        }

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🦅 🎯 **شکار موفقیت‌آمیز بود!** 🎯\n\n` +
                `شما یک **«${hunted}»** نگونسار کردید! 🪵\n` +
                `📦 صید به قفس منتقل شد.`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'Markdown'
        });
    }

    // 13. قفس شکار
    if (text === 'قفس') {
        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_type=eq.trophy`);
        let totalValue = 0;
        let listText = "🪵 🦅 **محتویات قفس شکار شما:** 🦅 🪵\n✨ ────────────────── ✨\n\n";

        inv.forEach(i => {
            const val = (TROPHIES[i.item_name] || 0) * i.quantity;
            totalValue += val;
            listText += `🔹 **${i.item_name}**: ${i.quantity} عدد (ارزش هرکدام: ${TROPHIES[i.item_name]} | کل: ${val} 💎)\n`;
        });

        listText += `\n💵 **ارزش مجموع صیدها:** **${totalValue}** مارک 💸`;

        const keyboard = {
            inline_keyboard: [[{ text: '💎 چگونگی فروش صیدها 🚀', callback_data: 'sell_trophies_prompt' }]]
        };

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: listText, reply_to_message_id: replyMsgId, reply_markup: keyboard, parse_mode: 'Markdown' });
    }

    // 14. دستور فروش دستوری (مثلاً: فروش 6 دورگه)
    if (text.startsWith('فروش ')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
            const count = parseInt(parts[1]);
            const trophyName = parts.slice(2).join(' ').trim();

            if (!isNaN(count) && count > 0 && TROPHIES[trophyName]) {
                const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${trophyName}`);
                if (inv.length > 0 && inv[0].quantity >= count) {
                    const earned = count * TROPHIES[trophyName];
                    const newQty = inv[0].quantity - count;

                    if (newQty > 0) {
                        await dbFetch(`user_inventory?id=eq.${inv[0].id}`, { method: 'PATCH', body: JSON.stringify({ quantity: newQty }) });
                    } else {
                        await dbFetch(`user_inventory?id=eq.${inv[0].id}`, { method: 'DELETE' });
                    }

                    await dbFetch(`users?user_id=eq.${user.user_id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ marks: user.marks + earned })
                    });

                    return sendTg(token, 'sendMessage', {
                        chat_id: chatId,
                        text: `🎉 💵 **معامله سودآور انجام شد!** 💵 🎉\n\n` +
                            `تعداد **${count}** عدد **${trophyName}** فروخته شد.\n` +
                            `💎 سود به دست آمده: **+${earned}** مارک 🚀`,
                        reply_to_message_id: replyMsgId,
                        parse_mode: 'Markdown'
                    });
                } else {
                    return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **این تعداد از این نوع شکار در قفس نداری!** 🚫', reply_to_message_id: replyMsgId });
                }
            }
        }
    }
}

// ------------------- CALLBACK QUERY HANDLER (دکمه‌های شیشه‌ای) -------------------
async function handleCallback(token, cb) {
    const user = await getOrCreateUser(cb.from);
    const chatId = cb.message.chat.id;
    const data = cb.data;

    if (data === 'cancel') {
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '✖️ **عملیات با دستور رزمنده لغو شد.**' });
    }

    // سریع واریز 1000 یا کل پول به رایشس بانک
    if (data === 'quick_deposit_1000' || data === 'quick_deposit_all') {
        let amount = data === 'quick_deposit_1000' ? 1000 : user.marks;
        if (amount <= 0 || user.marks < amount) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ موجودی جیب کافی نیست!', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks - amount,
                bank_balance: (user.bank_balance || 0) + amount
            })
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🏛 🚀 **واریز انجام شد!**\nمبلغ **${amount}** مارک به رایشس بانک منتقل شد.\n🏦 موجودی بانک: **${(user.bank_balance || 0) + amount}** مارک`
        });
    }

    // تایید انتقال مارک
    if (data.startsWith('confirm_transfer:')) {
        const [, targetId, amountStr] = data.split(':');
        const amount = parseInt(amountStr);
        const target = await dbFetch(`users?user_id=eq.${targetId}`);

        if (target.length === 0 || user.marks < amount) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ خطا! موجودی شما کافی نیست.', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: user.marks - amount }) });
        await dbFetch(`users?user_id=eq.${targetId}`, { method: 'PATCH', body: JSON.stringify({ marks: target[0].marks + amount }) });

        sendTg(token, 'sendMessage', {
            chat_id: targetId,
            text: `📩 💵 **اعلان واریزی غنیمت!**\nکاربر **${user.first_name}** مقدار **${amount}** مارک به حساب شما واریز کرد. 🚀`
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `✅ 🚀 **انتقال موفقیت‌آمیز!**\nمقدار **${amount}** مارک با موفقیت به **${target[0].first_name}** منتقل گردید.`
        });
    }

    // بازار سیاه - لیست سلاح‌ها
    if (data === 'bm_weapons') {
        let text = "⚔️ 💣 **تسلیحات نظامی بازار سیاه:** 💣 ⚔️\n\n";
        const buttons = [];
        Object.keys(WEAPONS).forEach(w => {
            text += `🔹 **${w}**: ${WEAPONS[w].price} مارک | قدرت: ${WEAPONS[w].damage} HP 💥\n`;
            buttons.push([{ text: `خرید ${w} (${WEAPONS[w].price} مارک) 🗡`, callback_data: `buy_item:weapon:${w}` }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }

    // بازار سیاه - لیست جلیقه‌ها
    if (data === 'bm_armors') {
        let text = "🛡 🥷 **تجهیزات دفاعی بازار سیاه:** 🥷 🛡\n\n";
        const buttons = [];
        Object.keys(ARMORS).forEach(a => {
            text += `🔹 **${a}**: ${ARMORS[a].price} مارک | زره: +${ARMORS[a].health} HP 🛡\n`;
            buttons.push([{ text: `خرید ${a} (${ARMORS[a].price} مارک) 🥷`, callback_data: `buy_item:armor:${a}` }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }

    // خرید آیتم سلاح / زره
    if (data.startsWith('buy_item:')) {
        const [, type, name] = data.split(':');
        const item = type === 'weapon' ? WEAPONS[name] : ARMORS[name];

        if (user.marks < item.price) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ موجودی کافی نداری سرباز!', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: user.marks - item.price }) });

        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${name}`);
        if (inv.length > 0) {
            await dbFetch(`user_inventory?id=eq.${inv[0].id}`, { method: 'PATCH', body: JSON.stringify({ quantity: inv[0].quantity + 1 }) });
        } else {
            await dbFetch(`user_inventory`, { method: 'POST', body: JSON.stringify({ user_id: user.user_id, item_type: type, item_name: name, quantity: 1 }) });
        }

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `🎉 ⚔️ تجهیزات **«${name}»** خریداری شد و به انبار تسلیحات اضافه گردید.` });
    }

    // ارتقای تفنگ شکاری
    if (data.startsWith('buy_rifle:')) {
        const [, lvlStr, costStr] = data.split(':');
        const targetLvl = parseInt(lvlStr);
        const cost = parseInt(costStr);

        if (user.marks < cost) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ موجودی کافی نیست!', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ marks: user.marks - cost, hunting_rifle_level: targetLvl })
        });

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `🎯 🚀 تفنگ شکاری شما با موفقیت به **سطح ${targetLvl}** ارتقا پیدا کرد.` });
    }

    // انجام عملیات حمله به بانک
    if (data === 'confirm_bank_heist') {
        const banks = [1000, 3000, 6000, 9000, 10000, 17000, 20000, 22000];
        const bankVault = banks[Math.floor(Math.random() * banks.length)];

        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}`);
        let power = 0, health = 0;
        inv.forEach(i => {
            if (WEAPONS[i.item_name]) power += WEAPONS[i.item_name].damage * i.quantity;
            if (ARMORS[i.item_name]) health += ARMORS[i.item_name].health * i.quantity;
        });

        let lossRatio = 0.7;
        let profitMult = 1.5;

        if (health > 400 && power > 200) {
            lossRatio = 0.75;
            profitMult = 3.5;
        }

        const totalEquipVal = inv.reduce((sum, i) => {
            const p = WEAPONS[i.item_name]?.price || ARMORS[i.item_name]?.price || 0;
            return sum + (p * i.quantity);
        }, 0);

        const lostVal = Math.floor(totalEquipVal * lossRatio);
        const netProfit = Math.floor(lostVal * profitMult);

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks + netProfit,
                last_bank_heist: new Date().toISOString(),
                total_attacks: user.total_attacks + 1
            })
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `💥 💣 **نتیجه سرقت مسلحانه از بانک (خزانه: ${bankVault} مارک):** 💣 💥\n\n` +
                `📉 آسیب به تجهیزات: **${lostVal}** مارک\n` +
                `💎 غنیمت و پول نقد به دست آمده: **+${netProfit}** مارک 🚀\n` +
                `💰 دارایی فعلی جیب: **${user.marks + netProfit}** مارک 💸`
        });
    }

    // انجام حمله به سرباز
    if (data === 'confirm_soldier_attack') {
        const opponents = await dbFetch(`users?user_id=neq.${user.user_id}&limit=10`);
        if (opponents.length === 0) {
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ هیچ سربازی در محدوده عملیاتی جهت درگیری یافت نشد!' });
        }

        const target = opponents[Math.floor(Math.random() * opponents.length)];

        const uInv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}`);
        const tInv = await dbFetch(`user_inventory?user_id=eq.${target.user_id}`);

        let uPower = 100, tPower = 100;
        uInv.forEach(i => { if (WEAPONS[i.item_name]) uPower += WEAPONS[i.item_name].damage; });
        tInv.forEach(i => { if (WEAPONS[i.item_name]) tPower += WEAPONS[i.item_name].damage; });

        let isWinner = uPower >= tPower;
        let gain = isWinner ? Math.floor(uPower * 0.02) : Math.floor(uPower * 0.011);

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks + gain,
                last_soldier_attack: new Date().toISOString(),
                total_attacks: user.total_attacks + 1
            })
        });

        sendTg(token, 'sendMessage', {
            chat_id: target.user_id,
            text: `🚨 ⚔️ **اعلام هشدار درگیری!** ⚔️ 🚨\nسرباز **${user.first_name}** به سنگر شما شبیخون زد!\nشما به سختی عقب‌نشینی کردید.`
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `⚔️ 🩸 **نتیجه نبرد خیابانی با ${target.first_name}:**\n\n` +
                `${isWinner ? '🎉 👑 پیروز شدید و منطقه را فتح کردید!' : '💔 🩸 عقب‌نشینی کردید اما غنیمت برداشتید!'}\n` +
                `💎 غنیمت جنگی شما: **+${gain}** مارک 🚀`
        });
    }

    // رایشس بانک - سود و برداشت
    if (data === 'reichsbank_menu') {
        const now = new Date();
        const last = new Date(user.last_reichsbank_claim || now);
        const hours = Math.floor((now - last) / (1000 * 60 * 60));

        let baseRate = 0.1;
        if (user.bank_balance > 10000) baseRate = 0.4;
        else if (user.bank_balance > 6000) baseRate = 0.35;
        else if (user.bank_balance > 2000) baseRate = 0.3;

        const multipliers = { 0: 1, 1: 1.7, 2: 2.3, 3: 2.8, 4: 3.5, 5: 4, 6: 5 };
        const rate = baseRate * multipliers[user.reichsbank_level];
        const profit = Math.floor((user.bank_balance / 100) * rate * hours);

        if (profit > 0) {
            await dbFetch(`users?user_id=eq.${user.user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    marks: user.marks + profit,
                    last_reichsbank_claim: now.toISOString()
                })
            });
        }

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🏛 👑 **به خزانه اصلی رایشس بانک خوش آمدید!** 👑 🏛\n\n` +
                `🏦 کل سرمایه موجود در بانک: **${user.bank_balance}** مارک\n` +
                `📈 نرخ سود ساعتی شما: **${rate}%**\n` +
                `💎 سود محاسبه شده (${hours} ساعت): **+${profit}** مارک 🚀\n\n` +
                `✅ _مبلغ سود مستقیم به جیب شما واریز شد._`
        });
    }

    // ارتقای سطح رایشس بانک
    if (data === 'upgrade_reichsbank') {
        if (user.bank_balance < 6000) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ برای ارتقای رایشس بانک باید حداقل ۶۰۰۰ مارک در سپرده بانک داشته باشید!', show_alert: true });
        }

        const costs = { 0: 2500, 1: 3200, 2: 4000, 3: 5200, 4: 6000, 5: 13000 };
        const nextLvl = user.reichsbank_level + 1;

        if (nextLvl > 6) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '👑 رایشس بانک شما در حداکثر سطح قرار دارد!', show_alert: true });
        }

        const cost = costs[user.reichsbank_level];
        if (user.marks < cost) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: `❌ مارک کافی در جیب نداری! هزینه: ${cost} مارک`, show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks - cost,
                reichsbank_level: nextLvl
            })
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🏛 👑 **رایشس بانک با موفقیت ارتقا یافت!** 👑\n\n` +
                `🌟 سطح جدید: **سطح ${nextLvl}**\n` +
                `🚀 ضریب سود پرداختی شما به شدت افزایش یافت!`
        });
    }

    // فروش شکار از طریق راهنما
    if (data === 'sell_trophies_prompt') {
        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `💎 💵 **راهنمای فروش صیدهای قفس:** 💵 💎\n\n` +
                `برای فروش شکارها عبارت زیر را ارسال نمایید:\n\n` +
                ` ` + `فروش [تعداد] [نام شکار]` + ` \n\n` +
                `📌 **مثال:**\n` +
                ` ` + `فروش 6 دورگه`
        });
    }
}
