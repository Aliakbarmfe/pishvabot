/**
 * PishvaBot - Telegram Bot Engine on Cloudflare Workers & Supabase
 * Fixed Version with Group-Only Game Logic, Permanent PV Keyboard & Private Notifications
 */

const SUPABASE_URL = "https://ziodmekyeqqhggwjblrl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2RtZWt5ZXFxaGdnd2pibHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA2MTM5MiwiZXhwIjoyMTA0NjM3MzkyfQ.EcDkLO0H8x5hyXRI3X6P0vvu4ihIuQnoDOOPRxjP3pg";

// ایموجی متحرک مارک (فقط برای استفاده در متن پیام‌ها)
const MARK_ANIM = '<tg-emoji emoji-id="5897862946431701391">🪙</tg-emoji>';

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

    // تولید رمز عبور تصادفی ۶ رقمی برای کاربر جدید
    const randomPassword = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = {
        user_id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || "سرباز",
        marks: 0,
        level: 1,
        bank_balance: 0,
        reichsbank_level: 0,
        site_password: randomPassword
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

// تبدیل اعداد فارسی/عربی به انگلیسی
function convertFaToEnNumbers(str) {
    if (!str) return '';
    return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
              .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// کیبورد دائمی مخصوص پیوی
function getPvReplyKeyboard() {
    return {
        keyboard: [
            [{ text: '🌐 ورود به سایت رایش بزرگ' }],
            [{ text: '🔑 رمز سایت' }, { text: '📖 راهنما' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
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
    const rawText = (msg.text || '').trim();
    const text = convertFaToEnNumbers(rawText);
    const replyMsgId = msg.message_id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // ------------------- بخش پیوی (پیام شخصی) -------------------
    if (!isGroup) {
        // تغییر رمز عبور متنی در پیوی (مثال: "رمز 5555" یا "رمز 282882")
        if (text.startsWith('رمز ')) {
            let newPass = text.replace('رمز ', '').trim();

            if (newPass.length < 4) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>رمز عبور باید حداقل ۴ کاراکتر باشد!</b>\nلطفاً مجدداً ارسال کنید (مثال: <code>رمز 5555</code>):',
                    reply_to_message_id: replyMsgId,
                    reply_markup: getPvReplyKeyboard(),
                    parse_mode: 'HTML'
                });
            }

            // ثبت رمز عبور جدید در دیتابیس
            await dbFetch(`users?user_id=eq.${user.user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ site_password: newPass })
            });

            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: `✅ <b>رمز عبور جدید شما با موفقیت ثبت شد!</b>\n🔐 رمز عبور جدید: <code>${newPass}</code>`,
                reply_to_message_id: replyMsgId,
                reply_markup: getPvReplyKeyboard(),
                parse_mode: 'HTML'
            });
        }

        // دستور /start در پیوی
        if (text === '/start') {
            const welcomeText = `👑 <b>به بات رسمی پیشوا بزرگ خوش آمدید!</b> 👑\n\n` +
                `⚔️ <i>مقر فرماندهی نیروهای رایش بزرگ</i>\n\n` +
                `⚠️ <b>توجه:</b> تمام عملیات‌ها، بازی‌ها و نبردها <b>فقط و فقط داخل گروه</b> امکان‌پذیر است.\n\n` +
                `👇 جهت دسترسی سریع می‌توانید از دکمه‌های کیبورد استفاده کنید:`;

            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: welcomeText,
                reply_markup: getPvReplyKeyboard(),
                parse_mode: 'HTML'
            });
        }

        // دکمه‌های ثابت کیبورد پیوی
        if (text === '🌐 ورود به سایت رایش بزرگ') {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: `🌐 <b>لینک ورود به سایت رایش بزرگ:</b>\n\nhttps://Pishwabot.vercel.app`,
                reply_markup: getPvReplyKeyboard(),
                parse_mode: 'HTML'
            });
        }

        if (text === '🔑 رمز سایت') {
            const passText = `🔑 <b>رمز عبور فعلی شما:</b> <code>${user.site_password}</code>\n\n` +
                `✏️ برای تغییر رمز عبور، عبارت زیر را ارسال کنید:\n` +
                `<code>رمز (رمز جدید)</code>\n\n` +
                `<b>مثال:</b>\n` +
                `<code>رمز 5555</code>`;

            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: passText,
                reply_markup: getPvReplyKeyboard(),
                parse_mode: 'HTML'
            });
        }

        if (text === '📖 راهنما' || text === 'راهنما') {
            return sendHelpMessage(token, chatId, replyMsgId, true);
        }

        return;
    }

    // ------------------- بخش گروه (Group Only) -------------------

    if (text === '/start') {
        return;
    }

    if (text === 'راهنما') {
        return sendHelpMessage(token, chatId, replyMsgId, false);
    }

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
            body: JSON.stringify({ marks: newMarks, total_punishments: (user.total_punishments || 0) + 1 })
        });

        const replyText = `🚨 <b>نقض قوانین نظامی!</b> 🚨\n\n` +
            `🔰 <b>درجه شما:</b> ${getTitle(user.level)}\n` +
            `🛑 <b>خطا:</b> استفاده از کلمات سوسول‌بازی (${text})\n` +
            `💸 <b>جریمه:</b> <b>-${fine}</b> مارک ${MARK_ANIM} از حساب کسر شد!\n` +
            `⚡️ <i>جدی باش سرباز! اینجا پادگان است!</i> ⚡️`;
        return sendTg(token, 'sendMessage', { chat_id: chatId, text: replyText, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
                    text: `⌛ <b>صبر کن سرباز!</b>\n\n⏱ برای ادا احترام بعدی باید <b>${rem} ثانیه</b> دیگر منتظر بمانی! ⏳`,
                    reply_to_message_id: replyMsgId,
                    parse_mode: 'HTML'
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
                total_doroods: (user.total_doroods || 0) + 1
            })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🫡 <b>درود بر پیشوا!</b> 👑\n\n` +
                `💎 <b>پاداش وفاداری:</b> <b>+${reward}</b> مارک ${MARK_ANIM}\n` +
                `💰 <b>موجودی کل:</b> <b>${user.marks + reward}</b> مارک ${MARK_ANIM}`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 3. دریافت آمار
    if (text === 'آمار' || text === 'امار' || text === 'آمارش' || text === 'امارش' || text.startsWith('آمار @') || text.startsWith('امار @')) {
        let targetUser = user;

        if (msg.reply_to_message) {
            targetUser = await getOrCreateUser(msg.reply_to_message.from);
        } else if (text.includes('@')) {
            const parts = text.split('@');
            if (parts[1]) {
                const found = await getUserByUsername(parts[1].trim());
                if (found) targetUser = found;
                else return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>کاربر مورد نظر در مقر پیدا نشد!</b> 🔎', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
            }
        }

        const inv = await dbFetch(`user_inventory?user_id=eq.${targetUser.user_id}`);
        let power = 0, health = 0;
        inv.forEach(i => {
            if (WEAPONS[i.item_name]) power += WEAPONS[i.item_name].damage * i.quantity;
            if (ARMORS[i.item_name]) health += ARMORS[i.item_name].health * i.quantity;
        });

        const statsText = `📜 ✨ <b>شناسنامه و آمار نظامی:</b> ✨ 📜\n` +
            `✨ ────────────────── ✨\n\n` +
            `👤 <b>نام رزمنده:</b> ${targetUser.first_name}\n` +
            `🎖 <b>درجه نظامی:</b> ${getTitle(targetUser.level)} (سطح ${targetUser.level})\n` +
            `💎 <b>موجودی جیب:</b> <b>${targetUser.marks}</b> مارک ${MARK_ANIM}\n` +
            `🏛 <b>سپرده رایشس بانک:</b> <b>${targetUser.bank_balance}</b> مارک ${MARK_ANIM}\n` +
            `🗡 <b>قدرت تهاجمی:</b> <b>${power}</b> HP 💣\n` +
            `🛡 <b>قدرت دفاعی (زره):</b> <b>${health}</b> HP 🛡\n` +
            `🦅 <b>سطح تفنگ شکاری:</b> <b>${targetUser.hunting_rifle_level || 0}</b> 🎯\n` +
            `🫡 <b>تعداد ادای احترام:</b> <b>${targetUser.total_doroods || 0}</b> بار\n` +
            `⚠️ <b>سابقه جریمه:</b> <b>${targetUser.total_punishments || 0}</b> بار 🚨\n` +
            `⚔️ <b>تعداد نبردها:</b> <b>${targetUser.total_attacks || 0}</b> جنگ 💥`;

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: statsText, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
    }

    // 4. انتقال توکن
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
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚫 <b>فرمت اشتباه!</b>\nمثال: <code>انتقال 500</code> رو پیام طرف یا <code>انتقال 500 @username</code> ⚡️', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (user.user_id === targetUser.user_id) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>نمی‌توانی به خودت پول منتقل کنی!</b> 🤡', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (user.marks < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: `💸 <b>موجودی ناکافی!</b> این مقدار مارک ${MARK_ANIM} در جیب نداری! ❌`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        const keyboard = {
            inline_keyboard: [[
                { text: '💎 تایید و واریز 🚀', callback_data: `confirm_transfer:${targetUser.user_id}:${amount}` },
                { text: '🔥 انصراف ✖️', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚠️ 💸 <b>تاییدیه انتقال وجه نظامی:</b> 💸\n\n` +
                `آیا از انتقال <b>${amount}</b> مارک ${MARK_ANIM} به <b>${targetUser.first_name}</b> اطمینان دارید؟ 🤔`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 5. واریز پول به رایشس بانک
    if (text.startsWith('واریز به بانک')) {
        const amount = parseInt(text.replace('واریز به بانک', '').trim());
        if (isNaN(amount) || amount <= 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚫 <b>فرمت اشتباه!</b>\nمثال: <code>واریز به بانک 1000</code> 🏦', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (user.marks < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '💸 <b>موجودی کیف پول شما کافی نیست!</b>', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
            text: `🏛 🚀 <b>سپرده‌گذاری در رایشس بانک با موفقیت انجام شد!</b> 🚀\n\n` +
                `💵 <b>مبلغ واریزی:</b> <b>+${amount}</b> مارک ${MARK_ANIM}\n` +
                `🏛 <b>سپرده جدید بانک:</b> <b>${user.bank_balance + amount}</b> مارک ${MARK_ANIM}\n` +
                `💰 <b>کیف پول باقی‌مانده:</b> <b>${user.marks - amount}</b> مارک ${MARK_ANIM}`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 6. بازار سیاه
    if (text === 'بازار سیاه') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '⚔️ اسلحه خانه سنگین 💣', callback_data: 'bm_weapons' }, { text: '🛡 تجهیزات زرهی و دفاعی 🥷', callback_data: 'bm_armors' }],
                [{ text: '🦅 ارتقای تفنگ شکاری 🎯', callback_data: 'bm_rifle' }]
            ]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `💀 ⚡️ <b>به بازار سیاه زیرزمینی کاپو خوش آمدید!</b> ⚡️ 💀\n\n` +
                `🔥 <i>اینجا قوانین قانون‌مداران ارزشی ندارد؛ فقط مارک‌های ${MARK_ANIM} شما حرف اول را می‌زند!</i>\n` +
                `چه تجهیزاتی لازم داری رزمنده؟ 🧨`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 7. تفنگ شکاری
    if (text === 'تفنگ شکاری') {
        const nextLvl = (user.hunting_rifle_level || 0) + 1;
        if (nextLvl > 6) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🦅 <b>تفنگ شکاری شما در حداکثر سطح ممکن (سطح ۶ - افسانه‌ای) قرار دارد!</b> 👑', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
            text: `🦅 🎯 <b>ارتقای سلاح شکاری:</b>\n\n` +
                `🔹 سطح کنونی: <b>${user.hunting_rifle_level || 0}</b>\n` +
                `🔸 هزینه ارتقا به سطح <b>${nextLvl}</b>: <b>${cost}</b> مارک ${MARK_ANIM}\n\n` +
                `آیا تصمیم به ارتقا داری سرباز؟ ⚡️`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 8. دزدی از بانک
    if (text === 'دزدی از بانک') {
        if (user.last_bank_heist) {
            const diffMin = (new Date() - new Date(user.last_bank_heist)) / (1000 * 60);
            if (diffMin < 60) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🚨 <b>آژیرهای خطر به صدا درآمده‌اند!</b>\nپلیس‌ها منطقه را زیر نظر دارند. باید <b>${Math.ceil(60 - diffMin)} دقیقه</b> دیگر برای سرقت بعدی صبر کنی! 🕵️‍♂️`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
            text: `🏛 🚨 <b>اتاق عملیات: نقشه سرقت مسلحانه از بانک مرکزی</b> 🚨\n\n` +
                `🗡 قدرت تخریب سلاح‌ها: <b>${power} HP</b> 💣\n` +
                `🛡 میزان جلیقه و استقامت: <b>${health} HP</b> 🛡\n\n` +
                `⚠️ آیا از نفوذ به خزانه محافظت‌شده مطمئن هستید؟ 🔥`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 9. دزدی از سرباز
    if (text === 'دزدی از سرباز') {
        if (user.last_soldier_attack) {
            const diffMin = (new Date() - new Date(user.last_soldier_attack)) / (1000 * 60);
            if (diffMin < 10) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🚨 <b>ردیابی شده‌ای!</b> برای حمله به سربازان بعدی <b>${Math.ceil(10 - diffMin)} دقیقه</b> کمین کن! 🥷`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
            text: `⚔️ 🩸 <b>عملیات درگیری خیابانی:</b> 🩸 ⚔️\n\n` +
                `آیا می‌خواهی به اولین سرباز شناسایی‌شده در منطقه کمین بزنی و غارتش کنی؟ 🔥`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 10. بانک شخصی و رایشس بانک
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
            text: `🏛 💎 <b>مدیریت سرمایه و رایشس بانک</b> 💎 🏛\n` +
                `✨ ────────────────── ✨\n\n` +
                `💰 موجودی در جیب: <b>${user.marks}</b> مارک ${MARK_ANIM}\n` +
                `🏛 موجودی در رایشس بانک: <b>${user.bank_balance}</b> مارک ${MARK_ANIM}\n` +
                `👑 سطح فعلی رایشس بانک: <b>سطح ${user.reichsbank_level}</b>⚡️\n\n` +
                `💡 <i>برای واریز مبالغ خاص می‌توانید دستور <code>واریز به بانک [مقدار]</code> را بفرستید.</i>`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // 11. شکار کردن
    if (text === 'شکار') {
        if (!user.hunting_rifle_level || user.hunting_rifle_level === 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>برای شکار ابتدا باید تفنگ شکاری تهیه کنی!</b> (ارسال کلمه: <code>تفنگ شکاری</code>) 🎯', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
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
            text: `🦅 🎯 <b>شکار موفقیت‌آمیز بود!</b> 🎯\n\n` +
                `شما یک <b>«${hunted}»</b> نگونسار کردید! 🪵\n` +
                `📦 صید به قفس منتقل شد.`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 12. قفس شکار
    if (text === 'قفس') {
        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_type=eq.trophy`);
        let totalValue = 0;
        let listText = "🪵 🦅 <b>محتویات قفس شکار شما:</b> 🦅 🪵\n✨ ────────────────── ✨\n\n";

        inv.forEach(i => {
            const val = (TROPHIES[i.item_name] || 0) * i.quantity;
            totalValue += val;
            listText += `🔹 <b>${i.item_name}</b>: ${i.quantity} عدد (ارزش هرکدام: ${TROPHIES[i.item_name]} | کل: ${val} ${MARK_ANIM})\n`;
        });

        listText += `\n💵 <b>ارزش مجموع صیدها:</b> <b>${totalValue}</b> مارک ${MARK_ANIM}`;

        const keyboard = {
            inline_keyboard: [[{ text: '💎 چگونگی فروش صیدها 🚀', callback_data: 'sell_trophies_prompt' }]]
        };

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: listText, reply_to_message_id: replyMsgId, reply_markup: keyboard, parse_mode: 'HTML' });
    }

    // 13. دستور فروش دستوری
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
                        text: `🎉 💵 <b>معامله سودآور انجام شد!</b> 💵 🎉\n\n` +
                            `تعداد <b>${count}</b> عدد <b>${trophyName}</b> فروخته شد.\n` +
                            `💎 سود به دست آمده: <b>+${earned}</b> مارک ${MARK_ANIM} 🚀`,
                        reply_to_message_id: replyMsgId,
                        parse_mode: 'HTML'
                    });
                } else {
                    return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>این تعداد از این نوع شکار در قفس نداری!</b> 🚫', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
                }
            }
        }
    }
}

// تابع راهنمای کامل
function sendHelpMessage(token, chatId, replyMsgId, isPv = false) {
    const helpText = `⚔️ 🔥 <b>پایگاه اطلاعاتی پیشوا بات</b> 🔥 ⚔️\n` +
        `✨ ────────────────── ✨\n\n` +
        `🚨 <b>مهم: بازی فقط درون گروه فعال می‌باشد!</b>\n\n` +
        `🫡 <b>درود</b> ➔ دریافت پاداش روزانه (دارای زمان انتظار)\n` +
        `📊 <b>آمار / آمارش</b> ➔ مشاهده شناسنامه رزمی و مالی شما\n` +
        `💀 <b>بازار سیاه</b> ➔ خرید تسلیحات سنگین و زره‌های نظامی\n` +
        `🏛 <b>بانک</b> ➔ مدیریت سرمایه و سپرده‌گذاری در رایشس بانک\n` +
        `💳 <b>واریز به بانک [مقدار]</b> ➔ انتقال پول از جیب به رایشس بانک\n` +
        `🏦 <b>دزدی از بانک</b> ➔ سرقت مسلحانه از خزانه (پرخطر!)\n` +
        `🗡 <b>دزدی از سرباز</b> ➔ درگیری خیابانی و غارت سایر سربازان\n` +
        `💸 <b>انتقال [مقدار]</b> ➔ انتقال مستقیم مارک ${MARK_ANIM} به سایر بازیکنان\n` +
        `🦅 <b>تفنگ شکاری</b> ➔ ارتقای سلاح شکاری برای صید موجودات بهتر\n` +
        `🎯 <b>شکار / قفس</b> ➔ شکار موجودات و فروش صیدها در بازار\n\n` +
        `🚨 <b>هشدار:</b> کلمات احوالپرسی غیرنظامی جریمه سنگین دارند! 🧨`;
    
    const payload = { chat_id: chatId, text: helpText, parse_mode: 'HTML' };
    if (replyMsgId) payload.reply_to_message_id = replyMsgId;
    if (isPv) payload.reply_markup = getPvReplyKeyboard();

    return sendTg(token, 'sendMessage', payload);
}

// ------------------- CALLBACK QUERY HANDLER -------------------
async function handleCallback(token, cb) {
    const user = await getOrCreateUser(cb.from);
    const chatId = cb.message.chat.id;
    const data = cb.data;

    if (data === 'cancel') {
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '✖️ <b>عملیات با دستور رزمنده لغو شد.</b>', parse_mode: 'HTML' });
    }

    if (data === 'help_menu') {
        return sendHelpMessage(token, chatId, cb.message.message_id, cb.message.chat.type === 'private');
    }

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
            text: `🏛 🚀 <b>واریز انجام شد!</b>\nمبلغ <b>${amount}</b> مارک ${MARK_ANIM} به رایشس بانک منتقل شد.\n🏦 موجودی بانک: <b>${(user.bank_balance || 0) + amount}</b> مارک ${MARK_ANIM}`,
            parse_mode: 'HTML'
        });
    }

    if (data.startsWith('confirm_transfer:')) {
        const [, targetId, amountStr] = data.split(':');
        const amount = parseInt(amountStr);
        const target = await dbFetch(`users?user_id=eq.${targetId}`);

        if (target.length === 0 || user.marks < amount) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ خطا! موجودی شما کافی نیست.', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: user.marks - amount }) });
        await dbFetch(`users?user_id=eq.${targetId}`, { method: 'PATCH', body: JSON.stringify({ marks: target[0].marks + amount }) });

        const senderNotice = `💸 <b>گزارش انتقال وجه:</b>\nشما مقدار <b>${amount}</b> مارک ${MARK_ANIM} به حساب <b>${target[0].first_name}</b> واریز کردید.`;
        const receiverNotice = `💸 <b>واریز جدید:</b>\nمقدار <b>${amount}</b> مارک ${MARK_ANIM} از طرف <b>${user.first_name}</b> به حساب شما واریز شد! 🚀`;

        sendTg(token, 'sendMessage', { chat_id: user.user_id, text: senderNotice, parse_mode: 'HTML' });
        sendTg(token, 'sendMessage', { chat_id: target[0].user_id, text: receiverNotice, parse_mode: 'HTML' });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `✅ 🚀 <b>انتقال موفقیت‌آمیز!</b>\nمقدار <b>${amount}</b> مارک ${MARK_ANIM} با موفقیت به <b>${target[0].first_name}</b> منتقل گردید (اعلان در پیوی ارسال شد).`,
            parse_mode: 'HTML'
        });
    }

    if (data === 'bm_weapons') {
        let text = "⚔️ 💣 <b>تسلیحات نظامی بازار سیاه:</b> 💣 ⚔️\n\n";
        const buttons = [];
        Object.keys(WEAPONS).forEach(w => {
            text += `🔹 <b>${w}</b>: ${WEAPONS[w].price} مارک ${MARK_ANIM} | قدرت: ${WEAPONS[w].damage} HP 💥\n`;
            buttons.push([{ text: `خرید ${w} (${WEAPONS[w].price} مارک) 🗡`, callback_data: `buy_item:weapon:${w}` }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'HTML' });
    }

    if (data === 'bm_armors') {
        let text = "🛡 🥷 <b>تجهیزات دفاعی بازار سیاه:</b> 🥷 🛡\n\n";
        const buttons = [];
        Object.keys(ARMORS).forEach(a => {
            text += `🔹 <b>${a}</b>: ${ARMORS[a].price} مارک ${MARK_ANIM} | زره: +${ARMORS[a].health} HP 🛡\n`;
            buttons.push([{ text: `خرید ${a} (${ARMORS[a].price} مارک) 🥷`, callback_data: `buy_item:armor:${a}` }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'HTML' });
    }

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

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `🎉 ⚔️ تجهیزات <b>«${name}»</b> خریداری شد و به انبار تسلیحات اضافه گردید.`, parse_mode: 'HTML' });
    }

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

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `🎯 🚀 تفنگ شکاری شما با موفقیت به <b>سطح ${targetLvl}</b> ارتقا پیدا کرد.`, parse_mode: 'HTML' });
    }

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
                total_attacks: (user.total_attacks || 0) + 1
            })
        });

        const heistReport = `💥 💣 <b>گزارش سرقت مسلحانه از بانک!</b> 💣 💥\n\n` +
            `🏛 <b>خزانه:</b> ${bankVault} مارک ${MARK_ANIM}\n` +
            `📉 <b>خسارت تجهیزات:</b> ${lostVal} مارک ${MARK_ANIM}\n` +
            `💎 <b>غنیمت کسب‌شده:</b> <b>+${netProfit}</b> مارک ${MARK_ANIM} 🚀\n` +
            `💰 <b>موجودی جدید جیب:</b> <b>${user.marks + netProfit}</b> مارک ${MARK_ANIM}`;

        sendTg(token, 'sendMessage', { chat_id: user.user_id, text: heistReport, parse_mode: 'HTML' });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `💥 💣 <b>سرقت مسلحانه از بانک با موفقیت انجام شد!</b>\n\n` +
                `💎 غنیمت و پول نقد به دست آمده: <b>+${netProfit}</b> مارک ${MARK_ANIM} 🚀\n` +
                `📩 <i>جزئیات کامل سرقت به پیوی شخصی شما ارسال گردید.</i>`,
            parse_mode: 'HTML'
        });
    }

    if (data === 'confirm_soldier_attack') {
        const opponents = await dbFetch(`users?user_id=neq.${user.user_id}&limit=10`);
        if (opponents.length === 0) {
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ هیچ سربازی در محدوده عملیاتی جهت درگیری یافت نشد!', parse_mode: 'HTML' });
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
                total_attacks: (user.total_attacks || 0) + 1
            })
        });

        const attackerNotice = `🚨 ⚔️ <b>گزارش درگیری خیابانی!</b> ⚔️ 🚨\n\n` +
            `🎯 <b>قربانی:</b> ${target.first_name}\n` +
            `💎 <b>غنیمت به سرقت رفته:</b> <b>+${gain}</b> مارک ${MARK_ANIM}\n` +
            `وضعیت: ${isWinner ? 'پیروزی کامل' : 'عقب‌نشینی همراه با غنیمت'}`;

        const victimNotice = `🚨 <b>هشدار سرقت!</b> 🚨\n\n` +
            `🥷 <b>سرباز ${user.first_name}</b> به شما کمین زد و مقدار <b>${gain}</b> مارک ${MARK_ANIM} غنیمت برداشت!`;

        sendTg(token, 'sendMessage', { chat_id: user.user_id, text: attackerNotice, parse_mode: 'HTML' });
        sendTg(token, 'sendMessage', { chat_id: target.user_id, text: victimNotice, parse_mode: 'HTML' });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `⚔️ 🩸 <b>نتیجه نبرد خیابانی با ${target.first_name}:</b>\n\n` +
                `${isWinner ? '🎉 👑 پیروز شدید و منطقه را فتح کردید!' : '💔 🩸 عقب‌نشینی کردید اما غنیمت برداشتید!'}\n` +
                `💎 غنیمت جنگی شما: <b>+${gain}</b> مارک ${MARK_ANIM} 🚀\n` +
                `📩 <i>گزارش کامل به پیوی شما ارسال گردید.</i>`,
            parse_mode: 'HTML'
        });
    }

    if (data === 'reichsbank_menu') {
        const now = new Date();
        const last = new Date(user.last_reichsbank_claim || now);
        const hours = Math.floor((now - last) / (1000 * 60 * 60));

        let baseRate = 0.1;
        if (user.bank_balance > 10000) baseRate = 0.4;
        else if (user.bank_balance > 6000) baseRate = 0.35;
        else if (user.bank_balance > 2000) baseRate = 0.3;

        const multipliers = { 0: 1, 1: 1.7, 2: 2.3, 3: 2.8, 4: 3.5, 5: 4, 6: 5 };
        const rate = baseRate * multipliers[user.reichsbank_level || 0];
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
            text: `🏛 👑 <b>به خزانه اصلی رایشس بانک خوش آمدید!</b> 👑 🏛\n\n` +
                `🏦 کل سرمایه موجود در بانک: <b>${user.bank_balance}</b> مارک ${MARK_ANIM}\n` +
                `📈 نرخ سود ساعتی شما: <b>${rate}%</b>\n` +
                `💎 سود محاسبه شده (${hours} ساعت): <b>+${profit}</b> مارک ${MARK_ANIM} 🚀\n\n` +
                `✅ <i>مبلغ سود مستقیم به جیب شما واریز شد.</i>`,
            parse_mode: 'HTML'
        });
    }

    if (data === 'upgrade_reichsbank') {
        if (user.bank_balance < 6000) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ برای ارتقای رایشس بانک باید حداقل ۶۰۰۰ مارک در سپرده بانک داشته باشید!', show_alert: true });
        }

        const costs = { 0: 2500, 1: 3200, 2: 4000, 3: 5200, 4: 6000, 5: 13000 };
        const nextLvl = (user.reichsbank_level || 0) + 1;

        if (nextLvl > 6) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '👑 رایشس بانک شما در حداکثر سطح قرار دارد!', show_alert: true });
        }

        const cost = costs[user.reichsbank_level || 0];
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
            text: `🏛 👑 <b>رایشس بانک با موفقیت ارتقا یافت!</b> 👑\n\n` +
                `🌟 سطح جدید: <b>سطح ${nextLvl}</b>\n` +
                `🚀 ضریب سود پرداختی شما به شدت افزایش یافت!`,
            parse_mode: 'HTML'
        });
    }

    if (data === 'sell_trophies_prompt') {
        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `💎 💵 <b>راهنمای فروش صیدهای قفس:</b> 💵 💎\n\n` +
                `برای فروش شکارها عبارت زیر را ارسال نمایید:\n\n` +
                ` <code>فروش [تعداد] [نام شکار]</code> \n\n` +
                `📌 <b>مثال:</b>\n` +
                ` <code>فروش 6 دورگه</code>`,
            parse_mode: 'HTML'
        });
    }
}
