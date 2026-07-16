'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';


export default function Home() {
  const { user, loading: authLoading, login, logout, triggerAudit } = useAuth();
  const [activeTab, setActiveTab] = useState<'admin' | 'caregiver' | 'family' | 'audits'>('admin');
  
  // Flow states
  const [viewState, setViewState] = useState<'splash' | 'role_select' | 'login' | 'signup' | 'dashboard'>('splash');
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'CAREGIVER' | 'CLIENT' | null>('CAREGIVER');
  
  // Login custom credentials state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Redirect to splash/role_select on logout or direct to dashboard on login
  useEffect(() => {
    if (!user && !authLoading) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'timeout' || params.get('logout') === 'true') {
        setViewState('login');
      } else {
        setViewState('splash');
      }
      setSelectedRole('CAREGIVER');
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
          setViewState('login');
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
  
  // Scheduling Suggestion States
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Pod Mapping States
  const [selectedPodClient, setSelectedPodClient] = useState('');
  const [selectedPodRole, setSelectedPodRole] = useState<'PRIMARY' | 'SECONDARY_1' | 'SECONDARY_2'>('PRIMARY');
  const [selectedPodCaregiver, setSelectedPodCaregiver] = useState('');

  // Caregiver Dashboard Simulation States
  const [distanceOffset, setDistanceOffset] = useState<number>(0); // distance from patient home in meters
  const [useRealGPS, setUseRealGPS] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [clockInError, setClockInError] = useState<string | null>(null);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const [showClockOutOverrideInput, setShowClockOutOverrideInput] = useState(false);
  const [clockOutOverrideReason, setClockOutOverrideReason] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [clockOutRemarks, setClockOutRemarks] = useState('');
  const [redFlags, setRedFlags] = useState({
    cognitiveConfusion: false,
    fallDetected: false,
    behavioralChanges: false,
    mobilityDecline: false,
  });

  // Caregiver Status Update States
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);

  // Signup States
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupRole, setSignupRole] = useState<'CAREGIVER' | 'CLIENT'>('CAREGIVER');
  const [patientName, setPatientName] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [patientLat, setPatientLat] = useState('49.2827');
  const [patientLng, setPatientLng] = useState('-123.1207');
  const [signupError, setSignupError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Google Sign-In Simulation States
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleCustomRole, setGoogleCustomRole] = useState<'ADMIN' | 'CAREGIVER' | 'CLIENT'>('CAREGIVER');
  const [googleIsSubmitting, setGoogleIsSubmitting] = useState(false);

  // Caregiver Clock-Out Media Upload States
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<Array<{ name: string; type: string; preview: string }>>([]);

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

  // Simulation Alert Logs (Mock SMS Messages Panel)
  const [smsAlerts, setSmsAlerts] = useState<Array<{ timestamp: Date; to: string; message: string }>>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);

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

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch intelligent caregiver suggestions based on selected shift parameters
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
          // Auto-select the best matching available, conflict-free caregiver
          const bestMatch = data.suggestions?.find((s: any) => !s.hasConflict);
          if (bestMatch) {
            setNewShiftCaregiverId(bestMatch.id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch caregiver suggestions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [newShiftClientId, newShiftDate, newShiftHours]);

  // Periodic active shift location tracking simulation (Privacy check)
  useEffect(() => {
    const activeShift = shifts.find(s => s.status === 'IN_PROGRESS' && s.caregiverId === user?.id);
    if (!activeShift) return;

    const sendLocationUpdate = async (shiftId: string, latitude: number, longitude: number) => {
      try {
        const res = await fetch('/api/shifts/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shiftId,
            latitude,
            longitude,
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
    };

    // Simulate location ping every 10 seconds for prototyping (normally 1-5 mins)
    const interval = setInterval(async () => {
      const clientLat = activeShift.client.latitude;
      const clientLng = activeShift.client.longitude;

      if (useRealGPS) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await sendLocationUpdate(activeShift.id, position.coords.latitude, position.coords.longitude);
          },
          (err) => console.warn('[GPS TICK ERROR] Failed to fetch device location:', err),
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
          patientName: signupRole === 'CLIENT' ? patientName : undefined,
          patientAddress: signupRole === 'CLIENT' ? patientAddress : undefined,
          patientLatitude: signupRole === 'CLIENT' ? parseFloat(patientLat) : undefined,
          patientLongitude: signupRole === 'CLIENT' ? parseFloat(patientLng) : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Account created successfully!');
        
        // Authenticate locally in AuthContext
        await login(signupEmail, signupPassword, signupRole);
        await loadData();
        
        // Reset inputs
        setSignupEmail('');
        setSignupPassword('');
        setSignupName('');
        setSignupPhone('');
        setPatientName('');
        setPatientAddress('');
      } else {
        setSignupError(data.error || 'Failed to create account.');
      }
    } catch (err) {
      console.error(err);
      setSignupError('A network error occurred. Please try again.');
    } finally {
      setIsSigningUp(false);
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

  const handleConfirmShift = async (shiftId: string) => {
    try {
      const res = await fetch('/api/shifts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Shift successfully confirmed!');
        await loadData();
      } else {
        showNotification(`Error: ${data.error || 'Failed to confirm shift'}`);
      }
    } catch (err) {
      console.error(err);
      showNotification('An error occurred while confirming the shift.');
    }
  };

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



  const handlePostCaregiverUpdate = async (shiftId: string) => {
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    setIsPostingUpdate(true);
    try {
      const res = await fetch('/api/family/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeShift.clientId,
          shiftId: shiftId,
          notes: shiftNotes || 'Caregiver posted a shift progress update.',
          mediaFiles: selectedMediaFiles.map(f => ({ name: f.name, type: f.type })),
        }),
      });

      if (res.ok) {
        showNotification('Real-time Care Update Posted to Feed!');
        setShiftNotes('');
        setSelectedMediaFiles([]);
        loadData();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to post care update.');
      }
    } catch (err) {
      console.error(err);
      showNotification('An error occurred while posting update.');
    } finally {
      setIsPostingUpdate(false);
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
              onClick={() => setViewState('login')}
              className="mt-2 px-6 py-2.5 bg-white/5 hover:bg-brand-teal hover:text-brand-purple border border-white/10 hover:border-brand-teal/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 active:scale-95 flex items-center gap-2 group cursor-pointer"
            >
              <span>Enter Portal</span>
              <i className="fa-solid fa-chevron-right w-4 h-4 group-hover:translate-x-1 transition-transform"></i>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleGoogleAccountSelect = async (email: string, role: 'ADMIN' | 'CAREGIVER' | 'CLIENT') => {
    setGoogleIsSubmitting(true);
    setSelectedRole(role);
    
    // Look up password if it's a demo profile, otherwise use a mock password
    let password = 'googleAuthPassword123';
    if (email === 'admin@akirapa.com') password = 'admin123';
    else if (email === 'primary@akirapa.com') password = 'akirapa2634!';
    else if (email === 'family@akirapa.com') password = 'family123';

    try {
      // Wait 1.2s to simulate Google validation
      await new Promise(resolve => setTimeout(resolve, 1200));
      const success = await login(email, password, role);
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

    const handleSelectAccount = (email: string) => {
      const acc = accounts.find(a => a.email === email);
      if (acc) {
        setLoginEmail(acc.email);
        setLoginPassword(acc.pass);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8f6fa] to-[#eefaf9] text-gray-800 flex flex-col justify-center items-center p-6 font-sans relative">
        <div className="max-w-md w-full bg-white border border-gray-100 p-8 rounded-3xl shadow-xl flex flex-col gap-6 relative animate-fade-in z-10">
          {/* Back Button to Splash */}
          <button 
            onClick={() => { setViewState('splash'); setLoginError(null); }}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-brand-purple transition-colors w-fit group cursor-pointer"
          >
            <i className="fa-solid fa-chevron-left w-4 h-4 group-hover:-translate-x-0.5 transition-transform"></i>
            <span>Back to Splash</span>
          </button>

          {/* Heading */}
          <div className="border-b border-gray-100 pb-4 text-center">
            <div className="w-12 h-12 bg-brand-purple text-brand-teal font-black text-lg rounded-2xl flex items-center justify-center shadow-md mx-auto mb-3">
              AK
            </div>
            <h2 className="text-xl font-extrabold text-brand-purple-dark">
              Akirapa Care Network
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-medium font-sans">HIPAA-Compliant Secure Gateway</p>
          </div>

          {/* Role Tabs */}
          <div className="flex bg-gray-50 border border-gray-100 p-1.5 rounded-2xl gap-1">
            {(['CAREGIVER', 'CLIENT', 'ADMIN'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setSelectedRole(role);
                  setLoginEmail('');
                  setLoginPassword('');
                  setLoginError(null);
                }}
                className={`flex-1 py-2.5 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  selectedRole === role
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {role === 'CAREGIVER' ? 'Caregiver' : role === 'CLIENT' ? 'Client/Family' : 'Administrator'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handlePortalLogin(loginEmail, loginPassword);
            }} 
            className="flex flex-col gap-4"
          >

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
                <i className="fa-solid fa-circle-exclamation w-4 h-4 shrink-0"></i>
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
                  <div className="w-4.5 h-4.5 border-2 border-white border-t-brand-teal rounded-full animate-spin" />
                  <span>Connecting Securely...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-lock w-4 h-4"></i>
                  <span>Authenticate & Enter</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-100"></div>
            <span className="flex-shrink mx-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">or continue with</span>
            <div className="flex-grow border-t border-gray-100"></div>
          </div>

          {/* Google Login Trigger */}
          <button 
            type="button" 
            onClick={() => {
              setShowGoogleModal(true);
              setLoginError(null);
            }} 
            className="w-full py-3 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2.5"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Signup Navigation Link */}
          <div className="text-center text-xs text-gray-500 font-semibold mt-1">
            New to Akirapa?{' '}
            <button 
              type="button" 
              onClick={() => { setViewState('signup'); setLoginError(null); }}
              className="text-brand-purple hover:text-brand-purple-dark font-extrabold underline cursor-pointer"
            >
              Create an Account
            </button>
          </div>
        </div>

        {/* MOCK GOOGLE LOGIN MODAL OVERLAY */}
        {showGoogleModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 flex flex-col gap-6 animate-fade-in relative">
              
              {/* Google Modal Header */}
              <div className="flex flex-col items-center text-center pb-4 border-b border-gray-100">
                <svg className="w-9 h-9 mb-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <h3 className="text-xl font-bold text-gray-800">Sign in with Google</h3>
                <p className="text-xs text-gray-400 mt-1">to continue to <span className="font-semibold text-brand-purple">Akirapa</span></p>
              </div>

              {googleIsSubmitting ? (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-10 h-10 border-4 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Verifying Google Account...</span>
                    <span className="text-[10px] text-gray-400 block mt-1">OAuth 2.0 secure authorization exchange</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Account Selector List */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Choose an Account</span>
                    
                    <button 
                      type="button"
                      onClick={() => handleGoogleAccountSelect('primary@akirapa.com', 'CAREGIVER')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-gray-800">Amara Okafor</div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">primary@akirapa.com</div>
                      </div>
                      <span className="bg-brand-teal-ultra text-brand-teal-dark border border-brand-teal/20 text-[9px] font-bold px-2 py-0.5 rounded-md">Caregiver</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => handleGoogleAccountSelect('family@akirapa.com', 'CLIENT')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-gray-800">David Jenkins</div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">family@akirapa.com</div>
                      </div>
                      <span className="bg-brand-purple-ultra text-brand-purple text-[9px] font-bold px-2 py-0.5 rounded-md">Client/Family</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => handleGoogleAccountSelect('admin@akirapa.com', 'ADMIN')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-gray-800">Elena Rostova</div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">admin@akirapa.com</div>
                      </div>
                      <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold px-2 py-0.5 rounded-md">Admin</span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-gray-100"></div>
                    <span className="flex-shrink mx-3 text-[9px] text-gray-400 font-bold uppercase tracking-wider">or sign in with another account</span>
                    <div className="flex-grow border-t border-gray-100"></div>
                  </div>

                  {/* Use another account inputs */}
                  <form onSubmit={handleGoogleCustomSubmit} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Google Email</label>
                      <input 
                        type="email"
                        required
                        placeholder="yourname@gmail.com"
                        value={googleEmailInput}
                        onChange={(e) => setGoogleEmailInput(e.target.value)}
                        className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#4285F4]"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Select App Role</label>
                      <select 
                        value={googleCustomRole}
                        onChange={(e) => setGoogleCustomRole(e.target.value as any)}
                        className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#4285F4] cursor-pointer"
                      >
                        <option value="CAREGIVER">Caregiver (Clock-In/Checklist)</option>
                        <option value="CLIENT">Client Portal (Family Feed)</option>
                        <option value="ADMIN">Agency Admin (Command/Scheduling)</option>
                      </select>
                    </div>

                    <button 
                      type="submit"
                      disabled={!googleEmailInput.trim()}
                      className="w-full mt-1 py-2.5 bg-[#4285F4] hover:bg-[#357AE8] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Authenticate Google User
                    </button>
                  </form>

                  {/* Cancel Button */}
                  <button 
                    type="button"
                    onClick={() => {
                      setShowGoogleModal(false);
                      setGoogleEmailInput('');
                    }}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSignupScreen = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8f6fa] to-[#eefaf9] text-gray-800 flex flex-col justify-center items-center p-6 font-sans relative">
        <div className="max-w-md w-full bg-white border border-gray-100 p-8 rounded-3xl shadow-xl flex flex-col gap-6 relative animate-fade-in z-10">
          {/* Back Button to Login */}
          <button 
            onClick={() => { setViewState('login'); setSignupError(null); }}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-brand-purple transition-colors w-fit group cursor-pointer"
          >
            <i className="fa-solid fa-chevron-left w-4 h-4 group-hover:-translate-x-0.5 transition-transform"></i>
            <span>Back to Login</span>
          </button>

          {/* Heading */}
          <div className="border-b border-gray-100 pb-4 text-center">
            <div className="w-12 h-12 bg-brand-teal text-brand-purple font-black text-lg rounded-2xl flex items-center justify-center shadow-md mx-auto mb-3">
              AK
            </div>
            <h2 className="text-xl font-extrabold text-brand-purple-dark">
              Create Akirapa Account
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-medium font-sans">HIPAA-Compliant Decentralized Registry</p>
          </div>

          {/* Role Tabs */}
          <div className="flex bg-gray-50 border border-gray-100 p-1.5 rounded-2xl gap-1">
            {(['CAREGIVER', 'CLIENT'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setSignupRole(role);
                  setSignupError(null);
                }}
                className={`flex-1 py-2.5 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  signupRole === role
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {role === 'CAREGIVER' ? 'Join as Caregiver' : 'Join as Client/Family'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Full Name</label>
              <input 
                type="text" 
                required
                placeholder="Jane Doe"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Email Address</label>
              <input 
                type="email" 
                required
                placeholder="jane.doe@example.com"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Password</label>
              <input 
                type="password" 
                required
                placeholder="••••••••"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
              <input 
                type="text" 
                placeholder="+16045550199"
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-brand-purple"
              />
            </div>

            {/* Optional Patient Profile section for Clients */}
            {signupRole === 'CLIENT' && (
              <div className="border-t border-dashed border-gray-100 pt-4 mt-2 flex flex-col gap-3">
                <span className="text-[10px] font-extrabold text-brand-purple uppercase tracking-wider block">Patient / Recipient Profile Details (Optional)</span>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Patient Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-purple"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Home Address</label>
                  <input 
                    type="text"
                    placeholder="e.g. 850 W Georgia St, Vancouver, BC"
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-purple"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Latitude</label>
                    <input 
                      type="text"
                      placeholder="49.2827"
                      value={patientLat}
                      onChange={(e) => setPatientLat(e.target.value)}
                      className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-brand-purple"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-gray-400 uppercase">Longitude</label>
                    <input 
                      type="text"
                      placeholder="-123.1207"
                      value={patientLng}
                      onChange={(e) => setPatientLng(e.target.value)}
                      className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-brand-purple"
                    />
                  </div>
                </div>
              </div>
            )}

            {signupError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <i className="fa-solid fa-circle-exclamation w-4 h-4 shrink-0"></i>
                <span>{signupError}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={isSigningUp || !signupName || !signupEmail || !signupPassword}
              className="w-full mt-2 py-3.5 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2"
            >
              {isSigningUp ? (
                <>
                  <div className="w-4.5 h-4.5 border-2 border-white border-t-brand-teal rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-user-plus w-4 h-4"></i>
                  <span>Register & Launch</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-100"></div>
            <span className="flex-shrink mx-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">or Agency Admin login</span>
            <div className="flex-grow border-t border-gray-100"></div>
          </div>

          {/* Continue with Google (Simulated Admin) */}
          <button 
            type="button" 
            onClick={() => {
              setGoogleCustomRole('ADMIN');
              setShowGoogleModal(true);
              setSignupError(null);
            }} 
            className="w-full py-3 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2.5"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continue with Google account</span>
          </button>
        </div>

        {/* MOCK GOOGLE LOGIN MODAL OVERLAY */}
        {showGoogleModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 flex flex-col gap-6 animate-fade-in relative">
              
              {/* Google Modal Header */}
              <div className="flex flex-col items-center text-center pb-4 border-b border-gray-100">
                <svg className="w-9 h-9 mb-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <h3 className="text-xl font-bold text-gray-800">Sign in with Google</h3>
                <p className="text-xs text-gray-400 mt-1">to continue to <span className="font-semibold text-brand-purple">Akirapa</span></p>
              </div>

              {googleIsSubmitting ? (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-10 h-10 border-4 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Verifying Google Account...</span>
                    <span className="text-[10px] text-gray-400 block mt-1">OAuth 2.0 secure authorization exchange</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Account Selector List */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Choose an Account</span>
                    
                    <button 
                      type="button"
                      onClick={() => handleGoogleAccountSelect('admin@akirapa.com', 'ADMIN')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-gray-800">Elena Rostova</div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">admin@akirapa.com</div>
                      </div>
                      <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold px-2 py-0.5 rounded-md">Admin</span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-gray-100"></div>
                    <span className="flex-shrink mx-3 text-[9px] text-gray-400 font-bold uppercase tracking-wider">or sign in with another account</span>
                    <div className="flex-grow border-t border-gray-100"></div>
                  </div>

                  {/* Use another account inputs */}
                  <form onSubmit={handleGoogleCustomSubmit} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Google Email</label>
                      <input 
                        type="email"
                        required
                        placeholder="yourname@gmail.com"
                        value={googleEmailInput}
                        onChange={(e) => setGoogleEmailInput(e.target.value)}
                        className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#4285F4]"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Select App Role</label>
                      <select 
                        value={googleCustomRole}
                        onChange={(e) => setGoogleCustomRole(e.target.value as any)}
                        className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#4285F4] cursor-pointer"
                      >
                        <option value="ADMIN">Agency Admin (Command/Scheduling)</option>
                        <option value="CAREGIVER">Caregiver (Clock-In/Checklist)</option>
                        <option value="CLIENT">Client Portal (Family Feed)</option>
                      </select>
                    </div>

                    <button 
                      type="submit"
                      disabled={!googleEmailInput.trim()}
                      className="w-full mt-1 py-2.5 bg-[#4285F4] hover:bg-[#357AE8] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      Authenticate Google User
                    </button>
                  </form>

                  {/* Cancel Button */}
                  <button 
                    type="button"
                    onClick={() => {
                      setShowGoogleModal(false);
                      setGoogleEmailInput('');
                    }}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Main Dashboard gating logic
  if (viewState === 'splash') {
    return renderSplashScreen();
  }
  if (viewState === 'signup') {
    return renderSignupScreen();
  }
  if (viewState === 'role_select' || viewState === 'login') {
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
          <i className="fa-solid fa-bell w-5 h-5 text-brand-teal"></i>
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
                <i className="fa-solid fa-right-from-bracket w-4 h-4"></i>
              </button>
            </div>

            <button 
              onClick={() => loadData()}
              title="Refresh Data"
              className="p-2.5 bg-brand-purple-light/20 hover:bg-brand-purple-light/40 border border-brand-purple-light/10 rounded-2xl text-brand-teal transition-all active:scale-95 cursor-pointer"
            >
              <i className="fa-solid fa-arrows-rotate w-5 h-5"></i>
            </button>
          </div>
        </div>
      </header>

      {/* Simulator GPS slider quick bar - Only visible to Admins and Caregivers */}
      {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' || user.role === 'CAREGIVER') && (
        <section className="bg-white border-b border-gray-100 py-4 px-8 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-wrap justify-end items-center gap-4">
            
            {/* GPS Mode Selector */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-2xl text-xs font-bold">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useRealGPS}
                  onChange={(e) => setUseRealGPS(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-purple accent-brand-purple cursor-pointer"
                />
                <span>Use Real Device GPS</span>
              </label>
            </div>

            {/* GPS Simulation Slider */}
            <div className={`flex items-center gap-4 bg-brand-teal-ultra border border-brand-teal/20 px-5 py-3 rounded-2xl w-full lg:w-auto transition-opacity ${useRealGPS ? 'opacity-40 pointer-events-none' : ''}`}>
              <i className="fa-solid fa-map-pin w-5 h-5 text-brand-teal shrink-0"></i>
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
                  disabled={useRealGPS}
                  onChange={(e) => setDistanceOffset(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-brand-teal/20 rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
              </div>
              <div className="text-xs font-bold shrink-0 text-right">
                {useRealGPS ? (
                  <span className="text-brand-purple bg-brand-purple-ultra px-2 py-1 rounded-md border border-brand-purple-light/20">Using Device GPS</span>
                ) : distanceOffset <= 150 ? (
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
          
          {/* Admin Gated Options */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
            <>
              <button 
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'admin' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
              >
                <i className="fa-solid fa-calendar w-5 h-5 shrink-0"></i>
                <span>Admin & Scheduler</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('audits')}
                className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'audits' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
              >
                <i className="fa-solid fa-database w-5 h-5 shrink-0"></i>
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
              <i className="fa-solid fa-clock w-5 h-5 shrink-0"></i>
              <span>Caregiver Dashboard</span>
            </button>
          )}

          {/* Client (Family) Gated Options */}
          {user.role === 'FAMILY_MEMBER' && (
            <button 
              onClick={() => setActiveTab('family')}
              className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl text-sm font-bold transition-all border cursor-pointer ${activeTab === 'family' ? 'bg-brand-purple-ultra border-brand-purple-light/20 text-brand-purple shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
            >
              <i className="fa-solid fa-heart-pulse w-5 h-5 shrink-0"></i>
              <span>Client Activity Feed</span>
            </button>
          )}

          {/* SMS Simulation Alerts Panel - Render for Caregivers and Admins */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' || user.role === 'CAREGIVER') && (
            <div className="mt-8 bg-brand-purple text-white rounded-3xl p-5 border border-brand-purple-light/20 shadow-xl flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-brand-purple-light/20 pb-3">
                <span className="flex items-center gap-2 text-xs font-bold text-white">
                  <i className="fa-solid fa-mobile-screen-button w-4 h-4 text-brand-teal-light"></i>
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
                      <i className="fa-solid fa-shield-halved w-6 h-6 text-amber-500 shrink-0 mt-0.5"></i>
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
                      <i className="fa-solid fa-arrows-rotate w-4 h-4"></i>
                      <span>Run Auto-Escalation Check</span>
                    </button>
                  </div>

                  {/* Pod Mapping Form & Scheduler Form Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Caregiver Pod Mapping */}
                    <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-5">
                      <div className="border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                          <i className="fa-solid fa-users w-4 h-4 text-brand-teal"></i>
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
                          <i className="fa-solid fa-calendar w-4 h-4 text-brand-teal"></i>
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
                              {suggestions.length > 0 ? (
                                suggestions.map((s: any) => (
                                  <option key={s.id} value={s.id} disabled={s.hasConflict}>
                                    {s.name} - {s.rankLabel}
                                  </option>
                                ))
                              ) : (
                                caregivers.map(cg => (
                                  <option key={cg.id} value={cg.id}>{cg.name}</option>
                                ))
                              )}
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

                        {/* Intelligent Recommendations Directory */}
                        {loadingSuggestions ? (
                          <div className="py-3 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                            <div className="w-3.5 h-3.5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
                            <span>Calculating caregiver matches...</span>
                          </div>
                        ) : suggestions.length > 0 ? (
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex flex-col gap-2.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                              <i className="fa-solid fa-wand-magic-sparkles text-brand-teal shrink-0"></i>
                              <span>Intelligent Match Rankings</span>
                            </span>
                            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                              {suggestions.map((s: any) => (
                                <div key={s.id} className="flex justify-between items-center bg-white border border-gray-100 px-3 py-2 rounded-xl text-[11px] gap-2">
                                  <div className="min-w-0">
                                    <div className="font-bold text-gray-800 truncate">{s.name}</div>
                                  </div>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                    s.rank === 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    s.rank === 2 ? 'bg-brand-teal-ultra text-brand-teal-dark border-brand-teal/20' :
                                    s.rank === 3 ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                    s.rank === 4 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                    'bg-rose-50 text-rose-700 border-rose-100'
                                  }`}>
                                    {s.rankLabel}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

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
                              <i className="fa-solid fa-calendar w-5 h-5 text-brand-purple shrink-0 mt-0.5"></i>
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
                                    <i className="fa-solid fa-circle-exclamation w-3 h-3"></i>
                                    <span>Outside Pod Assignment Warning</span>
                                  </span>
                                )}
                                {(shift.status === 'IN_PROGRESS' || shift.status === 'COMPLETED') && (
                                  <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
                                    {shift.actualStart && (
                                      <span className="inline-flex items-center gap-1.5 bg-brand-purple-ultra border border-brand-purple-light/10 text-brand-purple px-2.5 py-1.5 rounded-xl font-semibold">
                                        <i className="fa-solid fa-clock w-3.5 h-3.5 text-brand-purple-light"></i>
                                        <span>
                                          Clocked In: <span className="font-bold">{new Date(shift.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </span>
                                        {shift.clockInLat && shift.clockInLng ? (
                                          <span className="text-gray-400 font-mono text-[9px] border-l border-brand-purple/10 pl-1.5 ml-1">
                                            {shift.clockInLat.toFixed(4)}, {shift.clockInLng.toFixed(4)}
                                          </span>
                                        ) : (
                                          <span className="text-amber-600 font-bold border-l border-brand-purple/10 pl-1.5 ml-1">Override</span>
                                        )}
                                      </span>
                                    )}
                                    {shift.status === 'COMPLETED' && shift.actualEnd && (
                                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-xl font-semibold">
                                        <i className="fa-solid fa-circle-check w-3.5 h-3.5 text-emerald-500"></i>
                                        <span>
                                          Clocked Out: <span className="font-bold">{new Date(shift.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </span>
                                        {shift.clockOutLat && shift.clockOutLng ? (
                                          <span className="text-gray-400 font-mono text-[9px] border-l border-emerald-200 pl-1.5 ml-1">
                                            {shift.clockOutLat.toFixed(4)}, {shift.clockOutLng.toFixed(4)}
                                          </span>
                                        ) : (
                                          <span className="text-rose-600 font-bold border-l border-emerald-200 pl-1.5 ml-1">Override</span>
                                        )}
                                      </span>
                                    )}
                                  </div>
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
                                  <i className="fa-solid fa-trash-can w-4 h-4"></i>
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

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    
                    {/* Left Column: Active Shift Card */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                      {(() => {
                          const activeShifts = shifts.filter(s => s.caregiverId === user.id && s.status !== 'COMPLETED' && s.status !== 'DROPPED');
                          const sortedShifts = [...activeShifts].sort((a, b) => {
                            const aNeedsAction = a.status === 'UNCONFIRMED' || a.status === 'CONFIRMED';
                            const bNeedsAction = b.status === 'UNCONFIRMED' || b.status === 'CONFIRMED';
                            if (aNeedsAction && !bNeedsAction) return -1;
                            if (bNeedsAction && !aNeedsAction) return 1;
                            if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
                            if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
                            return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
                          });

                          if (sortedShifts.length === 0) {
                            return (
                              <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center text-gray-400 italic">
                                No active shifts assigned to you today.
                              </div>
                            );
                          }

                          return sortedShifts.map(shift => {
                            const needsClockIn = shift.status === 'CONFIRMED' || shift.status === 'UNCONFIRMED';
                            return (
                              <div key={shift.id} className={`bg-white border rounded-3xl p-8 shadow-sm flex flex-col gap-6 transition-all ${
                                needsClockIn ? 'border-brand-teal/40 ring-1 ring-brand-teal/10 shadow-lg' : 'border-gray-100'
                              }`}>
                        
                        {/* Header Details */}
                        <div className="flex justify-between items-start border-b border-gray-100 pb-5">
                          <div>
                            <h3 className="font-bold text-xl text-gray-800 mt-1">Client: {shift.client.name}</h3>
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                              <i className="fa-solid fa-clock w-3.5 h-3.5"></i>
                              <span>{new Date(shift.scheduledStart).toLocaleTimeString()} - {new Date(shift.scheduledEnd).toLocaleTimeString()}</span>
                              <span>&bull;</span>
                              <i className="fa-solid fa-map-pin w-3.5 h-3.5 text-brand-teal"></i>
                              <span>Radius requirement: {shift.client.geofenceRadiusMeter}m</span>
                            </div>
                          </div>

                          <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                            shift.status === 'IN_PROGRESS' ? 'bg-brand-teal-ultra text-brand-teal-dark border border-brand-teal/20 animate-pulse' :
                            shift.status === 'UNCONFIRMED' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-brand-purple text-white'
                          }`}>
                            {shift.status === 'IN_PROGRESS' ? 'In Progress (Clocked In)' :
                             shift.status === 'UNCONFIRMED' ? 'Unconfirmed (Awaiting Acceptance)' :
                             'Confirmed (Awaiting Clock-In)'}
                          </span>
                        </div>

                        {/* Clock-in / Confirmation Controller */}
                        {shift.status === 'UNCONFIRMED' ? (
                          <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex flex-col gap-4">
                            <h4 className="font-bold text-sm text-amber-800 flex items-center gap-2">
                              <i className="fa-solid fa-circle-exclamation text-amber-600"></i>
                              <span>Confirm Your Availability</span>
                            </h4>
                            
                            <div className="text-xs text-amber-900 leading-relaxed font-medium">
                              This shift is currently unconfirmed. Please verify that you will work this shift so it is locked in your schedule.
                              {(() => {
                                const hoursUntilShift = (new Date(shift.scheduledStart).getTime() - Date.now()) / (1000 * 60 * 60);
                                if (hoursUntilShift < 48) {
                                  return (
                                    <span className="block mt-2 font-extrabold text-rose-600">
                                      ⚠️ WARNING: Shift starts in {Math.round(hoursUntilShift)} hours! Confirm immediately to prevent auto-escalation.
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            <button 
                              onClick={() => handleConfirmShift(shift.id)}
                              className="py-3 bg-brand-purple hover:bg-brand-purple-dark text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <i className="fa-solid fa-circle-check w-4 h-4"></i>
                              <span>Accept & Confirm Shift</span>
                            </button>
                          </div>
                        ) : shift.status !== 'IN_PROGRESS' && (
                          <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl flex flex-col gap-4">
                            <h4 className="font-bold text-sm text-gray-700">Geofenced Clock-in Verification</h4>
                            
                            <div className="text-xs text-gray-600 leading-relaxed">
                              Your device reports coordinates derived from the GPS Distance tracker above. 
                              Clock-in validation is constrained to <span className="font-bold text-brand-purple">{shift.client.geofenceRadiusMeter} meters</span>.
                            </div>

                            {clockInError && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-semibold">
                                <i className="fa-solid fa-circle-exclamation w-4 h-4"></i>
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
                                <i className="fa-solid fa-map-pin w-4 h-4"></i>
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
                                <i className="fa-solid fa-shield-halved w-4.5 h-4.5 text-rose-500"></i>
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

                            {/* Upload Progress Media (Photos & Videos) */}
                            <div className="flex flex-col gap-2">
                              <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                                <i className="fa-solid fa-camera text-brand-teal"></i>
                                <span>Upload Progress Media (Photos & Videos)</span>
                              </label>
                              
                              {/* Drag/Click Zone */}
                              <div className="relative border border-dashed border-gray-200 hover:border-brand-purple/40 bg-gray-50/30 rounded-xl p-4 transition-colors flex flex-col items-center justify-center gap-1">
                                <input 
                                  type="file" 
                                  accept="image/*,video/*"
                                  multiple
                                  onChange={handleMediaChange}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                />
                                <i className="fa-solid fa-cloud-arrow-up text-brand-purple-light text-xl"></i>
                                <span className="text-[10px] font-bold text-gray-500">Tap to Select Images / Videos</span>
                                <span className="text-[9px] text-gray-400">Supports JPG, PNG, MP4</span>
                              </div>

                              {/* Selected Media Previews */}
                              {selectedMediaFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2.5 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                  {selectedMediaFiles.map((file, idx) => {
                                    const isImage = file.type.startsWith('image/');
                                    return (
                                      <div key={idx} className="relative w-16 h-16 group shrink-0">
                                        {isImage ? (
                                          <img 
                                            src={file.preview} 
                                            alt={file.name} 
                                            className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm"
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-[#1e0f26] border border-gray-200 rounded-lg shadow-sm flex flex-col items-center justify-center text-white relative overflow-hidden">
                                            <i className="fa-solid fa-video text-brand-teal text-base"></i>
                                            <span className="text-[8px] font-mono text-gray-400 mt-1 truncate max-w-full px-1">{file.name.substring(file.name.length - 8)}</span>
                                          </div>
                                        )}
                                        {/* Remove Button */}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveMedia(idx)}
                                          className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[9px] font-black shadow-md border border-white cursor-pointer z-20"
                                          title="Remove attached file"
                                        >
                                          &times;
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
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

                            {/* Shift Progress reporting trigger */}
                            <div className="flex flex-col gap-3 mt-4 border-t border-gray-100 pt-5">
                              <button 
                                type="button"
                                onClick={() => handlePostCaregiverUpdate(shift.id)}
                                disabled={isPostingUpdate}
                                className="py-3 bg-brand-teal hover:bg-brand-teal-dark disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none text-brand-purple font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                              >
                                {isPostingUpdate ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />
                                    <span>Submitting Clinical Report...</span>
                                  </>
                                ) : (
                                  <>
                                    <i className="fa-solid fa-paper-plane w-4 h-4"></i>
                                    <span>Submit Progress & Clinical Report</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Clock-out Remarks & Trigger */}
                            <div className="flex flex-col gap-4 border-t border-gray-100 pt-6 mt-4">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Optional Patient Status Remarks (for Clock-Out)</label>
                                <textarea 
                                  rows={2}
                                  placeholder="Enter final shift summary, client status changes at departure, or handoff notes..."
                                  value={clockOutRemarks}
                                  onChange={(e) => setClockOutRemarks(e.target.value)}
                                  className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-purple"
                                />
                              </div>

                              <button 
                                onClick={() => handleClockOut(shift.id, false)}
                                className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <i className="fa-solid fa-circle-check w-4 h-4"></i>
                                <span>Complete Shift & Clock-Out</span>
                              </button>
                            </div>
                          </div>              </div>
                        )}

                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Right Column: Scheduled visits */}
                    <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-4">
                      <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                            <i className="fa-solid fa-calendar-days text-brand-teal"></i>
                            <span>My Scheduled Visits</span>
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-0.5">Your calendar routing details.</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                        {shifts.filter(s => s.caregiverId === user.id).length === 0 ? (
                          <div className="text-center text-xs text-gray-400 italic py-4">No scheduled visits.</div>
                        ) : (
                          shifts.filter(s => s.caregiverId === user.id).map(s => (
                            <div key={s.id} className="flex justify-between items-start bg-gray-50 border border-gray-100 p-4 rounded-2xl text-xs gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-gray-800">{s.client.name}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.25 rounded border ${
                                    s.status === 'COMPLETED' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                    s.status === 'IN_PROGRESS' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    s.status === 'UNCONFIRMED' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                    'bg-brand-purple-ultra text-brand-purple border border-brand-purple-light/20'
                                  }`}>
                                    {s.status}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-1.5">
                                  <i className="fa-solid fa-clock w-3.5 h-3.5 shrink-0 text-brand-purple-light"></i>
                                  <span>{new Date(s.scheduledStart).toLocaleDateString()} &bull; {new Date(s.scheduledStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(s.scheduledEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5">
                                  <i className="fa-solid fa-location-dot w-3.5 h-3.5 shrink-0 text-brand-teal"></i>
                                  <span className="truncate">{s.client.address}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 3: CLIENT PORTAL ACTIVITY FEED - Gated */}
              {user.role === 'FAMILY_MEMBER' && activeTab === 'family' && (
                <div className="flex flex-col gap-8">
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                    <h2 className="text-lg font-bold text-brand-purple">Client Portal Activity Feed</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Real-time updates, observation notes (decrypted for client representatives), and secure photo logs of Sarah Jenkins.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    
                    {/* Left Column: Live Feed List */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                      <div className="flex flex-col gap-4">
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
                          const isConfirmation = log.details?.type === 'SHIFT_CONFIRMED';
                          const hasWarning = log.details?.hasRedFlags;
                          const hasMedia = log.mediaUrls?.length > 0;
                          return (
                            <div key={log.id} className={`bg-white border rounded-3xl p-6 shadow-sm flex flex-col gap-4 transition-all ${
                              isConfirmation ? 'border-emerald-100 bg-emerald-50/5' :
                              hasWarning ? 'border-rose-100 bg-rose-50/10' : 'border-gray-100'
                            }`}>
                              
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                  <div className={`p-1.5 rounded-xl ${
                                    isConfirmation ? 'bg-emerald-50 text-emerald-600' :
                                    hasWarning ? 'bg-rose-50 text-rose-500' : 
                                    'bg-brand-teal-ultra text-brand-teal'
                                  }`}>
                                    {isConfirmation ? (
                                      <i className="fa-solid fa-calendar-check w-4 h-4"></i>
                                    ) : hasWarning ? (
                                      <i className="fa-solid fa-shield-halved w-4 h-4"></i>
                                    ) : (
                                      <i className="fa-solid fa-heart-pulse w-4 h-4"></i>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-gray-800">
                                      {isConfirmation ? 'Visit Availability Confirmed' : `Care Log by ${log.details?.caregiverName || 'Amara Okafor'}`}
                                    </div>
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
                                <div className="bg-brand-teal-ultra/15 border border-brand-teal/10 p-5 rounded-2xl flex flex-col gap-4">
                                  <span className="text-[9px] font-bold text-brand-teal-dark uppercase tracking-wider block">Encrypted Patient Care Media (Row-Level Decrypted)</span>
                                  
                                  <div className="flex flex-col gap-4">
                                    {log.mediaUrls.map((url: string, index: number) => {
                                      let name = 'care-attachment';
                                      let isVideo = false;
                                      
                                      if (log.details?.mediaFiles && Array.isArray(log.details.mediaFiles) && log.details.mediaFiles[index]) {
                                        const fileMeta = log.details.mediaFiles[index];
                                        name = fileMeta.name;
                                        isVideo = fileMeta.type?.startsWith('video/') || name?.toLowerCase().endsWith('.mp4') || name?.toLowerCase().endsWith('.mov');
                                      } else {
                                        name = log.details?.mediaName || `care-attachment-${index + 1}`;
                                        const type = log.details?.mediaType || '';
                                        isVideo = type.startsWith('video/') || name.toLowerCase().endsWith('.mp4') || name.toLowerCase().endsWith('.mov') || url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov');
                                      }

                                      return (
                                        <div key={index} className="flex flex-col gap-3 bg-white/60 p-4 rounded-2xl border border-brand-teal/5">
                                          <div className="flex items-center gap-3">
                                            <div className="bg-brand-teal text-brand-purple p-2.5 rounded-xl">
                                              <i className={`fa-solid ${isVideo ? 'fa-video animate-pulse' : 'fa-image'} w-4.5 h-4.5 flex items-center justify-center`}></i>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-bold text-gray-800 truncate">{name}</div>
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[9px] font-mono text-brand-teal-dark hover:underline truncate block"
                                              >
                                                {url}
                                              </a>
                                            </div>
                                          </div>

                                          {/* Inline Preview / Player */}
                                          <div className="mt-1">
                                            {isVideo ? (
                                              <div className="w-full max-w-md rounded-xl overflow-hidden border border-brand-teal/15 shadow-sm bg-black relative aspect-video flex items-center justify-center">
                                                <div className="absolute inset-0 bg-[#150b1c]/90 flex flex-col items-center justify-center gap-2 p-4 text-center z-10 text-white">
                                                  <i className="fa-solid fa-play text-brand-teal text-3xl animate-bounce"></i>
                                                  <div className="text-[10px] font-bold tracking-wider text-brand-teal-light uppercase">Secure Video Stream (Encrypted)</div>
                                                  <div className="text-[9px] text-gray-400 max-w-xs">{name} &bull; ISO-27001 TLS encrypted transmission</div>
                                                </div>
                                                <video 
                                                  className="w-full h-full opacity-35"
                                                  controls
                                                  preload="none"
                                                />
                                              </div>
                                            ) : (
                                              <div className="w-full max-w-md rounded-xl overflow-hidden border border-brand-teal/15 shadow-sm bg-gray-50 relative min-h-[140px] flex items-center justify-center">
                                                <div className="absolute inset-0 bg-[#fafafa]/90 flex flex-col items-center justify-center gap-2 p-4 text-center z-10 text-gray-700">
                                                  <div className="flex gap-1.5 items-center bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-extrabold border border-emerald-100 mb-1">
                                                    <i className="fa-solid fa-circle-check text-[10px]"></i>
                                                    <span>AES-256 Decrypted</span>
                                                  </div>
                                                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{name}</div>
                                                  <div className="text-[9px] text-gray-400">{name.includes('breakfast') ? 'Observation: Client eating healthy breakfast' : 'Observation: Daily physical routine check'}</div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                            </div>
                          );
                        })
                      )}
                        </div>
                      </div>

                      {/* Right Column: Scheduled Caregivers Panel */}
                      <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm flex flex-col gap-4">
                        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-sm text-brand-purple flex items-center gap-2">
                              <i className="fa-solid fa-user-nurse text-brand-teal animate-pulse"></i>
                              <span>My Scheduled Caregivers</span>
                            </h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">Details of scheduled visits, arrival, departure, and caregiver confirmation.</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                          {shifts.filter(s => s.status !== 'COMPLETED' && s.status !== 'DROPPED').length === 0 ? (
                            <div className="text-center text-xs text-gray-400 italic py-4">No upcoming scheduled visits.</div>
                          ) : (
                            shifts.filter(s => s.status !== 'COMPLETED' && s.status !== 'DROPPED').map(s => (
                              <div key={s.id} className="flex justify-between items-start bg-gray-50 border border-gray-100 p-4 rounded-2xl text-xs gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-gray-800">{s.caregiver.name}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.25 rounded border shrink-0 ${
                                      s.status === 'UNCONFIRMED' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                      'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    }`}>
                                      {s.status === 'UNCONFIRMED' ? 'Awaiting Acceptance' : 'Confirmed'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock w-3.5 h-3.5 shrink-0 text-brand-purple-light"></i>
                                    <span>Arrival: <strong>{new Date(s.scheduledStart).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</strong></span>
                                  </div>
                                  <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-arrow-right-from-bracket w-3.5 h-3.5 shrink-0 text-brand-teal"></i>
                                    <span>Departure: <strong>{new Date(s.scheduledEnd).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</strong></span>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
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

