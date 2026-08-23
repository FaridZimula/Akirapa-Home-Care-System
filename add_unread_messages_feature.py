import re

# 1. Update prisma/schema.prisma to add isRead Boolean @default(false) to Message model
schema_path = r"d:\Akirapa System\prisma\schema.prisma"
with open(schema_path, 'r', encoding='utf-8') as f:
    schema_content = f.read()

schema_lf = schema_content.replace('\r\n', '\n')

old_msg_model = """model Message {
  id            String   @id @default(uuid())
  clientId      String   // conversation is scoped to a client - all pod caregivers + linked family share one thread
  senderId      String
  recipientId   String?  // ID of the target recipient/contact for 1-on-1 chats
  encryptedText String?  // AES-256-GCM encrypted text content; null for media-only messages
  mediaUrl      String?  // signed URL for a photo/video/audio attachment
  mediaType     String?  // 'image' | 'video' | 'audio'
  mediaName     String?
  createdAt     DateTime @default(now())"""

new_msg_model = """model Message {
  id            String   @id @default(uuid())
  clientId      String   // conversation is scoped to a client - all pod caregivers + linked family share one thread
  senderId      String
  recipientId   String?  // ID of the target recipient/contact for 1-on-1 chats
  encryptedText String?  // AES-256-GCM encrypted text content; null for media-only messages
  mediaUrl      String?  // signed URL for a photo/video/audio attachment
  mediaType     String?  // 'image' | 'video' | 'audio'
  mediaName     String?
  isRead        Boolean  @default(false)
  createdAt     DateTime @default(now())"""

schema_lf = schema_lf.replace(old_msg_model.replace('\r\n', '\n'), new_msg_model.replace('\r\n', '\n'), 1)
with open(schema_path, 'w', encoding='utf-8', newline='') as f:
    f.write(schema_lf.replace('\n', '\r\n'))

print("SUCCESS: Updated schema.prisma with isRead field on Message model!")

# 2. Update src/app/api/messages/conversations/route.ts to compute unreadCount for each conversation
conv_path = r"d:\Akirapa System\src\app\api\messages\conversations\route.ts"
with open(conv_path, 'r', encoding='utf-8') as f:
    conv_content = f.read()

conv_lf = conv_content.replace('\r\n', '\n')

# We need to compute unreadCount for each conversation item
old_conv_return = "return NextResponse.json({ conversations });"

new_conv_return = """    // Compute unreadCount for each contact
    for (const c of conversations) {
      if (c.contactId) {
        try {
          const unreadCount = await prisma.message.count({
            where: {
              senderId: c.contactId,
              recipientId: sessionUser.id,
              isRead: false,
            },
          });
          c.unreadCount = unreadCount;
        } catch (e) {
          c.unreadCount = 0;
        }
      } else {
        c.unreadCount = 0;
      }
    }

    return NextResponse.json({ conversations });"""

conv_lf = conv_lf.replace(old_conv_return, new_conv_return, 1)
with open(conv_path, 'w', encoding='utf-8', newline='') as f:
    f.write(conv_lf.replace('\n', '\r\n'))

print("SUCCESS: Updated api/messages/conversations/route.ts with unread counts!")

# 3. Update src/app/api/messages/route.ts to mark messages as read on GET thread
msg_path = r"d:\Akirapa System\src\app\api\messages\route.ts"
with open(msg_path, 'r', encoding='utf-8') as f:
    msg_content = f.read()

msg_lf = msg_content.replace('\r\n', '\n')

mark_read_code = """    // Mark unread messages sent to sessionUser as read
    try {
      if (targetId) {
        await prisma.message.updateMany({
          where: {
            senderId: targetId,
            recipientId: sessionUser.id,
            isRead: false,
          },
          data: { isRead: true },
        });
      }
    } catch (e) {
      // Ignore if column migration pending
    }"""

old_msg_fetch = """    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });"""

new_msg_fetch = mark_read_code + "\n\n" + old_msg_fetch
msg_lf = msg_lf.replace(old_msg_fetch.replace('\r\n', '\n'), new_msg_fetch.replace('\r\n', '\n'), 1)

with open(msg_path, 'w', encoding='utf-8', newline='') as f:
    f.write(msg_lf.replace('\n', '\r\n'))

print("SUCCESS: Updated api/messages/route.ts to mark messages as read on thread load!")

# 4. Update src/app/page.tsx to display unreadCount badges on conversation list items and sidebar
page_path = r"d:\Akirapa System\src\app\page.tsx"
with open(page_path, 'r', encoding='utf-8') as f:
    page_content = f.read()

page_lf = page_content.replace('\r\n', '\n')

# Render unread count badge in contact item line 9600
old_badge_span = """                                  {pillLabel && (
                                    <span
                                      className="text-[9px] uppercase px-2.5 py-0.5 rounded-full shrink-0 tracking-wider font-extrabold shadow-2xs"
                                      style={
                                        isSelected
                                          ? { backgroundColor: '#77248c', color: '#ffffff', border: '2px solid #ffffff' }
                                          : badgeType === 'admin'
                                          ? { backgroundColor: '#77248c', color: '#ffffff', border: '1px solid #77248c' }
                                          : { backgroundColor: '#4cdbd5', color: '#ffffff', border: '1px solid #4cdbd5' }
                                      }
                                    >
                                      {pillLabel}
                                    </span>
                                  )}"""

new_badge_span = """                                  {pillLabel && (
                                    <span
                                      className="text-[9px] uppercase px-2.5 py-0.5 rounded-full shrink-0 tracking-wider font-extrabold shadow-2xs"
                                      style={
                                        isSelected
                                          ? { backgroundColor: '#77248c', color: '#ffffff', border: '2px solid #ffffff' }
                                          : badgeType === 'admin'
                                          ? { backgroundColor: '#77248c', color: '#ffffff', border: '1px solid #77248c' }
                                          : { backgroundColor: '#4cdbd5', color: '#ffffff', border: '1px solid #4cdbd5' }
                                      }
                                    >
                                      {pillLabel}
                                    </span>
                                  )}
                                  {Boolean(c.unreadCount && c.unreadCount > 0) && (
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 shadow-xs ${isSelected ? 'bg-white text-red-600' : 'bg-red-500 text-white animate-pulse'}`}>
                                      {c.unreadCount > 9 ? '9+' : c.unreadCount} UNREAD
                                    </span>
                                  )}"""

page_lf = page_lf.replace(old_badge_span.replace('\r\n', '\n'), new_badge_span.replace('\r\n', '\n'), 1)

# Also add unread count badge to Sidebar Messages navigation items
old_nav_messages = """<button onClick={() => { setCurrentView('messages'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'messages' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-comments w-4 text-center"></i> Messages
              </button>"""

new_nav_messages = """<button onClick={() => { setCurrentView('messages'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${currentView === 'messages' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-comments w-4 text-center"></i> Messages
                {messageConversations.some(c => c.unreadCount > 0) && (
                  <span className="ml-auto w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow shrink-0 aspect-square">
                    {messageConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0) > 9 ? '9+' : messageConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)}
                  </span>
                )}
              </button>"""

page_lf = page_lf.replace(old_nav_messages, new_nav_messages)

with open(page_path, 'w', encoding='utf-8', newline='') as f:
    f.write(page_lf.replace('\n', '\r\n'))

print("SUCCESS: Updated page.tsx with unread counts UI!")
