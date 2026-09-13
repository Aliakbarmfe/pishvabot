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
        level: 1
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
    if (level <= 3) return "آشغال سرباز 🎖";
    if (level <= 5) return "جناب سرباز 🎖";
    return "سرهنگ ارشد 🎖";
}

function getToneGreeting(level, name) {
    if (level <= 3) return `هی آشغال (${name})! بنال ببینم چی میخوای! 🗿🔥`;
    if (level <= 5) return `سرباز (${name})، گزارش بده! وضعیت رو اعلام کن. 🎖💥`;
    return `درود و ادای احترام خدمت جناب سرهنگ (${name})! گوش به فرمانیم فرمانده! 🫡⚔️`;
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

        const replyText = `${getTitle(user.level)}\n\n⚠️ **تخلف نظامی!** استفاده از کلمات سوسول‌بازی (سلام/های/هلو) قدغن است!\n💥 **جریمه:** ${fine} مارک از حسابت کسر شد.\n🔥 جدی باش سرباز!`;
        return sendTg(token, 'sendMessage', { chat_id: chatId, text: replyText, reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
    }

    // 2. دستور درود (جایزه)
    if (text === 'درود') {
        const cooldowns = { 1: 30, 2: 30, 3: 60, 4: 150, 5: 120, 6: 120 };
        const cdSec = cooldowns[user.level];

        if (user.last_dorood) {
            const diffSec = (new Date() - new Date(user.last_dorood)) / 1000;
            if (diffSec < cdSec) {
                const rem = Math.ceil(cdSec - diffSec);
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: `🛑 **صبر کن سرباز!** تا درود بعدی باید **${rem} ثانیه** دیگه صبر کنی! 🗿`,
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
            text: `🫡 **درود بر پیشوا!**\n🎖 پاداش دریافت شد: **+${reward} مارک**\n💰 کل دارایی: **${user.marks + reward} مارک**`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'Markdown'
        });
    }

    // 3. راهنما
    if (text === 'راهنما') {
        const helpText = `⚔️ **راهنمای پایگاه نظامی پیشوا بات** ⚔️\n\n` +
            `🎖 **درود:** دریافت مارک رایگان (همراه با تایمر cooldown)\n` +
            `📊 **آمار / آمارش:** مشاهده اطلاعات خود یا کاربر ریپلای شده\n` +
            `🛒 **بازار سیاه:** خرید سلاح و جلیقه‌های زرهی\n` +
            `🏦 **بانک / دزدی از بانک:** مدیریت حساب یا عملیات سرقت مسلحانه\n` +
            `⚔️ **دزدی از سرباز:** مبارزه و غارت سربازان دیگر\n` +
            `💸 **انتقال [مقدار]:** انتقال مارک به سایر افراد (روی پیام ریپلای کنید)\n` +
            `🦅 **شکار / قفس:** شکار با تفنگ شکاری و فروش در قفس\n` +
            `⚠️ **هشدار:** کلمات سوسول‌بازی (سلام/های) جریمه مارک دارند!`;
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
                else return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ کاربر مورد نظر پیدا نشد!', reply_to_message_id: replyMsgId });
            }
        }

        const inv = await dbFetch(`user_inventory?user_id=eq.${targetUser.user_id}`);
        let power = 0, health = 0;
        inv.forEach(i => {
            if (WEAPONS[i.item_name]) power += WEAPONS[i.item_name].damage * i.quantity;
            if (ARMORS[i.item_name]) health += ARMORS[i.item_name].health * i.quantity;
        });

        const statsText = `📊 **شناسنامه نظامی سرباز:**\n\n` +
            `👤 **نام:** ${targetUser.first_name}\n` +
            `🎖 **درجه:** ${getTitle(targetUser.level)} (سطح ${targetUser.level})\n` +
            `💰 **موجودی (مارک):** ${targetUser.marks}\n` +
            `🏦 **موجودی بانک:** ${targetUser.bank_balance}\n` +
            `⚔️ **قدرت حمله:** ${power} HP\n` +
            `🛡 **قدرت دفاع (خون):** ${health} HP\n` +
            `🦅 **سطح تفنگ شکاری:** ${targetUser.hunting_rifle_level}\n` +
            `🫡 **تعداد درودها:** ${targetUser.total_doroods}\n` +
            `💥 **تعداد جریمه‌ها:** ${targetUser.total_punishments}\n` +
            `⚔️ **تعداد نبردها:** ${targetUser.total_attacks}`;

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
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **فرمت اشتباه!** نمونه: `انتقال 500` روی پیام کاربر یا `انتقال 500 @ali`', reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
        }

        if (user.user_id === targetUser.user_id) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ نمیتونی به خودت مارک منتقل کنی!', reply_to_message_id: replyMsgId });
        }

        if (user.marks < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ **موجودی ناکافی!** این‌قدر مارک نداری!', reply_to_message_id: replyMsgId });
        }

        // تاییدیه قبل از انجام
        const keyboard = {
            inline_keyboard: [[
                { text: '✅ تایید و ارسال', callback_data: `confirm_transfer:${targetUser.user_id}:${amount}` },
                { text: '❌ لغو', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚠️ **تاییدیه نظامی انتقال:**\nآیا مطمئن هستید که می‌خواهید **${amount} مارک** به کاربر **${targetUser.first_name}** منتقل کنید؟`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 6. بازار سیاه
    if (text === 'بازار سیاه') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔪 بخش سلاح‌ها', callback_data: 'bm_weapons' }, { text: '🛡 بخش لباس و زره', callback_data: 'bm_armors' }],
                [{ text: '🦅 تفنگ شکاری', callback_data: 'bm_rifle' }]
            ]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `💀 **به بازار سیاه کاپو خوش آمدید!**\nاینجا قوانین دولتی معنا ندارد. فقط مارک‌های شما ارزش دارد. چه چیزی نیاز داری سرباز؟`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 7. تفنگ شکاری
    if (text === 'تفنگ شکاری') {
        const nextLvl = user.hunting_rifle_level + 1;
        if (nextLvl > 6) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🦅 تفنگ شکاری شما در حداکثر سطح (سطح ۶) قرار دارد!', reply_to_message_id: replyMsgId });
        }
        const cost = RIFLE_LEVELS[nextLvl];
        const keyboard = {
            inline_keyboard: [[
                { text: `✅ ارتقا به سطح ${nextLvl} (${cost} مارک)`, callback_data: `buy_rifle:${nextLvl}:${cost}` },
                { text: '❌ لغو', callback_data: 'cancel' }
            ]]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🦅 **ارتقای تفنگ شکاری:**\nسطح فعلی: **${user.hunting_rifle_level}**\nهزینه ارتقا به سطح **${nextLvl}**: **${cost} مارک**\nآیا تایید می‌کنید؟`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 8. دزدی از بانک
    if (text === 'دزدی از بانک') {
        if (user.last_bank_heist) {
            const diffMin = (new Date() - new Date(user.last_bank_heist)) / (1000 * 60);
            if (diffMin < 60) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🛑 **پلیس‌ها مشکوک شده‌اند!** باید **${Math.ceil(60 - diffMin)} دقیقه** دیگر برای سرقت بعدی صبر کنی!`, reply_to_message_id: replyMsgId });
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
                { text: '💥 حمله به بانک!', callback_data: 'confirm_bank_heist' },
                { text: '❌ عقب‌نشینی', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏦 **بررسی عملیات سرقت از بانک:**\n\n⚔️ قدرت ضربه سلاح‌ها: **${power} HP**\n🛡 میزان خون و جلیقه: **${health} HP**\n\n⚠️ آیا از حمله مسلحانه به خزانه بانک مطمئن هستید؟`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 9. دزدی از سرباز
    if (text === 'دزدی از سرباز') {
        if (user.last_soldier_attack) {
            const diffMin = (new Date() - new Date(user.last_soldier_attack)) / (1000 * 60);
            if (diffMin < 10) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🛑 **شناسایی شده‌ای!** برای حمله بعدی به سربازان **${Math.ceil(10 - diffMin)} دقیقه** صبر کن!`, reply_to_message_id: replyMsgId });
            }
        }

        const keyboard = {
            inline_keyboard: [[
                { text: '⚔️ جستجو و حمله به سرباز', callback_data: 'confirm_soldier_attack' },
                { text: '❌ انصراف', callback_data: 'cancel' }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚔️ **عملیات درگیری شهری:**\nآیا می‌خواهید به نزدیک‌ترین سرباز شناسایی‌شده در منطقه حمله کنید؟`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 10. بانک شخصی و رایشس بانک
    if (text === 'بانک') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '💎 سود گرفتن از رایشس بانک', callback_data: 'reichsbank_menu' }],
                [{ text: '📈 ارتقای رایشس بانک', callback_data: 'upgrade_reichsbank' }]
            ]
        };
        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 **بانک مرکزی و شخصی:**\n\n💰 موجودی کیف پول: **${user.marks} مارک**\n🏦 موجودی بانک: **${user.bank_balance} مارک**\n🎖 سطح رایشس بانک: **${user.reichsbank_level}**`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard
        });
    }

    // 11. شکار کردن
    if (text === 'شکار') {
        if (user.hunting_rifle_level === 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ برای شکار ابتدا باید تفنگ شکاری بخرید! (ارسال کلمه: `تفنگ شکاری`)', reply_to_message_id: replyMsgId, parse_mode: 'Markdown' });
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

        // اضافه به قفس
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
            text: `🦅 **شکار موفقیت‌آمیز!**\nشما موفق شدید یک **«${hunted}»** شکار کنید. صید شما به قفس منتقل شد.`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'Markdown'
        });
    }

    // 12. قفس شکار
    if (text === 'قفس') {
        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_type=eq.trophy`);
        let totalValue = 0;
        let listText = "🪵 **محتویات قفس شکار شما:**\n\n";

        inv.forEach(i => {
            const val = (TROPHIES[i.item_name] || 0) * i.quantity;
            totalValue += val;
            listText += `• **${i.item_name}**: ${i.quantity} عدد (ارزش هر کدام: ${TROPHIES[i.item_name]} | کل: ${val})\n`;
        });

        listText += `\n💵 **ارزش کل صیدها:** **${totalValue} مارک**`;

        const keyboard = {
            inline_keyboard: [[{ text: '💰 فروش شکار', callback_data: 'sell_trophies_prompt' }]]
        };

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: listText, reply_to_message_id: replyMsgId, reply_markup: keyboard, parse_mode: 'Markdown' });
    }

    // 13. دستور فروش دستوری (مثلاً: فروش 6 دورگه)
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
                        text: `✅ **فروش با موفقیت انجام شد!**\nتعداد **${count}** عدد **${trophyName}** فروخته شد.\n💰 دریافت شد: **+${earned} مارک**`,
                        reply_to_message_id: replyMsgId,
                        parse_mode: 'Markdown'
                    });
                } else {
                    return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ این تعداد از این نوع شکار در قفس ندارید!', reply_to_message_id: replyMsgId });
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
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ **عملیات توسط کاربر لغو شد.**' });
    }

    // تایید انتقال مارک
    if (data.startsWith('confirm_transfer:')) {
        const [, targetId, amountStr] = data.split(':');
        const amount = parseInt(amountStr);
        const target = await dbFetch(`users?user_id=eq.${targetId}`);

        if (target.length === 0 || user.marks < amount) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'خطا در انجام معامله!', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: user.marks - amount }) });
        await dbFetch(`users?user_id=eq.${targetId}`, { method: 'PATCH', body: JSON.stringify({ marks: target[0].marks + amount }) });

        sendTg(token, 'sendMessage', {
            chat_id: targetId,
            text: `📩 **اعلان واریزی:**\nکاربر **${user.first_name}** مقدار **${amount} مارک** به حساب شما واریز کرد.`
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `✅ **انتقال موفقیت‌آمیز!**\nمقدار **${amount} مارک** با موفقیت به **${target[0].first_name}** منتقل شد.`
        });
    }

    // بازار سیاه - لیست سلاح‌ها
    if (data === 'bm_weapons') {
        let text = "🔪 **لیست سلاح‌های بازار سیاه:**\n\n";
        const buttons = [];
        Object.keys(WEAPONS).forEach(w => {
            text += `• **${w}**: ${WEAPONS[w].price} مارک (${WEAPONS[w].damage} HP)\n`;
            buttons.push([{ text: `خرید ${w} (${WEAPONS[w].price} مارک)`, callback_data: `buy_item:weapon:${w}` }]);
        });
        buttons.push([{ text: 'بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }

    // بازار سیاه - لیست جلیقه‌ها
    if (data === 'bm_armors') {
        let text = "🛡 **لیست لباس و زره‌های بازار سیاه:**\n\n";
        const buttons = [];
        Object.keys(ARMORS).forEach(a => {
            text += `• **${a}**: ${ARMORS[a].price} مارک (+${ARMORS[a].health} HP)\n`;
            buttons.push([{ text: `خرید ${a} (${ARMORS[a].price} مارک)`, callback_data: `buy_item:armor:${a}` }]);
        });
        buttons.push([{ text: 'بازگشت', callback_data: 'cancel' }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'Markdown' });
    }

    // خرید آیتم سلاح / زره
    if (data.startsWith('buy_item:')) {
        const [, type, name] = data.split(':');
        const item = type === 'weapon' ? WEAPONS[name] : ARMORS[name];

        if (user.marks < item.price) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ مارک کافی نداری سرباز!', show_alert: true });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: user.marks - item.price }) });

        const inv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${name}`);
        if (inv.length > 0) {
            await dbFetch(`user_inventory?id=eq.${inv[0].id}`, { method: 'PATCH', body: JSON.stringify({ quantity: inv[0].quantity + 1 }) });
        } else {
            await dbFetch(`user_inventory`, { method: 'POST', body: JSON.stringify({ user_id: user.user_id, item_type: type, item_name: name, quantity: 1 }) });
        }

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `✅ آیتم **«${name}»** با موفقیت خریداری و به تجهیزات شما اضافه شد.` });
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

        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `✅ تفنگ شکاری شما با موفقیت به **سطح ${targetLvl}** ارتقا یافت.` });
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
            text: `💥 **نتیجه حمله به بانک (خزانه: ${bankVault} مارک):**\n\n📉 تجهیزات آسیب‌دیده: **${lostVal} مارک**\n💵 غنیمت خالص به‌دست‌آمده: **+${netProfit} مارک**\n💰 کل دارایی جدید: **${user.marks + netProfit} مارک**`
        });
    }

    // انجام حمله به سرباز
    if (data === 'confirm_soldier_attack') {
        const opponents = await dbFetch(`users?user_id=neq.${user.user_id}&limit=10`);
        if (opponents.length === 0) {
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ هیچ سربازی در منطقه جهت درگیری یافت نشد!' });
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

        // ارسال پیام به قربانی
        sendTg(token, 'sendMessage', {
            chat_id: target.user_id,
            text: `⚠️ **اعلا‌ن جنگ!**\nسرباز **${user.first_name}** به شما حمله کرد!\nنتیجه درگیری: شما فرار کردید و خسارت جزئی دیدید.`
        });

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `⚔️ **نتیجه نبرد با ${target.first_name}:**\n${isWinner ? '🎉 پیروز شدید!' : '💔 شکست خوردید اما غنیمت جمع کردید!'}\n💰 سود شما از درگیری: **+${gain} مارک**`
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
            text: `🏛 **به رایشس بانک خوش آمدید!**\n\nسرمایه شما در رایشس بانک: **${user.bank_balance} مارک**\nسود ساعتی فعال: **${rate}%**\nسود تعلق گرفته (${hours} ساعت): **+${profit} مارک**\n\nمبلغ سود به کیف پول اصلی شما اضافه شد.`
        });
    }

    // ارتقای سطح رایشس بانک
    if (data === 'upgrade_reichsbank') {
        if (user.bank_balance < 6000) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ برای ارتقای رایشس بانک باید حداقل ۶۰۰۰ مارک در بانک داشته باشید!', show_alert: true });
        }

        const costs = { 0: 2500, 1: 3200, 2: 4000, 3: 5200, 4: 6000, 5: 13000 };
        const nextLvl = user.reichsbank_level + 1;

        if (nextLvl > 6) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'رایشس بانک شما در حداکثر سطح قرار دارد!', show_alert: true });
        }

        const cost = costs[user.reichsbank_level];
        if (user.marks < cost) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: `❌ مارک کافی در کیف پول شخصی نداری! هزینه: ${cost} مارک`, show_alert: true });
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
            text: `✅ **رایشس بانک ارتقا یافت!**\nسطح جدید: **سطح ${nextLvl}**\nضریب سود ساعتی جدید شما فعال شد.`
        });
    }

    // فروش شکار از طریق راهنما
    if (data === 'sell_trophies_prompt') {
        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `💰 **راهنمای فروش شکار:**\nبرای فروش صیدهای خود کلمه زیر را ارسال کنید:\n\n` +
                `` + `فروش [تعداد] [نام شکار]` + `` + `\n\nمثال:\n` + `فروش 6 دورگه`
        });
    }
}
 
