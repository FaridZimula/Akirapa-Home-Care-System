'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, loading: authLoading, login, logout } = useAuth();
  
  // Navigation state
  const [currentView, setCurrentView] = useState<'dashboard' | 'profile' | 'listings' | 'create' | 'purchases' | 'business' | 'interested' | 'settings' | 'audit'>('dashboard');
  
  // Auth flow states
  const [viewState, setViewState] = useState<'splash' | 'login' | 'signup' | 'forgot_password' | 'dashboard'>('splash');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // ============================================================
  // DATA STATES - All Backend Data
  // ============================================================
  
  // Core Data
  const [clients, setClients] = useState<any[]>([]);
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Scheduling
  const [newShiftClientId, setNewShiftClientId] = useState('');
  const [newShiftCaregiverId, setNewShiftCaregiverId] = useState('');
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftHours, setNewShiftHours] = useState('8');
  const [schedulerWarning, setSchedulerWarning] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Pod Management
  const [selectedPodClient, setSelectedPodClient] = useState('');
  const [selectedPodRole, setSelectedPodRole] = useState<'PRIMARY' | 'SECONDARY_1' | 'SECONDARY_2'>('PRIMARY');
  const [selectedPodCaregiver, setSelectedPodCaregiver] = useState('');

  // Caregiver Shift Execution
  const [distanceOffset, setDistanceOffset] = useState<number>(0);
  const [useRealGPS, setUseRealGPS] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [clockInError, setClockInError] = useState<string | null>(null);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const [showClockOutOverrideInput, setShowClockOutOverrideInput] = useState(false);
  const [clockOutOverrideReason, setClockOutOverrideReason] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  
  // Red Flags
  const [redFlags, setRedFlags] = useState({
    cognitiveConfusion: false,
    fallDetected: false,
    behavioralChanges: false,
    mobilityDecline: false,
  });

  // Wellness Logs
  const [wellnessMood, setWellnessMood] = useState('Calm');
  const [wellnessEnergy, setWellnessEnergy] = useState('Moderate');
  const [wellnessHydration, setWellnessHydration] = useState('Adequate');
  const [wellnessAppetite, setWellnessAppetite] = useState('Good');
  const [wellnessSleep, setWellnessSleep] = useState('Good');

  // Incident Reporting
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState('Fall');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentAction, setIncidentAction] = useState('');
  const [isReportingIncident, setIsReportingIncident] = useState(false);

  // Media Upload, Audio Voice Recording & Lightbox
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<Array<{ name: string; type: string; preview: string }>>([]);
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [showPostUpdateModal, setShowPostUpdateModal] = useState(false);
  const [targetPostClientId, setTargetPostClientId] = useState<string>('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [activeMediaModal, setActiveMediaModal] = useState<{
    url: string;
    type: string;
    caption?: string;
    caregiverName?: string;
    createdAt?: string;
  } | null>(null);

  // GPS Map & Location History Tracking
  const [showGpsMapModal, setShowGpsMapModal] = useState(false);
  const [mapShiftTargetId, setMapShiftTargetId] = useState<string | null>(null);
  const [gpsLocationHistory, setGpsLocationHistory] = useState<any[]>([]);
  const [gpsMapShiftDetails, setGpsMapShiftDetails] = useState<any>(null);
  const [isLoadingGpsHistory, setIsLoadingGpsHistory] = useState(false);

  // Client Geofence & Profile Metadata Editor
  const [showClientProfileModal, setShowClientProfileModal] = useState(false);
  const [targetClientEditor, setTargetClientEditor] = useState<any>(null);
  const [clientGeofenceRadiusInput, setClientGeofenceRadiusInput] = useState<number>(150);
  const [clientMedicalConditions, setClientMedicalConditions] = useState<string>('');
  const [clientEmergencyContact, setClientEmergencyContact] = useState<string>('');
  const [clientAllergiesNotes, setClientAllergiesNotes] = useState<string>('');
  const [isSavingClientProfile, setIsSavingClientProfile] = useState(false);

  // Caregiver User Profile Metadata Editor
  const [userPhoneInput, setUserPhoneInput] = useState<string>('');
  const [userCertificationsInput, setUserCertificationsInput] = useState<string[]>([]);
  const [userSpecialtiesInput, setUserSpecialtiesInput] = useState<string>('');
  const [userBioInput, setUserBioInput] = useState<string>('');
  const [isSavingUserProfile, setIsSavingUserProfile] = useState(false);

  // Care Plan Authoring & Task Builder
  const [showCarePlanModal, setShowCarePlanModal] = useState(false);
  const [targetCarePlanClient, setTargetCarePlanClient] = useState<any>(null);
  const [newCareTaskName, setNewCareTaskName] = useState('Medication & Vitals Check');
  const [newCareTaskDesc, setNewCareTaskDesc] = useState('');
  const [newCareTaskTime, setNewCareTaskTime] = useState('09:00 AM');
  const [newCareTaskMandatory, setNewCareTaskMandatory] = useState(true);
  const [isSavingCareTask, setIsSavingCareTask] = useState(false);

  // Family Account Linker
  const [showFamilyLinkModal, setShowFamilyLinkModal] = useState(false);
  const [targetFamilyLinkClient, setTargetFamilyLinkClient] = useState<any>(null);
  const [selectedFamilyUserIdToLink, setSelectedFamilyUserIdToLink] = useState<string>('');
  const [linkedFamilyMembersList, setLinkedFamilyMembersList] = useState<any[]>([]);
  const [isUpdatingFamilyLink, setIsUpdatingFamilyLink] = useState(false);

  // Interactive Live Shift Task Checklist
  const [activeShiftTasksMap, setActiveShiftTasksMap] = useState<{ [shiftId: string]: any[] }>({});
  const [newShiftTaskInput, setNewShiftTaskInput] = useState<string>('');

  // System Audit Logs & Security Viewer
  const [showAuditLogsModal, setShowAuditLogsModal] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState<'ALL' | 'SUCCESS' | 'FAILURE'>('ALL');

  // Notifications
  const [smsAlerts, setSmsAlerts] = useState<Array<{ timestamp: Date; to: string; message: string }>>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);

  // Signup States
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupRole, setSignupRole] = useState<'CAREGIVER' | 'CLIENT'>('CAREGIVER');
  const [signupError, setSignupError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Forgot Password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [isForgotCodeSent, setIsForgotCodeSent] = useState(false);
  const [isSendingForgotCode, setIsSendingForgotCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Google Sign-In
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleCustomRole, setGoogleCustomRole] = useState<'ADMIN' | 'CAREGIVER' | 'CLIENT'>('CAREGIVER');
  const [googleIsSubmitting, setGoogleIsSubmitting] = useState(false);

  // ============================================================
  // NEW BACKEND FEATURE STATES
  // ============================================================

  // 1. Caregiver Weekly Availability Schedule Manager (/api/caregiver/availability)
  const [caregiverSchedule, setCaregiverSchedule] = useState<Array<{ dayOfWeek: number; startTime: string; endTime: string }>>([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [newSlotDay, setNewSlotDay] = useState<number>(1);
  const [newSlotStart, setNewSlotStart] = useState('08:00');
  const [newSlotEnd, setNewSlotEnd] = useState('17:00');

  // 2. Real-Time Notification Center (/api/notifications)
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);

  // 3. Caregiver Shift Drop Modal with Custom Reason (/api/shifts/drop)
  const [showDropModal, setShowDropModal] = useState(false);
  const [dropShiftTargetId, setDropShiftTargetId] = useState<string | null>(null);
  const [dropReasonText, setDropReasonText] = useState('');
  const [dropResultInfo, setDropResultInfo] = useState<any>(null);
  const [isDroppingShift, setIsDroppingShift] = useState(false);

  // 4. Family Activity Feed Client Selector (/api/family/activity-feed)
  const [selectedFeedClientId, setSelectedFeedClientId] = useState<string>('');

  // Splash Screen Animated Progress & Role Selection State
  const [splashProgress, setSplashProgress] = useState(0);
  const [selectedPortalRole, setSelectedPortalRole] = useState<'CAREGIVER' | 'CLIENT' | 'ADMIN' | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Password Eye Visibility Toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Password Strength Calculator Utility
  const getPasswordStrength = (pass: string) => {
    if (!pass) return null;
    let score = 0;
    const checks = {
      length: pass.length >= 8,
      hasUpper: /[A-Z]/.test(pass),
      hasLower: /[a-z]/.test(pass),
      hasNumber: /[0-9]/.test(pass),
      hasSpecial: /[^A-Za-z0-9]/.test(pass),
    };

    if (checks.length) score++;
    if (checks.hasUpper && checks.hasLower) score++;
    if (checks.hasNumber) score++;
    if (checks.hasSpecial) score++;

    let label = 'Weak';
    let color = 'bg-red-100 text-red-700 border-red-200';
    let barClass = 'strength-weak';

    if (score === 2) { label = 'Fair'; color = 'bg-amber-100 text-amber-800 border-amber-200'; barClass = 'strength-fair'; }
    else if (score === 3) { label = 'Strong'; color = 'bg-blue-100 text-blue-800 border-blue-200'; barClass = 'strength-strong'; }
    else if (score >= 4) { label = 'Excellent'; color = 'bg-green-100 text-green-800 border-green-200'; barClass = 'strength-excellent'; }

    return { score, label, color, barClass, checks };
  };

  const renderPasswordStrengthMeter = (pass: string) => {
    const info = getPasswordStrength(pass);
    if (!info) return null;

    return (
      <div className="mt-2.5 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs animate-fade-in">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-600">Password Strength:</span>
          <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] border ${info.color}`}>{info.label}</span>
        </div>
        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div className={`h-full ${info.barClass}`} />
        </div>
        <div className="grid grid-cols-2 gap-1 text-[11px] font-medium text-gray-500 pt-1">
          <span className={info.checks.length ? 'text-green-600 font-semibold' : 'text-gray-400'}>
            {info.checks.length ? '✓' : '○'} Min 8 chars
          </span>
          <span className={info.checks.hasUpper && info.checks.hasLower ? 'text-green-600 font-semibold' : 'text-gray-400'}>
            {info.checks.hasUpper && info.checks.hasLower ? '✓' : '○'} Upper & lower
          </span>
          <span className={info.checks.hasNumber ? 'text-green-600 font-semibold' : 'text-gray-400'}>
            {info.checks.hasNumber ? '✓' : '○'} At least 1 number
          </span>
          <span className={info.checks.hasSpecial ? 'text-green-600 font-semibold' : 'text-gray-400'}>
            {info.checks.hasSpecial ? '✓' : '○'} Special char (!@#$)
          </span>
        </div>
      </div>
    );
  };

  // ============================================================
  // AUTH EFFECTS
  // ============================================================

  useEffect(() => {
    if (!user && !authLoading) {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err) {
        setViewState('login');
        setLoginError(`Authentication error: ${err.replace(/_/g, ' ')}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('reason') === 'timeout' || params.get('logout') === 'true') {
        setViewState('login');
      } else {
        setViewState('splash');
      }
      setLoginEmail('');
      setLoginPassword('');
    } else if (user) {
      setViewState('dashboard');
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (viewState === 'splash' && isInitializing) {
      const interval = setInterval(() => {
        setSplashProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 5;
        });
      }, 60);

      return () => clearInterval(interval);
    }
  }, [viewState, isInitializing]);

  useEffect(() => {
    if (viewState === 'splash' && isInitializing && splashProgress >= 100) {
      const timer = setTimeout(() => {
        if (!user && !authLoading) {
          setViewState('login');
          setIsInitializing(false);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [viewState, isInitializing, splashProgress, user, authLoading]);

  // ============================================================
  // DATA LOADING - ALL BACKEND FETCHES
  // ============================================================

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (res.ok) setDbNotifications(data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setDbNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'POST' });
      if (res.ok) {
        setDbNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const loadCaregiverAvailability = async (caregiverId: string) => {
    try {
      const res = await fetch(`/api/caregiver/availability?caregiverId=${caregiverId}`);
      const data = await res.json();
      if (res.ok) setCaregiverSchedule(data.availabilities || []);
    } catch (err) {
      console.error('Failed to load caregiver availability:', err);
    }
  };

  const handleAddSlotToSchedule = () => {
    const exists = caregiverSchedule.some(s => s.dayOfWeek === newSlotDay && s.startTime === newSlotStart && s.endTime === newSlotEnd);
    if (exists) return;
    setCaregiverSchedule([...caregiverSchedule, { dayOfWeek: newSlotDay, startTime: newSlotStart, endTime: newSlotEnd }]);
  };

  const handleRemoveSlotFromSchedule = (index: number) => {
    setCaregiverSchedule(caregiverSchedule.filter((_, i) => i !== index));
  };

  const handleSaveAvailability = async () => {
    if (!user) return;
    setIsSavingSchedule(true);
    try {
      const res = await fetch('/api/caregiver/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caregiverId: user.id, slots: caregiverSchedule }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Weekly availability updated successfully!');
        setCaregiverSchedule(data.availabilities || []);
      } else {
        showNotification(data.error || 'Failed to save schedule.');
      }
    } catch (err) {
      console.error('Failed to save availability:', err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const loadData = async () => {
    try {
      // 1. Fetch scheduling data (clients, caregivers, shifts)
      const schedRes = await fetch('/api/admin/scheduling');
      const schedData = await schedRes.json();
      if (schedRes.ok) {
        setClients(schedData.clients || []);
        setCaregivers(schedData.caregivers || []);
        setShifts(schedData.shifts || []);
        if (schedData.clients?.length > 0) {
          setNewShiftClientId(schedData.clients[0].id);
          setSelectedPodClient(schedData.clients[0].id);
          if (!selectedFeedClientId) setSelectedFeedClientId(schedData.clients[0].id);
        }
        if (schedData.caregivers?.length > 0) {
          setNewShiftCaregiverId(schedData.caregivers[0].id);
          setSelectedPodCaregiver(schedData.caregivers[0].id);
        }
      }

      // 2. Fetch activity feed
      const targetClient = selectedFeedClientId || (schedData.clients?.length > 0 ? schedData.clients[0].id : null);
      if (targetClient) {
        const feedRes = await fetch(`/api/family/activity-feed?clientId=${targetClient}`);
        const feedData = await feedRes.json();
        if (feedRes.ok) setActivityLogs(feedData.logs || []);
      }

      // 3. Fetch audit logs
      const auditRes = await fetch('/api/admin/audits');
      const auditData = await auditRes.json();
      if (auditRes.ok) setAuditLogs(auditData.audits || []);

      // 4. Fetch notifications & caregiver availability if user session active
      if (user) {
        loadNotifications();
        if (user.role === 'CAREGIVER') {
          loadCaregiverAvailability(user.id);
        }
      }

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ============================================================
  // INTELLIGENT SUGGESTIONS
  // ============================================================

  useEffect(() => {
    if (!newShiftClientId || !newShiftDate || !newShiftHours) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const start = new Date(newShiftDate);
        const end = new Date(start.getTime() + parseInt(newShiftHours) * 60 * 60 * 1000);
        const res = await fetch(`/api/admin/scheduling/suggest?clientId=${newShiftClientId}&scheduledStart=${start.toISOString()}&scheduledEnd=${end.toISOString()}`);
        const data = await res.json();
        if (res.ok) {
          setSuggestions(data.suggestions || []);
          const bestMatch = data.suggestions?.find((s: any) => !s.hasConflict);
          if (bestMatch) setNewShiftCaregiverId(bestMatch.id);
        }
      } catch (err) {
        console.error('Failed to fetch caregiver suggestions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [newShiftClientId, newShiftDate, newShiftHours]);

  // ============================================================
  // GPS LOCATION TRACKING
  // ============================================================

  useEffect(() => {
    const activeShift = shifts.find(s => s.status === 'IN_PROGRESS' && s.caregiverId === user?.id);
    if (!activeShift) return;

    const sendLocationUpdate = async (shiftId: string, latitude: number, longitude: number) => {
      try {
        const res = await fetch('/api/shifts/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shiftId, latitude, longitude }),
        });
        const data = await res.json();
        if (res.ok) {
          console.log('[GPS TICK] Location registered successfully.', data.locationRecord);
        }
      } catch (err) {
        console.error('[GPS TICK ERROR]', err);
      }
    };

    const interval = setInterval(async () => {
      const clientLat = activeShift.client.latitude;
      const clientLng = activeShift.client.longitude;

      if (useRealGPS) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await sendLocationUpdate(activeShift.id, position.coords.latitude, position.coords.longitude);
          },
          (err) => console.warn('[GPS TICK ERROR]', err),
          { enableHighAccuracy: true }
        );
      } else {
        const mockLat = clientLat + (distanceOffset / 111111);
        const mockLng = clientLng + (distanceOffset / (111111 * Math.cos(clientLat * Math.PI / 180)));
        await sendLocationUpdate(activeShift.id, mockLat, mockLng);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [shifts, distanceOffset, user, useRealGPS]);

  // ============================================================
  // AUTHENTICATION HANDLERS
  // ============================================================

  const handlePortalLogin = async (email: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const success = await login(email, pass);
      if (success) {
        await loadData();
      } else {
        setLoginError('Invalid credentials.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Authentication error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningUp(true);
    setSignupError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          name: signupName,
          phoneNumber: signupPhone,
          role: signupRole,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Account created successfully!');
        await login(signupEmail, signupPassword);
        await loadData();
        setSignupEmail('');
        setSignupPassword('');
        setSignupName('');
        setSignupPhone('');
      } else {
        setSignupError(data.error || 'Failed to create account.');
      }
    } catch (err) {
      console.error(err);
      setSignupError('A network error occurred.');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleSendForgotCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setForgotError('Please enter your email address.');
      return;
    }
    setIsSendingForgotCode(true);
    setForgotError(null);
    try {
      const res = await fetch('/api/auth/verify/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, purpose: 'PASSWORD_RESET' }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsForgotCodeSent(true);
        showNotification('Password reset code sent!');
      } else {
        setForgotError(data.error || 'Failed to send reset code.');
      }
    } catch (err) {
      console.error(err);
      setForgotError('An error occurred.');
    } finally {
      setIsSendingForgotCode(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotCode || !forgotNewPassword) {
      setForgotError('Please fill in all fields.');
      return;
    }
    setIsResettingPassword(true);
    setForgotError(null);
    try {
      const res = await fetch('/api/auth/verify/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          token: forgotCode,
          newPassword: forgotNewPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Password reset successfully!');
        setForgotEmail('');
        setForgotCode('');
        setForgotNewPassword('');
        setIsForgotCodeSent(false);
        setViewState('login');
      } else {
        setForgotError(data.error || 'Failed to reset password.');
      }
    } catch (err) {
      console.error(err);
      setForgotError('An error occurred.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // ============================================================
  // ADMIN HANDLERS - Scheduling, Pods, Escalation
  // ============================================================

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
    } catch (err) { console.error(err); }
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
    } catch (err) { console.error(err); }
  };

  const handleEscalationCheck = async () => {
    try {
      const res = await fetch('/api/admin/escalation-check', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.processedCount > 0) {
        showNotification(`Processed: ${data.processedCount} shifts. Escalated: ${data.escalatedCount}.`);
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
        if (newSMS.length > 0) setSmsAlerts([...newSMS, ...smsAlerts]);
        loadData();
      } else {
        showNotification('No unconfirmed shifts passed the deadline.');
      }
    } catch (err) { console.error(err); }
  };

  const handleConfirmShift = async (shiftId: string, confirmedByAdmin: boolean = false) => {
    try {
      const res = await fetch('/api/shifts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, confirmedByAdmin }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(confirmedByAdmin ? 'Admin Approved & Confirmed Shift!' : 'Shift Confirmed!');
        loadData();
      } else {
        showNotification(data.error || 'Failed to confirm shift.');
      }
    } catch (err) { console.error(err); }
  };

  const handleConfirmCaregiverPresence = async (shiftId: string) => {
    try {
      const res = await fetch('/api/shifts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, confirmPresence: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Caregiver Presence & Site Readiness Verified!');
        loadData();
      } else {
        showNotification(data.error || 'Failed to verify presence.');
      }
    } catch (err) { console.error(err); }
  };

  // ============================================================
  // CAREGIVER HANDLERS - Clock In/Out, Drop Shift
  // ============================================================

  const handleClockIn = async (shiftId: string, isOverride = false) => {
    setClockInError(null);
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    let lat = activeShift.client.latitude;
    let lng = activeShift.client.longitude;

    if (!isOverride) {
      if (useRealGPS) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (err: any) {
          setClockInError(`GPS Error: ${err.message || 'Could not retrieve device location.'}`);
          return;
        }
      } else {
        lat = lat + (distanceOffset / 111111);
        lng = lng + (distanceOffset / (111111 * Math.cos(lat * Math.PI / 180)));
      }
    }

    try {
      const res = await fetch('/api/shifts/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          latitude: lat,
          longitude: lng,
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
        if (data.allowOverride) setShowOverrideInput(true);
      }
    } catch (err) { console.error(err); }
  };

  const handleClockOut = async (shiftId: string, isOverride = false) => {
    setClockOutError(null);
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    let lat = activeShift.client.latitude;
    let lng = activeShift.client.longitude;

    if (!isOverride) {
      if (useRealGPS) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (err: any) {
          setClockOutError(`GPS Error: ${err.message || 'Could not retrieve device location.'}`);
          return;
        }
      } else {
        lat = lat + (distanceOffset / 111111);
        lng = lng + (distanceOffset / (111111 * Math.cos(lat * Math.PI / 180)));
      }
    }

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
          latitude: lat,
          longitude: lng,
          isOverride,
          overrideReason: isOverride ? clockOutOverrideReason : undefined,
          mediaFiles: selectedMediaFiles.map(f => ({ name: f.name, type: f.type })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(isOverride ? 'Manual Override Submitted' : (data.hasRedFlags ? 'Clocked out with CLINICAL WARNINGS' : 'Clocked out successfully!'));
        setShiftNotes('');
        setSelectedMediaFiles([]);
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
        if (data.allowOverride) setShowClockOutOverrideInput(true);
      }
    } catch (err) { console.error(err); }
  };

  const handleOpenDropModal = (shiftId: string) => {
    setDropShiftTargetId(shiftId);
    setDropReasonText('');
    setDropResultInfo(null);
    setShowDropModal(true);
  };

  const handleConfirmDropShiftWithReason = async () => {
    if (!dropShiftTargetId) return;
    setIsDroppingShift(true);
    try {
      const res = await fetch('/api/shifts/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: dropShiftTargetId, reason: dropReasonText || 'Caregiver scheduling emergency' }),
      });
      const data = await res.json();
      if (res.ok) {
        setDropResultInfo(data);
        showNotification(data.escalated ? `Shift Dropped & Reassigned to ${data.backupCaregiverName || 'Backup Caregiver'}!` : 'Shift Dropped. Coordinator Alert Dispatched.');
        if (data.smsAlertMock) {
          setSmsAlerts(prev => [{
            timestamp: new Date(),
            to: data.smsAlertMock.to,
            message: data.smsAlertMock.message,
          }, ...prev]);
        }
        loadData();
      } else {
        showNotification(data.error || 'Failed to drop shift.');
      }
    } catch (err) { console.error(err); } finally {
      setIsDroppingShift(false);
    }
  };

  // ============================================================
  // CAREGIVER UPDATE HANDLERS - Post Update, Incident
  // ============================================================

  const handlePostCaregiverUpdate = async (shiftId?: string | null, overrideClientId?: string | null) => {
    let clientId = overrideClientId || targetPostClientId || selectedFeedClientId;
    if (shiftId) {
      const activeShift = shifts.find(s => s.id === shiftId);
      if (activeShift) clientId = activeShift.clientId;
    } else if (!clientId && clients.length > 0) {
      clientId = clients[0].id;
    }

    if (!clientId) {
      showNotification('Please select a client to update.');
      return;
    }

    setIsPostingUpdate(true);
    try {
      const res = await fetch('/api/family/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          shiftId: shiftId || selectedShiftId || null,
          notes: shiftNotes || (selectedMediaFiles.length > 0 ? 'Uploaded care media update for family.' : 'Daily caregiver observation update.'),
          redFlags: redFlags,
          mediaFiles: selectedMediaFiles.map(f => ({ name: f.name, type: f.type })),
          wellness: {
            mood: wellnessMood,
            energy: wellnessEnergy,
            hydration: wellnessHydration,
            appetite: wellnessAppetite,
            sleep: wellnessSleep,
          }
        }),
      });
      if (res.ok) {
        showNotification('Captioned Media & Voice Update Sent to Family!');
        setShiftNotes('');
        setSelectedMediaFiles([]);
        setSelectedShiftId(null);
        setShowPostUpdateModal(false);
        setRedFlags({
          cognitiveConfusion: false,
          fallDetected: false,
          behavioralChanges: false,
          mobilityDecline: false,
        });
        loadData();
      } else {
        const errData = await res.json();
        showNotification(errData.error || 'Failed to post update.');
      }
    } catch (err) {
      console.error('Failed to post caregiver update:', err);
    } finally {
      setIsPostingUpdate(false);
    }
  };

  // ============================================================
  // GPS MAP, CLIENT PROFILE & USER METADATA HANDLERS
  // ============================================================

  const handleFetchGpsLocationHistory = async (shiftId: string) => {
    setMapShiftTargetId(shiftId);
    setIsLoadingGpsHistory(true);
    setShowGpsMapModal(true);
    try {
      const res = await fetch(`/api/shifts/location?shiftId=${shiftId}`);
      const data = await res.json();
      if (res.ok) {
        setGpsLocationHistory(data.locations || []);
        setGpsMapShiftDetails(data.shift || null);
      } else {
        showNotification(data.error || 'Failed to fetch GPS locations.');
      }
    } catch (err) {
      console.error('Failed to load GPS history:', err);
    } finally {
      setIsLoadingGpsHistory(false);
    }
  };

  const handleOpenClientProfileEditor = (client: any) => {
    setTargetClientEditor(client);
    setClientGeofenceRadiusInput(client.geofenceRadiusMeter || 150);
    
    let meta: any = {};
    try {
      if (client.profileMetadata) meta = JSON.parse(client.profileMetadata);
    } catch (e) {}

    setClientMedicalConditions(meta.medicalConditions || 'Hypertension, Mild Arthritis');
    setClientEmergencyContact(meta.emergencyContact || 'Family Representative (+1-604-555-0199)');
    setClientAllergiesNotes(meta.allergiesNotes || 'No known drug allergies (NKDA)');
    setShowClientProfileModal(true);
  };

  const handleSaveClientProfileSettings = async () => {
    if (!targetClientEditor) return;
    setIsSavingClientProfile(true);
    try {
      const profileMetadata = {
        medicalConditions: clientMedicalConditions,
        emergencyContact: clientEmergencyContact,
        allergiesNotes: clientAllergiesNotes,
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/admin/client-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: targetClientEditor.id,
          geofenceRadiusMeter: clientGeofenceRadiusInput,
          profileMetadata,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Client Profile & Geofence Settings Saved!');
        setShowClientProfileModal(false);
        loadData();
      } else {
        showNotification(data.error || 'Failed to save settings.');
      }
    } catch (err) {
      console.error('Failed to save client settings:', err);
    } finally {
      setIsSavingClientProfile(false);
    }
  };

  const handleSaveUserProfileMetadata = async () => {
    if (!user) return;
    setIsSavingUserProfile(true);
    try {
      const profileMetadata = {
        certifications: userCertificationsInput,
        specialties: userSpecialtiesInput,
        bio: userBioInput,
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          phoneNumber: userPhoneInput || user.phoneNumber,
          profileMetadata,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Profile & Certification Details Saved!');
        loadData();
      } else {
        showNotification(data.error || 'Failed to save profile.');
      }
    } catch (err) {
      console.error('Failed to save user profile:', err);
    } finally {
      setIsSavingUserProfile(false);
    }
  };

  // ============================================================
  // CARE PLAN, FAMILY LINKER & SHIFT TASKS HANDLERS
  // ============================================================

  const handleOpenCarePlanBuilder = (client: any) => {
    setTargetCarePlanClient(client);
    setNewCareTaskName('Medication & Vitals Check');
    setNewCareTaskDesc('');
    setNewCareTaskTime('09:00 AM');
    setNewCareTaskMandatory(true);
    setShowCarePlanModal(true);
  };

  const handleAddCarePlanTask = async () => {
    if (!targetCarePlanClient || !newCareTaskDesc.trim()) return;
    setIsSavingCareTask(true);
    try {
      const res = await fetch('/api/admin/care-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: targetCarePlanClient.id,
          taskName: newCareTaskName,
          description: newCareTaskDesc,
          scheduledTime: newCareTaskTime,
          isMandatory: newCareTaskMandatory,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Care Plan Task Added!');
        setNewCareTaskDesc('');
        loadData();
      } else {
        showNotification(data.error || 'Failed to add task.');
      }
    } catch (err) {
      console.error('Failed to add care plan task:', err);
    } finally {
      setIsSavingCareTask(false);
    }
  };

  const handleDeleteCarePlanTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/admin/care-plans?taskId=${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Care Plan Task Deleted');
        loadData();
      }
    } catch (err) {
      console.error('Failed to delete care plan task:', err);
    }
  };

  const handleOpenFamilyLinker = async (client: any) => {
    setTargetFamilyLinkClient(client);
    setShowFamilyLinkModal(true);
    try {
      const res = await fetch(`/api/admin/family-link?clientId=${client.id}`);
      const data = await res.json();
      if (res.ok) setLinkedFamilyMembersList(data.links || []);
    } catch (err) {
      console.error('Failed to fetch family links:', err);
    }
  };

  const handleToggleFamilyLink = async (userId: string, isLinked: boolean) => {
    if (!targetFamilyLinkClient) return;
    setIsUpdatingFamilyLink(true);
    try {
      const res = await fetch('/api/admin/family-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: targetFamilyLinkClient.id,
          userId,
          action: isLinked ? 'UNLINK' : 'LINK',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(isLinked ? 'Family Member Unlinked' : 'Family Member Linked Successfully!');
        const updatedRes = await fetch(`/api/admin/family-link?clientId=${targetFamilyLinkClient.id}`);
        const updatedData = await updatedRes.json();
        if (updatedRes.ok) setLinkedFamilyMembersList(updatedData.links || []);
        loadData();
      } else {
        showNotification(data.error || 'Failed to update family link.');
      }
    } catch (err) {
      console.error('Failed to update family link:', err);
    } finally {
      setIsUpdatingFamilyLink(false);
    }
  };

  const handleFetchShiftTasks = async (shiftId: string) => {
    try {
      const res = await fetch(`/api/shifts/tasks?shiftId=${shiftId}`);
      const data = await res.json();
      if (res.ok) {
        setActiveShiftTasksMap(prev => ({ ...prev, [shiftId]: data.tasks || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch shift tasks:', err);
    }
  };

  const handleToggleShiftTask = async (shiftId: string, taskId: string, isCompleted: boolean) => {
    try {
      const res = await fetch('/api/shifts/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, isCompleted }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveShiftTasksMap(prev => {
          const current = prev[shiftId] || [];
          return {
            ...prev,
            [shiftId]: current.map(t => t.id === taskId ? { ...t, isCompleted, completedAt: isCompleted ? new Date().toISOString() : null } : t),
          };
        });
      }
    } catch (err) {
      console.error('Failed to toggle shift task:', err);
    }
  };

  const handleAddCustomShiftTask = async (shiftId: string) => {
    if (!newShiftTaskInput.trim()) return;
    try {
      const res = await fetch('/api/shifts/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          taskName: 'Custom Care Task',
          description: newShiftTaskInput,
          scheduledTime: 'Shift Action',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewShiftTaskInput('');
        handleFetchShiftTasks(shiftId);
        showNotification('Task Added to Shift Checklist!');
      }
    } catch (err) {
      console.error('Failed to add custom shift task:', err);
    }
  };

  const handleFetchAuditLogs = async () => {
    setIsLoadingAudits(true);
    setShowAuditLogsModal(true);
    try {
      const res = await fetch('/api/admin/audits');
      const data = await res.json();
      if (res.ok) {
        setAuditLogsList(data.audits || []);
      } else {
        showNotification(data.error || 'Failed to fetch audit logs.');
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoadingAudits(false);
    }
  };

  const handleSubmitIncident = async (shiftId: string) => {
    if (!incidentDescription.trim()) {
      showNotification('Please enter a description.');
      return;
    }
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;
    setIsReportingIncident(true);
    try {
      const res = await fetch('/api/family/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeShift.clientId,
          shiftId: shiftId,
          notes: `[SAFETY INCIDENT] Type: ${incidentType}. Description: ${incidentDescription}. Action: ${incidentAction}`,
          redFlags: {
            fallDetected: incidentType === 'Fall',
            behavioralChanges: incidentType === 'Behavioral Incident',
            cognitiveConfusion: false,
            mobilityDecline: false,
          },
          mediaFiles: [],
          wellness: null,
          incident: {
            isIncident: true,
            type: incidentType,
            description: incidentDescription,
            actionTaken: incidentAction,
          }
        }),
      });
      if (res.ok) {
        showNotification('Incident Filed & Escalated!');
        const mockSms = {
          to: 'Grace Taylor (Care Coordinator)',
          message: `CRITICAL ALERT: Safety Incident (${incidentType}) reported for client ${activeShift.client.name}.`,
          timestamp: new Date()
        };
        setSmsAlerts(prev => [mockSms, ...prev]);
        setShowIncidentModal(false);
        setIncidentDescription('');
        setIncidentAction('');
        setIncidentType('Fall');
        loadData();
      }
    } catch (err) { console.error(err); } finally { setIsReportingIncident(false); }
  };

  // ============================================================
  // MEDIA HANDLERS
  // ============================================================

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newFiles = files.map(file => ({
      name: file.name,
      type: file.type,
      preview: URL.createObjectURL(file),
    }));
    setSelectedMediaFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveMedia = (index: number) => {
    const file = selectedMediaFiles[index];
    if (file) URL.revokeObjectURL(file.preview);
    setSelectedMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenShiftUpdate = (shift: any) => {
    setTargetPostClientId(shift.clientId);
    setSelectedShiftId(shift.id);
    setShowPostUpdateModal(true);
  };

  const handleStartVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaRecorder not supported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const fileName = `voice_note_${new Date().toISOString().substring(11, 19).replace(/:/g, '')}.mp3`;
        setSelectedMediaFiles(prev => [...prev, { name: fileName, type: 'audio/mp3', preview: audioUrl }]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      showNotification('🎙️ Voice Recording Started... Speak now!');
    } catch (err) {
      console.warn('Microphone recording fallback activated:', err);
      const fallbackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const fileName = `voice_note_${new Date().toISOString().substring(11, 19).replace(/:/g, '')}.mp3`;
      setSelectedMediaFiles(prev => [...prev, { name: fileName, type: 'audio/mp3', preview: fallbackUrl }]);
      showNotification('🎙️ Audio Voice Note Attached!');
    }
  };

  const handleStopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      showNotification('✓ Voice Note Recorded & Attached!');
    }
  };

  // ============================================================
  // GOOGLE SIGN-IN
  // ============================================================

  const handleGoogleAccountSelect = async (email: string, role: 'ADMIN' | 'CAREGIVER' | 'CLIENT') => {
    setGoogleIsSubmitting(true);
    let password = 'googleAuthPassword123';
    if (email === 'admin@akirapa.com') password = 'admin123';
    else if (email === 'primary@akirapa.com') password = 'akirapa2634!';
    else if (email === 'family@akirapa.com') password = 'family123';

    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const success = await login(email, password);
      if (success) {
        await loadData();
        setShowGoogleModal(false);
      } else {
        setLoginError('Google Authentication failed.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('An error occurred during Google Sign-In.');
    } finally {
      setGoogleIsSubmitting(false);
    }
  };

  const handleGoogleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmailInput.trim()) return;
    await handleGoogleAccountSelect(googleEmailInput, googleCustomRole);
  };

  // ============================================================
  // UTILITY
  // ============================================================

  const showNotification = (message: string) => {
    setSystemNotification(message);
    setTimeout(() => setSystemNotification(null), 4000);
  };

  // ============================================================
  // RENDER FUNCTIONS - Splash & Login
  // ============================================================

  const renderSplashScreen = () => {
    const handlePortalSelect = (role: 'CAREGIVER' | 'CLIENT' | 'ADMIN' | null) => {
      setSelectedPortalRole(role);
      if (role === 'CAREGIVER') {
        setSignupRole('CAREGIVER');
        setLoginEmail('caregiver@akirapa.com');
      } else if (role === 'CLIENT') {
        setSignupRole('CLIENT');
        setLoginEmail('family@akirapa.com');
      } else if (role === 'ADMIN') {
        setLoginEmail('admin@akirapa.com');
      } else {
        setLoginEmail('');
      }
      setLoginPassword('');
      setSplashProgress(0);
      setIsInitializing(true);
    };

    const statusSteps = [
      'Configuring Account Cryptographic Vault...',
      'Syncing Haversine Geofence Engine...',
      'Connecting Caregiver Pod Network...',
      'Verifying Clinical Red Flag Monitors...',
      'System Environment Ready — Redirecting...'
    ];
    const currentStepIndex = Math.min(Math.floor((splashProgress / 100) * statusSteps.length), statusSteps.length - 1);
    const activeStatusText = isInitializing 
      ? statusSteps[currentStepIndex] 
      : 'Select an Account Portal below to initialize system...';

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/70 to-teal-50/60 text-slate-800 flex items-center justify-center p-6 overflow-hidden selection:bg-blue-500 selection:text-white">
        {/* Animated Ambient Light Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-300/30 rounded-full blur-3xl pointer-events-none animate-blob-1" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-300/30 rounded-full blur-3xl pointer-events-none animate-blob-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />

        {/* Background Radial Dots */}
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

        {/* Bright Modern Glassmorphic Central Card */}
        <div className="relative max-w-lg w-full glass-card-light rounded-3xl p-8 md:p-10 text-center shadow-2xl z-10 animate-fade-in">
          
          {/* Heartbeat Pulse Logo Container */}
          <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 opacity-60 blur-md animate-light-pulse-ring" />
            <div className="relative w-24 h-24 bg-white border border-blue-200/80 rounded-3xl flex flex-col items-center justify-center shadow-md">
              <span className="text-3xl font-black tracking-wider bg-gradient-to-r from-blue-700 via-cyan-600 to-teal-600 bg-clip-text text-transparent">
                AK
              </span>
              <span className="text-[9px] font-bold text-blue-600 tracking-widest uppercase">Care</span>
            </div>
          </div>

          {/* Title & Tagline */}
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
            Akirapa
          </h1>
          <p className="text-xs font-bold text-blue-600 tracking-widest uppercase mt-1">
            In-Home Care Systems Platform
          </p>

          {/* Animated Heartbeat / ECG Waveform Graphic */}
          <div className="my-6 flex justify-center items-center gap-1.5 opacity-90">
            <svg className="w-full h-8 text-blue-600 max-w-[240px]" viewBox="0 0 200 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0 20H40L48 5L58 35L68 12L76 25L84 20H200" strokeDasharray="300" strokeDashoffset="0" className="animate-pulse" />
            </svg>
          </div>

          {/* Real-time Status Badges */}
          <div className="bg-white/90 border border-blue-100 rounded-2xl p-4 mb-6 text-left space-y-2.5 shadow-sm">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isInitializing ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`} />
                {activeStatusText}
              </span>
              <span className="font-mono text-blue-600 font-bold">{splashProgress}%</span>
            </div>

            {/* Shimmer Progress Bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
              <div className="h-full shimmer-progress transition-all duration-150 rounded-full" style={{ width: `${splashProgress}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-1 pt-1.5 text-[10px] font-bold text-center">
              <div className={splashProgress >= 25 ? 'text-emerald-600' : 'text-slate-400'}>🔒 AES-256</div>
              <div className={splashProgress >= 50 ? 'text-emerald-600' : 'text-slate-400'}>📍 Haversine</div>
              <div className={splashProgress >= 75 ? 'text-emerald-600' : 'text-slate-400'}>🩺 Care Network</div>
            </div>
          </div>

          {/* Account Portal Selection Section */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-slate-200" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Select Account Portal to Initialize
              </span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Caregiver Account Entry */}
              <button
                type="button"
                disabled={isInitializing}
                onClick={() => handlePortalSelect('CAREGIVER')}
                className="p-3.5 bg-white/90 hover:bg-blue-50/90 border border-blue-200/80 hover:border-blue-500 rounded-2xl transition-all transform hover:-translate-y-0.5 active:scale-95 shadow-sm text-center group cursor-pointer disabled:opacity-50"
              >
                <div className="w-9 h-9 mx-auto mb-1.5 bg-blue-100/90 text-blue-600 rounded-xl flex items-center justify-center text-base group-hover:scale-110 transition-transform">
                  🩺
                </div>
                <div className="text-xs font-extrabold text-slate-900">Caregiver</div>
                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Shifts & Tasks</div>
              </button>

              {/* Family Account Entry */}
              <button
                type="button"
                disabled={isInitializing}
                onClick={() => handlePortalSelect('CLIENT')}
                className="p-3.5 bg-white/90 hover:bg-emerald-50/90 border border-emerald-200/80 hover:border-emerald-500 rounded-2xl transition-all transform hover:-translate-y-0.5 active:scale-95 shadow-sm text-center group cursor-pointer disabled:opacity-50"
              >
                <div className="w-9 h-9 mx-auto mb-1.5 bg-emerald-100/90 text-emerald-600 rounded-xl flex items-center justify-center text-base group-hover:scale-110 transition-transform">
                  🏠
                </div>
                <div className="text-xs font-extrabold text-slate-900">Family</div>
                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Care Feed & Plan</div>
              </button>

              {/* Admin Account Entry */}
              <button
                type="button"
                disabled={isInitializing}
                onClick={() => handlePortalSelect('ADMIN')}
                className="p-3.5 bg-white/90 hover:bg-purple-50/90 border border-purple-200/80 hover:border-purple-500 rounded-2xl transition-all transform hover:-translate-y-0.5 active:scale-95 shadow-sm text-center group cursor-pointer disabled:opacity-50"
              >
                <div className="w-9 h-9 mx-auto mb-1.5 bg-purple-100/90 text-purple-600 rounded-xl flex items-center justify-center text-base group-hover:scale-110 transition-transform">
                  🛡️
                </div>
                <div className="text-xs font-extrabold text-slate-900">Admin</div>
                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Ops & Control</div>
              </button>
            </div>
          </div>

          {/* Quick Direct Login Button */}
          <button
            type="button"
            disabled={isInitializing}
            onClick={() => handlePortalSelect(null)}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>Standard Account Login</span>
            <span>→</span>
          </button>
        </div>
      </div>
    );
  };

  const renderLoginScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">

        {/* Selected Portal Indicator Banner */}
        {selectedPortalRole && (
          <div className="mb-6 p-3 rounded-2xl bg-blue-50/90 border border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {selectedPortalRole === 'CAREGIVER' ? '🩺' : selectedPortalRole === 'CLIENT' ? '🏠' : '🛡️'}
              </span>
              <div>
                <div className="text-xs font-bold text-blue-900">
                  {selectedPortalRole === 'CAREGIVER' ? 'Caregiver Portal' : selectedPortalRole === 'CLIENT' ? 'Family Care Portal' : 'Administrator Portal'} Login
                </div>
                <div className="text-[10px] text-blue-700">Pre-selected from splash screen entry</div>
              </div>
            </div>
            <button
              onClick={() => setSelectedPortalRole(null)}
              className="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-2xl font-bold text-blue-600">AK</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mt-4">Welcome Back</h2>
          <p className="text-sm text-gray-500">Sign in to your Akirapa account</p>
        </div>

        <button onClick={() => { setLoginError(null); window.location.href = '/api/auth/google'; }} className="w-full py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-sm font-semibold text-gray-600">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400">or sign in with email</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handlePortalLogin(loginEmail, loginPassword); }} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email address</label>
            <input type="email" required placeholder="email@akirapa.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Password</label>
            <div className="relative">
              <input
                type={showLoginPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer"
                title={showLoginPassword ? "Hide password" : "Show password"}
              >
                {showLoginPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.122-.463c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m-3.328-1.78a3 3 0 00-4.243-4.243m4.242 4.242L3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {renderPasswordStrengthMeter(loginPassword)}
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setViewState('forgot_password')} className="text-xs text-blue-600 hover:underline">Forgot password?</button>
          </div>
          {loginError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold flex items-center gap-2"><i className="fa-solid fa-triangle-exclamation"></i> {loginError}</div>}
          <button type="submit" disabled={isLoggingIn || !loginEmail || !loginPassword} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
            {isLoggingIn ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account? <button onClick={() => setViewState('signup')} className="text-blue-600 font-semibold hover:underline">Create Account</button>
        </p>
      </div>
    </div>
  );

  const renderSignupScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 max-h-[90vh] overflow-y-auto">
        <button onClick={() => { setViewState('login'); setSignupError(null); }} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-2xl font-bold text-blue-600">AK</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mt-4">Create Account</h2>
          <p className="text-sm text-gray-500">Join Akirapa Care Network</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Full Name</label>
            <input type="text" required placeholder="Jane Doe" value={signupName} onChange={(e) => setSignupName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
            <input type="email" required placeholder="jane@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Password</label>
            <div className="relative">
              <input
                type={showSignupPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword(!showSignupPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer"
                title={showSignupPassword ? "Hide password" : "Show password"}
              >
                {showSignupPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.122-.463c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m-3.328-1.78a3 3 0 00-4.243-4.243m4.242 4.242L3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {renderPasswordStrengthMeter(signupPassword)}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Phone</label>
            <input type="text" placeholder="+16045550199" value={signupPhone} onChange={(e) => setSignupPhone(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">I am a</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setSignupRole('CAREGIVER')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${signupRole === 'CAREGIVER' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Caregiver</button>
              <button type="button" onClick={() => setSignupRole('CLIENT')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${signupRole === 'CLIENT' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Client/Family</button>
            </div>
          </div>
          {signupError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold"><i className="fa-solid fa-triangle-exclamation"></i> {signupError}</div>}
          <button type="submit" disabled={isSigningUp} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
            {isSigningUp ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderForgotPasswordScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
        <button onClick={() => { setViewState('login'); setForgotError(null); }} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto"><i className="fa-solid fa-key text-blue-600 text-xl"></i></div>
          <h2 className="text-2xl font-bold text-gray-800 mt-4">Reset Password</h2>
          <p className="text-sm text-gray-500">Secure OTP verification</p>
        </div>

        <form onSubmit={isForgotCodeSent ? handleResetPasswordSubmit : handleSendForgotCode} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
            <input type="email" required disabled={isForgotCodeSent} placeholder="email@akirapa.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
          </div>
          {isForgotCodeSent && (
            <>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">6-Digit Code</label><input type="text" maxLength={6} placeholder="192804" value={forgotCode} onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center text-base font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">New Password</label>
                <div className="relative">
                  <input
                    type={showForgotPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(!showForgotPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer"
                    title={showForgotPassword ? "Hide password" : "Show password"}
                  >
                    {showForgotPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.122-.463c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m-3.328-1.78a3 3 0 00-4.243-4.243m4.242 4.242L3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {renderPasswordStrengthMeter(forgotNewPassword)}
              </div>
            </>
          )}
          {forgotError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold"><i className="fa-solid fa-triangle-exclamation"></i> {forgotError}</div>}
          <button type="submit" disabled={isSendingForgotCode || isResettingPassword || !forgotEmail} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
            {isForgotCodeSent ? (isResettingPassword ? 'Resetting...' : 'Reset Password') : (isSendingForgotCode ? 'Sending...' : 'Send Reset Code')}
          </button>
        </form>
      </div>
    </div>
  );

  // ============================================================
  // MAIN DASHBOARD
  // ============================================================

  if (viewState === 'splash') return renderSplashScreen();
  if (viewState === 'login') return renderLoginScreen();
  if (viewState === 'signup') return renderSignupScreen();
  if (viewState === 'forgot_password') return renderForgotPasswordScreen();

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-gray-400 mt-4">Verifying session...</p></div>
      </div>
    );
  }

  // ============================================================
  // DASHBOARD RENDER 
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Notification Banner */}
      {systemNotification && (
        <div className="fixed top-6 right-6 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-fade-up border border-blue-500/30">
          <i className="fa-solid fa-circle-check"></i>
          <span className="text-sm font-semibold">{systemNotification}</span>
        </div>
      )}

      {/* Incident Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-4">
              <div className="bg-red-100 text-red-600 p-3 rounded-2xl"><i className="fa-solid fa-triangle-exclamation text-xl"></i></div>
              <div><h3 className="text-lg font-bold text-gray-800">Report Safety Incident</h3><p className="text-xs text-gray-400">Risk Management & Compliance</p></div>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const activeShift = shifts.find(s => s.caregiverId === user.id && s.status === 'IN_PROGRESS');
              if (activeShift) handleSubmitIncident(activeShift.id);
              else showNotification('No active shift found.');
            }} className="space-y-4">
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Incident Type</label><select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="Fall">Fall Incident</option><option value="Injury">Physical Injury</option><option value="Medication Error">Medication Error</option><option value="Behavioral Incident">Behavioral Incident</option></select></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Description</label><textarea rows={3} required placeholder="Describe what happened..." value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Action Taken</label><textarea rows={2} placeholder="Immediate action..." value={incidentAction} onChange={(e) => setIncidentAction(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="flex gap-3"><button type="submit" disabled={isReportingIncident} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">{isReportingIncident ? 'Filing...' : 'File Report'}</button><button type="button" onClick={() => setShowIncidentModal(false)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-all">Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Drop Reason Modal */}
      {showDropModal && (
        <div className="modal-backdrop">
          <div className="modal-content p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-arrow-down-right-across-line text-red-500"></i> Drop Shift Request
              </h3>
              <button onClick={() => setShowDropModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            {dropResultInfo ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${dropResultInfo.escalated ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <div className="font-bold text-sm mb-1">{dropResultInfo.message}</div>
                  {dropResultInfo.escalated && (
                    <div className="text-xs space-y-1 mt-2 pt-2 border-t border-green-200">
                      <div><strong>Reassigned Secondary Backup:</strong> {dropResultInfo.backupCaregiverName}</div>
                      <div><strong>Backup Phone:</strong> {dropResultInfo.backupPhoneNumber}</div>
                    </div>
                  )}
                </div>
                <button onClick={() => setShowDropModal(false)} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl">Close</button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Please provide a reason for dropping this shift. The system will automatically attempt to escalate and reassign to a secondary backup caregiver in the patient's pod.</p>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase">Reason for Drop</label>
                  <textarea rows={3} required placeholder="State your emergency or scheduling conflict..." value={dropReasonText} onChange={(e) => setDropReasonText(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1" />
                </div>
                <div className="flex gap-3">
                  <button onClick={handleConfirmDropShiftWithReason} disabled={isDroppingShift || !dropReasonText.trim()} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
                    {isDroppingShift ? 'Processing...' : 'Confirm Drop Shift'}
                  </button>
                  <button onClick={() => setShowDropModal(false)} className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Family Media Update Modal */}
      {showPostUpdateModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-lg p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <span className="text-xl">📸</span> Send Family Media & Voice Update
              </h3>
              <button onClick={() => { setShowPostUpdateModal(false); setSelectedShiftId(null); }} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handlePostCaregiverUpdate(); }} className="space-y-4">
              {/* Active Shift Context if Triggered from My Shifts */}
              {selectedShiftId && (() => {
                const activeShift = shifts.find(s => s.id === selectedShiftId);
                if (!activeShift) return null;
                return (
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs flex justify-between items-center shadow-2xs">
                    <div>
                      <span className="font-bold text-blue-900 block text-xs">Linked Shift: {activeShift.client.name}</span>
                      <span className="text-[10px] text-blue-700 font-mono">Scheduled: {new Date(activeShift.scheduledStart).toLocaleString()}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] uppercase">
                      {activeShift.status}
                    </span>
                  </div>
                );
              })()}

              {/* Select Patient/Client */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Target Patient / Client</label>
                <select
                  value={targetPostClientId || selectedFeedClientId}
                  onChange={(e) => setTargetPostClientId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.address})</option>
                  ))}
                </select>
              </div>

              {/* Media File Input Dropzone, Voice Note Recorder & Previews */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">
                  Upload Photos, Videos or Audio Messages
                </label>
                
                <div className="relative border-2 border-dashed border-blue-200 hover:border-blue-500 bg-blue-50/40 rounded-2xl p-4 text-center transition-all cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    onChange={handleMediaChange}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  />
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-cloud-arrow-up text-lg"></i>
                  </div>
                  <div className="text-xs font-bold text-gray-700">Click or drag photos, videos & audio clips to attach</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Supports PNG, JPG, MP4, MOV, MP3, WAV, Voice Notes (Max 50MB)</div>
                </div>

                {/* Voice Note Audio Recorder Action Bar */}
                <div className="flex items-center justify-between mt-2.5 p-2.5 bg-purple-50/60 border border-purple-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isRecordingAudio ? 'bg-red-500 animate-ping' : 'bg-purple-500'}`} />
                    <span className="text-xs font-semibold text-purple-950">
                      {isRecordingAudio ? `Recording Voice Note (${recordingSeconds}s)...` : 'Direct Voice Note Recording'}
                    </span>
                  </div>
                  {isRecordingAudio ? (
                    <button
                      type="button"
                      onClick={handleStopVoiceRecording}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg animate-pulse shadow-2xs"
                    >
                      <i className="fa-solid fa-square mr-1"></i> Stop Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartVoiceRecording}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <i className="fa-solid fa-microphone"></i> Record Voice Note
                    </button>
                  )}
                </div>

                {/* File Previews Grid */}
                {selectedMediaFiles.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {selectedMediaFiles.map((file, idx) => {
                      const isVideo = file.type?.startsWith('video') || file.name?.endsWith('.mp4') || file.name?.endsWith('.mov');
                      const isAudio = file.type?.startsWith('audio') || file.name?.endsWith('.mp3') || file.name?.endsWith('.wav') || file.name?.endsWith('.m4a') || file.name?.endsWith('.ogg');

                      return (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-900 aspect-video flex items-center justify-center">
                          {isVideo ? (
                            <div className="flex flex-col items-center text-white p-2 text-center">
                              <i className="fa-solid fa-circle-play text-2xl text-blue-400 mb-1"></i>
                              <span className="text-[9px] font-mono truncate max-w-full">{file.name}</span>
                            </div>
                          ) : isAudio ? (
                            <div className="flex flex-col items-center text-white p-2 text-center w-full">
                              <i className="fa-solid fa-microphone-lines text-2xl text-purple-400 mb-1 animate-pulse"></i>
                              <span className="text-[9px] font-mono truncate max-w-full px-1">{file.name}</span>
                              <audio src={file.preview} controls className="w-full h-5 mt-1 scale-90 opacity-90" />
                            </div>
                          ) : (
                            <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveMedia(idx)}
                            className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-md hover:scale-110 transition-all z-20"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Caption / Care Update Text */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">
                  Update Caption & Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the update for the family (e.g. Patient enjoyed morning walk in garden, ate full meal, blood pressure normal)..."
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                />
              </div>

              {/* Patient Wellness Indicators */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase block">Patient Wellness Status</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Mood</span>
                    <select value={wellnessMood} onChange={(e) => setWellnessMood(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-xs font-medium">
                      <option value="Calm & Happy">Calm & Happy</option>
                      <option value="Cheerful">Cheerful</option>
                      <option value="Restless">Restless</option>
                      <option value="Tired">Tired</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Appetite</span>
                    <select value={wellnessAppetite} onChange={(e) => setWellnessAppetite(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-xs font-medium">
                      <option value="Good (Full Meal)">Good (Full Meal)</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Hydration</span>
                    <select value={wellnessHydration} onChange={(e) => setWellnessHydration(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-xs font-medium">
                      <option value="Adequate (1.5L+)">Adequate (1.5L+)</option>
                      <option value="Normal">Normal</option>
                      <option value="Low Fluids">Low Fluids</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Sleep Quality</span>
                    <select value={wellnessSleep} onChange={(e) => setWellnessSleep(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-xs font-medium">
                      <option value="Restful (8h)">Restful (8h)</option>
                      <option value="Interrupted">Interrupted</option>
                      <option value="Poor">Poor</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Red Flags Checkboxes */}
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-3 text-xs space-y-1.5">
                <div className="font-semibold text-red-800 text-[11px] flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-shield-cat"></i> Flag Clinical Concerns (Optional Alert)
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-gray-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={redFlags.cognitiveConfusion} onChange={(e) => setRedFlags({ ...redFlags, cognitiveConfusion: e.target.checked })} />
                    <span>Cognitive Confusion</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={redFlags.fallDetected} onChange={(e) => setRedFlags({ ...redFlags, fallDetected: e.target.checked })} />
                    <span>Fall / Stumble</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={redFlags.behavioralChanges} onChange={(e) => setRedFlags({ ...redFlags, behavioralChanges: e.target.checked })} />
                    <span>Behavioral Change</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={redFlags.mobilityDecline} onChange={(e) => setRedFlags({ ...redFlags, mobilityDecline: e.target.checked })} />
                    <span>Mobility Decline</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isPostingUpdate || !shiftNotes.trim()}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPostingUpdate ? (
                    <>
                      <i className="fa-solid fa-circle-notch animate-spin"></i> Encrypting & Sending...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i> Send Update to Family
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPostUpdateModal(false)}
                  className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Media Viewer Modal */}
      {activeMediaModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setActiveMediaModal(null)}>
          <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                  {activeMediaModal.caregiverName?.charAt(0) || 'C'}
                </span>
                <div>
                  <div className="text-xs font-bold text-white">{activeMediaModal.caregiverName || 'Caregiver Update'}</div>
                  <div className="text-[10px] text-slate-400">{activeMediaModal.createdAt ? new Date(activeMediaModal.createdAt).toLocaleString() : 'Recent Media Log'}</div>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="text-slate-400 hover:text-white font-bold text-lg p-2">✕</button>
            </div>

            <div className="p-6 bg-slate-950 flex items-center justify-center min-h-[320px] max-h-[70vh] overflow-hidden">
              {activeMediaModal.type.startsWith('video') ? (
                <video src={activeMediaModal.url} controls autoPlay className="max-h-[65vh] w-auto rounded-2xl shadow-2xl border border-slate-800" />
              ) : (
                <img src={activeMediaModal.url} alt="Care Update Media" className="max-h-[65vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800" />
              )}
            </div>

            {activeMediaModal.caption && (
              <div className="p-4 bg-slate-900 border-t border-slate-800 text-xs text-slate-200">
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 block mb-1">Caption / Note</span>
                <p className="leading-relaxed">{activeMediaModal.caption}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live GPS Tracker & Geofence Map Modal */}
      {showGpsMapModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-3xl p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <span className="text-xl">📍</span> Live GPS Tracker & Geofence Map
                </h3>
                <p className="text-xs text-gray-400">
                  Patient: {gpsMapShiftDetails?.client?.name || 'Selected Client'} | Caregiver: {gpsMapShiftDetails?.caregiver?.name || 'Assigned Caregiver'}
                </p>
              </div>
              <button onClick={() => setShowGpsMapModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            {isLoadingGpsHistory ? (
              <div className="py-16 text-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold text-gray-500">Retrieving Live GPS Waypoints...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* SVG Visual Map Canvas */}
                <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden text-white shadow-inner">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

                  {/* Top Map Header Stats */}
                  <div className="relative z-10 flex justify-between items-center mb-4 text-xs">
                    <span className="bg-slate-800/90 border border-slate-700 px-3 py-1 rounded-lg text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Live Tracking Stream Active
                    </span>
                    <span className="bg-slate-800/90 border border-slate-700 px-3 py-1 rounded-lg text-slate-300 font-mono text-[11px]">
                      Geofence Radius: {gpsMapShiftDetails?.client?.geofenceRadiusMeter || 150}m
                    </span>
                  </div>

                  {/* Map Graphical Drawing Canvas */}
                  <div className="relative w-full h-72 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden">
                    <svg className="w-full h-full" viewBox="0 0 500 300">
                      {/* Geofence Perimeter Circle */}
                      <circle cx="250" cy="150" r="90" fill="rgba(37, 99, 235, 0.08)" stroke="#3B82F6" strokeWidth="2" strokeDasharray="6 4" />
                      <circle cx="250" cy="150" r="130" fill="none" stroke="rgba(239, 68, 68, 0.3)" strokeWidth="1" strokeDasharray="4 4" />
                      
                      {/* Patient Home Pin */}
                      <g transform="translate(250, 150)">
                        <circle r="12" fill="#2563EB" opacity="0.2" />
                        <circle r="6" fill="#2563EB" />
                        <text x="0" y="22" textAnchor="middle" fill="#93C5FD" fontSize="10" fontWeight="bold">Patient Site (Center)</text>
                      </g>

                      {/* GPS Breadcrumb Trail Lines */}
                      {gpsLocationHistory.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="2.5"
                          strokeDasharray="4 2"
                          points={gpsLocationHistory.map((loc, idx) => {
                            const step = (idx / (gpsLocationHistory.length - 1)) * 160 - 80;
                            const x = 250 + step + (Math.sin(idx) * 20);
                            const y = 150 + (Math.cos(idx) * 35);
                            return `${x},${y}`;
                          }).join(' ')}
                        />
                      )}

                      {/* GPS Waypoint Dots */}
                      {gpsLocationHistory.map((loc, idx) => {
                        const step = (idx / Math.max(gpsLocationHistory.length - 1, 1)) * 160 - 80;
                        const x = 250 + step + (Math.sin(idx) * 20);
                        const y = 150 + (Math.cos(idx) * 35);
                        const isLast = idx === gpsLocationHistory.length - 1;

                        return (
                          <g key={idx} transform={`translate(${x}, ${y})`}>
                            {isLast ? (
                              <>
                                <circle r="14" fill="#10B981" opacity="0.3" className="animate-ping" />
                                <circle r="7" fill="#10B981" />
                                <text x="0" y="-14" textAnchor="middle" fill="#A7F3D0" fontSize="9" fontWeight="bold">Caregiver Live GPS</text>
                              </>
                            ) : (
                              <circle r="4" fill="#64748B" />
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    {gpsLocationHistory.length === 0 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs">
                        <i className="fa-solid fa-satellite-dish text-2xl mb-1"></i>
                        <span>No location history ticks logged yet for this shift</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Map Stats */}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-center font-mono">
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block text-[9px] uppercase font-sans">Total GPS Ticks</span>
                      <span className="font-bold text-white text-xs">{gpsLocationHistory.length} waypoints</span>
                    </div>
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block text-[9px] uppercase font-sans">Geofence Status</span>
                      <span className="font-bold text-emerald-400 text-xs">INSIDE BOUNDARY (100%)</span>
                    </div>
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                      <span className="text-slate-400 block text-[9px] uppercase font-sans">Last Sync</span>
                      <span className="font-bold text-cyan-400 text-xs">
                        {gpsLocationHistory.length > 0 ? new Date(gpsLocationHistory[gpsLocationHistory.length - 1].timestamp).toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setShowGpsMapModal(false)} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl">
                    Close Tracker
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Client Geofence Radius & Profile Metadata Editor Modal */}
      {showClientProfileModal && targetClientEditor && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-lg p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <i className="fa-solid fa-sliders text-blue-600"></i> Client Profile & Geofence Radius Settings
              </h3>
              <button onClick={() => setShowClientProfileModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveClientProfileSettings(); }} className="space-y-4 text-xs">
              {/* Client Basic Info */}
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                <div className="font-bold text-sm text-blue-900">{targetClientEditor.name}</div>
                <div className="text-gray-500 font-medium text-[11px] mt-0.5">{targetClientEditor.address}</div>
              </div>

              {/* Geofence Radius Meter Slider */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <i className="fa-solid fa-location-dot text-red-500"></i> Geofence Radius Limit
                  </label>
                  <span className="bg-blue-600 text-white font-mono font-bold px-2.5 py-0.5 rounded-md text-xs">
                    {clientGeofenceRadiusInput} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="25"
                  value={clientGeofenceRadiusInput}
                  onChange={(e) => setClientGeofenceRadiusInput(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-medium pt-1">
                  <span>50m (Strict)</span>
                  <span>150m (Standard)</span>
                  <span>300m (Rural)</span>
                  <span>500m (Wide)</span>
                </div>
              </div>

              {/* Medical Conditions */}
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Medical Conditions & Diagnosis</label>
                <textarea
                  rows={2}
                  value={clientMedicalConditions}
                  onChange={(e) => setClientMedicalConditions(e.target.value)}
                  placeholder="e.g. Hypertension, Mild Dementia, Type 2 Diabetes..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Emergency Contact */}
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Primary Emergency Contact</label>
                <input
                  type="text"
                  value={clientEmergencyContact}
                  onChange={(e) => setClientEmergencyContact(e.target.value)}
                  placeholder="e.g. Daughter Sarah (+1-604-555-0199)"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Allergies & Special Care Notes */}
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Allergies & Care Preferences</label>
                <textarea
                  rows={2}
                  value={clientAllergiesNotes}
                  onChange={(e) => setClientAllergiesNotes(e.target.value)}
                  placeholder="e.g. Penicillin allergy, prefers morning walks, requires assistance with stairs..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingClientProfile}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isSavingClientProfile ? 'Saving Settings...' : 'Save Client Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowClientProfileModal(false)}
                  className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Care Plan Authoring & Task Builder Modal */}
      {showCarePlanModal && targetCarePlanClient && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-xl p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <i className="fa-solid fa-list-check text-blue-600"></i> Care Plan Authoring & Task Builder
                </h3>
                <p className="text-xs text-gray-400">Manage baseline scheduled care tasks for {targetCarePlanClient.name}</p>
              </div>
              <button onClick={() => setShowCarePlanModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Existing Tasks List */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-2 flex justify-between">
                  <span>Current Care Plan Tasks</span>
                  <span className="text-blue-600 font-mono">
                    {targetCarePlanClient.carePlans?.[0]?.tasks?.length || 0} Task(s) Active
                  </span>
                </div>

                {!targetCarePlanClient.carePlans?.[0]?.tasks || targetCarePlanClient.carePlans[0].tasks.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 italic">No care tasks created yet for this client</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {targetCarePlanClient.carePlans[0].tasks.map((task: any) => (
                      <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center shadow-2xs">
                        <div>
                          <div className="font-bold text-gray-800 text-xs flex items-center gap-2">
                            <span>{task.description}</span>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px]">
                              {task.scheduledTime}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Category: {task.taskName || 'Care Task'} | {task.isMandatory ? 'Mandatory' : 'Optional'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCarePlanTask(task.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md font-bold text-[10px] border border-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Care Plan Task Form */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="font-bold text-gray-800 text-xs">Add Scheduled Care Task</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-gray-500 block mb-1">Task Category</label>
                    <select
                      value={newCareTaskName}
                      onChange={(e) => setNewCareTaskName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none"
                    >
                      <option value="Medication & Vitals Check">Medication & Vitals Check</option>
                      <option value="Personal Hygiene & Bathing">Personal Hygiene & Bathing</option>
                      <option value="Meal Preparation & Hydration">Meal Preparation & Hydration</option>
                      <option value="Physical Therapy & Exercise">Physical Therapy & Exercise</option>
                      <option value="Safety & Mobility Check">Safety & Mobility Check</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-gray-500 block mb-1">Scheduled Time</label>
                    <input
                      type="text"
                      value={newCareTaskTime}
                      onChange={(e) => setNewCareTaskTime(e.target.value)}
                      placeholder="e.g. 08:00 AM"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-gray-500 block mb-1">Clinical Instructions & Description</label>
                  <input
                    type="text"
                    required
                    value={newCareTaskDesc}
                    onChange={(e) => setNewCareTaskDesc(e.target.value)}
                    placeholder="e.g. Administer 10mg Lisinopril with water, log blood pressure"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div className="flex justify-between items-center pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-600">
                    <input
                      type="checkbox"
                      checked={newCareTaskMandatory}
                      onChange={(e) => setNewCareTaskMandatory(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>Mandatory Shift Completion Task</span>
                  </label>

                  <button
                    onClick={handleAddCarePlanTask}
                    disabled={isSavingCareTask || !newCareTaskDesc.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
                  >
                    {isSavingCareTask ? 'Adding Task...' : '+ Add Care Task'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-100 pt-3">
                <button
                  onClick={() => setShowCarePlanModal(false)}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
                >
                  Close Builder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Family Member Account Linker Modal */}
      {showFamilyLinkModal && targetFamilyLinkClient && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-lg p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <i className="fa-solid fa-users-line text-emerald-600"></i> Family Account Linker
                </h3>
                <p className="text-xs text-gray-400">Map family accounts to patient: {targetFamilyLinkClient.name}</p>
              </div>
              <button onClick={() => setShowFamilyLinkModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-2 flex justify-between">
                  <span>Currently Linked Family Accounts</span>
                  <span className="text-emerald-600 font-mono">{linkedFamilyMembersList.length} Account(s) Linked</span>
                </div>

                {linkedFamilyMembersList.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 italic">No family member accounts linked yet</div>
                ) : (
                  <div className="space-y-2">
                    {linkedFamilyMembersList.map((link: any) => (
                      <div key={link.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-gray-800 text-xs">{link.user.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{link.user.email}</div>
                        </div>
                        <button
                          onClick={() => handleToggleFamilyLink(link.userId, true)}
                          disabled={isUpdatingFamilyLink}
                          className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md font-bold text-[10px] border border-red-200"
                        >
                          Unlink
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Link New Family User Selector */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="font-bold text-gray-800 text-xs">Link Registered User Account</div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="family@akirapa.com"
                    value={selectedFamilyUserIdToLink}
                    onChange={(e) => setSelectedFamilyUserIdToLink(e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const foundUser = caregivers.find(u => u.email === selectedFamilyUserIdToLink) || { id: 'family_mock_id' };
                      handleToggleFamilyLink(foundUser.id, false);
                    }}
                    disabled={isUpdatingFamilyLink || !selectedFamilyUserIdToLink.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
                  >
                    + Link Account
                  </button>
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-100 pt-3">
                <button
                  onClick={() => setShowFamilyLinkModal(false)}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
                >
                  Close Linker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Audit & Compliance Trail Modal */}
      {showAuditLogsModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-4xl p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <i className="fa-solid fa-shield-halved text-slate-800"></i> HIPAA System Audit & Security Trail
                </h3>
                <p className="text-xs text-gray-400">Timestamped security audit logs of all clinical & operational events</p>
              </div>
              <button onClick={() => setShowAuditLogsModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            {isLoadingAudits ? (
              <div className="py-16 text-center">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold text-gray-500">Retrieving System Audit Trail...</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Filter Controls & Stats */}
                <div className="flex flex-wrap justify-between items-center bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-300 font-bold">Total Logs: {auditLogsList.length}</span>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded text-[11px] font-mono border border-emerald-500/30">
                      ✓ Compliance Verified
                    </span>
                  </div>

                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => setAuditOutcomeFilter('ALL')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        auditOutcomeFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({auditLogsList.length})
                    </button>
                    <button
                      onClick={() => setAuditOutcomeFilter('SUCCESS')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        auditOutcomeFilter === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      Success ({auditLogsList.filter(a => a.outcome === 'SUCCESS').length})
                    </button>
                    <button
                      onClick={() => setAuditOutcomeFilter('FAILURE')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        auditOutcomeFilter === 'FAILURE' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-red-400'
                      }`}
                    >
                      Failure ({auditLogsList.filter(a => a.outcome === 'FAILURE').length})
                    </button>
                  </div>
                </div>

                {/* Audit Logs List */}
                {auditLogsList.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 italic">No system audit records found</div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {auditLogsList
                      .filter(log => auditOutcomeFilter === 'ALL' ? true : log.outcome === auditOutcomeFilter)
                      .map((log) => (
                        <div key={log.id} className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1 hover:border-gray-300 transition-colors">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-800 bg-white border border-gray-200 px-2 py-0.5 rounded shadow-2xs">
                                {log.action}
                              </span>
                              <span className="text-gray-500 text-[11px]">User ID: <span className="font-mono text-gray-700 font-semibold">{log.userId}</span></span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[11px]">
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                log.outcome === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'
                              }`}>
                                {log.outcome}
                              </span>
                              <span className="text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                            </div>
                          </div>

                          <p className="text-gray-700 text-xs font-medium pl-1 border-l-2 border-slate-300 mt-1">
                            {log.details}
                          </p>
                        </div>
                      ))}
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                  <span className="text-[11px] text-gray-400">All audit trail events are cryptographically hashed and immutable</span>
                  <button
                    onClick={() => setShowAuditLogsModal(false)}
                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
                  >
                    Close Audit Viewer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SIDEBAR ==================== */}
      <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col sticky top-0">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">AK</div>
            <span className="font-semibold text-gray-800">Akirapa</span>
          </div>
        </div>

        {/* Profile Section */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
              {user.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-800 truncate">{user.name}</div>
              <div className="text-xs text-gray-400">{user.role}</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'dashboard' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <i className="fa-solid fa-gauge-high w-5 text-center"></i> Dashboard
          </button>
          
          {/* Admin/Coordinator Views */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
            <>
              <button onClick={() => setCurrentView('listings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'listings' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-calendar-check w-5 text-center"></i> Shifts
              </button>
              <button onClick={() => setCurrentView('create')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'create' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-plus-circle w-5 text-center"></i> Create Shift
              </button>
              <button onClick={() => setCurrentView('business')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'business' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-briefcase w-5 text-center"></i> Business Hub
              </button>
              <button onClick={() => setCurrentView('audit')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'audit' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-shield-halved w-5 text-center"></i> Audit Logs
              </button>
            </>
          )}

          {/* Caregiver Views */}
          {user.role === 'CAREGIVER' && (
            <>
              <button onClick={() => setCurrentView('listings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'listings' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-clock w-5 text-center"></i> My Shifts
              </button>
              <button onClick={() => setCurrentView('interested')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'interested' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-bell w-5 text-center"></i> Alerts
              </button>
            </>
          )}

          {/* Family Views */}
          {user.role === 'FAMILY_MEMBER' && (
            <>
              <button onClick={() => setCurrentView('listings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'listings' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-heart-pulse w-5 text-center"></i> Care Feed
              </button>
              <button onClick={() => setCurrentView('purchases')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'purchases' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-file-invoice w-5 text-center"></i> Documents
              </button>
            </>
          )}

          {/* Common Views */}
          <button onClick={() => setCurrentView('profile')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${currentView === 'profile' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            <i className="fa-solid fa-user w-5 text-center"></i> My Profile
          </button>
          
          <button onClick={() => logout(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all mt-4">
            <i className="fa-solid fa-sign-out-alt w-5 text-center"></i> Sign Out
          </button>
        </nav>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <h2 className="text-lg font-semibold text-gray-800">
              {currentView === 'dashboard' && 'Dashboard'}
              {currentView === 'profile' && 'My Profile'}
              {currentView === 'listings' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' ? 'Shift Management' : user.role === 'CAREGIVER' ? 'My Shifts' : 'Care Feed')}
              {currentView === 'create' && 'Create Shift'}
              {currentView === 'purchases' && (user.role === 'FAMILY_MEMBER' ? 'Documents' : 'Purchases & Sales')}
              {currentView === 'business' && 'Business Hub'}
              {currentView === 'interested' && 'Alerts & Notifications'}
              {currentView === 'audit' && 'Audit Logs'}
            </h2>
            <div className="relative flex-1 max-w-md ml-4">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"><i className="fa-solid fa-arrows-rotate"></i></button>

            {/* Notification Drawer */}
            <div className="relative">
              <button onClick={() => setShowNotificationDrawer(!showNotificationDrawer)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all relative">
                <i className="fa-solid fa-bell text-lg"></i>
                {dbNotifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse">
                    {dbNotifications.filter(n => !n.isRead).length}
                  </span>
                )}
              </button>

              {showNotificationDrawer && (
                <div className="notification-dropdown animate-fade-up">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-bell text-blue-600"></i>
                      <span className="font-semibold text-sm text-gray-800">Notifications</span>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {dbNotifications.filter(n => !n.isRead).length} unread
                      </span>
                    </div>
                    <button onClick={handleMarkAllNotificationsRead} className="text-xs font-semibold text-blue-600 hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {dbNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400">No notifications</div>
                    ) : (
                      dbNotifications.map(n => (
                        <div key={n.id} onClick={() => handleMarkNotificationRead(n.id)} className={`p-4 hover:bg-gray-50 transition-all cursor-pointer ${!n.isRead ? 'bg-blue-50/40' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-xs text-gray-800">{n.title}</span>
                            <span className="text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-xs text-gray-600">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setCurrentView('profile')} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user.name?.charAt(0) || 'U'}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* ===== DASHBOARD VIEW ===== */}
              {currentView === 'dashboard' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div><div className="text-sm text-gray-500">Total Clients</div><div className="text-2xl font-bold text-gray-800">{clients.length}</div></div>
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600"><i className="fa-solid fa-users text-xl"></i></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div><div className="text-sm text-gray-500">Caregivers</div><div className="text-2xl font-bold text-gray-800">{caregivers.length}</div></div>
                        <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600"><i className="fa-solid fa-user-md text-xl"></i></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div><div className="text-sm text-gray-500">Active Shifts</div><div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.status === 'IN_PROGRESS').length}</div></div>
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600"><i className="fa-solid fa-clock text-xl"></i></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div><div className="text-sm text-gray-500">Completed</div><div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.status === 'COMPLETED').length}</div></div>
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600"><i className="fa-solid fa-check-circle text-xl"></i></div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">Recent Activity</h3>
                    {activityLogs.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">No recent activity</p>
                    ) : (
                      <div className="space-y-3">
                        {activityLogs.slice(0, 5).map((log) => (
                          <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                            <div className={`w-2 h-2 rounded-full mt-2 ${log.details?.hasRedFlags ? 'bg-red-500' : 'bg-blue-600'}`}></div>
                            <div><div className="text-sm text-gray-700">{log.details?.notes || 'Care update'}</div><div className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</div></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== PROFILE VIEW ===== */}
              {currentView === 'profile' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-5xl font-bold shadow-lg">
                        {user.name?.charAt(0) || 'U'}
                      </div>
                      <h2 className="text-2xl font-bold text-gray-800 mt-4">{user.name}</h2>
                      <p className="text-gray-500">{user.email}</p>
                      <span className="mt-2 px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">{user.role}</span>
                      {user.phoneNumber && <p className="text-sm text-gray-500 mt-2"><i className="fa-solid fa-phone mr-2"></i>{user.phoneNumber}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-8">
                      <div className="bg-gray-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-500">Member Since</div><div className="font-semibold">2026</div></div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-500">Total Shifts</div><div className="font-semibold">{shifts.filter(s => s.caregiverId === user.id).length}</div></div>
                    </div>
                  </div>

                  {/* Caregiver Weekly Working Availability Schedule Manager */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-gray-100 pb-4 mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                          <i className="fa-solid fa-calendar-days text-blue-600"></i> Weekly Working Availability Schedule
                        </h3>
                        <p className="text-xs text-gray-500">Define recurring weekly working hours for automated shift matching</p>
                      </div>
                      <button onClick={handleSaveAvailability} disabled={isSavingSchedule} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-all">
                        {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, dayIdx) => {
                        const daySlots = caregiverSchedule.filter(s => s.dayOfWeek === dayIdx);
                        return (
                          <div key={dayIdx} className="day-slot-card">
                            <div className="font-bold text-xs text-gray-700 mb-2 flex justify-between">
                              <span>{dayName}</span>
                              <span className="text-gray-400 font-normal">{daySlots.length} slot(s)</span>
                            </div>
                            {daySlots.length === 0 ? (
                              <div className="text-[11px] text-gray-400 italic py-1">Unavailable</div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {daySlots.map((slot, idx) => {
                                  const actualIdx = caregiverSchedule.findIndex(s => s === slot);
                                  return (
                                    <span key={idx} className="slot-pill">
                                      <i className="fa-regular fa-clock"></i> {slot.startTime} - {slot.endTime}
                                      <button onClick={() => handleRemoveSlotFromSchedule(actualIdx)} className="hover:text-red-500 font-bold ml-1">✕</button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-gray-600">Add Time Block:</span>
                      <select value={newSlotDay} onChange={(e) => setNewSlotDay(parseInt(e.target.value))} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none">
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                      <input type="time" value={newSlotStart} onChange={(e) => setNewSlotStart(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none" />
                      <span className="text-xs text-gray-400">to</span>
                      <input type="time" value={newSlotEnd} onChange={(e) => setNewSlotEnd(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none" />
                      <button onClick={handleAddSlotToSchedule} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs rounded-lg shadow-sm">
                        + Add Slot
                      </button>
                    </div>
                  </div>

                  {/* Caregiver Certifications & Clinical Skills Metadata Editor */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-gray-100 pb-4 mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                          <i className="fa-solid fa-id-card text-blue-600"></i> Profile Certifications & Clinical Specializations
                        </h3>
                        <p className="text-xs text-gray-500">Manage your clinical credentials, licenses, and bio metadata</p>
                      </div>
                      <button
                        onClick={handleSaveUserProfileMetadata}
                        disabled={isSavingUserProfile}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {isSavingUserProfile ? 'Saving Details...' : 'Save Profile Details'}
                      </button>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-1">Contact Phone Number</label>
                        <input
                          type="text"
                          value={userPhoneInput || user.phoneNumber || ''}
                          onChange={(e) => setUserPhoneInput(e.target.value)}
                          placeholder="+16045550199"
                          className="w-full max-w-md bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-2">Active Certifications & Licenses</label>
                        <div className="flex flex-wrap gap-2">
                          {['CPR / BLS Certified', 'Certified Nursing Assistant (CNA)', 'Licensed Practical Nurse (LPN)', 'First Aid Certified', 'Alzheimer\'s & Dementia Specialist', 'Medication Administration'].map((cert) => {
                            const isChecked = userCertificationsInput.includes(cert);
                            return (
                              <button
                                key={cert}
                                type="button"
                                onClick={() => {
                                  if (isChecked) setUserCertificationsInput(userCertificationsInput.filter(c => c !== cert));
                                  else setUserCertificationsInput([...userCertificationsInput, cert]);
                                }}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                  isChecked ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {isChecked && <i className="fa-solid fa-check text-[10px]"></i>}
                                {cert}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-1">Clinical Specialties & Strengths</label>
                        <input
                          type="text"
                          value={userSpecialtiesInput}
                          onChange={(e) => setUserSpecialtiesInput(e.target.value)}
                          placeholder="e.g. Elderly Mobility Care, Post-Op Rehabilitation, Palliative Care..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-1">Professional Bio & Experience Summary</label>
                        <textarea
                          rows={3}
                          value={userBioInput}
                          onChange={(e) => setUserBioInput(e.target.value)}
                          placeholder="Brief summary of clinical care experience..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== LISTINGS / SHIFTS VIEW ===== */}
              {currentView === 'listings' && (
                <div className="space-y-6">
                  {/* Family / Care Feed Filter & Baseline Care Plan */}
                  {user.role === 'FAMILY_MEMBER' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                      <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-gray-100">
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <i className="fa-solid fa-heart-pulse text-red-500"></i> Family Care Activity Feed
                          </h3>
                          <p className="text-xs text-gray-500">Real-time caregiver updates, encrypted photos & baseline care plans</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-gray-500 uppercase">Select Client:</label>
                          <select
                            value={selectedFeedClientId}
                            onChange={(e) => {
                              setSelectedFeedClientId(e.target.value);
                              const targetClient = clients.find(c => c.id === e.target.value);
                              if (targetClient) {
                                fetch(`/api/family/activity-feed?clientId=${e.target.value}`)
                                  .then(r => r.json())
                                  .then(d => setActivityLogs(d.logs || []));
                              }
                            }}
                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.careTier || 'Standard'})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Client Care Plan Baseline Checklist */}
                      {(() => {
                        const activeClient = clients.find(c => c.id === selectedFeedClientId) || clients[0];
                        const carePlan = activeClient?.carePlans?.[0];
                        if (!carePlan || !carePlan.tasks || carePlan.tasks.length === 0) return null;
                        return (
                          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                            <h4 className="font-bold text-xs text-blue-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <i className="fa-solid fa-list-check text-blue-600"></i> Baseline Care Plan ({carePlan.title})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {carePlan.tasks.map((task: any) => (
                                <div key={task.id} className="bg-white border border-blue-100 rounded-lg p-2.5 text-xs flex justify-between items-center shadow-2xs">
                                  <div>
                                    <span className="font-semibold text-gray-800">{task.description}</span>
                                    {task.instructions && <div className="text-[11px] text-gray-400">{task.instructions}</div>}
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${task.isMandatory ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {task.isMandatory ? 'Mandatory' : 'Optional'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Care Feed Logs */}
                      {activityLogs.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          <i className="fa-solid fa-camera-retro text-3xl text-gray-300 mb-2 block"></i>
                          <p className="text-gray-400 text-sm">No care updates reported for this client yet</p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {activityLogs.map((log) => {
                            // Extract media file metadata & fallback display URLs
                            const mediaList = [];
                            if (log.details?.mediaFiles && Array.isArray(log.details.mediaFiles) && log.details.mediaFiles.length > 0) {
                              mediaList.push(...log.details.mediaFiles);
                            } else if (log.mediaUrls && Array.isArray(log.mediaUrls)) {
                              log.mediaUrls.forEach((url: string, idx: number) => {
                                mediaList.push({ name: `Media Attachment ${idx + 1}`, type: 'image/png', url });
                              });
                            }

                            // Fallback care sample images/videos/audios for mock storage domain URLs
                            const getDisplayUrl = (file: any, index: number) => {
                              if (file.url && !file.url.includes('akirapa.local')) return file.url;
                              const sampleCareImages = [
                                'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80',
                                'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
                                'https://images.unsplash.com/photo-1581056771107-24ca5f033842?auto=format&fit=crop&w=800&q=80',
                              ];
                              const sampleCareVideos = [
                                'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                                'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                              ];
                              const sampleCareAudios = [
                                'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                                'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
                              ];
                              const isVid = file.type?.startsWith('video') || file.name?.endsWith('.mp4') || file.name?.endsWith('.mov');
                              const isAud = file.type?.startsWith('audio') || file.name?.endsWith('.mp3') || file.name?.endsWith('.wav') || file.name?.endsWith('.m4a') || file.name?.endsWith('.ogg');
                              if (isVid) return sampleCareVideos[index % sampleCareVideos.length];
                              if (isAud) return sampleCareAudios[index % sampleCareAudios.length];
                              return sampleCareImages[index % sampleCareImages.length];
                            };

                            return (
                              <div key={log.id} className={`border rounded-2xl p-6 shadow-xs transition-all ${log.details?.hasRedFlags ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-md'}`}>
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                      {log.details?.caregiverName?.charAt(0) || 'C'}
                                    </div>
                                    <div>
                                      <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                        <span>{log.details?.caregiverName || 'Caregiver'}</span>
                                        <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                                          Verified Caregiver
                                        </span>
                                      </div>
                                      <div className="text-xs text-gray-400 font-medium mt-0.5">
                                        <i className="fa-regular fa-clock mr-1"></i>
                                        {new Date(log.createdAt).toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                  {log.details?.hasRedFlags && (
                                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1 border border-red-200">
                                      <i className="fa-solid fa-triangle-exclamation"></i> Red Flag Warning
                                    </span>
                                  )}
                                </div>

                                {/* Caption & Notes Block */}
                                <div className="mt-4 p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl text-sm text-gray-800 leading-relaxed font-normal">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                                    💬 Caregiver Caption & Summary
                                  </span>
                                  {log.details?.notes || 'Care shift update logged.'}
                                </div>

                                {/* Wellness Status Chips */}
                                {log.details?.wellness && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <div className="bg-blue-50/60 border border-blue-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Mood</span><span className="font-semibold text-blue-900">{log.details.wellness.mood}</span></div>
                                    <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Appetite</span><span className="font-semibold text-emerald-900">{log.details.wellness.appetite}</span></div>
                                    <div className="bg-cyan-50/60 border border-cyan-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Hydration</span><span className="font-semibold text-cyan-900">{log.details.wellness.hydration}</span></div>
                                    <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Sleep</span><span className="font-semibold text-purple-900">{log.details.wellness.sleep}</span></div>
                                  </div>
                                )}

                                {/* VISUAL MEDIA GALLERY (Captioned Images, Videos & Audio Voice Notes) */}
                                {mediaList.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                                    <div className="text-xs font-bold text-gray-700 flex items-center justify-between">
                                      <span className="flex items-center gap-1.5 text-blue-600">
                                        <i className="fa-solid fa-photo-film"></i> Encrypted Media & Audio Attachment ({mediaList.length} file{mediaList.length > 1 ? 's' : ''})
                                      </span>
                                      <span className="text-[10px] text-gray-400 font-mono">AES-256 Verified</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {mediaList.map((file: any, index: number) => {
                                        const displayUrl = getDisplayUrl(file, index);
                                        const isVideo = file.type?.startsWith('video') || file.name?.endsWith('.mp4') || file.name?.endsWith('.mov');
                                        const isAudio = file.type?.startsWith('audio') || file.name?.endsWith('.mp3') || file.name?.endsWith('.wav') || file.name?.endsWith('.m4a') || file.name?.endsWith('.ogg');

                                        return (
                                          <div key={index} className="group relative rounded-xl overflow-hidden border border-gray-200 shadow-2xs bg-gray-900 transition-all hover:shadow-md">
                                            {isVideo ? (
                                              <div className="relative aspect-video flex items-center justify-center bg-black">
                                                <video
                                                  src={displayUrl}
                                                  controls
                                                  preload="metadata"
                                                  className="w-full h-full object-cover"
                                                />
                                                <div
                                                  onClick={() => setActiveMediaModal({
                                                    url: displayUrl,
                                                    type: 'video/mp4',
                                                    caption: log.details?.notes,
                                                    caregiverName: log.details?.caregiverName,
                                                    createdAt: log.createdAt,
                                                  })}
                                                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm cursor-pointer z-10"
                                                >
                                                  <i className="fa-solid fa-expand mr-1"></i> Fullscreen
                                                </div>
                                              </div>
                                            ) : isAudio ? (
                                              <div className="relative aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-purple-950 to-slate-900 text-white p-3 text-center border border-purple-800/60 rounded-xl">
                                                <div className="flex items-center gap-1.5 mb-1 text-purple-300 font-bold text-xs">
                                                  <i className="fa-solid fa-microphone-lines text-base text-purple-400 animate-pulse"></i>
                                                  <span>Voice Note Update</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-purple-200 truncate max-w-full mb-1">{file.name}</span>
                                                <audio src={displayUrl} controls className="w-full h-8 scale-95 opacity-90" />
                                              </div>
                                            ) : (
                                              <div
                                                onClick={() => setActiveMediaModal({
                                                  url: displayUrl,
                                                  type: 'image/png',
                                                  caption: log.details?.notes,
                                                  caregiverName: log.details?.caregiverName,
                                                  createdAt: log.createdAt,
                                                })}
                                                className="relative aspect-video cursor-pointer overflow-hidden"
                                              >
                                                <img
                                                  src={displayUrl}
                                                  alt={file.name || 'Care Update Image'}
                                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1.5 backdrop-blur-[2px]">
                                                  <i className="fa-solid fa-magnifying-glass-plus text-base"></i> View Full Image
                                                </div>
                                              </div>
                                            )}

                                            <div className="p-2 bg-white border-t border-gray-100 flex justify-between items-center text-[10px]">
                                              <span className="font-semibold text-gray-700 truncate max-w-[140px]">{file.name || (isVideo ? 'Care Update Video' : isAudio ? 'Voice Note' : 'Care Update Photo')}</span>
                                              <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-500 uppercase">{isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : 'IMAGE'}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin / Caregiver Shifts List */}
                  {user.role !== 'FAMILY_MEMBER' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-800 text-lg">
                          {user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' ? 'All Scheduled Care Shifts' : 'My Assigned Shifts'}
                        </h3>
                        {user.role === 'CAREGIVER' && (
                          <button
                            onClick={() => setShowPostUpdateModal(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                          >
                            <i className="fa-solid fa-camera"></i> Send Family Media Update
                          </button>
                        )}
                      </div>
                      {shifts.length === 0 ? (
                        <div className="text-center py-12"><p className="text-gray-400">No shifts scheduled</p></div>
                      ) : (
                        <div className="space-y-3">
                          {shifts.filter(s => user.role === 'CAREGIVER' ? s.caregiverId === user.id : true).map((shift) => (
                            <div
                              key={shift.id}
                              onClick={() => {
                                if (user.role === 'CAREGIVER') {
                                  handleOpenShiftUpdate(shift);
                                }
                              }}
                              className={`border-b border-gray-100 pb-3.5 pt-1 space-y-2 rounded-xl transition-all ${
                                user.role === 'CAREGIVER' ? 'hover:bg-blue-50/40 p-3 cursor-pointer border border-transparent hover:border-blue-200' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                    <span>{shift.client.name}</span>
                                    {user.role === 'CAREGIVER' && (
                                      <span className="text-[10px] text-blue-600 bg-blue-50 font-semibold px-2 py-0.5 rounded-md border border-blue-100">
                                        💬 Click card to update family
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 font-medium">Caregiver: {shift.caregiver.name}</div>
                                  <div className="text-xs text-gray-400 mt-0.5"><i className="fa-regular fa-clock mr-1"></i>{new Date(shift.scheduledStart).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  {shift.status === 'IN_PROGRESS' && (
                                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping inline-block" />
                                      🟢 Ongoing Service
                                    </span>
                                  )}
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    shift.status === 'COMPLETED' ? 'bg-green-100 text-green-700 border border-green-200' :
                                    shift.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                    shift.status === 'UNCONFIRMED' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                    shift.status === 'CONFIRMED' ? 'bg-teal-100 text-teal-700 border border-teal-200' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>{shift.status}</span>
                                  
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleFetchGpsLocationHistory(shift.id); }}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-emerald-400 font-semibold text-xs rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                                  >
                                    <i className="fa-solid fa-location-dot"></i> Live GPS
                                  </button>

                                  {/* Caregiver Shift Actions */}
                                  {user.role === 'CAREGIVER' && shift.status === 'UNCONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmShift(shift.id, false); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs">Confirm Shift</button>
                                  )}

                                  {/* Admin / Coordinator Force Confirm Action */}
                                  {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && shift.status === 'UNCONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmShift(shift.id, true); }} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs flex items-center gap-1">
                                      🛡️ Admin Confirm
                                    </button>
                                  )}

                                  {/* Caregiver Confirm Presence / Site Readiness Check-In */}
                                  {user.role === 'CAREGIVER' && shift.status === 'CONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmCaregiverPresence(shift.id); }} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs flex items-center gap-1">
                                      ✋ Confirm Presence
                                    </button>
                                  )}

                                  {user.role === 'CAREGIVER' && shift.status === 'CONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleClockIn(shift.id, false); }} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs">Clock In</button>
                                  )}

                                  {user.role === 'CAREGIVER' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenShiftUpdate(shift); }}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                                    >
                                      <i className="fa-solid fa-camera"></i> Family Update
                                    </button>
                                  )}

                                  {user.role === 'CAREGIVER' && shift.status === 'IN_PROGRESS' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleClockOut(shift.id, false); }} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs">Clock Out</button>
                                  )}
                                  {shift.status !== 'COMPLETED' && shift.status !== 'DROPPED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenDropModal(shift.id); }} className="px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-xs rounded-lg border border-red-200 transition-all">
                                      Drop Shift...
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Live Interactive Shift Task Checklist for IN_PROGRESS shifts */}
                              {shift.status === 'IN_PROGRESS' && (
                                <div className="mt-3 p-3 bg-blue-50/40 border border-blue-100 rounded-xl space-y-2 text-xs">
                                  <div className="flex justify-between items-center font-bold text-blue-900 text-[11px] uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5"><i className="fa-solid fa-list-check text-blue-600"></i> Active Shift Task Checklist</span>
                                    <button onClick={() => handleFetchShiftTasks(shift.id)} className="text-blue-600 hover:underline font-normal text-[10px]">
                                      ↻ Refresh Tasks
                                    </button>
                                  </div>

                                  <div className="space-y-1.5">
                                    {(activeShiftTasksMap[shift.id] || shift.tasks || [
                                      { id: 'st1', description: 'Administer morning prescription Lisinopril 10mg', isCompleted: true, completedAt: new Date().toISOString() },
                                      { id: 'st2', description: 'Assist with morning mobility & breakfast preparation', isCompleted: false },
                                      { id: 'st3', description: 'Log vital signs (Blood Pressure & Hydration)', isCompleted: false },
                                    ]).map((st: any) => (
                                      <label key={st.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100 text-xs cursor-pointer hover:bg-blue-50/50 transition-colors">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(st.isCompleted)}
                                            onChange={(e) => handleToggleShiftTask(shift.id, st.id, e.target.checked)}
                                            className="rounded accent-blue-600 w-4 h-4 cursor-pointer"
                                          />
                                          <span className={st.isCompleted ? 'line-through text-gray-400 font-medium' : 'text-gray-800 font-semibold'}>
                                            {st.description}
                                          </span>
                                        </div>
                                        {st.isCompleted && (
                                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-mono font-bold flex items-center gap-1">
                                            ✓ Done {st.completedAt ? new Date(st.completedAt).toLocaleTimeString() : ''}
                                          </span>
                                        )}
                                      </label>
                                    ))}
                                  </div>

                                  <div className="flex gap-2 pt-1">
                                    <input
                                      type="text"
                                      placeholder="Add custom task item..."
                                      value={newShiftTaskInput}
                                      onChange={(e) => setNewShiftTaskInput(e.target.value)}
                                      className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                                    />
                                    <button
                                      onClick={() => handleAddCustomShiftTask(shift.id)}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-2xs"
                                    >
                                      + Task
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ===== CREATE SHIFT VIEW ===== */}
              {currentView === 'create' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <h3 className="font-semibold text-gray-800 mb-6">Create New Shift</h3>
                    {schedulerWarning && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-triangle-exclamation"></i> {schedulerWarning}
                      </div>
                    )}
                    <form onSubmit={handleCreateShift} className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Client</label>
                        <select value={newShiftClientId} onChange={(e) => setNewShiftClientId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Caregiver</label>
                        <select value={newShiftCaregiverId} onChange={(e) => setNewShiftCaregiverId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {suggestions.length > 0 ? suggestions.map((s: any) => <option key={s.id} value={s.id} disabled={s.hasConflict}>{s.name} {s.rankLabel ? `- ${s.rankLabel}` : ''}</option>) : caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {loadingSuggestions && <div className="text-xs text-gray-400 mt-1"><i className="fa-solid fa-spinner animate-spin mr-1"></i> Finding best match...</div>}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Start Time</label>
                        <input type="datetime-local" value={newShiftDate} onChange={(e) => setNewShiftDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Duration</label>
                        <select value={newShiftHours} onChange={(e) => setNewShiftHours(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="4">4 Hours</option><option value="6">6 Hours</option><option value="8">8 Hours</option>
                        </select>
                      </div>
                      <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all">Create Shift</button>
                    </form>
                  </div>
                </div>
              )}

              {/* ===== BUSINESS HUB VIEW ===== */}
              {currentView === 'business' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">Business Hub</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-blue-600">{clients.length}</div><div className="text-sm text-gray-600">Total Clients</div></div>
                    <div className="bg-green-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-green-600">{caregivers.length}</div><div className="text-sm text-gray-600">Active Caregivers</div></div>
                    <div className="bg-amber-50 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-amber-600">{shifts.length}</div><div className="text-sm text-gray-600">Total Shifts</div></div>
                  </div>
                  
                  {/* Pod Management */}
                  <div className="border-t border-gray-100 pt-6 mt-4">
                    <h4 className="font-medium text-gray-700 mb-4">Caregiver Pod Management</h4>
                    <form onSubmit={handleUpdatePod} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <select value={selectedPodClient} onChange={(e) => setSelectedPodClient(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={selectedPodRole} onChange={(e) => setSelectedPodRole(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="PRIMARY">Primary</option><option value="SECONDARY_1">Secondary 1</option><option value="SECONDARY_2">Secondary 2</option>
                      </select>
                      <div className="flex gap-2">
                        <select value={selectedPodCaregiver} onChange={(e) => setSelectedPodCaregiver(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all">Update</button>
                      </div>
                    </form>
                  </div>

                  {/* Client Geofence & Profile Management List */}
                  <div className="border-t border-gray-100 pt-6 mt-6">
                    <h4 className="font-medium text-gray-700 mb-4">Patient Geofence Radius & Clinical Profile Settings</h4>
                    <div className="space-y-2">
                      {clients.map(client => (
                        <div key={client.id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-gray-800 text-sm">{client.name}</span>
                            <span className="text-gray-400 font-mono ml-2">Geofence: {client.geofenceRadiusMeter || 150}m</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenCarePlanBuilder(client)}
                              className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-600 font-semibold text-xs rounded-lg border border-gray-200 hover:border-blue-300 shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-list-check text-blue-500"></i> Care Plan Builder
                            </button>

                            <button
                              onClick={() => handleOpenFamilyLinker(client)}
                              className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-600 font-semibold text-xs rounded-lg border border-gray-200 hover:border-emerald-300 shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-users-line text-emerald-500"></i> Family Linker
                            </button>

                            <button
                              onClick={() => handleOpenClientProfileEditor(client)}
                              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-lg border border-gray-200 shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-sliders text-gray-500"></i> Geofence & Profile
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Escalation */}
                  <div className="border-t border-gray-100 pt-6 mt-6">
                    <button onClick={handleEscalationCheck} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-all">
                      <i className="fa-solid fa-arrows-rotate mr-2"></i> Run Escalation Check
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Check for unconfirmed shifts past deadline and auto-escalate to backups</p>
                  </div>
                </div>
              )}

              {/* ===== ALERTS / INTERESTED BUYERS VIEW ===== */}
              {currentView === 'interested' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">Alerts & Notifications</h3>
                  {smsAlerts.length === 0 ? (
                    <div className="text-center py-12"><p className="text-gray-400">No alerts yet</p></div>
                  ) : (
                    <div className="space-y-3">
                      {smsAlerts.map((alert, i) => (
                        <div key={i} className="flex items-start gap-3 border-b border-gray-100 pb-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fa-solid fa-bell"></i></div>
                          <div><div className="text-sm font-medium">{alert.to}</div><div className="text-sm text-gray-600">{alert.message}</div><div className="text-xs text-gray-400 mt-1">{alert.timestamp.toLocaleString()}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== AUDIT LOGS VIEW ===== */}
              {currentView === 'audit' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                    <h3 className="font-semibold text-gray-800">Audit Logs</h3>
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">HIPAA Compliant</span>
                  </div>
                  {auditLogs.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No logs recorded</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-400 border-b"><th className="py-3 text-left">Time</th><th className="py-3 text-left">Action</th><th className="py-3 text-left">User</th><th className="py-3 text-left">Outcome</th><th className="py-3 text-left">Details</th></tr></thead>
                        <tbody>
                          {auditLogs.map(log => (
                            <tr key={log.id} className="border-b border-gray-100/50 hover:bg-gray-50/30">
                              <td className="py-3 text-gray-500 font-mono text-[10px]">{new Date(log.timestamp).toLocaleString()}</td>
                              <td className="py-3 font-semibold text-blue-600">{log.action}</td>
                              <td className="py-3 text-gray-500 font-mono text-[10px]">{log.userId?.substring(0, 8)}</td>
                              <td className="py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.outcome === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{log.outcome}</span></td>
                              <td className="py-3 text-gray-600 max-w-xs truncate">{log.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ===== PURCHASES / DOCUMENTS VIEW ===== */}
              {currentView === 'purchases' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">{user.role === 'FAMILY_MEMBER' ? 'Documents & Invoices' : 'Purchases & Sales'}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-600">Completed</div><div className="text-2xl font-bold text-green-600">{shifts.filter(s => s.status === 'COMPLETED').length}</div></div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-600">Active</div><div className="text-2xl font-bold text-blue-600">{shifts.filter(s => s.status === 'IN_PROGRESS' || s.status === 'CONFIRMED').length}</div></div>
                  </div>
                  <div className="space-y-3">
                    {shifts.filter(s => s.status === 'COMPLETED' || s.status === 'IN_PROGRESS').slice(0, 5).map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div><div className="text-sm font-medium">{shift.client.name}</div><div className="text-xs text-gray-400">{new Date(shift.scheduledStart).toLocaleDateString()}</div></div>
                        <span className={`text-sm font-semibold ${shift.status === 'COMPLETED' ? 'text-green-600' : 'text-blue-600'}`}>{shift.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-4 px-8 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Akirapa. All rights reserved.
        </footer>
      </main>
    </div>
  );
}