file_path = r"d:\Akirapa System\src\app\page.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content_lf = content.replace('\r\n', '\n')

# ─── 1. Add "Care Updates" nav tab in family sidebar (after Documents button) ───
old_family_nav = """              <button onClick={() => { setCurrentView('purchases'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'purchases' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-file-invoice w-4 text-center"></i> Documents
              </button>"""

new_family_nav = """              <button onClick={() => { setCurrentView('purchases'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'purchases' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-file-invoice w-4 text-center"></i> Documents
              </button>
              <button onClick={() => { setCurrentView('care_updates'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${currentView === 'care_updates' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-bell-concierge w-4 text-center"></i> Care Updates
                {dbNotifications.filter(n => !n.isRead).length > 0 && (
                  <span className="ml-auto w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow shrink-0">
                    {dbNotifications.filter(n => !n.isRead).length > 9 ? '9+' : dbNotifications.filter(n => !n.isRead).length}
                  </span>
                )}
              </button>"""

content_lf = content_lf.replace(old_family_nav, new_family_nav, 1)

# ─── 2. Add "Care Updates" page title in the top bar ───
old_title_section = "              {currentView === 'messages' && 'Messages'}"
new_title_section = """              {currentView === 'messages' && 'Messages'}
              {currentView === 'care_updates' && 'Care Updates'}"""

content_lf = content_lf.replace(old_title_section, new_title_section, 1)

# ─── 3. Inject the Care Updates view before the closing of the listings/shifts block ───
# We insert it just before the Admin/Caregiver shifts list guard
care_updates_view = """
              {/* ===== CARE UPDATES VIEW (Family Members) ===== */}
              {currentView === 'care_updates' && user.role === 'FAMILY_MEMBER' && (
                <div className="space-y-6 max-w-3xl mx-auto">
                  {/* Header Banner */}
                  <div className="bg-[#77248c] rounded-3xl p-6 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 text-white flex items-center justify-center text-2xl shadow-inner shrink-0 aspect-square">
                      <i className="fa-solid fa-bell-concierge text-white"></i>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-extrabold text-xl text-white">Care Updates</h3>
                      <p className="text-xs text-purple-100 mt-0.5">Real-time alerts, caregiver assignments, shift updates, and emergency notices for your loved one's care.</p>
                    </div>
                    {dbNotifications.filter(n => !n.isRead).length > 0 && (
                      <button
                        onClick={handleMarkAllNotificationsRead}
                        className="shrink-0 px-4 py-2.5 bg-white text-[#77248c] font-bold text-xs rounded-xl shadow-xs hover:bg-purple-50 transition-all cursor-pointer"
                      >
                        <i className="fa-solid fa-check-double mr-1.5"></i> Mark All Read
                      </button>
                    )}
                  </div>

                  {/* Unread Count Badge */}
                  {dbNotifications.filter(n => !n.isRead).length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 flex items-center gap-3 shadow-xs">
                      <div className="w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center shrink-0 aspect-square shadow-xs">
                        <i className="fa-solid fa-bell text-sm"></i>
                      </div>
                      <div>
                        <span className="font-bold text-amber-800 text-sm">
                          {dbNotifications.filter(n => !n.isRead).length} unread update{dbNotifications.filter(n => !n.isRead).length !== 1 ? 's' : ''}
                        </span>
                        <p className="text-xs text-amber-600">Tap any update to mark it as read.</p>
                      </div>
                    </div>
                  )}

                  {/* Notification Feed */}
                  {dbNotifications.length === 0 ? (
                    <div className="bg-white border border-gray-100 rounded-3xl shadow-xs p-12 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-300 flex items-center justify-center text-3xl mx-auto shrink-0 aspect-square">
                        <i className="fa-solid fa-bell-slash"></i>
                      </div>
                      <p className="font-bold text-gray-500 text-sm">No care updates yet</p>
                      <p className="text-xs text-gray-400">You'll be notified here when caregivers are assigned, shifts change, or there are any care alerts for your loved one.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dbNotifications.map((notif: any) => {
                        const isUnread = !notif.isRead;
                        const createdAt = new Date(notif.createdAt);

                        // Determine notification category & icon
                        const msg = (notif.message || notif.title || '').toLowerCase();
                        let iconClass = 'fa-solid fa-bell';
                        let iconBg = 'bg-[#77248c]';
                        let categoryLabel = 'Update';
                        let categoryColor = 'text-[#77248c]';
                        let badgeBg = 'bg-purple-100 text-purple-700';

                        if (msg.includes('assign') || msg.includes('caregiver')) {
                          iconClass = 'fa-solid fa-user-nurse';
                          iconBg = 'bg-teal-500';
                          categoryLabel = 'Caregiver Assignment';
                          categoryColor = 'text-teal-700';
                          badgeBg = 'bg-teal-100 text-teal-700';
                        } else if (msg.includes('emergency') || msg.includes('urgent') || msg.includes('alert')) {
                          iconClass = 'fa-solid fa-triangle-exclamation';
                          iconBg = 'bg-red-500';
                          categoryLabel = 'Emergency Alert';
                          categoryColor = 'text-red-700';
                          badgeBg = 'bg-red-100 text-red-700';
                        } else if (msg.includes('shift') || msg.includes('schedule') || msg.includes('start') || msg.includes('end')) {
                          iconClass = 'fa-solid fa-calendar-check';
                          iconBg = 'bg-blue-500';
                          categoryLabel = 'Shift Update';
                          categoryColor = 'text-blue-700';
                          badgeBg = 'bg-blue-100 text-blue-700';
                        } else if (msg.includes('complet') || msg.includes('finish')) {
                          iconClass = 'fa-solid fa-circle-check';
                          iconBg = 'bg-emerald-500';
                          categoryLabel = 'Care Completed';
                          categoryColor = 'text-emerald-700';
                          badgeBg = 'bg-emerald-100 text-emerald-700';
                        } else if (msg.includes('message') || msg.includes('note') || msg.includes('update')) {
                          iconClass = 'fa-solid fa-comment-medical';
                          iconBg = 'bg-[#4cdbd5]';
                          categoryLabel = 'Care Note';
                          categoryColor = 'text-teal-700';
                          badgeBg = 'bg-teal-100 text-teal-700';
                        }

                        return (
                          <div
                            key={notif.id}
                            onClick={() => handleMarkNotificationRead(notif.id)}
                            className={`bg-white border rounded-2xl p-4 shadow-xs cursor-pointer transition-all hover:shadow-md group ${isUnread ? 'border-l-4 border-l-[#77248c] border-gray-100' : 'border-gray-100'}`}
                          >
                            <div className="flex items-start gap-3.5">
                              {/* Icon */}
                              <div className={`w-10 h-10 rounded-xl ${iconBg} text-white flex items-center justify-center shrink-0 aspect-square shadow-xs mt-0.5`}>
                                <i className={`${iconClass} text-sm text-white`}></i>
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeBg}`}>
                                    {categoryLabel}
                                  </span>
                                  {isUnread && (
                                    <span className="w-2 h-2 rounded-full bg-red-500 shadow animate-pulse shrink-0"></span>
                                  )}
                                </div>
                                <p className={`text-sm font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-600'} leading-snug`}>
                                  {notif.message || notif.title || 'Care update received'}
                                </p>
                                <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
                                  <span className="flex items-center gap-1">
                                    <i className="fa-regular fa-clock text-gray-300"></i>
                                    {createdAt.toLocaleString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      timeZoneName: 'short',
                                    })}
                                  </span>
                                  {isUnread && (
                                    <span className="text-[#77248c] font-semibold flex items-center gap-1">
                                      <i className="fa-solid fa-hand-pointer text-[10px]"></i> Tap to mark read
                                    </span>
                                  )}
                                  {!isUnread && (
                                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                                      <i className="fa-solid fa-circle-check text-[10px]"></i> Read
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer note */}
                  <p className="text-center text-[11px] text-gray-400 pb-4">
                    <i className="fa-solid fa-shield-halved mr-1 text-purple-300"></i>
                    All care updates are securely delivered to your portal. For emergencies, always call 911.
                  </p>
                </div>
              )}

"""

# Insert the care_updates view block just before the listings view block
old_listings_marker = "              {/* ===== LISTINGS / SHIFTS VIEW ===== */}"
content_lf = content_lf.replace(old_listings_marker, care_updates_view + "              {/* ===== LISTINGS / SHIFTS VIEW ===== */}", 1)

updated = content_lf.replace('\n', '\r\n')
with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(updated)

print("SUCCESS: Added Care Updates tab and view for family members!")
