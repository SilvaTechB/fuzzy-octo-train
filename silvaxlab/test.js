// silvaxlab/test.js - Testing plugin for the new system
module.exports = {
    handler: {
        command: /^(test|demo)$/i,  // RegEx for command matching
        help: ['Shows a test message', 'Usage: .test <optional text>'],
        tags: ['fun', 'utility'],
        group: false,      // true = group only
        admin: false,      // true = admin only
        botAdmin: false,   // true = bot needs admin
        owner: false,      // true = owner only
        
        execute: async (context) => {
            const { sock, message, jid, sender, args, contextInfo, isOwner, command, prefix } = context;
            
            const testMessage = `
✅ *Test Command Executed Successfully!*

• *Command:* ${command}
• *Arguments:* ${args.join(' ') || 'None'}
• *Sender:* ${sender.split('@')[0]}
• *Is Owner:* ${isOwner ? 'Yes 👑' : 'No'}
• *Time:* ${new Date().toLocaleTimeString()}

*Plugin System:* Working perfectly! 🚀

Try other commands:
${prefix}menu - Show all commands
${prefix}ping - Check bot latency
${prefix}mode - Change bot mode
            `.trim();
            
            await sock.sendMessage(jid, {
                text: testMessage,
                contextInfo: contextInfo
            }, { quoted: message });
        }
    }
};
