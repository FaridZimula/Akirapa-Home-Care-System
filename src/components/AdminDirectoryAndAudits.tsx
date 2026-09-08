'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatDate, formatTime, formatDateTime } from '@/lib/dateFormat';

interface DigitalFootprint {
  id: string;
  shiftId?: string;
  timestamp: string;
  activityType: 'CLOCK_IN' | 'CLOCK_OUT' | 'SERVICE_DELIVERY' | 'FAMILY_APPROVAL' | 'AUDIT_EVENT';
  entityType: 'CAREGIVER' | 'CLIENT' | 'BOTH';
  category: string;
  title: string;
  caregiver?: {
    id: string;
    name: string;
    email: string;
    phoneNumber?: string;
    role?: string;
    payRate?: number;
  };
  client?: {
    id: string;
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
    geofenceRadiusMeter?: number;
  };
  actor?: {
    name: string;
    email: string;
    role: string;
  };
  location?: {
    clockInLat?: number | null;
    clockInLng?: number | null;
    clockOutLat?: number | null;
    clockOutLng?: number | null;
    distanceMeters?: number | null;
    withinGeofence?: boolean | null;
    geofenceRadius?: number;
    isOverrideException?: boolean;
    overrideReason?: string | null;
  };
  service?: {
    scheduledStart?: string;
    scheduledEnd?: string;
    status?: string;
    durationHours?: string | null;
    totalTasksScheduled?: number;
    tasksCompletedCount?: number;
    tasksScheduledCount?: number;
    tasksList?: string[];
    completedTasks?: Array<{ name: string; description: string; scheduledTime: string; completedAt: string | null }>;
    clinicalNotes?: string;
    mediaAttachmentsCount?: number;
    isOvertime?: boolean;
    overtimeReason?: string | null;
  };
  details: string;
  action?: string;
  status: string;
}

interface ClientItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeter: number;
  billingRatePerHour: number;
  createdAt: string;
  careTier: string;
  referralType: string;
  governmentProgram: string | null;
  familySponsor: {
    name: string;
    email: string;
    phone: string;
    relationship?: string;
  } | null;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  } | null;
  secondaryEmergency: {
    name: string;
    phone: string;
    relationship: string;
  } | null;
  medicalConditions: string;
  allergies: string;
  mobility: string;
  medicationDetails: string;
  pcpName: string | null;
  preferredHospital: string | null;
  adlMatrix: any;
  iadlChecklist: any;
  legalStatus: any;
  advanceDirectives: any;
  pods: {
    primary: { id: string; name: string; email: string; phoneNumber?: string; payRate?: number } | null;
    secondary1: { id: string; name: string; email: string; phoneNumber?: string; payRate?: number } | null;
    secondary2: { id: string; name: string; email: string; phoneNumber?: string; payRate?: number } | null;
  };
  metrics: {
    totalShifts: number;
    completedShifts: number;
    upcomingShifts: number;
    inProgressShifts: number;
    lastShiftDate: string | null;
    totalInvoices: number;
    totalActivityLogs: number;
    carePlansCount: number;
    carePlanTasksCount: number;
  };
  rawMetadata: any;
}

interface CaregiverItem {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string;
  payRate: number;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  jobTitle: string;
  podAssignments: Array<{
    clientId: string;
    clientName: string;
    role: string;
  }>;
  metrics: {
    totalShifts: number;
    completedShifts: number;
    droppedShifts: number;
    noShowShifts: number;
    upcomingShifts: number;
    assignedClientsCount: number;
    reviewsCount: number;
    averageRating: number | null;
    auditLogsCount: number;
  };
  recentReviews: Array<{
    id: string;
    rating: number | null;
    wouldContinue: boolean;
    strengths: string | null;
    improvements: string | null;
    createdAt: string;
    client: { name: string };
  }>;
}

interface AuditItem {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  outcome: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
}

interface DirectoryData {
  stats: {
    totalClients: number;
    totalCaregivers: number;
    totalStaff: number;
    totalAudits: number;
    totalDigitalFootprints?: number;
    totalClockIns?: number;
    totalCompletedVisits: number;
    totalUpcomingVisits: number;
  };
  clients: ClientItem[];
  caregivers: CaregiverItem[];
  audits: AuditItem[];
  digitalFootprints: DigitalFootprint[];
}

export default function AdminDirectoryAndAudits({ adminEmail }: { adminEmail?: string }) {
  const [data, setData] = useState<DirectoryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-tabs: 'footprints' | 'clients' | 'caregivers' | 'audits'
  const [activeSubTab, setActiveSubTab] = useState<'footprints' | 'clients' | 'caregivers' | 'audits'>('footprints');

  // ================= CAREGIVER vs CLIENT FILTER =================
  // 'ALL' | 'CAREGIVER' | 'CLIENT'
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'CAREGIVER' | 'CLIENT'>('ALL');
  const [selectedCaregiverId, setSelectedCaregiverId] = useState<string>('ALL');
  const [selectedClientId, setSelectedClientId] = useState<string>('ALL');
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('ALL');
  const [locationComplianceFilter, setLocationComplianceFilter] = useState<string>('ALL');
  const [footprintSearch, setFootprintSearch] = useState<string>('');

  // Other Tab Searches & Filters
  const [clientSearch, setClientSearch] = useState('');
  const [clientTierFilter, setClientTierFilter] = useState('ALL');
  const [clientReferralFilter, setClientReferralFilter] = useState('ALL');

  const [caregiverSearch, setCaregiverSearch] = useState('');
  const [caregiverRoleFilter, setCaregiverRoleFilter] = useState('ALL');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditRoleFilter, setAuditRoleFilter] = useState('ALL');
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState('ALL');

  // Detail Inspection Modals
  const [selectedFootprintDetail, setSelectedFootprintDetail] = useState<DigitalFootprint | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<ClientItem | null>(null);
  const [selectedCaregiverDetail, setSelectedCaregiverDetail] = useState<CaregiverItem | null>(null);

  // Export dropdown
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (adminEmail) {
        headers['x-admin-email'] = adminEmail;
      }
      const res = await fetch('/api/admin/directory-audits?auditLimit=2000', {
        headers,
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to load records.');
      }
      setData(resData);
    } catch (err: any) {
      console.error('Error fetching directory and audits:', err);
      setError(err.message || 'Unable to load directory and audit records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminEmail]);

  // Filtered Digital Footprints
  const filteredFootprints = useMemo(() => {
    if (!data?.digitalFootprints) return [];
    return data.digitalFootprints.filter((fp) => {
      // 1. Entity Filter: Caregiver vs Client
      if (entityFilter === 'CAREGIVER' && fp.entityType !== 'CAREGIVER' && fp.entityType !== 'BOTH') {
        return false;
      }
      if (entityFilter === 'CLIENT' && fp.entityType !== 'CLIENT' && fp.entityType !== 'BOTH') {
        return false;
      }

      // 2. Specific Caregiver Dropdown
      if (selectedCaregiverId !== 'ALL' && fp.caregiver?.id !== selectedCaregiverId) {
        return false;
      }

      // 3. Specific Client Dropdown
      if (selectedClientId !== 'ALL' && fp.client?.id !== selectedClientId) {
        return false;
      }

      // 4. Activity Type
      if (activityTypeFilter !== 'ALL' && fp.activityType !== activityTypeFilter) {
        return false;
      }

      // 5. Location Compliance Filter
      if (locationComplianceFilter === 'INSIDE_GEOFENCE' && fp.location?.withinGeofence !== true) {
        return false;
      }
      if (locationComplianceFilter === 'OUTSIDE_GEOFENCE' && fp.location?.withinGeofence !== false) {
        return false;
      }
      if (locationComplianceFilter === 'EXCEPTION_OVERRIDE' && !fp.location?.isOverrideException) {
        return false;
      }

      // 6. Keyword Search
      if (footprintSearch.trim()) {
        const q = footprintSearch.toLowerCase().trim();
        const matchesQuery =
          fp.title.toLowerCase().includes(q) ||
          fp.details.toLowerCase().includes(q) ||
          (fp.caregiver?.name || '').toLowerCase().includes(q) ||
          (fp.caregiver?.email || '').toLowerCase().includes(q) ||
          (fp.client?.name || '').toLowerCase().includes(q) ||
          (fp.client?.address || '').toLowerCase().includes(q) ||
          (fp.service?.clinicalNotes || '').toLowerCase().includes(q) ||
          (fp.service?.tasksList || []).some((t) => t.toLowerCase().includes(q));

        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    data?.digitalFootprints,
    entityFilter,
    selectedCaregiverId,
    selectedClientId,
    activityTypeFilter,
    locationComplianceFilter,
    footprintSearch,
  ]);

  // Filtered Clients
  const filteredClients = useMemo(() => {
    if (!data?.clients) return [];
    return data.clients.filter((c) => {
      const q = clientSearch.toLowerCase().trim();
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.familySponsor?.name || '').toLowerCase().includes(q) ||
        (c.familySponsor?.email || '').toLowerCase().includes(q) ||
        (c.emergencyContact?.name || '').toLowerCase().includes(q) ||
        (c.medicalConditions || '').toLowerCase().includes(q);

      const matchesTier = clientTierFilter === 'ALL' || c.careTier === clientTierFilter;
      const matchesReferral =
        clientReferralFilter === 'ALL' ||
        (clientReferralFilter === 'Government' ? c.referralType === 'Government Client' : c.referralType === clientReferralFilter);

      return matchesQuery && matchesTier && matchesReferral;
    });
  }, [data?.clients, clientSearch, clientTierFilter, clientReferralFilter]);

  // Filtered Caregivers
  const filteredCaregivers = useMemo(() => {
    if (!data?.caregivers) return [];
    return data.caregivers.filter((cg) => {
      const q = caregiverSearch.toLowerCase().trim();
      const matchesQuery =
        !q ||
        cg.name.toLowerCase().includes(q) ||
        cg.email.toLowerCase().includes(q) ||
        cg.phoneNumber.toLowerCase().includes(q) ||
        cg.jobTitle.toLowerCase().includes(q);

      const matchesRole = caregiverRoleFilter === 'ALL' || cg.role === caregiverRoleFilter;

      return matchesQuery && matchesRole;
    });
  }, [data?.caregivers, caregiverSearch, caregiverRoleFilter]);

  // Filtered Audits
  const filteredAudits = useMemo(() => {
    if (!data?.audits) return [];
    return data.audits.filter((a) => {
      const q = auditSearch.toLowerCase().trim();
      const matchesQuery =
        !q ||
        a.action.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q) ||
        a.userName.toLowerCase().includes(q) ||
        a.userEmail.toLowerCase().includes(q);

      const matchesRole = auditRoleFilter === 'ALL' || a.userRole === auditRoleFilter;
      const matchesOutcome = auditOutcomeFilter === 'ALL' || a.outcome === auditOutcomeFilter;

      return matchesQuery && matchesRole && matchesOutcome;
    });
  }, [data?.audits, auditSearch, auditRoleFilter, auditOutcomeFilter]);

  // Helper function to trigger file downloads
  const downloadFile = (content: string, fileName: string, mimeType = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '""';
    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  };

  // 1. Export Digital Footprints CSV
  const exportDigitalFootprintsCSV = (subset?: DigitalFootprint[]) => {
    const items = subset || filteredFootprints;
    if (items.length === 0) return;

    const headers = [
      'Footprint ID',
      'Timestamp',
      'Activity Type',
      'Entity (Caregiver/Client)',
      'Caregiver Name',
      'Caregiver Email',
      'Patient Name',
      'Patient Home Address',
      'Activity Title',
      'Clock-In Time',
      'Clock-In Latitude',
      'Clock-In Longitude',
      'Distance to Patient (Meters)',
      'Within Geofence (Yes/No)',
      'Override Exception (Yes/No)',
      'Override Reason',
      'Clock-Out Time',
      'Clock-Out Latitude',
      'Clock-Out Longitude',
      'Visit Duration (Hours)',
      'Services / Tasks Completed',
      'Clinical Notes / Observations',
      'Overtime Claimed (Yes/No)',
      'Overtime Reason',
      'Status / Outcome',
      'Full Details Narrative',
    ];

    const rows = items.map((fp) => [
      escapeCSV(fp.id),
      escapeCSV(formatDateTime(fp.timestamp)),
      escapeCSV(fp.activityType),
      escapeCSV(fp.entityType),
      escapeCSV(fp.caregiver?.name || fp.actor?.name || 'N/A'),
      escapeCSV(fp.caregiver?.email || fp.actor?.email || 'N/A'),
      escapeCSV(fp.client?.name || 'N/A'),
      escapeCSV(fp.client?.address || 'N/A'),
      escapeCSV(fp.title),
      escapeCSV(fp.activityType === 'CLOCK_IN' ? formatDateTime(fp.timestamp) : 'N/A'),
      escapeCSV(fp.location?.clockInLat ?? 'N/A'),
      escapeCSV(fp.location?.clockInLng ?? 'N/A'),
      escapeCSV(fp.location?.distanceMeters !== undefined && fp.location?.distanceMeters !== null ? `${fp.location.distanceMeters}m` : 'N/A'),
      escapeCSV(fp.location?.withinGeofence !== undefined && fp.location?.withinGeofence !== null ? (fp.location.withinGeofence ? 'YES' : 'NO') : 'N/A'),
      escapeCSV(fp.location?.isOverrideException ? 'YES' : 'NO'),
      escapeCSV(fp.location?.overrideReason || 'N/A'),
      escapeCSV(fp.activityType === 'CLOCK_OUT' ? formatDateTime(fp.timestamp) : 'N/A'),
      escapeCSV(fp.location?.clockOutLat ?? 'N/A'),
      escapeCSV(fp.location?.clockOutLng ?? 'N/A'),
      escapeCSV(fp.service?.durationHours ? `${fp.service.durationHours} hrs` : 'N/A'),
      escapeCSV(fp.service?.tasksList?.join('; ') || fp.service?.completedTasks?.map((t) => t.name).join('; ') || 'N/A'),
      escapeCSV(fp.service?.clinicalNotes || 'N/A'),
      escapeCSV(fp.service?.isOvertime ? 'YES' : 'NO'),
      escapeCSV(fp.service?.overtimeReason || 'N/A'),
      escapeCSV(fp.status),
      escapeCSV(fp.details),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `Akirapa_Digital_Footprints_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // 2. Export Clients CSV
  const exportClientsCSV = () => {
    if (!data?.clients || data.clients.length === 0) return;
    const headers = [
      'Client ID',
      'Client Name',
      'Address',
      'Billing Rate ($/hr)',
      'Care Tier',
      'Referral Type',
      'Government Program',
      'Family Sponsor Name',
      'Family Sponsor Email',
      'Family Sponsor Phone',
      'Primary Emergency Name',
      'Primary Emergency Phone',
      'Primary Emergency Relation',
      'Medical Conditions',
      'Allergies',
      'Mobility',
      'Primary Pod Caregiver',
      'Secondary 1 Caregiver',
      'Total Shifts',
      'Completed Shifts',
      'Upcoming Shifts',
      'Date Enrolled',
    ];

    const rows = data.clients.map((c) => [
      escapeCSV(c.id),
      escapeCSV(c.name),
      escapeCSV(c.address),
      escapeCSV(c.billingRatePerHour),
      escapeCSV(c.careTier),
      escapeCSV(c.referralType),
      escapeCSV(c.governmentProgram || 'N/A'),
      escapeCSV(c.familySponsor?.name || 'N/A'),
      escapeCSV(c.familySponsor?.email || 'N/A'),
      escapeCSV(c.familySponsor?.phone || 'N/A'),
      escapeCSV(c.emergencyContact?.name || 'N/A'),
      escapeCSV(c.emergencyContact?.phone || 'N/A'),
      escapeCSV(c.emergencyContact?.relationship || 'N/A'),
      escapeCSV(c.medicalConditions),
      escapeCSV(c.allergies),
      escapeCSV(c.mobility),
      escapeCSV(c.pods.primary?.name || 'Unassigned'),
      escapeCSV(c.pods.secondary1?.name || 'Unassigned'),
      escapeCSV(c.metrics.totalShifts),
      escapeCSV(c.metrics.completedShifts),
      escapeCSV(c.metrics.upcomingShifts),
      escapeCSV(formatDate(c.createdAt)),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `Akirapa_Clients_Directory_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // 3. Export Caregivers CSV
  const exportCaregiversCSV = () => {
    if (!data?.caregivers || data.caregivers.length === 0) return;
    const headers = [
      'Caregiver ID',
      'Full Name',
      'Email',
      'Phone Number',
      'Role',
      'Job Title',
      'Hourly Pay Rate ($)',
      'Assigned Clients Count',
      'Assigned Clients List',
      'Total Shifts',
      'Completed Shifts',
      'Dropped Shifts',
      'No Show Shifts',
      'Average Review Rating',
      'Reviews Count',
      'Account Security',
      'Created Date',
    ];

    const rows = data.caregivers.map((cg) => [
      escapeCSV(cg.id),
      escapeCSV(cg.name),
      escapeCSV(cg.email),
      escapeCSV(cg.phoneNumber),
      escapeCSV(cg.role),
      escapeCSV(cg.jobTitle),
      escapeCSV(cg.payRate),
      escapeCSV(cg.metrics.assignedClientsCount),
      escapeCSV(cg.podAssignments.map((p) => `${p.clientName} (${p.role})`).join('; ')),
      escapeCSV(cg.metrics.totalShifts),
      escapeCSV(cg.metrics.completedShifts),
      escapeCSV(cg.metrics.droppedShifts),
      escapeCSV(cg.metrics.noShowShifts),
      escapeCSV(cg.metrics.averageRating !== null ? `${cg.metrics.averageRating} / 5` : 'No reviews'),
      escapeCSV(cg.metrics.reviewsCount),
      escapeCSV(cg.mustChangePassword ? 'Must Change Password' : 'Active / Password Set'),
      escapeCSV(formatDate(cg.createdAt)),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `Akirapa_Caregivers_Staff_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // 4. Export Complete JSON Bundle
  const exportFullJSON = () => {
    if (!data) return;
    const exportBundle = {
      generatedAt: new Date().toISOString(),
      system: 'Akirapa Home Care Management System',
      compliance: 'HIPAA & EVV Electronic Visit Verification Compliant Digital Footprint Audit',
      summaryStats: data.stats,
      digitalFootprints: data.digitalFootprints,
      clients: data.clients,
      caregivers: data.caregivers,
      auditLogs: data.audits,
    };

    const jsonContent = JSON.stringify(exportBundle, null, 2);
    downloadFile(
      jsonContent,
      `Akirapa_Digital_Footprints_Full_Audit_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8;'
    );
  };

  return (
    <div className="space-y-6 animate-fade-in print:p-0">
      {/* ================= HEADER & STATS ================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-gray-100/80 relative overflow-hidden">
        {/* Ambient light glow accents */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-purple-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-teal-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-gray-100/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold tracking-wide uppercase mb-2">
              <i className="fa-solid fa-shoe-prints text-purple-600"></i>
              EVV & HIPAA Digital Footprint Tracking
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Activity & Footprint Audits
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Real-time forensic tracking of client and caregiver activities, including clock-in/out timestamps, GPS coordinates, geofence compliance, services rendered, and immutable digital footprints.
            </p>
          </div>

          {/* Top Actions & Download Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold flex items-center gap-2 transition-all shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
              title="Refresh Records"
            >
              <i className={`fa-solid fa-arrows-rotate ${isLoading ? 'animate-spin text-[#77248c]' : ''}`}></i>
              Refresh
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="px-5 py-2.5 rounded-xl bg-[#77248c] hover:bg-[#631e75] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <i className="fa-solid fa-cloud-arrow-down"></i>
                Download Records
                <i className="fa-solid fa-chevron-down text-[10px] ml-1"></i>
              </button>

              {isExportMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fade-in"
                  onMouseLeave={() => setIsExportMenuOpen(false)}
                >
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    Download File Formats
                  </div>
                  <button
                    onClick={() => {
                      exportDigitalFootprintsCSV();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-purple-50 hover:text-[#77248c] text-xs font-semibold text-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-shoe-prints text-purple-600 text-sm"></i>
                    Export Digital Footprints (CSV)
                  </button>
                  <button
                    onClick={() => {
                      exportClientsCSV();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-purple-50 hover:text-[#77248c] text-xs font-semibold text-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-users text-emerald-600 text-sm"></i>
                    Export Clients Directory (CSV)
                  </button>
                  <button
                    onClick={() => {
                      exportCaregiversCSV();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-purple-50 hover:text-[#77248c] text-xs font-semibold text-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-user-nurse text-blue-600 text-sm"></i>
                    Export Caregivers Directory (CSV)
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button
                    onClick={() => {
                      exportFullJSON();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-purple-50 hover:text-[#77248c] text-xs font-semibold text-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-file-code text-amber-600 text-sm"></i>
                    Complete Audit Backup (JSON)
                  </button>
                  <button
                    onClick={() => {
                      window.print();
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-purple-50 hover:text-[#77248c] text-xs font-semibold text-gray-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-print text-gray-500 text-sm"></i>
                    Print Dossier / Save as PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-purple-50/60 border border-purple-100/80 rounded-2xl p-4.5 transition-all hover:bg-purple-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-900">Tracked Footprints</span>
              <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-sm shadow-2xs">
                <i className="fa-solid fa-shoe-prints"></i>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
              {data?.digitalFootprints?.length ?? '-'}
            </div>
            <div className="text-[11px] text-purple-700 font-medium mt-1">
              Clock-ins, visits, tasks, and system logs
            </div>
          </div>

          <div className="bg-teal-50/60 border border-teal-100/80 rounded-2xl p-4.5 transition-all hover:bg-teal-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-900">Caregiver Clock-Ins</span>
              <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-sm shadow-2xs">
                <i className="fa-solid fa-location-crosshairs"></i>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
              {data?.stats?.totalClockIns ?? data?.digitalFootprints?.filter((f) => f.activityType === 'CLOCK_IN').length ?? '-'}
            </div>
            <div className="text-[11px] text-teal-700 font-medium mt-1">
              EVV GPS verified clock-in events
            </div>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-2xl p-4.5 transition-all hover:bg-emerald-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">Total Clients</span>
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm shadow-2xs">
                <i className="fa-solid fa-users"></i>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
              {data?.stats?.totalClients ?? '-'}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-1">
              Active care recipients & patient homes
            </div>
          </div>

          <div className="bg-blue-50/60 border border-blue-100/80 rounded-2xl p-4.5 transition-all hover:bg-blue-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Active Staff</span>
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-sm shadow-2xs">
                <i className="fa-solid fa-user-nurse"></i>
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
              {data?.stats?.totalCaregivers ?? '-'}
            </div>
            <div className="text-[11px] text-blue-700 font-medium mt-1">
              Field caregivers & pod coordinators
            </div>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 border-b border-gray-100 pt-2 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('footprints')}
            className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'footprints'
                ? 'border-[#77248c] text-[#77248c]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <i className="fa-solid fa-shoe-prints text-sm"></i>
            Activities & Digital Footprints
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black ml-1">
              {data?.digitalFootprints?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('clients')}
            className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'clients'
                ? 'border-[#77248c] text-[#77248c]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <i className="fa-solid fa-users text-sm"></i>
            Clients & Patients
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black ml-1">
              {data?.clients?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('caregivers')}
            className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'caregivers'
                ? 'border-[#77248c] text-[#77248c]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <i className="fa-solid fa-user-nurse text-sm"></i>
            Caregivers & Staff
            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-black ml-1">
              {data?.caregivers?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('audits')}
            className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'audits'
                ? 'border-[#77248c] text-[#77248c]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <i className="fa-solid fa-shield-halved text-sm"></i>
            System Audit Trail
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black ml-1">
              {data?.audits?.length || 0}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <i className="fa-solid fa-circle-exclamation text-red-500"></i>
            {error}
          </div>
          <button
            onClick={fetchData}
            className="text-red-800 underline hover:no-underline font-bold text-xs cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ================= 1. ACTIVITIES & DIGITAL FOOTPRINTS VIEW ================= */}
      {activeSubTab === 'footprints' && (
        <div className="space-y-4 animate-fade-in">
          {/* ================= PROMINENT CAREGIVER VS CLIENT FILTER BAR ================= */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-200/90 space-y-4">
            {/* Row 1: Primary Entity Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl">
                <button
                  onClick={() => setEntityFilter('ALL')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    entityFilter === 'ALL'
                      ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className="fa-solid fa-layer-group text-purple-600"></i>
                  All Activities
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-gray-200 text-gray-700">
                    {data?.digitalFootprints?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setEntityFilter('CAREGIVER')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    entityFilter === 'CAREGIVER'
                      ? 'bg-[#77248c] text-white shadow-xs font-extrabold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className="fa-solid fa-user-nurse"></i>
                  Caregivers Only
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${entityFilter === 'CAREGIVER' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {data?.digitalFootprints?.filter((f) => f.entityType === 'CAREGIVER' || f.entityType === 'BOTH').length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setEntityFilter('CLIENT')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    entityFilter === 'CLIENT'
                      ? 'bg-[#77248c] text-white shadow-xs font-extrabold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className="fa-solid fa-users"></i>
                  Clients / Patients Only
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${entityFilter === 'CLIENT' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {data?.digitalFootprints?.filter((f) => f.entityType === 'CLIENT' || f.entityType === 'BOTH').length || 0}
                  </span>
                </button>
              </div>

              {/* CSV Export of current filtered list */}
              <button
                onClick={() => exportDigitalFootprintsCSV(filteredFootprints)}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
                title="Download this filtered view as a CSV spreadsheet"
              >
                <i className="fa-solid fa-file-arrow-down text-sm"></i>
                Download Footprints CSV ({filteredFootprints.length})
              </button>
            </div>

            {/* Row 2: Secondary Dropdowns & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  value={footprintSearch}
                  onChange={(e) => setFootprintSearch(e.target.value)}
                  placeholder="Search caregiver, patient, address, clinical notes, tasks..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] transition-all"
                />
                {footprintSearch && (
                  <button
                    onClick={() => setFootprintSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                )}
              </div>

              {/* Caregiver Selector */}
              <div>
                <select
                  value={selectedCaregiverId}
                  onChange={(e) => setSelectedCaregiverId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
                >
                  <option value="ALL">All Caregivers</option>
                  {(data?.caregivers || []).map((cg) => (
                    <option key={cg.id} value={cg.id}>
                      {cg.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Client / Patient Selector */}
              <div>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
                >
                  <option value="ALL">All Clients / Patients</option>
                  {(data?.clients || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Activity Type Filter */}
              <div>
                <select
                  value={activityTypeFilter}
                  onChange={(e) => setActivityTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
                >
                  <option value="ALL">All Activity Types</option>
                  <option value="CLOCK_IN">Clock-In & GPS Location</option>
                  <option value="CLOCK_OUT">Clock-Out & Duration</option>
                  <option value="SERVICE_DELIVERY">Clinical Tasks & Services</option>
                  <option value="FAMILY_APPROVAL">Family Approvals</option>
                  <option value="AUDIT_EVENT">System Audits</option>
                </select>
              </div>
            </div>

            {/* Row 3: Quick Filter Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Geofence Compliance:</span>
              <button
                onClick={() => setLocationComplianceFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  locationComplianceFilter === 'ALL'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Locations
              </button>
              <button
                onClick={() => setLocationComplianceFilter('INSIDE_GEOFENCE')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  locationComplianceFilter === 'INSIDE_GEOFENCE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <i className="fa-solid fa-circle-check text-[10px]"></i>
                Verified On-Site (Inside Geofence)
              </button>
              <button
                onClick={() => setLocationComplianceFilter('EXCEPTION_OVERRIDE')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  locationComplianceFilter === 'EXCEPTION_OVERRIDE'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                Location Override / Exceptions
              </button>
            </div>
          </div>

          {/* Activity Cards List */}
          {isLoading ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-circle-notch animate-spin text-3xl text-[#77248c] mb-3"></i>
              <p className="text-xs text-gray-500 font-semibold">Compiling digital footprints & location records...</p>
            </div>
          ) : filteredFootprints.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-shoe-prints text-4xl text-gray-300 mb-3"></i>
              <h4 className="text-sm font-bold text-gray-800">No Digital Footprints Found</h4>
              <p className="text-xs text-gray-500 mt-1">Try resetting your filters or search terms.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFootprints.map((fp) => (
                <div
                  key={fp.id}
                  className="bg-white rounded-2xl p-4.5 border border-gray-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    {/* Left: Icon & Core Details */}
                    <div className="flex items-start gap-3.5 flex-1">
                      {/* Activity Type Icon Badge */}
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-base shadow-2xs ${
                          fp.activityType === 'CLOCK_IN'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : fp.activityType === 'CLOCK_OUT'
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : fp.activityType === 'SERVICE_DELIVERY'
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : fp.activityType === 'FAMILY_APPROVAL'
                            ? 'bg-teal-100 text-teal-700 border border-teal-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {fp.activityType === 'CLOCK_IN' && <i className="fa-solid fa-location-crosshairs"></i>}
                        {fp.activityType === 'CLOCK_OUT' && <i className="fa-solid fa-flag-checkered"></i>}
                        {fp.activityType === 'SERVICE_DELIVERY' && <i className="fa-solid fa-notes-medical"></i>}
                        {fp.activityType === 'FAMILY_APPROVAL' && <i className="fa-solid fa-signature"></i>}
                        {fp.activityType === 'AUDIT_EVENT' && <i className="fa-solid fa-shield-halved"></i>}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title, Entity Tag & Timestamp */}
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm tracking-tight">{fp.title}</h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${
                              fp.entityType === 'CAREGIVER'
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : fp.entityType === 'CLIENT'
                                ? 'bg-purple-50 text-[#77248c] border border-purple-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {fp.entityType}
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium">
                            <i className="fa-regular fa-clock text-gray-400 mr-1"></i>
                            {formatDateTime(fp.timestamp)}
                          </span>
                        </div>

                        {/* Caregiver & Client Names */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                          {fp.caregiver && (
                            <span className="flex items-center gap-1 font-semibold text-gray-800">
                              <i className="fa-solid fa-user-nurse text-teal-600"></i>
                              Caregiver: {fp.caregiver.name} ({fp.caregiver.email})
                            </span>
                          )}
                          {fp.client && (
                            <span className="flex items-center gap-1 font-semibold text-gray-800">
                              <i className="fa-solid fa-user text-purple-600"></i>
                              Patient: {fp.client.name}
                            </span>
                          )}
                        </div>

                        {/* Location Footprint Row */}
                        {fp.location && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            {fp.location.clockInLat !== undefined && fp.location.clockInLat !== null && (
                              <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-700 font-mono">
                                GPS Lat/Lng: {fp.location.clockInLat.toFixed(5)}, {fp.location.clockInLng?.toFixed(5)}
                              </span>
                            )}
                            {fp.location.distanceMeters !== undefined && fp.location.distanceMeters !== null && (
                              <span
                                className={`px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 ${
                                  fp.location.withinGeofence
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                <i className={`fa-solid ${fp.location.withinGeofence ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                                {fp.location.distanceMeters}m from patient home ({fp.location.withinGeofence ? 'Inside 100m Geofence' : 'Outside Geofence'})
                              </span>
                            )}
                            {fp.location.isOverrideException && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                                ⚠️ Location Override: {fp.location.overrideReason || 'Admin Approved'}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Narrative Details */}
                        <p className="mt-2 text-xs text-gray-700 leading-relaxed font-mono bg-gray-50/70 p-2.5 rounded-xl border border-gray-100 break-words">
                          {fp.details}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex md:flex-col items-end justify-between gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          fp.status === 'COMPLETED' || fp.status === 'VERIFIED_LOCATION' || fp.status === 'SUCCESS' || fp.status === 'FAMILY_APPROVED'
                            ? 'bg-emerald-600 text-white'
                            : fp.status === 'EXCEPTION_OVERRIDE'
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-700 text-white'
                        }`}
                      >
                        {fp.status}
                      </span>

                      <button
                        onClick={() => setSelectedFootprintDetail(fp)}
                        className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-[#77248c] text-[#77248c] hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fa-solid fa-magnifying-glass-plus"></i>
                        Inspect Footprint
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 2. CLIENTS DIRECTORY VIEW ================= */}
      {activeSubTab === 'clients' && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search clients by name, address, medical condition, family sponsor..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-[#77248c] transition-all"
              />
              {clientSearch && (
                <button
                  onClick={() => setClientSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={clientTierFilter}
                onChange={(e) => setClientTierFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Care Tiers</option>
                <option value="Standard">Standard Care</option>
                <option value="Specialized">Specialized</option>
                <option value="24/7">24/7 Intensive</option>
              </select>

              <select
                value={clientReferralFilter}
                onChange={(e) => setClientReferralFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Client Types</option>
                <option value="Private">Private Pay</option>
                <option value="Government">Government Client</option>
              </select>

              <button
                onClick={exportClientsCSV}
                className="px-3 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download filtered clients as CSV"
              >
                <i className="fa-solid fa-download"></i>
                CSV ({filteredClients.length})
              </button>
            </div>
          </div>

          {/* Clients Grid / Cards */}
          {isLoading ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-circle-notch animate-spin text-3xl text-[#77248c] mb-3"></i>
              <p className="text-xs text-gray-500 font-semibold">Loading client records...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-user-xmark text-4xl text-gray-300 mb-3"></i>
              <h4 className="text-sm font-bold text-gray-800">No Clients Found</h4>
              <p className="text-xs text-gray-500 mt-1">Try refining your search or filter options.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Client Name, Tier & Referral */}
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-gray-900 text-base">{client.name}</h3>
                          {client.referralType === 'Government Client' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                              Gov: {client.governmentProgram || 'Sponsor'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                          <i className="fa-solid fa-location-dot text-gray-400"></i>
                          {client.address}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-purple-50 text-[#77248c] text-[11px] font-extrabold border border-purple-100">
                          {client.careTier}
                        </span>
                        <div className="text-[11px] font-bold text-gray-900 mt-1">
                          ${client.billingRatePerHour}/hr
                        </div>
                      </div>
                    </div>

                    {/* Caregiver Pods Info */}
                    <div className="mt-3.5 bg-gray-50/70 rounded-xl p-3 border border-gray-100 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Assigned Pod Caregivers
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            P
                          </span>
                          <div className="truncate">
                            <span className="text-[11px] font-bold text-gray-800 block truncate">
                              {client.pods.primary?.name || 'No Primary Caregiver'}
                            </span>
                            <span className="text-[10px] text-gray-500 truncate block">
                              {client.pods.primary?.email || 'Unassigned'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            S
                          </span>
                          <div className="truncate">
                            <span className="text-[11px] font-bold text-gray-800 block truncate">
                              {client.pods.secondary1?.name || 'No Backup Caregiver'}
                            </span>
                            <span className="text-[10px] text-gray-500 truncate block">
                              {client.pods.secondary1?.email || 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Metrics Bar */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-gray-600 bg-purple-50/30 px-3 py-2 rounded-xl border border-purple-50">
                      <span className="flex items-center gap-1 font-semibold">
                        <i className="fa-solid fa-clock-rotate-left text-purple-600"></i>
                        {client.metrics.totalShifts} Total Shifts
                      </span>
                      <span className="font-bold text-emerald-700">
                        {client.metrics.completedShifts} Completed
                      </span>
                      <span className="font-bold text-blue-700">
                        {client.metrics.upcomingShifts} Upcoming
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-400 font-medium">
                      ID: {client.id.slice(0, 8)}... • Enrolled {formatDate(client.createdAt)}
                    </span>
                    <button
                      onClick={() => setSelectedClientDetail(client)}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-[#77248c] text-[#77248c] hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-clipboard-list"></i>
                      View Audits & Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 3. CAREGIVERS DIRECTORY VIEW ================= */}
      {activeSubTab === 'caregivers' && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={caregiverSearch}
                onChange={(e) => setCaregiverSearch(e.target.value)}
                placeholder="Search staff & caregivers by name, email, phone number, title..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-[#77248c] transition-all"
              />
              {caregiverSearch && (
                <button
                  onClick={() => setCaregiverSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={caregiverRoleFilter}
                onChange={(e) => setCaregiverRoleFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="CAREGIVER">Caregivers</option>
                <option value="ADMIN">Administrators</option>
              </select>

              <button
                onClick={exportCaregiversCSV}
                className="px-3 py-2 text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download filtered caregivers as CSV"
              >
                <i className="fa-solid fa-download"></i>
                CSV ({filteredCaregivers.length})
              </button>
            </div>
          </div>

          {/* Caregivers Grid */}
          {isLoading ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-circle-notch animate-spin text-3xl text-[#77248c] mb-3"></i>
              <p className="text-xs text-gray-500 font-semibold">Loading caregiver records...</p>
            </div>
          ) : filteredCaregivers.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <i className="fa-solid fa-user-nurse text-4xl text-gray-300 mb-3"></i>
              <h4 className="text-sm font-bold text-gray-800">No Caregivers Found</h4>
              <p className="text-xs text-gray-500 mt-1">Adjust your search or filter settings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredCaregivers.map((cg) => (
                <div
                  key={cg.id}
                  className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Name, Role, Pay */}
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-gray-900 text-base">{cg.name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              cg.role === 'ADMIN'
                                ? 'bg-purple-100 text-[#77248c]'
                                : 'bg-teal-50 text-teal-800 border border-teal-200'
                            }`}
                          >
                            {cg.role}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                          <span>
                            <i className="fa-solid fa-envelope text-gray-400 mr-1"></i>
                            {cg.email}
                          </span>
                          <span>•</span>
                          <span>
                            <i className="fa-solid fa-phone text-gray-400 mr-1"></i>
                            {cg.phoneNumber}
                          </span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-black text-gray-900">${cg.payRate}/hr</div>
                        <div className="text-[10px] font-semibold text-gray-400">Pay Rate</div>
                      </div>
                    </div>

                    {/* Stats & Rating */}
                    <div className="mt-3.5 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-purple-50/40 border border-purple-100/60 rounded-xl p-2">
                        <div className="text-xs font-bold text-purple-900">{cg.metrics.completedShifts}</div>
                        <div className="text-[10px] text-purple-700 font-medium">Completed</div>
                      </div>

                      <div className="bg-teal-50/40 border border-teal-100/60 rounded-xl p-2">
                        <div className="text-xs font-bold text-teal-900">{cg.metrics.upcomingShifts}</div>
                        <div className="text-[10px] text-teal-700 font-medium">Upcoming</div>
                      </div>

                      <div className="bg-amber-50/40 border border-amber-100/60 rounded-xl p-2">
                        <div className="text-xs font-bold text-amber-900 flex items-center justify-center gap-1">
                          <i className="fa-solid fa-star text-amber-500 text-[10px]"></i>
                          {cg.metrics.averageRating !== null ? `${cg.metrics.averageRating} / 5` : 'New'}
                        </div>
                        <div className="text-[10px] text-amber-700 font-medium">
                          {cg.metrics.reviewsCount} {cg.metrics.reviewsCount === 1 ? 'Review' : 'Reviews'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-400 font-medium">
                      Joined {formatDate(cg.createdAt)} • {cg.mustChangePassword ? '⚠️ Temp Password' : '✓ Verified'}
                    </span>
                    <button
                      onClick={() => setSelectedCaregiverDetail(cg)}
                      className="px-3.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-700 text-teal-800 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fa-solid fa-clock-rotate-left"></i>
                      View Audits & Performance
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 4. AUDIT LOGS VIEW ================= */}
      {activeSubTab === 'audits' && (
        <div className="space-y-4 animate-fade-in">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail by action, actor name, email, target details..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-[#77248c] transition-all"
              />
              {auditSearch && (
                <button
                  onClick={() => setAuditSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={auditRoleFilter}
                onChange={(e) => setAuditRoleFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CAREGIVER">CAREGIVER</option>
                <option value="FAMILY_MEMBER">FAMILY_MEMBER</option>
              </select>

              <select
                value={auditOutcomeFilter}
                onChange={(e) => setAuditOutcomeFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c] text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Outcomes</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
              </select>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-lock text-purple-700"></i>
                <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                  Audit Trail Records
                </span>
                <span className="text-xs text-gray-500 font-medium">({filteredAudits.length} events)</span>
              </div>
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                HIPAA & HITECH Compliant Logging
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center">
                <i className="fa-solid fa-circle-notch animate-spin text-3xl text-[#77248c] mb-3"></i>
                <p className="text-xs text-gray-500 font-semibold">Loading audit records...</p>
              </div>
            ) : filteredAudits.length === 0 ? (
              <div className="p-12 text-center">
                <i className="fa-solid fa-folder-open text-4xl text-gray-300 mb-3"></i>
                <h4 className="text-sm font-bold text-gray-800">No Audit Events Found</h4>
                <p className="text-xs text-gray-500 mt-1">Try modifying your search or filter criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100/60 text-gray-700 font-bold border-b border-gray-200 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor (User)</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Outcome</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAudits.map((audit) => (
                      <tr key={audit.id} className="hover:bg-purple-50/20 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-gray-600 font-medium text-[11px]">
                          {formatDateTime(audit.timestamp)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-purple-50 text-[#77248c] border border-purple-200 tracking-wide">
                            {audit.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-gray-900">{audit.userName}</div>
                          <div className="text-[10px] text-gray-500">{audit.userEmail}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              audit.userRole === 'ADMIN'
                                ? 'bg-purple-100 text-[#77248c]'
                                : audit.userRole === 'CAREGIVER'
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {audit.userRole}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              audit.outcome === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                            }`}
                          >
                            {audit.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-700 max-w-md font-mono text-[11px] leading-relaxed break-words">
                          {audit.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: DIGITAL FOOTPRINT INSPECTION ================= */}
      {selectedFootprintDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5 bg-[#77248c] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white text-lg">
                  <i className="fa-solid fa-fingerprint"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight">{selectedFootprintDetail.title}</h3>
                  <p className="text-xs text-purple-100 flex items-center gap-2 mt-0.5">
                    <span>{formatDateTime(selectedFootprintDetail.timestamp)}</span>
                    <span>•</span>
                    <span className="font-bold uppercase tracking-wider">{selectedFootprintDetail.activityType}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFootprintDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700">
              {/* Location & GPS Box */}
              {selectedFootprintDetail.location && (
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                  <div className="font-bold text-[#77248c] text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-location-dot"></i>
                    GPS Location & Geofence Verification
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <span className="text-gray-400 block font-bold">Clock-In Coordinates:</span>
                      <span className="font-mono text-gray-800">
                        {selectedFootprintDetail.location.clockInLat
                          ? `${selectedFootprintDetail.location.clockInLat.toFixed(6)}, ${selectedFootprintDetail.location.clockInLng?.toFixed(6)}`
                          : 'Not recorded'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-bold">Patient Home Coordinates:</span>
                      <span className="font-mono text-gray-800">
                        {selectedFootprintDetail.client?.latitude
                          ? `${selectedFootprintDetail.client.latitude.toFixed(6)}, ${selectedFootprintDetail.client.longitude?.toFixed(6)}`
                          : 'Not on file'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-bold">Distance to Patient:</span>
                      <span className="font-bold text-gray-800">
                        {selectedFootprintDetail.location.distanceMeters !== undefined && selectedFootprintDetail.location.distanceMeters !== null
                          ? `${selectedFootprintDetail.location.distanceMeters} meters`
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-bold">Geofence Compliance:</span>
                      <span
                        className={`font-bold ${
                          selectedFootprintDetail.location.withinGeofence ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {selectedFootprintDetail.location.withinGeofence ? 'Verified Within 100m Perimeter' : 'Recorded Off-Site'}
                      </span>
                    </div>
                  </div>

                  {selectedFootprintDetail.location.isOverrideException && (
                    <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                      <strong>Location Override:</strong> {selectedFootprintDetail.location.overrideReason}
                    </div>
                  )}
                </div>
              )}

              {/* Service & Clinical Tasks */}
              {selectedFootprintDetail.service && (
                <div className="bg-purple-50/40 rounded-2xl p-4 border border-purple-100 text-[11px]">
                  <div className="font-bold text-purple-900 text-xs uppercase tracking-wider mb-2">
                    Services Rendered & Care Tasks
                  </div>
                  {selectedFootprintDetail.service.completedTasks && selectedFootprintDetail.service.completedTasks.length > 0 ? (
                    <ul className="space-y-1 mt-1">
                      {selectedFootprintDetail.service.completedTasks.map((t, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-gray-800">
                          <i className="fa-solid fa-circle-check text-emerald-600 text-[10px]"></i>
                          <strong>{t.name}</strong> - {t.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600 italic">Standard personal care and supervision.</p>
                  )}

                  {selectedFootprintDetail.service.clinicalNotes && (
                    <div className="mt-3 pt-2 border-t border-purple-100">
                      <strong className="text-purple-900 block mb-1">Clinical Observations & Care Notes:</strong>
                      <p className="text-gray-800 bg-white p-2.5 rounded-xl border border-purple-100">
                        {selectedFootprintDetail.service.clinicalNotes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Full Narrative Details */}
              <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 text-[11px]">
                <strong className="text-gray-900 block uppercase tracking-wider mb-1 text-[10px]">Full Audit Log Narrative</strong>
                <p className="font-mono text-gray-700 leading-relaxed">{selectedFootprintDetail.details}</p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-400">Akirapa EVV & Audit Trail Verification</span>
              <button
                onClick={() => setSelectedFootprintDetail(null)}
                className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLIENT DETAIL ================= */}
      {selectedClientDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5 bg-[#77248c] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white text-lg">
                  <i className="fa-solid fa-user"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg tracking-tight">{selectedClientDetail.name}</h3>
                  <p className="text-xs text-purple-100 flex items-center gap-2 mt-0.5">
                    <span>Care Tier: {selectedClientDetail.careTier}</span>
                    <span>•</span>
                    <span>Rate: ${selectedClientDetail.billingRatePerHour}/hr</span>
                    <span>•</span>
                    <span>Enrolled: {formatDate(selectedClientDetail.createdAt)}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedClientDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="font-bold text-[#77248c] text-xs uppercase tracking-wider mb-2">
                    Address & Safety Perimeter
                  </div>
                  <p className="text-gray-800 font-semibold">{selectedClientDetail.address}</p>
                  <p className="text-gray-500 text-[11px] mt-1">
                    Geofence Radius: {selectedClientDetail.geofenceRadiusMeter}m
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    Coordinates: {selectedClientDetail.latitude}, {selectedClientDetail.longitude}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="font-bold text-[#77248c] text-xs uppercase tracking-wider mb-2">
                    Contacts & Family Sponsor
                  </div>
                  <p className="text-gray-800 font-semibold">
                    Family Sponsor: {selectedClientDetail.familySponsor?.name || 'Not on file'}
                  </p>
                  <p className="text-gray-500 text-[11px] mt-0.5">
                    {selectedClientDetail.familySponsor?.email || 'No email'} • {selectedClientDetail.familySponsor?.phone || 'No phone'}
                  </p>
                  <p className="text-gray-600 text-[11px] mt-2">
                    Emergency: {selectedClientDetail.emergencyContact?.name || 'None'} ({selectedClientDetail.emergencyContact?.phone || 'No phone'})
                  </p>
                </div>
              </div>

              <div className="bg-purple-50/40 rounded-2xl p-4 border border-purple-100 text-[11px]">
                <div className="font-bold text-purple-900 text-xs uppercase tracking-wider mb-2">
                  Clinical Conditions & Mobility
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="font-bold text-gray-700 block">Conditions:</span>
                    <span className="text-gray-600">{selectedClientDetail.medicalConditions}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block">Allergies:</span>
                    <span className="text-gray-600">{selectedClientDetail.allergies}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block">Mobility:</span>
                    <span className="text-gray-600">{selectedClientDetail.mobility}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-400">Akirapa Home Care Dossier</span>
              <button
                onClick={() => setSelectedClientDetail(null)}
                className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CAREGIVER DETAIL ================= */}
      {selectedCaregiverDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5 bg-teal-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white text-lg">
                  <i className="fa-solid fa-user-nurse"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg tracking-tight">{selectedCaregiverDetail.name}</h3>
                  <p className="text-xs text-teal-100 flex items-center gap-2 mt-0.5">
                    <span>Role: {selectedCaregiverDetail.role}</span>
                    <span>•</span>
                    <span>Pay Rate: ${selectedCaregiverDetail.payRate}/hr</span>
                    <span>•</span>
                    <span>Joined: {formatDate(selectedCaregiverDetail.createdAt)}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCaregiverDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="font-bold text-teal-800 text-xs uppercase tracking-wider mb-2">
                    Contact & Status
                  </div>
                  <p className="font-semibold text-gray-800">{selectedCaregiverDetail.email}</p>
                  <p className="text-gray-500 text-[11px] mt-0.5">Phone: {selectedCaregiverDetail.phoneNumber}</p>
                  <p className="text-gray-500 text-[11px] mt-1">
                    Security: {selectedCaregiverDetail.mustChangePassword ? 'Requires password change' : 'Password active'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="font-bold text-teal-800 text-xs uppercase tracking-wider mb-2">
                    Visit & Performance Stats
                  </div>
                  <p className="font-semibold text-gray-800">
                    Completed Shifts: {selectedCaregiverDetail.metrics.completedShifts} / {selectedCaregiverDetail.metrics.totalShifts}
                  </p>
                  <p className="text-gray-500 text-[11px] mt-0.5">
                    Rating: {selectedCaregiverDetail.metrics.averageRating !== null ? `${selectedCaregiverDetail.metrics.averageRating} / 5` : 'New'} ({selectedCaregiverDetail.metrics.reviewsCount} reviews)
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    Assigned Pods: {selectedCaregiverDetail.podAssignments.length} clients
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-400">Akirapa Staff Credentials</span>
              <button
                onClick={() => setSelectedCaregiverDetail(null)}
                className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
