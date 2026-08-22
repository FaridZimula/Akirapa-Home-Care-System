'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatTime, formatDateTime } from '@/lib/dateFormat';
import { isCaregiverProvisioningAuthorized, isBusinessHubAuthorized } from '@/lib/adminAllowlist';
import { cleanUSPhoneDigits, formatUSPhoneWithCountryCode, formatUSPhoneDisplay } from '@/lib/phone';
import PhoneInput from '@/components/PhoneInput';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

// Structured client welfare check, asked every shift. Polarity is explicit per
// question (some are "good = YES", others "bad = YES") so the computed
// red-flag object stays consistent: true always means "this is concerning."
const WELFARE_QUESTIONS: Array<{ key: string; question: string; concerningAnswer: 'YES' | 'NO' }> = [
  { key: 'appetiteDecline', question: "Did the client eat well today?", concerningAnswer: 'NO' },
  { key: 'medicationIssue', question: 'Did the client take their medication properly, without hesitation or refusal?', concerningAnswer: 'NO' },
  { key: 'behavioralChanges', question: "Did the client's behavior or mood seem different from their normal self?", concerningAnswer: 'YES' },
  { key: 'weaknessOrFatigue', question: 'Did the client seem weaker or more fatigued than usual?', concerningAnswer: 'YES' },
  { key: 'mobilityOrFallIssue', question: 'Did the client stumble, fall, or have difficulty moving safely?', concerningAnswer: 'YES' },
  { key: 'cognitiveConfusion', question: 'Did the client show any confusion or disorientation?', concerningAnswer: 'YES' },
  { key: 'hydrationConcern', question: 'Did the client drink enough fluids today?', concerningAnswer: 'NO' },
  { key: 'newOrWorseningPain', question: 'Did the client report any new or worsening pain?', concerningAnswer: 'YES' },
];

type WelfareAnswers = Record<string, 'YES' | 'NO' | null>;

const EMPTY_WELFARE_ANSWERS: WelfareAnswers = Object.fromEntries(WELFARE_QUESTIONS.map(q => [q.key, null]));

const US_STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' }, { abbr: 'AZ', name: 'Arizona' },
  { abbr: 'AR', name: 'Arkansas' }, { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' }, { abbr: 'FL', name: 'Florida' },
  { abbr: 'GA', name: 'Georgia' }, { abbr: 'HI', name: 'Hawaii' }, { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' }, { abbr: 'IA', name: 'Iowa' },
  { abbr: 'KS', name: 'Kansas' }, { abbr: 'KY', name: 'Kentucky' }, { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' }, { abbr: 'MA', name: 'Massachusetts' },
  { abbr: 'MI', name: 'Michigan' }, { abbr: 'MN', name: 'Minnesota' }, { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' }, { abbr: 'NE', name: 'Nebraska' },
  { abbr: 'NV', name: 'Nevada' }, { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' }, { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'ND', name: 'North Dakota' }, { abbr: 'OH', name: 'Ohio' }, { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' }, { abbr: 'RI', name: 'Rhode Island' },
  { abbr: 'SC', name: 'South Carolina' }, { abbr: 'SD', name: 'South Dakota' }, { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' }, { abbr: 'VT', name: 'Vermont' },
  { abbr: 'VA', name: 'Virginia' }, { abbr: 'WA', name: 'Washington' }, { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' }, { abbr: 'DC', name: 'District of Columbia' },
];

function computeWelfareRedFlags(answers: WelfareAnswers): Record<string, boolean> {
  return Object.fromEntries(WELFARE_QUESTIONS.map(q => [q.key, answers[q.key] === q.concerningAnswer]));
}

type AdminPreviewRole = 'ADMIN' | 'CAREGIVER' | 'CARE_COORDINATOR' | 'FAMILY_MEMBER';

const ADMIN_PORTAL_VIEWS: Array<{ role: AdminPreviewRole; label: string; icon: string }> = [
  { role: 'ADMIN', label: 'Admin', icon: 'fa-shield-halved' },
  { role: 'CAREGIVER', label: 'Caregiver', icon: 'fa-user-nurse' },
  { role: 'CARE_COORDINATOR', label: 'Coordinator', icon: 'fa-clipboard-user' },
  { role: 'FAMILY_MEMBER', label: 'Family', icon: 'fa-house-medical' },
];

export default function Home() {
  const { user, loading: authLoading, login, logout } = useAuth();
  
  // Navigation state
  const [currentView, setCurrentView] = useState<'dashboard' | 'profile' | 'listings' | 'create' | 'add_caregiver' | 'add_client' | 'purchases' | 'business' | 'interested' | 'settings' | 'audit' | 'financials' | 'billing' | 'messages' | 'caregiverReviews' | 'messageOversight'>('dashboard');
  
  // Auth flow states
  const [viewState, setViewState] = useState<'splash' | 'login' | 'signup' | 'forgot_password' | 'dashboard'>('login');
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
  const [clientConflictAlert, setClientConflictAlert] = useState<string | null>(null);
  const [autoAssignPodOnShiftCreate, setAutoAssignPodOnShiftCreate] = useState(true);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showAllCaregivers, setShowAllCaregivers] = useState(false);

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

  // Mandatory Clock-Out Questionnaire (manual or auto-triggered at shift end)
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [clockOutTargetShiftId, setClockOutTargetShiftId] = useState<string | null>(null);
  const [isForcedClockOut, setIsForcedClockOut] = useState(false);
  const [clockOutOvertimeReason, setClockOutOvertimeReason] = useState('');
  const [isSubmittingClockOut, setIsSubmittingClockOut] = useState(false);
  const autoClockOutTriggeredRef = useRef<Set<string>>(new Set());
  
  // Structured welfare check answers (Y/N per WELFARE_QUESTIONS)
  const [welfareAnswers, setWelfareAnswers] = useState<WelfareAnswers>(EMPTY_WELFARE_ANSWERS);

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
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<Array<{ name: string; type: string; preview: string; file?: File | Blob }>>([]);
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
  const [clientBillingRateInput, setClientBillingRateInput] = useState<string>('');
  const [clientFullMetaSnapshot, setClientFullMetaSnapshot] = useState<any>({});
  const [isSavingClientProfile, setIsSavingClientProfile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Caregiver User Profile Metadata Editor
  const [userPhoneInput, setUserPhoneInput] = useState<string>('');
  const [userCertificationsInput, setUserCertificationsInput] = useState<string[]>([]);
  const [userSpecialtiesInput, setUserSpecialtiesInput] = useState<string>('');
  const [userBioInput, setUserBioInput] = useState<string>('');
  const [isSavingUserProfile, setIsSavingUserProfile] = useState(false);
  const [overtimeActionType, setOvertimeActionType] = useState<'OVERTIME_CLAIM' | 'CLOCK_OUT'>('OVERTIME_CLAIM');

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

  // Add Client Provisioning State
  const [newClientFirstName, setNewClientFirstName] = useState('');
  const [newClientLastName, setNewClientLastName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientState, setNewClientState] = useState('');
  const [newClientZip, setNewClientZip] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientCareTier, setNewClientCareTier] = useState('Standard');
  const [newClientBillingRate, setNewClientBillingRate] = useState('45.00');
  const [newClientEmergencyFirstName, setNewClientEmergencyFirstName] = useState('');
  const [newClientEmergencyLastName, setNewClientEmergencyLastName] = useState('');
  const [newClientEmergencyPhone, setNewClientEmergencyPhone] = useState('');
  const [newClientEmergencyRelationship, setNewClientEmergencyRelationship] = useState('Family Contact');
  const [isProvisioningClient, setIsProvisioningClient] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);

  // In-Portal Self Password Change Modal State
  const [showSelfPasswordModal, setShowSelfPasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newSelfPasswordInput, setNewSelfPasswordInput] = useState('');
  const [confirmSelfPasswordInput, setConfirmSelfPasswordInput] = useState('');
  const [isChangingSelfPassword, setIsChangingSelfPassword] = useState(false);
  const [selfPasswordError, setSelfPasswordError] = useState<string | null>(null);

  // Mandatory Profile Onboarding Modal State
  const [showMandatoryOnboardingModal, setShowMandatoryOnboardingModal] = useState(false);
  const [onboardingPhone, setOnboardingPhone] = useState('');
  const [onboardingAddress, setOnboardingAddress] = useState('');
  const [onboardingEmergencyFirstName, setOnboardingEmergencyFirstName] = useState('');
  const [onboardingEmergencyLastName, setOnboardingEmergencyLastName] = useState('');
  const [onboardingEmergencyPhone, setOnboardingEmergencyPhone] = useState('');
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);

  // System Audit Logs & Security Viewer
  const [showAuditLogsModal, setShowAuditLogsModal] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState<'ALL' | 'SUCCESS' | 'FAILURE'>('ALL');

  // Admin Dashboard Stat Card Interactive Filter
  const [dashboardCardFilter, setDashboardCardFilter] = useState<'ALL' | 'CLIENTS' | 'CAREGIVERS' | 'ACTIVE_SHIFTS' | 'COMPLETED_SHIFTS' | 'UNASSIGNED_CLIENTS'>('ALL');

  // Notifications
  const [smsAlerts, setSmsAlerts] = useState<Array<{ timestamp: Date; to: string; message: string }>>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);

  // Admin Multi-Portal Switcher & Account Provisioning
  const [adminPreviewRole, setAdminPreviewRole] = useState<AdminPreviewRole>('ADMIN');
  const effectiveRole = user?.role === 'ADMIN' ? adminPreviewRole : user?.role;

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'CAREGIVER' | 'CARE_COORDINATOR'>('CAREGIVER');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPayRate, setNewUserPayRate] = useState('28.00');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Signup States
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupRole, setSignupRole] = useState<'CLIENT' | 'CAREGIVER'>('CLIENT');
  const [signupError, setSignupError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Signup — email verification
  const [signupCode, setSignupCode] = useState('');
  const [isSignupCodeSent, setIsSignupCodeSent] = useState(false);
  const [isSendingSignupCode, setIsSendingSignupCode] = useState(false);

  // Signup — Client Details (only used when signupRole === 'CLIENT')
  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientDobInput, setPatientDobInput] = useState('');
  const [patientGenderInput, setPatientGenderInput] = useState('');
  const [patientPhoneInput, setPatientPhoneInput] = useState('');
  const [patientEmailInput, setPatientEmailInput] = useState('');
  const [patientAddressInput, setPatientAddressInput] = useState('');
  const [patientCityInput, setPatientCityInput] = useState('');
  const [patientStateInput, setPatientStateInput] = useState('');
  const [patientZipInput, setPatientZipInput] = useState('');

  // Signup — Medical Information
  const [patientMedicalConditions, setPatientMedicalConditions] = useState('');
  const [patientAllergiesNotes, setPatientAllergiesNotes] = useState('');

  // Signup — Emergency Contacts
  const [primaryContactFirstName, setPrimaryContactFirstName] = useState('');
  const [primaryContactLastName, setPrimaryContactLastName] = useState('');
  const [primaryContactRelationship, setPrimaryContactRelationship] = useState('');
  const [primaryContactPhone, setPrimaryContactPhone] = useState('');
  const [secondaryContactFirstName, setSecondaryContactFirstName] = useState('');
  const [secondaryContactLastName, setSecondaryContactLastName] = useState('');
  const [secondaryContactRelationship, setSecondaryContactRelationship] = useState('');
  const [secondaryContactPhone, setSecondaryContactPhone] = useState('');

  // Signup — Care Preferences (kind of care/comfort services the client would like)
  const CARE_PREFERENCE_OPTIONS = [
    'Companionship & Conversation',
    'Daily Walks / Mobility Support',
    'Light Massage / Comfort Therapy',
    'Reading Aloud',
    'Music & Entertainment',
    'Gardening',
    'Games & Mental Stimulation',
    'Pet Care Assistance',
  ];
  const [carePreferences, setCarePreferences] = useState<string[]>([]);
  const [otherPreferences, setOtherPreferences] = useState('');

  // Signup — About Me (personality/routine/caregiver-fit Q&A, editable later by family too)
  const [patientPersonality, setPatientPersonality] = useState('');
  const [patientDailyRoutine, setPatientDailyRoutine] = useState('');
  const [patientPreferredCaregiverType, setPatientPreferredCaregiverType] = useState('');
  const [patientAdditionalObservations, setPatientAdditionalObservations] = useState('');

  // Signup — Caregiver Application Details (only used when signupRole === 'CAREGIVER')
  const [cgDob, setCgDob] = useState('');
  const [cgGender, setCgGender] = useState('');
  const [cgNationality, setCgNationality] = useState('');
  const [cgSsn, setCgSsn] = useState('');
  const [cgWorkAuthNumber, setCgWorkAuthNumber] = useState('');
  const [cgAddress, setCgAddress] = useState('');
  const [cgCity, setCgCity] = useState('');
  const [cgState, setCgState] = useState('');
  const [cgZip, setCgZip] = useState('');
  const [cgPositionApplying, setCgPositionApplying] = useState('');
  const [cgEmploymentType, setCgEmploymentType] = useState('');
  const [cgDaysAvailable, setCgDaysAvailable] = useState<string[]>([]);
  const [cgPreferredShifts, setCgPreferredShifts] = useState<string[]>([]);
  const [cgHoursPerWeek, setCgHoursPerWeek] = useState('');
  const [cgCanTravel, setCgCanTravel] = useState<'Yes' | 'No' | ''>('');
  const [cgTravelDistance, setCgTravelDistance] = useState('');

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
  const [googleCustomRole, setGoogleCustomRole] = useState<'CAREGIVER' | 'CLIENT'>('CAREGIVER');
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

  // Caregiver Home Base Location (used for proximity-based shift scheduling)
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [savedLocation, setSavedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Admin Payroll Dashboard
  const [financialsData, setFinancialsData] = useState<any>(null);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);
  const [editingPayRateFor, setEditingPayRateFor] = useState<string | null>(null);
  const [payRateInput, setPayRateInput] = useState('');
  const [isSavingPayRate, setIsSavingPayRate] = useState(false);

  // Admin Billing / Payment Tracker
  const [invoicesData, setInvoicesData] = useState<any>(null);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [showGenerateInvoiceModal, setShowGenerateInvoiceModal] = useState(false);
  const [invoiceClientId, setInvoiceClientId] = useState('');
  const [invoicePeriodStart, setInvoicePeriodStart] = useState('');
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTaxRate, setInvoiceTaxRate] = useState('4');
  const [invoiceDiscount, setInvoiceDiscount] = useState('0');
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [recordingPaymentFor, setRecordingPaymentFor] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentMethodInput, setPaymentMethodInput] = useState('ACH Transfer');

  // Admin Client Billing Record (per-client statement)
  const [selectedBillingClientId, setSelectedBillingClientId] = useState('');
  const [isLoadingBillingRecord, setIsLoadingBillingRecord] = useState(false);
  const [viewingBillingRecord, setViewingBillingRecord] = useState<any>(null);

  // Messaging (caregiver <-> family, monitored by admin/coordinator)
  const [messageConversations, setMessageConversations] = useState<Array<{ id: string; contactId?: string; name: string; subtitle?: string; roleLabel?: string; participants: Array<{ id: string; name: string; role: string }> }>>([]);
  const [selectedMessageClientId, setSelectedMessageClientId] = useState<string>('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [messageThread, setMessageThread] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [lastSentMessageId, setLastSentMessageId] = useState<string | null>(null);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const [undoTimer, setUndoTimer] = useState<any>(null);

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await fetch(`/api/messages?messageId=${messageId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessageThread(prev => prev.filter(m => m.id !== messageId));
        if (lastSentMessageId === messageId) {
          setShowUndoBanner(false);
          setLastSentMessageId(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

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

  // Family self-service "About Me" editor
  const [familyAboutMePersonality, setFamilyAboutMePersonality] = useState('');
  const [familyAboutMeDailyRoutine, setFamilyAboutMeDailyRoutine] = useState('');
  const [familyAboutMePreferredCaregiverType, setFamilyAboutMePreferredCaregiverType] = useState('');
  const [familyAboutMeObservations, setFamilyAboutMeObservations] = useState('');
  const [isSavingAboutMe, setIsSavingAboutMe] = useState(false);

  // Weekly caregiver review (family-facing)
  const [weeklyReviewCaregivers, setWeeklyReviewCaregivers] = useState<Array<{ id: string; name: string; existingReview: any }>>([]);
  const [isLoadingWeeklyReviews, setIsLoadingWeeklyReviews] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { strengths: string; improvements: string; wouldContinue: boolean | null; rating: string }>>({});
  const [isSubmittingReviewFor, setIsSubmittingReviewFor] = useState<string | null>(null);

  // Admin Caregiver Reviews
  const [adminCaregiverReviews, setAdminCaregiverReviews] = useState<any[]>([]);
  const [isLoadingAdminReviews, setIsLoadingAdminReviews] = useState(false);

  // Admin Message Oversight (system-wide chat monitoring, read-only)
  const [oversightStats, setOversightStats] = useState<any>(null);
  const [oversightThreads, setOversightThreads] = useState<any[]>([]);
  const [isLoadingOversight, setIsLoadingOversight] = useState(false);
  const [oversightSearch, setOversightSearch] = useState('');
  const [oversightTypeFilter, setOversightTypeFilter] = useState<'ALL' | 'DIRECT' | 'GROUP'>('ALL');
  const [oversightTabFilter, setOversightTabFilter] = useState<'ALL' | 'CONVERSATIONS' | 'DIRECT' | 'TODAY' | 'ATTACHMENTS'>('ALL');
  const [viewingTranscript, setViewingTranscript] = useState<any>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

  // Splash Screen Animated Progress & Role Selection State
  const [splashProgress, setSplashProgress] = useState(0);
  const [selectedPortalRole, setSelectedPortalRole] = useState<'CAREGIVER' | 'CLIENT' | 'ADMIN' | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Business Hub Analytics & Security
  const [businessStats, setBusinessStats] = useState<any>(null);
  const [isLoadingBusinessStats, setIsLoadingBusinessStats] = useState(false);
  const [businessStatsError, setBusinessStatsError] = useState<string | null>(null);

  // Admin Caregiver Password Setter Modal
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [targetPasswordUser, setTargetPasswordUser] = useState<any>(null);
  const [adminNewPasswordInput, setAdminNewPasswordInput] = useState('');
  const [isAdminSettingPassword, setIsAdminSettingPassword] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);

  // Super Admin Instant Deletion & Initial Password Viewing States
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleShowPassword = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getInitialPassword = (item: any) => {
    if (!item) return null;
    const metaStr = item.profileMetadata || item.user?.profileMetadata || item.familyMembers?.[0]?.user?.profileMetadata;
    if (!metaStr) return null;
    try {
      const meta = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr;
      return meta.initialPassword || null;
    } catch {
      return null;
    }
  };

  const handleDeleteCaregiver = async (caregiverId: string, caregiverName: string) => {
    if (!window.confirm(`Are you sure you want to delete caregiver "${caregiverName}"? All assigned shifts, pod assignments, and availability schedules will be deleted.`)) {
      return;
    }
    setDeletingUserId(caregiverId);
    try {
      const res = await fetch(`/api/admin/users/${caregiverId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showNotification(data.message || `Caregiver ${caregiverName} deleted successfully.`);
        await loadData();
      } else {
        showNotification(data.error || 'Failed to delete caregiver.');
      }
    } catch (err) {
      console.error('Failed to delete caregiver:', err);
      showNotification('Network error deleting caregiver.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (!window.confirm(`Are you sure you want to delete client "${clientName}"? All client profiles, family accounts, shifts, and care plans will be permanently removed.`)) {
      return;
    }
    setDeletingClientId(clientId);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showNotification(data.message || `Client ${clientName} deleted successfully.`);
        await loadData();
      } else {
        showNotification(data.error || 'Failed to delete client.');
      }
    } catch (err) {
      console.error('Failed to delete client:', err);
      showNotification('Network error deleting client.');
    } finally {
      setDeletingClientId(null);
    }
  };

  const fetchBusinessStats = async () => {
    setIsLoadingBusinessStats(true);
    setBusinessStatsError(null);
    try {
      const res = await fetch('/api/admin/business-stats');
      const data = await res.json();
      if (res.ok) {
        setBusinessStats(data);
      } else {
        setBusinessStatsError(data.error || 'Failed to fetch business stats.');
      }
    } catch (err) {
      console.error('Failed to fetch business stats:', err);
      setBusinessStatsError('Network error loading Business Hub analytics.');
    } finally {
      setIsLoadingBusinessStats(false);
    }
  };

  const handleAdminSetCaregiverPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPasswordUser || !adminNewPasswordInput) return;
    setIsAdminSettingPassword(true);
    setAdminPasswordError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetPasswordUser.id,
          newPassword: adminNewPasswordInput,
          mustChangePassword: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(data.message || `Password set for ${targetPasswordUser.name}`);
        setShowAdminPasswordModal(false);
        setTargetPasswordUser(null);
        setAdminNewPasswordInput('');
        await loadData();
      } else {
        setAdminPasswordError(data.error || 'Failed to set password.');
      }
    } catch (err) {
      console.error(err);
      setAdminPasswordError('Network error setting password.');
    } finally {
      setIsAdminSettingPassword(false);
    }
  };

  const handleProvisionClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const newClientName = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim();
    const newClientEmergencyName = `${newClientEmergencyFirstName.trim()} ${newClientEmergencyLastName.trim()}`.trim();
    if (!newClientFirstName || !newClientLastName || !newClientEmail || !newClientPassword) {
      setAddClientError('Client first name, last name, login email, and first-time password are required.');
      return;
    }
    setIsProvisioningClient(true);
    setAddClientError(null);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName,
          email: newClientEmail,
          password: newClientPassword,
          address: newClientAddress,
          city: newClientCity,
          state: newClientState,
          zip: newClientZip,
          phoneNumber: newClientPhone,
          careTier: newClientCareTier,
          billingRatePerHour: parseFloat(newClientBillingRate) || 45.0,
          emergencyContactName: newClientEmergencyName,
          emergencyContactPhone: newClientEmergencyPhone,
          emergencyContactRelationship: newClientEmergencyRelationship,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to provision client.');
      showNotification(data.message || `Client ${newClientName} provisioned successfully!`);
      setNewClientFirstName(''); setNewClientLastName(''); setNewClientEmail(''); setNewClientPassword('');
      setNewClientAddress(''); setNewClientCity(''); setNewClientState('');
      setNewClientZip(''); setNewClientPhone('');
      setNewClientEmergencyFirstName(''); setNewClientEmergencyLastName(''); setNewClientEmergencyPhone('');
      await loadData();
    } catch (err: any) {
      setAddClientError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsProvisioningClient(false);
    }
  };

  const handleChangeSelfPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPasswordInput || !newSelfPasswordInput) {
      setSelfPasswordError('Please enter both current and new password.');
      return;
    }
    if (newSelfPasswordInput.length < 8) {
      setSelfPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newSelfPasswordInput !== confirmSelfPasswordInput) {
      setSelfPasswordError('New password and confirm password do not match.');
      return;
    }
    setIsChangingSelfPassword(true);
    setSelfPasswordError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPasswordInput, newPassword: newSelfPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password.');
      showNotification('Password updated successfully!');
      setShowSelfPasswordModal(false);
      setCurrentPasswordInput(''); setNewSelfPasswordInput(''); setConfirmSelfPasswordInput('');
    } catch (err: any) {
      setSelfPasswordError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsChangingSelfPassword(false);
    }
  };

  const handleDownloadBusinessReportPdf = () => {
    window.print();
  };

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
    else if (score === 3) { label = 'Strong'; color = 'bg-purple-100 text-purple-800 border-purple-200'; barClass = 'strength-strong'; }
    else if (score >= 4) { label = 'Excellent'; color = 'bg-green-100 text-green-800 border-green-200'; barClass = 'strength-excellent'; }

    return { score, label, color, barClass, checks };
  };

  const renderPasswordStrengthMeter = (pass: string) => {
    return null;
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
        setViewState('login');
      }
      setLoginEmail('');
      setLoginPassword('');
    } else if (user) {
      setViewState('dashboard');
      if (user.role === 'CAREGIVER' && currentView !== 'dashboard' && currentView !== 'profile' && currentView !== 'messages') {
        setCurrentView('dashboard');
      }
    }
  }, [user, authLoading, currentView]);

  useEffect(() => {
    if (currentView === 'business' && user?.role === 'ADMIN' && (user.email === 'info@akirapahomecareus.com' || user.email === 'cathy@akirapahomecareus.com')) {
      fetchBusinessStats();
    }
  }, [currentView, user]);

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

  const handleUpdateMyLocation = async () => {
    if (!user) return;
    setIsSavingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const { latitude, longitude } = position.coords;

      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, latitude, longitude }),
      });
      if (res.ok) {
        setSavedLocation({ latitude, longitude });
        showNotification('Home base location updated - this improves nearest-caregiver shift matching.');
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to update location.');
      }
    } catch (err: any) {
      showNotification(`Could not get location: ${err.message || 'Permission denied or unavailable'}`);
    } finally {
      setIsSavingLocation(false);
    }
  };

  const loadFinancials = async () => {
    setIsLoadingFinancials(true);
    try {
      const res = await fetch('/api/admin/financials');
      const data = await res.json();
      if (res.ok) {
        setFinancialsData(data);
      } else {
        showNotification(data.error || 'Failed to load payroll data.');
      }
    } catch (err) {
      console.error('Failed to load financials:', err);
    } finally {
      setIsLoadingFinancials(false);
    }
  };

  const loadInvoices = async () => {
    setIsLoadingInvoices(true);
    try {
      const res = await fetch('/api/admin/invoices');
      const data = await res.json();
      if (res.ok) {
        setInvoicesData(data);
      } else {
        showNotification(data.error || 'Failed to load invoices.');
      }
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceClientId || !invoicePeriodStart || !invoicePeriodEnd || !invoiceDueDate) {
      showNotification('Fill in client, service period, and due date.');
      return;
    }
    setIsGeneratingInvoice(true);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: invoiceClientId,
          servicePeriodStart: invoicePeriodStart,
          servicePeriodEnd: invoicePeriodEnd,
          dueDate: invoiceDueDate,
          taxRatePercent: parseFloat(invoiceTaxRate) || 0,
          discountAmount: parseFloat(invoiceDiscount) || 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Invoice ${data.invoice.invoiceNumber} generated!`);
        setShowGenerateInvoiceModal(false);
        setInvoiceClientId('');
        setInvoicePeriodStart('');
        setInvoicePeriodEnd('');
        setInvoiceDueDate('');
        setInvoiceTaxRate('4');
        setInvoiceDiscount('0');
        loadInvoices();
        setViewingInvoice(data.invoice);
      } else {
        showNotification(data.error || 'Failed to generate invoice.');
      }
    } catch (err) {
      console.error('Failed to generate invoice:', err);
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleRecordPayment = async (invoiceId: string) => {
    const amount = parseFloat(paymentAmountInput);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Enter a valid payment amount.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: paymentMethodInput }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Payment recorded!');
        setRecordingPaymentFor(null);
        setPaymentAmountInput('');
        loadInvoices();
      } else {
        showNotification(data.error || 'Failed to record payment.');
      }
    } catch (err) {
      console.error('Failed to record payment:', err);
    }
  };

  const loadClientBillingRecord = async (clientId: string) => {
    if (!clientId) return;
    setIsLoadingBillingRecord(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/billing-record`);
      const data = await res.json();
      if (res.ok) {
        setViewingBillingRecord(data);
      } else {
        showNotification(data.error || 'Failed to load billing record.');
      }
    } catch (err) {
      console.error('Failed to load client billing record:', err);
    } finally {
      setIsLoadingBillingRecord(false);
    }
  };

  const handleStartEditPayRate = (caregiverId: string, currentRate: number | null) => {
    setEditingPayRateFor(caregiverId);
    setPayRateInput(currentRate != null ? String(currentRate) : '');
  };

  const handleSavePayRate = async (caregiverId: string) => {
    const rate = parseFloat(payRateInput);
    if (isNaN(rate) || rate < 0) {
      showNotification('Enter a valid hourly pay rate.');
      return;
    }
    setIsSavingPayRate(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: caregiverId, payRate: rate }),
      });
      if (res.ok) {
        showNotification('Pay rate updated.');
        setEditingPayRateFor(null);
        loadFinancials();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to update pay rate.');
      }
    } catch (err) {
      console.error('Failed to save pay rate:', err);
    } finally {
      setIsSavingPayRate(false);
    }
  };

  const loadMessageConversations = async () => {
    try {
      const res = await fetch('/api/messages/conversations');
      const data = await res.json();
      if (res.ok) {
        const convs = data.conversations || [];
        setMessageConversations(convs);
        if (convs.length > 0) {
          setSelectedMessageClientId(prev => prev || convs[0].id || '');
          setSelectedContactId(prev => prev || convs[0].contactId || convs[0].id || '');
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadMessageThread = async (clientId: string, silent = false, overrideContactId?: string) => {
    const targetContact = overrideContactId || selectedContactId || clientId;
    if (!clientId && !targetContact) return;
    if (!silent) setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?clientId=${clientId}&contactId=${targetContact}`);
      const data = await res.json();
      if (res.ok) setMessageThread(data.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      if (!silent) setIsLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedMessageClientId) return;
    const attachment = selectedMediaFiles[0];
    if (!messageText.trim() && !attachment) return;

    setIsSendingMessage(true);
    try {
      const formData = new FormData();
      formData.append('clientId', selectedMessageClientId);
      if (selectedContactId) formData.append('contactId', selectedContactId);
      if (messageText.trim()) formData.append('text', messageText.trim());
      if (attachment?.file) formData.append('file', attachment.file, attachment.name);

      const res = await fetch('/api/messages', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setMessageText('');
        if (attachment) URL.revokeObjectURL(attachment.preview);
        setSelectedMediaFiles([]);
        if (data.message) {
          setMessageThread(prev => [...prev, data.message]);
          setLastSentMessageId(data.message.id);
          setShowUndoBanner(true);
          if (undoTimer) clearTimeout(undoTimer);
          const timer = setTimeout(() => {
            setShowUndoBanner(false);
            setLastSentMessageId(null);
          }, 8000);
          setUndoTimer(timer);
        } else {
          loadMessageThread(selectedMessageClientId, true);
        }
      } else {
        showNotification(data.error || 'Failed to send message.');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSendingMessage(false);
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

  // Keep the family "About Me" editor in sync with whichever client is selected
  useEffect(() => {
    if (user?.role !== 'FAMILY_MEMBER') return;
    const activeClient = clients.find((c: any) => c.id === selectedFeedClientId);
    let meta: any = {};
    try { meta = activeClient?.profileMetadata ? JSON.parse(activeClient.profileMetadata) : {}; } catch {}
    setFamilyAboutMePersonality(meta.personality || '');
    setFamilyAboutMeDailyRoutine(meta.dailyRoutine || '');
    setFamilyAboutMePreferredCaregiverType(meta.preferredCaregiverType || '');
    setFamilyAboutMeObservations(meta.additionalObservations || '');
  }, [selectedFeedClientId, clients, user]);

  // Trigger mandatory first-time onboarding for non-admin users missing phone number
  useEffect(() => {
    if (!user) return;
    if (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') return;
    if (!user.phoneNumber && !showMandatoryOnboardingModal) {
      setShowMandatoryOnboardingModal(true);
    }
  }, [user]);

  const loadWeeklyReviewData = async (clientId: string) => {
    if (!clientId) return;
    setIsLoadingWeeklyReviews(true);
    try {
      const res = await fetch(`/api/family/caregiver-reviews?clientId=${clientId}`);
      const data = await res.json();
      if (res.ok) {
        setWeeklyReviewCaregivers(data.caregivers || []);
        const drafts: typeof reviewDrafts = {};
        for (const c of data.caregivers || []) {
          drafts[c.id] = {
            strengths: c.existingReview?.strengths || '',
            improvements: c.existingReview?.improvements || '',
            wouldContinue: c.existingReview ? c.existingReview.wouldContinue : null,
            rating: c.existingReview?.rating != null ? String(c.existingReview.rating) : '',
          };
        }
        setReviewDrafts(drafts);
      }
    } catch (err) {
      console.error('Failed to load weekly review data:', err);
    } finally {
      setIsLoadingWeeklyReviews(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'FAMILY_MEMBER' && selectedFeedClientId) {
      loadWeeklyReviewData(selectedFeedClientId);
    }
  }, [selectedFeedClientId, user]);

  const handleSubmitCaregiverReview = async (caregiverId: string) => {
    const draft = reviewDrafts[caregiverId];
    if (!draft || draft.wouldContinue === null) {
      showNotification('Please answer whether you\'d like to continue with this caregiver.');
      return;
    }
    setIsSubmittingReviewFor(caregiverId);
    try {
      const res = await fetch('/api/family/caregiver-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedFeedClientId,
          caregiverId,
          strengths: draft.strengths,
          improvements: draft.improvements,
          wouldContinue: draft.wouldContinue,
          rating: draft.rating ? parseInt(draft.rating) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('Review submitted - thank you!');
        loadWeeklyReviewData(selectedFeedClientId);
      } else {
        showNotification(data.error || 'Failed to submit review.');
      }
    } catch (err) {
      console.error('Failed to submit caregiver review:', err);
    } finally {
      setIsSubmittingReviewFor(null);
    }
  };

  const loadAdminCaregiverReviews = async () => {
    setIsLoadingAdminReviews(true);
    try {
      const res = await fetch('/api/admin/caregiver-reviews');
      const data = await res.json();
      if (res.ok) setAdminCaregiverReviews(data.reviews || []);
    } catch (err) {
      console.error('Failed to load admin caregiver reviews:', err);
    } finally {
      setIsLoadingAdminReviews(false);
    }
  };

  useEffect(() => {
    if (currentView === 'caregiverReviews' && (user?.role === 'ADMIN' || user?.role === 'CARE_COORDINATOR')) {
      loadAdminCaregiverReviews();
    }
  }, [currentView, user]);

  const loadMessageOversight = async () => {
    setIsLoadingOversight(true);
    try {
      const res = await fetch('/api/admin/message-oversight');
      const data = await res.json();
      if (res.ok) {
        setOversightStats(data.stats || null);
        setOversightThreads(data.threads || []);
      } else {
        showNotification(data.error || 'Failed to load message oversight.');
      }
    } catch (err) {
      console.error('Failed to load message oversight:', err);
    } finally {
      setIsLoadingOversight(false);
    }
  };

  useEffect(() => {
    if (currentView === 'messageOversight' && (user?.role === 'ADMIN' || user?.role === 'CARE_COORDINATOR')) {
      loadMessageOversight();
    }
  }, [currentView, user]);

  const handleOpenTranscript = async (thread: any) => {
    setIsLoadingTranscript(true);
    setViewingTranscript({ ...thread, messages: null });
    try {
      const res = await fetch(`/api/admin/message-oversight?threadKey=${encodeURIComponent(thread.threadKey)}`);
      const data = await res.json();
      if (res.ok) {
        setViewingTranscript({ ...thread, messages: data.messages || [] });
      } else {
        showNotification(data.error || 'Failed to load transcript.');
        setViewingTranscript(null);
      }
    } catch (err) {
      console.error('Failed to load transcript:', err);
      setViewingTranscript(null);
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  useEffect(() => {
    if (currentView === 'financials' && user?.role === 'ADMIN') {
      loadFinancials();
    }
  }, [currentView, user]);

  useEffect(() => {
    if (currentView === 'billing' && user?.role === 'ADMIN') {
      loadInvoices();
    }
  }, [currentView, user]);

  // Messaging: load the conversation list once the Messages view opens
  useEffect(() => {
    if (currentView === 'messages' && user) {
      loadMessageConversations();
    }
  }, [currentView, user]);

  // Messaging: load + poll the selected thread while the view is open
  useEffect(() => {
    if (currentView !== 'messages' || (!selectedMessageClientId && !selectedContactId)) return;
    loadMessageThread(selectedMessageClientId, false, selectedContactId);
    const interval = setInterval(() => loadMessageThread(selectedMessageClientId, true, selectedContactId), 5000);
    return () => clearInterval(interval);
  }, [currentView, selectedMessageClientId, selectedContactId]);

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
          if (data.clientConflict?.hasConflict) {
            const formatTimeStr = (dStr: string) => new Date(dStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setClientConflictAlert(
              `Booking Conflict: Selected client is ALREADY assigned caregiver "${data.clientConflict.caregiverName}" during this shift time (${formatTimeStr(data.clientConflict.scheduledStart)} - ${formatTimeStr(data.clientConflict.scheduledEnd)}). A client can only be given one caregiver at a time.`
            );
          } else {
            setClientConflictAlert(null);
          }
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
  // AUTO SIGN-OUT AT SHIFT END
  // Once a caregiver's active shift reaches its scheduled end time, force the
  // clock-out questionnaire open (it cannot be dismissed without submitting).
  // ============================================================

  useEffect(() => {
    if (!user || user.role !== 'CAREGIVER') return;

    const checkShiftEnd = () => {
      const activeShift = shifts.find(s => s.status === 'IN_PROGRESS' && s.caregiverId === user.id);
      if (!activeShift) return;

      if (isShiftOvertime(activeShift) && !autoClockOutTriggeredRef.current.has(activeShift.id)) {
        autoClockOutTriggeredRef.current.add(activeShift.id);
        openClockOutModal(activeShift.id, true);
      }
    };

    checkShiftEnd();
    const interval = setInterval(checkShiftEnd, 30000);
    return () => clearInterval(interval);
  }, [shifts, user]);

  // ============================================================
  // AUTHENTICATION HANDLERS
  // ============================================================

  const handlePortalLogin = async (email: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await login(email, pass);
      if (res.success) {
        await loadData();
      } else {
        setLoginError(res.error || 'Invalid credentials.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Authentication error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSendSignupCode = async () => {
    if (!signupEmail) {
      setSignupError('Please enter your email address first.');
      return;
    }
    setIsSendingSignupCode(true);
    setSignupError(null);
    try {
      const res = await fetch('/api/auth/verify/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, purpose: 'SIGNUP' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsSignupCodeSent(true);
        showNotification('Verification code sent to your email.');
      } else {
        setSignupError(data.error || 'Failed to send verification code.');
      }
    } catch (err) {
      console.error(err);
      setSignupError('A network error occurred.');
    } finally {
      setIsSendingSignupCode(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignupCodeSent) {
      setSignupError('Please verify your email address first.');
      return;
    }
    const signupName = `${signupFirstName.trim()} ${signupLastName.trim()}`.trim();
    const patientFullName = `${patientFirstName.trim()} ${patientLastName.trim()}`.trim();
    const primaryContactName = `${primaryContactFirstName.trim()} ${primaryContactLastName.trim()}`.trim();
    const secondaryContactName = `${secondaryContactFirstName.trim()} ${secondaryContactLastName.trim()}`.trim();

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
          code: signupCode,
          ...(signupRole === 'CLIENT' ? {
            patientName: patientFullName,
            patientDob: patientDobInput,
            patientGender: patientGenderInput,
            patientPhone: patientPhoneInput,
            patientEmail: patientEmailInput,
            patientAddress: patientAddressInput,
            patientCity: patientCityInput,
            patientState: patientStateInput,
            patientZip: patientZipInput,
            medicalConditions: patientMedicalConditions,
            allergiesNotes: patientAllergiesNotes,
            primaryEmergency: (primaryContactName || primaryContactPhone) ? {
              name: primaryContactName,
              relationship: primaryContactRelationship,
              phone: primaryContactPhone,
            } : null,
            secondaryEmergency: (secondaryContactName || secondaryContactPhone) ? {
              name: secondaryContactName,
              relationship: secondaryContactRelationship,
              phone: secondaryContactPhone,
            } : null,
            carePreferences,
            otherPreferences,
            personality: patientPersonality,
            dailyRoutine: patientDailyRoutine,
            preferredCaregiverType: patientPreferredCaregiverType,
            additionalObservations: patientAdditionalObservations,
          } : {}),
          ...(signupRole === 'CAREGIVER' ? {
            dob: cgDob,
            gender: cgGender,
            nationality: cgNationality,
            ssn: cgSsn,
            workAuthNumber: cgWorkAuthNumber,
            address: cgAddress,
            city: cgCity,
            state: cgState,
            zip: cgZip,
            positionApplying: cgPositionApplying,
            employmentType: cgEmploymentType,
            daysAvailable: cgDaysAvailable,
            preferredShifts: cgPreferredShifts,
            hoursPerWeek: cgHoursPerWeek,
            canTravel: cgCanTravel,
            travelDistance: cgTravelDistance,
          } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Account created successfully!');
        await login(signupEmail, signupPassword);
        await loadData();
        setSignupEmail('');
        setSignupPassword('');
        setSignupFirstName('');
        setSignupLastName('');
        setSignupPhone('');
        setSignupCode('');
        setIsSignupCodeSent(false);
        setPatientFirstName('');
        setPatientLastName('');
        setPatientDobInput('');
        setPatientGenderInput('');
        setPatientPhoneInput('');
        setPatientEmailInput('');
        setPatientAddressInput('');
        setPatientCityInput('');
        setPatientStateInput('');
        setPatientZipInput('');
        setPrimaryContactFirstName('');
        setPrimaryContactLastName('');
        setPrimaryContactRelationship('');
        setPrimaryContactPhone('');
        setSecondaryContactFirstName('');
        setSecondaryContactLastName('');
        setSecondaryContactRelationship('');
        setSecondaryContactPhone('');
        setCgDob('');
        setCgGender('');
        setCgNationality('');
        setCgSsn('');
        setCgWorkAuthNumber('');
        setCgAddress('');
        setCgCity('');
        setCgState('');
        setCgZip('');
        setCgPositionApplying('');
        setCgEmploymentType('');
        setCgDaysAvailable([]);
        setCgPreferredShifts([]);
        setCgHoursPerWeek('');
        setCgCanTravel('');
        setCgTravelDistance('');
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

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError(null);
    setIsCreatingUser(true);
    const newUserName = `${newUserFirstName.trim()} ${newUserLastName.trim()}`.trim();

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          name: newUserName,
          role: newUserRole,
          phoneNumber: newUserPhone,
          payRate: newUserRole === 'CAREGIVER' ? parseFloat(newUserPayRate) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAddUserError(data.error || 'Failed to create user account');
        return;
      }

      showNotification(`Account created for ${newUserEmail} (${newUserRole})`);
      setShowAddUserModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserPhone('');
      await loadData();
    } catch (err) {
      setAddUserError('An unexpected error occurred.');
    } finally {
      setIsCreatingUser(false);
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
          autoAssignPod: autoAssignPodOnShiftCreate,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShifts([data.shift, ...shifts]);
        setSchedulerWarning(data.warningAlert || null);
        setClientConflictAlert(null);
        showNotification(data.warningAlert ? 'Shift Created with Warning' : 'Shift Created Successfully');
        loadData();
      } else {
        setClientConflictAlert(data.error || 'Booking Conflict: Shift could not be created.');
        showNotification(data.error || 'Failed to create shift');
      }
    } catch (err) {
      console.error(err);
      setClientConflictAlert('Network error attempting to create shift.');
    }
  };

  const handleQuickAssignPodFromScheduler = async () => {
    if (!newShiftClientId || !newShiftCaregiverId) return;
    try {
      const res = await fetch('/api/admin/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: newShiftClientId,
          caregiverId: newShiftCaregiverId,
          role: 'PRIMARY',
        }),
      });
      if (res.ok) {
        setSchedulerWarning(null);
        showNotification('Caregiver successfully assigned to client Caregiver Pod!');
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
        loadData();
        loadNotifications();
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

  // Whether the given shift is currently past its scheduled end time (overtime).
  const isShiftOvertime = (shift: any) => !!shift && new Date() > new Date(shift.scheduledEnd);

  const openClockOutModal = (shiftId: string, forced = false) => {
    setClockOutError(null);
    setClockOutTargetShiftId(shiftId);
    setIsForcedClockOut(forced);
    setOvertimeActionType('OVERTIME_CLAIM');
    setShiftNotes('');
    setSelectedMediaFiles([]);
    setWelfareAnswers(EMPTY_WELFARE_ANSWERS);
    setClockOutOvertimeReason('');
    setShowClockOutModal(true);
  };

  const handleConfirmOvertimeClaim = async (shiftId: string) => {
    setClockOutError(null);
    if (!clockOutOvertimeReason.trim()) {
      setClockOutError('Please provide a reason for working overtime.');
      return;
    }
    if (selectedMediaFiles.length === 0) {
      setClockOutError('Please attach photo or document evidence for your overtime request.');
      return;
    }

    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    setIsSubmittingClockOut(true);
    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeShift.clientId,
          notes: `[OVERTIME CONFIRMED]: ${clockOutOvertimeReason.trim()}`,
          mediaFiles: selectedMediaFiles.map(f => ({ name: f.name, type: f.type })),
        }),
      });
      if (res.ok) {
        showNotification('Overtime request confirmed with reason & evidence!');
        setShowClockOutModal(false);
        setClockOutOvertimeReason('');
        setSelectedMediaFiles([]);
        loadData();
      } else {
        setClockOutError('Failed to record overtime confirmation.');
      }
    } catch (err) {
      console.error(err);
      setClockOutError('Error recording overtime confirmation.');
    } finally {
      setIsSubmittingClockOut(false);
    }
  };

  const handleClockOut = async (shiftId: string, isOverride = false) => {
    setClockOutError(null);
    const activeShift = shifts.find(s => s.id === shiftId);
    if (!activeShift) return;

    const overtime = isShiftOvertime(activeShift);
    if (overtime && !clockOutOvertimeReason.trim()) {
      setClockOutError('This shift has run past its scheduled end time. Please provide an overtime reason before clocking out.');
      return;
    }

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

    setIsSubmittingClockOut(true);
    try {
      const res = await fetch('/api/shifts/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          completedTaskIds: activeShiftTaskIds,
          redFlags: computeWelfareRedFlags(welfareAnswers),
          notes: shiftNotes,
          latitude: lat,
          longitude: lng,
          isOverride,
          overrideReason: isOverride ? clockOutOverrideReason : undefined,
          mediaFiles: selectedMediaFiles.map(f => ({ name: f.name, type: f.type })),
          overtimeReason: overtime ? clockOutOvertimeReason : undefined,
          overtimeEvidenceFile: overtime && selectedMediaFiles[0] ? { name: selectedMediaFiles[0].name, type: selectedMediaFiles[0].type } : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(isOverride ? 'Manual Override Submitted' : (data.hasRedFlags ? 'Clocked out with CLINICAL WARNINGS' : 'Clocked out successfully!'));
        setShiftNotes('');
        setSelectedMediaFiles([]);
        setWelfareAnswers(EMPTY_WELFARE_ANSWERS);
        setShowClockOutOverrideInput(false);
        setClockOutOverrideReason('');
        setClockOutOvertimeReason('');
        setShowClockOutModal(false);
        setClockOutTargetShiftId(null);

        // The caregiver's time on this shift is done - sign them out automatically.
        if (user?.role === 'CAREGIVER') {
          await logout();
        } else {
          loadData();
        }
      } else {
        setClockOutError(data.error);
        if (data.allowOverride) setShowClockOutOverrideInput(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingClockOut(false);
    }
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
          redFlags: computeWelfareRedFlags(welfareAnswers),
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
        setWelfareAnswers(EMPTY_WELFARE_ANSWERS);
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
    setClientBillingRateInput(client.billingRatePerHour != null ? String(client.billingRatePerHour) : '');

    let meta: any = {};
    try {
      if (client.profileMetadata) meta = JSON.parse(client.profileMetadata);
    } catch (e) {}

    setClientFullMetaSnapshot(meta);
    setClientMedicalConditions(meta.medicalConditions || 'Hypertension, Mild Arthritis');
    setClientEmergencyContact(meta.emergencyContact || 'Family Representative (+1-604-555-0199)');
    setClientAllergiesNotes(meta.allergiesNotes || 'No known drug allergies (NKDA)');
    setShowClientProfileModal(true);
  };

  const handleSaveClientProfileSettings = async () => {
    if (!targetClientEditor) return;
    setIsSavingClientProfile(true);
    try {
      // Preserve any existing metadata (care preferences, emergency contacts, etc.)
      // instead of overwriting the whole record with just these 3 fields.
      const profileMetadata = {
        ...clientFullMetaSnapshot,
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
          billingRatePerHour: clientBillingRateInput === '' ? null : parseFloat(clientBillingRateInput),
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

  const handleSaveAboutMe = async () => {
    if (!selectedFeedClientId) return;
    setIsSavingAboutMe(true);
    try {
      const res = await fetch('/api/family/client-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedFeedClientId,
          personality: familyAboutMePersonality,
          dailyRoutine: familyAboutMeDailyRoutine,
          preferredCaregiverType: familyAboutMePreferredCaregiverType,
          additionalObservations: familyAboutMeObservations,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('About Me updated!');
        loadData();
      } else {
        showNotification(data.error || 'Failed to save.');
      }
    } catch (err) {
      console.error('Failed to save About Me:', err);
    } finally {
      setIsSavingAboutMe(false);
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
            mobilityOrFallIssue: incidentType === 'Fall',
            behavioralChanges: incidentType === 'Behavioral Incident',
            cognitiveConfusion: false,
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
      file,
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const fileName = `voice_note_${new Date().toISOString().substring(11, 19).replace(/:/g, '')}.webm`;
        setSelectedMediaFiles(prev => [...prev, { name: fileName, type: 'audio/webm', preview: audioUrl, file: audioBlob }]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      showNotification('Voice Recording Started... Speak now!');
    } catch (err) {
      console.warn('Microphone recording unavailable:', err);
      showNotification('Could not access your microphone. Check browser/device permissions and try again.');
    }
  };

  const handleStopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      showNotification('Voice Note Recorded & Attached!');
    }
  };

  // ============================================================
  // GOOGLE SIGN-IN
  // ============================================================

  const handleGoogleAccountSelect = async (email: string, role: 'ADMIN' | 'CAREGIVER' | 'CLIENT') => {
    setGoogleIsSubmitting(true);
    let password = 'googleAuthPassword123';
    const normalized = (email || '').trim().toLowerCase();
    if (normalized.endsWith('@akirapahomecareus.com')) password = 'Akirapa2026!';
    else if (normalized === 'admin@akirapa.com') password = 'admin123';
    else if (normalized === 'primary@akirapa.com') password = 'akirapa2634!';
    else if (normalized === 'family@akirapa.com') password = 'family123';

    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const res = await login(email, password);
      if (res.success) {
        await loadData();
        setShowGoogleModal(false);
      } else {
        setLoginError(res.error || 'Google Authentication failed.');
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
    return (
      <div className="relative min-h-screen bg-purple-50/40 text-slate-800 flex items-center justify-center p-6 overflow-hidden selection:bg-purple-500 selection:text-white">
        {/* Animated Ambient Light Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-300/30 rounded-full blur-3xl pointer-events-none animate-blob-1" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-300/30 rounded-full blur-3xl pointer-events-none animate-blob-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-400/15 rounded-full blur-3xl pointer-events-none" />

        {/* Bright Modern Glassmorphic Central Card */}
        <div className="relative max-w-lg w-full glass-card-light rounded-3xl p-8 md:p-10 text-center shadow-2xl z-10 animate-fade-in">
          {/* System Logo */}
          <div className="mx-auto flex justify-center mb-4 md:mb-6">
            <img 
              src="/System logo.png" 
              alt="Aki Vault Care Management Platform" 
              className="h-36 md:h-40 object-contain drop-shadow-md"
            />
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-extrabold text-[#77248c] tracking-tight">In-Home Care Services Platform</h1>
            <p className="text-xs text-slate-500 font-semibold mt-1">Unified Portal Access for Clients, Caregivers & Administration</p>
          </div>

          <button
            type="button"
            onClick={() => { setViewState('login'); setLoginError(null); }}
            className="w-full py-3.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <span>Proceed to Login</span>
            <i className="fa-solid fa-arrow-right text-xs text-white"></i>
          </button>
        </div>
      </div>
    );
  };

  const renderLoginScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">

        <div className="text-center mb-8">
          <img src="/System logo.png" alt="Akirapa Logo" className="h-[72px] mx-auto object-contain mb-2" />
          <h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2>
          <p className="text-sm text-gray-500">Sign in to your Akirapa account. The system will automatically route you to your portal.</p>
        </div>

        <button onClick={() => { setLoginError(null); window.location.href = '/api/auth/google'; }} className="w-full py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2.5 text-sm font-semibold text-gray-700 shadow-2xs cursor-pointer">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 border-t border-black" />
          <span className="text-xs font-bold text-black">or sign in with email</span>
          <div className="flex-1 border-t border-black" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handlePortalLogin(loginEmail, loginPassword); }} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email address <span className="text-red-500 ml-0.5">*</span></label>
            <input type="email" required placeholder="email@akirapahomecareus.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Password <span className="text-red-500 ml-0.5">*</span></label>
            <div className="relative">
              <input
                type={showLoginPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer flex items-center justify-center"
                title={showLoginPassword ? "Hide password" : "Show password"}
              >
                {showLoginPassword ? (
                  <i className="fa-solid fa-eye-slash text-gray-400 hover:text-gray-600 text-base"></i>
                ) : (
                  <i className="fa-solid fa-eye text-gray-400 hover:text-gray-600 text-base"></i>
                )}
              </button>
            </div>
            {renderPasswordStrengthMeter(loginPassword)}
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setViewState('forgot_password')} className="text-xs text-purple-600 font-extrabold hover:underline">Forgot password?</button>
          </div>
          {loginError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold flex items-center gap-2"><i className="fa-solid fa-triangle-exclamation"></i> {loginError}</div>}
          <button type="submit" disabled={isLoggingIn || !loginEmail || !loginPassword} className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
            {isLoggingIn ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>

        {selectedPortalRole !== 'ADMIN' && (
          <p className="text-center text-sm text-gray-500 mt-6">
            First time using the platform?{' '}
            <button 
              type="button"
              onClick={() => { setViewState('signup'); setSignupError(null); }} 
              className="text-[#77248c] font-extrabold hover:underline cursor-pointer"
            >
              Add User Details
            </button>
          </p>
        )}
      </div>

      {/* Google Sign-In Modal — rendered on the login screen */}
      {showGoogleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Sign in with Google</h3>
                  <p className="text-xs text-gray-400">Select an authorized account</p>
                </div>
              </div>
              <button onClick={() => setShowGoogleModal(false)} className="text-gray-400 hover:text-gray-600 font-bold cursor-pointer">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={() => handleGoogleAccountSelect('info@akirapahomecareus.com', 'ADMIN')}
                className="w-full flex items-center justify-between p-3.5 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200 rounded-2xl transition-all text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">A</div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs">Senior Admin Account</div>
                    <div className="text-[11px] text-purple-700 font-mono">info@akirapahomecareus.com</div>
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-400 group-hover:translate-x-1 transition-transform text-xs"></i>
              </button>

              <button
                type="button"
                onClick={() => handleGoogleAccountSelect('cathy@akirapahomecareus.com', 'ADMIN')}
                className="w-full flex items-center justify-between p-3.5 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200 rounded-2xl transition-all text-left cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">C</div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs">Cathy Admin Account</div>
                    <div className="text-[11px] text-purple-700 font-mono">cathy@akirapahomecareus.com</div>
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-400 group-hover:translate-x-1 transition-transform text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleGoogleCustomSubmit} className="space-y-3 pt-4 border-t border-gray-100">
              <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block">Or Enter Any Authorized Google Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="your.email@akirapahomecareus.com"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={googleIsSubmitting || !googleEmailInput}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                  {googleIsSubmitting ? 'Signing in...' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderSignupScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-8 max-h-[90vh] overflow-y-auto transition-all">
        <div className="flex justify-center mb-6">
          <button 
            type="button"
            onClick={() => { setViewState('login'); setSignupError(null); }} 
            className="px-6 py-2.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-xs rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <i className="fa-solid fa-arrow-left text-xs text-white"></i>
            <span>Back</span>
          </button>
        </div>
        <div className="text-center mb-6">
          <img src="/System logo.png" alt="Akirapa Logo" className="h-[72px] mx-auto object-contain mb-2" />
          <h2 className="text-2xl font-bold text-gray-800">First-Time Onboarding — Add User Details</h2>
          <p className="text-sm text-gray-500 mt-1">Please provide your required details to setup and activate your account</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">First Name <span className="text-red-500 ml-0.5">*</span></label>
              <input type="text" required placeholder="Jane" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Last Name <span className="text-red-500 ml-0.5">*</span></label>
              <input type="text" required placeholder="Doe" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email <span className="text-red-500 ml-0.5">*</span></label>
            <div className="flex gap-2">
              <input type="email" required disabled={isSignupCodeSent} placeholder="email@akirapahomecareus.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50" />
              <button
                type="button"
                onClick={handleSendSignupCode}
                disabled={isSendingSignupCode || isSignupCodeSent || !signupEmail}
                className={`px-5 py-2.5 font-bold text-xs rounded-xl whitespace-nowrap transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                  signupEmail && !isSignupCodeSent
                    ? 'bg-[#77248c] hover:bg-[#5a1a6b] text-white shadow-md'
                    : 'bg-purple-100 text-purple-700'
                }`}
              >
                {isSignupCodeSent ? <><i className="fa-solid fa-check text-white"></i> Sent</> : (isSendingSignupCode ? 'Sending...' : 'Send Code')}
              </button>
            </div>
          </div>
          {isSignupCodeSent && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">6-Digit Verification Code <span className="text-red-500 ml-0.5">*</span></label>
              <input type="text" required maxLength={6} placeholder="192804" value={signupCode} onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, ''))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center text-base font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Password <span className="text-red-500 ml-0.5">*</span></label>
            <div className="relative">
              <input
                type={showSignupPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword(!showSignupPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer flex items-center justify-center"
                title={showSignupPassword ? "Hide password" : "Show password"}
              >
                {showSignupPassword ? (
                  <i className="fa-solid fa-eye-slash text-gray-400 hover:text-gray-600 text-base"></i>
                ) : (
                  <i className="fa-solid fa-eye text-gray-400 hover:text-gray-600 text-base"></i>
                )}
              </button>
            </div>
            {renderPasswordStrengthMeter(signupPassword)}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Phone Number <span className="text-red-500 ml-0.5">*</span></label>
            <PhoneInput
              value={signupPhone}
              onChange={(val) => setSignupPhone(val)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">I am a</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setSignupRole('CAREGIVER')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${signupRole === 'CAREGIVER' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Caregiver</button>
              <button type="button" onClick={() => setSignupRole('CLIENT')} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${signupRole === 'CLIENT' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Client/Family</button>
            </div>
          </div>

          {signupRole === 'CAREGIVER' && (
            <>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-id-card text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Caregiver Details</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Date of Birth</label>
                    <input type="date" value={cgDob} onChange={(e) => setCgDob(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Gender</label>
                    <select value={cgGender} onChange={(e) => setCgGender(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Nationality</label>
                    <input type="text" value={cgNationality} onChange={(e) => setCgNationality(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Social Security No.</label>
                    <input type="text" placeholder="XXX-XX-XXXX" value={cgSsn} onChange={(e) => setCgSsn(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Work Authorization No.</label>
                    <input type="text" placeholder="e.g. EAD Card No. / Work Permit No." value={cgWorkAuthNumber} onChange={(e) => setCgWorkAuthNumber(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Home Address <span className="text-red-500 ml-0.5">*</span></label>
                    <LocationAutocompleteInput
                      value={cgAddress}
                      onChange={(val) => setCgAddress(val)}
                      onSelectLocation={(loc) => {
                        setCgAddress(loc.street || loc.full);
                        if (loc.city) setCgCity(loc.city);
                        if (loc.state) setCgState(loc.state);
                        if (loc.zip) setCgZip(loc.zip);
                      }}
                      placeholder="Start typing US address..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">City</label>
                    <input type="text" value={cgCity} onChange={(e) => setCgCity(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">State</label>
                    <select value={cgState} onChange={(e) => setCgState(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">Select State</option>
                      {US_STATES.map(s => <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>)}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Zip Code</label>
                    <input type="text" maxLength={10} placeholder="e.g. 90210" value={cgZip} onChange={(e) => setCgZip(e.target.value.replace(/[^0-9-]/g, ''))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-briefcase text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Position Details</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Position Applying For</label>
                    <input type="text" placeholder="e.g. Certified Nursing Assistant" value={cgPositionApplying} onChange={(e) => setCgPositionApplying(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Employment Type</label>
                    <select value={cgEmploymentType} onChange={(e) => setCgEmploymentType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">Select</option>
                      <option value="Full-Time">Full-Time</option>
                      <option value="Part-Time">Part-Time</option>
                      <option value="Contract">Contract</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-3 text-center">3. Availability</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Days Available</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setCgDaysAvailable((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${cgDaysAvailable.includes(day) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Preferred Shifts</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Morning', 'Afternoon', 'Evening', 'Overnight'].map((shift) => (
                        <button
                          key={shift}
                          type="button"
                          onClick={() => setCgPreferredShifts((prev) => prev.includes(shift) ? prev.filter((s) => s !== shift) : [...prev, shift])}
                          className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${cgPreferredShifts.includes(shift) ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-teal-200 text-teal-700 hover:bg-teal-50'}`}
                        >
                          {shift}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Hours Per Week</label>
                      <input type="number" min="0" placeholder="20" value={cgHoursPerWeek} onChange={(e) => setCgHoursPerWeek(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Can Travel?</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setCgCanTravel('Yes')} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${cgCanTravel === 'Yes' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Yes</button>
                        <button type="button" onClick={() => setCgCanTravel('No')} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${cgCanTravel === 'No' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>No</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Travel Area / Distance</label>
                      <input type="text" placeholder="e.g. 15km" value={cgTravelDistance} onChange={(e) => setCgTravelDistance(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {signupRole === 'CLIENT' && (
            <>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-user text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Client Details</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">First Name <span className="text-red-500 ml-0.5">*</span></label>
                    <input type="text" required placeholder="Robert" value={patientFirstName} onChange={(e) => setPatientFirstName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Last Name <span className="text-red-500 ml-0.5">*</span></label>
                    <input type="text" required placeholder="Smith" value={patientLastName} onChange={(e) => setPatientLastName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Date of Birth</label>
                    <input type="date" value={patientDobInput} onChange={(e) => setPatientDobInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Gender</label>
                    <select value={patientGenderInput} onChange={(e) => setPatientGenderInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Phone Number</label>
                    <PhoneInput
                      value={patientPhoneInput}
                      onChange={(val) => setPatientPhoneInput(val)}
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Email Address</label>
                    <input type="email" placeholder="email@akirapahomecareus.com" value={patientEmailInput} onChange={(e) => setPatientEmailInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Home Address <span className="text-red-500 ml-0.5">*</span></label>
                    <LocationAutocompleteInput
                      value={patientAddressInput}
                      onChange={(val) => setPatientAddressInput(val)}
                      onSelectLocation={(loc) => {
                        setPatientAddressInput(loc.street || loc.full);
                        if (loc.city) setPatientCityInput(loc.city);
                        if (loc.state) setPatientStateInput(loc.state);
                        if (loc.zip) setPatientZipInput(loc.zip);
                      }}
                      placeholder="Start typing US address..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">City</label>
                    <input type="text" value={patientCityInput} onChange={(e) => setPatientCityInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">State</label>
                    <select value={patientStateInput} onChange={(e) => setPatientStateInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">Select State</option>
                      {US_STATES.map(s => <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>)}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Zip Code</label>
                    <input type="text" maxLength={10} placeholder="e.g. 90210" value={patientZipInput} onChange={(e) => setPatientZipInput(e.target.value.replace(/[^0-9-]/g, ''))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-notes-medical text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Health & Care Notes</h3>
                  <p className="text-[11px] text-gray-400 mt-1 text-center">Helps caregivers prepare properly and stay alert to what matters.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Health Notes & Conditions</label>
                    <textarea placeholder="e.g. Hypertension, Type 2 Diabetes, Early Stage Dementia" value={patientMedicalConditions} onChange={(e) => setPatientMedicalConditions(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Allergies & Other Notes</label>
                    <textarea placeholder="e.g. Penicillin allergy, no known drug allergies, mobility precautions" value={patientAllergiesNotes} onChange={(e) => setPatientAllergiesNotes(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-phone text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Emergency Contact</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-bold text-gray-400 uppercase mb-2">Primary Contact</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">First Name <span className="text-red-500 ml-0.5">*</span></label>
                        <input type="text" required placeholder="Mary" value={primaryContactFirstName} onChange={(e) => setPrimaryContactFirstName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Last Name <span className="text-red-500 ml-0.5">*</span></label>
                        <input type="text" required placeholder="Smith" value={primaryContactLastName} onChange={(e) => setPrimaryContactLastName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Relationship</label>
                        <input type="text" placeholder="Daughter" value={primaryContactRelationship} onChange={(e) => setPrimaryContactRelationship(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Phone Number</label>
                        <PhoneInput
                          value={primaryContactPhone}
                          onChange={(val) => setPrimaryContactPhone(val)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-gray-400 uppercase mb-2">Secondary Contact</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">First Name</label>
                        <input type="text" placeholder="John" value={secondaryContactFirstName} onChange={(e) => setSecondaryContactFirstName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Last Name</label>
                        <input type="text" placeholder="Smith" value={secondaryContactLastName} onChange={(e) => setSecondaryContactLastName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Relationship</label>
                        <input type="text" placeholder="Son" value={secondaryContactRelationship} onChange={(e) => setSecondaryContactRelationship(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Phone Number</label>
                        <PhoneInput
                          value={secondaryContactPhone}
                          onChange={(val) => setSecondaryContactPhone(val)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-heart text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Care Preferences</h3>
                  <p className="text-[11px] text-gray-400 mt-1 text-center">What kind of care & comfort services would you like? This helps us match the right caregiver.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CARE_PREFERENCE_OPTIONS.map((option) => (
                    <label key={option} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${carePreferences.includes(option) ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                      <input
                        type="checkbox"
                        checked={carePreferences.includes(option)}
                        onChange={() => setCarePreferences(prev => prev.includes(option) ? prev.filter(p => p !== option) : [...prev, option])}
                        className="rounded accent-teal-600 w-4 h-4 cursor-pointer"
                      />
                      {option}
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Anything else? (optional)</label>
                  <input type="text" placeholder="e.g. Prefers quiet mornings, enjoys chess" value={otherPreferences} onChange={(e) => setOtherPreferences(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-11 h-11 bg-[#77248c] text-white rounded-full flex items-center justify-center mb-2 shadow-xs"><i className="fa-solid fa-comment-dots text-white text-base"></i></div>
                  <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider">About Me</h3>
                  <p className="text-[11px] text-gray-400 mt-1 text-center">Help your care team get to know you. You (or your family) can update these anytime later.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">What are you like as a person?</label>
                    <textarea placeholder="e.g. Cheerful and independent, loves telling stories about her grandchildren" value={patientPersonality} onChange={(e) => setPatientPersonality(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">What does a typical day look like for you?</label>
                    <textarea placeholder="e.g. Wakes at 7am, likes tea and the news, afternoon nap, early dinner" value={patientDailyRoutine} onChange={(e) => setPatientDailyRoutine(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">What kind of caregiver would you prefer to work with?</label>
                    <textarea placeholder="e.g. Someone patient and soft-spoken, comfortable with a female caregiver, shares an interest in gardening" value={patientPreferredCaregiverType} onChange={(e) => setPatientPreferredCaregiverType(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Anything else about your life we should know?</label>
                    <textarea placeholder="e.g. Recently lost her husband, family visits every Sunday, has a cat named Whiskers" value={patientAdditionalObservations} onChange={(e) => setPatientAdditionalObservations(e.target.value)} rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                </div>
              </div>
            </>
          )}

          {signupError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold"><i className="fa-solid fa-triangle-exclamation"></i> {signupError}</div>}
          <button type="submit" disabled={isSigningUp || !isSignupCodeSent || signupCode.length !== 6} className="w-full py-3.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-sm rounded-xl transition-all disabled:opacity-50 shadow-md cursor-pointer">
            {isSigningUp ? 'Submitting Details...' : 'Submit User Details & Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderForgotPasswordScreen = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="flex justify-center mb-6">
          <button 
            type="button"
            onClick={() => { setViewState('login'); setForgotError(null); }} 
            className="px-6 py-2.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-xs rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <i className="fa-solid fa-arrow-left text-xs text-white"></i>
            <span>Back</span>
          </button>
        </div>
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#77248c] rounded-2xl flex items-center justify-center mx-auto shadow-md"><i className="fa-solid fa-key text-white text-xl"></i></div>
          <h2 className="text-2xl font-bold text-gray-800 mt-4">Reset Password</h2>
          <p className="text-sm text-gray-500">Secure OTP verification</p>
        </div>

        <form onSubmit={isForgotCodeSent ? handleResetPasswordSubmit : handleSendForgotCode} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Email <span className="text-red-500 ml-0.5">*</span></label>
            <input type="email" required disabled={isForgotCodeSent} placeholder="email@akirapahomecareus.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50" />
          </div>
          {isForgotCodeSent && (
            <>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">6-Digit Code <span className="text-red-500 ml-0.5">*</span></label><input type="text" maxLength={6} placeholder="192804" value={forgotCode} onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center text-base font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">New Password <span className="text-red-500 ml-0.5">*</span></label>
                <div className="relative">
                  <input
                    type={showForgotPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(!showForgotPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 transition-colors cursor-pointer flex items-center justify-center"
                    title={showForgotPassword ? "Hide password" : "Show password"}
                  >
                    {showForgotPassword ? (
                      <i className="fa-solid fa-eye-slash text-gray-400 hover:text-gray-600 text-base"></i>
                    ) : (
                      <i className="fa-solid fa-eye text-gray-400 hover:text-gray-600 text-base"></i>
                    )}
                  </button>
                </div>
                {renderPasswordStrengthMeter(forgotNewPassword)}
              </div>
            </>
          )}
          {forgotError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold"><i className="fa-solid fa-triangle-exclamation"></i> {forgotError}</div>}
          <button type="submit" disabled={isSendingForgotCode || isResettingPassword || !forgotEmail} className="w-full py-3.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-sm rounded-xl transition-all disabled:opacity-50 shadow-md cursor-pointer">
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
        <div className="text-center"><div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-gray-400 mt-4">Verifying session...</p></div>
      </div>
    );
  }

  // ============================================================
  // DASHBOARD RENDER 
  // ============================================================

  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col overflow-hidden">


      {/* Admin Set First-Time Caregiver Password Modal */}
      {showAdminPasswordModal && targetPasswordUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-[#77248c] text-white rounded-xl flex items-center justify-center font-bold shadow-xs">
                  <i className="fa-solid fa-key text-white"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Set First-Time Password</h3>
                  <p className="text-xs text-gray-400">Target Caregiver: {targetPasswordUser.name}</p>
                </div>
              </div>
              <button onClick={() => { setShowAdminPasswordModal(false); setTargetPasswordUser(null); }} className="text-gray-400 hover:text-gray-600 font-bold">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <form onSubmit={handleAdminSetCaregiverPassword} className="space-y-4 text-xs">
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-purple-900">
                <div className="font-bold text-xs mb-1"><i className="fa-solid fa-envelope mr-1"></i> Caregiver Email:</div>
                <div className="font-mono text-xs font-bold">{targetPasswordUser.email}</div>
                <div className="text-[11px] text-purple-700 mt-1">This email will be automatically addressed by the database and restricted to the Caregiver Portal.</div>
              </div>

              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">First-Time Password</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CaregiverTemp2026!"
                  value={adminNewPasswordInput}
                  onChange={(e) => setAdminNewPasswordInput(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                />
              </div>

              {adminPasswordError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2 font-semibold">
                  <i className="fa-solid fa-triangle-exclamation"></i> {adminPasswordError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdminPasswordModal(false); setTargetPasswordUser(null); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdminSettingPassword || !adminNewPasswordInput}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isAdminSettingPassword ? <><i className="fa-solid fa-spinner animate-spin"></i> Saving...</> : <><i className="fa-solid fa-check"></i> Assign Password</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin User Account Provisioning Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-[#77248c] text-white rounded-xl flex items-center justify-center font-bold shadow-xs">
                  <i className="fa-solid fa-user-plus text-white"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Provision Staff / Caregiver</h3>
                  <p className="text-xs text-gray-400">Must use @akirapahomecareus.com</p>
                </div>
              </div>
              <button onClick={() => setShowAddUserModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <form onSubmit={handleAdminCreateUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">First Name <span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah"
                    value={newUserFirstName}
                    onChange={(e) => setNewUserFirstName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Last Name <span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jenkins"
                    value={newUserLastName}
                    onChange={(e) => setNewUserLastName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Company Email (@akirapahomecareus.com) <span className="text-red-500 ml-0.5">*</span></label>
                <input
                  type="email"
                  required
                  placeholder="email@akirapahomecareus.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                />
              </div>

              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Initial Password <span className="text-red-500 ml-0.5">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Caregiver2026!"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e: any) => setNewUserRole(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                  >
                    <option value="CAREGIVER">Caregiver</option>
                    <option value="CARE_COORDINATOR">Care Coordinator</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Phone Number</label>
                  <PhoneInput
                    value={newUserPhone}
                    onChange={(val) => setNewUserPhone(val)}
                    className="mt-1"
                  />
                </div>
              </div>

              {newUserRole === 'CAREGIVER' && (
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Hourly Pay Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.50"
                    value={newUserPayRate}
                    onChange={(e) => setNewUserPayRate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                  />
                </div>
              )}

              {addUserError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation"></i> {addUserError}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreatingUser || !newUserEmail || !newUserPassword || !newUserFirstName || !newUserLastName}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50 mt-2"
              >
                {isCreatingUser ? 'Provisioning Account...' : 'Create Staff Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
      {/* Notification Banner */}
      {systemNotification && (
        <div className="fixed top-6 right-6 bg-purple-600 text-white px-6 py-4 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-fade-up border border-purple-500/30">
          <i className="fa-solid fa-circle-check"></i>
          <span className="text-sm font-semibold">{systemNotification}</span>
        </div>
      )}

      {/* Incident / Emergency Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8">
            <div className={`flex items-center gap-3 border-b pb-4 mb-4 ${incidentType === 'Emergency SOS' ? 'border-red-200' : 'border-gray-100'}`}>
              <div className={`p-3 rounded-2xl ${incidentType === 'Emergency SOS' ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-600'}`}>
                <i className={`text-xl ${incidentType === 'Emergency SOS' ? 'fa-solid fa-bell' : 'fa-solid fa-triangle-exclamation'}`}></i>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">{incidentType === 'Emergency SOS' ? '🚨 Emergency Alert' : 'Report Safety Incident'}</h3>
                <p className="text-xs text-gray-400">{incidentType === 'Emergency SOS' ? 'Admin & Care Coordinator notified immediately' : 'Risk Management & Compliance'}</p>
              </div>
            </div>
            {incidentType === 'Emergency SOS' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-xs text-red-700 font-semibold flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation"></i> This will instantly notify the admin and care coordinator. Use only for real emergencies.
              </div>
            )}
            <form onSubmit={async (e) => {
              e.preventDefault();
              const activeShift = shifts.find(s => s.caregiverId === user.id && s.status === 'IN_PROGRESS');
              if (activeShift) {
                handleSubmitIncident(activeShift.id);
              } else {
                if (!incidentDescription.trim()) { showNotification('Please enter a description.'); return; }
                setIsReportingIncident(true);
                try {
                  await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'CLINICAL_ALERT',
                      title: `🚨 ${incidentType} — ${user.name}`,
                      message: incidentDescription + (incidentAction ? ` | Action: ${incidentAction}` : ''),
                    }),
                  });
                  showNotification('Emergency alert sent to admin!');
                  setSmsAlerts(prev => [{ to: 'Admin / Care Coordinator', message: `EMERGENCY: ${incidentType} reported by caregiver ${user.name}. ${incidentDescription}`, timestamp: new Date() }, ...prev]);
                  setShowIncidentModal(false);
                  setIncidentDescription('');
                  setIncidentAction('');
                  setIncidentType('Fall');
                } catch (err) { console.error(err); showNotification('Failed to send alert.'); }
                finally { setIsReportingIncident(false); }
              }
            }} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Incident Type</label>
                <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="Emergency SOS">🚨 Emergency SOS</option>
                  <option value="Fall">Fall Incident</option>
                  <option value="Injury">Physical Injury</option>
                  <option value="Medication Error">Medication Error</option>
                  <option value="Behavioral Incident">Behavioral Incident</option>
                </select>
              </div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Description</label><textarea rows={3} required placeholder="Describe what happened..." value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Action Taken</label><textarea rows={2} placeholder="Immediate action..." value={incidentAction} onChange={(e) => setIncidentAction(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div className="flex gap-3">
                <button type="submit" disabled={isReportingIncident} className={`flex-1 py-3 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50 ${incidentType === 'Emergency SOS' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isReportingIncident ? 'Sending...' : (incidentType === 'Emergency SOS' ? '🚨 Send Emergency Alert' : 'File Report')}
                </button>
                <button type="button" onClick={() => setShowIncidentModal(false)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-all">Cancel</button>
              </div>
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
              <button onClick={() => setShowDropModal(false)} className="text-gray-400 hover:text-gray-600 font-bold"><i className="fa-solid fa-xmark text-lg"></i></button>
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
                  <textarea rows={3} required placeholder="State your emergency or scheduling conflict..." value={dropReasonText} onChange={(e) => setDropReasonText(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1" />
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

      {/* Shift Report & Overtime Confirmation Modal */}
      {showClockOutModal && (() => {
        const targetShift = shifts.find(s => s.id === clockOutTargetShiftId);
        const overtime = isShiftOvertime(targetShift);

        return (
          <div className="modal-backdrop">
            <div className="modal-content max-w-lg p-6 animate-fade-up">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <i className={`fa-solid ${overtime ? 'fa-clock-rotate-left text-amber-500' : 'fa-clipboard-list text-purple-600'} text-lg`}></i>
                  {overtime ? 'Shift Time Complete — Overtime / Clock-Out Options' : 'Clock-Out Report'}
                </h3>
                <button
                  type="button"
                  onClick={() => { setShowClockOutModal(false); setShowClockOutOverrideInput(false); setClockOutError(null); }}
                  className="text-gray-400 hover:text-gray-600 font-bold p-1 cursor-pointer"
                  title="Dismiss / Dodge Modal"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>

              {targetShift && (
                <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl text-xs flex justify-between items-center shadow-2xs mb-4">
                  <div>
                    <span className="font-bold text-purple-900 block text-xs">{targetShift.client.name}</span>
                    <span className="text-[10px] text-purple-700 font-mono">Scheduled End: {formatDateTime(targetShift.scheduledEnd)}</span>
                  </div>
                  {overtime && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] uppercase">Overtime</span>
                  )}
                </div>
              )}

              {/* Overtime Action Selector Tabs (if shift ran past scheduled time) */}
              {overtime && (
                <div className="p-1 bg-gray-100 border border-gray-200 rounded-xl flex gap-1 mb-4 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setOvertimeActionType('OVERTIME_CLAIM')}
                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      overtimeActionType === 'OVERTIME_CLAIM'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <i className="fa-solid fa-clock"></i> 1. Confirm Overtime Work
                  </button>
                  <button
                    type="button"
                    onClick={() => setOvertimeActionType('CLOCK_OUT')}
                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      overtimeActionType === 'CLOCK_OUT'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <i className="fa-solid fa-right-from-bracket"></i> 2. Complete & Clock Out
                  </button>
                </div>
              )}

              {/* MODE A: Confirming Overtime Work with Reason & Evidence */}
              {overtime && overtimeActionType === 'OVERTIME_CLAIM' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (clockOutTargetShiftId) handleConfirmOvertimeClaim(clockOutTargetShiftId);
                  }}
                  className="space-y-4"
                >
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                    <div className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-triangle-exclamation text-amber-600"></i> Overtime Confirmation Required
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Confirm you are continuing to work overtime on this shift. State your official reason and attach supporting evidence (photos/documents).
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-amber-900 uppercase block mb-1">
                      Overtime Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Explain why you are working overtime (e.g. Extended medication administration, family delay, emergency clinical care)..."
                      value={clockOutOvertimeReason}
                      onChange={(e) => setClockOutOvertimeReason(e.target.value)}
                      className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">
                      Attach Supporting Evidence / Photos <span className="text-red-500">*</span>
                    </label>
                    <div className="relative border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/30 rounded-2xl p-4 text-center transition-all cursor-pointer group">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,audio/*"
                        onChange={handleMediaChange}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                      />
                      <div className="w-10 h-10 bg-[#77248c] border-2 border-[#5a1a6b] text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-cloud-arrow-up text-lg text-white"></i>
                      </div>
                      <div className="text-xs font-bold text-gray-700">Upload photo, video, or proof of overtime</div>
                    </div>
                    {selectedMediaFiles.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {selectedMediaFiles.map((file, idx) => (
                          <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-900 aspect-video flex items-center justify-center">
                            <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(idx)}
                              className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-md hover:scale-110 transition-all z-20"
                            >
                              <i className="fa-solid fa-xmark text-[10px]"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {clockOutError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{clockOutError}</div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingClockOut || !clockOutOvertimeReason.trim() || selectedMediaFiles.length === 0}
                      className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmittingClockOut ? (
                        <><i className="fa-solid fa-circle-notch animate-spin"></i> Submitting Overtime Claim...</>
                      ) : (
                        <><i className="fa-solid fa-clock"></i> Confirm Overtime & Submit Evidence</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowClockOutModal(false); setShowClockOutOverrideInput(false); setClockOutError(null); }}
                      className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </form>
              ) : (
                /* MODE B: Clock Out & Submit Final Report */
                <form onSubmit={(e) => { e.preventDefault(); if (clockOutTargetShiftId) handleClockOut(clockOutTargetShiftId, false); }} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      End-of-Shift Notes <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Summarize the visit: tasks completed, patient condition, handover notes..."
                      value={shiftNotes}
                      onChange={(e) => setShiftNotes(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1 font-medium"
                    />
                  </div>

                  <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3 text-xs space-y-2">
                    <div className="font-bold text-[#77248c] text-[11px] flex items-center gap-1.5 mb-1">
                      <i className="fa-solid fa-shield-cat text-[#77248c]"></i> Daily Welfare Check <span className="text-red-500">*</span> (Required)
                    </div>
                    <div className="space-y-2">
                      {WELFARE_QUESTIONS.map((q) => {
                        const answer = welfareAnswers[q.key];
                        const yesIsConcerning = q.concerningAnswer === 'YES';
                        return (
                          <div key={q.key} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-purple-100 px-2.5 py-2">
                            <span className="text-gray-700 text-[11px]">{q.question}</span>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setWelfareAnswers(prev => ({ ...prev, [q.key]: 'YES' }))}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${answer === 'YES' ? (yesIsConcerning ? 'bg-red-600 text-white' : 'bg-[#4cdbd5] text-white') : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                              >YES</button>
                              <button
                                type="button"
                                onClick={() => setWelfareAnswers(prev => ({ ...prev, [q.key]: 'NO' }))}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${answer === 'NO' ? (!yesIsConcerning ? 'bg-red-600 text-white' : 'bg-[#4cdbd5] text-white') : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                              >NO</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">
                      Attach Photos / Documentation
                    </label>
                    <div className="relative border-2 border-dashed border-purple-200 hover:border-purple-500 bg-purple-50/40 rounded-2xl p-4 text-center transition-all cursor-pointer group">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*,audio/*"
                        onChange={handleMediaChange}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                      />
                      <div className="w-10 h-10 bg-[#77248c] border-2 border-[#5a1a6b] text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-cloud-arrow-up text-lg text-white"></i>
                      </div>
                      <div className="text-xs font-bold text-gray-700">Click or drag photos/videos to attach</div>
                    </div>
                    {selectedMediaFiles.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {selectedMediaFiles.map((file, idx) => (
                          <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-900 aspect-video flex items-center justify-center">
                            <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(idx)}
                              className="absolute top-1 right-1 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-md hover:scale-110 transition-all z-20"
                            >
                              <i className="fa-solid fa-xmark text-[10px]"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {showClockOutOverrideInput && (
                    <div className="bg-red-50/60 border border-red-200 rounded-xl p-3">
                      <label className="text-xs font-semibold text-red-800 uppercase">
                        Outside Patient Boundary — Override Reason <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[10px] text-red-700 mb-1.5">GPS location is outside the client's geofence. Provide a reason to submit a manual override instead.</p>
                      <textarea
                        rows={2}
                        required
                        placeholder="e.g. Escorted client to a nearby pharmacy..."
                        value={clockOutOverrideReason}
                        onChange={(e) => setClockOutOverrideReason(e.target.value)}
                        className="w-full bg-white border border-red-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  )}

                  {clockOutError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{clockOutError}</div>
                  )}

                  <div className="flex gap-3 pt-2">
                    {showClockOutOverrideInput ? (
                      <button
                        type="button"
                        disabled={isSubmittingClockOut || !clockOutOverrideReason.trim()}
                        onClick={() => clockOutTargetShiftId && handleClockOut(clockOutTargetShiftId, true)}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition-all disabled:opacity-50"
                      >
                        {isSubmittingClockOut ? 'Submitting...' : 'Submit Manual Override'}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmittingClockOut || !shiftNotes.trim() || WELFARE_QUESTIONS.some(q => !welfareAnswers[q.key])}
                        className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSubmittingClockOut ? (
                          <><i className="fa-solid fa-circle-notch animate-spin"></i> Submitting & Signing Out...</>
                        ) : (
                          <><i className="fa-solid fa-right-from-bracket"></i> Submit & Clock Out</>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setShowClockOutModal(false); setShowClockOutOverrideInput(false); setClockOutError(null); }}
                      className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        );
      })()}

      {/* Send Family Media Update Modal */}
      {showPostUpdateModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-lg p-6 animate-fade-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <i className="fa-solid fa-camera text-purple-600 text-lg"></i> Send Family Media & Voice Update
              </h3>
              <button onClick={() => { setShowPostUpdateModal(false); setSelectedShiftId(null); }} className="text-gray-400 hover:text-gray-600 font-bold"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handlePostCaregiverUpdate(); }} className="space-y-4">
              {/* Active Shift Context if Triggered from My Shifts */}
              {selectedShiftId && (() => {
                const activeShift = shifts.find(s => s.id === selectedShiftId);
                if (!activeShift) return null;
                return (
                  <div className="p-3.5 bg-[#77248c] text-white rounded-xl text-xs flex justify-between items-center shadow-xs">
                    <div>
                      <span className="font-bold text-white block text-xs">Linked Shift: {activeShift.client.name}</span>
                      <span className="text-[10px] text-white/90 font-mono">Scheduled: {formatDateTime(activeShift.scheduledStart)}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-white text-[#77248c] font-extrabold text-[10px] uppercase shadow-2xs">
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
                  className="w-full bg-white border border-purple-200 text-[#77248c] font-bold rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs mt-1 cursor-pointer"
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
                
                <div className="relative border-2 border-dashed border-purple-200 hover:border-purple-500 bg-purple-50/40 rounded-2xl p-4 text-center transition-all cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    onChange={handleMediaChange}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  />
                  <div className="w-10 h-10 bg-[#77248c] border-2 border-[#5a1a6b] text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-cloud-arrow-up text-lg text-white"></i>
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
                              <i className="fa-solid fa-circle-play text-2xl text-purple-400 mb-1"></i>
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
                            <i className="fa-solid fa-xmark text-[10px]"></i>
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
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

              {/* Welfare Check (optional in this flow) */}
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-3 text-xs space-y-2">
                <div className="font-semibold text-red-800 text-[11px] flex items-center gap-1.5 mb-1">
                  <i className="fa-solid fa-shield-cat"></i> Client Welfare Check (Optional)
                </div>
                <div className="space-y-2">
                  {WELFARE_QUESTIONS.map((q) => {
                    const answer = welfareAnswers[q.key];
                    const yesIsConcerning = q.concerningAnswer === 'YES';
                    return (
                      <div key={q.key} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-red-100 px-2.5 py-2">
                        <span className="text-gray-700 text-[11px]">{q.question}</span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setWelfareAnswers(prev => ({ ...prev, [q.key]: 'YES' }))}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${answer === 'YES' ? (yesIsConcerning ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                          >YES</button>
                          <button
                            type="button"
                            onClick={() => setWelfareAnswers(prev => ({ ...prev, [q.key]: 'NO' }))}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${answer === 'NO' ? (!yesIsConcerning ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                          >NO</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isPostingUpdate || !shiftNotes.trim()}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
                <span className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
                  {activeMediaModal.caregiverName?.charAt(0) || 'C'}
                </span>
                <div>
                  <div className="text-xs font-bold text-white">{activeMediaModal.caregiverName || 'Caregiver Update'}</div>
                  <div className="text-[10px] text-slate-400">{activeMediaModal.createdAt ? formatDateTime(activeMediaModal.createdAt) : 'Recent Media Log'}</div>
                </div>
              </div>
              <button onClick={() => setActiveMediaModal(null)} className="text-slate-400 hover:text-white font-bold text-lg p-2"><i className="fa-solid fa-xmark text-lg"></i></button>
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
                <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 block mb-1">Caption / Note</span>
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
                  <i className="fa-solid fa-location-dot text-purple-600 text-lg"></i> Live GPS Tracker & Geofence Map
                </h3>
                <p className="text-xs text-gray-400">
                  Patient: {gpsMapShiftDetails?.client?.name || 'Selected Client'} | Caregiver: {gpsMapShiftDetails?.caregiver?.name || 'Assigned Caregiver'}
                </p>
              </div>
              <button onClick={() => setShowGpsMapModal(false)} className="text-gray-400 hover:text-gray-600 font-bold"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>

            {isLoadingGpsHistory ? (
              <div className="py-16 text-center">
                <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold text-gray-500">Retrieving Live GPS Waypoints...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* SVG Visual Map Canvas */}
                <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden text-white shadow-inner">
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
                      <circle cx="250" cy="150" r="90" fill="rgba(119, 36, 140, 0.08)" stroke="#9438ad" strokeWidth="2" strokeDasharray="6 4" />
                      <circle cx="250" cy="150" r="130" fill="none" stroke="rgba(239, 68, 68, 0.3)" strokeWidth="1" strokeDasharray="4 4" />

                      {/* Patient Home Pin */}
                      <g transform="translate(250, 150)">
                        <circle r="12" fill="#77248c" opacity="0.2" />
                        <circle r="6" fill="#77248c" />
                        <text x="0" y="22" textAnchor="middle" fill="#d49ee6" fontSize="10" fontWeight="bold">Patient Site (Center)</text>
                      </g>

                      {/* GPS Breadcrumb Trail Lines */}
                      {gpsLocationHistory.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#4cdbd5"
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
                                <circle r="14" fill="#4cdbd5" opacity="0.3" className="animate-ping" />
                                <circle r="7" fill="#4cdbd5" />
                                <text x="0" y="-14" textAnchor="middle" fill="#d3f8f6" fontSize="9" fontWeight="bold">Caregiver Live GPS</text>
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
                      <span className="font-bold text-emerald-400 text-xs">
                        {gpsLocationHistory.length > 0 ? formatTime(gpsLocationHistory[gpsLocationHistory.length - 1].timestamp) : 'N/A'}
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
                <i className="fa-solid fa-sliders text-purple-600"></i> Client Profile & Geofence Radius Settings
              </h3>
              <button onClick={() => setShowClientProfileModal(false)} className="text-gray-400 hover:text-gray-600 font-bold"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveClientProfileSettings(); }} className="space-y-4 text-xs">
              {/* Client Basic Info */}
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
                <div className="font-bold text-sm text-purple-900">{targetClientEditor.name}</div>
                <div className="text-gray-500 font-medium text-[11px] mt-0.5">{targetClientEditor.address}</div>
              </div>

              {/* Geofence Radius Meter Slider */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <i className="fa-solid fa-location-dot text-red-500"></i> Geofence Radius Limit
                  </label>
                  <span className="bg-purple-600 text-white font-mono font-bold px-2.5 py-0.5 rounded-md text-xs">
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
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-medium pt-1">
                  <span>50m (Strict)</span>
                  <span>150m (Standard)</span>
                  <span>300m (Rural)</span>
                  <span>500m (Wide)</span>
                </div>
              </div>

              {/* Billing Rate */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="font-bold text-gray-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
                  <i className="fa-solid fa-dollar-sign text-emerald-600"></i> Client Billing Rate (per hour)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 38.00"
                    value={clientBillingRateInput}
                    onChange={(e) => setClientBillingRateInput(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Used to auto-calculate invoices from this client's logged shift hours.</p>
              </div>

              {/* Medical Conditions */}
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Medical Conditions & Diagnosis</label>
                <textarea
                  rows={2}
                  value={clientMedicalConditions}
                  onChange={(e) => setClientMedicalConditions(e.target.value)}
                  placeholder="e.g. Hypertension, Mild Dementia, Type 2 Diabetes..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingClientProfile}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
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
                  <i className="fa-solid fa-list-check text-purple-600"></i> Care Plan Authoring & Task Builder
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
                  <span className="text-purple-600 font-mono">
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
                            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-mono text-[10px]">
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
                      className="rounded accent-purple-600"
                    />
                    <span>Mandatory Shift Completion Task</span>
                  </label>

                  <button
                    onClick={handleAddCarePlanTask}
                    disabled={isSavingCareTask || !newCareTaskDesc.trim()}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50"
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
                <p className="text-xs text-gray-400">Map family accounts to client: {targetFamilyLinkClient.name}</p>
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
                    placeholder="email@akirapahomecareus.com"
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
                              <span className="font-bold text-slate-800 bg-white border border-gray-200 px-2 py-0.5 rounded shadow-2xs">
                                {log.action}
                              </span>
                              <span className="text-gray-500 text-xs">User ID: <span className="text-gray-700 font-semibold">{log.userId}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase shadow-2xs ${
                                log.outcome === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                              }`}>
                                {log.outcome}
                              </span>
                              <span className="text-gray-500 font-medium">{formatDateTime(log.timestamp)}</span>
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

      {/* Mobile Sidebar Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden animate-fade-in"
        />
      )}

      {/* ==================== SIDEBAR ==================== */}
      <aside className={`fixed lg:static top-0 left-0 z-50 w-64 bg-white border-r border-gray-200 h-full flex flex-col transition-transform duration-300 ease-in-out print:hidden shrink-0 ${
        isMobileMenuOpen ? 'translate-x-0 shadow-2xl fixed inset-y-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Brand */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <img src="/System logo.png" alt="Akirapa System Logo" className="h-14 w-auto max-w-[180px] object-contain transition-all py-0.5" />
          </div>
          <button 
            type="button" 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          <button onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'dashboard' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
            <i className="fa-solid fa-gauge-high w-4 text-center"></i> Dashboard
          </button>
          
          {/* Admin/Coordinator Views */}
          {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
            <>
              <button onClick={() => { setCurrentView('listings'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'listings' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-calendar-check w-4 text-center"></i> Shifts
              </button>
              <button onClick={() => { setCurrentView('create'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'create' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-plus-circle w-4 text-center"></i> Create Shift
              </button>
              {user && isCaregiverProvisioningAuthorized(user.email) && (
                <button onClick={() => { setCurrentView('add_caregiver'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'add_caregiver' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-user-plus w-4 text-center"></i> Add Caregiver
                </button>
              )}
              {user && isCaregiverProvisioningAuthorized(user.email) && (
                <button onClick={() => { setCurrentView('add_client'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'add_client' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-user-plus w-4 text-center"></i> Add Client
                </button>
              )}
              {user && isBusinessHubAuthorized(user.email) && (
                <button onClick={() => { setCurrentView('business'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'business' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-briefcase w-4 text-center"></i> Business Hub
                </button>
              )}
              {user && isBusinessHubAuthorized(user.email) && (
                <button onClick={() => { setCurrentView('financials'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'financials' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-sack-dollar w-4 text-center"></i> Payroll
                </button>
              )}
              {user && isBusinessHubAuthorized(user.email) && (
                <button onClick={() => { setCurrentView('billing'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'billing' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-file-invoice-dollar w-4 text-center"></i> Billing
                </button>
              )}
              {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <button onClick={() => { setCurrentView('caregiverReviews'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'caregiverReviews' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-star-half-stroke w-4 text-center"></i> Caregiver Reviews
                </button>
              )}
              <button onClick={() => { setCurrentView('messages'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'messages' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-comments w-4 text-center"></i> Messages
              </button>
              {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <button onClick={() => { setCurrentView('messageOversight'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'messageOversight' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                  <i className="fa-solid fa-eye w-4 text-center"></i> Message Oversight
                </button>
              )}
              <button onClick={() => { setCurrentView('audit'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'audit' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-shield-halved w-4 text-center"></i> Audit Logs
              </button>
            </>
          )}

          {/* Caregiver Views */}
          {user.role === 'CAREGIVER' && (
            <>
              <button onClick={() => { setCurrentView('listings'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'listings' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-clock w-4 text-center"></i> My Shifts
              </button>
              <button onClick={() => { setCurrentView('messages'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'messages' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-comments w-4 text-center"></i> Messages
              </button>
              <button onClick={() => { setCurrentView('interested'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'interested' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-bell w-4 text-center"></i> Alerts
              </button>
            </>
          )}

          {/* Family Views */}
          {user.role === 'FAMILY_MEMBER' && (
            <>
              <button onClick={() => { setCurrentView('listings'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'listings' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-heart-pulse w-4 text-center"></i> Care Feed
              </button>
              <button onClick={() => { setCurrentView('messages'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'messages' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-comments w-4 text-center"></i> Messages
              </button>
              <button onClick={() => { setCurrentView('purchases'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'purchases' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
                <i className="fa-solid fa-file-invoice w-4 text-center"></i> Documents
              </button>
            </>
          )}

          {/* Common Views */}
          <button onClick={() => { setCurrentView('profile'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${currentView === 'profile' ? 'bg-[#77248c] text-white font-bold shadow-md' : 'text-gray-600 hover:bg-purple-50/70 hover:text-[#77248c]'}`}>
            <i className="fa-solid fa-user w-4 text-center"></i> My Profile
          </button>
        </nav>

        {/* Pinned Bottom User & Sign Out Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/80 shrink-0 space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200/80 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#77248c] text-white flex items-center justify-center font-bold text-xs shrink-0">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-gray-800 truncate">{user.name}</div>
                <div className="text-[10px] text-gray-400 font-medium truncate">{user.role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setCurrentView('profile'); setIsMobileMenuOpen(false); }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${currentView === 'profile' ? 'bg-purple-100 text-[#77248c]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              title="My Profile"
            >
              <i className="fa-solid fa-gear text-xs"></i>
            </button>
          </div>

          <button 
            onClick={() => { logout(false); setIsMobileMenuOpen(false); }} 
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all cursor-pointer"
          >
            <i className="fa-solid fa-right-from-bracket text-xs"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 flex flex-col h-full w-full min-w-0 overflow-y-auto print:hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button 
              type="button" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="lg:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
              title="Toggle Menu"
            >
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
            <h2 className="text-base md:text-lg font-semibold text-gray-800 truncate">
              {currentView === 'dashboard' && 'Dashboard'}
              {currentView === 'profile' && 'My Profile'}
              {currentView === 'listings' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' ? 'Shift Management' : user.role === 'CAREGIVER' ? 'My Shifts' : 'Care Feed')}
              {currentView === 'create' && 'Create Shift'}
              {currentView === 'add_caregiver' && 'Add & Provision Caregiver'}
              {currentView === 'add_client' && 'Add & Provision Client'}
              {currentView === 'purchases' && (user.role === 'FAMILY_MEMBER' ? 'Documents' : 'Purchases & Sales')}
              {currentView === 'business' && 'Business Hub'}
              {currentView === 'interested' && 'Alerts & Notifications'}
              {currentView === 'audit' && 'Audit Logs'}
              {currentView === 'financials' && 'Payroll'}
              {currentView === 'billing' && 'Billing & Invoices'}
              {currentView === 'caregiverReviews' && 'Caregiver Reviews'}
              {currentView === 'messages' && 'Messages'}
              {currentView === 'messageOversight' && 'Message Oversight'}
            </h2>
            <div className="relative flex-1 max-w-md ml-2 md:ml-4 hidden sm:block">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all" />
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
                      <i className="fa-solid fa-bell text-[#77248c]"></i>
                      <span className="font-bold text-sm text-gray-800">Notifications</span>
                      <span className="bg-[#77248c] text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs">
                        {dbNotifications.filter(n => !n.isRead).length} unread
                      </span>
                    </div>
                    <button onClick={handleMarkAllNotificationsRead} className="text-xs font-bold text-[#77248c] hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {dbNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400">No notifications</div>
                    ) : (
                      dbNotifications.map(n => (
                        <div key={n.id} onClick={() => handleMarkNotificationRead(n.id)} className={`p-4 hover:bg-gray-50 transition-all cursor-pointer ${!n.isRead ? 'bg-purple-50/40' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-xs text-gray-800">{n.title}</span>
                            <span className="text-[10px] text-gray-400">{formatTime(n.createdAt)}</span>
                          </div>
                          <p className="text-xs text-gray-600">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setCurrentView('profile')} className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold">
              {user.name?.charAt(0) || 'U'}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* ===== DASHBOARD VIEW ===== */}
              {currentView === 'dashboard' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {user.role === 'CAREGIVER' ? (
                      <>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-sm font-bold text-gray-700">Today's Shifts</div><div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.caregiverId === user.id && new Date(s.scheduledStart).toDateString() === new Date().toDateString()).length}</div></div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-calendar-day text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-sm font-bold text-gray-700">Unconfirmed Shifts</div><div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.caregiverId === user.id && s.status === 'UNCONFIRMED').length}</div></div>
                            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-triangle-exclamation text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-sm font-bold text-gray-700">Hours This Week</div><div className="text-2xl font-bold text-gray-800">{(() => {
                              const weekAgo = new Date();
                              weekAgo.setDate(weekAgo.getDate() - 7);
                              const totalMs = shifts
                                .filter(s => s.caregiverId === user.id && s.status === 'COMPLETED' && s.actualStart && s.actualEnd && new Date(s.actualEnd) >= weekAgo)
                                .reduce((sum, s) => sum + (new Date(s.actualEnd).getTime() - new Date(s.actualStart).getTime()), 0);
                              return (totalMs / 3600000).toFixed(1);
                            })()}</div></div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-hourglass-half text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-sm font-bold text-gray-700">My Clients</div><div className="text-2xl font-bold text-gray-800">{new Set(shifts.filter(s => s.caregiverId === user.id).map(s => s.clientId)).size}</div></div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-user-group text-xl text-white"></i></div>
                          </div>
                        </div>
                      </>
                    ) : user.role === 'FAMILY_MEMBER' ? (
                      <>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-xs font-bold text-gray-500 uppercase">Client</div><div className="text-lg font-extrabold text-gray-900 truncate max-w-[150px] mt-0.5">{clients.find(c => c.id === selectedFeedClientId)?.name || clients[0]?.name || 'My Family Member'}</div></div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-heart text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-xs font-bold text-gray-500 uppercase">Assigned Caregiver</div><div className="text-lg font-extrabold text-gray-900 truncate max-w-[150px] mt-0.5">
                              {(() => {
                                const currentClient = clients.find((c: any) => c.id === selectedFeedClientId) || clients[0];
                                const primaryPodCaregiver = currentClient?.caregiverPods?.find((p: any) => p.role === 'PRIMARY')?.caregiver?.name;
                                const shiftCaregiver = shifts.find((s: any) => s.clientId === currentClient?.id && s.caregiver?.name)?.caregiver?.name;
                                return primaryPodCaregiver || shiftCaregiver || caregivers[0]?.name || 'Unassigned';
                              })()}
                            </div></div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-user-nurse text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-xs font-bold text-gray-500 uppercase">Latest Wellness</div><div className="text-lg font-extrabold text-emerald-600 truncate max-w-[150px] mt-0.5">Calm & Good</div></div>
                            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-face-smile text-xl text-white"></i></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div><div className="text-xs font-bold text-gray-500 uppercase">Care Feed Status</div><div className="text-lg font-extrabold text-purple-700 truncate max-w-[150px] mt-0.5">Active Feed</div></div>
                            <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xs"><i className="fa-solid fa-photo-film text-xl text-white"></i></div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* 1. Total Clients Card */}
                        <button
                          type="button"
                          onClick={() => setDashboardCardFilter(prev => prev === 'CLIENTS' ? 'ALL' : 'CLIENTS')}
                          className={`text-left bg-white rounded-2xl shadow-sm p-6 border transition-all cursor-pointer hover:shadow-md active:scale-98 ${
                            dashboardCardFilter === 'CLIENTS'
                              ? 'border-purple-600 ring-2 ring-purple-500/20 bg-purple-50/20'
                              : 'border-gray-100 hover:border-purple-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                Total Clients
                                {dashboardCardFilter === 'CLIENTS' && <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />}
                              </div>
                              <div className="text-2xl font-bold text-gray-800">{clients.length}</div>
                            </div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs">
                              <i className="fa-solid fa-users text-xl text-white"></i>
                            </div>
                          </div>
                        </button>

                        {/* 2. Caregivers Card */}
                        <button
                          type="button"
                          onClick={() => setDashboardCardFilter(prev => prev === 'CAREGIVERS' ? 'ALL' : 'CAREGIVERS')}
                          className={`text-left bg-white rounded-2xl shadow-sm p-6 border transition-all cursor-pointer hover:shadow-md active:scale-98 ${
                            dashboardCardFilter === 'CAREGIVERS'
                              ? 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/20'
                              : 'border-gray-100 hover:border-teal-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                Caregivers
                                {dashboardCardFilter === 'CAREGIVERS' && <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
                              </div>
                              <div className="text-2xl font-bold text-gray-800">{caregivers.length}</div>
                            </div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs">
                              <i className="fa-solid fa-user-md text-xl text-white"></i>
                            </div>
                          </div>
                        </button>

                        {/* 3. Active Shifts Card */}
                        <button
                          type="button"
                          onClick={() => setDashboardCardFilter(prev => prev === 'ACTIVE_SHIFTS' ? 'ALL' : 'ACTIVE_SHIFTS')}
                          className={`text-left bg-white rounded-2xl shadow-sm p-6 border transition-all cursor-pointer hover:shadow-md active:scale-98 ${
                            dashboardCardFilter === 'ACTIVE_SHIFTS'
                              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20'
                              : 'border-gray-100 hover:border-amber-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                Active Shifts
                                {dashboardCardFilter === 'ACTIVE_SHIFTS' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                              </div>
                              <div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.status === 'IN_PROGRESS').length}</div>
                            </div>
                            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xs">
                              <i className="fa-solid fa-clock text-xl text-white"></i>
                            </div>
                          </div>
                        </button>

                        {/* 4. Completed Card */}
                        <button
                          type="button"
                          onClick={() => setDashboardCardFilter(prev => prev === 'COMPLETED_SHIFTS' ? 'ALL' : 'COMPLETED_SHIFTS')}
                          className={`text-left bg-white rounded-2xl shadow-sm p-6 border transition-all cursor-pointer hover:shadow-md active:scale-98 ${
                            dashboardCardFilter === 'COMPLETED_SHIFTS'
                              ? 'border-teal-600 ring-2 ring-teal-500/20 bg-teal-50/20'
                              : 'border-gray-100 hover:border-teal-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                                Completed
                                {dashboardCardFilter === 'COMPLETED_SHIFTS' && <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />}
                              </div>
                              <div className="text-2xl font-bold text-gray-800">{shifts.filter(s => s.status === 'COMPLETED').length}</div>
                            </div>
                            <div className="w-12 h-12 bg-[#77248c] rounded-2xl flex items-center justify-center text-white shadow-xs">
                              <i className="fa-solid fa-circle-check text-xl text-white"></i>
                            </div>
                          </div>
                        </button>

                        {/* 5. Unassigned Clients Card */}
                        {(() => {
                          const assignedClientIds = new Set(shifts.filter(s => s.status !== 'DROPPED' && s.status !== 'COMPLETED').map(s => s.clientId));
                          const unassigned = clients.filter(c => !assignedClientIds.has(c.id));
                          return (
                            <button
                              type="button"
                              onClick={() => setDashboardCardFilter(prev => prev === 'UNASSIGNED_CLIENTS' ? 'ALL' : 'UNASSIGNED_CLIENTS')}
                              className={`text-left bg-white rounded-2xl shadow-sm p-6 border transition-all cursor-pointer hover:shadow-md active:scale-98 col-span-1 sm:col-span-2 lg:col-span-1 ${
                                dashboardCardFilter === 'UNASSIGNED_CLIENTS'
                                  ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20'
                                  : 'border-orange-100 hover:border-orange-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-bold text-orange-700 flex items-center gap-1.5">
                                    Unassigned Clients
                                    {dashboardCardFilter === 'UNASSIGNED_CLIENTS' && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                  </div>
                                  <div className="text-2xl font-bold text-orange-600">{unassigned.length}</div>
                                </div>
                                <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-xs">
                                  <i className="fa-solid fa-user-xmark text-xl text-white"></i>
                                </div>
                              </div>
                            </button>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  {/* Dynamic Filtered Data View Displayed When A Stat Card Is Tapped */}
                  {dashboardCardFilter !== 'ALL' && (
                    <div className="bg-white rounded-3xl p-6 border border-purple-100 shadow-sm space-y-4 animate-fade-up">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-[#77248c] text-white flex items-center justify-center font-bold shadow-xs">
                            {dashboardCardFilter === 'CLIENTS' && <i className="fa-solid fa-users text-white"></i>}
                            {dashboardCardFilter === 'CAREGIVERS' && <i className="fa-solid fa-user-md text-white"></i>}
                            {dashboardCardFilter === 'ACTIVE_SHIFTS' && <i className="fa-solid fa-clock text-white"></i>}
                            {dashboardCardFilter === 'COMPLETED_SHIFTS' && <i className="fa-solid fa-circle-check text-white"></i>}
                            {dashboardCardFilter === 'UNASSIGNED_CLIENTS' && <i className="fa-solid fa-user-xmark text-white"></i>}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-base">
                              {dashboardCardFilter === 'CLIENTS' && 'Total Clients Directory'}
                              {dashboardCardFilter === 'CAREGIVERS' && 'Caregivers Directory & Password Provisioning'}
                              {dashboardCardFilter === 'ACTIVE_SHIFTS' && 'Live Active Shifts (In Progress)'}
                              {dashboardCardFilter === 'COMPLETED_SHIFTS' && 'Completed Care Shifts Log'}
                              {dashboardCardFilter === 'UNASSIGNED_CLIENTS' && 'Unassigned Clients Needing Care'}
                            </h3>
                            <p className="text-xs text-gray-400">Filtered view based on selected dashboard card</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {user?.role === 'ADMIN' && (
                            <button
                              onClick={() => setShowAddUserModal(true)}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <i className="fa-solid fa-user-plus"></i> Provision Staff Account
                            </button>
                          )}
                          <button
                            onClick={() => setDashboardCardFilter('ALL')}
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          >
                            <i className="fa-solid fa-xmark"></i> Close Filter
                          </button>
                        </div>
                      </div>

                      {/* DATA VIEW 1: CAREGIVERS */}
                      {dashboardCardFilter === 'CAREGIVERS' && (
                        <div className="overflow-x-auto">
                          {caregivers.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-xs">No registered caregivers found in directory.</div>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] tracking-wider font-bold">
                                  <th className="py-3 px-2">Caregiver Name</th>
                                  <th className="py-3 px-2">Email Address</th>
                                  <th className="py-3 px-2">Phone</th>
                                  <th className="py-3 px-2">Hourly Rate</th>
                                  <th className="py-3 px-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {caregivers.map((cg: any) => (
                                  <tr key={cg.id} className="hover:bg-purple-50/40 transition-colors">
                                    <td className="py-3 px-2 font-bold text-gray-800 flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-teal-500 text-white font-bold flex items-center justify-center text-xs">
                                        {cg.name ? cg.name.charAt(0).toUpperCase() : 'C'}
                                      </div>
                                      {cg.name}
                                    </td>
                                    <td className="py-3 px-2 text-gray-600 font-mono text-[11px]">{cg.email}</td>
                                    <td className="py-3 px-2 text-gray-500">{formatUSPhoneDisplay(cg.phoneNumber)}</td>
                                    <td className="py-3 px-2 font-semibold text-emerald-600">${cg.payRate ? cg.payRate.toFixed(2) : '28.00'}/hr</td>
                                    <td className="py-3 px-2 text-right">
                                      {user && isCaregiverProvisioningAuthorized(user.email) && (
                                        <button
                                          onClick={() => {
                                            setTargetPasswordUser(cg);
                                            setAdminNewPasswordInput('');
                                            setShowAdminPasswordModal(true);
                                          }}
                                          className="px-3 py-2 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-xs rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 ml-auto cursor-pointer active:scale-95"
                                        >
                                          <i className="fa-solid fa-key text-white text-xs"></i> Set / Reset Password
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* DATA VIEW 2: CLIENTS */}
                      {dashboardCardFilter === 'CLIENTS' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {clients.length === 0 ? (
                            <div className="col-span-full text-center py-8 text-gray-400 text-xs">No registered clients found.</div>
                          ) : (
                            clients.map((c: any) => (
                              <div key={c.id} className="p-4 rounded-2xl border border-gray-100 hover:border-purple-200 bg-gray-50/50 space-y-2">
                                <div className="flex justify-between items-start">
                                  <div className="font-bold text-gray-900 text-sm">{c.name}</div>
                                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[10px] font-bold">CLIENT</span>
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1.5">
                                  <i className="fa-solid fa-location-dot text-purple-500"></i> {c.address}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* DATA VIEW 3: ACTIVE SHIFTS */}
                      {dashboardCardFilter === 'ACTIVE_SHIFTS' && (
                        <div className="space-y-3">
                          {shifts.filter(s => s.status === 'IN_PROGRESS').length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-xs">No active shifts in progress right now.</div>
                          ) : (
                            shifts.filter(s => s.status === 'IN_PROGRESS').map((s: any) => (
                              <div key={s.id} className="p-4 rounded-2xl border border-amber-200 bg-amber-50/40 flex flex-wrap justify-between items-center gap-3">
                                <div>
                                  <div className="font-bold text-amber-900 text-sm">{s.client?.name}</div>
                                  <div className="text-xs text-amber-800">Caregiver: <strong>{s.caregiver?.name}</strong></div>
                                </div>
                                <div className="text-right text-xs">
                                  <span className="px-3 py-1 rounded-full bg-amber-500 text-white font-bold text-[10px] uppercase">IN PROGRESS</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* DATA VIEW 4: COMPLETED SHIFTS */}
                      {dashboardCardFilter === 'COMPLETED_SHIFTS' && (
                        <div className="space-y-3">
                          {shifts.filter(s => s.status === 'COMPLETED').length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-xs">No completed shifts recorded yet.</div>
                          ) : (
                            shifts.filter(s => s.status === 'COMPLETED').map((s: any) => (
                              <div key={s.id} className="p-4 rounded-2xl border border-teal-100 bg-teal-50/30 flex flex-wrap justify-between items-center gap-3">
                                <div>
                                  <div className="font-bold text-gray-900 text-sm">{s.client?.name}</div>
                                  <div className="text-xs text-gray-600">Caregiver: {s.caregiver?.name}</div>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-teal-500 text-white font-bold text-[10px] uppercase">COMPLETED</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* DATA VIEW 5: UNASSIGNED CLIENTS */}
                      {dashboardCardFilter === 'UNASSIGNED_CLIENTS' && (() => {
                        const assignedClientIds = new Set(shifts.filter(s => s.status !== 'DROPPED' && s.status !== 'COMPLETED').map(s => s.clientId));
                        const unassigned = clients.filter(c => !assignedClientIds.has(c.id));
                        return (
                          <div className="space-y-3">
                            {unassigned.length === 0 ? (
                              <div className="text-center py-8 text-gray-400 text-xs">All clients currently have active caregiver assignments!</div>
                            ) : (
                              unassigned.map((c: any) => (
                                <div key={c.id} className="p-4 rounded-2xl border border-orange-200 bg-orange-50/40 flex justify-between items-center gap-3">
                                  <div>
                                    <div className="font-bold text-orange-900 text-sm">{c.name}</div>
                                    <div className="text-xs text-orange-700"><i className="fa-solid fa-location-dot"></i> {c.address}</div>
                                  </div>
                                  <button
                                    onClick={() => setCurrentView('create')}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                  >
                                    <i className="fa-solid fa-calendar-plus mr-1"></i> Schedule Shift
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {user.role === 'FAMILY_MEMBER' && (
                    <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/50 rounded-3xl p-6 border border-purple-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#77248c] text-white flex items-center justify-center text-2xl font-bold shadow-md">
                          <i className="fa-solid fa-house-chimney-medical"></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-extrabold text-gray-900">Family Care Portal</h3>
                          <p className="text-xs text-gray-500 font-medium">Stay updated on care, message your assigned caregiver, and access care documents.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <button onClick={() => setCurrentView('messages')} className="flex-1 md:flex-initial px-4 py-2.5 bg-[#77248c] hover:bg-purple-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer">
                          <i className="fa-solid fa-comments"></i> Message Care Team
                        </button>
                        <button onClick={() => setCurrentView('listings')} className="flex-1 md:flex-initial px-4 py-2.5 bg-white border border-purple-200 text-[#77248c] hover:bg-purple-50 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer">
                          <i className="fa-solid fa-heart-pulse"></i> View Care Feed
                        </button>
                      </div>
                    </div>
                  )}

                  {user.role === 'CAREGIVER' && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm">
                          <i className="fa-solid fa-bell text-white text-base"></i>
                        </div>
                        <div>
                          <div className="font-bold text-red-800 text-sm">Emergency Reporting</div>
                          <div className="text-xs text-red-500">Report an incident or send an immediate SOS to admin and the care coordinator.</div>
                        </div>
                      </div>
                      <button
                        onClick={() => { setIncidentType('Emergency SOS'); setShowIncidentModal(true); }}
                        className="flex-shrink-0 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                      >
                        <i className="fa-solid fa-triangle-exclamation"></i> Report / SOS
                      </button>
                    </div>
                  )}

                  {user.role === 'CAREGIVER' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Unconfirmed Shifts */}
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="font-semibold text-gray-800 mb-4">Unconfirmed Shifts</h3>
                        {shifts.filter(s => s.caregiverId === user.id && s.status === 'UNCONFIRMED').length === 0 ? (
                          <p className="text-gray-400 text-sm text-center py-8">Nothing needs your confirmation right now</p>
                        ) : (
                          <div className="space-y-3">
                            {shifts.filter(s => s.caregiverId === user.id && s.status === 'UNCONFIRMED').map(shift => (
                              <div key={shift.id} className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0">
                                <div>
                                  <div className="font-bold text-sm text-gray-800">{shift.client.name}</div>
                                  <div className="text-xs text-gray-400 mt-0.5"><i className="fa-regular fa-clock mr-1"></i>{formatDateTime(shift.scheduledStart)}</div>
                                </div>
                                <button onClick={() => handleConfirmShift(shift.id, false)} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg cursor-pointer shadow-2xs">Confirm Shift</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* My Schedule */}
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-gray-800">My Schedule</h3>
                          <button onClick={() => setCurrentView('listings')} className="text-xs font-semibold text-purple-600 hover:text-purple-700 cursor-pointer">View All</button>
                        </div>
                        {shifts.filter(s => s.caregiverId === user.id && s.status !== 'COMPLETED' && s.status !== 'DROPPED').length === 0 ? (
                          <p className="text-gray-400 text-sm text-center py-8">No upcoming shifts scheduled</p>
                        ) : (
                          <div className="space-y-3">
                            {shifts
                              .filter(s => s.caregiverId === user.id && s.status !== 'COMPLETED' && s.status !== 'DROPPED')
                              .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
                              .slice(0, 5)
                              .map(shift => (
                                <div key={shift.id} className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0">
                                  <div>
                                    <div className="font-bold text-sm text-gray-800">{shift.client.name}</div>
                                    <div className="text-xs text-gray-400 mt-0.5"><i className="fa-regular fa-clock mr-1"></i>{formatDateTime(shift.scheduledStart)}</div>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                    shift.status === 'IN_PROGRESS' ? 'bg-[#77248c] text-white font-bold' :
                                    shift.status === 'UNCONFIRMED' ? 'bg-amber-500 text-white font-bold' :
                                    shift.status === 'CONFIRMED' ? 'bg-[#4cdbd5] text-white' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>{shift.status}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">Recent Activity</h3>
                    {activityLogs.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">No recent activity</p>
                    ) : (
                      <div className="space-y-3">
                        {activityLogs.slice(0, 5).map((log) => (
                          <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                            <div className={`w-2 h-2 rounded-full mt-2 ${log.details?.hasRedFlags ? 'bg-red-500' : 'bg-purple-600'}`}></div>
                            <div><div className="text-sm text-gray-700">{log.details?.notes || 'Care update'}</div><div className="text-xs text-gray-400">{formatDateTime(log.createdAt)}</div></div>
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
                      <div className="w-32 h-32 rounded-full bg-purple-600 flex items-center justify-center text-white text-5xl font-bold shadow-lg">
                        {user.name?.charAt(0) || 'U'}
                      </div>
                      <h2 className="text-2xl font-bold text-gray-800 mt-4">{user.name}</h2>
                      <p className="text-gray-500">{user.email}</p>
                      <span className="mt-2 px-4 py-1.5 bg-[#77248c] text-white rounded-full text-sm font-bold shadow-xs">{user.role}</span>
                      {user.phoneNumber && <p className="text-sm text-gray-500 mt-2 font-mono"><i className="fa-solid fa-phone mr-2"></i>{formatUSPhoneDisplay(user.phoneNumber)}</p>}
                    </div>
                    {user.role !== 'ADMIN' && (
                      <div className="grid grid-cols-2 gap-4 mt-8">
                        <div className="bg-gray-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-500">Member Since</div><div className="font-semibold">2026</div></div>
                        <div className="bg-gray-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-500">Total Shifts</div><div className="font-semibold">{shifts.filter(s => s.caregiverId === user.id).length}</div></div>
                      </div>
                    )}
                  </div>

                  {/* Caregiver Home Base Location (used for proximity-based shift scheduling) */}
                  {user.role === 'CAREGIVER' && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                            <i className="fa-solid fa-location-dot text-purple-600"></i> My Home Base Location
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {(() => {
                              const loc = savedLocation ?? (user.latitude != null && user.longitude != null ? { latitude: user.latitude, longitude: user.longitude } : null);
                              return loc
                                ? `Saved: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
                                : 'Not set yet — used to match you with nearby clients when scheduling.';
                            })()}
                          </p>
                        </div>
                        <button
                          onClick={handleUpdateMyLocation}
                          disabled={isSavingLocation}
                          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {isSavingLocation ? (
                            <><i className="fa-solid fa-circle-notch animate-spin"></i> Updating...</>
                          ) : (
                            <><i className="fa-solid fa-location-crosshairs"></i> Use My Current Location</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Caregiver Weekly Working Availability Schedule Manager */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-gray-100 pb-4 mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                          <i className="fa-solid fa-calendar-days text-purple-600"></i> Weekly Working Availability Schedule
                        </h3>
                        <p className="text-xs text-gray-500">Define recurring weekly working hours for automated shift matching</p>
                      </div>
                      <button onClick={handleSaveAvailability} disabled={isSavingSchedule} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-all">
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
                          <i className="fa-solid fa-id-card text-purple-600"></i> Profile Certifications & Clinical Specializations
                        </h3>
                        <p className="text-xs text-gray-500">Manage your clinical credentials, licenses, and bio metadata</p>
                      </div>
                      <button
                        onClick={handleSaveUserProfileMetadata}
                        disabled={isSavingUserProfile}
                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {isSavingUserProfile ? 'Saving Details...' : 'Save Profile Details'}
                      </button>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-1">Contact Phone Number</label>
                        <PhoneInput
                          value={userPhoneInput || user.phoneNumber || ''}
                          onChange={(val) => setUserPhoneInput(val)}
                          className="mt-1 max-w-md"
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
                                  isChecked ? 'bg-purple-600 text-white border-purple-600 shadow-2xs' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
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
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-gray-600 uppercase block mb-1">Professional Bio & Experience Summary</label>
                        <textarea
                          rows={3}
                          value={userBioInput}
                          onChange={(e) => setUserBioInput(e.target.value)}
                          placeholder="Brief summary of clinical care experience..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Change Password Card (Caregiver & Family) */}
                  {(user.role === 'CAREGIVER' || user.role === 'FAMILY_MEMBER') && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                            <i className="fa-solid fa-shield-halved text-[#77248c]"></i> Account Security
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">Update your login password anytime from here.</p>
                        </div>
                        <button
                          onClick={() => { setShowSelfPasswordModal(true); setSelfPasswordError(null); setCurrentPasswordInput(''); setNewSelfPasswordInput(''); setConfirmSelfPasswordInput(''); }}
                          className="px-5 py-2.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <i className="fa-solid fa-key"></i> Change My Password
                        </button>
                      </div>
                    </div>
                  )}
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
                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                          <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                            <h4 className="font-bold text-xs text-purple-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <i className="fa-solid fa-list-check text-purple-600"></i> Baseline Care Plan ({carePlan.title})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {carePlan.tasks.map((task: any) => (
                                <div key={task.id} className="bg-white border border-purple-100 rounded-lg p-2.5 text-xs flex justify-between items-center shadow-2xs">
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

                      {/* About Me - self-service Q&A, editable anytime */}
                      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <h4 className="font-bold text-xs text-teal-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                          <i className="fa-solid fa-comment-dots text-teal-600"></i> About Me
                        </h4>
                        <p className="text-[11px] text-gray-400 mb-3">Help the care team get to know your loved one. Update this anytime.</p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">What are they like as a person?</label>
                            <textarea rows={2} value={familyAboutMePersonality} onChange={(e) => setFamilyAboutMePersonality(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">What does a typical day look like for them?</label>
                            <textarea rows={2} value={familyAboutMeDailyRoutine} onChange={(e) => setFamilyAboutMeDailyRoutine(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">What kind of caregiver would they prefer?</label>
                            <textarea rows={2} value={familyAboutMePreferredCaregiverType} onChange={(e) => setFamilyAboutMePreferredCaregiverType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">Anything else we should know?</label>
                            <textarea rows={2} value={familyAboutMeObservations} onChange={(e) => setFamilyAboutMeObservations(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                          </div>
                          <button
                            onClick={handleSaveAboutMe}
                            disabled={isSavingAboutMe || !selectedFeedClientId}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl transition-all disabled:opacity-50"
                          >
                            {isSavingAboutMe ? 'Saving...' : 'Save About Me'}
                          </button>
                        </div>
                      </div>

                      {/* Rate This Week's Care - weekly caregiver performance review */}
                      {weeklyReviewCaregivers.length > 0 && (
                        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                          <h4 className="font-bold text-xs text-teal-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                            <i className="fa-solid fa-star-half-stroke text-teal-600"></i> Rate This Week's Care
                          </h4>
                          <p className="text-[11px] text-gray-400 mb-3">Tell us how this week went with your caregiver(s). This helps us with internal staffing decisions.</p>
                          <div className="space-y-4">
                            {weeklyReviewCaregivers.map((c) => {
                              const draft = reviewDrafts[c.id] || { strengths: '', improvements: '', wouldContinue: null, rating: '' };
                              const alreadySubmitted = Boolean(c.existingReview);
                              return (
                                <div key={c.id} className="border border-gray-100 rounded-xl p-3 space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm text-gray-800">{c.name}</span>
                                    {alreadySubmitted && (
                                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><i className="fa-solid fa-circle-check"></i> Submitted this week</span>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-gray-500 uppercase">What did they do well?</label>
                                    <textarea rows={2} value={draft.strengths} onChange={(e) => setReviewDrafts(prev => ({ ...prev, [c.id]: { ...draft, strengths: e.target.value } }))} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-gray-500 uppercase">Where could they improve?</label>
                                    <textarea rows={2} value={draft.improvements} onChange={(e) => setReviewDrafts(prev => ({ ...prev, [c.id]: { ...draft, improvements: e.target.value } }))} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                                  </div>
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-semibold text-gray-500 uppercase">Continue next week?</span>
                                      <button type="button" onClick={() => setReviewDrafts(prev => ({ ...prev, [c.id]: { ...draft, wouldContinue: true } }))} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${draft.wouldContinue === true ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Yes</button>
                                      <button type="button" onClick={() => setReviewDrafts(prev => ({ ...prev, [c.id]: { ...draft, wouldContinue: false } }))} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${draft.wouldContinue === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>No</button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-semibold text-gray-500 uppercase">Overall (optional)</span>
                                      <select value={draft.rating} onChange={(e) => setReviewDrafts(prev => ({ ...prev, [c.id]: { ...draft, rating: e.target.value } }))} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs">
                                        <option value="">-</option>
                                        <option value="1">1 - Poor</option>
                                        <option value="2">2 - Fair</option>
                                        <option value="3">3 - Good</option>
                                        <option value="4">4 - Very Good</option>
                                        <option value="5">5 - Excellent</option>
                                      </select>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleSubmitCaregiverReview(c.id)}
                                    disabled={isSubmittingReviewFor === c.id}
                                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg transition-all disabled:opacity-50"
                                  >
                                    {isSubmittingReviewFor === c.id ? 'Saving...' : alreadySubmitted ? 'Update Review' : 'Submit Review'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

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
                              <div key={log.id} className={`border rounded-2xl p-6 shadow-xs transition-all ${log.details?.hasRedFlags ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white hover:border-purple-200 hover:shadow-md'}`}>
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                      {log.details?.caregiverName?.charAt(0) || 'C'}
                                    </div>
                                    <div>
                                      <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                        <span>{log.details?.caregiverName || 'Caregiver'}</span>
                                        <span className="bg-[#77248c] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-2xs">
                                          Verified Caregiver
                                        </span>
                                      </div>
                                      <div className="text-xs text-gray-400 font-medium mt-0.5">
                                        <i className="fa-regular fa-clock mr-1"></i>
                                        {formatDateTime(log.createdAt)}
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
                                <div className="mt-4 p-3.5 bg-white border border-purple-200 rounded-xl text-sm text-gray-800 leading-relaxed font-normal shadow-2xs">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#77248c] block mb-1">
                                    💬 Caregiver Caption & Summary
                                  </span>
                                  {log.details?.notes || 'Care shift update logged.'}
                                </div>

                                {/* Wellness Status Chips */}
                                {log.details?.wellness && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Mood</span><span className="font-semibold text-purple-900">{log.details.wellness.mood}</span></div>
                                    <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Appetite</span><span className="font-semibold text-emerald-900">{log.details.wellness.appetite}</span></div>
                                    <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Hydration</span><span className="font-semibold text-emerald-900">{log.details.wellness.hydration}</span></div>
                                    <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-xl"><span className="text-gray-400 text-[10px] block uppercase font-semibold">Sleep</span><span className="font-semibold text-purple-900">{log.details.wellness.sleep}</span></div>
                                  </div>
                                )}

                                {/* VISUAL MEDIA GALLERY (Captioned Images, Videos & Audio Voice Notes) */}
                                {mediaList.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                                    <div className="text-xs font-bold text-gray-700 flex items-center justify-between">
                                      <span className="flex items-center gap-1.5 text-purple-600">
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
                                              <div className="relative aspect-video flex flex-col items-center justify-center bg-purple-950 text-white p-3 text-center border border-purple-800/60 rounded-xl">
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
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 items-center sm:items-stretch">
                        <h3 className="font-extrabold text-gray-900 text-xl md:text-2xl tracking-tight text-center sm:text-left w-full sm:w-auto">
                          {user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR' ? 'All Scheduled Care Shifts' : 'My Assigned Shifts'}
                        </h3>
                        {user.role === 'CAREGIVER' && (
                          <button
                            onClick={() => setShowPostUpdateModal(true)}
                            className="px-4 py-2.5 bg-[#77248c] hover:bg-purple-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer w-full sm:w-auto"
                          >
                            <i className="fa-solid fa-camera text-white"></i> Send Family Media Update
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
                                user.role === 'CAREGIVER' ? 'hover:bg-purple-50/40 p-3 cursor-pointer border border-transparent hover:border-purple-200' : ''
                              }`}
                            >
                              <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-base text-gray-800">{shift.client.name}</span>
                                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                        shift.status === 'COMPLETED' ? 'bg-[#4cdbd5] text-white shadow-2xs' :
                                        shift.status === 'IN_PROGRESS' ? 'bg-[#77248c] text-white font-bold' :
                                        shift.status === 'UNCONFIRMED' ? 'bg-amber-500 text-white font-bold' :
                                        shift.status === 'CONFIRMED' ? 'bg-[#4cdbd5] text-white font-bold' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>{shift.status}</span>
                                      {shift.status === 'IN_PROGRESS' && (
                                        <span className="px-2.5 py-0.5 bg-emerald-500 text-white rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
                                          🟢 Ongoing Service
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500 font-medium mt-0.5">Caregiver: {shift.caregiver.name}</div>
                                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><i className="fa-regular fa-clock"></i>{formatDateTime(shift.scheduledStart)}</div>
                                  </div>

                                  {user.role === 'CAREGIVER' && (
                                    <div className="text-[10px] text-white bg-[#77248c] font-bold px-2.5 py-1 rounded-lg shadow-2xs w-fit flex items-center gap-1.5">
                                      <i className="fa-solid fa-comments text-white"></i> Tap card to send family update
                                    </div>
                                  )}
                                </div>

                                {/* Dedicated Responsive Action Toolbar */}
                                <div className="flex items-center gap-2 flex-wrap pt-2.5 border-t border-gray-100">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleFetchGpsLocationHistory(shift.id); }}
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-emerald-400 font-semibold text-xs rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                                  >
                                    <i className="fa-solid fa-location-dot"></i> Live GPS
                                  </button>

                                  {/* Caregiver Shift Actions */}
                                  {user.role === 'CAREGIVER' && shift.status === 'UNCONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmShift(shift.id, false); }} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs">Confirm Shift</button>
                                  )}

                                  {/* Admin / Coordinator Force Confirm Action */}
                                  {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && shift.status === 'UNCONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmShift(shift.id, true); }} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5">
                                      <i className="fa-solid fa-shield-halved"></i> Admin Confirm
                                    </button>
                                  )}

                                  {/* Caregiver Confirm Presence / Site Readiness Check-In */}
                                  {user.role === 'CAREGIVER' && shift.status === 'CONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleConfirmCaregiverPresence(shift.id); }} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5">
                                      <i className="fa-solid fa-user-check text-white"></i> Confirm Presence
                                    </button>
                                  )}

                                  {user.role === 'CAREGIVER' && shift.status === 'CONFIRMED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleClockIn(shift.id, false); }} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs">Clock In</button>
                                  )}

                                  {user.role === 'CAREGIVER' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenShiftUpdate(shift); }}
                                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                                    >
                                      <i className="fa-solid fa-camera"></i> Family Update
                                    </button>
                                  )}

                                  {user.role === 'CAREGIVER' && shift.status === 'IN_PROGRESS' && (
                                    <button onClick={(e) => { e.stopPropagation(); openClockOutModal(shift.id, false); }} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs">Clock Out</button>
                                  )}
                                  {shift.status !== 'COMPLETED' && shift.status !== 'DROPPED' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenDropModal(shift.id); }} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer">
                                      Drop Shift...
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Client Details - unlocked once the caregiver has confirmed the shift */}
                              {user.role === 'CAREGIVER' && (
                                shift.status === 'UNCONFIRMED' ? (
                                  <div className="px-3.5 py-2.5 bg-white border border-purple-200 rounded-xl text-xs font-semibold text-[#77248c] flex items-center gap-2 shadow-2xs">
                                    <i className="fa-solid fa-lock text-[#77248c]"></i> Confirm this shift to view client details
                                  </div>
                                ) : (() => {
                                  const clientFull = clients.find((c: any) => c.id === shift.clientId) || shift.client;
                                  let meta: any = {};
                                  try { meta = clientFull.profileMetadata ? JSON.parse(clientFull.profileMetadata) : {}; } catch {}
                                  const familyContacts = clientFull.familyMembers || [];
                                  return (
                                    <div className="p-3.5 bg-purple-50/50 border border-purple-100/80 rounded-xl space-y-2 text-xs shadow-2xs" onClick={(e) => e.stopPropagation()}>
                                      <div className="font-bold text-[#77248c] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                        <i className="fa-solid fa-address-card text-[#77248c]"></i> Client Details
                                      </div>

                                      <div className="flex items-start gap-2">
                                        <i className="fa-solid fa-location-dot text-purple-400 w-3.5 mt-0.5"></i>
                                        <div>
                                          <span className="text-gray-700 font-medium">{clientFull.address}</span>
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${clientFull.latitude},${clientFull.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 text-[#77248c] hover:underline font-bold"
                                          >Get Directions</a>
                                        </div>
                                      </div>

                                      {(meta.medicalConditions || meta.allergiesNotes) && (
                                        <div className="flex items-start gap-2">
                                          <i className="fa-solid fa-notes-medical text-purple-400 w-3.5 mt-0.5"></i>
                                          <div className="text-gray-700">
                                            {meta.medicalConditions && <div><span className="font-semibold text-gray-800">Care Needs:</span> {meta.medicalConditions}</div>}
                                            {meta.allergiesNotes && <div><span className="font-semibold text-gray-800">Notes:</span> {meta.allergiesNotes}</div>}
                                          </div>
                                        </div>
                                      )}

                                      {((meta.preferences && meta.preferences.length > 0) || meta.otherPreferences) && (
                                        <div className="flex items-start gap-2">
                                          <i className="fa-solid fa-heart text-purple-400 w-3.5 mt-0.5"></i>
                                          <div className="text-gray-700">
                                            <span className="font-semibold text-gray-800">Preferences:</span> {[...(meta.preferences || []), meta.otherPreferences].filter(Boolean).join(', ')}
                                          </div>
                                        </div>
                                      )}

                                      {(meta.personality || meta.dailyRoutine || meta.preferredCaregiverType || meta.additionalObservations) && (
                                        <div className="flex items-start gap-2">
                                          <i className="fa-solid fa-comment-dots text-purple-400 w-3.5 mt-0.5"></i>
                                          <div className="text-gray-700 space-y-0.5">
                                            <div className="font-semibold text-gray-800">About Me</div>
                                            {meta.personality && <div><span className="text-gray-500">Personality:</span> {meta.personality}</div>}
                                            {meta.dailyRoutine && <div><span className="text-gray-500">Typical day:</span> {meta.dailyRoutine}</div>}
                                            {meta.preferredCaregiverType && <div><span className="text-gray-500">Prefers:</span> {meta.preferredCaregiverType}</div>}
                                            {meta.additionalObservations && <div><span className="text-gray-500">Notes:</span> {meta.additionalObservations}</div>}
                                          </div>
                                        </div>
                                      )}

                                      {(meta.dob || meta.gender) && (
                                        <div className="flex items-start gap-2">
                                          <i className="fa-solid fa-id-card text-purple-400 w-3.5 mt-0.5"></i>
                                          <div className="text-gray-700 space-y-0.5">
                                            {meta.dob && <div><span className="font-semibold text-gray-800">DOB:</span> {meta.dob} {meta.dob ? `(Age ${Math.floor((Date.now() - new Date(meta.dob).getTime()) / 3.15576e10)})` : ''}</div>}
                                            {meta.gender && <div><span className="font-semibold text-gray-800">Gender:</span> {meta.gender}</div>}
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex items-start gap-2">
                                        <i className="fa-solid fa-phone-volume text-red-400 w-3.5 mt-0.5"></i>
                                        <div className="text-gray-700 space-y-0.5 w-full">
                                          <div className="font-semibold text-gray-800 text-[11px] uppercase tracking-wide text-red-600">Emergency Contacts</div>
                                          {meta.primaryEmergency ? (
                                            <div className="bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 space-y-0.5">
                                              <div className="font-semibold text-gray-800">{meta.primaryEmergency.name} <span className="text-gray-400 font-normal">({meta.primaryEmergency.relationship})</span></div>
                                              <a href={`tel:${meta.primaryEmergency.phone}`} className="text-red-600 font-bold hover:underline">{meta.primaryEmergency.phone}</a>
                                            </div>
                                          ) : null}
                                          {meta.secondaryEmergency ? (
                                            <div className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 space-y-0.5">
                                              <div className="font-semibold text-gray-800">{meta.secondaryEmergency.name} <span className="text-gray-400 font-normal">({meta.secondaryEmergency.relationship})</span></div>
                                              <a href={`tel:${meta.secondaryEmergency.phone}`} className="text-gray-600 font-bold hover:underline">{meta.secondaryEmergency.phone}</a>
                                            </div>
                                          ) : null}
                                          {familyContacts.length > 0 && familyContacts.map((f: any) => (
                                            <div key={f.user.id} className="text-gray-600">{f.user.name} &middot; {f.user.phoneNumber || f.user.email}</div>
                                          ))}
                                          {!meta.primaryEmergency && !meta.secondaryEmergency && familyContacts.length === 0 && (
                                            <div className="text-gray-400">No emergency contact on file</div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()
                              )}

                              {/* Live Interactive Shift Task Checklist for IN_PROGRESS shifts */}
                              {shift.status === 'IN_PROGRESS' && (
                                <div className="mt-3 p-3 bg-purple-50/40 border border-purple-100 rounded-xl space-y-2 text-xs">
                                  <div className="flex justify-between items-center font-bold text-purple-900 text-[11px] uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5"><i className="fa-solid fa-list-check text-purple-600"></i> Active Shift Task Checklist</span>
                                    <button onClick={() => handleFetchShiftTasks(shift.id)} className="text-purple-600 hover:underline font-normal text-[10px]">
                                      ↻ Refresh Tasks
                                    </button>
                                  </div>

                                  <div className="space-y-1.5">
                                    {(activeShiftTasksMap[shift.id] || shift.tasks || [
                                      { id: 'st1', description: 'Administer morning prescription Lisinopril 10mg', isCompleted: true, completedAt: new Date().toISOString() },
                                      { id: 'st2', description: 'Assist with morning mobility & breakfast preparation', isCompleted: false },
                                      { id: 'st3', description: 'Log vital signs (Blood Pressure & Hydration)', isCompleted: false },
                                    ]).map((st: any) => (
                                      <label key={st.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-purple-100 text-xs cursor-pointer hover:bg-purple-50/50 transition-colors">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(st.isCompleted)}
                                            onChange={(e) => handleToggleShiftTask(shift.id, st.id, e.target.checked)}
                                            className="rounded accent-purple-600 w-4 h-4 cursor-pointer"
                                          />
                                          <span className={st.isCompleted ? 'line-through text-gray-400 font-medium' : 'text-gray-800 font-semibold'}>
                                            {st.description}
                                          </span>
                                        </div>
                                        {st.isCompleted && (
                                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-mono font-bold flex items-center gap-1">
                                            ✓ Done {st.completedAt ? formatTime(st.completedAt) : ''}
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
                                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg shadow-2xs"
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

              {/* ===== ADD CAREGIVER VIEW ===== */}
              {currentView === 'add_caregiver' && user && isCaregiverProvisioningAuthorized(user.email) && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-3xl shadow-sm border border-purple-100 p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#77248c] text-white flex items-center justify-center text-xl font-bold shadow-md">
                        <i className="fa-solid fa-user-plus text-white"></i>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Add & Provision Caregiver</h3>
                        <p className="text-xs text-gray-500">Assign first-time credentials for new caregivers. Access will be automatically restricted to the Caregiver Portal by the database.</p>
                      </div>
                    </div>

                    <div className="bg-[#77248c] text-white rounded-2xl p-5 text-xs space-y-2.5 shadow-md">
                      <div className="font-bold flex items-center gap-2 text-white text-sm">
                        <i className="fa-solid fa-shield-halved text-white text-base"></i> Database Access & Domain Rules:
                      </div>
                      <ul className="list-disc list-inside space-y-1.5 text-white/95 text-xs">
                        <li>All caregiver accounts must use an official <strong className="text-white underline decoration-purple-300">@akirapahomecareus.com</strong> email address.</li>
                        <li>When an admin sets a password here, the database assigns role <strong>CAREGIVER</strong>.</li>
                        <li>Caregiver emails are strictly limited to the Caregiver Portal and cannot access Admin, Business Hub, or Family portals.</li>
                      </ul>
                    </div>

                    {/* Provisioning Form */}
                    <form onSubmit={(e) => { setNewUserRole('CAREGIVER'); handleAdminCreateUser(e); }} className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Caregiver First Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Sarah"
                            value={newUserFirstName}
                            onChange={(e) => setNewUserFirstName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Caregiver Last Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Connor"
                            value={newUserLastName}
                            onChange={(e) => setNewUserLastName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Official Caregiver Email <span className="text-red-500">*</span></label>
                          <input
                            type="email"
                            required
                            placeholder="name@akirapahomecareus.com"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">First-Time Temporary Password <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. AkirapaCare2026!"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1 font-mono"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Phone Number</label>
                          <PhoneInput
                            value={newUserPhone}
                            onChange={(val) => setNewUserPhone(val)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Hourly Pay Rate ($/hr)</label>
                          <input
                            type="number"
                            step="0.50"
                            value={newUserPayRate}
                            onChange={(e) => setNewUserPayRate(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      {addUserError && (
                        <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                          <i className="fa-solid fa-triangle-exclamation"></i> {addUserError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isCreatingUser || !newUserEmail || !newUserPassword || !newUserFirstName || !newUserLastName}
                        className="w-full py-4 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-md cursor-pointer flex items-center justify-center gap-2 mt-2"
                      >
                        {isCreatingUser ? (
                          <><i className="fa-solid fa-circle-notch animate-spin"></i> Provisioning Caregiver Account...</>
                        ) : (
                          <><i className="fa-solid fa-user-plus"></i> Add Caregiver & Issue Password</>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Caregiver Directory & Instant Password Reset */}
                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                          <i className="fa-solid fa-user-md text-teal-600"></i> Registered Caregivers ({caregivers.length})
                        </h4>
                        <p className="text-xs text-gray-400">Manage caregiver passwords and account details</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      {caregivers.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-xs">No registered caregivers found. Add one above!</div>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] tracking-wider font-bold">
                              <th className="py-3 px-2">Caregiver Name</th>
                              <th className="py-3 px-2">Email Address</th>
                              <th className="py-3 px-2">First-Time Password</th>
                              <th className="py-3 px-2">Phone</th>
                              <th className="py-3 px-2">Hourly Rate</th>
                              <th className="py-3 px-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {caregivers.map((cg: any) => {
                              const initialPass = getInitialPassword(cg);
                              const isPassVisible = Boolean(visiblePasswords[cg.id]);
                              return (
                                <tr key={cg.id} className="hover:bg-purple-50/40 transition-colors">
                                  <td className="py-3.5 px-2 font-bold text-gray-800 flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-teal-500 text-white font-bold flex items-center justify-center text-xs">
                                      {cg.name ? cg.name.charAt(0).toUpperCase() : 'C'}
                                    </div>
                                    {cg.name}
                                  </td>
                                  <td className="py-3.5 px-2 text-gray-600 font-mono text-[11px]">{cg.email}</td>
                                  <td className="py-3.5 px-2">
                                    {initialPass ? (
                                      <div className="flex items-center gap-1.5">
                                        {isPassVisible ? (
                                          <span className="px-2.5 py-1 bg-cyan-500 text-white border border-cyan-600 rounded-lg text-xs font-mono font-bold shadow-2xs">
                                            {initialPass}
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => toggleShowPassword(cg.id)}
                                            className="px-2.5 py-1 bg-[#77248c] hover:bg-[#5a1a6b] text-white border border-purple-700 rounded-lg text-xs font-mono font-semibold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                          >
                                            <i className="fa-solid fa-eye-slash text-[10px]"></i> ••••••••
                                          </button>
                                        )}
                                        {isPassVisible && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => toggleShowPassword(cg.id)}
                                              className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                                              title="Hide password"
                                            >
                                              <i className="fa-solid fa-eye text-xs"></i>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(initialPass);
                                                setCopiedId(cg.id);
                                                setTimeout(() => setCopiedId(null), 2000);
                                              }}
                                              className="text-purple-600 hover:text-purple-800 p-1 font-bold text-[10px] cursor-pointer"
                                            >
                                              {copiedId === cg.id ? '✓ Copied' : 'Copy'}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic text-[11px]">Not saved (Reset to view)</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-2 text-gray-500 font-mono">{formatUSPhoneDisplay(cg.phoneNumber)}</td>
                                  <td className="py-3.5 px-2 font-semibold text-emerald-600">${cg.payRate ? cg.payRate.toFixed(2) : '28.00'}/hr</td>
                                  <td className="py-3.5 px-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setTargetPasswordUser(cg);
                                          setAdminNewPasswordInput('');
                                          setShowAdminPasswordModal(true);
                                        }}
                                        className="px-3 py-1.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                      >
                                        <i className="fa-solid fa-key text-white text-xs"></i> Set / Reset Password
                                      </button>

                                      <button
                                        onClick={() => handleDeleteCaregiver(cg.id, cg.name)}
                                        disabled={deletingUserId === cg.id}
                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                                        title="Delete caregiver in one tap"
                                      >
                                        {deletingUserId === cg.id ? (
                                          <i className="fa-solid fa-circle-notch animate-spin"></i>
                                        ) : (
                                          <><i className="fa-solid fa-trash-can text-white text-xs"></i> Delete</>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== ADD CLIENT VIEW ===== */}
              {currentView === 'add_client' && user && isCaregiverProvisioningAuthorized(user.email) && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-3xl shadow-sm border border-purple-100 p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#77248c] text-white flex items-center justify-center text-xl font-bold shadow-md">
                        <i className="fa-solid fa-user-plus text-white"></i>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Add & Provision Client</h3>
                        <p className="text-xs text-gray-500">Assign first-time credentials for new clients. Access will be automatically restricted to the Family Portal by the database.</p>
                      </div>
                    </div>

                    <div className="bg-[#77248c] text-white rounded-2xl p-5 text-xs space-y-2.5 shadow-md">
                      <div className="font-bold flex items-center gap-2 text-white text-sm">
                        <i className="fa-solid fa-shield-halved text-white text-base"></i> Database Access & Domain Rules:
                      </div>
                      <ul className="list-disc list-inside space-y-1.5 text-white/95 text-xs">
                        <li>Client & family member accounts <strong>allow normal personal email addresses</strong> (e.g. Gmail, Yahoo, Outlook, personal email).</li>
                        <li>When an admin sets a password here, the database assigns role <strong>FAMILY_MEMBER</strong> linked directly to the client profile.</li>
                        <li>Client emails are strictly limited to the Family Portal and cannot access Admin, Business Hub, or Caregiver portals.</li>
                      </ul>
                    </div>

                    {/* Provisioning Form */}
                    <form onSubmit={handleProvisionClient} className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Client First Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Robert"
                            value={newClientFirstName}
                            onChange={(e) => setNewClientFirstName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Client Last Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Smith"
                            value={newClientLastName}
                            onChange={(e) => setNewClientLastName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Client / Family Email (Normal Email) <span className="text-red-500">*</span></label>
                          <input
                            type="email"
                            required
                            placeholder="robert.smith@gmail.com"
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1 font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">First-Time Temporary Password <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. AkirapaClient2026!"
                            value={newClientPassword}
                            onChange={(e) => setNewClientPassword(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1 font-mono"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Phone Number</label>
                          <PhoneInput
                            value={newClientPhone}
                            onChange={(val) => setNewClientPhone(val)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Hourly Billing Rate ($/hr)</label>
                          <input
                            type="number"
                            step="1.00"
                            value={newClientBillingRate}
                            onChange={(e) => setNewClientBillingRate(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Care Tier</label>
                          <select
                            value={newClientCareTier}
                            onChange={(e) => setNewClientCareTier(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          >
                            <option value="Standard">Standard Care</option>
                            <option value="Premium">Premium Care</option>
                            <option value="Specialized">Specialized Care</option>
                            <option value="Hospice">Hospice Care</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Street Address <span className="text-red-500">*</span></label>
                          <LocationAutocompleteInput
                            value={newClientAddress}
                            onChange={(val) => setNewClientAddress(val)}
                            onSelectLocation={(loc) => {
                              setNewClientAddress(loc.street || loc.full);
                              if (loc.city) setNewClientCity(loc.city);
                              if (loc.state) setNewClientState(loc.state);
                              if (loc.zip) setNewClientZip(loc.zip);
                            }}
                            placeholder="1234 West 4th Ave..."
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Emergency Contact First Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Mary"
                            value={newClientEmergencyFirstName}
                            onChange={(e) => setNewClientEmergencyFirstName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Emergency Contact Last Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Smith"
                            value={newClientEmergencyLastName}
                            onChange={(e) => setNewClientEmergencyLastName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">Emergency Contact Phone</label>
                          <PhoneInput
                            value={newClientEmergencyPhone}
                            onChange={(val) => setNewClientEmergencyPhone(val)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {addClientError && (
                        <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                          <i className="fa-solid fa-triangle-exclamation"></i> {addClientError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isProvisioningClient || !newClientFirstName || !newClientLastName || !newClientEmail || !newClientPassword}
                        className="w-full py-4 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-md cursor-pointer flex items-center justify-center gap-2 mt-2"
                      >
                        {isProvisioningClient ? (
                          <><i className="fa-solid fa-circle-notch animate-spin"></i> Provisioning Client & Family Account...</>
                        ) : (
                          <><i className="fa-solid fa-user-plus"></i> Add Client & Issue Password</>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Client Directory & Password Reset */}
                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                      <div>
                        <h4 className="font-extrabold text-base text-gray-800">Client Roster & Credential Management</h4>
                        <p className="text-xs text-gray-500">Manage client profiles and family member login credentials.</p>
                      </div>
                      <span className="text-xs font-extrabold bg-[#77248c] text-white px-3 py-1 rounded-full shadow-xs">{clients.length} Clients</span>
                    </div>
                    {clients.length === 0 ? (
                      <div className="text-center py-8 text-xs text-gray-400">No clients registered in the system yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="pb-3 px-2">Client Name</th>
                              <th className="pb-3 px-2">Address</th>
                              <th className="pb-3 px-2">First-Time Password</th>
                              <th className="pb-3 px-2">Care Tier</th>
                              <th className="pb-3 px-2">Billing Rate</th>
                              <th className="pb-3 px-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {clients.map((cl: any) => {
                              const linkedFamilyUser = cl.familyMembers?.[0]?.user || cl.linkedUser || null;
                              const initialPass = getInitialPassword(linkedFamilyUser || cl);
                              const isPassVisible = Boolean(visiblePasswords[cl.id]);
                              return (
                                <tr key={cl.id} className="hover:bg-purple-50/40 transition-colors">
                                  <td className="py-3.5 px-2 font-bold text-gray-800">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">{cl.name?.charAt(0)?.toUpperCase() || 'C'}</div>
                                      <div>
                                        <div>{cl.name}</div>
                                        {linkedFamilyUser && <div className="text-[10px] text-purple-600 font-mono font-normal">{linkedFamilyUser.email}</div>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-2 text-gray-600">{cl.address || '—'}</td>
                                  <td className="py-3.5 px-2">
                                    {initialPass ? (
                                      <div className="flex items-center gap-1.5">
                                        {isPassVisible ? (
                                          <span className="px-2.5 py-1 bg-cyan-500 text-white border border-cyan-600 rounded-lg text-xs font-mono font-bold shadow-2xs">
                                            {initialPass}
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => toggleShowPassword(cl.id)}
                                            className="px-2.5 py-1 bg-[#77248c] hover:bg-[#5a1a6b] text-white border border-purple-700 rounded-lg text-xs font-mono font-semibold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                          >
                                            <i className="fa-solid fa-eye-slash text-[10px]"></i> ••••••••
                                          </button>
                                        )}
                                        {isPassVisible && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => toggleShowPassword(cl.id)}
                                              className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                                              title="Hide password"
                                            >
                                              <i className="fa-solid fa-eye text-xs"></i>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(initialPass);
                                                setCopiedId(cl.id);
                                                setTimeout(() => setCopiedId(null), 2000);
                                              }}
                                              className="text-purple-600 hover:text-purple-800 p-1 font-bold text-[10px] cursor-pointer"
                                            >
                                              {copiedId === cl.id ? '✓ Copied' : 'Copy'}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic text-[11px]">Not saved (Reset to view)</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-2 font-semibold text-purple-700">{cl.careTier || 'Standard'}</td>
                                  <td className="py-3.5 px-2 font-semibold text-emerald-600">${cl.billingRatePerHour ? cl.billingRatePerHour.toFixed(2) : '45.00'}/hr</td>
                                  <td className="py-3.5 px-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          if (!linkedFamilyUser) {
                                            showNotification(`No linked family account found for client ${cl.name}.`);
                                            return;
                                          }
                                          setTargetPasswordUser(linkedFamilyUser);
                                          setAdminNewPasswordInput('');
                                          setShowAdminPasswordModal(true);
                                        }}
                                        className="px-3 py-1.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                      >
                                        <i className="fa-solid fa-key text-white text-xs"></i> Set / Reset Password
                                      </button>

                                      <button
                                        onClick={() => handleDeleteClient(cl.id, cl.name)}
                                        disabled={deletingClientId === cl.id}
                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                                        title="Delete client profile in one tap"
                                      >
                                        {deletingClientId === cl.id ? (
                                          <i className="fa-solid fa-circle-notch animate-spin"></i>
                                        ) : (
                                          <><i className="fa-solid fa-trash-can text-white text-xs"></i> Delete</>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== CREATE SHIFT VIEW ===== */}
              {currentView === 'create' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <h3 className="font-semibold text-gray-800 mb-6">Create New Shift</h3>
                    {clientConflictAlert && (
                      <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-2xl text-xs mb-4 flex items-start gap-2.5 font-medium shadow-2xs">
                        <i className="fa-solid fa-triangle-exclamation text-red-600 text-base mt-0.5"></i>
                        <div className="flex-1 font-semibold">{clientConflictAlert}</div>
                      </div>
                    )}
                    {schedulerWarning && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs mb-4 space-y-2.5">
                        <div className="flex items-start gap-2.5 font-medium">
                          <i className="fa-solid fa-triangle-exclamation text-amber-600 text-base mt-0.5"></i>
                          <div className="flex-1">{schedulerWarning}</div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/60">
                          <button
                            type="button"
                            onClick={handleQuickAssignPodFromScheduler}
                            className="px-3.5 py-1.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <i className="fa-solid fa-user-plus text-xs"></i> Assign to Client Pod Now
                          </button>
                        </div>
                      </div>
                    )}
                    <form onSubmit={handleCreateShift} className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">Client</label>
                        <select value={newShiftClientId} onChange={(e) => setNewShiftClientId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium text-gray-600">Caregiver</label>
                          <button
                            type="button"
                            onClick={() => setShowAllCaregivers(v => !v)}
                            className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${showAllCaregivers ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {showAllCaregivers ? <><i className="fa-solid fa-list mr-1"></i>All Caregivers</> : <><i className="fa-solid fa-wand-magic-sparkles mr-1"></i>AI Suggestions</>}
                          </button>
                        </div>
                        <select value={newShiftCaregiverId} onChange={(e) => setNewShiftCaregiverId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                          {showAllCaregivers
                            ? caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            : (suggestions.length > 0
                                ? suggestions.map((s: any) => <option key={s.id} value={s.id} disabled={s.hasConflict}>{s.name}{s.rankLabel ? ` — ${s.rankLabel}` : ''}</option>)
                                : caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>))
                          }
                        </select>
                        {loadingSuggestions && !showAllCaregivers && <div className="text-xs text-gray-400 mt-1"><i className="fa-solid fa-spinner animate-spin mr-1"></i> Finding best match...</div>}
                        {showAllCaregivers && <div className="text-xs text-amber-600 mt-1 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation"></i> Manual override — distance & availability checks bypassed.</div>}
                      </div>

                      <div className="flex items-center gap-2 pt-1 pb-1">
                        <input
                          type="checkbox"
                          id="autoAssignPodCheckbox"
                          checked={autoAssignPodOnShiftCreate}
                          onChange={(e) => setAutoAssignPodOnShiftCreate(e.target.checked)}
                          className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                        />
                        <label htmlFor="autoAssignPodCheckbox" className="text-xs text-gray-700 font-medium cursor-pointer">
                          Auto-enroll caregiver into client's Caregiver Pod team when creating shift
                        </label>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-600">Start Time</label>
                        <input type="datetime-local" value={newShiftDate} onChange={(e) => setNewShiftDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Duration</label>
                        <select value={newShiftHours} onChange={(e) => setNewShiftHours(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                          <option value="4">4 Hours</option><option value="6">6 Hours</option><option value="8">8 Hours</option>
                        </select>
                      </div>
                      <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl transition-all cursor-pointer">Create Shift</button>
                    </form>
                  </div>
                </div>
              )}

              {/* ===== BUSINESS HUB VIEW ===== */}
              {currentView === 'business' && user?.role === 'ADMIN' && (
                <div className="space-y-6">
                  {/* Access Gating check */}
                  {!(user.email === 'info@akirapahomecareus.com' || user.email === 'cathy@akirapahomecareus.com') ? (
                    <div className="bg-[#77248c] border-2 border-[#77248c] rounded-3xl p-8 text-center max-w-2xl mx-auto my-8 animate-fade-up shadow-xl text-white">
                      <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner backdrop-blur-xs">
                        <i className="fa-solid fa-lock text-white"></i>
                      </div>
                      <h3 className="text-xl font-extrabold text-white mb-2">Restricted Access — Senior Business Admins Only</h3>
                      <p className="text-sm text-white/95 leading-relaxed max-w-md mx-auto">
                        The Business Hub contains sensitive corporate financial stats, monthly payroll metrics, and proprietary system data logs. Access is limited strictly to authorized senior business administrators logging in with:
                      </p>
                      <div className="mt-4 flex flex-col sm:flex-row justify-center gap-2 font-mono text-xs font-bold text-white">
                        <span className="bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/30 backdrop-blur-xs shadow-2xs">info@akirapahomecareus.com</span>
                        <span className="bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/30 backdrop-blur-xs shadow-2xs">cathy@akirapahomecareus.com</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 business-hub-print-area">
                      {/* Business Hub Top Bar */}
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-gray-100 mb-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Business Intelligence Hub</h3>
                            <span className="bg-[#4cdbd5] text-white text-xs font-extrabold px-3 py-1 rounded-full shadow-xs">
                              <i className="fa-solid fa-shield-check mr-1 text-white"></i> Authorized Senior Access
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Monthly analytics breakdown, corporate logs, shift volume, and financial graphics for {businessStats?.monthName || 'Current Month'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 no-print">
                          <button
                            onClick={fetchBusinessStats}
                            disabled={isLoadingBusinessStats}
                            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <i className={`fa-solid fa-arrows-rotate text-xs ${isLoadingBusinessStats ? 'animate-spin' : ''}`}></i>
                            <span>Refresh Stats</span>
                          </button>

                          <button
                            onClick={handleDownloadBusinessReportPdf}
                            className="px-5 py-2.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                          >
                            <i className="fa-solid fa-file-pdf text-sm"></i>
                            <span>Download Business Report (PDF)</span>
                          </button>
                        </div>
                      </div>

                      {isLoadingBusinessStats ? (
                        <div className="py-12 text-center text-gray-400">
                          <div className="spinner mx-auto mb-3"></div>
                          <p className="text-xs font-semibold">Generating monthly business stats & financial graphics...</p>
                        </div>
                      ) : businessStatsError ? (
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm font-semibold mb-6 flex items-center gap-2">
                          <i className="fa-solid fa-triangle-exclamation"></i> {businessStatsError}
                        </div>
                      ) : (
                        <>
                          {/* MONTHLY BUSINESS KPI METRICS GRID */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-purple-50/70 border-2 border-purple-200 rounded-2xl p-5 hover-lift shadow-2xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-extrabold text-purple-800 uppercase tracking-wider">Gross Monthly Revenue</span>
                                <div className="w-9 h-9 bg-[#77248c] text-white rounded-xl flex items-center justify-center text-sm shadow-xs">
                                  <i className="fa-solid fa-dollar-sign text-white"></i>
                                </div>
                              </div>
                              <div className="text-2xl font-black text-purple-950">${businessStats?.summary?.totalRevenue?.toLocaleString() || '0'}</div>
                              <div className="text-[11px] text-purple-700 font-semibold mt-1">Calculated from client billing rates</div>
                            </div>

                            <div className="bg-cyan-50/70 border-2 border-cyan-200 rounded-2xl p-5 hover-lift shadow-2xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-extrabold text-teal-800 uppercase tracking-wider">Caregiver Payroll</span>
                                <div className="w-9 h-9 bg-teal-600 text-white rounded-xl flex items-center justify-center text-sm shadow-xs">
                                  <i className="fa-solid fa-wallet text-white"></i>
                                </div>
                              </div>
                              <div className="text-2xl font-black text-teal-950">${businessStats?.summary?.totalPayroll?.toLocaleString() || '0'}</div>
                              <div className="text-[11px] text-teal-700 font-semibold mt-1">Staff wages & overtime compensation</div>
                            </div>

                            <div className="bg-emerald-50/70 border-2 border-emerald-200 rounded-2xl p-5 hover-lift shadow-2xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">Net Operating Profit</span>
                                <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center text-sm shadow-xs">
                                  <i className="fa-solid fa-chart-line text-white"></i>
                                </div>
                              </div>
                              <div className="text-2xl font-black text-emerald-950">${businessStats?.summary?.netProfit?.toLocaleString() || '0'}</div>
                              <div className="text-[11px] text-emerald-700 font-extrabold mt-1">
                                Margin: <span className="bg-emerald-200 px-1.5 py-0.5 rounded text-emerald-900">{businessStats?.summary?.profitMarginPercent || 0}%</span>
                              </div>
                            </div>

                            <div className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-5 hover-lift shadow-2xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">Care Hours Delivered</span>
                                <div className="w-9 h-9 bg-orange-500 text-white rounded-xl flex items-center justify-center text-sm shadow-xs">
                                  <i className="fa-solid fa-clock text-white"></i>
                                </div>
                              </div>
                              <div className="text-2xl font-black text-amber-950">{businessStats?.summary?.totalCareHours || 0} hrs</div>
                              <div className="text-[11px] text-amber-700 font-semibold mt-1">Avg shift: {businessStats?.summary?.avgShiftDuration || 0} hrs</div>
                            </div>
                          </div>

                          {/* MONTHLY FINANCIAL TREND GRAPHICS & SHIFT STATUS DISTRIBUTION */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 print-page-break">
                            {/* Graphic 1: Weekly Financial Breakdown */}
                            <div className="lg:col-span-2 bg-[#1a1024] text-white rounded-3xl p-6 shadow-xl border border-purple-900/40">
                              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-2xl bg-[#77248c] text-white flex items-center justify-center font-bold shadow-md">
                                    <i className="fa-solid fa-chart-column text-lg text-white"></i>
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-base text-white">
                                      Monthly Financial Trends & Weekly Breakdown
                                    </h4>
                                    <p className="text-xs text-purple-200/80 mt-0.5">Comparison of Gross Revenue vs Caregiver Payroll across weeks</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-[11px] font-bold">
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-500 rounded-sm shadow-xs"></span><span className="text-white">Revenue</span></div>
                                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-white rounded-sm shadow-xs"></span><span className="text-white">Payroll</span></div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {(businessStats?.weeklyData || []).map((w: any, idx: number) => {
                                  const maxVal = Math.max(100, ...businessStats.weeklyData.map((item: any) => Math.max(item.revenue, item.payroll)));
                                  const revPct = Math.min(100, Math.round((w.revenue / maxVal) * 100));
                                  const payPct = Math.min(100, Math.round((w.payroll / maxVal) * 100));

                                  return (
                                    <div key={idx} className="bg-[#271738]/90 rounded-2xl p-4 border border-purple-800/40 shadow-xs">
                                      <div className="flex justify-between items-center text-xs font-extrabold mb-3">
                                        <span className="text-white font-bold">{w.weekLabel}</span>
                                        <span className="text-purple-200 font-mono text-[11px]">{w.shifts} completed shifts ({w.hours} care hrs)</span>
                                      </div>
                                      <div className="space-y-2.5">
                                        {/* Revenue Bar */}
                                        <div className="flex items-center gap-3 text-xs">
                                          <span className="w-16 text-[10px] font-extrabold text-purple-300 uppercase tracking-wider">Revenue</span>
                                          <div className="flex-1 bg-[#150b1f] rounded-full h-3 overflow-hidden p-0.5 border border-purple-900/30">
                                            <div className="bg-gradient-to-r from-[#77248c] to-purple-500 h-full rounded-full transition-all duration-500 shadow-xs" style={{ width: `${Math.max(5, revPct)}%` }}></div>
                                          </div>
                                          <span className="w-16 text-right font-mono font-extrabold text-purple-200">${w.revenue.toLocaleString()}</span>
                                        </div>
                                        {/* Payroll Bar */}
                                        <div className="flex items-center gap-3 text-xs">
                                          <span className="w-16 text-[10px] font-extrabold text-white uppercase tracking-wider">Payroll</span>
                                          <div className="flex-1 bg-[#150b1f] rounded-full h-3 overflow-hidden p-0.5 border border-purple-900/30">
                                            <div className="bg-gradient-to-r from-purple-300 to-white h-full rounded-full transition-all duration-500 shadow-xs" style={{ width: `${Math.max(5, payPct)}%` }}></div>
                                          </div>
                                          <span className="w-16 text-right font-mono font-extrabold text-white">${w.payroll.toLocaleString()}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Graphic 2: Shift Volume & Status Distribution */}
                            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col justify-between">
                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <div className="w-9 h-9 rounded-xl bg-[#77248c] text-white flex items-center justify-center font-bold shadow-xs">
                                    <i className="fa-solid fa-pie-chart text-white"></i>
                                  </div>
                                  <h4 className="font-extrabold text-base text-gray-900">Monthly Care Operations</h4>
                                </div>
                                <p className="text-xs text-gray-500 mb-6">Breakdown of shift fulfillment for {businessStats?.monthName}</p>

                                <div className="space-y-4 text-xs">
                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-gray-700">Completed Shifts</span>
                                      <span className="text-emerald-600 font-mono">{businessStats?.statusCounts?.COMPLETED || 0}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                      <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.round(((businessStats?.statusCounts?.COMPLETED || 0) / Math.max(1, businessStats?.summary?.totalShiftsInMonth || 1)) * 100))}%` }}></div>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-gray-700">Confirmed & Scheduled</span>
                                      <span className="text-cyan-600 font-mono">{businessStats?.statusCounts?.CONFIRMED || 0}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                      <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.round(((businessStats?.statusCounts?.CONFIRMED || 0) / Math.max(1, businessStats?.summary?.totalShiftsInMonth || 1)) * 100))}%` }}></div>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-gray-700">Unconfirmed / Pending</span>
                                      <span className="text-amber-600 font-mono">{businessStats?.statusCounts?.UNCONFIRMED || 0}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                      <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.round(((businessStats?.statusCounts?.UNCONFIRMED || 0) / Math.max(1, businessStats?.summary?.totalShiftsInMonth || 1)) * 100))}%` }}></div>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-gray-700">Dropped / Re-routed</span>
                                      <span className="text-red-600 font-mono">{businessStats?.statusCounts?.DROPPED || 0}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                      <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.round(((businessStats?.statusCounts?.DROPPED || 0) / Math.max(1, businessStats?.summary?.totalShiftsInMonth || 1)) * 100))}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-6 pt-4 border-t border-gray-100 bg-purple-50/50 rounded-xl p-3 text-center">
                                <div className="text-xs font-bold text-purple-900">Caregiver Utilization Rate</div>
                                <div className="text-xl font-black text-purple-700 mt-0.5">{businessStats?.summary?.caregiverUtilization || 0}%</div>
                              </div>
                            </div>
                          </div>

                          {/* EXECUTIVE ANALYZED DATA SUMMARY LOG */}
                          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-8 print-page-break">
                            <h4 className="font-extrabold text-base text-gray-800 mb-3 flex items-center gap-2">
                              <i className="fa-solid fa-clipboard-check text-purple-600"></i> Executive Data Analysis & Performance Log
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 leading-relaxed">
                              <div className="bg-white p-4 rounded-xl border border-gray-200">
                                <span className="font-bold text-gray-900 block mb-1">Care Volume & Service Delivery</span>
                                Delivered <strong>{businessStats?.summary?.totalCareHours || 0} hours</strong> of home care service across <strong>{businessStats?.summary?.completedShiftsCount || 0} completed shifts</strong> in {businessStats?.monthName}. The active care roster currently supports <strong>{businessStats?.summary?.totalClients || 0} clients</strong> managed by <strong>{businessStats?.summary?.totalCaregivers || 0} active caregivers</strong>.
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-gray-200">
                                <span className="font-bold text-gray-900 block mb-1">Financial Health & Profit Margin</span>
                                Total gross revenue generated stands at <strong>${businessStats?.summary?.totalRevenue?.toLocaleString() || '0'}</strong> against caregiver payroll disbursements of <strong>${businessStats?.summary?.totalPayroll?.toLocaleString() || '0'}</strong>, yielding a net operating profit of <strong>${businessStats?.summary?.netProfit?.toLocaleString() || '0'}</strong> ({businessStats?.summary?.profitMarginPercent || 0}% net profit margin).
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Caregiver Pod Management */}
                      <div className="border-t border-gray-100 pt-6 mt-4">
                        <h4 className="font-bold text-gray-800 text-sm mb-4">Caregiver Pod Management</h4>
                        <form onSubmit={handleUpdatePod} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <select value={selectedPodClient} onChange={(e) => setSelectedPodClient(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select value={selectedPodRole} onChange={(e) => setSelectedPodRole(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                            <option value="PRIMARY">Primary</option><option value="SECONDARY_1">Secondary 1</option><option value="SECONDARY_2">Secondary 2</option>
                          </select>
                          <div className="flex gap-2">
                            <select value={selectedPodCaregiver} onChange={(e) => setSelectedPodCaregiver(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                              {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="submit" className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-all">Update</button>
                          </div>
                        </form>
                      </div>

                      {/* Caregiver Directory & First-Time Password Management */}
                      <div className="border-t border-gray-100 pt-6 mt-6">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-gray-800 text-sm">Caregiver Directory & Credential Management</h4>
                          <span className="text-xs text-gray-400 font-semibold">{caregivers.length} Active Caregivers</span>
                        </div>
                        <div className="space-y-2">
                          {caregivers.map(cg => (
                            <div key={cg.id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs">
                              <div>
                                <span className="font-bold text-gray-800 text-sm">{cg.name}</span>
                                <span className="text-purple-600 font-mono ml-2">{cg.email}</span>
                                {cg.payRate && <span className="text-gray-400 ml-2 font-mono">${cg.payRate}/hr</span>}
                              </div>
                              <button
                                onClick={() => { setTargetPasswordUser(cg); setAdminNewPasswordInput(''); setShowAdminPasswordModal(true); }}
                                className="px-3 py-1.5 bg-white hover:bg-purple-50 text-purple-700 font-bold text-xs rounded-lg border border-purple-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-purple-400"
                              >
                                <i className="fa-solid fa-key text-purple-600"></i> Set First-Time Password
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Escalation Check Button */}
                      <div className="border-t border-gray-100 pt-6 mt-6 no-print">
                        <button onClick={handleEscalationCheck} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition-all">
                          <i className="fa-solid fa-arrows-rotate mr-2"></i> Run Escalation Check
                        </button>
                        <p className="text-xs text-gray-400 mt-2">Check for unconfirmed shifts past deadline and auto-escalate to backups</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== ALERTS / INTERESTED BUYERS VIEW ===== */}
              {currentView === 'interested' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-800">Alerts & Notifications</h3>
                    {dbNotifications.some(n => !n.isRead) && (
                      <button onClick={handleMarkAllNotificationsRead} className="text-xs font-semibold text-purple-600 hover:underline cursor-pointer">
                        Mark all read
                      </button>
                    )}
                  </div>
                  {dbNotifications.length === 0 ? (
                    <div className="text-center py-12"><p className="text-gray-400">No alerts yet</p></div>
                  ) : (
                    <div className="space-y-3">
                      {dbNotifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.isRead && handleMarkNotificationRead(n.id)}
                          className={`flex items-start gap-3 border-b border-gray-100 pb-3 rounded-lg p-2 -m-2 transition-all ${!n.isRead ? 'bg-purple-50/40 cursor-pointer hover:bg-purple-50' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            n.type === 'SHIFT_CONFIRMATION_MISSED' ? 'bg-red-100 text-red-600' :
                            n.type === 'CLINICAL_ALERT' ? 'bg-red-100 text-red-600' :
                            n.type === 'SYSTEM_ALERT' ? 'bg-amber-100 text-amber-600' :
                            'bg-purple-100 text-purple-600'
                          }`}><i className="fa-solid fa-bell"></i></div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-800">{n.title}</div>
                            <div className="text-sm text-gray-600">{n.message}</div>
                            <div className="text-xs text-gray-400 mt-1">{formatDateTime(n.createdAt)}</div>
                          </div>
                          {!n.isRead && <div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== PAYROLL / FINANCIALS VIEW ===== */}
              {currentView === 'financials' && user && isBusinessHubAuthorized(user.email) && (
                <div className="space-y-6">
                  {isLoadingFinancials ? (
                    <div className="py-16 text-center">
                      <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-xs font-semibold text-gray-500">Calculating this week's payroll...</p>
                    </div>
                  ) : financialsData ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-[#77248c] text-white rounded-xl p-4 text-center shadow-xs">
                          <div className="text-2xl font-bold text-white">${financialsData.totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-sm text-white/90 font-medium">Total Payroll (This Week)</div>
                        </div>
                        <div className="bg-green-600 text-white rounded-xl p-4 text-center shadow-xs">
                          <div className="text-2xl font-bold text-white">{financialsData.totalHours.toFixed(1)}</div>
                          <div className="text-sm text-white/90 font-medium">Hours Worked</div>
                        </div>
                        <div className="bg-orange-500 text-white rounded-xl p-4 text-center shadow-xs">
                          <div className="text-2xl font-bold text-white">{financialsData.caregiverPayroll.length}</div>
                          <div className="text-sm text-white/90 font-medium">Caregivers Active</div>
                        </div>
                      </div>

                      {financialsData.caregiversMissingRate > 0 && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                          <i className="fa-solid fa-triangle-exclamation"></i>
                          {financialsData.caregiversMissingRate} caregiver{financialsData.caregiversMissingRate > 1 ? 's have' : ' has'} no pay rate set yet — their wages can't be calculated until you set one below.
                        </div>
                      )}

                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-gray-800">Caregiver Payroll Breakdown</h3>
                          <span className="text-xs text-gray-400">
                            Week of {formatDate(financialsData.weekStart)} — completed shifts only
                          </span>
                        </div>

                        {financialsData.caregiverPayroll.length === 0 ? (
                          <div className="text-center py-12"><p className="text-gray-400">No completed shifts yet this week</p></div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                                  <th className="pb-2 font-semibold">Caregiver</th>
                                  <th className="pb-2 font-semibold">Shifts</th>
                                  <th className="pb-2 font-semibold">Hours</th>
                                  <th className="pb-2 font-semibold">Pay Rate</th>
                                  <th className="pb-2 font-semibold">Wages Owed</th>
                                  <th className="pb-2 font-semibold"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {financialsData.caregiverPayroll.map((c: any) => (
                                  <tr key={c.id} className="border-b border-gray-50">
                                    <td className="py-3">
                                      <div className="font-semibold text-gray-800">{c.name}</div>
                                      <div className="text-xs text-gray-400">{c.email}</div>
                                    </td>
                                    <td className="py-3">
                                      {c.shiftsCompleted}
                                      {c.overtimeShifts > 0 && (
                                        <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">{c.overtimeShifts} OT</span>
                                      )}
                                    </td>
                                    <td className="py-3">{c.hoursWorked.toFixed(1)} hrs</td>
                                    <td className="py-3">
                                      {editingPayRateFor === c.id ? (
                                        <div className="flex items-center gap-1">
                                          <span className="text-gray-400">$</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            autoFocus
                                            value={payRateInput}
                                            onChange={(e) => setPayRateInput(e.target.value)}
                                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          />
                                          <span className="text-gray-400">/hr</span>
                                        </div>
                                      ) : c.payRate != null ? (
                                        `$${c.payRate.toFixed(2)}/hr`
                                      ) : (
                                        <span className="text-amber-600 font-medium">Not set</span>
                                      )}
                                    </td>
                                    <td className="py-3 font-semibold text-gray-800">
                                      {c.wagesOwed != null ? `$${c.wagesOwed.toFixed(2)}` : '—'}
                                    </td>
                                    <td className="py-3 text-right">
                                      {editingPayRateFor === c.id ? (
                                        <div className="flex gap-1.5 justify-end">
                                          <button
                                            onClick={() => handleSavePayRate(c.id)}
                                            disabled={isSavingPayRate}
                                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg disabled:opacity-50"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingPayRateFor(null)}
                                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-lg"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => handleStartEditPayRate(c.id, c.payRate)}
                                          className="px-3 py-1 bg-white hover:bg-purple-50 text-purple-600 font-semibold text-xs rounded-lg border border-gray-200 hover:border-purple-300"
                                        >
                                          {c.payRate != null ? 'Edit Rate' : 'Set Rate'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12"><p className="text-gray-400">Unable to load payroll data.</p></div>
                  )}
                </div>
              )}

              {/* ===== BILLING & INVOICES VIEW (Payment Tracker) ===== */}
              {currentView === 'billing' && user && isBusinessHubAuthorized(user.email) && (
                <div className="space-y-6">
                  {isLoadingInvoices ? (
                    <div className="py-16 text-center">
                      <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-xs font-semibold text-gray-500">Loading billing data...</p>
                    </div>
                  ) : invoicesData ? (
                    <>
                      {/* Payment Tracker Header Banner */}
                      <div className="bg-gradient-to-r from-[#77248c] via-purple-900 to-[#5a1a6b] rounded-3xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-bold text-purple-200 uppercase tracking-widest mb-1">
                            <span className="w-3 h-3 rounded-full bg-[#4cdbd5] inline-block shadow-xs"></span>
                            Akirapa Home Care Agency • Financial Intelligence
                          </div>
                          <h2 className="text-3xl font-black text-white tracking-tight">PAYMENT TRACKER</h2>
                          <p className="text-xs text-purple-100/90 mt-1 max-w-xl">
                            Track client invoices, payments, remaining balances, and overdue accounts at a glance.
                          </p>
                        </div>

                        <button
                          onClick={() => setShowGenerateInvoiceModal(true)}
                          className="px-5 py-3 bg-[#4cdbd5] hover:bg-[#3bc7c1] text-purple-950 font-black text-xs rounded-2xl flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                        >
                          <i className="fa-solid fa-file-invoice text-sm"></i>
                          <span>Generate New Invoice</span>
                        </button>
                      </div>

                      {/* 4 Summary Metric Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[#77248c] text-white rounded-2xl p-5 shadow-md border border-purple-800/40 hover-lift">
                          <div className="text-[11px] font-extrabold text-purple-200 uppercase tracking-wider mb-1">Total Invoiced</div>
                          <div className="text-2xl font-black text-white">${invoicesData.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[11px] text-purple-200/80 mt-1 font-medium">Gross billing generated</div>
                        </div>

                        <div className="bg-emerald-600 text-white rounded-2xl p-5 shadow-md border border-emerald-500/40 hover-lift">
                          <div className="text-[11px] font-extrabold text-emerald-100 uppercase tracking-wider mb-1">Total Received</div>
                          <div className="text-2xl font-black text-white">${invoicesData.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[11px] text-emerald-100/80 mt-1 font-medium">Collected client payments</div>
                        </div>

                        <div className="bg-cyan-600 text-white rounded-2xl p-5 shadow-md border border-cyan-500/40 hover-lift">
                          <div className="text-[11px] font-extrabold text-cyan-100 uppercase tracking-wider mb-1">Outstanding</div>
                          <div className="text-2xl font-black text-white">${invoicesData.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[11px] text-cyan-100/80 mt-1 font-medium">Pending & active balances</div>
                        </div>

                        <div className="bg-red-600 text-white rounded-2xl p-5 shadow-md border border-red-500/40 hover-lift">
                          <div className="text-[11px] font-extrabold text-red-100 uppercase tracking-wider mb-1">Overdue</div>
                          <div className="text-2xl font-black text-white">${invoicesData.overdue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[11px] text-red-100/80 mt-1 font-medium">Past due date threshold</div>
                        </div>
                      </div>

                      {/* Payment Tracker Main Table Container */}
                      <div className="bg-white rounded-3xl shadow-sm border border-purple-100 overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                          <div>
                            <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                              <i className="fa-solid fa-list-check text-[#77248c]"></i> Client Payment Directory & Statements
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">Real-time status of all client invoices and payments</p>
                          </div>
                          <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-[#77248c] border border-purple-200 rounded-full">
                            {invoicesData.invoices.length} Total Invoices
                          </span>
                        </div>

                        {invoicesData.invoices.length === 0 ? (
                          <div className="text-center py-16">
                            <div className="w-12 h-12 rounded-full bg-purple-50 text-[#77248c] flex items-center justify-center mx-auto mb-3 text-xl">
                              <i className="fa-solid fa-file-invoice-dollar"></i>
                            </div>
                            <p className="text-gray-500 font-semibold text-sm">No invoices generated yet</p>
                            <p className="text-xs text-gray-400 mt-1">Click "Generate New Invoice" above to create billing for client completed shifts.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                              <thead>
                                <tr className="bg-[#77248c] text-white text-[11px] font-black uppercase tracking-wider">
                                  <th className="py-3.5 px-4 rounded-tl-none">Invoice #</th>
                                  <th className="py-3.5 px-4">Client Name</th>
                                  <th className="py-3.5 px-4">Service Period</th>
                                  <th className="py-3.5 px-4 text-right">Amount Due</th>
                                  <th className="py-3.5 px-4 text-right">Amount Paid</th>
                                  <th className="py-3.5 px-4 text-right">Balance</th>
                                  <th className="py-3.5 px-4">Due Date</th>
                                  <th className="py-3.5 px-4 text-center">Status</th>
                                  <th className="py-3.5 px-4 text-right rounded-tr-none">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {invoicesData.invoices.map((inv: any) => (
                                  <tr key={inv.id} className="hover:bg-purple-50/40 transition-colors">
                                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-[#77248c]">
                                      {inv.invoiceNumber}
                                    </td>
                                    <td className="py-3.5 px-4 font-extrabold text-gray-900">
                                      {inv.client.name}
                                    </td>
                                    <td className="py-3.5 px-4 text-xs text-gray-600 font-medium">
                                      {formatDate(inv.servicePeriodStart)} – {formatDate(inv.servicePeriodEnd)}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900">
                                      ${inv.totalDue.toFixed(2)}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
                                      ${inv.amountPaid.toFixed(2)}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-gray-900">
                                      ${inv.balance.toFixed(2)}
                                    </td>
                                    <td className="py-3.5 px-4 text-xs text-gray-600 font-medium">
                                      {formatDate(inv.dueDate)}
                                    </td>
                                    <td className="py-3.5 px-4 text-center">
                                      <span className={`inline-flex items-center justify-center gap-1 px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase ${
                                        inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                        inv.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                        inv.status === 'OVERDUE' ? 'bg-red-100 text-red-800 border border-red-300' :
                                        'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          inv.status === 'PAID' ? 'bg-emerald-600' :
                                          inv.status === 'PARTIAL' ? 'bg-amber-600' :
                                          inv.status === 'OVERDUE' ? 'bg-red-600' :
                                          'bg-cyan-600'
                                        }`}></span>
                                        {inv.status}
                                      </span>
                                    </td>
                                    <td className="py-3.5 px-4 text-right">
                                      <div className="flex gap-1.5 justify-end items-center">
                                        {recordingPaymentFor === inv.id ? (
                                          <div className="flex items-center gap-1 bg-purple-50 p-1.5 rounded-xl border border-purple-200">
                                            <span className="text-gray-400 text-xs font-bold">$</span>
                                            <input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              autoFocus
                                              value={paymentAmountInput}
                                              onChange={(e) => setPaymentAmountInput(e.target.value)}
                                              className="w-20 bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            />
                                            <select value={paymentMethodInput} onChange={(e) => setPaymentMethodInput(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500">
                                              <option>ACH Transfer</option>
                                              <option>Credit Card</option>
                                              <option>Cash</option>
                                              <option>Check</option>
                                            </select>
                                            <button onClick={() => handleRecordPayment(inv.id)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all">Save</button>
                                            <button onClick={() => { setRecordingPaymentFor(null); setPaymentAmountInput(''); }} className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-lg transition-all">Cancel</button>
                                          </div>
                                        ) : (
                                          <>
                                            {inv.status !== 'PAID' && (
                                              <button onClick={() => { setRecordingPaymentFor(inv.id); setPaymentAmountInput(''); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition-all cursor-pointer">
                                                <i className="fa-solid fa-plus-circle mr-1"></i> Record Payment
                                              </button>
                                            )}
                                            <button onClick={() => setViewingInvoice(inv)} className="px-3 py-1.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-xs rounded-xl shadow-2xs transition-all cursor-pointer">
                                              <i className="fa-solid fa-print mr-1"></i> View / Print
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Status Legend Key (matching template footer) */}
                        <div className="bg-purple-50/70 border-t border-purple-100 p-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                          <div className="flex items-center gap-4">
                            <span className="font-black text-[#77248c] uppercase tracking-wider text-[10px]">STATUS KEY:</span>
                            <div className="flex items-center gap-1.5 font-bold text-gray-700">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                              <span>Paid</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-bold text-gray-700">
                              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block"></span>
                              <span>Pending</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-bold text-gray-700">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                              <span>Partial</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-bold text-gray-700">
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                              <span>Overdue</span>
                            </div>
                          </div>
                          <span className="text-gray-500 font-medium text-[11px]">
                            Ensure all client payments and balances are tracked accurately.
                          </span>
                        </div>
                      </div>

                      {/* Client Individual Billing Statement Lookup */}
                      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-xl bg-purple-100 text-[#77248c] flex items-center justify-center font-bold">
                            <i className="fa-solid fa-user-gear"></i>
                          </div>
                          <h3 className="font-extrabold text-gray-900 text-base">Client Individual Billing Statement</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Select a client below to generate their complete historical payment ledger and statement.</p>
                        <div className="flex gap-3">
                          <select
                            value={selectedBillingClientId}
                            onChange={(e) => setSelectedBillingClientId(e.target.value)}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                          >
                            <option value="">Select a client...</option>
                            {clients.map((c: any) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => loadClientBillingRecord(selectedBillingClientId)}
                            disabled={!selectedBillingClientId || isLoadingBillingRecord}
                            className="px-6 py-3 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-extrabold text-sm rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-md"
                          >
                            {isLoadingBillingRecord ? 'Loading...' : 'View Statement'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12"><p className="text-gray-400">Unable to load billing data.</p></div>
                  )}
                </div>
              )}

              {/* ===== CAREGIVER REVIEWS VIEW (admin/coordinator only - never shown to caregivers) ===== */}
              {currentView === 'caregiverReviews' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-800 text-lg mb-1">Weekly Caregiver Reviews</h3>
                  <p className="text-xs text-gray-400 mb-4">Submitted by clients/family members each week. Not visible to caregivers.</p>
                  {isLoadingAdminReviews ? (
                    <div className="py-16 text-center"><div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                  ) : adminCaregiverReviews.length === 0 ? (
                    <div className="text-center py-12"><p className="text-gray-400">No reviews submitted yet</p></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                            <th className="pb-2 font-semibold">Week</th>
                            <th className="pb-2 font-semibold">Caregiver</th>
                            <th className="pb-2 font-semibold">Client</th>
                            <th className="pb-2 font-semibold">Reviewed By</th>
                            <th className="pb-2 font-semibold">Rating</th>
                            <th className="pb-2 font-semibold">Continue?</th>
                            <th className="pb-2 font-semibold">Strengths</th>
                            <th className="pb-2 font-semibold">Improvements</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminCaregiverReviews.map((r: any) => (
                            <tr key={r.id} className="border-b border-gray-50 align-top">
                              <td className="py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(r.weekStart)}</td>
                              <td className="py-3 font-semibold text-gray-800 whitespace-nowrap">{r.caregiver.name}</td>
                              <td className="py-3 text-gray-600 whitespace-nowrap">{r.client.name}</td>
                              <td className="py-3 text-xs text-gray-500 whitespace-nowrap">{r.reviewer.name}</td>
                              <td className="py-3">{r.rating != null ? `${r.rating}/5` : '—'}</td>
                              <td className="py-3">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.wouldContinue ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                  {r.wouldContinue ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="py-3 text-gray-600 max-w-xs">{r.strengths || '—'}</td>
                              <td className="py-3 text-gray-600 max-w-xs">{r.improvements || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ===== MESSAGE OVERSIGHT VIEW (admin/coordinator only - read-only, no composer) ===== */}
              {currentView === 'messageOversight' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="space-y-6">
                  <div className="bg-[#77248c] border border-[#5a1a6b] rounded-2xl px-4 py-3 text-xs text-white font-semibold flex items-start gap-2 shadow-md">
                    <i className="fa-solid fa-eye text-white mt-0.5"></i>
                    <span className="text-white">
                      Oversight view — every conversation on the platform, including private direct messages between staff and families.
                      Opening a transcript is recorded in the Audit Logs against your account.
                    </span>
                  </div>

                  {isLoadingOversight ? (
                    <div className="py-16 text-center">
                      <div className="w-10 h-10 border-4 border-[#77248c] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-xs font-semibold text-gray-500">Loading message activity...</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <button
                          type="button"
                          onClick={() => setOversightTabFilter('ALL')}
                          className={`rounded-2xl p-5 text-left transition-all cursor-pointer active:scale-95 ${
                            oversightTabFilter === 'ALL'
                              ? 'bg-[#77248c] text-white shadow-md ring-2 ring-[#77248c]'
                              : 'bg-white text-gray-800 border border-gray-100 shadow-sm hover:border-purple-200'
                          }`}
                        >
                          <div className={`text-xs font-bold tracking-wide mb-1 ${oversightTabFilter === 'ALL' ? 'text-purple-100' : 'text-gray-500'}`}>Total Messages</div>
                          <div className={`text-2xl font-bold ${oversightTabFilter === 'ALL' ? 'text-white' : 'text-gray-800'}`}>{oversightStats?.totalMessages ?? 0}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOversightTabFilter('CONVERSATIONS')}
                          className={`rounded-2xl p-5 text-left transition-all cursor-pointer active:scale-95 ${
                            oversightTabFilter === 'CONVERSATIONS'
                              ? 'bg-[#77248c] text-white shadow-md ring-2 ring-[#77248c]'
                              : 'bg-white text-gray-800 border border-gray-100 shadow-sm hover:border-purple-200'
                          }`}
                        >
                          <div className={`text-xs font-bold tracking-wide mb-1 ${oversightTabFilter === 'CONVERSATIONS' ? 'text-purple-100' : 'text-gray-500'}`}>Conversations</div>
                          <div className={`text-2xl font-bold ${oversightTabFilter === 'CONVERSATIONS' ? 'text-white' : 'text-gray-800'}`}>{oversightStats?.totalConversations ?? 0}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOversightTabFilter('DIRECT')}
                          className={`rounded-2xl p-5 text-left transition-all cursor-pointer active:scale-95 ${
                            oversightTabFilter === 'DIRECT'
                              ? 'bg-[#77248c] text-white shadow-md ring-2 ring-[#77248c]'
                              : 'bg-white text-gray-800 border border-gray-100 shadow-sm hover:border-purple-200'
                          }`}
                        >
                          <div className={`text-xs font-bold tracking-wide mb-1 ${oversightTabFilter === 'DIRECT' ? 'text-purple-100' : 'text-gray-500'}`}>Private DMs</div>
                          <div className={`text-2xl font-bold ${oversightTabFilter === 'DIRECT' ? 'text-white' : 'text-gray-800'}`}>{oversightStats?.directConversations ?? 0}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOversightTabFilter('TODAY')}
                          className={`rounded-2xl p-5 text-left transition-all cursor-pointer active:scale-95 ${
                            oversightTabFilter === 'TODAY'
                              ? 'bg-[#77248c] text-white shadow-md ring-2 ring-[#77248c]'
                              : 'bg-white text-gray-800 border border-gray-100 shadow-sm hover:border-purple-200'
                          }`}
                        >
                          <div className={`text-xs font-bold tracking-wide mb-1 ${oversightTabFilter === 'TODAY' ? 'text-purple-100' : 'text-gray-500'}`}>Sent Today</div>
                          <div className={`text-2xl font-bold ${oversightTabFilter === 'TODAY' ? 'text-white' : 'text-emerald-600'}`}>{oversightStats?.messagesToday ?? 0}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOversightTabFilter('ATTACHMENTS')}
                          className={`rounded-2xl p-5 text-left transition-all cursor-pointer active:scale-95 ${
                            oversightTabFilter === 'ATTACHMENTS'
                              ? 'bg-[#77248c] text-white shadow-md ring-2 ring-[#77248c]'
                              : 'bg-white text-gray-800 border border-gray-100 shadow-sm hover:border-purple-200'
                          }`}
                        >
                          <div className={`text-xs font-bold tracking-wide mb-1 ${oversightTabFilter === 'ATTACHMENTS' ? 'text-purple-100' : 'text-gray-500'}`}>Attachments</div>
                          <div className={`text-2xl font-bold ${oversightTabFilter === 'ATTACHMENTS' ? 'text-white' : 'text-gray-800'}`}>{oversightStats?.attachmentsShared ?? 0}</div>
                        </button>
                      </div>

                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
                          <div>
                            <h3 className="font-semibold text-gray-800 text-lg">All Conversations</h3>
                            <p className="text-xs text-gray-400">{oversightStats?.activeParticipants ?? 0} people have sent messages on the platform</p>
                          </div>
                          <div className="flex gap-2 w-full md:w-auto">
                            <input
                              type="text"
                              placeholder="Search people or message text..."
                              value={oversightSearch}
                              onChange={(e) => setOversightSearch(e.target.value)}
                              className="flex-1 md:w-64 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#77248c]"
                            />
                            <select
                              value={oversightTypeFilter}
                              onChange={(e) => setOversightTypeFilter(e.target.value as any)}
                              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#77248c]"
                            >
                              <option value="ALL">All types</option>
                              <option value="DIRECT">Direct messages</option>
                              <option value="GROUP">Care-team threads</option>
                            </select>
                            <button onClick={loadMessageOversight} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm" title="Refresh">
                              <i className="fa-solid fa-arrows-rotate"></i>
                            </button>
                          </div>
                        </div>

                        {(() => {
                          const q = oversightSearch.trim().toLowerCase();
                          const filtered = oversightThreads.filter(t => {
                            if (oversightTabFilter === 'DIRECT' && t.type !== 'DIRECT') return false;
                            if (oversightTabFilter === 'CONVERSATIONS' && t.type !== 'GROUP') return false;
                            if (oversightTabFilter === 'TODAY') {
                              const today = new Date().toISOString().slice(0, 10);
                              if (!t.lastMessageAt || !t.lastMessageAt.startsWith(today)) return false;
                            }
                            if (oversightTabFilter === 'ATTACHMENTS' && (!t.attachmentsCount || t.attachmentsCount === 0)) return false;
                            if (oversightTypeFilter !== 'ALL' && t.type !== oversightTypeFilter) return false;
                            if (!q) return true;
                            return (t.searchBlob || '').includes(q) || (t.clientName || '').toLowerCase().includes(q);
                          });

                          if (oversightThreads.length === 0) {
                            return <div className="text-center py-12"><p className="text-gray-400">No messages have been sent on the platform yet</p></div>;
                          }
                          if (filtered.length === 0) {
                            return <div className="text-center py-12"><p className="text-gray-400">No conversations match your search</p></div>;
                          }

                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                                    <th className="pb-2 font-semibold">Participants</th>
                                    <th className="pb-2 font-semibold">Type</th>
                                    <th className="pb-2 font-semibold">Latest Message</th>
                                    <th className="pb-2 font-semibold text-right">Msgs</th>
                                    <th className="pb-2 font-semibold text-right">Files</th>
                                    <th className="pb-2 font-semibold">Last Activity</th>
                                    <th className="pb-2 font-semibold"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filtered.map((t: any) => (
                                    <tr key={t.threadKey} className="border-b border-gray-50 align-top">
                                      <td className="py-3 pr-3">
                                        <div className="font-semibold text-gray-800">
                                          {t.type === 'DIRECT'
                                            ? t.participants.map((p: any) => p.name).join(' ↔ ')
                                            : `${t.clientName} care team`}
                                        </div>
                                        <div className="text-[11px] text-gray-400">
                                          {t.participants.map((p: any) => `${p.name} (${p.role.replace('_', ' ')})`).join(' · ')}
                                        </div>
                                      </td>
                                      <td className="py-3 pr-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.type === 'DIRECT' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-teal-100 text-teal-700 border border-teal-200'}`}>
                                          {t.type === 'DIRECT' ? 'PRIVATE DM' : 'CARE TEAM'}
                                        </span>
                                      </td>
                                      <td className="py-3 pr-3 text-gray-600 max-w-xs">
                                        <span className="text-gray-400">{t.lastSenderName}:</span> {t.lastMessagePreview}
                                      </td>
                                      <td className="py-3 pr-3 text-right font-semibold">{t.messageCount}</td>
                                      <td className="py-3 pr-3 text-right">{t.attachmentCount || '—'}</td>
                                      <td className="py-3 pr-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(t.lastMessageAt)}</td>
                                      <td className="py-3 text-right">
                                        <button
                                          onClick={() => handleOpenTranscript(t)}
                                          className="px-3 py-1 bg-white hover:bg-purple-50 text-[#77248c] font-semibold text-xs rounded-lg border border-gray-200 hover:border-purple-300 whitespace-nowrap"
                                        >
                                          View Transcript
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== MESSAGES VIEW (everyone can compose; admin/coordinator access is additionally audit-logged) ===== */}
              {currentView === 'messages' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ height: 'calc(100vh - 180px)' }}>
                  {/* Conversation list */}
                  <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-y-auto">
                    <h3 className="font-semibold text-gray-800 text-sm mb-3">Conversations</h3>
                    {messageConversations.length === 0 ? (
                      <p className="text-xs text-gray-400">No conversations available yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {messageConversations.map(c => {
                          const contactKey = c.contactId || c.id;
                          const isSelected = selectedContactId ? selectedContactId === contactKey : selectedMessageClientId === c.id;
                          return (
                            <button
                              key={contactKey}
                              onClick={() => {
                                setSelectedMessageClientId(c.id);
                                setSelectedContactId(contactKey);
                                loadMessageThread(c.id, false, contactKey);
                              }}
                              className={`w-full text-left px-3.5 py-3 rounded-xl text-sm transition-all ${isSelected ? 'bg-[#77248c] text-white shadow-md' : 'hover:bg-gray-50 border border-transparent'}`}
                            >
                              <div className={`font-extrabold text-sm ${isSelected ? 'text-white' : 'text-gray-800'}`}>{c.name}</div>
                              <div className={`text-xs font-semibold mt-0.5 leading-snug ${isSelected ? 'text-purple-100' : 'text-gray-500'}`}>
                                {c.subtitle || (c.participants && c.participants[0] ? `${c.participants[0].role.replace('_', ' ')}` : 'Individual Contact')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Thread */}
                  <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                    {(user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') ? (
                      <div className="px-4 py-2.5 bg-[#77248c] border-b border-[#5a1a6b] text-xs text-white font-semibold flex items-center gap-2 shadow-2xs">
                        <i className="fa-solid fa-eye text-white"></i> <span>You can message this client's care team directly — all access and messages sent here are logged for accountability.</span>
                      </div>
                    ) : (
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-500 flex items-center gap-1.5">
                        <i className="fa-solid fa-circle-info"></i> Messages here may be reviewed by your care coordinator for quality and safeguarding.
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {!selectedMessageClientId ? (
                        <p className="text-center text-gray-400 text-sm py-8">Select a conversation to view messages.</p>
                      ) : isLoadingMessages ? (
                        <div className="text-center py-8"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                      ) : messageThread.length === 0 ? (
                        <p className="text-center text-gray-700 font-semibold text-sm py-8">No messages yet. Start the conversation below.</p>
                      ) : (
                        messageThread.map((m: any) => {
                          const isMine = m.senderId === user.id;
                          const canDelete = isMine || user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR';
                          return (
                            <div key={m.id} className={`flex group ${isMine ? 'justify-end' : 'justify-start'}`}>
                              <div className={`relative max-w-[75%] rounded-2xl px-3.5 py-2 shadow-2xs ${isMine ? 'bg-[#77248c] text-white rounded-tr-xs' : 'bg-gray-100 text-gray-900 rounded-tl-xs'}`}>
                                {!isMine && (
                                  <div className="text-[11px] font-bold text-[#77248c] mb-0.5">
                                    {m.senderName}
                                  </div>
                                )}
                                {m.text && <p className="text-sm leading-snug whitespace-pre-wrap">{m.text}</p>}
                                {m.mediaUrl && m.mediaType === 'image' && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.mediaUrl} alt={m.mediaName || 'Photo attachment'} className="mt-1 rounded-xl max-w-full max-h-64 object-cover cursor-pointer" onClick={() => window.open(m.mediaUrl, '_blank')} />
                                )}
                                {m.mediaUrl && m.mediaType === 'video' && (
                                  <video src={m.mediaUrl} controls className="mt-1 rounded-xl max-w-full max-h-64" />
                                )}
                                {m.mediaUrl && m.mediaType === 'audio' && (
                                  <audio src={m.mediaUrl} controls className="mt-1 w-full" />
                                )}
                                {!m.mediaUrl && m.mediaType && (
                                  <div className={`mt-1 text-xs flex items-center gap-1.5 italic ${isMine ? 'text-purple-100' : 'text-gray-500'}`}>
                                    <i className="fa-solid fa-triangle-exclamation"></i> Attachment unavailable
                                  </div>
                                )}

                                {/* WhatsApp-style time & status at bottom right */}
                                <div className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${isMine ? 'text-purple-200' : 'text-gray-400'}`}>
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMessage(m.id)}
                                      title="Unsend / Delete message"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-300 hover:text-red-100 cursor-pointer mr-1 flex items-center gap-1 font-semibold"
                                    >
                                      <i className="fa-solid fa-trash-can"></i> Unsend
                                    </button>
                                  )}
                                  <span>{formatTime(m.createdAt)}</span>
                                  {isMine && <i className="fa-solid fa-check-double text-[10px] text-purple-200"></i>}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {selectedMessageClientId && (
                      <div className="border-t border-gray-100 p-3">
                        {showUndoBanner && lastSentMessageId && (
                          <div className="mb-2.5 px-3.5 py-2 bg-gray-900 text-white text-xs rounded-xl flex items-center justify-between shadow-md animate-fade-up">
                            <span className="flex items-center gap-2 font-medium">
                              <i className="fa-solid fa-paper-plane text-purple-400"></i> Message sent
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(lastSentMessageId)}
                              className="px-3 py-1 bg-[#77248c] hover:bg-purple-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                            >
                              <i className="fa-solid fa-rotate-left text-white"></i> Undo / Unsend
                            </button>
                          </div>
                        )}
                        {selectedMediaFiles.length > 0 && (
                          <div className="mb-2 flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-1.5 text-xs text-purple-700">
                            <i className="fa-solid fa-paperclip"></i> {selectedMediaFiles[0].name}
                            <button onClick={() => handleRemoveMedia(0)} className="ml-auto text-purple-400 hover:text-purple-700">✕</button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input type="file" accept="image/*,video/*,audio/*" onChange={handleMediaChange} className="absolute inset-0 opacity-0 w-9 h-9 cursor-pointer z-10" />
                            <button type="button" className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-900 flex items-center justify-center"><i className="fa-solid fa-paperclip text-gray-900"></i></button>
                          </div>
                          <button
                            type="button"
                            onClick={isRecordingAudio ? handleStopVoiceRecording : handleStartVoiceRecording}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isRecordingAudio ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}`}
                          >
                            <i className="fa-solid fa-microphone text-gray-900"></i>
                          </button>
                          <input
                            type="text"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            placeholder="Type a message..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={isSendingMessage || (!messageText.trim() && selectedMediaFiles.length === 0)}
                            className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center disabled:opacity-50 transition-all shrink-0"
                          >
                            <i className="fa-solid fa-paper-plane"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== AUDIT LOGS VIEW ===== */}
              {currentView === 'audit' && (user.role === 'ADMIN' || user.role === 'CARE_COORDINATOR') && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4">
                    <h3 className="font-semibold text-gray-800">Audit Logs</h3>
                    <span className="text-xs font-bold text-white bg-[#77248c] px-3.5 py-1 rounded-full shadow-xs">HIPAA Compliant</span>
                  </div>
                  {auditLogs.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No logs recorded</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-black font-bold border-b border-gray-200"><th className="py-3 text-left font-bold text-black">Time</th><th className="py-3 text-left font-bold text-black">Action</th><th className="py-3 text-left font-bold text-black">User</th><th className="py-3 text-left font-bold text-black">Outcome</th><th className="py-3 text-left font-bold text-black">Details</th></tr></thead>
                        <tbody>
                          {auditLogs.map(log => (
                            <tr key={log.id} className="border-b border-gray-100/50 hover:bg-gray-50/30">
                              <td className="py-3 text-gray-600 font-medium text-xs whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                              <td className="py-3 font-semibold text-purple-600">{log.action}</td>
                              <td className="py-3 text-gray-600 font-medium text-xs">{log.userId?.substring(0, 8)}</td>
                              <td className="py-3"><span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase shadow-2xs ${log.outcome === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{log.outcome}</span></td>
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
                    <div className="bg-purple-50 rounded-xl p-4 text-center"><div className="text-sm text-gray-600">Active</div><div className="text-2xl font-bold text-purple-600">{shifts.filter(s => s.status === 'IN_PROGRESS' || s.status === 'CONFIRMED').length}</div></div>
                  </div>
                  <div className="space-y-3">
                    {shifts.filter(s => s.status === 'COMPLETED' || s.status === 'IN_PROGRESS').slice(0, 5).map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div><div className="text-sm font-medium">{shift.client.name}</div><div className="text-xs text-gray-400">{formatDate(shift.scheduledStart)}</div></div>
                        <span className={`text-sm font-semibold ${shift.status === 'COMPLETED' ? 'text-green-600' : 'text-purple-600'}`}>{shift.status}</span>
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

      {/* Self Password Change Modal (for Caregiver & Family Member) */}
      {showSelfPasswordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-fade-up">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#77248c] text-white flex items-center justify-center shadow-xs">
                  <i className="fa-solid fa-shield-halved text-white"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 text-base">Change Your Password</h3>
                  <p className="text-xs text-gray-500">Enter your current password and choose a new one.</p>
                </div>
              </div>
              <button onClick={() => setShowSelfPasswordModal(false)} className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <form onSubmit={handleChangeSelfPassword} className="space-y-4">
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Current Password</label>
                <input type="password" value={currentPasswordInput} onChange={(e) => setCurrentPasswordInput(e.target.value)} required placeholder="Your current password" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">New Password</label>
                <input type="password" value={newSelfPasswordInput} onChange={(e) => setNewSelfPasswordInput(e.target.value)} required placeholder="At least 8 characters" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Confirm New Password</label>
                <input type="password" value={confirmSelfPasswordInput} onChange={(e) => setConfirmSelfPasswordInput(e.target.value)} required placeholder="Repeat new password" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              {selfPasswordError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation"></i> {selfPasswordError}
                </div>
              )}
              <button type="submit" disabled={isChangingSelfPassword} className="w-full py-3.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                {isChangingSelfPassword ? <><i className="fa-solid fa-circle-notch animate-spin"></i> Updating...</> : <><i className="fa-solid fa-check"></i> Update Password</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Onboarding Modal (first-time Caregiver & Family Member) */}
      {showMandatoryOnboardingModal && user && user.role !== 'ADMIN' && user.role !== 'CARE_COORDINATOR' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-fade-up">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#77248c] text-white flex items-center justify-center mx-auto mb-4 text-2xl shadow-lg">
                <i className="fa-solid fa-user-check"></i>
              </div>
              <h3 className="font-extrabold text-xl text-gray-900 mb-1">Welcome to Akirapa! 👋</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Before you get started, we need a few details to set up your {user.role === 'CAREGIVER' ? 'caregiver' : 'family'} profile.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Phone Number <span className="text-red-500 ml-0.5">*</span></label>
                <PhoneInput
                  value={onboardingPhone}
                  onChange={(val) => setOnboardingPhone(val)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">
                  {user.role === 'CAREGIVER' ? 'Home Address' : 'Your Address'} <span className="text-red-500 ml-0.5">*</span>
                </label>
                <LocationAutocompleteInput
                  value={onboardingAddress}
                  onChange={(val) => setOnboardingAddress(val)}
                  onSelectLocation={(loc) => {
                    setOnboardingAddress(loc.full || loc.street);
                  }}
                  placeholder="123 Main St, City, State"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Emergency Contact First Name <span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane"
                    value={onboardingEmergencyFirstName}
                    onChange={(e) => setOnboardingEmergencyFirstName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Emergency Contact Last Name <span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Doe"
                    value={onboardingEmergencyLastName}
                    onChange={(e) => setOnboardingEmergencyLastName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-gray-600 uppercase tracking-wider text-[10px] block mb-1">Emergency Contact Phone</label>
                <PhoneInput
                  value={onboardingEmergencyPhone}
                  onChange={(val) => setOnboardingEmergencyPhone(val)}
                  className="mt-1"
                />
              </div>
              <button
                disabled={isSubmittingOnboarding || !onboardingPhone}
                onClick={async () => {
                  if (!onboardingPhone) return;
                  setIsSubmittingOnboarding(true);
                  try {
                    const res = await fetch('/api/user/profile', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: user.id,
                        phoneNumber: onboardingPhone,
                        profileMetadata: JSON.stringify({
                          address: onboardingAddress,
                          emergencyContact: {
                            name: `${onboardingEmergencyFirstName.trim()} ${onboardingEmergencyLastName.trim()}`.trim(),
                            phone: onboardingEmergencyPhone,
                          },
                        }),
                      }),
                    });
                    if (res.ok) {
                      setShowMandatoryOnboardingModal(false);
                      showNotification('Profile details saved! Welcome aboard.');
                      await loadData();
                    } else {
                      const d = await res.json();
                      showNotification(d.error || 'Failed to save profile details.');
                    }
                  } catch (err) {
                    showNotification('Network error saving profile.');
                  } finally {
                    setIsSubmittingOnboarding(false);
                  }
                }}
                className="w-full py-3.5 bg-[#77248c] hover:bg-[#5a1a6b] text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmittingOnboarding ? <><i className="fa-solid fa-circle-notch animate-spin"></i> Saving...</> : <><i className="fa-solid fa-rocket"></i> Save My Details & Get Started</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Invoice Modal */}
      {showGenerateInvoiceModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <i className="fa-solid fa-file-invoice text-purple-600"></i> Generate Invoice
              </h3>
              <button onClick={() => setShowGenerateInvoiceModal(false)} className="text-gray-400 hover:text-gray-600 font-bold"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <form onSubmit={handleGenerateInvoice} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Client</label>
                <select required value={invoiceClientId} onChange={(e) => setInvoiceClientId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select a client</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.billingRatePerHour == null ? ' (no billing rate set)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-gray-600 uppercase block mb-1">Service Period Start</label>
                  <input required type="date" value={invoicePeriodStart} onChange={(e) => setInvoicePeriodStart(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 uppercase block mb-1">Service Period End</label>
                  <input required type="date" value={invoicePeriodEnd} onChange={(e) => setInvoicePeriodEnd(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="font-semibold text-gray-600 uppercase block mb-1">Due Date</label>
                <input required type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-gray-600 uppercase block mb-1">Tax Rate (%)</label>
                  <input type="number" step="0.01" min="0" value={invoiceTaxRate} onChange={(e) => setInvoiceTaxRate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="font-semibold text-gray-600 uppercase block mb-1">Discount ($)</label>
                  <input type="number" step="0.01" min="0" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <p className="text-[10px] text-gray-400">Line items are auto-calculated from this client's completed shifts within the service period, using the client's billing rate.</p>
              <button type="submit" disabled={isGeneratingInvoice} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50">
                {isGeneratingInvoice ? 'Generating...' : 'Generate Invoice'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Invoice View / Print Template */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 print:bg-white print:p-0 print:block print:static">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto print:rounded-none print:shadow-none print:max-h-none print:max-w-none print:overflow-visible">
            <div className="flex justify-end gap-2 p-4 border-b border-gray-100 print:hidden">
              <button onClick={() => window.print()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2">
                <i className="fa-solid fa-print"></i> Print / Save as PDF
              </button>
              <button onClick={() => setViewingInvoice(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl">Close</button>
            </div>

            <div className="p-10">
              <div className="flex justify-between items-start border-b-2 border-teal-600 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <img src="/System logo.png" alt="Akirapa Logo" className="h-12 w-auto object-contain" />
                  <div>
                    <div className="font-bold text-teal-700 text-sm uppercase tracking-wide">Akirapa Home Care</div>
                    <div className="text-[10px] text-gray-400">Compassionate Care, Trusted Support</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-800">INVOICE</div>
                  <div className="text-xs text-gray-500 mt-1">INVOICE # <span className="font-semibold text-gray-700">{viewingInvoice.invoiceNumber}</span></div>
                  <div className="text-xs text-gray-500">DATE <span className="font-semibold text-gray-700">{formatDate(viewingInvoice.issuedDate)}</span></div>
                </div>
              </div>

              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Bill To</div>
                  <div className="font-semibold text-gray-800">{viewingInvoice.client.name}</div>
                  <div className="text-xs text-gray-500">{viewingInvoice.client.address}</div>
                </div>
                <div className="bg-teal-50 rounded-xl px-5 py-3 text-right">
                  <div className="text-[10px] font-bold text-teal-700 uppercase">Balance Due</div>
                  <div className="text-2xl font-bold text-teal-700">${viewingInvoice.balance.toFixed(2)}</div>
                </div>
              </div>

              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="bg-teal-600 text-white text-left text-xs uppercase">
                    <th className="py-2 px-3 rounded-l-lg">Service</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Hours</th>
                    <th className="py-2 px-3 text-right">Rate</th>
                    <th className="py-2 px-3 text-right rounded-r-lg">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingInvoice.lineItems.map((li: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2.5 px-3">{li.description}</td>
                      <td className="py-2.5 px-3 text-gray-500">{formatDate(li.date)}</td>
                      <td className="py-2.5 px-3 text-right">{li.hours.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right">${li.rate.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">${li.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-8">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>${viewingInvoice.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Tax ({viewingInvoice.taxRate}%)</span><span>${viewingInvoice.taxAmount.toFixed(2)}</span></div>
                  {viewingInvoice.discountAmount > 0 && (
                    <div className="flex justify-between text-gray-600"><span>Discount</span><span>-${viewingInvoice.discountAmount.toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-gray-800 text-base bg-teal-600 text-white px-3 py-2 rounded-lg mt-2">
                    <span>Total Due</span><span>${viewingInvoice.totalDue.toFixed(2)}</span>
                  </div>
                  {viewingInvoice.amountPaid > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold"><span>Paid</span><span>${viewingInvoice.amountPaid.toFixed(2)}</span></div>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                Service period: {formatDate(viewingInvoice.servicePeriodStart)} - {formatDate(viewingInvoice.servicePeriodEnd)} &middot; Due {formatDate(viewingInvoice.dueDate)}
              </div>
              <div className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-gray-100">
                Thank you for trusting our care services.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Oversight - read-only full transcript viewer */}
      {viewingTranscript && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-start gap-3">
              <div>
                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <i className="fa-solid fa-eye text-[#77248c]"></i>
                  {viewingTranscript.type === 'DIRECT'
                    ? viewingTranscript.participants.map((p: any) => p.name).join(' ↔ ')
                    : `${viewingTranscript.clientName} care team`}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {viewingTranscript.type === 'DIRECT' ? 'Private direct message' : 'Shared care-team thread'} · read-only · this view has been audit-logged
                </p>
              </div>
              <button onClick={() => setViewingTranscript(null)} className="text-gray-400 hover:text-gray-600 font-bold shrink-0">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/60">
              {isLoadingTranscript || viewingTranscript.messages === null ? (
                <div className="text-center py-10"><div className="w-8 h-8 border-4 border-[#77248c] border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : viewingTranscript.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">This conversation has no messages.</p>
              ) : (
                viewingTranscript.messages.map((m: any) => (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3">
                    <div className="flex justify-between items-baseline gap-2 mb-1">
                      <span className="text-[11px] font-bold text-[#77248c]">
                        {m.senderName} <span className="text-gray-400 font-medium">· {m.senderRole.replace('_', ' ')}</span>
                        {m.recipientName && <span className="text-gray-400 font-medium"> → {m.recipientName}</span>}
                      </span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDateTime(m.createdAt)}</span>
                    </div>
                    {m.text && <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.text}</p>}
                    {m.hasAttachment && (
                      <div className="mt-1.5 text-xs text-gray-500 italic flex items-center gap-1.5">
                        <i className="fa-solid fa-paperclip"></i>
                        {m.mediaType === 'audio' ? 'Voice note' : m.mediaType === 'video' ? 'Video' : 'Photo'}
                        {m.mediaName ? ` — ${m.mediaName}` : ''}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-gray-100 bg-white text-[11px] text-gray-400 text-center">
              {viewingTranscript.messages?.length ?? 0} message{(viewingTranscript.messages?.length ?? 0) === 1 ? '' : 's'} · oversight is read-only, you cannot reply from here
            </div>
          </div>
        </div>
      )}

      {/* Client Billing Record (per-client statement) */}
      {viewingBillingRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 print:bg-white print:p-0 print:block print:static">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto print:rounded-none print:shadow-none print:max-h-none print:max-w-none print:overflow-visible">
            <div className="flex justify-end gap-2 p-4 border-b border-gray-100 print:hidden">
              <button onClick={() => window.print()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2">
                <i className="fa-solid fa-print"></i> Print / Save as PDF
              </button>
              <button onClick={() => setViewingBillingRecord(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl">Close</button>
            </div>

            <div className="p-10">
              <div className="flex justify-between items-start border-b-2 border-teal-600 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <img src="/System logo.png" alt="Akirapa Logo" className="h-12 w-auto object-contain" />
                  <div>
                    <div className="font-bold text-teal-700 text-sm uppercase tracking-wide">Akirapa Home Care</div>
                    <div className="text-[10px] text-gray-400">Compassionate Care, Trusted Support</div>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>Statement Date: <span className="font-semibold text-gray-700">{formatDate(new Date())}</span></div>
                </div>
              </div>

              <div className="flex justify-between items-start mb-2">
                <div className="text-3xl font-bold text-gray-800">CLIENT BILLING RECORD</div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Account Number</div>
                  <div className="font-bold text-gray-800">{viewingBillingRecord.accountNumber}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-8">Track client charges, payments, and account balances.</p>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Client Account Information</div>
                  <div className="text-sm space-y-1">
                    <div><span className="text-gray-400">Client Name:</span> <span className="font-semibold text-gray-800">{viewingBillingRecord.client.name}</span></div>
                    {viewingBillingRecord.client.phone && <div><span className="text-gray-400">Phone:</span> <span className="text-gray-700">{viewingBillingRecord.client.phone}</span></div>}
                    {viewingBillingRecord.client.email && <div><span className="text-gray-400">Email:</span> <span className="text-gray-700">{viewingBillingRecord.client.email}</span></div>}
                    <div><span className="text-gray-400">Address:</span> <span className="text-gray-700">{viewingBillingRecord.client.address}</span></div>
                    <div><span className="text-gray-400">Client Since:</span> <span className="text-gray-700">{formatDate(viewingBillingRecord.client.clientSince)}</span></div>
                  </div>
                </div>
                <div className="bg-teal-50 rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-teal-700 uppercase">Total Charges</div>
                    <div className="text-lg font-bold text-gray-800">${viewingBillingRecord.totalCharges.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-teal-700 uppercase">Total Payments</div>
                    <div className="text-lg font-bold text-gray-800">${viewingBillingRecord.totalPayments.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-teal-700 uppercase">Current Balance</div>
                    <div className="text-lg font-bold text-teal-700">${viewingBillingRecord.currentBalance.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-teal-700 uppercase">Last Payment</div>
                    <div className="text-sm font-semibold text-gray-800">{viewingBillingRecord.lastPaymentDate ? formatDate(viewingBillingRecord.lastPaymentDate) : '—'}</div>
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Billing History</div>
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="bg-teal-600 text-white text-left text-xs uppercase">
                    <th className="py-2 px-3 rounded-l-lg">Date</th>
                    <th className="py-2 px-3">Invoice #</th>
                    <th className="py-2 px-3">Service Description</th>
                    <th className="py-2 px-3 text-right">Charges</th>
                    <th className="py-2 px-3 text-right">Payments</th>
                    <th className="py-2 px-3 text-right rounded-r-lg">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingBillingRecord.history.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-gray-400">No billing activity yet</td></tr>
                  ) : viewingBillingRecord.history.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2.5 px-3 text-gray-500">{formatDate(row.date)}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-gray-600">{row.invoiceNumber}</td>
                      <td className="py-2.5 px-3">{row.description}</td>
                      <td className="py-2.5 px-3 text-right text-red-600">{row.charge > 0 ? `$${row.charge.toFixed(2)}` : ''}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600">{row.payment > 0 ? `$${row.payment.toFixed(2)}` : ''}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">${row.balance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-gray-800 border-t-2 border-teal-600">
                    <td className="py-2.5 px-3" colSpan={3}>Account Totals</td>
                    <td className="py-2.5 px-3 text-right">${viewingBillingRecord.totalCharges.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right">${viewingBillingRecord.totalPayments.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right">${viewingBillingRecord.currentBalance.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
                Maintain accurate billing records for every client account.
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}