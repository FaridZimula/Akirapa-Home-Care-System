'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  Calendar, Users, Clock, ShieldAlert, CheckCircle, MapPin, 
  UserCheck, AlertCircle, Trash2, Bell, FileText, Camera, 
  Database, Upload, Activity, LogOut, Lock, RefreshCw, Smartphone,
  ChevronRight, ChevronLeft
} from 'lucide-react';

export default function Home() {
  const { user, loading: authLoading, login, logout, triggerAudit } = useAuth();
  const [activeTab, setActiveTab] = useState<'admin' | 'caregiver' | 'family' | 'audits'>('admin');
  
  // Flow states
  const [viewState, setViewState] = useState<'splash' | 'role_select' | 'login' | 'dashboard'>('splash');
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'CAREGIVER' | 'CLIENT' | null>(null);
  
  // Login custom credentials state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Redirect to splash/role_select on logout or direct to dashboard on login
  useEffect(() => {
    if (!user && !authLoading) {
      setViewState('splash');
      setSelectedRole(null);
      setLoginEmail('');
      setLoginPassword('');
    } else if (user) {
      setViewState('dashboard');
      // Set default tab based on role
      if (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') {
        setActiveTab('admin');
      } else if (user.role === 'CAREGIVER') {
        setActiveTab('caregiver');
      } else if (user.role === 'FAMILY_MEMBER') {
        setActiveTab('family');
      }
    }
  }, [user, authLoading]);

  // Auto transition splash screen
  useEffect(() => {
    if (viewState === 'splash') {
      const timer = setTimeout(() => {
        if (!user && !authLoading) {
          setViewState('role_select');
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [viewState, user, authLoading]);

  // Data States
  const [clients, setClients] = useState<any[]>([]);
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Scheduling Panel States
  const [newShiftClientId, setNewShiftClientId] = useState('');
  const [newShiftCaregiverId, setNewShiftCaregiverId] = useState('');
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftHours, setNewShiftHours] = useState('8');
  const [schedulerWarning, setSchedulerWarning] = useState<string | null>(null);

  // Pod Mapping States
  const [selectedPodClient, setSelectedPodClient] = useState('');
  const [selectedPodRole, setSelectedPodRole] = useState<'PRIMARY' | 'SECONDARY_1' | 'SECONDARY_2'>('PRIMARY');
  const [selectedPodCaregiver, setSelectedPodCaregiver] = useState('');

  // Caregiver Dashboard Simulation States
  const [distanceOffset, setDistanceOffset] = useState<number>(0); // distance from patient home in meters
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [clockInError, setClockInError] = useState<string | null>(null);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const [showClockOutOverrideInput, setShowClockOutOverrideInput] = useState(false);
  const [clockOutOverrideReason, setClockOutOverrideReason] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [redFlags, setRedFlags] = useState({
    cognitiveConfusion: false,
    fallDetected: false,
    behavioralChanges: false,
    mobilityDecline: false,
  });

  // Family Feed Upload States
  const [mediaName, setMediaName] = useState('Oatmeal Breakfast.png');
  const [mediaNotes, setMediaNotes] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Simulation Alert Logs (Mock SMS Messages Panel)
  const [smsAlerts, setSmsAlerts] = useState<Array<{ timestamp: Date; to: string; message: string }>>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);

  // In-App Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  // Poll for notifications
  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000); // 15 seconds
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
    }
  }, [user]);

  // Click outside listener for notifications dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotificationsDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load dashboard data
  const loadData = async () => {
    try {
      // 1. Fetch scheduling lists
      const schedRes = await fetch('/api/admin/scheduling');
      const schedData = await schedRes.json();
      if (schedRes.ok) {
        setClients(schedData.clients || []);
        setCaregivers(schedData.caregivers || []);
        setShifts(schedData.shifts || []);
        
        // Auto-select client for pod mapping and scheduling
        if (schedData.clients?.length > 0) {
          setNewShiftClientId(schedData.clients[0].id);
          setSelectedPodClient(schedData.clients[0].id);
        }
        if (schedData.caregivers?.length > 0) {
          setNewShiftCaregiverId(schedData.caregivers[0].id);
          setSelectedPodCaregiver(schedData.caregivers[0].id);
        }
      }

      // 2. Fetch Activity logs
      if (schedData.clients?.length > 0) {
        const feedRes = await fetch(`/api/family/activity-feed?clientId=${schedData.clients[0].id}`);
        const feedData = await feedRes.json();
        if (feedRes.ok) {
          setActivityLogs(feedData.logs || []);
        }
      }

      // 3. Fetch Audit logs from db directly via helper endpoint
      const auditRes = await fetch('/api/admin/audits');
      const auditData = await auditRes.json();
      if (auditRes.ok) {
        setAuditLogs(auditData.audits || []);
      }

      // Fetch in-app notifications
      fetchNotifications();

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Periodic active shift location tracking simulation (Privacy check)
  useEffect(() => {
    const activeShift = shifts.find(s => s.status === 'IN_PROGRESS' && s.caregiverId === user?.id);
    if (!activeShift) return;

    // Simulate location ping every 10 seconds for prototyping (normally 1-5 mins)
    const interval = setInterval(async () => {
      // Mock coordinates slightly drifting around Sarah's coordinates based on offset
      const clientLat = activeShift.client.latitude;
      const clientLng = activeShift.client.longitude;
      const mockLat = clientLat + (distanceOffset / 111111); // approx degree conversion
      const mockLng = clientLng + (distanceOffset / (111111 * Math.cos(clientLat * Math.PI / 180)));

      try {
        const res = await fetch('/api/shifts/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shiftId: activeShift.id,
            latitude: mockLat,
            longitude: mockLng,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          console.log('[GPS TICK] Privacy validated: Caregiver coordinates registered successfully.', data.locationRecord);
        } else {
          console.warn('[GPS TICK REJECTED]', data.error);
        }
      } catch (err) {
        console.error('[GPS TICK ERROR]', err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [shifts, distanceOffset, user]);

  // Actions
  const handleFastLogin = async (email: string) => {
    setLoading(true);
    let pass = 'admin123';
    if (email === 'coordinator@akirapa.com') pass = 'coordinator123';
    if (email === 'primary@akirapa.com') pass = 'akirapa2634!';
    if (email === 'backup1@akirapa.com') pass = 'backup1123';
    if (email === 'family@akirapa.com') pass = 'family123';

    await login(email, pass);
    await loadData();
  };

  const handlePortalLogin = async (email: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const success = await login(email, pass, selectedRole || undefined);
      if (success) {
        await loadData();
      } else {
        setLoginError('Invalid credentials or authentication failed.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('An authentication system error occurred.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftDate) return;

    const start = new Date(newShiftDate);
    const end = new Date(start.getTime() + parseInt(newShiftHours) * 60 * 60 * 1000);

    try {
      const res = await fetch('/api/admin/scheduling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: newShiftClientId,
          caregiverId: newShiftCaregiverId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShifts([data.shift, ...shifts]);
        setSchedulerWarning(data.warningAlert || null);
        showNotification(data.warningAlert ? 'Shift Created with Warning' : 'Shift Created Successfully');
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedPodClient,
          caregiverId: selectedPodCaregiver,
          role: selectedPodRole,
        }),
      });

      if (res.ok) {
        showNotification('Caregiver Pod Role Updated!');
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEscalationCheck = async () => {
    try {
      const res = await fetch('/api/admin/escalation-check', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.processedCount > 0) {
        showNotification(`Processed: ${data.processedCount} shifts. Escalated: ${data.escalatedCount}.`);
        
        // Append simulated SMS alerts
        const newSMS: typeof smsAlerts = [];
        data.escalations.forEach((esc: any) => {
          if (esc.smsAlertMock) {
            newSMS.push({
              timestamp: new Date(),
              to: esc.smsAlertMock.to,
              message: esc.smsAlertMock.message,
            });
          }
        });
        if (newSMS.length > 0) {
          setSmsAlerts([...newSMS, ...smsAlerts]);
        }
        loadData();
      } else {
        showNotification('No shifts passed the 24h unconfirmed escalation deadline.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClockIn = async (shiftId: string, isOverride = false) => {
    setClockInError(null);
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    // Simulate GPS coords based on client location and mock slider offset
    const clientLat = activeShift.client.latitude;
    const clientLng = activeShift.client.longitude;
    const mockLat = clientLat + (distanceOffset / 111111);
    const mockLng = clientLng + (distanceOffset / (111111 * Math.cos(clientLat * Math.PI / 180)));

    try {
      const res = await fetch('/api/shifts/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          latitude: mockLat,
          longitude: mockLng,
          isOverride,
          overrideReason: isOverride ? overrideReason : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(isOverride ? 'Manual Override Submitted' : 'Clock-In Validated!');
        setShowOverrideInput(false);
        setOverrideReason('');
        loadData();
      } else {
        setClockInError(data.error);
        if (data.allowOverride) {
          setShowOverrideInput(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClockOut = async (shiftId: string, isOverride = false) => {
    setClockOutError(null);
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    // Simulate GPS coords based on client location and mock slider offset
    const clientLat = activeShift.client.latitude;
    const clientLng = activeShift.client.longitude;
    const mockLat = clientLat + (distanceOffset / 111111);
    const mockLng = clientLng + (distanceOffset / (111111 * Math.cos(clientLat * Math.PI / 180)));

    // Mock completing all active tasks for simplicity
    const activeShiftTaskIds = activeShift.tasks?.map((t: any) => t.id) || [];

    try {
      const res = await fetch('/api/shifts/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          completedTaskIds: activeShiftTaskIds,
          redFlags,
          notes: shiftNotes,
          latitude: mockLat,
          longitude: mockLng,
          isOverride,
          overrideReason: isOverride ? clockOutOverrideReason : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(isOverride ? 'Manual Override Submitted' : (data.hasRedFlags ? 'Clocked out with CLINICAL WARNINGS' : 'Clocked out successfully!'));
        setShiftNotes('');
        setRedFlags({
          cognitiveConfusion: false,
          fallDetected: false,
          behavioralChanges: false,
          mobilityDecline: false,
        });
        setShowClockOutOverrideInput(false);
        setClockOutOverrideReason('');
        loadData();
      } else {
        setClockOutError(data.error);
        if (data.allowOverride) {
          setShowClockOutOverrideInput(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDropShift = async (shiftId: string) => {
    try {
      const res = await fetch('/api/shifts/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          reason: 'Unavoidable caregiver conflict',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(data.escalated ? 'Shift Dropped & Escalated' : 'Shift Dropped.');
        if (data.smsAlertMock) {
          setSmsAlerts([{
            timestamp: new Date(),
            to: data.smsAlertMock.to,
            message: data.smsAlertMock.message,
          }, ...smsAlerts]);
        }
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clients.length) return;
    setIsUploadingMedia(true);

    try {
      const res = await fetch('/api/family/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clients[0].id,
          mediaName,
          mediaType: 'image/png',
          notes: mediaNotes || 'Weekly review and mobility exercise session completed.',
        }),
      });

      if (res.ok) {
        showNotification('Care Media Uploaded to Feed!');
        setMediaNotes('');
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const showNotification = (message: string) => {
    setSystemNotification(message);
    setTimeout(() => {
      setSystemNotification(null);
    }, 4000);
  };

  const renderSplashScreen = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-purple-dark via-[#1e0f26] to-[#0d0712] text-white flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-purple/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-teal/50 rounded-full blur-[120px] opacity-10 pointer-events-none" />
        
        {/* Animated Container */}
        <div className="max-w-md w-full text-center flex flex-col items-center gap-8 relative z-10 animate-fade-in">
          {/* Logo Card */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-teal to-brand-purple-light rounded-3xl blur opacity-35 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse" />
            <div className="relative w-24 h-24 bg-brand-purple-dark border border-brand-purple-light/20 text-brand-teal p-5 rounded-3xl font-black text-4xl tracking-wider flex items-center justify-center shadow-2xl">
              AK
            </div>
          </div>

          {/* Titles */}
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-extrabold tracking-[0.2em] text-white uppercase font-sans">
              AKIRAPA
            </h1>
            <h2 className="text-xs font-bold text-brand-teal tracking-[0.3em] uppercase">
              In-Home Care Systems
            </h2>
          </div>

          <p className="text-sm text-white/60 italic leading-relaxed max-w-xs font-medium">
            "Celebrating life stories, honoring daily routines."
          </p>

          {/* Loading status bar */}
          <div className="w-full mt-4 flex flex-col items-center gap-4">
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full bg-brand-teal rounded-full animate-progress-bar" style={{ width: '100%' }} />
            </div>
            
            <button
              onClick={() => setViewState('role_select')}
              className="mt-2 px-6 py-2.5 bg-white/5 hover:bg-brand-teal hover:text-brand-purple border border-white/10 hover:border-brand-teal/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 flex items-center gap-2 group cursor-pointer"
            >
              <span>Enter Portal</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderRoleSelection = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8f6fa] to-[#eefaf9] text-gray-800 flex flex-col justify-center items-center p-6 font-sans">
        <div className="max-w-4xl w-full text-center flex flex-col gap-10">
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div className="w-12 h-12 bg-brand-purple text-brand-teal font-black text-lg rounded-2xl flex items-center justify-center shadow-md">
              AK
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-brand-purple-dark tracking-tight">Select Access Portal</h1>
              <p className="text-sm text-gray-500 mt-1.5 font-medium">Choose your portal pathway below to authenticate into the system.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left animate-fade-in">
            {/* Card 1: Admin */}
            <div 
              onClick={() => { setSelectedRole('ADMIN'); setViewState('login'); }}
              className="bg-white border border-gray-100 hover:border-brand-purple/20 p-6 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer flex flex-col justify-between min-h-[250px] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-purple/5 rounded-full translate-x-6 -translate-y-6 group-hover:scale-150 transition-transform duration-500" />
              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-12 h-12 bg-brand-purple-ultra border border-brand-purple-light/10 text-brand-purple rounded-2xl flex items-center justify-center group-hover:bg-brand-purple group-hover:text-white transition-colors duration-300">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-brand-purple-dark">Agency Administrator</h3>
                  <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">
                    Access scheduling controls, caregiver pod memberships, shift drop escalations, and immutable security audits.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-purple group-hover:text-brand-purple-light mt-4 relative z-10">
                <span>Enter Admin Portal</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 2: Caregiver */}
            <div 
              onClick={() => { setSelectedRole('CAREGIVER'); setViewState('login'); }}
              className="bg-white border border-gray-100 hover:border-brand-teal/30 p-6 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer flex flex-col justify-between min-h-[250px] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-teal/5 rounded-full translate-x-6 -translate-y-6 group-hover:scale-150 transition-transform duration-500" />
              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-12 h-12 bg-brand-teal-ultra border border-brand-teal/15 text-brand-teal-dark rounded-2xl flex items-center justify-center group-hover:bg-brand-teal group-hover:text-brand-purple transition-colors duration-300">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-800">Professional Caregiver</h3>
                  <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">
                    View active care plans, execute shift task checklists, verify geofenced clock-ins, and submit clinical red flag surveys.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-teal-dark group-hover:text-brand-teal mt-4 relative z-10">
                <span>Enter Caregiver Portal</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Card 3: Client */}
            <div 
              onClick={() => { setSelectedRole('CLIENT'); setViewState('login'); }}
              className="bg-white border border-gray-100 hover:border-brand-purple/20 p-6 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer flex flex-col justify-between min-h-[250px] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-purple/5 rounded-full translate-x-6 -translate-y-6 group-hover:scale-150 transition-transform duration-500" />
              <div className="flex flex-col gap-4 relative z-10">
                <div className="w-12 h-12 bg-brand-purple-ultra border border-brand-purple-light/10 text-brand-purple-light rounded-2xl flex items-center justify-center group-hover:bg-brand-purple-light group-hover:text-white transition-colors duration-300">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-brand-purple-dark">Client Portal</h3>
                  <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">
                    Monitor live activity feeds, upload private care logs (signed URL encryption), and review caregiver reports.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand-purple-light group-hover:text-brand-purple mt-4 relative z-10">
                <span>Enter Client Portal</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-400 font-semibold mt-4">
            &copy; {new Date().getFullYear()} Akirapa In-Home Care Systems. Secure senior care coordination network.
          </div>
        </div>
      </div>
    );
  };

  const renderLoginScreen = () => {
    // Accounts list based on selectedRole
    let accounts: Array<{ name: string; email: string; pass: string }> = [];
    if (selectedRole === 'ADMIN') {
      accounts = [
        { name: 'Elena Rostova (Agency Admin)', email: 'admin@akirapa.com', pass: 'admin123' },
        { name: 'Grace Taylor (Care Coordinator)', email: 'coordinator@akirapa.com', pass: 'coordinator123' }
      ];
    } else if (selectedRole === 'CAREGIVER') {
      accounts = [
        { name: 'Amara Okafor (Primary Caregiver)', email: 'primary@akirapa.com', pass: 'akirapa2634!' },
        { name: 'Brendan Miller (Secondary Caregiver 1)', email: 'backup1@akirapa.com', pass: 'backup1123' },
        { name: 'Chloe Chen (Secondary Caregiver 2)', email: 'backup2@akirapa.com', pass: 'backup2123' }
      ];
    } else if (selectedRole === 'CLIENT') {
      accounts = [
        { name: 'David Jenkins (Client Representative)', email: 'family@akirapa.com', pass: 'family123' }
      ];
    }

    // Set default credentials on select
    const handleSelectAccount = (email: string) => {
      const acc = accounts.find(a => a.email === email);
      if (acc) {
        setLoginEmail(acc.email);
        setLoginPassword(acc.pass);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8f6fa] to-[#eefaf9] text-gray-800 flex flex-col justify-center items-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-gray-100 p-8 rounded-3xl shadow-xl flex flex-col gap-6 relative animate-fade-in">
          {/* Back Button */}
          <button 
            onClick={() => { setViewState('role_select'); setLoginError(null); }}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-brand-purple transition-colors w-fit group cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Role Selection</span>
          </button>

          {/* Heading */}
          <div className="border-b border-gray-100 pb-4">
            <h2 className="text-xl font-extrabold text-brand-purple-dark">
              {selectedRole === 'ADMIN' ? 'Administrator Login' : selectedRole === 'CAREGIVER' ? 'Caregiver Authentication' : 'Client Portal Access'}
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-medium font-sans">Verify credentials to connect to the secure HIPAA-compliant server.</p>
          </div>

          {/* Form */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handlePortalLogin(loginEmail, loginPassword);
            }} 
            className="flex flex-col gap-4"
          >
            {/* Account Selector helper */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Select Mock Demo Profile</label>
              <select 
                onChange={(e) => handleSelectAccount(e.target.value)}
                defaultValue=""
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple cursor-pointer"
              >
                <option value="" disabled>-- Click to Choose Demo Profile --</option>
                {accounts.map(acc => (
                  <option key={acc.email} value={acc.email}>{acc.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Email Address</label>
              <input 
                type="email" 
                required
                placeholder="email@akirapa.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Password</label>
                <span className="text-[9px] font-bold text-brand-teal-dark uppercase tracking-wider">AES-256 Verified</span>
              </div>
              <input 
                type="password" 
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            {loginError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn || !loginEmail || !loginPassword}
              className="w-full mt-2 py-3.5 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-brand-teal rounded-full animate-spin" />
                  <span>Connecting Securely...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Authenticate & Enter</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  };

  // Main Dashboard gating logic
  if (viewState === 'splash') {
    return renderSplashScreen();
  }
  if (viewState === 'role_select') {
    return renderRoleSelection();
  }
  if (viewState === 'login') {
    return renderLoginScreen();
  }

  // Safe check if session is empty
  if (!user) {
    return (
      <div className="min-h-screen bg-[#fcfbfe] flex flex-col items-center justify-center gap-4 font-sans">
        <div className="w-8 h-8 border-4 border-brand-purple border-t-brand-teal rounded-full animate-spin" />
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Re-verifying Session...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans animate-fade-in">
      {/* Real-time Notification Banner */}
      {systemNotification && (
        <div className="fixed top-4 right-4 bg-brand-purple text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-bounce border border-brand-purple-light/20">
          <Bell className="w-5 h-5 text-brand-teal" />
          <span className="font-semibold text-sm">{systemNotification}</span>
        </div>
      )}

      {/* Main Premium Navbar */}
      <header className="bg-gradient-to-r from-brand-purple-dark to-brand-purple border-b border-brand-purple-light/10 text-white py-5 px-8 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-teal text-brand-purple p-2.5 rounded-2xl font-black text-xl tracking-wider shadow-inner">
              AK
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Akirapa Care Portal</h1>
              <p className="text-xs text-brand-teal-light font-medium tracking-wide">
                Celebrating life stories, honoring daily routines.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-brand-purple-dark/50 px-4 py-2.5 rounded-2xl border border-brand-purple-light/10">
              <div className="w-2.5 h-2.5 rounded-full bg-brand-teal animate-pulse" />
              <div className="text-right">
                <div className="text-xs font-semibold text-brand-teal-light">
                  {user.role === 'FAMILY_MEMBER' ? 'CLIENT' : user.role}
                </div>
                <div className="text-sm font-bold text-white/95">{user.name}</div>
              </div>
              <button 
                onClick={() => logout(false)}
                title="Logout"
                className="p-1.5 hover:bg-brand-purple-light/25 rounded-lg text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
 
            {/* Real-time In-App Notification Center */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                title="Notifications"
                className="p-2.5 bg-brand-purple-light/20 hover:bg-brand-purple-light/40 border border-brand-purple-light/10 rounded-2xl text-brand-teal transition-all active:scale-95 cursor-pointer relative flex items-center justify-center"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-brand-purple animate-pulse">
                    {notifications.filter(n => !n.isRead).length}
                  </span>
                )}
              </button>

              {showNotificationsDropdown && (
                <div className="absolute right-0 mt-3 w-80 bg-white text-gray-800 rounded-2xl shadow-2xl border border-gray-100 py-3 z-50 animate-fade-in flex flex-col max-h-[480px]">
                  {/* Header */}
                  <div className="px-4 pb-2 border-b border-gray-100 flex justify-between items-center">
                    <span className="font-extrabold text-xs text-brand-purple-dark uppercase tracking-wider">In-App Notifications</span>
                    {notifications.filter(n => !n.isRead).length > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-[10px] font-extrabold text-brand-teal hover:text-brand-teal-dark transition-colors uppercase tracking-wider cursor-pointer"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-gray-400 italic font-medium">
                        No notifications found.
                      </div>
                    ) : (
                      notifications.map(notif => {
                        // Map type to icon and background colors
                        let icon = <Bell className="w-4 h-4 text-brand-purple" />;
                        let bgClass = "bg-brand-purple-ultra";
                        if (notif.type === 'CLINICAL_ALERT') {
                          icon = <ShieldAlert className="w-4.5 h-4.5 text-rose-600" />;
                          bgClass = "bg-rose-50";
                        } else if (notif.type === 'EXCEPTION_OVERRIDE') {
                          icon = <Lock className="w-4.5 h-4.5 text-amber-600" />;
                          bgClass = "bg-amber-50";
                        } else if (notif.type === 'SHIFT_ASSIGNED') {
                          icon = <Calendar className="w-4.5 h-4.5 text-emerald-600" />;
                          bgClass = "bg-emerald-50";
                        } else if (notif.type === 'SHIFT_DROPPED') {
                          icon = <AlertCircle className="w-4.5 h-4.5 text-rose-500" />;
                          bgClass = "bg-rose-50";
                        }

                        return (
                          <div
                            key={notif.id}
                            onClick={() => !notif.isRead && handleMarkAsRead(notif.id)}
                            className={`p-3.5 flex gap-3 transition-colors text-left relative cursor-pointer hover:bg-gray-50 ${
                              !notif.isRead ? 'bg-gray-50/50 font-bold' : ''
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${bgClass}`}>
                              {icon}
                            </div>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="text-xs font-bold text-gray-800 leading-tight">
                                {notif.title}
                              </div>
                              <p className="text-[10px] text-gray-500 font-medium leading-relaxed leading-normal">
                                {notif.message}
                              </p>
                              <span className="text-[9px] text-gray-400 mt-1 font-mono">
                                {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {!notif.isRead && (
                              <div className="w-1.5 h-1.5 bg-brand-teal rounded-full self-center shrink-0" />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => loadData()}
              title="Refresh Data"
              className="p-2.5 bg-brand-purple-light/20 hover:bg-brand-purple-light/40 border border-brand-purple-light/10 rounded-2xl text-brand-teal transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Simulator GPS slider quick bar - Only visible to Admins and Caregivers */}
      {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' || user.role === 'CAREGIVER') && (
        <section className="bg-white border-b border-gray-100 py-4 px-8 shadow-sm">
          <div className="max-w-7xl mx-auto flex justify-end items-center">
            {/* GPS Simulation Slider */}
            <div className="flex items-center gap-4 bg-brand-teal-ultra border border-brand-teal/20 px-5 py-3 rounded-2xl w-full lg:w-auto">
              <MapPin className="w-5 h-5 text-brand-teal shrink-0" />
              <div className="flex-1 lg:w-64">
                <div className="flex justify-between text-[10px] font-bold text-brand-teal-dark mb-1">
                  <span>Caregiver Mock GPS Distance Tracker:</span>
                  <span className="text-brand-purple font-extrabold">{distanceOffset}m</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1000" 
                  step="50"
                  value={distanceOffset}
                  onChange={(e) => setDistanceOffset(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-brand-teal/20 rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
              </div>
              <div className="text-xs font-bold shrink-0 text-right">
                {distanceOffset <= 150 ? (
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">At Client (Inside 150m)</span>
                ) : (
                  <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">Outside Boundary</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Dashboard Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Navigation Sidebar Gated by Role */}
        <nav className="flex flex-col gap-2.5 lg:col-span-1">
          <span className="text-[10px] font-bold tracking-widest text-gray-900 pl-3">Authorized Portals</span>
          
          {/* Admin Gated Options */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
            <>
              <button 
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'admin' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
              >
                <Calendar className="w-5 h-5 shrink-0" />
                <span>Admin & Scheduler</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('audits')}
                className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'audits' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
              >
                <Database className="w-5 h-5 shrink-0" />
                <span>Live Audit Logging</span>
              </button>
            </>
          )}
          
          {/* Caregiver Gated Options */}
          {user.role === 'CAREGIVER' && (
            <button 
              onClick={() => setActiveTab('caregiver')}
              className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'caregiver' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
            >
              <Clock className="w-5 h-5 shrink-0" />
              <span>Caregiver Dashboard</span>
            </button>
          )}

          {/* Client (Family) Gated Options */}
          {user.role === 'FAMILY_MEMBER' && (
            <button 
              onClick={() => setActiveTab('family')}
              className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'family' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
            >
              <Activity className="w-5 h-5 shrink-0" />
              <span>Client Activity Feed</span>
            </button>
          )}

          {/* SMS Simulation Alerts Panel - Render for Caregivers and Admins */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' || user.role === 'CAREGIVER') && (
            <div className="mt-8 bg-brand-purple text-white rounded-3xl p-5 border border-brand-purple-light/20 shadow-xl flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-brand-purple-light/20 pb-3">
                <span className="flex items-center gap-2 text-xs font-bold text-white">
                  <Smartphone className="w-4 h-4 text-brand-teal-light" />
                  <span>Simulated SMS Alert Log</span>
                </span>
                <span className="bg-brand-purple-dark/50 text-[10px] px-2 py-0.5 rounded-full font-mono text-brand-purple-ultra">
                  {smsAlerts.length}
                </span>
              </div>
              
              <div className="flex flex-col gap-3.5 max-h-60 overflow-y-auto pr-1 text-xs">
                {smsAlerts.length === 0 ? (
                  <div className="text-brand-purple-ultra/60 py-6 text-center italic">No SMS logs recorded. Try dropping a shift or triggering escalation.</div>
                ) : (
                  smsAlerts.map((sms, i) => (
                    <div key={i} className="bg-brand-purple-dark/30 border border-brand-purple-light/10 p-3 rounded-xl flex flex-col gap-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-brand-purple-ultra/70">
                        <span>To: {sms.to}</span>
                        <span>{sms.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <p className="text-white font-medium leading-relaxed leading-normal">{sms.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Dashboard Content Container Gated by Role */}
        <section className="lg:col-span-3 flex flex-col gap-8">
          
          {loading ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-4 border-brand-purple border-t-brand-teal rounded-full animate-spin" />
              <span className="font-semibold text-sm">Synchronizing live portal data...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: ADMIN PANEL - Gated */}
              {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && activeTab === 'admin' && (
                <div className="flex flex-col gap-8">
                  {/* Warning Alerts */}
                  {schedulerWarning && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-5 py-4 rounded-2xl flex items-start gap-3.5">
                      <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">Pod Alignment Warning</div>
                        <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{schedulerWarning}</p>
                      </div>
                    </div>
                  )}

                  {/* Header Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                    <div>
                      <h2 className="text-lg font-bold text-brand-purple">Agency Command & Scheduling</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Define caregiver pods, allocate shifts, and test automatic escalation routines.</p>
                    </div>
                    <button 
                      onClick={handleEscalationCheck}
                      className="px-5 py-2.5 bg-brand-teal hover:bg-brand-teal-dark border border-brand-teal/15 text-brand-purple font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all hover:shadow-lg active:scale-95 flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Run Auto-Escalation Check</span>
                    </button>
                  </div>

                  {/* Pod Mapping Form & Scheduler Form Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Caregiver Pod Mapping */}
                    <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-5">
                      <div className="border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                          <Users className="w-4 h-4 text-brand-teal" />
                          <span>Caregiver Pod Editor</span>
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Assign specialized caregivers to primary and backup roles for linked clients.</p>
                      </div>

                      <form onSubmit={handleUpdatePod} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Select Client</label>
                          <select 
                            value={selectedPodClient} 
                            onChange={(e) => setSelectedPodClient(e.target.value)}
                            className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                          >
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Pod Role</label>
                          <select 
                            value={selectedPodRole} 
                            onChange={(e) => setSelectedPodRole(e.target.value as any)}
                            className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                          >
                            <option value="PRIMARY">PRIMARY (Main Caregiver)</option>
                            <option value="SECONDARY_1">SECONDARY 1 (First Backup)</option>
                            <option value="SECONDARY_2">SECONDARY 2 (Second Backup)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Select Caregiver</label>
                          <select 
                            value={selectedPodCaregiver} 
                            onChange={(e) => setSelectedPodCaregiver(e.target.value)}
                            className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                          >
                            {caregivers.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                          </select>
                        </div>

                        <button 
                          type="submit"
                          className="mt-2 w-full py-3 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          Update Pod Mapping
                        </button>
                      </form>
                    </div>

                    {/* Shift Scheduling Form */}
                    <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-5">
                      <div className="border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-brand-teal" />
                          <span>Schedule New Shift</span>
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Assign shifts. System checks pod mapping and triggers consistency warning alerts.</p>
                      </div>

                      <form onSubmit={handleCreateShift} className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Client</label>
                            <select 
                              value={newShiftClientId} 
                              onChange={(e) => setNewShiftClientId(e.target.value)}
                              className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                            >
                              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Caregiver</label>
                            <select 
                              value={newShiftCaregiverId} 
                              onChange={(e) => setNewShiftCaregiverId(e.target.value)}
                              className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                            >
                              {caregivers.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Start Time</label>
                            <input 
                              type="datetime-local" 
                              value={newShiftDate}
                              onChange={(e) => setNewShiftDate(e.target.value)}
                              className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Duration (Hours)</label>
                            <select 
                              value={newShiftHours} 
                              onChange={(e) => setNewShiftHours(e.target.value)}
                              className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-teal cursor-pointer"
                            >
                              <option value="4">4 Hours</option>
                              <option value="5">5 Hours</option>
                              <option value="6">6 Hours</option>
                              <option value="8">8 Hours</option>
                            </select>
                          </div>
                        </div>

                        <button 
                          type="submit"
                          className="mt-2 w-full py-3 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          Schedule Shift
                        </button>
                      </form>
                    </div>

                  </div>

                  {/* Active Caregiver Pod Directory */}
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-4">
                    <div className="border-b border-gray-100 pb-3">
                      <h3 className="font-bold text-sm text-brand-purple">Active Caregiver Pod Directory</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">Pod memberships and hierarchy registered for each patient account.</p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {clients.map(client => (
                        <div key={client.id} className="border border-gray-100 rounded-2xl p-5 flex flex-col md:flex-row justify-between md:items-center gap-4">
                          <div>
                            <div className="font-bold text-sm text-gray-800">{client.name}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{client.address}</div>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {['PRIMARY', 'SECONDARY_1', 'SECONDARY_2'].map(role => {
                              const podMem = client.caregiverPods?.find((p: any) => p.role === role);
                              return (
                                <div key={role} className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl flex flex-col">
                                  <span className="text-[9px] font-bold text-gray-400">{role}</span>
                                  <span className="text-xs font-semibold text-brand-purple-dark mt-0.5">
                                    {podMem ? podMem.caregiver.name : 'Unassigned'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shifts List */}
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-4">
                    <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-sm text-brand-purple">All Scheduled Shifts</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Overview of assigned, active, unconfirmed, and completed shifts.</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      {shifts.map(shift => {
                        const podAssignments = shift.client.caregiverPods || [];
                        const isCgInPod = podAssignments.some((p: any) => p.caregiverId === shift.caregiverId);

                        return (
                          <div key={shift.id} className="border border-gray-100 hover:border-gray-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 transition-colors">
                            <div className="flex items-start gap-3">
                              <Calendar className="w-5 h-5 text-brand-purple shrink-0 mt-0.5" />
                              <div>
                                <div className="font-bold text-sm text-gray-800">
                                  {shift.client.name} &larr; {shift.caregiver.name}
                                </div>
                                <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  <span className="font-semibold text-brand-purple-light">{new Date(shift.scheduledStart).toLocaleString()}</span>
                                  <span>&bull;</span>
                                  <span>Deadline: {new Date(shift.confirmationDeadline).toLocaleString()}</span>
                                </div>
                                {!isCgInPod && (
                                  <span className="mt-1.5 inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Outside Pod Assignment Warning</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                shift.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                shift.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                shift.status === 'UNCONFIRMED' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                shift.status === 'CONFIRMED' ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                                'bg-gray-50 text-gray-600 border border-gray-100'
                              }`}>
                                {shift.status}
                              </span>

                              {shift.isOverrideException && (
                                <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-bold px-2 py-1 rounded-md">
                                  Override Pending Approval
                                </span>
                              )}

                              {shift.status !== 'COMPLETED' && shift.status !== 'DROPPED' && (
                                <button 
                                  onClick={() => handleDropShift(shift.id)}
                                  title="Force Drop/Escalate Shift"
                                  className="p-2 hover:bg-rose-50 rounded-xl text-rose-500 border border-transparent hover:border-rose-100 transition-all active:scale-95 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 2: CAREGIVER PANEL - Gated */}
              {user.role === 'CAREGIVER' && activeTab === 'caregiver' && (
                <div className="flex flex-col gap-8">
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                    <h2 className="text-lg font-bold text-brand-purple">Caregiver Shift Execution</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Mock device interface for location clock-in validation, task checklist, and clock-out red flags.</p>
                  </div>

                  {/* Active Shift Card */}
                  {shifts.filter(s => s.caregiverId === user.id && s.status !== 'COMPLETED' && s.status !== 'DROPPED').length === 0 ? (
                    <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center text-gray-400 italic">
                      No active shifts assigned to you today.
                    </div>
                  ) : (
                    shifts.filter(s => s.caregiverId === user.id && s.status !== 'COMPLETED' && s.status !== 'DROPPED').map(shift => (
                      <div key={shift.id} className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm flex flex-col gap-6">
                        
                        {/* Header Details */}
                        <div className="flex justify-between items-start border-b border-gray-100 pb-5">
                          <div>
                            <span className="text-[10px] font-bold text-brand-teal uppercase tracking-wider">Active Scheduled Shift</span>
                            <h3 className="font-bold text-xl text-gray-800 mt-1">Client: {shift.client.name}</h3>
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{new Date(shift.scheduledStart).toLocaleTimeString()} - {new Date(shift.scheduledEnd).toLocaleTimeString()}</span>
                              <span>&bull;</span>
                              <MapPin className="w-3.5 h-3.5 text-brand-teal" />
                              <span>Radius requirement: {shift.client.geofenceRadiusMeter}m</span>
                            </div>
                          </div>

                          <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                            shift.status === 'IN_PROGRESS' ? 'bg-brand-teal-ultra text-brand-teal-dark border border-brand-teal/20 animate-pulse' : 'bg-brand-purple text-white'
                          }`}>
                            {shift.status === 'IN_PROGRESS' ? 'In Progress (Clocked In)' : 'Confirmed (Awaiting Clock-In)'}
                          </span>
                        </div>

                        {/* Clock-in Controller */}
                        {shift.status !== 'IN_PROGRESS' && (
                          <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl flex flex-col gap-4">
                            <h4 className="font-bold text-sm text-gray-700">Geofenced Clock-in Verification</h4>
                            
                            <div className="text-xs text-gray-600 leading-relaxed">
                              Your device reports coordinates derived from the GPS Distance tracker above. 
                              Clock-in validation is constrained to <span className="font-bold text-brand-purple">{shift.client.geofenceRadiusMeter} meters</span>.
                            </div>

                            {clockInError && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-semibold">
                                <AlertCircle className="w-4 h-4" />
                                <span>{clockInError}. GPS reports {distanceOffset}m away from center point.</span>
                              </div>
                            )}

                            {showOverrideInput ? (
                              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex flex-col gap-3">
                                <span className="text-[11px] font-bold text-amber-800">REQUEST ADMINISTRATIVE OVERRIDE</span>
                                <input 
                                  type="text" 
                                  placeholder="Describe exception reason (e.g. GPS signal degradation, met client outside)"
                                  value={overrideReason}
                                  onChange={(e) => setOverrideReason(e.target.value)}
                                  className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-purple w-full font-semibold"
                                />
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => handleClockIn(shift.id, true)}
                                    className="px-4 py-2 bg-brand-purple hover:bg-brand-purple-dark text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                                  >
                                    Submit Override Request
                                  </button>
                                  <button 
                                    onClick={() => setShowOverrideInput(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 font-bold text-xs rounded-lg transition-all cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={() => handleClockIn(shift.id, false)}
                                className="py-3 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <MapPin className="w-4 h-4" />
                                <span>Verify Location & Clock-In</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Clock-out Tasks Checklist (If IN_PROGRESS) */}
                        {shift.status === 'IN_PROGRESS' && (
                          <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-3">
                              <h4 className="font-bold text-sm text-gray-700 border-b border-gray-100 pb-1.5">Shift Task Checklist</h4>
                              <div className="flex flex-col gap-2">
                                {shift.tasks?.map((task: any) => (
                                  <div key={task.id} className="flex items-start gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                                    <input 
                                      type="checkbox" 
                                      defaultChecked={task.isCompleted}
                                      className="w-4 h-4 rounded text-brand-teal accent-brand-teal mt-0.5 cursor-pointer"
                                    />
                                    <div>
                                      <div className="text-xs font-bold text-gray-800">{task.taskName}</div>
                                      <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">{task.description}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Clinical Red Flags */}
                            <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-2xl flex flex-col gap-4">
                              <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                                <ShieldAlert className="w-4.5 h-4.5 text-rose-500" />
                                <span>Clinical Red Flags & Risk Survey</span>
                              </div>
                              <p className="text-[11px] text-rose-900 leading-normal font-sans">
                                Answer truthfully for auditing compliance. Positive flags immediately dispatch real-time clinical warnings to care coordinators.
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-semibold text-rose-900">
                                <label className="flex items-center gap-2.5 bg-white border border-rose-100 p-3 rounded-xl cursor-pointer hover:bg-rose-50/30 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    checked={redFlags.cognitiveConfusion}
                                    onChange={(e) => setRedFlags({ ...redFlags, cognitiveConfusion: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500 cursor-pointer"
                                  />
                                  <span>Sudden Cognitive Confusion</span>
                                </label>

                                <label className="flex items-center gap-2.5 bg-white border border-rose-100 p-3 rounded-xl cursor-pointer hover:bg-rose-50/30 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    checked={redFlags.fallDetected}
                                    onChange={(e) => setRedFlags({ ...redFlags, fallDetected: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500 cursor-pointer"
                                  />
                                  <span>Slip / Fall Incident</span>
                                </label>

                                <label className="flex items-center gap-2.5 bg-white border border-rose-100 p-3 rounded-xl cursor-pointer hover:bg-rose-50/30 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    checked={redFlags.behavioralChanges}
                                    onChange={(e) => setRedFlags({ ...redFlags, behavioralChanges: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500 cursor-pointer"
                                  />
                                  <span>Unusual Behavioral Changes</span>
                                </label>

                                <label className="flex items-center gap-2.5 bg-white border border-rose-100 p-3 rounded-xl cursor-pointer hover:bg-rose-50/30 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    checked={redFlags.mobilityDecline}
                                    onChange={(e) => setRedFlags({ ...redFlags, mobilityDecline: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500 cursor-pointer"
                                  />
                                  <span>Sudden Physical Mobility Decline</span>
                                </label>
                              </div>
                            </div>

                            {/* Care Notes */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Care Shift Summary Notes</label>
                              <textarea 
                                rows={3}
                                placeholder="Enter daily observation summary, fluid intake details, exercises, etc..."
                                value={shiftNotes}
                                onChange={(e) => setShiftNotes(e.target.value)}
                                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-purple"
                              />
                            </div>

                            {/* Geofenced Clock-out Verification Errors */}
                            {clockOutError && (
                              <div className="bg-red-50 text-red-600 border border-red-100 p-4.5 rounded-2xl flex flex-col gap-3 text-xs font-semibold">
                                <span>{clockOutError}. GPS reports {distanceOffset}m away from center point.</span>
                                
                                {showClockOutOverrideInput ? (
                                  <div className="flex flex-col gap-2.5 mt-1 border-t border-red-100 pt-3">
                                    <label className="text-[10px] font-bold text-red-500 uppercase">Administrator Override Reason (Clock-Out)</label>
                                    <textarea 
                                      rows={2}
                                      value={clockOutOverrideReason}
                                      onChange={(e) => setClockOutOverrideReason(e.target.value)}
                                      placeholder="Explain the technical difficulty or exceptional circumstance..."
                                      className="bg-white border border-red-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-red-500"
                                    />
                                    <button 
                                      onClick={() => handleClockOut(shift.id, true)}
                                      disabled={!clockOutOverrideReason.trim()}
                                      className="py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 text-white rounded-xl font-bold text-xs uppercase tracking-wider"
                                    >
                                      Submit Override Request
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {/* Clock Out */}
                            <button 
                              onClick={() => handleClockOut(shift.id, false)}
                              className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Complete Shift & Clock-Out</span>
                            </button>
                          </div>
                        )}

                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: CLIENT PORTAL ACTIVITY FEED - Gated */}
              {user.role === 'FAMILY_MEMBER' && activeTab === 'family' && (
                <div className="flex flex-col gap-8">
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                    <h2 className="text-lg font-bold text-brand-purple">Client Portal Activity Feed</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Real-time updates, observation notes (decrypted for client representatives), and secure photo logs of Sarah Jenkins.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    {/* Media Upload Simulation Form */}
                    <div className="md:col-span-1 bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-4 h-fit">
                      <div className="border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                          <Camera className="w-4.5 h-4.5 text-brand-teal" />
                          <span>Caregiver Media Logger</span>
                        </h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">Simulate caregiver uploading a photo update to the client feed (Private signed URL).</p>
                      </div>

                      <form onSubmit={handleUploadMedia} className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Simulated Photo Name</label>
                          <select 
                            value={mediaName} 
                            onChange={(e) => setMediaName(e.target.value)}
                            className="bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value="Mom-eating-breakfast.png">Mom eating breakfast.png</option>
                            <option value="Walker-stability-check.png">Walker stability check.png</option>
                            <option value="Oatmeal-Preparation.png">Oatmeal Preparation.png</option>
                            <option value="Garden-exercise.png">Garden exercise.png</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Observation Note</label>
                          <textarea 
                            rows={3}
                            placeholder="Enter short update note for client feed..."
                            value={mediaNotes}
                            onChange={(e) => setMediaNotes(e.target.value)}
                            className="bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none"
                          />
                        </div>

                        <button 
                          type="submit"
                          disabled={isUploadingMedia}
                          className="w-full py-2.5 bg-brand-purple hover:bg-brand-purple-dark disabled:bg-gray-300 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                        >
                          {isUploadingMedia ? 'Simulating Upload...' : 'Upload Mock Photo Update'}
                        </button>
                      </form>
                    </div>

                    {/* Live Feed List */}
                    <div className="md:col-span-2 flex flex-col gap-4">
                      <div className="flex justify-between items-center bg-gray-50 px-4 py-2 rounded-xl text-xs font-bold text-brand-purple-dark">
                        <span>Live Care Logs (Decrypted Real-time Feed)</span>
                        <span className="text-[10px] text-brand-teal uppercase">Row-Level Security Enabled</span>
                      </div>

                      {activityLogs.length === 0 ? (
                        <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center text-gray-400 italic">
                          No activity feed logs found for Sarah Jenkins.
                        </div>
                      ) : (
                        activityLogs.map((log) => {
                          const hasWarning = log.details?.hasRedFlags;
                          const hasMedia = log.mediaUrls?.length > 0;
                          return (
                            <div key={log.id} className={`bg-white border rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-all ${
                              hasWarning ? 'border-rose-100 bg-rose-50/10' : 'border-gray-100'
                            }`}>
                              
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                  <div className={`p-1.5 rounded-xl ${hasWarning ? 'bg-rose-50 text-rose-500' : 'bg-brand-teal-ultra text-brand-teal'}`}>
                                    {hasWarning ? <ShieldAlert className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-gray-800">Care Log by {log.details?.caregiverName || 'Amara Okafor'}</div>
                                    <div className="text-[10px] text-gray-400">{new Date(log.createdAt).toLocaleString()}</div>
                                  </div>
                                </div>
                                
                                <span className="bg-gray-100 text-gray-500 font-mono text-[9px] px-2 py-0.5 rounded-full">
                                  ID: {log.id.substring(0, 8)}
                                </span>
                              </div>

                              <div className="text-xs font-medium text-gray-700 leading-relaxed pl-1">
                                {log.details?.notes || 'No description notes provided.'}
                              </div>

                              {hasWarning && (
                                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex flex-wrap gap-1.5 items-center">
                                  <span className="text-[9px] font-bold text-rose-700 uppercase mr-1">Clinical Red Flags:</span>
                                  {log.details.activeRedFlags?.map((flag: string) => (
                                    <span key={flag} className="bg-rose-200/50 text-rose-800 text-[10px] px-2 py-0.5 rounded font-bold">
                                      {flag.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {hasMedia && (
                                <div className="bg-brand-teal-ultra/30 border border-brand-teal/10 p-4 rounded-2xl flex flex-col gap-2">
                                  <span className="text-[9px] font-bold text-brand-teal-dark uppercase">Encrypted Private Media (Mock Signed Link)</span>
                                  <div className="flex items-center gap-3">
                                    <div className="bg-brand-teal text-brand-purple p-3 rounded-xl">
                                      <Camera className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-bold text-gray-800 truncate">{log.details?.mediaName || 'care-photo.png'}</div>
                                      <a 
                                        href={log.mediaUrls[0]} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-mono text-brand-teal-dark hover:underline truncate block"
                                      >
                                        {log.mediaUrls[0]}
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              )}

                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 4: AUDIT LOGS - Gated */}
              {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && activeTab === 'audits' && (
                <div className="flex flex-col gap-6 bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                  <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-brand-purple">Security Audit Log Vault</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Immutable, append-only logs tracking patient privacy views, overrides, clock-ins, and data updates.</p>
                    </div>
                    <span className="bg-brand-teal-ultra border border-brand-teal/20 text-brand-teal-dark font-extrabold text-[10px] px-3.5 py-1.5 rounded-xl uppercase tracking-wider">
                      HIPAA / ISO 27001 Compliant
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400 font-bold">
                          <th className="py-3.5 px-4 uppercase tracking-wider text-[10px]">Timestamp</th>
                          <th className="py-3.5 px-4 uppercase tracking-wider text-[10px]">Action Trigger</th>
                          <th className="py-3.5 px-4 uppercase tracking-wider text-[10px]">Actor User ID</th>
                          <th className="py-3.5 px-4 uppercase tracking-wider text-[10px]">Outcome</th>
                          <th className="py-3.5 px-4 uppercase tracking-wider text-[10px] w-2/5">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center italic text-gray-400">No logs generated yet.</td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50/50">
                              <td className="py-3 px-4 text-gray-500 font-mono text-[10px] whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-bold text-brand-purple-dark">
                                {log.action}
                              </td>
                              <td className="py-3 px-4 text-gray-600 font-mono text-[10px] whitespace-nowrap">
                                {log.userId.substring(0, 13)}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.outcome === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {log.outcome}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-600 leading-normal leading-relaxed">
                                {log.details}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

        </section>

      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-100 py-6 px-8 mt-12 text-center text-xs text-gray-400 font-semibold">
        &copy; {new Date().getFullYear()} Akirapa In-Home Care Systems. Secure Senior Portal Simulation Suite.
      </footer>
    </div>
  );
}

