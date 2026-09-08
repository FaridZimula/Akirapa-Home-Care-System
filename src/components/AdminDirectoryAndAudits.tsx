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

  // Active view tab: 'caregivers' | 'clients'
  const [activeTab, setActiveTab] = useState<'caregivers' | 'clients'>('caregivers');

  // Selected entities (audits only shown when an entity is selected)
  const [selectedCaregiver, setSelectedCaregiver] = useState<CaregiverItem | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);

  // Search queries
  const [caregiverQuery, setCaregiverQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');

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
        throw new Error(resData.error || 'Failed to load directory and audits.');
      }
      setData(resData);

      // Auto-select first item if available for convenience
      if (resData.caregivers?.length > 0 && !selectedCaregiver) {
        setSelectedCaregiver(resData.caregivers[0]);
      }
      if (resData.clients?.length > 0 && !selectedClient) {
        setSelectedClient(resData.clients[0]);
      }
    } catch (err: any) {
      console.error('Error fetching directory and audits:', err);
      setError(err.message || 'Unable to load records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminEmail]);

  // Filtered Caregivers List
  const filteredCaregivers = useMemo(() => {
    if (!data?.caregivers) return [];
    const q = caregiverQuery.toLowerCase().trim();
    if (!q) return data.caregivers;
    return data.caregivers.filter(
      (cg) =>
        cg.name.toLowerCase().includes(q) ||
        cg.email.toLowerCase().includes(q) ||
        cg.phoneNumber.toLowerCase().includes(q)
    );
  }, [data?.caregivers, caregiverQuery]);

  // Filtered Clients List
  const filteredClients = useMemo(() => {
    if (!data?.clients) return [];
    const q = clientQuery.toLowerCase().trim();
    if (!q) return data.clients;
    return data.clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.familySponsor?.name || '').toLowerCase().includes(q) ||
        (c.familySponsor?.email || '').toLowerCase().includes(q)
    );
  }, [data?.clients, clientQuery]);

  // Specific Audits for the Selected Caregiver
  const selectedCaregiverAudits = useMemo(() => {
    if (!selectedCaregiver || !data) return [];
    const footprints = (data.digitalFootprints || []).filter(
      (fp) =>
        fp.caregiver?.id === selectedCaregiver.id ||
        fp.caregiver?.email === selectedCaregiver.email ||
        fp.actor?.email === selectedCaregiver.email
    );
    return footprints;
  }, [selectedCaregiver, data]);

  // Specific Audits for the Selected Client
  const selectedClientAudits = useMemo(() => {
    if (!selectedClient || !data) return [];
    const footprints = (data.digitalFootprints || []).filter(
      (fp) => fp.client?.id === selectedClient.id || fp.client?.name === selectedClient.name
    );
    return footprints;
  }, [selectedClient, data]);

  // Download helper
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

  // Download Selected Caregiver Audits CSV
  const downloadCaregiverAuditsCSV = () => {
    if (!selectedCaregiver) return;
    const headers = [
      'Record ID',
      'Timestamp',
      'Caregiver Name',
      'Caregiver Email',
      'Caregiver Phone',
      'Activity Category',
      'Activity Title',
      'Patient Name',
      'Patient Address',
      'Clock-In Time',
      'Clock-In GPS Lat',
      'Clock-In GPS Lng',
      'Distance to Patient (Meters)',
      'Within Geofence (Yes/No)',
      'Location Override (Yes/No)',
      'Override Reason',
      'Clock-Out Time',
      'Clock-Out GPS Lat',
      'Clock-Out GPS Lng',
      'Visit Duration (Hours)',
      'Tasks & Services Rendered',
      'Clinical Care Notes',
      'Overtime Claimed (Yes/No)',
      'Overtime Reason',
      'Status / Outcome',
      'Full Details Narrative',
    ];

    const rows = selectedCaregiverAudits.map((fp) => [
      escapeCSV(fp.id),
      escapeCSV(formatDateTime(fp.timestamp)),
      escapeCSV(selectedCaregiver.name),
      escapeCSV(selectedCaregiver.email),
      escapeCSV(selectedCaregiver.phoneNumber),
      escapeCSV(fp.category),
      escapeCSV(fp.title),
      escapeCSV(fp.client?.name || 'N/A'),
      escapeCSV(fp.client?.address || 'N/A'),
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

    const cleanName = selectedCaregiver.name.replace(/\s+/g, '_');
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `Caregiver_Audits_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Download Selected Client Audits CSV
  const downloadClientAuditsCSV = () => {
    if (!selectedClient) return;
    const headers = [
      'Record ID',
      'Timestamp',
      'Patient Name',
      'Patient Address',
      'Care Tier',
      'Activity Category',
      'Activity Title',
      'Attending Caregiver',
      'Caregiver Email',
      'Clock-In Time',
      'Clock-In GPS Lat',
      'Clock-In GPS Lng',
      'Distance to Patient (Meters)',
      'Within Geofence (Yes/No)',
      'Location Override (Yes/No)',
      'Override Reason',
      'Clock-Out Time',
      'Visit Duration (Hours)',
      'Care Tasks & Services Delivered',
      'Clinical Care Notes Recorded',
      'Status / Outcome',
      'Full Details Narrative',
    ];

    const rows = selectedClientAudits.map((fp) => [
      escapeCSV(fp.id),
      escapeCSV(formatDateTime(fp.timestamp)),
      escapeCSV(selectedClient.name),
      escapeCSV(selectedClient.address),
      escapeCSV(selectedClient.careTier),
      escapeCSV(fp.category),
      escapeCSV(fp.title),
      escapeCSV(fp.caregiver?.name || fp.actor?.name || 'N/A'),
      escapeCSV(fp.caregiver?.email || fp.actor?.email || 'N/A'),
      escapeCSV(fp.activityType === 'CLOCK_IN' ? formatDateTime(fp.timestamp) : 'N/A'),
      escapeCSV(fp.location?.clockInLat ?? 'N/A'),
      escapeCSV(fp.location?.clockInLng ?? 'N/A'),
      escapeCSV(fp.location?.distanceMeters !== undefined && fp.location?.distanceMeters !== null ? `${fp.location.distanceMeters}m` : 'N/A'),
      escapeCSV(fp.location?.withinGeofence !== undefined && fp.location?.withinGeofence !== null ? (fp.location.withinGeofence ? 'YES' : 'NO') : 'N/A'),
      escapeCSV(fp.location?.isOverrideException ? 'YES' : 'NO'),
      escapeCSV(fp.location?.overrideReason || 'N/A'),
      escapeCSV(fp.activityType === 'CLOCK_OUT' ? formatDateTime(fp.timestamp) : 'N/A'),
      escapeCSV(fp.service?.durationHours ? `${fp.service.durationHours} hrs` : 'N/A'),
      escapeCSV(fp.service?.tasksList?.join('; ') || fp.service?.completedTasks?.map((t) => t.name).join('; ') || 'N/A'),
      escapeCSV(fp.service?.clinicalNotes || 'N/A'),
      escapeCSV(fp.status),
      escapeCSV(fp.details),
    ]);

    const cleanName = selectedClient.name.replace(/\s+/g, '_');
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `Client_Audits_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-7xl mx-auto">
      {/* ================= CLEAN HEADER ================= */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold uppercase tracking-wider mb-2">
            <i className="fa-solid fa-user-shield text-purple-600"></i>
            User & Client Audits
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
            User Audits
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Select any caregiver or client to view their individual activity history, clock-in/out GPS coordinates, and download their audit file.
          </p>
        </div>

        {/* Primary Toggle: Caregivers vs Clients */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start sm:self-center shrink-0">
          <button
            onClick={() => setActiveTab('caregivers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'caregivers'
                ? 'bg-[#77248c] text-white shadow-xs font-extrabold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="fa-solid fa-user-nurse"></i>
            Caregivers ({data?.caregivers?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'clients'
                ? 'bg-[#77248c] text-white shadow-xs font-extrabold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="fa-solid fa-users"></i>
            Clients ({data?.clients?.length || 0})
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <i className="fa-solid fa-circle-exclamation text-red-500"></i>
            {error}
          </div>
          <button onClick={fetchData} className="text-red-800 underline font-bold cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ================= CAREGIVERS VIEW ================= */}
      {activeTab === 'caregivers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: List of all Caregivers (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                Select a Caregiver
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                {filteredCaregivers.length} total
              </span>
            </div>

            {/* Search */}
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={caregiverQuery}
                onChange={(e) => setCaregiverQuery(e.target.value)}
                placeholder="Search caregiver name, email..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c]"
              />
            </div>

            {/* Caregivers List */}
            {isLoading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                <i className="fa-solid fa-circle-notch animate-spin text-[#77248c] text-xl mb-2"></i>
                <p>Loading caregivers...</p>
              </div>
            ) : filteredCaregivers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No caregivers found.</p>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredCaregivers.map((cg) => {
                  const isSelected = selectedCaregiver?.id === cg.id;
                  return (
                    <div
                      key={cg.id}
                      onClick={() => setSelectedCaregiver(cg)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'border-[#77248c] bg-purple-50/70 shadow-xs ring-1 ring-purple-200'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold ${isSelected ? 'text-[#77248c]' : 'text-gray-900'}`}>
                          {cg.name}
                        </h4>
                        <span className="text-[10px] font-bold text-gray-500">${cg.payRate}/hr</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{cg.email}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500 pt-1.5 border-t border-gray-100">
                        <span>{cg.podAssignments.length} Assigned Pods</span>
                        <span className="font-semibold text-emerald-700">
                          {cg.metrics.completedShifts} Visits Done
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Caregiver's Audits & Download (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedCaregiver ? (
              <>
                {/* Caregiver Details Header & Download Button */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-gray-900">{selectedCaregiver.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-teal-50 text-teal-800 border border-teal-200">
                        {selectedCaregiver.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-3">
                      <span><i className="fa-solid fa-envelope text-gray-400 mr-1"></i>{selectedCaregiver.email}</span>
                      <span>•</span>
                      <span><i className="fa-solid fa-phone text-gray-400 mr-1"></i>{selectedCaregiver.phoneNumber}</span>
                      <span>•</span>
                      <span>Pay Rate: <strong>${selectedCaregiver.payRate}/hr</strong></span>
                    </p>
                  </div>

                  {/* DOWNLOAD FILE BUTTON FOR THIS CAREGIVER */}
                  <button
                    onClick={downloadCaregiverAuditsCSV}
                    disabled={selectedCaregiverAudits.length === 0}
                    className="px-4 py-2.5 bg-[#77248c] hover:bg-[#631e75] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
                    title="Download this caregiver's complete audit trail into a CSV file"
                  >
                    <i className="fa-solid fa-file-arrow-down text-sm"></i>
                    Download Audits File (CSV)
                  </button>
                </div>

                {/* Audits & Digital Footprints List */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-clock-rotate-left text-purple-700"></i>
                      <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                        Activity Audits for {selectedCaregiver.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                        {selectedCaregiverAudits.length} Records
                      </span>
                    </div>
                  </div>

                  {selectedCaregiverAudits.length === 0 ? (
                    <div className="py-10 text-center text-xs text-gray-400">
                      <i className="fa-solid fa-shoe-prints text-3xl text-gray-300 mb-2"></i>
                      <p className="font-semibold text-gray-600">No activity audits recorded for this caregiver yet.</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Clock-in events, GPS footprints, and visit tasks will appear here once shifts begin.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedCaregiverAudits.map((fp) => (
                        <div
                          key={fp.id}
                          className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-200/80 hover:bg-purple-50/20 transition-all text-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                                  fp.activityType === 'CLOCK_IN'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : fp.activityType === 'CLOCK_OUT'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-purple-100 text-purple-700'
                                }`}
                              >
                                {fp.activityType === 'CLOCK_IN' && <i className="fa-solid fa-location-crosshairs"></i>}
                                {fp.activityType === 'CLOCK_OUT' && <i className="fa-solid fa-flag-checkered"></i>}
                                {fp.activityType !== 'CLOCK_IN' && fp.activityType !== 'CLOCK_OUT' && (
                                  <i className="fa-solid fa-notes-medical"></i>
                                )}
                              </span>
                              <span className="font-bold text-gray-900">{fp.title}</span>
                            </div>

                            <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">
                              {formatDateTime(fp.timestamp)}
                            </span>
                          </div>

                          {/* Patient & Location Footprints */}
                          <div className="mt-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600">
                            {fp.client && (
                              <span className="font-semibold text-purple-900">
                                Patient: {fp.client.name} ({fp.client.address})
                              </span>
                            )}
                            {fp.location?.clockInLat !== undefined && fp.location?.clockInLat !== null && (
                              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                Lat/Lng: {fp.location.clockInLat.toFixed(5)}, {fp.location.clockInLng?.toFixed(5)}
                              </span>
                            )}
                            {fp.location?.distanceMeters !== undefined && fp.location?.distanceMeters !== null && (
                              <span
                                className={`font-bold ${
                                  fp.location.withinGeofence ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {fp.location.distanceMeters}m ({fp.location.withinGeofence ? 'Inside Geofence' : 'Outside Geofence'})
                              </span>
                            )}
                          </div>

                          {/* Narrative Details */}
                          <p className="mt-2 text-[11px] text-gray-700 bg-white p-2 rounded-lg border border-gray-100 font-mono">
                            {fp.details}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 text-xs text-gray-400">
                <i className="fa-solid fa-user-nurse text-4xl text-gray-300 mb-3"></i>
                <h4 className="text-sm font-bold text-gray-800">Select a Caregiver</h4>
                <p className="mt-1">Click any caregiver from the list on the left to view their audit trail.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= CLIENTS VIEW ================= */}
      {activeTab === 'clients' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: List of all Clients (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                Select a Client / Patient
              </span>
              <span className="text-[11px] text-gray-400 font-medium">{filteredClients.length} total</span>
            </div>

            {/* Search */}
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Search client name, address..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#77248c]"
              />
            </div>

            {/* Clients List */}
            {isLoading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                <i className="fa-solid fa-circle-notch animate-spin text-[#77248c] text-xl mb-2"></i>
                <p>Loading clients...</p>
              </div>
            ) : filteredClients.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No clients found.</p>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredClients.map((c) => {
                  const isSelected = selectedClient?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedClient(c)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'border-[#77248c] bg-purple-50/70 shadow-xs ring-1 ring-purple-200'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold ${isSelected ? 'text-[#77248c]' : 'text-gray-900'}`}>
                          {c.name}
                        </h4>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                          {c.careTier}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{c.address}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500 pt-1.5 border-t border-gray-100">
                        <span>Primary: {c.pods.primary?.name || 'Unassigned'}</span>
                        <span className="font-semibold text-emerald-700">
                          {c.metrics.completedShifts} Visits Done
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Client's Audits & Download (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedClient ? (
              <>
                {/* Client Details Header & Download Button */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-gray-900">{selectedClient.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-50 text-[#77248c] border border-purple-200">
                        {selectedClient.careTier}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-3">
                      <span><i className="fa-solid fa-location-dot text-gray-400 mr-1"></i>{selectedClient.address}</span>
                      <span>•</span>
                      <span>Billing: <strong>${selectedClient.billingRatePerHour}/hr</strong></span>
                      <span>•</span>
                      <span>Family Sponsor: <strong>{selectedClient.familySponsor?.name || 'Not on file'}</strong></span>
                    </p>
                  </div>

                  {/* DOWNLOAD FILE BUTTON FOR THIS CLIENT */}
                  <button
                    onClick={downloadClientAuditsCSV}
                    disabled={selectedClientAudits.length === 0}
                    className="px-4 py-2.5 bg-[#77248c] hover:bg-[#631e75] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
                    title="Download this client's complete visit and audit trail into a CSV file"
                  >
                    <i className="fa-solid fa-file-arrow-down text-sm"></i>
                    Download Audits File (CSV)
                  </button>
                </div>

                {/* Audits & Visit Footprints List */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-clock-rotate-left text-purple-700"></i>
                      <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                        Care & Service Audits for {selectedClient.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                        {selectedClientAudits.length} Records
                      </span>
                    </div>
                  </div>

                  {selectedClientAudits.length === 0 ? (
                    <div className="py-10 text-center text-xs text-gray-400">
                      <i className="fa-solid fa-notes-medical text-3xl text-gray-300 mb-2"></i>
                      <p className="font-semibold text-gray-600">No visit or audit records logged for this client yet.</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Completed care visits, clock-ins, and services delivered will appear here once shifts begin.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedClientAudits.map((fp) => (
                        <div
                          key={fp.id}
                          className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-200/80 hover:bg-purple-50/20 transition-all text-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                                  fp.activityType === 'SERVICE_DELIVERY'
                                    ? 'bg-purple-100 text-purple-700'
                                    : fp.activityType === 'CLOCK_IN'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {fp.activityType === 'CLOCK_IN' && <i className="fa-solid fa-location-crosshairs"></i>}
                                {fp.activityType === 'CLOCK_OUT' && <i className="fa-solid fa-flag-checkered"></i>}
                                {fp.activityType !== 'CLOCK_IN' && fp.activityType !== 'CLOCK_OUT' && (
                                  <i className="fa-solid fa-notes-medical"></i>
                                )}
                              </span>
                              <span className="font-bold text-gray-900">{fp.title}</span>
                            </div>

                            <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">
                              {formatDateTime(fp.timestamp)}
                            </span>
                          </div>

                          {/* Attending Caregiver & GPS info */}
                          <div className="mt-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600">
                            {fp.caregiver && (
                              <span className="font-semibold text-teal-800">
                                Attending Caregiver: {fp.caregiver.name} ({fp.caregiver.email})
                              </span>
                            )}
                            {fp.location?.clockInLat !== undefined && fp.location?.clockInLat !== null && (
                              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                Clock-In GPS: {fp.location.clockInLat.toFixed(5)}, {fp.location.clockInLng?.toFixed(5)}
                              </span>
                            )}
                            {fp.location?.distanceMeters !== undefined && fp.location?.distanceMeters !== null && (
                              <span
                                className={`font-bold ${
                                  fp.location.withinGeofence ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {fp.location.distanceMeters}m ({fp.location.withinGeofence ? 'Inside Geofence' : 'Outside Geofence'})
                              </span>
                            )}
                          </div>

                          {/* Narrative Details */}
                          <p className="mt-2 text-[11px] text-gray-700 bg-white p-2 rounded-lg border border-gray-100 font-mono">
                            {fp.details}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 text-xs text-gray-400">
                <i className="fa-solid fa-users text-4xl text-gray-300 mb-3"></i>
                <h4 className="text-sm font-bold text-gray-800">Select a Client</h4>
                <p className="mt-1">Click any client from the list on the left to view their audit trail.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
