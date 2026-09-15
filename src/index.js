/**
 * PishvaBot - Telegram Bot Engine on Cloudflare Workers & Supabase
 * Fixed Version with Custom Titles, Titles/Ranks logic, Permanent PV Keyboard & Private Notifications
 *
 * تغییرات نسخه قبلی:
 * 1) بات فقط در گروه‌های با حداقل ۱۰ عضو فعال است.
 * 2) دکمه «رمز سایت» به «رمز و نام کاربری سایت» تغییر کرد و امکان تغییر نام کاربری اضافه شد.
 * 3) هنگام ثبت‌نام، نام کاربری و رمز عبور رندوم به‌صورت پیش‌فرض ثبت می‌شود.
 * 4) امکان برداشت مارک از رایشس بانک به جیب شخصی اضافه شد.
 * 5) دکمه‌های شیشه‌ای فقط توسط همان کاربری که ربات به او پاسخ داده قابل استفاده هستند.
 *
 * تغییرات این نسخه:
 * 6) دکمه ورود به گروه رایش بزرگ روی پیام اخطار «کمتر از ۱۰ عضو».
 * 7) پیام خوش‌آمدگویی و منشن شدن اعضای جدید گروه.
 * 8) دستور «سایت» برای معرفی و لینک سایت.
 * 9) قابلیت دزدی از بقیه با منشن (@) و شرط‌بندی، همراه با تایید ۱۵ دقیقه‌ای طرف مقابل.
 * 10) یکتا بودن نام کاربری سایت (بدون حساسیت به بزرگی/کوچکی حروف) هنگام ثبت‌نام و تغییر نام کاربری.
 * 11) قابلیت خرید و ارتقای «شکارچی» شخصی (شکار خودکار ساعتی) برای سطح ۳ به بالا.
 * 12) دکمه‌های «گروه رایش بزرگ» و «کانال اطلاع‌رسانی» در راهنما.
 * 13) ارسال اعلان همگانی به همه پیوی‌ها / همه گروه‌ها با رمز عبور، به صورت دسته‌ای (۳۰ تایی هر ۵ ثانیه).
 * 14) ثبت آمار تعداد پیام هر گروه (هفتگی/ماهانه/کل) و نمایش فعال‌ترین گروه‌ها.
 */

const SUPABASE_URL = "https://ziodmekyeqqhggwjblrl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppb2RtZWt5ZXFxaGdnd2pibHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA2MTM5MiwiZXhwIjoyMTA0NjM3MzkyfQ.EcDkLO0H8x5hyXRI3X6P0vvu4ihIuQnoDOOPRxjP3pg";

// ایموجی متحرک مارک (فقط برای استفاده در متن پیام‌ها)
const MARK_ANIM = '<tg-emoji emoji-id="5897862946431701391">🪙</tg-emoji>';

// حداقل تعداد اعضای لازم برای فعال بودن بات در گروه
const MIN_GROUP_MEMBERS = 10;

// لینک گروه رایش بزرگ و کانال اطلاع‌رسانی
const GROUP_LINK = 'https://t.me/pishwa_group';
const CHANNEL_LINK = 'https://t.me/pishwa_channel';

// رمزهای عبور اعلان همگانی
const BROADCAST_PV_PASSWORD = '11111111';
const BROADCAST_GROUP_PASSWORD = '22222222';

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

// تولید نام کاربری رندوم انگلیسی برای سایت (حداقل ۵ کاراکتر)
function generateRandomUsername() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'user';
    for (let i = 0; i < 5; i++) {
        result += chars[getRandomInt(0, chars.length - 1)];
    }
    return result;
}

// تولید رمز عبور رندوم انگلیسی/عددی برای سایت
function generateRandomPassword() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// تولید نام کاربری رندوم که تضمین می‌کند از قبل در دیتابیس وجود ندارد (بدون حساسیت به بزرگی/کوچکی حروف)
async function generateUniqueUsername() {
    let username;
    let exists = true;
    let attempts = 0;
    while (exists && attempts < 15) {
        username = generateRandomUsername();
        const check = await dbFetch(`users?site_username=ilike.${username}`);
        exists = check.length > 0;
        attempts++;
    }
    return username;
}

async function getOrCreateUser(tgUser) {
    const data = await dbFetch(`users?user_id=eq.${tgUser.id}`);
    if (data.length > 0) {
        let currentMaxLevel = Math.max(data[0].level || 1, data[0].max_level || 1);
        let updates = {};

        if (tgUser.username && data[0].username !== tgUser.username) {
            updates.username = tgUser.username;
            updates.first_name = tgUser.first_name;
        }

        // تضمین این که لول هیچ‌وقت پایین نیاید
        if (data[0].level < currentMaxLevel || data[0].max_level !== currentMaxLevel) {
            updates.level = currentMaxLevel;
            updates.max_level = currentMaxLevel;
        }

        if (Object.keys(updates).length > 0) {
            const patched = await dbFetch(`users?user_id=eq.${tgUser.id}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            return patched[0];
        }
        return data[0];
    }

    // تولید نام کاربری یکتا و رمز عبور رندوم پیش‌فرض برای کاربر جدید
    const randomUsername = await generateUniqueUsername();
    const randomPassword = generateRandomPassword();

    const newUser = {
        user_id: tgUser.id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || "سرباز",
        marks: 0,
        total_marks_collected: 0,
        level: 1,
        max_level: 1,
        bank_balance: 0,
        reichsbank_level: 0,
        site_username: randomUsername,
        site_password: randomPassword,
        hunter_level: 0,
        started_pv: false
    };
    const created = await dbFetch(`users`, {
        method: 'POST',
        body: JSON.stringify(newUser)
    });
    return created[0];
}

async function getUserByUsername(username) {
    const cleanUsername = username.replace('@', '').trim();
    const data = await dbFetch(`users?username=eq.${cleanUsername}`);
    return data[0] || null;
}

// محاسبه رتبه کاربر از نظر مجموع مارک‌های جمع‌آوری شده
async function getUserRank(totalMarksCollected) {
    const higherUsers = await dbFetch(`users?total_marks_collected=gt.${totalMarksCollected}&select=user_id`, {
        headers: { "Prefer": "count=exact" }
    });
    // اگر در هدر ریسپانس تعداد بازنگردد، بر اساس طول آرایه محاسبه می‌شود
    const rank = (higherUsers && higherUsers.length ? higherUsers.length : 0) + 1;
    return rank;
}

// تابع برای افزایش مارک و ثبت در مجموع مارک‌های جمع‌شده + مدیریت لول
async function addMarksToUser(user, amount) {
    if (amount <= 0) return user;
    
    const newMarks = user.marks + amount;
    const newTotal = (user.total_marks_collected || user.marks || 0) + amount;
    const currentMaxLvl = Math.max(user.level || 1, user.max_level || 1);

    const patched = await dbFetch(`users?user_id=eq.${user.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
            marks: newMarks,
            total_marks_collected: newTotal,
            level: currentMaxLvl,
            max_level: currentMaxLvl
        })
    });
    return patched[0] || user;
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

// هزینه ارتقای لول‌های رایشس بانک (پرداخت از بانک شخصی)
const REICHSBANK_UPGRADE_COSTS = {
    1: 3000,
    2: 6000,
    3: 12000,
    4: 25000,
    5: 50000,
    6: 100000
};

// ضریب سود هر لول رایشس بانک
const REICHSBANK_MULTIPLIERS = {
    0: 1,
    1: 1.7,
    2: 2.3,
    3: 2.8,
    4: 3.5,
    5: 4,
    6: 5
};

// زمان‌های انتظار برای شکار به دقیقه
const HUNTING_COOLDOWNS = {
    1: 5,
    2: 10,
    3: 20,
    4: 30,
    5: 20,
    6: 10
};

const TROPHIES = {
    'دورگه': 200,
    'غیر اصیل': 400,
    'انگل': 800,
    'مفت خور': 1600,
    'آفت': 2000,
    'حشرات موذی': 4000
};

// هزینه خرید/ارتقای شکارچی شخصی در هر لول
const HUNTER_LEVELS = {
    1: 20000,
    2: 40000,
    3: 80000,
    4: 160000,
    5: 340000,
    6: 700000
};

// توان شکار خودکار شکارچی در هر لول (به صورت رندوم بین min و max در هر ساعت)
const HUNTER_CATCH_CONFIG = {
    1: { min: 4, max: 7, item: 'انگل' },
    2: { min: 14, max: 24, item: 'انگل' },
    3: { min: 24, max: 30, item: 'انگل' },
    4: { min: 30, max: 35, item: 'انگل' },
    5: { min: 35, max: 40, item: 'انگل' },
    6: { min: 10, max: 20, item: 'حشرات موذی' }
};

// حداقل درجه نظامی لازم برای خرید شکارچی
const HUNTER_MIN_RANK_LEVEL = 3;

// کول‌داون حمله با منشن (@) به دقیقه
const MENTION_ATTACK_COOLDOWN_MIN = 30;
// زمان معتبر بودن چالش دزدی با منشن به دقیقه
const DUEL_EXPIRY_MIN = 15;

// ------------------- HELPER FUNCTIONS -------------------
function getTitle(level) {
    if (level === 6) return "قائم مقام پیشوا";
    if (level === 5) return "مارشال ارشد رایش";
    if (level === 4) return "رهبر سراسری رایش";
    if (level === 3) return "جنرال اوبرست";
    if (level === 2) return "اوبر گفریتر";
    return "شوتزه";
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

// استخراج شناسه عددی بات از توکن (بخش قبل از ':')
function getBotId(token) {
    const idPart = (token || '').split(':')[0];
    return parseInt(idPart, 10);
}

// افزودن شناسه صاحب دکمه به callback_data (برای محدود کردن استفاده فقط به همان کاربر)
function withOwner(callbackData, ownerId) {
    return `${callbackData}|${ownerId}`;
}

// جدا کردن شناسه صاحب دکمه از callback_data
function parseCallbackData(raw) {
    const idx = raw.lastIndexOf('|');
    if (idx === -1) return { action: raw, ownerId: null };
    const ownerPart = raw.substring(idx + 1);
    const ownerId = parseInt(ownerPart, 10);
    if (isNaN(ownerId)) return { action: raw, ownerId: null };
    return { action: raw.substring(0, idx), ownerId };
}

// دریافت تعداد اعضای یک گروه از تلگرام
async function getChatMemberCount(token, chatId) {
    try {
        const res = await sendTg(token, 'getChatMemberCount', { chat_id: chatId });
        if (res && typeof res.result === 'number') return res.result;
        return 999; // در صورت نامشخص بودن، بات مسدود نمی‌شود
    } catch (e) {
        return 999; // در صورت بروز خطا در ارتباط با تلگرام، بات مسدود نمی‌شود
    }
}

// کیبورد دائمی مخصوص پیوی
function getPvReplyKeyboard() {
    return {
        keyboard: [
            [{ text: '🌐 ورود به سایت رایش بزرگ' }],
            [{ text: '🔑 رمز و نام کاربری سایت' }, { text: '📖 راهنما' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
}

// دکمه‌های شیشه‌ای گروه رایش بزرگ و کانال اطلاع‌رسانی (برای استفاده کنار راهنما و..)
function getCommunityLinksKeyboard() {
    return {
        inline_keyboard: [[
            { text: '🏛 گروه رایش بزرگ', url: GROUP_LINK },
            { text: '📢 کانال اطلاع‌رسانی', url: CHANNEL_LINK }
        ]]
    };
}

// ------------------- گروه‌ها: ثبت آمار فعالیت -------------------
async function trackGroupActivity(chat) {
    const chatId = chat.id;
    const now = new Date();
    const existing = await dbFetch(`groups?chat_id=eq.${chatId}`);

    if (existing.length === 0) {
        await dbFetch(`groups`, {
            method: 'POST',
            body: JSON.stringify({
                chat_id: chatId,
                title: chat.title || '',
                username: chat.username || null,
                messages_total: 1,
                messages_week: 1,
                messages_month: 1,
                week_reset_at: now.toISOString(),
                month_reset_at: now.toISOString()
            })
        });
        return;
    }

    const g = existing[0];
    const updates = {
        messages_total: (g.messages_total || 0) + 1,
        title: chat.title || g.title,
        username: chat.username || g.username
    };

    const weekDiffDays = (now - new Date(g.week_reset_at)) / (1000 * 60 * 60 * 24);
    if (weekDiffDays >= 7) {
        updates.messages_week = 1;
        updates.week_reset_at = now.toISOString();
    } else {
        updates.messages_week = (g.messages_week || 0) + 1;
    }

    const monthDiffDays = (now - new Date(g.month_reset_at)) / (1000 * 60 * 60 * 24);
    if (monthDiffDays >= 30) {
        updates.messages_month = 1;
        updates.month_reset_at = now.toISOString();
    } else {
        updates.messages_month = (g.messages_month || 0) + 1;
    }

    await dbFetch(`groups?chat_id=eq.${chatId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

function formatGroupLine(g, index) {
    const link = g.username ? `https://t.me/${g.username}` : 'بدون لینک عمومی';
    return `${index + 1}. <b>${g.title || 'بدون‌نام'}</b>\n   🔗 ${link}`;
}

// ------------------- اعلان همگانی (Broadcast) -------------------
async function sendInBatches(token, chatIds, text) {
    const batchSize = 30;
    for (let i = 0; i < chatIds.length; i += batchSize) {
        const batch = chatIds.slice(i, i + batchSize);
        await Promise.all(batch.map(id =>
            sendTg(token, 'sendMessage', { chat_id: id, text, parse_mode: 'HTML' }).catch(() => {})
        ));
        if (i + batchSize < chatIds.length) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function broadcastToAllPV(token, text) {
    const users = await dbFetch(`users?started_pv=eq.true&select=user_id`);
    const ids = users.map(u => u.user_id);
    await sendInBatches(token, ids, text);
}

async function broadcastToAllGroups(token, text) {
    const groups = await dbFetch(`groups?select=chat_id`);
    const ids = groups.map(g => g.chat_id);
    await sendInBatches(token, ids, text);
}

// ------------------- شکارچی: پردازش دوره‌ای شکار خودکار -------------------
async function processHunters(token) {
    const now = new Date();
    const hunters = await dbFetch(`users?hunter_level=gt.0&select=user_id,hunter_level,hunter_last_collect,first_name`);

    for (const h of hunters) {
        if (!h.hunter_last_collect) continue;
        const last = new Date(h.hunter_last_collect);
        const diffHours = Math.floor((now - last) / (1000 * 60 * 60));
        if (diffHours < 1) continue;

        const cfg = HUNTER_CATCH_CONFIG[h.hunter_level];
        if (!cfg) continue;

        const count = getRandomInt(cfg.min, cfg.max);

        const existing = await dbFetch(`user_inventory?user_id=eq.${h.user_id}&item_name=eq.${cfg.item}&item_type=eq.hunter_trophy`);
        if (existing.length > 0) {
            await dbFetch(`user_inventory?id=eq.${existing[0].id}`, {
                method: 'PATCH',
                body: JSON.stringify({ quantity: existing[0].quantity + count })
            });
        } else {
            await dbFetch(`user_inventory`, {
                method: 'POST',
                body: JSON.stringify({ user_id: h.user_id, item_type: 'hunter_trophy', item_name: cfg.item, quantity: count })
            });
        }

        await dbFetch(`users?user_id=eq.${h.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ hunter_last_collect: now.toISOString() })
        });

        await sendTg(token, 'sendMessage', {
            chat_id: h.user_id,
            text: `🦅 🐾 <b>گزارش عملیات شکارچی شخصی شما:</b>\n\n` +
                `شکارچی شما مقدار <b>${count}</b> عدد «${cfg.item}» شکار کرد و به قفس شما اضافه شد! 📦\n` +
                `برای مشاهده قفس، کلمه <b>قفس</b> را ارسال کنید.`,
            parse_mode: 'HTML'
        }).catch(() => {});
    }
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
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') return new Response('PishvaBot Active!', { status: 200 });
        
        const token = env.BOT_TOKEN;
        try {
            const update = await request.json();
            
            if (update.message) {
                await handleMessage(token, update.message, ctx);
            } else if (update.callback_query) {
                await handleCallback(token, update.callback_query);
            }
        } catch (err) {
            console.error("Worker Error:", err);
        }
        return new Response('OK', { status: 200 });
    },

    // اجرای دوره‌ای (Cron Trigger) برای پردازش شکار خودکار شکارچی‌ها
    // نکته: باید در wrangler.toml این مقدار تنظیم شود، مثلا هر ۱۵ دقیقه:
    // [triggers]
    // crons = ["*/15 * * * *"]
    async scheduled(event, env, ctx) {
        const token = env.BOT_TOKEN;
        ctx.waitUntil(processHunters(token));
    }
};

// ------------------- MESSAGE HANDLER -------------------
async function handleMessage(token, msg, ctx) {
    if (!msg.from || msg.from.is_bot) return;

    const chatId = msg.chat.id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // ------------------- بررسی افزودن اعضای جدید (از جمله خود بات) -------------------
    if (msg.new_chat_members && msg.new_chat_members.length > 0) {
        if (isGroup) {
            const botId = getBotId(token);
            const botWasAdded = msg.new_chat_members.some(m => m.id === botId);

            if (botWasAdded) {
                const memberCount = await getChatMemberCount(token, chatId);
                if (memberCount < MIN_GROUP_MEMBERS) {
                    return sendTg(token, 'sendMessage', {
                        chat_id: chatId,
                        text: `👑 ✨ <b>با درود بر فرمانده!</b> ✨ 👑\n\n` +
                            `⚠️ <b>این گروه شرایط فعال‌سازی بات رایش بزرگ را ندارد.</b>\n\n` +
                            `📊 حداقل تعداد اعضای لازم: <b>${MIN_GROUP_MEMBERS}</b> نفر\n` +
                            `👥 تعداد اعضای فعلی گروه: <b>${memberCount}</b> نفر\n\n` +
                            `🚀 لطفاً ابتدا اعضای بیشتری به گروه دعوت کنید، سپس بات به‌طور خودکار فعال خواهد شد.\n\n` +
                            `👇 در همین حین می‌توانید به گروه رسمی رایش بزرگ بپیوندید:`,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🏛 ورود به گروه رایش بزرگ', url: GROUP_LINK }]]
                        },
                        parse_mode: 'HTML'
                    });
                }
                // اگر گروه شرایط لازم را داشت، نیازی به پیام خوش‌آمد اضافه نیست
                return;
            }

            // خوش‌آمدگویی به اعضای عادی جدید (غیر از خود بات)
            const memberCount = await getChatMemberCount(token, chatId);
            if (memberCount >= MIN_GROUP_MEMBERS) {
                for (const newMember of msg.new_chat_members) {
                    if (newMember.is_bot) continue;
                    const mention = `<a href="tg://user?id=${newMember.id}">${newMember.first_name || 'سرباز جدید'}</a>`;
                    await sendTg(token, 'sendMessage', {
                        chat_id: chatId,
                        text: `👑 ⚔️ <b>به رایش بزرگ خوش آمدید!</b> ⚔️ 👑\n\n` +
                            `${mention} عزیز، به جمع سربازان رایش بزرگ پیوستید! 🫡\n\n` +
                            `🔹 برای شروع خدمت سربازی، کلمه <b>درود</b> را ارسال کنید.\n` +
                            `🔹 برای راهنمایی کامل، کلمه <b>راهنما</b> را ارسال کنید.\n` +
                            `🔹 برای ورود به سایت رسمی، کلمه <b>سایت</b> را ارسال کنید.\n\n` +
                            `⚡️ <i>به افتخار پیوستن یک سرباز جدید!</i> ⚡️`,
                        parse_mode: 'HTML'
                    }).catch(() => {});
                }
            }
        }
        // پیام‌های مربوط به افزودن عضو نیازی به پردازش دستورات ندارند
        return;
    }

    // ------------------- محدودیت فعالیت بات در گروه‌های کوچک + ثبت آمار فعالیت گروه -------------------
    if (isGroup) {
        const memberCount = await getChatMemberCount(token, chatId);
        if (memberCount < MIN_GROUP_MEMBERS) {
            return; // بات در گروه‌های کمتر از حداقل عضو، هیچ فعالیتی انجام نمی‌دهد
        }
        try {
            await trackGroupActivity(msg.chat);
        } catch (e) {
            console.error('trackGroupActivity error:', e);
        }
    }

    const user = await getOrCreateUser(msg.from);
    const rawText = (msg.text || '').trim();
    const text = convertFaToEnNumbers(rawText);
    const replyMsgId = msg.message_id;

    // ------------------- بخش پیوی (پیام شخصی) -------------------
    if (!isGroup) {
        // ثبت اینکه کاربر پیوی بات را شروع کرده (برای اعلان همگانی پیوی‌ها)
        if (!user.started_pv) {
            await dbFetch(`users?user_id=eq.${user.user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ started_pv: true })
            }).catch(() => {});
        }

        // ------------------- اعلان همگانی (فقط در پیوی) -------------------
        if (text.startsWith('ارسال اعلان به همه پیوی ها')) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 3 || !lines[1].startsWith('رمز')) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '🚫 <b>فرمت اشتباه!</b>\nمثال صحیح:\n<code>ارسال اعلان به همه پیوی ها\nرمز 11111111\nمتن پیام</code>',
                    parse_mode: 'HTML'
                });
            }
            const code = lines[1].replace('رمز', '').trim();
            if (code !== BROADCAST_PV_PASSWORD) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>رمز عبور اشتباه است!</b>', parse_mode: 'HTML' });
            }
            const broadcastText = lines.slice(2).join('\n');
            await sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚀 <b>ارسال اعلان همگانی به پیوی‌ها آغاز شد...</b>', parse_mode: 'HTML' });
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(broadcastToAllPV(token, broadcastText));
            } else {
                await broadcastToAllPV(token, broadcastText);
            }
            return;
        }

        if (text.startsWith('ارسال اعلان به همه گروه ها')) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 3 || !lines[1].startsWith('رمز')) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '🚫 <b>فرمت اشتباه!</b>\nمثال صحیح:\n<code>ارسال اعلان به همه گروه ها\nرمز 22222222\nمتن پیام</code>',
                    parse_mode: 'HTML'
                });
            }
            const code = lines[1].replace('رمز', '').trim();
            if (code !== BROADCAST_GROUP_PASSWORD) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>رمز عبور اشتباه است!</b>', parse_mode: 'HTML' });
            }
            const broadcastText = lines.slice(2).join('\n');
            await sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚀 <b>ارسال اعلان همگانی به گروه‌ها آغاز شد...</b>', parse_mode: 'HTML' });
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(broadcastToAllGroups(token, broadcastText));
            } else {
                await broadcastToAllGroups(token, broadcastText);
            }
            return;
        }

        // تغییر نام کاربری سایت در پیوی (مثال: "نام کاربری aliaa")
        if (text.startsWith('نام کاربری ')) {
            const newUsername = text.replace('نام کاربری ', '').trim();
            const englishOnly = /^[A-Za-z0-9_]+$/;

            if (newUsername.length < 5) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>نام کاربری باید حداقل ۵ کاراکتر باشد!</b>\nلطفاً مجدداً ارسال کنید (مثال: <code>نام کاربری aliaa</code>):',
                    reply_to_message_id: replyMsgId,
                    reply_markup: getPvReplyKeyboard(),
                    parse_mode: 'HTML'
                });
            }

            if (!englishOnly.test(newUsername)) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>نام کاربری باید فقط شامل حروف و اعداد انگلیسی باشد!</b>\nلطفاً مجدداً ارسال کنید (مثال: <code>نام کاربری aliaa</code>):',
                    reply_to_message_id: replyMsgId,
                    reply_markup: getPvReplyKeyboard(),
                    parse_mode: 'HTML'
                });
            }

            // بررسی یکتا بودن نام کاربری (بدون حساسیت به بزرگی/کوچکی حروف)
            const dupCheck = await dbFetch(`users?site_username=ilike.${newUsername}&user_id=neq.${user.user_id}`);
            if (dupCheck.length > 0) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>این نام کاربری قبلاً توسط شخص دیگری ثبت شده است!</b>\nلطفاً نام کاربری دیگری انتخاب کنید. 🔄',
                    reply_to_message_id: replyMsgId,
                    reply_markup: getPvReplyKeyboard(),
                    parse_mode: 'HTML'
                });
            }

            await dbFetch(`users?user_id=eq.${user.user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ site_username: newUsername })
            });

            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: `✅ <b>نام کاربری جدید شما با موفقیت ثبت شد!</b>\n👤 نام کاربری جدید: <code>${newUsername}</code>`,
                reply_to_message_id: replyMsgId,
                reply_markup: getPvReplyKeyboard(),
                parse_mode: 'HTML'
            });
        }

        // تغییر رمز عبور متنی در پیوی (مثال: "رمز 5555" یا "رمز 282882")
        if (text.startsWith('رمز ')) {
            let newPass = text.replace('رمز ', '').trim();
            const englishOnly = /^[A-Za-z0-9_]+$/;

            if (newPass.length < 4) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>رمز عبور باید حداقل ۴ کاراکتر باشد!</b>\nلطفاً مجدداً ارسال کنید (مثال: <code>رمز 5555</code>):',
                    reply_to_message_id: replyMsgId,
                    reply_markup: getPvReplyKeyboard(),
                    parse_mode: 'HTML'
                });
            }

            if (!englishOnly.test(newPass)) {
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: '❌ <b>رمز عبور باید فقط شامل حروف و اعداد انگلیسی باشد!</b>\nلطفاً مجدداً ارسال کنید (مثال: <code>رمز 5555</code>):',
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
            const welcomeText = `👑 <b>به بات رسمی رایش بزرگ خوش آمدید!</b> 👑\n\n` +
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

        if (text === '🔑 رمز و نام کاربری سایت') {
            const infoText = `🔑 <b>اطلاعات ورود فعلی شما به سایت:</b>\n\n` +
                `👤 <b>نام کاربری:</b> <code>${user.site_username}</code>\n` +
                `🔒 <b>رمز عبور:</b> <code>${user.site_password}</code>\n\n` +
                `✏️ <b>برای تغییر نام کاربری یا رمز عبور</b>، عبارت‌های زیر را ارسال کنید:\n` +
                `<code>نام کاربری (نام دلخواه)</code>\n` +
                `<code>رمز (رمز دلخواه)</code>\n\n` +
                `<b>مثال:</b>\n` +
                `<code>نام کاربری aliaa</code>\n` +
                `<code>رمز 1828281</code>\n\n` +
                `⚠️ <b>نکات مهم:</b>\n` +
                `• نام کاربری باید حداقل <b>۵ کاراکتر</b> باشد.\n` +
                `• نام کاربری و رمز عبور باید <b>فقط انگلیسی</b> (حروف/اعداد لاتین) باشند.\n` +
                `• نام کاربری هر شخص باید <b>یکتا</b> باشد و تکراری پذیرفته نمی‌شود.`;

            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: infoText,
                reply_to_message_id: replyMsgId,
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

    // معرفی سایت رسمی
    if (text === 'سایت') {
        const siteText = `🌐 👑 <b>سایت رسمی رایش بزرگ</b> 👑 🌐\n` +
            `✨ ────────────────── ✨\n\n` +
            `از طریق سایت رسمی رایش بزرگ می‌توانید به امکانات ویژه زیر دسترسی داشته باشید:\n\n` +
            `🏆 <b>لیدربورد ثروتمندترین‌ها و قوی‌ترین‌ها</b> + جایزه هفتگی برای برترین‌ها\n` +
            `📝 <b>امکان ارسال پست</b> (میم و غیره) و لایک و کامنت گذاشتن سایر رزمندگان\n` +
            `🎡 <b>اسپین روزانه</b> با جوایز ویژه\n` +
            `🎁 <b>جایزه روزانه</b>\n` +
            `📖 <b>سیستم راهنمایی کامل</b> و امکانات بیشتر\n\n` +
            `🔗 <b>لینک ورود:</b> https://Pishwabot.vercel.app\n\n` +
            `💡 <i>برای دریافت نام کاربری و رمز عبور ورود، در پیوی بات دکمه «رمز و نام کاربری سایت» را بزنید.</i>`;

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: siteText,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // آمار فعال‌ترین گروه‌ها
    if (text === 'آمار گروه ها' || text === 'امار گروه ها') {
        const [topWeek, topMonth, topTotal] = await Promise.all([
            dbFetch(`groups?order=messages_week.desc&limit=5`),
            dbFetch(`groups?order=messages_month.desc&limit=5`),
            dbFetch(`groups?order=messages_total.desc&limit=5`)
        ]);

        const buildSection = (list) => list.length ? list.map((g, i) => formatGroupLine(g, i)).join('\n') : '➖ داده‌ای موجود نیست';

        const statsText = `📊 🏆 <b>فعال‌ترین گروه‌های رایش بزرگ</b> 🏆 📊\n` +
            `✨ ────────────────── ✨\n\n` +
            `📅 <b>فعال‌ترین گروه‌ها در این هفته:</b>\n${buildSection(topWeek)}\n\n` +
            `🗓 <b>فعال‌ترین گروه‌ها در این ماه:</b>\n${buildSection(topMonth)}\n\n` +
            `🏆 <b>فعال‌ترین گروه‌ها از ابتدا:</b>\n${buildSection(topTotal)}`;

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: statsText, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
    }

    // خرید و ارتقای شکارچی شخصی
    if (text === 'شکارچی') {
        if (user.level < HUNTER_MIN_RANK_LEVEL) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: `🚫 <b>شما هنوز شایستگی استخدام شکارچی را ندارید!</b>\n\n` +
                    `🎖 حداقل درجه لازم: <b>${getTitle(HUNTER_MIN_RANK_LEVEL)} (سطح ${HUNTER_MIN_RANK_LEVEL})</b>\n` +
                    `🔰 درجه فعلی شما: <b>${getTitle(user.level)} (سطح ${user.level})</b>`,
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        const currentHLvl = user.hunter_level || 0;
        if (currentHLvl >= 6) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '🦅 <b>شکارچی شما در حداکثر سطح ممکن (سطح ۶) قرار دارد!</b> 👑',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        const nextHLvl = currentHLvl + 1;
        const cost = HUNTER_LEVELS[nextHLvl];
        const cfg = HUNTER_CATCH_CONFIG[nextHLvl];
        const actionLabel = currentHLvl === 0 ? 'استخدام شکارچی' : `ارتقا به سطح ${nextHLvl}`;

        const keyboard = {
            inline_keyboard: [[
                { text: `✅ ${actionLabel} (${cost} مارک) 🎯`, callback_data: withOwner(`buy_hunter:${nextHLvl}:${cost}`, user.user_id) },
                { text: '✖️ انصراف', callback_data: withOwner('cancel', user.user_id) }
            ]]
        };

        const statusText = currentHLvl === 0
            ? `🏹 <b>شما در حال حاضر شکارچی ندارید.</b>`
            : `🏹 <b>سطح فعلی شکارچی شما:</b> ${currentHLvl}`;

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🦅 🏹 <b>استخدام و ارتقای شکارچی شخصی</b> 🏹 🦅\n\n` +
                `${statusText}\n` +
                `💰 <b>هزینه ${actionLabel}:</b> ${cost} مارک ${MARK_ANIM}\n` +
                `🎯 <b>توان شکار در سطح ${nextHLvl}:</b> ${cfg.min} تا ${cfg.max} «${cfg.item}» در هر ساعت (خودکار)\n\n` +
                `آیا مایل به ${actionLabel} هستید فرمانده؟ ⚡️`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // دزدی از بقیه با منشن (@) و شرط‌بندی
    if (text.startsWith('دزدی از @')) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        if (lines.length < 2 || !lines[1].startsWith('شرط')) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '🚫 <b>فرمت اشتباه!</b>\nمثال صحیح:\n<code>دزدی از @username</code>\n<code>شرط 500</code>',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        const usernameRaw = lines[0].replace('دزدی از', '').trim();
        const targetUsername = usernameRaw.replace('@', '').trim();
        const betAmount = parseInt(lines[1].replace('شرط', '').trim());

        if (!targetUsername || isNaN(betAmount) || betAmount <= 0) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '🚫 <b>فرمت اشتباه!</b>\nمثال صحیح:\n<code>دزدی از @username</code>\n<code>شرط 500</code>',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        const targetUser = await getUserByUsername(targetUsername);
        if (!targetUser) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>سرباز هدف در مقر پیدا نشد!</b> 🔎', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (targetUser.user_id === user.user_id) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>نمی‌توانی به خودت اعلام جنگ کنی!</b> 🤡', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (user.last_mention_attack) {
            const diffMin = (new Date() - new Date(user.last_mention_attack)) / (1000 * 60);
            if (diffMin < MENTION_ATTACK_COOLDOWN_MIN) {
                const rem = Math.ceil(MENTION_ATTACK_COOLDOWN_MIN - diffMin);
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: `⌛ <b>هنوز آماده اعلام جنگ جدید نیستی!</b>\nباید <b>${rem} دقیقه</b> دیگر صبر کنی. 🕵️‍♂️`,
                    reply_to_message_id: replyMsgId,
                    parse_mode: 'HTML'
                });
            }
        }

        if (user.marks < betAmount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: `💸 <b>موجودی جیب شما کافی نیست!</b>`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (targetUser.marks < betAmount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: `💸 <b>موجودی جیب سرباز هدف برای این شرط کافی نیست!</b>`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + DUEL_EXPIRY_MIN * 60 * 1000);

        const created = await dbFetch(`duel_challenges`, {
            method: 'POST',
            body: JSON.stringify({
                challenger_id: user.user_id,
                target_id: targetUser.user_id,
                bet_amount: betAmount,
                group_chat_id: chatId,
                status: 'pending',
                expires_at: expiresAt.toISOString()
            })
        });

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ last_mention_attack: now.toISOString() })
        });

        const challengeId = created[0].id;
        const keyboard = {
            inline_keyboard: [[
                { text: '⚔️ قبول چالش', callback_data: withOwner(`duel_accept:${challengeId}`, targetUser.user_id) },
                { text: '🏳️ رد چالش', callback_data: withOwner(`duel_decline:${challengeId}`, targetUser.user_id) }
            ]]
        };

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚔️ 🚨 <b>اعلام جنگ رسمی!</b> 🚨 ⚔️\n\n` +
                `🎯 <b>${user.first_name}</b> به <b>${targetUser.first_name}</b> اعلام جنگ کرد!\n` +
                `💰 <b>مبلغ شرط:</b> ${betAmount} مارک ${MARK_ANIM}\n\n` +
                `⏳ <b>${targetUser.first_name}</b> فقط <b>${DUEL_EXPIRY_MIN} دقیقه</b> فرصت دارد تا چالش را قبول یا رد کند!`,
            reply_to_message_id: replyMsgId,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // ثبت لقب جدید
    if (text.startsWith('لقب ')) {
        const newNick = text.replace('لقب ', '').trim();
        
        if (!newNick) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '❌ <b>لطفاً لقب مورد نظر خود را وارد کنید!</b>\nمثال: <code>لقب علی</code>',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        if (newNick.includes('مقام ها') || newNick.includes('پیشوا')) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '❌ <b>استفاده از کلمات «مقام ها» و «پیشوا» در لقب مجاز نمی‌باشد!</b>',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ nickname: newNick })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `✅ <b>لقب شما با موفقیت ثبت شد:</b> <code>${newNick}</code>`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
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

        await addMarksToUser(user, reward);
        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                last_dorood: new Date().toISOString(),
                total_doroods: (user.total_doroods || 0) + 1
            })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🫡 <b>درود بر ارتش بزرگ!</b> ⚔️\n\n` +
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

        const totalCollected = targetUser.total_marks_collected || targetUser.marks || 0;
        const rank = await getUserRank(totalCollected);

        const nickText = targetUser.nickname ? `🏷 <b>لقب:</b> ${targetUser.nickname}\n` : '';
        const hunterText = `🦅 <b>سطح شکارچی شخصی:</b> <b>سطح ${targetUser.hunter_level || 0}</b> 🏹\n`;

        const statsText = `📜 ✨ <b>شناسنامه و آمار نظامی:</b> ✨ 📜\n` +
            `✨ ────────────────── ✨\n\n` +
            `👤 <b>نام رزمنده:</b> ${targetUser.first_name}\n` +
            nickText +
            `🎖 <b>مقام نظامی:</b> ${getTitle(targetUser.level)} (سطح ${targetUser.level})\n` +
            `💎 <b>موجودی جیب:</b> <b>${targetUser.marks}</b> مارک ${MARK_ANIM}\n` +
            `🏛 <b>سپرده رایشس بانک:</b> <b>${targetUser.bank_balance}</b> مارک ${MARK_ANIM}\n` +
            `👑 <b>سطح رایشس بانک:</b> <b>سطح ${targetUser.reichsbank_level || 0}</b>⚡️\n` +
            `🔥 <b>مجموع کل مارک‌های دریافتی:</b> <b>${totalCollected}</b> مارک ${MARK_ANIM}\n` +
            `🏆 <b>رتبه در ثروت‌آفرینی:</b> <b>نفر ${rank}#</b> در سراسر رایش 🥇\n\n` +
            `🗡 <b>قدرت تهاجمی:</b> <b>${power}</b> HP 💣\n` +
            `🛡 <b>قدرت دفاعی (زره):</b> <b>${health}</b> HP 🛡\n` +
            `🦅 <b>سطح تفنگ شکاری:</b> <b>${targetUser.hunting_rifle_level || 0}</b> 🎯\n` +
            hunterText +
            `🫡 <b>تعداد ادای احترام:</b> <b>${targetUser.total_doroods || 0}</b> بار\n` +
            `⚠️ <b>سابقه جریمه:</b> <b>${targetUser.total_punishments || 0}</b> بار 🚨\n` +
            `⚔️ <b>تعداد نبردها:</b> <b>${targetUser.total_attacks || 0}</b> جنگ 💥\n` +
            `🏆 <b>برد در دزدی از سرباز:</b> <b>${targetUser.soldier_wins || 0}</b> بار ✅\n` +
            `💀 <b>باخت در دزدی از سرباز:</b> <b>${targetUser.soldier_losses || 0}</b> بار ❌\n\n` +
            `🌐 <b>سامانه مرکزی رایش بزرگ:</b>\n` +
            ` جهت مشاهده تالار افتخارات، رده‌بندی جنگی، ثروتمندترین رزمندگان و برترین گردان‌ها به وب‌سایت رسمی مراجعه فرمایید:\n` +
            `🔗 Pishwabot.vercel.app`;

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
                { text: '💎 تایید و واریز 🚀', callback_data: withOwner(`confirm_transfer:${targetUser.user_id}:${amount}`, user.user_id) },
                { text: '🔥 انصراف ✖️', callback_data: withOwner('cancel', user.user_id) }
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

    // 5.1 برداشت پول از رایشس بانک به جیب شخصی
    if (text.startsWith('برداشت از رایشس')) {
        const amount = parseInt(text.replace('برداشت از رایشس', '').trim());
        if (isNaN(amount) || amount <= 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '🚫 <b>فرمت اشتباه!</b>\nمثال: <code>برداشت از رایشس 400</code> 🏦', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if ((user.bank_balance || 0) < amount) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '💸 <b>موجودی رایشس بانک شما کافی نیست!</b>', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                marks: user.marks + amount,
                bank_balance: user.bank_balance - amount
            })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 🚀 <b>برداشت از رایشس بانک با موفقیت انجام شد!</b> 🚀\n\n` +
                `💵 <b>مبلغ برداشت‌شده:</b> <b>-${amount}</b> مارک ${MARK_ANIM}\n` +
                `🏛 <b>سپرده باقی‌مانده بانک:</b> <b>${user.bank_balance - amount}</b> مارک ${MARK_ANIM}\n` +
                `💰 <b>موجودی جدید جیب:</b> <b>${user.marks + amount}</b> مارک ${MARK_ANIM}`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 6. بازار سیاه
    if (text === 'بازار سیاه') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '⚔️ اسلحه خانه سنگین 💣', callback_data: withOwner('bm_weapons', user.user_id) }, { text: '🛡 تجهیزات زرهی و دفاعی 🥷', callback_data: withOwner('bm_armors', user.user_id) }]
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
                { text: `🚀 ارتقا به سطح ${nextLvl} (${cost} مارک) 💎`, callback_data: withOwner(`buy_rifle:${nextLvl}:${cost}`, user.user_id) },
                { text: '🔥 انصراف ✖️', callback_data: withOwner('cancel', user.user_id) }
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
                { text: '🧨 شلیک و حمله به بانک! 💣', callback_data: withOwner('confirm_bank_heist', user.user_id) },
                { text: '🏃‍♂️ عقب‌نشینی ✖️', callback_data: withOwner('cancel', user.user_id) }
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
                { text: '⚔️ ردگیری و شلیک به سرباز 💣', callback_data: withOwner('confirm_soldier_attack', user.user_id) },
                { text: '✖️ لغو عملیات', callback_data: withOwner('cancel', user.user_id) }
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

    // 9.1 حمله هدفمند به آیدی یا ریپلی
    if (text.startsWith('حمله به')) {
        let targetUser = null;

        if (msg.reply_to_message) {
            targetUser = await getOrCreateUser(msg.reply_to_message.from);
        } else if (text.includes('@')) {
            const parts = text.split('@');
            if (parts[1]) {
                targetUser = await getUserByUsername(parts[1].trim());
            }
        }

        if (!targetUser) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: '❌ <b>سرباز هدف یافت نشد!</b>\nلطفاً آیدی صحیح را وارد کنید (مثلاً: <code>حمله به @ali</code>) یا روی پیام فرد ریپلی کنید.',
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        if (user.user_id === targetUser.user_id) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>نمی‌توانی به خودت حمله کنی!</b> 🤡', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        if (user.level !== targetUser.level) {
            return sendTg(token, 'sendMessage', {
                chat_id: chatId,
                text: `🚫 <b>امکان حمله وجود ندارد!</b>\n\n` +
                    `سطح شما: <b>سطح ${user.level}</b>\n` +
                    `سطح هدف: <b>سطح ${targetUser.level}</b>\n\n` +
                    `⚡️ <i>تنها می‌توانید به سربازانی که دقیقاً هم‌سطح (هم‌لول) شما هستند حمله کنید!</i>`,
                reply_to_message_id: replyMsgId,
                parse_mode: 'HTML'
            });
        }

        if (user.last_soldier_attack) {
            const diffMin = (new Date() - new Date(user.last_soldier_attack)) / (1000 * 60);
            if (diffMin < 10) {
                return sendTg(token, 'sendMessage', { chat_id: chatId, text: `🚨 <b>ردیابی شده‌ای!</b> برای حمله بعدی باید <b>${Math.ceil(10 - diffMin)} دقیقه</b> دیگر کمین کنی! 🥷`, reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
            }
        }

        const uInv = await dbFetch(`user_inventory?user_id=eq.${user.user_id}`);
        const tInv = await dbFetch(`user_inventory?user_id=eq.${targetUser.user_id}`);

        let uPower = 100, tPower = 100;
        uInv.forEach(i => { if (WEAPONS[i.item_name]) uPower += WEAPONS[i.item_name].damage * i.quantity; });
        tInv.forEach(i => { if (WEAPONS[i.item_name]) tPower += WEAPONS[i.item_name].damage * i.quantity; });

        let isWinner = uPower >= tPower;
        let gain = isWinner ? Math.floor(uPower * 0.02) : Math.floor(uPower * 0.011);

        await addMarksToUser(user, gain);
        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                last_soldier_attack: new Date().toISOString(),
                total_attacks: (user.total_attacks || 0) + 1,
                soldier_wins: (user.soldier_wins || 0) + (isWinner ? 1 : 0),
                soldier_losses: (user.soldier_losses || 0) + (isWinner ? 0 : 1)
            })
        });

        const attackerNotice = `🚨 ⚔️ <b>گزارش حمله مستقیم به سرباز!</b> ⚔️ 🚨\n\n` +
            `🎯 <b>قربانی:</b> ${targetUser.first_name}\n` +
            `💎 <b>غنیمت به سرقت رفته:</b> <b>+${gain}</b> مارک ${MARK_ANIM}\n` +
            `وضعیت: ${isWinner ? 'پیروزی کامل 🏆' : 'عقب‌نشینی همراه با غنیمت 🩸'}`;

        const victimNotice = `🚨 <b>هشدار حمله مستقیم!</b> 🚨\n\n` +
            `🥷 <b>سرباز ${user.first_name}</b> به شما حمله کرد و مقدار <b>${gain}</b> مارک ${MARK_ANIM} غنیمت برداشت!`;

        sendTg(token, 'sendMessage', { chat_id: user.user_id, text: attackerNotice, parse_mode: 'HTML' });
        sendTg(token, 'sendMessage', { chat_id: targetUser.user_id, text: victimNotice, parse_mode: 'HTML' });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚔️ 🩸 <b>نتیجه حمله به ${targetUser.first_name}:</b>\n\n` +
                `${isWinner ? '🎉 👑 پیروز شدید و منطقه را فتح کردید!' : '💔 🩸 عقب‌نشینی کردید اما غنیمت برداشتید!'}\n` +
                `💎 غنیمت جنگی شما: <b>+${gain}</b> مارک ${MARK_ANIM} 🚀\n` +
                `📩 <i>اعلان شخصی و گزارش کامل به پیوی هر دو نفر ارسال شد.</i>`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 10. بانک شخصی و رایشس بانک
    if (text === 'بانک') {
        const canUpgrade = (user.bank_balance || 0) >= 6000;
        
        const inline_keyboard = [
            [{ text: '💎 برداشت سود ساعتی رایشس بانک 🚀', callback_data: withOwner('reichsbank_menu', user.user_id) }],
            [{ text: '💵 واریز 1000 مارک 📥', callback_data: withOwner('quick_deposit_1000', user.user_id) }, { text: '💵 واریز کل جیب 📥', callback_data: withOwner('quick_deposit_all', user.user_id) }]
        ];

        // فقط اگر حداقل ۶۰۰۰ مارک در رایشس بانک داشته باشد، دکمه ارتقا نشان داده می‌شود
        if (canUpgrade) {
            inline_keyboard.push([{ text: '📈 ارتقای سطح رایشس بانک 👑', callback_data: withOwner('upgrade_reichsbank', user.user_id) }]);
        }

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🏛 💎 <b>مدیریت سرمایه و رایشس بانک</b> 💎 🏛\n` +
                `✨ ────────────────── ✨\n\n` +
                `💰 موجودی در جیب: <b>${user.marks}</b> مارک ${MARK_ANIM}\n` +
                `🏛 موجودی در رایشس بانک: <b>${user.bank_balance}</b> مارک ${MARK_ANIM}\n` +
                `👑 سطح فعلی رایشس بانک: <b>سطح ${user.reichsbank_level || 0}</b>⚡️\n` +
                `${!canUpgrade ? '⚠️ <i>برای آزادسازی دکمه ارتقای رایشس بانک باید حداقل 6000 مارک در رایشس بانک داشته باشید.</i>\n\n' : ''}` +
                `💡 <i>برای واریز مبالغ خاص می‌توانید دستور <code>واریز به بانک [مقدار]</code> را بفرستید.</i>\n` +
                `💡 <i>برای برداشت مبالغ خاص می‌توانید دستور <code>برداشت از رایشس [مقدار]</code> را بفرستید.</i>`,
            reply_to_message_id: replyMsgId,
            reply_markup: { inline_keyboard },
            parse_mode: 'HTML'
        });
    }

    // 11. شکار کردن
    if (text === 'شکار') {
        const rifleLvl = user.hunting_rifle_level || 0;
        if (rifleLvl === 0) {
            return sendTg(token, 'sendMessage', { chat_id: chatId, text: '❌ <b>برای شکار ابتدا باید تفنگ شکاری تهیه کنی!</b> (ارسال کلمه: <code>تفنگ شکاری</code>) 🎯', reply_to_message_id: replyMsgId, parse_mode: 'HTML' });
        }

        const cdMinutes = HUNTING_COOLDOWNS[rifleLvl] || 5;

        if (user.last_hunt) {
            const diffMin = (new Date() - new Date(user.last_hunt)) / (1000 * 60);
            if (diffMin < cdMinutes) {
                const remMin = Math.ceil(cdMinutes - diffMin);
                return sendTg(token, 'sendMessage', {
                    chat_id: chatId,
                    text: `⏳ <b>شکارگاه خلوت است!</b>\n\nبا تفنگ شکاری سطح ${rifleLvl}، زمان انتظار بین هر شکار <b>${cdMinutes} دقیقه</b> می‌باشد.\nلطفاً <b>${remMin} دقیقه</b> دیگر صبر کنید! 🎯`,
                    reply_to_message_id: replyMsgId,
                    parse_mode: 'HTML'
                });
            }
        }

        const rand = Math.random() * 100;
        let hunted = '';

        if (rifleLvl === 1) hunted = 'دورگه';
        else if (rifleLvl === 2) hunted = rand <= 10 ? 'دورگه' : 'غیر اصیل';
        else if (rifleLvl === 3) {
            if (rand <= 2) hunted = 'دورگه';
            else if (rand <= 10) hunted = 'غیر اصیل';
            else hunted = 'انگل';
        } else if (rifleLvl === 4) {
            if (rand <= 1) hunted = 'دورگه';
            else if (rand <= 3) hunted = 'غیر اصیل';
            else if (rand <= 6) hunted = 'انگل';
            else hunted = 'مفت خور';
        } else if (rifleLvl === 5) {
            hunted = rand <= 5 ? 'مفت خور' : 'آفت';
        } else if (rifleLvl === 6) {
            hunted = rand <= 30 ? 'آفت' : 'حشرات موذی';
        }

        const existing = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${hunted}&item_type=eq.trophy`);
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

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ last_hunt: new Date().toISOString() })
        });

        return sendTg(token, 'sendMessage', {
            chat_id: chatId,
            text: `🦅 🎯 <b>شکار موفقیت‌آمیز بود!</b> 🎯\n\n` +
                `شما یک <b>«${hunted}»</b> نگونسار کردید! 🪵\n` +
                `📦 صید به قفس منتقل شد.\n` +
                `⏱ زمان انتظار برای شکار بعدی: <b>${cdMinutes} دقیقه</b>`,
            reply_to_message_id: replyMsgId,
            parse_mode: 'HTML'
        });
    }

    // 12. قفس شکار (صیدهای شخصی + صیدهای شکارچی)
    if (text === 'قفس') {
        const invAll = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_type=in.(trophy,hunter_trophy)`);
        const ownCatches = invAll.filter(i => i.item_type === 'trophy');
        const hunterCatches = invAll.filter(i => i.item_type === 'hunter_trophy');

        let totalValue = 0;
        const buildList = (list) => {
            let str = '';
            list.forEach(i => {
                const val = (TROPHIES[i.item_name] || 0) * i.quantity;
                totalValue += val;
                str += `🔹 <b>${i.item_name}</b>: ${i.quantity} عدد (ارزش هرکدام: ${TROPHIES[i.item_name]} | کل: ${val} ${MARK_ANIM})\n`;
            });
            return str || '➖ خالی است\n';
        };

        const listText = "🪵 🦅 <b>محتویات قفس شکار شما:</b> 🦅 🪵\n✨ ────────────────── ✨\n\n" +
            `🏹 <b>صیدهای شخصی شما:</b>\n${buildList(ownCatches)}\n` +
            `🐾 <b>صیدهای شکارچی شما:</b>\n${buildList(hunterCatches)}\n` +
            `💵 <b>ارزش مجموع صیدها:</b> <b>${totalValue}</b> مارک ${MARK_ANIM}`;

        const keyboard = {
            inline_keyboard: [[{ text: '💎 چگونگی فروش صیدها 🚀', callback_data: withOwner('sell_trophies_prompt', user.user_id) }]]
        };

        return sendTg(token, 'sendMessage', { chat_id: chatId, text: listText, reply_to_message_id: replyMsgId, reply_markup: keyboard, parse_mode: 'HTML' });
    }

    // 13. دستور فروش دستوری (صیدهای شخصی و شکارچی هر دو قابل فروش هستند)
    if (text.startsWith('فروش ')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
            const count = parseInt(parts[1]);
            const trophyName = parts.slice(2).join(' ').trim();

            if (!isNaN(count) && count > 0 && TROPHIES[trophyName]) {
                const invRows = await dbFetch(`user_inventory?user_id=eq.${user.user_id}&item_name=eq.${trophyName}&item_type=in.(trophy,hunter_trophy)`);
                const totalAvailable = invRows.reduce((s, r) => s + r.quantity, 0);

                if (totalAvailable >= count) {
                    let remaining = count;
                    for (const row of invRows) {
                        if (remaining <= 0) break;
                        const take = Math.min(row.quantity, remaining);
                        const newQty = row.quantity - take;

                        if (newQty > 0) {
                            await dbFetch(`user_inventory?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: newQty }) });
                        } else {
                            await dbFetch(`user_inventory?id=eq.${row.id}`, { method: 'DELETE' });
                        }
                        remaining -= take;
                    }

                    const earned = count * TROPHIES[trophyName];
                    await addMarksToUser(user, earned);

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
    const helpText = `⚔️ 🔥 <b>پایگاه اطلاعاتی بات</b> 🔥 ⚔️\n` +
        `✨ ────────────────── ✨\n\n` +
        `🚨 <b>مهم: بازی فقط درون گروه فعال می‌باشد و گروه باید حداقل ${MIN_GROUP_MEMBERS} عضو داشته باشد!</b>\n\n` +
        `🫡 <b>درود</b> ➔ دریافت پاداش روزانه (دارای زمان انتظار)\n` +
        `📊 <b>آمار / آمارش</b> ➔ مشاهده شناسنامه رزمی، لقب و مالی شما\n` +
        `🏷 <b>لقب [اسم]</b> ➔ ثبت لقب جدید برای خودتان (مثال: <code>لقب علی</code>)\n` +
        `🌐 <b>سایت</b> ➔ نمایش ویژگی‌ها و لینک سایت رسمی رایش بزرگ\n` +
        `💀 <b>بازار سیاه</b> ➔ خرید تسلیحات سنگین و زره‌های نظامی\n` +
        `🏛 <b>بانک</b> ➔ مدیریت سرمایه و سپرده‌گذاری در رایشس بانک\n` +
        `💳 <b>واریز به بانک [مقدار]</b> ➔ انتقال پول از جیب به رایشس بانک\n` +
        `💳 <b>برداشت از رایشس [مقدار]</b> ➔ انتقال پول از رایشس بانک به جیب\n` +
        `🏦 <b>دزدی از بانک</b> ➔ سرقت مسلحانه از خزانه (پرخطر!)\n` +
        `🗡 <b>دزدی از سرباز</b> ➔ درگیری خیابانی و غارت سایر سربازان\n` +
        `⚔️ <b>حمله به @username</b> ➔ حمله مستقیم به سرباز هم‌لول خود\n` +
        `⚔️ <b>دزدی از @username</b> + <b>شرط [مقدار]</b> ➔ اعلام جنگ رسمی و شرط‌بندی (۱۵ دقیقه فرصت پاسخ)\n` +
        `💸 <b>انتقال [مقدار]</b> ➔ انتقال مستقیم مارک ${MARK_ANIM} به سایر بازیکنان\n` +
        `🦅 <b>تفنگ شکاری</b> ➔ ارتقای سلاح شکاری برای صید موجودات بهتر\n` +
        `🎯 <b>شکار / قفس</b> ➔ شکار موجودات (دارای زمان انتظار) و فروش صیدها\n` +
        `🏹 <b>شکارچی</b> ➔ استخدام و ارتقای شکارچی شخصی برای شکار خودکار ساعتی (نیازمند سطح ۳ به بالا)\n` +
        `📊 <b>آمار گروه ها</b> ➔ نمایش فعال‌ترین گروه‌های رایش بزرگ (هفته/ماه/کل)\n\n` +
        `🚨 <b>هشدار:</b> کلمات احوالپرسی غیرنظامی جریمه سنگین دارند! 🧨`;
    
    const payload = { chat_id: chatId, text: helpText, parse_mode: 'HTML', reply_markup: getCommunityLinksKeyboard() };
    if (replyMsgId) payload.reply_to_message_id = replyMsgId;
    if (isPv) {
        // در پیوی، دکمه‌های لینک گروه/کانال به همراه کیبورد دائمی پیوی نمایش داده می‌شود
        payload.reply_markup = getCommunityLinksKeyboard();
    }

    return sendTg(token, 'sendMessage', payload);
}

// ------------------- CALLBACK QUERY HANDLER -------------------
async function handleCallback(token, cb) {
    const user = await getOrCreateUser(cb.from);
    const chatId = cb.message.chat.id;

    // جدا کردن صاحب اصلی دکمه از callback_data و بررسی مجاز بودن کلیک‌کننده
    const { action, ownerId } = parseCallbackData(cb.data);

    if (ownerId !== null && cb.from.id !== ownerId) {
        return sendTg(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: '🚫 این دستور برای شما نیست! این عملیات مخصوص شخص دیگری است.',
            show_alert: true
        });
    }

    const data = action;

    if (data === 'cancel') {
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '✖️ <b>عملیات با دستور رزمنده لغو شد.</b>', parse_mode: 'HTML' });
    }

    if (data === 'help_menu') {
        return sendHelpMessage(token, chatId, cb.message.message_id, cb.message.chat.type === 'private');
    }

    // راهنمای فروش صیدهای قفس
    if (data === 'sell_trophies_prompt') {
        const guideText = `💡 📖 <b>راهنمای فروش صیدهای قفس:</b>\n\n` +
            `برای فروش صیدها در گروه کافیست از دستور زیر استفاده کنید:\n\n` +
            `<code>فروش [تعداد] [نام شکار]</code>\n\n` +
            `📝 <b>مثال‌ها:</b>\n` +
            `🔹 <code>فروش 1 دورگه</code>\n` +
            `🔹 <code>فروش 2 انگل</code>\n` +
            `🔹 <code>فروش 5 آفت</code>`;

        return sendTg(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: guideText.replace(/<[^>]*>?/gm, ''),
            show_alert: true
        });
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
        await addMarksToUser(target[0], amount);

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
            buttons.push([{ text: `خرید ${w} (${WEAPONS[w].price} مارک) 🗡`, callback_data: withOwner(`buy_item:weapon:${w}`, cb.from.id) }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: withOwner('cancel', cb.from.id) }]);
        return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text, reply_markup: { inline_keyboard: buttons }, parse_mode: 'HTML' });
    }

    if (data === 'bm_armors') {
        let text = "🛡 🥷 <b>تجهیزات دفاعی بازار سیاه:</b> 🥷 🛡\n\n";
        const buttons = [];
        Object.keys(ARMORS).forEach(a => {
            text += `🔹 <b>${a}</b>: ${ARMORS[a].price} مارک ${MARK_ANIM} | زره: +${ARMORS[a].health} HP 🛡\n`;
            buttons.push([{ text: `خرید ${a} (${ARMORS[a].price} مارک) 🥷`, callback_data: withOwner(`buy_item:armor:${a}`, cb.from.id) }]);
        });
        buttons.push([{ text: '🔙 بازگشت', callback_data: withOwner('cancel', cb.from.id) }]);
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

    // خرید یا ارتقای شکارچی شخصی
    if (data.startsWith('buy_hunter:')) {
        const [, lvlStr, costStr] = data.split(':');
        const targetLvl = parseInt(lvlStr);
        const cost = parseInt(costStr);

        if (user.level < HUNTER_MIN_RANK_LEVEL) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '🚫 درجه شما برای این کار کافی نیست!', show_alert: true });
        }
        if (user.marks < cost) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ موجودی کافی نیست!', show_alert: true });
        }

        const updates = { marks: user.marks - cost, hunter_level: targetLvl };
        if (!user.hunter_level || user.hunter_level === 0) {
            updates.hunter_last_collect = new Date().toISOString();
        }
        await dbFetch(`users?user_id=eq.${user.user_id}`, { method: 'PATCH', body: JSON.stringify(updates) });

        const cfg = HUNTER_CATCH_CONFIG[targetLvl];

        await sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🎉 🦅 <b>شکارچی شما آماده عملیات شد!</b> 🚀\n\n` +
                `🏹 سطح جدید: <b>${targetLvl}</b>\n` +
                `🎯 توان شکار: ${cfg.min} تا ${cfg.max} «${cfg.item}» در ساعت\n` +
                `⏱ شکارچی از یک ساعت دیگر اولین شکار خود را انجام می‌دهد!`,
            parse_mode: 'HTML'
        });

        return sendTg(token, 'sendMessage', {
            chat_id: user.user_id,
            text: `🦅 <b>شکارچی شما شروع به کار کرد!</b>\n\nسطح: <b>${targetLvl}</b> | توان: ${cfg.min}-${cfg.max} «${cfg.item}» در ساعت ⏱`,
            parse_mode: 'HTML'
        }).catch(() => {});
    }

    // قبول یا رد چالش دزدی با منشن (@)
    if (data.startsWith('duel_accept:') || data.startsWith('duel_decline:')) {
        const challengeId = data.split(':')[1];
        const rows = await dbFetch(`duel_challenges?id=eq.${challengeId}`);

        if (rows.length === 0 || rows[0].status !== 'pending') {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ این چالش دیگر معتبر نیست!', show_alert: true });
        }

        const challenge = rows[0];

        if (new Date() > new Date(challenge.expires_at)) {
            await dbFetch(`duel_challenges?id=eq.${challengeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'expired' }) });
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '⌛ <b>زمان پاسخ به این چالش به پایان رسید!</b>', parse_mode: 'HTML' });
        }

        if (data.startsWith('duel_decline:')) {
            await dbFetch(`duel_challenges?id=eq.${challengeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'declined' }) });
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '🏳️ <b>چالش رد شد.</b>', parse_mode: 'HTML' });
        }

        // قبول چالش
        const challengerRows = await dbFetch(`users?user_id=eq.${challenge.challenger_id}`);
        const targetRows = await dbFetch(`users?user_id=eq.${challenge.target_id}`);
        if (!challengerRows.length || !targetRows.length) {
            return sendTg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '❌ خطا در بارگذاری اطلاعات طرفین!', show_alert: true });
        }

        const cUser = challengerRows[0], tUser = targetRows[0];
        const bet = challenge.bet_amount;

        if (cUser.marks < bet || tUser.marks < bet) {
            await dbFetch(`duel_challenges?id=eq.${challengeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'expired' }) });
            return sendTg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ <b>موجودی یکی از طرفین کافی نیست، چالش لغو شد.</b>', parse_mode: 'HTML' });
        }

        const cInv = await dbFetch(`user_inventory?user_id=eq.${cUser.user_id}`);
        const tInv = await dbFetch(`user_inventory?user_id=eq.${tUser.user_id}`);
        let cPower = 100, tPower = 100;
        cInv.forEach(i => { if (WEAPONS[i.item_name]) cPower += WEAPONS[i.item_name].damage * i.quantity; });
        tInv.forEach(i => { if (WEAPONS[i.item_name]) tPower += WEAPONS[i.item_name].damage * i.quantity; });

        const challengerWins = cPower >= tPower;
        const winner = challengerWins ? cUser : tUser;
        const loser = challengerWins ? tUser : cUser;

        await dbFetch(`users?user_id=eq.${winner.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: winner.marks + bet }) });
        await dbFetch(`users?user_id=eq.${loser.user_id}`, { method: 'PATCH', body: JSON.stringify({ marks: Math.max(0, loser.marks - bet) }) });
        await dbFetch(`duel_challenges?id=eq.${challengeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) });

        sendTg(token, 'sendMessage', { chat_id: winner.user_id, text: `🏆 <b>شما در نبرد رسمی با ${loser.first_name} پیروز شدید و ${bet} مارک ${MARK_ANIM} بردید!</b>`, parse_mode: 'HTML' }).catch(() => {});
        sendTg(token, 'sendMessage', { chat_id: loser.user_id, text: `💀 <b>شما در نبرد رسمی با ${winner.first_name} شکست خوردید و ${bet} مارک ${MARK_ANIM} باختید!</b>`, parse_mode: 'HTML' }).catch(() => {});

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `⚔️ 🏆 <b>نتیجه نبرد رسمی:</b>\n\n` +
                `👑 <b>برنده:</b> ${winner.first_name}\n` +
                `💀 <b>بازنده:</b> ${loser.first_name}\n` +
                `💰 <b>مبلغ شرط:</b> ${bet} مارک ${MARK_ANIM}`,
            parse_mode: 'HTML'
        });
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

        await addMarksToUser(user, netProfit);
        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
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
        uInv.forEach(i => { if (WEAPONS[i.item_name]) uPower += WEAPONS[i.item_name].damage * i.quantity; });
        tInv.forEach(i => { if (WEAPONS[i.item_name]) tPower += WEAPONS[i.item_name].damage * i.quantity; });

        let isWinner = uPower >= tPower;
        let gain = isWinner ? Math.floor(uPower * 0.02) : Math.floor(uPower * 0.011);

        await addMarksToUser(user, gain);
        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                last_soldier_attack: new Date().toISOString(),
                total_attacks: (user.total_attacks || 0) + 1,
                soldier_wins: (user.soldier_wins || 0) + (isWinner ? 1 : 0),
                soldier_losses: (user.soldier_losses || 0) + (isWinner ? 0 : 1)
            })
        });

        const attackerNotice = `🚨 ⚔️ <b>گزارش درگیری خیابانی!</b> ⚔️ 🚨\n\n` +
            `🎯 <b>قربانی:</b> ${target.first_name}\n` +
            `💎 <b>غنیمت به سرقت رفته:</b> <b>+${gain}</b> مارک ${MARK_ANIM}\n` +
            `وضعیت: ${isWinner ? 'پیروزی کامل 🏆' : 'عقب‌نشینی همراه با غنیمت 🩸'}`;

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

        const currentLvl = user.reichsbank_level || 0;
        const multiplier = REICHSBANK_MULTIPLIERS[currentLvl] || 1;
        const finalRate = baseRate * multiplier;
        const profit = Math.floor((user.bank_balance / 100) * finalRate * hours);

        if (profit > 0) {
            await addMarksToUser(user, profit);
            await dbFetch(`users?user_id=eq.${user.user_id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    last_reichsbank_claim: now.toISOString()
                })
            });
        }

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🏛 👑 <b>به خزانه اصلی رایشس بانک خوش آمدید!</b> 👑 🏛\n\n` +
                `🏦 کل سرمایه موجود در بانک: <b>${user.bank_balance}</b> مارک ${MARK_ANIM}\n` +
                `👑 سطح فعلی رایشس بانک: <b>سطح ${currentLvl}</b> (ضریب سود: <b>${multiplier}x</b>)\n` +
                `📈 نرخ سود ساعتی شما: <b>${finalRate.toFixed(2)}%</b>\n` +
                `💎 سود محاسبه شده (${hours} ساعت): <b>+${profit}</b> مارک ${MARK_ANIM} 🚀\n\n` +
                `✅ <i>مبلغ سود مستقیم به جیب شما واریز شد.</i>`,
            parse_mode: 'HTML'
        });
    }

    // منوی ارتقای سطح رایشس بانک
    if (data === 'upgrade_reichsbank') {
        if ((user.bank_balance || 0) < 6000) {
            return sendTg(token, 'answerCallbackQuery', {
                callback_query_id: cb.id,
                text: '❌ برای ارتقای رایشس بانک باید حداقل 6000 مارک در سپرده بانک داشته باشید!',
                show_alert: true
            });
        }

        const currentLvl = user.reichsbank_level || 0;
        const nextLvl = currentLvl + 1;

        if (nextLvl > 6) {
            return sendTg(token, 'answerCallbackQuery', {
                callback_query_id: cb.id,
                text: '👑 رایشس بانک شما در حداکثر سطح ممکن (سطح 6) قرار دارد!',
                show_alert: true
            });
        }

        const cost = REICHSBANK_UPGRADE_COSTS[nextLvl];
        const nextMultiplier = REICHSBANK_MULTIPLIERS[nextLvl];

        const keyboard = {
            inline_keyboard: [
                [{ text: `🚀 تایید و پرداخت ${cost} مارک از بانک شخصی`, callback_data: withOwner(`confirm_upgrade_reichsbank:${nextLvl}:${cost}`, cb.from.id) }],
                [{ text: '🔥 انصراف ✖️', callback_data: withOwner('cancel', cb.from.id) }]
            ]
        };

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `📈 🏛 <b>ارتقای سطح رایشس بانک:</b>\n\n` +
                `🔹 سطح کنونی: <b>سطح ${currentLvl}</b>\n` +
                `🔹 سطح جدید: <b>سطح ${nextLvl}</b> (سود ساعتی <b>${nextMultiplier} برابر</b> خواهد شد)\n` +
                `💳 هزینه ارتقا: <b>${cost}</b> مارک ${MARK_ANIM} (از سپرده بانک شخصی شما کسر می‌شود)\n\n` +
                `🏛 موجودی سپرده فعلی شما: <b>${user.bank_balance}</b> مارک ${MARK_ANIM}\n\n` +
                `آیا تصمیم به ارتقای سطح داری سرباز؟ ⚡️`,
            reply_markup: keyboard,
            parse_mode: 'HTML'
        });
    }

    // تایید و کسر هزینه ارتقا از بانک شخصی
    if (data.startsWith('confirm_upgrade_reichsbank:')) {
        const [, targetLvlStr, costStr] = data.split(':');
        const targetLvl = parseInt(targetLvlStr);
        const cost = parseInt(costStr);

        if ((user.bank_balance || 0) < 6000) {
            return sendTg(token, 'answerCallbackQuery', {
                callback_query_id: cb.id,
                text: '❌ شرط داشتن حداقل 6000 مارک در رایشس بانک برقرار نیست!',
                show_alert: true
            });
        }

        if ((user.bank_balance || 0) < cost) {
            return sendTg(token, 'answerCallbackQuery', {
                callback_query_id: cb.id,
                text: `💸 موجودی بانک شخصی شما ناکافی است! این ارتقا نیازمند ${cost} مارک در حساب بانکی است.`,
                show_alert: true
            });
        }

        const newBankBalance = user.bank_balance - cost;

        await dbFetch(`users?user_id=eq.${user.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                bank_balance: newBankBalance,
                reichsbank_level: targetLvl
            })
        });

        const newMultiplier = REICHSBANK_MULTIPLIERS[targetLvl];

        return sendTg(token, 'editMessageText', {
            chat_id: chatId,
            message_id: cb.message.message_id,
            text: `🎉 🏛 <b>ارتقای رایشس بانک با موفقیت انجام شد!</b> 🚀\n\n` +
                `👑 سطح جدید: <b>سطح ${targetLvl}</b>\n` +
                `📈 ضریب سود ساعتی شما: <b>${newMultiplier} برابر</b>\n` +
                `💳 هزینه پرداخت‌شده: <b>${cost}</b> مارک ${MARK_ANIM}\n` +
                `🏛 موجودی باقی‌مانده در بانک شخصی: <b>${newBankBalance}</b> مارک ${MARK_ANIM}`,
            parse_mode: 'HTML'
        });
    }
}
