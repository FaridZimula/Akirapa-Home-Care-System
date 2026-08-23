with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = "dbNotifications.filter(n => !n.isRead)"
new = "dbNotifications.filter(n => !n.isRead && n.type !== 'NEW_MESSAGE')"

count = content.count(old)
print(f'Found {count} occurrences to replace')
content = content.replace(old, new)

# Also fix the Mark all read button to only count non-message unread
old2 = "dbNotifications.some(n => !n.isRead)"
new2 = "dbNotifications.some(n => !n.isRead && n.type !== 'NEW_MESSAGE')"
count2 = content.count(old2)
print(f'Found {count2} some() occurrences to replace')
content = content.replace(old2, new2)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done.')
