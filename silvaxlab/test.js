// silvaxlab/grouptest.js - Test plugin for groups
module.exports = {
    handler: {
        command: /^(grouptest|gt)$/i,
        help: ['Group test command - works in groups'],
        tags: ['group', 'test'],
        group: true,      // Group only
        admin: false,     // Doesn't require admin
        botAdmin: false,  // Bot doesn't need admin
        owner: false,     // Not owner only
        
        execute: async (context) => {
            const { sock, message, jid, sender, args, isGroup, isOwner } = context;
            
            const metadata = await sock.groupMetadata(jid);
            const groupName = metadata.subject || 'Unknown Group';
            const participants = metadata.participants.length;
            
            const groupMessage = `
👥 *Group Test Command*

• *Group:* ${groupName}
• *Participants:* ${participants}
• *Sender:* ${sender.split('@')[0]}
• *Is Owner:* ${isOwner ? 'Yes 👑' : 'No'}
• *Bot Status:* Active in groups

*Session Features:*
- Auto session recovery
- Group message support
- Permission checks
            `.trim();
            
            await sock.sendMessage(jid, {
                text: groupMessage,
                contextInfo: {
                    ...context.contextInfo,
                    mentionedJid: [sender]
                }
            }, { quoted: message });
        }
    }
};
