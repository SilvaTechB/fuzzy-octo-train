// silva.js — Updated with NEW Plugin Manager, MODE system, and enhanced structure
const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;

// ✅ Silva Tech Inc Property 2025
const baileys = require('@whiskeysockets/baileys');
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    isJidGroup,
    isJidBroadcast,
    isJidStatusBroadcast,
    areJidsSameUser,
    makeInMemoryStore,
    downloadContentFromMessage
} = baileys;

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const express = require('express');
const P = require('pino');
const config = require('./config.js');
const store = makeInMemoryStore({ logger: P({ level: 'silent' }) });

const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;

// ✅ Session paths
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// ✅ Create session directory if not exists
function createDirIfNotExist(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
createDirIfNotExist(sessionDir);

// ==========================================
// ✅ FIX 1: NEW PLUGIN MANAGER CLASS
// ==========================================
class PluginManager {
    constructor() {
        this.commandHandlers = new Map();
        this.pluginInfo = new Map();
    }

    async loadPlugins(dir = 'silvaxlab') {
        try {
            const pluginDir = path.join(__dirname, dir);
            
            if (!fs.existsSync(pluginDir)) {
                fs.mkdirSync(pluginDir, { recursive: true });
                logMessage('INFO', `Created plugin directory: ${dir}`);
                return;
            }

            const pluginFiles = fs.readdirSync(pluginDir)
                .filter(file => file.endsWith('.js') && !file.startsWith('_'));

            logMessage('INFO', `Found ${pluginFiles.length} plugin(s) in ${dir}`);

            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(pluginDir, file);
                    delete require.cache[require.resolve(pluginPath)];
                    
                    const pluginModule = require(pluginPath);
                    
                    if (pluginModule && pluginModule.handler && pluginModule.handler.command) {
                        const handler = pluginModule.handler;
                        
                        // Store command handler
                        this.commandHandlers.set(handler.command, handler);
                        
                        // Store plugin info with proper structure
                        this.pluginInfo.set(handler.command.source, {
                            help: handler.help || [],
                            tags: handler.tags || [],
                            group: handler.group || false,
                            admin: handler.admin || false,
                            botAdmin: handler.botAdmin || false,
                            owner: handler.owner || false,
                            filename: file
                        });
                        
                        logMessage('SUCCESS', `✅ Loaded plugin: ${file.replace('.js', '')}`);
                    } else {
                        logMessage('WARNING', `Plugin ${file} has invalid format - missing handler.command`);
                    }
                } catch (error) {
                    logMessage('ERROR', `Failed to load plugin ${file}: ${error.message}`);
                }
            }
            
            logMessage('SUCCESS', `✅ Total plugins loaded: ${this.commandHandlers.size}`);
        } catch (error) {
            logMessage('ERROR', `Plugin loading error: ${error.message}`);
        }
    }

    getCommandList() {
        const commands = [];
        for (const [source, info] of this.pluginInfo) {
            commands.push({
                command: source.replace(/^\^\(|\$/g, '').replace(/\|/g, ',').replace(/\$/g, '').replace(/i\)\$/g, ''),
                help: info.help[0] || 'No description',
                tags: info.tags,
                group: info.group,
                admin: info.admin,
                owner: info.owner,
                botAdmin: info.botAdmin
            });
        }
        return commands;
    }
}

// Initialize Plugin Manager
const plugins = new PluginManager();

// ✅ Load plugins on startup
async function loadPlugins() {
    await plugins.loadPlugins('silvaxlab');
}

// ==========================================
// ✅ Load session from compressed base64
// ==========================================
async function loadSession() {
    try {
        // Remove old session file if exists
        if (fs.existsSync(credsPath)) {
            fs.unlinkSync(credsPath);
            logMessage('INFO', "♻️ ᴏʟᴅ ꜱᴇꜱꜱɪᴏɴ ʀᴇᴍᴏᴠᴇᴅ");
        }

        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            throw new Error("❌ SESSION_ID is missing or invalid");
        }

        const [header, b64data] = config.SESSION_ID.split('~');

        if (header !== "Silva" || !b64data) {
            throw new Error("❌ Invalid session format. Expected 'Silva~.....'");
        }

        // Clean and decode base64
        const cleanB64 = b64data.replace('...', '');
        const compressedData = Buffer.from(cleanB64, 'base64');
        
        // Decompress using zlib
        const decompressedData = zlib.gunzipSync(compressedData);

        // Write the decompressed session data
        fs.writeFileSync(credsPath, decompressedData, "utf8");
        logMessage('SUCCESS', "✅ ɴᴇᴡ ꜱᴇꜱꜱɪᴏɴ ʟᴏᴀᴅᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ");

    } catch (e) {
        logMessage('ERROR', `Session Error: ${e.message}`);
        throw e;
    }
}

// ✅ Message Cache for Anti-Delete
const messageCache = new Map();

// ✅ Message Logger Setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.log`;
}

function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    console.log(logEntry.trim());
    const logFile = path.join(logDir, getLogFileName());
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (e) {
        console.error('Failed writing log:', e.message);
    }
}

// ✅ Global Context Info
const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Silva Tech Nexus ◢◤',
        serverMessageId: 144
    }
};

// ✅ Safe Get User JID
function safeGetUserJid(sock) {
    try {
        return sock.user?.id || null;
    } catch {
        return null;
    }
}

// ✅ Ensure Temp Directory Exists
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
setInterval(() => {
    try {
        fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
    } catch (e) { /* ignore */ }
}, 5 * 60 * 1000);

// ✅ Utility helpers
async function downloadAsBuffer(messageObj, typeHint = 'file') {
    try {
        const stream = await downloadContentFromMessage(messageObj, typeHint);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return buffer;
    } catch (err) {
        logMessage('ERROR', `downloadAsBuffer error: ${err.message}`);
        return null;
    }
}

function isBotMentioned(message, botJid) {
    try {
        const extended = message?.extendedTextMessage;
        if (!extended) return false;
        const mentions = extended.contextInfo?.mentionedJid || [];
        return mentions.includes(botJid);
    } catch (e) {
        return false;
    }
}

// ==========================================
// ✅ FIX 6: Updated generateConfigTable function
// ==========================================
function generateConfigTable() {
    const configs = [
        { name: 'MODE', value: config.MODE },
        { name: 'ANTIDELETE_GROUP', value: config.ANTIDELETE_GROUP },
        { name: 'ANTIDELETE_PRIVATE', value: config.ANTIDELETE_PRIVATE },
        { name: 'AUTO_STATUS_SEEN', value: config.AUTO_STATUS_SEEN },
        { name: 'AUTO_STATUS_REACT', value: config.AUTO_STATUS_REACT },
        { name: 'AUTO_STATUS_REPLY', value: config.AUTO_STATUS_REPLY },
        { name: 'AUTO_REACT_NEWSLETTER', value: config.AUTO_REACT_NEWSLETTER },
        { name: 'ANTI_LINK', value: config.ANTI_LINK },
        { name: 'ALWAYS_ONLINE', value: config.ALWAYS_ONLINE }
        // GROUP_COMMANDS removed!
    ];

    let table = '╔══════════════════════════╦═══════════╗\n';
    table += '║        Config Name       ║   Value   ║\n';
    table += '╠══════════════════════════╬═══════════╣\n';

    for (const c of configs) {
        const paddedName = c.name.padEnd(24, ' ');
        const paddedValue = String(c.value).padEnd(9, ' ');
        table += `║ ${paddedName} ║ ${paddedValue} ║\n`;
    }

    table += '╚══════════════════════════╩═══════════╝';
    return table;
}

// ✅ Fancy Bio Generator
function generateFancyBio() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-KE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const timeStr = now.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const bios = [
        `✨ ${config.BOT_NAME} ✦ Online ✦ ${dateStr} ✦`,
        `⚡ Silva MD Active ✦ ${timeStr} ✦ ${dateStr} ✦`,
        `💫 ${config.BOT_NAME} Operational ✦ ${dateStr} ✦`,
        `🚀 Silva MD Live ✦ ${dateStr} ✦ ${timeStr} ✦`,
        `🌟 ${config.BOT_NAME} Running ✦ ${dateStr} ✦`
    ];

    return bios[Math.floor(Math.random() * bios.length)];
}

// ✅ Modernized Welcome Message
async function sendWelcomeMessage(sock) {
    const configTable = generateConfigTable();
    
    const welcomeMsg = `
*✨ ${config.BOT_NAME} is now active!*

• **Prefix:** \`${prefix}\`
• **Mode:** ${config.MODE}
• **Plugins Loaded:** ${plugins.commandHandlers.size}

*⚙️ Active Configuration:*
\`\`\`
${configTable}
\`\`\`

*📝 Description:*
${config.DESCRIPTION}

_⚡ Powered by Silva Tech Inc._
    `.trim();

    try {
        await sock.sendMessage(sock.user.id, {
            text: welcomeMsg,
            contextInfo: {
                ...globalContextInfo,
                externalAdReply: {
                    title: `${config.BOT_NAME} Online`,
                    body: "Enhanced multi-device WhatsApp bot",
                    thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                    sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        });
        logMessage('SUCCESS', 'Modern welcome message sent to owner.');
    } catch (e) {
        logMessage('WARN', `Welcome message failed: ${e.message}`);
        // Fallback: try sending without the complex ad reply
        try {
            await sock.sendMessage(sock.user.id, { text: `✅ ${config.BOT_NAME} is now online!\nPrefix: ${prefix}` });
        } catch (fallbackErr) {
            logMessage('DEBUG', `Fallback also failed: ${fallbackErr.message}`);
        }
    }
}

// ✅ Update Profile Status
async function updateProfileStatus(sock) {
    try {
        const bio = generateFancyBio();
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        logMessage('ERROR', `❌ Failed to update bio: ${err.message}`);
    }
}

// ✅ Connect to WhatsApp (main)
async function connectToWhatsApp() {
    // Load session from compressed base64
    await loadSession();
    
    // Use the session directory for multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const cryptoOptions = {
        maxSharedKeys: 1000,
        sessionThreshold: 0,
        cache: {
            TRANSACTION: false,
            PRE_KEYS: false
        }
    };

    const sock = makeWASocket({
        logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth: state,
        version,
        markOnlineOnConnect: config.ALWAYS_ONLINE,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
        ...cryptoOptions
    });

    // bind the store so store.loadMessage works
    try {
        store.bind(sock.ev);
    } catch (e) {
        logMessage('WARN', `store.bind failed: ${e.message}`);
    }

    // connection update
    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            logMessage('WARN', `Connection closed: ${lastDisconnect?.error?.output?.statusCode || 'Unknown'}`);
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                logMessage('INFO', 'Reconnecting...');
                setTimeout(() => connectToWhatsApp(), 2000);
            }
        } else if (connection === 'open') {
            logMessage('SUCCESS', '✅ Connected to WhatsApp');

            // Load plugins after connection
            await loadPlugins();
            
            // store bot jid for mention detection
            global.botJid = sock.user.id;

            // Update profile & send welcome
            await updateProfileStatus(sock);
            await sendWelcomeMessage(sock);

            // ✅ Follow configured newsletter IDs
            const newsletterIds = config.NEWSLETTER_IDS || [
                '120363276154401733@newsletter',
                '120363200367779016@newsletter',
                '120363199904258143@newsletter',
                '120363422731708290@newsletter'
            ];
            for (const jid of newsletterIds) {
                try {
                    if (typeof sock.newsletterFollow === 'function') {
                        await sock.newsletterFollow(jid);
                        logMessage('SUCCESS', `✅ Followed newsletter ${jid}`);
                    } else {
                        logMessage('DEBUG', `newsletterFollow not available in this Baileys version`);
                    }
                } catch (err) {
                    logMessage('ERROR', `Failed to follow newsletter ${jid}: ${err.message}`);
                }
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ✅ Cache messages for anti-delete
    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!Array.isArray(messages)) return;
        
        for (const m of messages) {
            if (!m.message || !m.key.id) continue;
            
            const cacheKey = `${m.key.remoteJid}-${m.key.id}`;
            messageCache.set(cacheKey, {
                message: m.message,
                timestamp: Date.now()
            });
        }
        
        // Clean old cache entries (older than 1 hour)
        const now = Date.now();
        for (const [key, value] of messageCache.entries()) {
            if (now - value.timestamp > 60 * 60 * 1000) { // 1 hour
                messageCache.delete(key);
            }
        }
    });

    // ✅ Anti-delete handler (messages.update)
    sock.ev.on("messages.update", async (updates) => {
        for (const { key, update } of updates) {
            if (key.remoteJid === "status@broadcast") continue;
            if (update?.message === null && !key.fromMe) {
                const cacheKey = `${key.remoteJid}-${key.id}`;
                const original = messageCache.get(cacheKey);
                const owner = safeGetUserJid(sock);

                if (!original?.message || !owner) continue;
                
                sock.sendMessage(owner, {
                    text: `🚨 *Anti-Delete* — Message recovered from ${key.participant || key.remoteJid}`,
                    contextInfo: globalContextInfo
                }).catch(() => {});

                const msgObj = original.message;
                const mType = Object.keys(msgObj)[0];

                try {
                    if (["conversation", "extendedTextMessage"].includes(mType)) {
                        const text = msgObj.conversation || msgObj.extendedTextMessage?.text;
                        await sock.sendMessage(owner, { text, contextInfo: globalContextInfo });
                    } else if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(mType)) {
                        const stream = await downloadContentFromMessage(msgObj[mType], mType.replace("Message", ""));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const field = mType.replace("Message", "");
                        const payload = { [field]: buffer, contextInfo: globalContextInfo };
                        if (msgObj[mType]?.caption) payload.caption = msgObj[mType].caption;
                        await sock.sendMessage(owner, payload);
                    }
                } catch (err) {
                    logMessage("DEBUG", `Recovery failed: ${err.message}`);
                }
            }
        }
    });

    // Anti-delete handler (messages.delete)
    sock.ev.on('messages.delete', async (item) => {
        try {
            logMessage('DEBUG', 'messages.delete triggered');
            const keys = Array.isArray(item) ? item.map(i => i.key) : (item?.keys || []);
            for (const key of keys) {
                const from = key.remoteJid;
                const isGroup = from?.endsWith?.('@g.us');
                if ((isGroup && !config.ANTIDELETE_GROUP) || (!isGroup && !config.ANTIDELETE_PRIVATE)) {
                    logMessage('DEBUG', `Anti-delete disabled for ${isGroup ? 'group' : 'private'}`);
                    continue;
                }

                const deletedMsg = await store.loadMessage(from, key.id);
                if (!deletedMsg) {
                    logMessage('WARN', `No stored message found for ${key.id}`);
                    continue;
                }

                const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const sender = key.participant || from;
                const senderName = (sender || '').split('@')[0];
                const msg = deletedMsg.message;
                const msgType = Object.keys(msg)[0];

                const caption = `⚠️ *Anti-Delete Alert!*\n\n👤 *Sender:* @${senderName}\n*Chat:* ${isGroup ? 'Group' : 'Private'}\n\n💬 *Restored Message:*`;
                const opts = { contextInfo: { mentionedJid: [sender] } };
                const targetJid = config.ANTIDELETE_SEND_TO_ORIGINAL ? from : ownerJid;

                switch (msgType) {
                    case 'conversation':
                        await sock.sendMessage(targetJid, { text: `${caption}\n\n${msg.conversation}`, ...opts });
                        break;
                    case 'extendedTextMessage':
                        await sock.sendMessage(targetJid, { text: `${caption}\n\n${msg.extendedTextMessage.text}`, ...opts });
                        break;
                    case 'imageMessage': {
                        const buffer = await downloadAsBuffer(msg.imageMessage, 'image');
                        if (buffer) await sock.sendMessage(targetJid, { image: buffer, caption: `${caption}\n\n${msg.imageMessage.caption || ''}`, ...opts });
                        break;
                    }
                    case 'videoMessage': {
                        const buffer = await downloadAsBuffer(msg.videoMessage, 'video');
                        if (buffer) await sock.sendMessage(targetJid, { video: buffer, caption: `${caption}\n\n${msg.videoMessage.caption || ''}`, ...opts });
                        break;
                    }
                    case 'documentMessage': {
                        const buffer = await downloadAsBuffer(msg.documentMessage, 'document');
                        if (buffer) await sock.sendMessage(targetJid, {
                            document: buffer,
                            mimetype: msg.documentMessage.mimetype,
                            fileName: msg.documentMessage.fileName || 'Restored-File',
                            caption,
                            ...opts
                        });
                        break;
                    }
                    default:
                        await sock.sendMessage(targetJid, { text: `${caption}\n\n[Unsupported Message Type: ${msgType}]`, ...opts });
                        break;
                }

                logMessage('SUCCESS', `Restored deleted message from ${senderName}`);
            }
        } catch (err) {
            logMessage('ERROR', `Anti-Delete Error: ${err.stack || err.message}`);
        }
    });

    // Status saver dir
    const statusSaverDir = path.join(__dirname, 'status_saver');
    if (!fs.existsSync(statusSaverDir)) fs.mkdirSync(statusSaverDir, { recursive: true });

    async function saveMedia(message, msgType, sockLocal, caption) {
        try {
            const stream = await downloadContentFromMessage(
                message.message[msgType],
                msgType.replace('Message', '')
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const extMap = {
                imageMessage: 'jpg',
                videoMessage: 'mp4',
                audioMessage: 'ogg'
            };

            const filename = `${Date.now()}.${extMap[msgType]}`;
            const filePath = path.join(statusSaverDir, filename);
            fs.writeFileSync(filePath, buffer);

            const selfJid = sockLocal.user.id.includes(':') ? `${sockLocal.user.id.split(':')[0]}@s.whatsapp.net` : sockLocal.user.id;

            await sockLocal.sendMessage(selfJid, {
                [msgType.replace('Message', '')]: { url: filePath },
                caption: caption,
                mimetype: message.message[msgType].mimetype
            });
            return true;
        } catch (error) {
            logMessage('ERROR', `Media Save Error: ${error.message}`);
            return false;
        }
    }

    function unwrapStatus(msg) {
        const inner =
            msg.message?.viewOnceMessageV2?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message || {};
        const msgType = Object.keys(inner)[0] || '';
        return { inner, msgType };
    }

    // === MAIN MESSAGE HANDLER ===
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (!Array.isArray(messages) || messages.length === 0) return;

            // Process only real-time messages
            if (type && !['notify', 'append'].includes(type)) {
                logMessage('DEBUG', `Skipping message type: ${type}`);
                return;
            }

            for (const m of messages) {
                // ---- STATUS handling (status@broadcast)
                if (m.key.remoteJid === 'status@broadcast') {
                    try {
                        const statusId = m.key.id;
                        const userJid = m.key.participant;
                        logMessage('EVENT', `Status update from ${userJid}: ${statusId}`);

                        const { inner, msgType } = unwrapStatus(m);

                        if (config.AUTO_STATUS_SEEN) {
                            try {
                                await sock.readMessages([m.key]);
                                logMessage('INFO', `Status seen: ${statusId}`);
                            } catch (e) {
                                logMessage('WARN', `Status seen failed: ${e.message}`);
                            }
                        }

                        if (config.AUTO_STATUS_REACT) {
                            try {
                                const emojis = (config.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏').split(',');
                                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)].trim();
                                await sock.sendMessage(userJid, {
                                    react: {
                                        text: randomEmoji,
                                        key: {
                                            remoteJid: 'status@broadcast',
                                            id: statusId,
                                            participant: userJid
                                        }
                                    }
                                });
                                logMessage('INFO', `Reacted on status ${statusId} with: ${randomEmoji}`);
                            } catch (e) {
                                logMessage('WARN', `Status reaction failed: ${e.message}`);
                            }
                        }

                        if (config.AUTO_STATUS_REPLY) {
                            try {
                                await sock.sendMessage(userJid, {
                                    text: config.AUTO_STATUS_MSG,
                                    contextInfo: {
                                        stanzaId: statusId,
                                        participant: userJid,
                                        quotedMessage: inner
                                    }
                                });
                                logMessage('INFO', `Status replied: ${statusId}`);
                            } catch (e) {
                                logMessage('WARN', `Status reply failed: ${e.message}`);
                            }
                        }

                        if (config.Status_Saver === 'true') {
                            try {
                                const userName = await sock.getName(userJid) || 'Unknown';
                                const statusHeader = 'AUTO STATUS SAVER';
                                let caption = `${statusHeader}\n\n*🩵 Status From:* ${userName}`;

                                switch (msgType) {
                                    case 'imageMessage':
                                    case 'videoMessage':
                                        if (inner[msgType]?.caption) caption += `\n*🩵 Caption:* ${inner[msgType].caption}`;
                                        await saveMedia({ message: inner }, msgType, sock, caption);
                                        break;
                                    case 'audioMessage':
                                        caption += `\n*🩵 Audio Status*`;
                                        await saveMedia({ message: inner }, msgType, sock, caption);
                                        break;
                                    case 'extendedTextMessage':
                                        caption = `${statusHeader}\n\n${inner.extendedTextMessage?.text || ''}`;
                                        await sock.sendMessage(sock.user.id, { text: caption });
                                        break;
                                    default:
                                        logMessage('WARN', `Unsupported status type: ${msgType}`);
                                        break;
                                }

                                if (config.STATUS_REPLY === 'true') {
                                    const replyMsg = config.STATUS_MSG || 'SILVA MD 💖 SUCCESSFULLY VIEWED YOUR STATUS';
                                    await sock.sendMessage(userJid, { text: replyMsg });
                                }
                                logMessage('INFO', `Status saved: ${statusId}`);
                            } catch (e) {
                                logMessage('ERROR', `Status save failed: ${e.message}`);
                            }
                        }
                    } catch (e) {
                        logMessage('ERROR', `Status handler error: ${e.message}`);
                    }
                    continue;
                }

                // ---- For other messages
                if (!m.message) continue;

                const sender = m.key.remoteJid;
                const isGroupMsg = isJidGroup(sender);
                const isNewsletter = sender && sender.endsWith && sender.endsWith('@newsletter');
                const isBroadcast = isJidBroadcast(sender) || isJidStatusBroadcast(sender);

                logMessage('MESSAGE', `New ${isNewsletter ? 'newsletter' : isGroupMsg ? 'group' : isBroadcast ? 'broadcast' : 'private'} message from ${sender}`);

                // Auto-react to newsletters
                if (isNewsletter && config.AUTO_REACT_NEWSLETTER) {
                    try {
                        const emojis = ['🤖','🔥','💫','❤️','👍','💯','✨','👏','😎'];
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await sock.sendMessage(m.key.remoteJid, {
                            react: { text: randomEmoji, key: m.key }
                        });
                        logMessage('INFO', `Auto-reacted with ${randomEmoji} to ${m.key.remoteJid}`);
                    } catch (e) {
                        logMessage('ERROR', `Newsletter react failed: ${e.stack || e.message}`);
                    }
                }

                // ==========================================
                // ✅ FIX 2: MODE CHECK + MESSAGE PARSING
                // ==========================================
                const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const isOwner = sender === ownerJid || m.key.fromMe;

                // Private mode: only owner can use commands (in groups AND private chats)
                if (config.MODE === 'private' && !isOwner) {
                    logMessage('DEBUG', `Private mode: Non-owner (${sender}) message ignored.`);
                    continue;
                }

                // Public mode: everyone can use commands everywhere (groups + private)
                // No additional checks needed!

                // Extract text content for command parsing
                const messageType = Object.keys(m.message)[0];
                let content = '';
                let isMentioned = false;

                if (messageType === 'conversation') {
                    content = m.message.conversation || '';
                } else if (messageType === 'extendedTextMessage') {
                    content = m.message.extendedTextMessage.text || '';
                    if (isGroupMsg && global.botJid) isMentioned = isBotMentioned(m.message, global.botJid);
                } else if (messageType === 'imageMessage') {
                    content = m.message.imageMessage.caption || '';
                } else if (messageType === 'videoMessage') {
                    content = m.message.videoMessage.caption || '';
                } else if (messageType === 'documentMessage') {
                    content = m.message.documentMessage.caption || '';
                } else {
                    // other types not supported for commands
                    continue;
                }

                logMessage('DEBUG', `Message content: ${content.substring(0, 100)}`);

                // ✅ TREAT GROUPS LIKE PRIVATE MESSAGES - Only check for prefix
                let isForBot = content.startsWith(prefix);

                if (!isForBot) {
                    logMessage('DEBUG', 'Message not for bot, ignoring.');
                    continue;
                }

                // extract command and args
                const commandText = content.startsWith(prefix) ? content.slice(prefix.length).trim() : content.trim();
                const [cmd, ...args] = commandText.split(/\s+/);
                const command = (cmd || '').toLowerCase();

                logMessage('COMMAND', `Detected command: ${command} | Args: ${args.join(' ')}`);

                if (config.READ_MESSAGE) {
                    try { await sock.readMessages([m.key]); } catch (e) { /* ignore */ }
                }

                // CORE commands
                if (command === 'ping') {
                    const latency = m.messageTimestamp ? new Date().getTime() - m.messageTimestamp * 1000 : 0;
                    await sock.sendMessage(sender, {
                        text: `🏓 *Pong!* ${latency} ms ${config.BOT_NAME} is live!`,
                        contextInfo: {
                            ...globalContextInfo,
                            externalAdReply: {
                                title: `${config.BOT_NAME} speed`,
                                body: "Explore the speed",
                                thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                                sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: m });
                    continue;
                }

                // ==========================================
                // ✅ FIX 3: MODE COMMAND
                // ==========================================
                if (command === 'mode') {
                    if (!isOwner) {
                        await sock.sendMessage(sender, { text: '❌ Owner only command!' }, { quoted: m });
                        continue;
                    }
                    
                    const newMode = args[0]?.toLowerCase();
                    if (!newMode || !['private', 'public'].includes(newMode)) {
                        await sock.sendMessage(sender, { 
                            text: `📊 *Current MODE:* ${config.MODE}\n\n` +
                                  `*Usage:* ${prefix}mode <private|public>\n\n` +
                                  `• *private* - Only owner can use bot\n` +
                                  `• *public* - Everyone can use bot`,
                            contextInfo: globalContextInfo
                        }, { quoted: m });
                        continue;
                    }
                    
                    config.MODE = newMode;
                    await sock.sendMessage(sender, { 
                        text: `✅ Bot MODE changed to: *${newMode.toUpperCase()}*\n\n` +
                              `${newMode === 'private' ? '🔒 Only you can use the bot now.' : '🌍 Everyone can use the bot now.'}`,
                        contextInfo: globalContextInfo
                    }, { quoted: m });
                    continue;
                }

                if (command === 'resetsession') {
                    if (!isOwner) {
                        await sock.sendMessage(sender, { text: '❌ Owner only command!' }, { quoted: m });
                        continue;
                    }
                    if (isGroupMsg) {
                        await sock.sendMessage(sender, {
                            protocolMessage: { senderKeyDistributionMessage: { groupId: sender } }
                        });
                        await sock.sendMessage(sender, { text: '✅ Group session reset initiated!' }, { quoted: m });
                    } else {
                        await sock.sendMessage(sender, { text: '✅ Session reset!' }, { quoted: m });
                    }
                    continue;
                }

                if (command === 'alive') {
                    await sock.sendMessage(sender, {
                        image: { url: config.ALIVE_IMG },
                        caption: config.LIVE_MSG,
                        contextInfo: globalContextInfo
                    }, { quoted: m });
                    continue;
                }

                // ==========================================
                // ✅ FIX 4: UPDATED MENU COMMAND
                // ==========================================
                if (command === 'menu') {
                    const coreCommands = ['ping', 'alive', 'menu', 'mode', 'resetsession'];
                    const pluginCommands = plugins.getCommandList();
                    
                    let menuText = `*✦ ${config.BOT_NAME} ✦ Command Menu*

• *Prefix:* \`${prefix}\`
• *Mode:* ${config.MODE.toUpperCase()} ${config.MODE === 'private' ? '🔒' : '🌍'}
• *Plugins Loaded:* ${plugins.commandHandlers.size}

*📋 Core Commands:*
${coreCommands.map(c => `• ${prefix}${c}`).join('\n')}
`;

                    if (pluginCommands.length > 0) {
                        menuText += `\n*🔌 Plugin Commands:*\n`;
                        
                        // Group by tags
                        const grouped = {};
                        for (const cmd of pluginCommands) {
                            const tag = cmd.tags[0] || 'misc';
                            if (!grouped[tag]) grouped[tag] = [];
                            
                            let cmdStr = `• ${prefix}${cmd.command}`;
                            if (cmd.owner) cmdStr += ' 👑';
                            if (cmd.admin) cmdStr += ' 👮';
                            if (cmd.group) cmdStr += ' 👥';
                            cmdStr += ` - ${cmd.help}`;
                            
                            grouped[tag].push(cmdStr);
                        }
                        
                        for (const [tag, cmds] of Object.entries(grouped)) {
                            menuText += `\n*${tag.toUpperCase()}:*\n${cmds.join('\n')}\n`;
                        }
                    }

                    menuText += `\n⚡ *Total Commands:* ${coreCommands.length + pluginCommands.length}

${config.MODE === 'private' ? '🔒 *Private Mode:* Only owner can use bot' : '🌍 *Public Mode:* Everyone can use bot'}

*Legend:*
👑 = Owner only
👮 = Admin only  
👥 = Group only

✨ ${config.DESCRIPTION}`;

                    await sock.sendMessage(sender, {
                        image: { url: 'https://files.catbox.moe/5uli5p.jpeg' },
                        caption: menuText,
                        contextInfo: {
                            ...globalContextInfo,
                            externalAdReply: {
                                title: `${config.BOT_NAME} Menu`,
                                body: "Explore all available commands",
                                thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                                sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: m });
                    continue;
                }

                // ==========================================
                // ✅ FIX 5: NEW PLUGIN COMMANDS HANDLING
                // ==========================================
                let pluginFound = false;
                for (const [cmdRegex, handler] of plugins.commandHandlers.entries()) {
                    const firstWord = command;
                    if (cmdRegex.test(firstWord)) {
                        pluginFound = true;
                        
                        // Get plugin info
                        const pluginInfo = plugins.pluginInfo.get(cmdRegex.source);
                        
                        try {
                            // Check owner permission
                            if (pluginInfo?.owner && !isOwner) {
                                await sock.sendMessage(sender, { 
                                    text: '👑 Owner only command',
                                    contextInfo: globalContextInfo 
                                }, { quoted: m });
                                break;
                            }
                            
                            // Check group only
                            if (pluginInfo?.group && !isGroupMsg) {
                                await sock.sendMessage(sender, { 
                                    text: '👥 Group only command',
                                    contextInfo: globalContextInfo 
                                }, { quoted: m });
                                break;
                            }
                            
                            // Check admin permission
                            if (pluginInfo?.admin && isGroupMsg) {
                                try {
                                    const metadata = await sock.groupMetadata(sender);
                                    const userParticipant = metadata.participants.find(p => p.id === (m.key.participant || sender));
                                    if (!userParticipant || (!userParticipant.admin && !userParticipant.superAdmin)) {
                                        await sock.sendMessage(sender, { 
                                            text: '👮 Admin required',
                                            contextInfo: globalContextInfo 
                                        }, { quoted: m });
                                        break;
                                    }
                                } catch (e) {
                                    logMessage('WARN', `Admin check failed: ${e.message}`);
                                }
                            }
                            
                            // Check bot admin permission
                            if (pluginInfo?.botAdmin && isGroupMsg) {
                                try {
                                    const metadata = await sock.groupMetadata(sender);
                                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                                    const botParticipant = metadata.participants.find(p => p.id === botJid);
                                    if (!botParticipant || (!botParticipant.admin && !botParticipant.superAdmin)) {
                                        await sock.sendMessage(sender, { 
                                            text: '🤖 Bot needs admin rights',
                                            contextInfo: globalContextInfo 
                                        }, { quoted: m });
                                        break;
                                    }
                                } catch (e) {
                                    logMessage('WARN', `Bot admin check failed: ${e.message}`);
                                }
                            }

                            logMessage('PLUGIN', `Executing plugin command: ${command}`);
                            
                            // Execute with context structure
                            await handler.execute({
                                text: commandText,
                                jid: sender,
                                sender: m.key.participant || sender,
                                isGroup: isGroupMsg,
                                message: m,
                                sock: sock,
                                args: args,
                                command: command,
                                prefix: prefix,
                                isOwner: isOwner,
                                contextInfo: globalContextInfo,
                                pluginInfo: pluginInfo
                            });
                            
                            logMessage('SUCCESS', `Plugin executed: ${command}`);
                        } catch (err) {
                            logMessage('ERROR', `❌ Plugin "${command}" failed: ${err.message}`);
                            logMessage('ERROR', `   Stack: ${err.stack || 'No stack trace'}`);
                            logMessage('ERROR', `   File: ${pluginInfo?.filename || 'unknown'}`);
                            
                            try {
                                await sock.sendMessage(sender, {
                                    text: `❌ Command "${command}" failed.\n\n*Error:* ${err.message}`,
                                    contextInfo: globalContextInfo
                                }, { quoted: m });
                            } catch (sendErr) {
                                logMessage('WARN', `Could not send error message: ${sendErr.message}`);
                            }
                        }
                        break;
                    }
                }

                if (!pluginFound) {
                    logMessage('WARN', `Command not found: ${command}`);
                }
            }
        } catch (err) {
            logMessage('ERROR', `messages.upsert handler error: ${err.stack || err.message}`);
        }
    });

    return sock;
}

// ✅ Express Web API
const app = express();
app.use(express.static(path.join(__dirname, 'smm')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'smm', 'silva.html')));
app.get('/health', (req, res) => res.send(`✅ ${config.BOT_NAME} is Running!`));

app.listen(port, () => {
    logMessage('INFO', `🌐 Server running on port ${port}`);
    logMessage('INFO', `📊 Dashboard available at http://localhost:${port}`);
});

// ✅ Error handling
process.on('uncaughtException', (err) => {
    logMessage('CRITICAL', `Uncaught Exception: ${err.stack || err.message}`);
    setTimeout(() => connectToWhatsApp(), 5000);
});
process.on('unhandledRejection', (reason, promise) => {
    logMessage('CRITICAL', `Unhandled Rejection: ${reason} at ${promise}`);
});

// ✅ Boot Bot
(async () => {
    try {
        logMessage('INFO', 'Booting Silva MD Bot...');
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack || e.message}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})();
