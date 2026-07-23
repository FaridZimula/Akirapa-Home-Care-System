"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var crypto_1 = require("../src/lib/crypto");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var admin, coordinator, caregiverAmara, caregiverBrendan, caregiverChloe, caregiverDerrick, familyDavid, familyClara, familyMarcus, clientSarah, clientRobert, clientEleanor, carePlanSarah, carePlanRobert, now, shiftInProgressStart, shiftInProgressEnd, activeShift, pastStart, pastEnd, completedShift, upcomingStart, upcomingEnd, unconfirmedStart, unconfirmedEnd, sampleLogDetails1, sampleLogDetails2, availabilityData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Seeding rich database demo records...');
                    // 1. Clean existing database tables
                    return [4 /*yield*/, prisma.notification.deleteMany()];
                case 1:
                    // 1. Clean existing database tables
                    _a.sent();
                    return [4 /*yield*/, prisma.auditLog.deleteMany()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, prisma.activityLog.deleteMany()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, prisma.linkedFamilyMember.deleteMany()];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, prisma.shiftTask.deleteMany()];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, prisma.caregiverLocationHistory.deleteMany()];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, prisma.shift.deleteMany()];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, prisma.carePlanTask.deleteMany()];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, prisma.carePlan.deleteMany()];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, prisma.caregiverPod.deleteMany()];
                case 10:
                    _a.sent();
                    return [4 /*yield*/, prisma.client.deleteMany()];
                case 11:
                    _a.sent();
                    return [4 /*yield*/, prisma.availability.deleteMany()];
                case 12:
                    _a.sent();
                    return [4 /*yield*/, prisma.user.deleteMany()];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'admin@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Elena Rostova',
                                role: client_1.UserRole.ADMIN,
                                phoneNumber: '+16045550101',
                                profileMetadata: JSON.stringify({
                                    bio: 'Senior Clinical Operations Director with 12+ years in Home Care Systems administration.',
                                    certifications: ['Healthcare Admin Certified', 'HIPAA Privacy Officer'],
                                }),
                            },
                        })];
                case 14:
                    admin = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'coordinator@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Grace Taylor',
                                role: client_1.UserRole.CARE_COORDINATOR,
                                phoneNumber: '+16045550102',
                                profileMetadata: JSON.stringify({
                                    bio: 'Care Logistics Coordinator specializing in automated shift matching & emergency backups.',
                                    certifications: ['CPR/BLS Certified', 'Care Coordination License'],
                                }),
                            },
                        })];
                case 15:
                    coordinator = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'primary@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Amara Okafor',
                                role: client_1.UserRole.CAREGIVER,
                                phoneNumber: '+16045550103',
                                profileMetadata: JSON.stringify({
                                    bio: 'Compassionate Certified Nursing Assistant with 7 years of specialized elderly memory care experience.',
                                    certifications: ['CPR / BLS Certified', 'Certified Nursing Assistant (CNA)', 'Alzheimer\'s & Dementia Specialist'],
                                    specialties: 'Memory Care, Elderly Mobility, Hydration Management',
                                }),
                            },
                        })];
                case 16:
                    caregiverAmara = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'backup1@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Brendan Miller',
                                role: client_1.UserRole.CAREGIVER,
                                phoneNumber: '+16045550104',
                                profileMetadata: JSON.stringify({
                                    bio: 'Licensed Practical Nurse specializing in post-stroke rehabilitation and vital sign monitoring.',
                                    certifications: ['Licensed Practical Nurse (LPN)', 'First Aid Certified', 'Medication Administration'],
                                    specialties: 'Post-Op Rehab, Vital Sign Telemetry, Stroke Recovery Care',
                                }),
                            },
                        })];
                case 17:
                    caregiverBrendan = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'backup2@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Chloe Chen',
                                role: client_1.UserRole.CAREGIVER,
                                phoneNumber: '+16045550105',
                                profileMetadata: JSON.stringify({
                                    bio: 'Dedicated home health caregiver with expertise in palliative care and nutrition preparation.',
                                    certifications: ['CPR / BLS Certified', 'First Aid Certified'],
                                    specialties: 'Palliative Comfort, Nutritional Meal Prep, Daily Assistance',
                                }),
                            },
                        })];
                case 18:
                    caregiverChloe = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'derrick@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Derrick Vance',
                                role: client_1.UserRole.CAREGIVER,
                                phoneNumber: '+16045550107',
                                profileMetadata: JSON.stringify({
                                    bio: 'Physical Therapy Assistant focused on mobility maintenance and fall prevention strategies.',
                                    certifications: ['Certified Nursing Assistant (CNA)', 'Physical Therapy Aide'],
                                    specialties: 'Gait Training, Fall Prevention, Transfer Assistance',
                                }),
                            },
                        })];
                case 19:
                    caregiverDerrick = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'family@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'David Jenkins',
                                role: client_1.UserRole.FAMILY_MEMBER,
                                phoneNumber: '+16045550106',
                            },
                        })];
                case 20:
                    familyDavid = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'clara@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Clara Montgomery',
                                role: client_1.UserRole.FAMILY_MEMBER,
                                phoneNumber: '+16045550108',
                            },
                        })];
                case 21:
                    familyClara = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: 'marcus@akirapa.com',
                                passwordHash: 'akirapa2634!',
                                name: 'Marcus Vance',
                                role: client_1.UserRole.FAMILY_MEMBER,
                                phoneNumber: '+16045550109',
                            },
                        })];
                case 22:
                    familyMarcus = _a.sent();
                    return [4 /*yield*/, prisma.client.create({
                            data: {
                                name: 'Sarah Jenkins',
                                address: '750 Burrard St, Vancouver, BC V6Z 2H7',
                                latitude: 49.2827,
                                longitude: -123.1207,
                                geofenceRadiusMeter: 150,
                                profileMetadata: JSON.stringify({
                                    medicalConditions: 'Hypertension, Mild Arthritis, Early Stage Dementia',
                                    emergencyContact: 'Son David Jenkins (+1-604-555-0106)',
                                    allergiesNotes: 'No known drug allergies (NKDA). Prefers morning garden walks.',
                                }),
                            },
                        })];
                case 23:
                    clientSarah = _a.sent();
                    return [4 /*yield*/, prisma.client.create({
                            data: {
                                name: 'Robert Montgomery',
                                address: '1055 W Georgia St, Vancouver, BC V6E 3P3',
                                latitude: 49.2845,
                                longitude: -123.1215,
                                geofenceRadiusMeter: 200,
                                profileMetadata: JSON.stringify({
                                    medicalConditions: 'Post-Stroke Hemiparesis, Speech Aphasia',
                                    emergencyContact: 'Daughter Clara Montgomery (+1-604-555-0108)',
                                    allergiesNotes: 'Penicillin Allergy. Requires assistance with right-sided transfers.',
                                }),
                            },
                        })];
                case 24:
                    clientRobert = _a.sent();
                    return [4 /*yield*/, prisma.client.create({
                            data: {
                                name: 'Eleanor Vance',
                                address: '1128 W Hastings St, Vancouver, BC V6E 4NG',
                                latitude: 49.2882,
                                longitude: -123.1189,
                                geofenceRadiusMeter: 100,
                                profileMetadata: JSON.stringify({
                                    medicalConditions: 'Type 2 Diabetes Mellitus, Osteoarthritis',
                                    emergencyContact: 'Nephew Marcus Vance (+1-604-555-0109)',
                                    allergiesNotes: 'Sulfa drugs. Glucose monitoring required twice daily.',
                                }),
                            },
                        })];
                case 25:
                    clientEleanor = _a.sent();
                    // 4. Assign Caregiver Pods
                    return [4 /*yield*/, prisma.caregiverPod.createMany({
                            data: [
                                // Sarah Jenkins Pod
                                { clientId: clientSarah.id, caregiverId: caregiverAmara.id, role: client_1.PodRole.PRIMARY },
                                { clientId: clientSarah.id, caregiverId: caregiverBrendan.id, role: client_1.PodRole.SECONDARY_1 },
                                { clientId: clientSarah.id, caregiverId: caregiverChloe.id, role: client_1.PodRole.SECONDARY_2 },
                                // Robert Montgomery Pod
                                { clientId: clientRobert.id, caregiverId: caregiverBrendan.id, role: client_1.PodRole.PRIMARY },
                                { clientId: clientRobert.id, caregiverId: caregiverDerrick.id, role: client_1.PodRole.SECONDARY_1 },
                                // Eleanor Vance Pod
                                { clientId: clientEleanor.id, caregiverId: caregiverChloe.id, role: client_1.PodRole.PRIMARY },
                                { clientId: clientEleanor.id, caregiverId: caregiverAmara.id, role: client_1.PodRole.SECONDARY_1 },
                            ],
                        })];
                case 26:
                    // 4. Assign Caregiver Pods
                    _a.sent();
                    // 5. Link Family Members to Clients
                    return [4 /*yield*/, prisma.linkedFamilyMember.createMany({
                            data: [
                                { clientId: clientSarah.id, userId: familyDavid.id },
                                { clientId: clientRobert.id, userId: familyClara.id },
                                { clientId: clientEleanor.id, userId: familyMarcus.id },
                            ],
                        })];
                case 27:
                    // 5. Link Family Members to Clients
                    _a.sent();
                    return [4 /*yield*/, prisma.carePlan.create({ data: { clientId: clientSarah.id } })];
                case 28:
                    carePlanSarah = _a.sent();
                    return [4 /*yield*/, prisma.carePlanTask.createMany({
                            data: [
                                { carePlanId: carePlanSarah.id, taskName: 'Morning Medication', description: 'Administer Lisinopril 10mg with full glass of water', scheduledTime: '08:00 AM', isMandatory: true },
                                { carePlanId: carePlanSarah.id, taskName: 'Nutritional Breakfast', description: 'Warm oatmeal with berries and decaf tea', scheduledTime: '08:30 AM', isMandatory: true },
                                { carePlanId: carePlanSarah.id, taskName: 'Garden Walk', description: 'Assist with walker for 15-minute garden walk', scheduledTime: '10:30 AM', isMandatory: false },
                                { carePlanId: carePlanSarah.id, taskName: 'Hydration Check', description: 'Ensure 500ml water consumption & log mood', scheduledTime: '01:00 PM', isMandatory: true },
                            ],
                        })];
                case 29:
                    _a.sent();
                    return [4 /*yield*/, prisma.carePlan.create({ data: { clientId: clientRobert.id } })];
                case 30:
                    carePlanRobert = _a.sent();
                    return [4 /*yield*/, prisma.carePlanTask.createMany({
                            data: [
                                { carePlanId: carePlanRobert.id, taskName: 'Vital Signs Monitor', description: 'Measure & log BP, heart rate, and oxygen saturation', scheduledTime: '09:00 AM', isMandatory: true },
                                { carePlanId: carePlanRobert.id, taskName: 'Physical Therapy Exercises', description: 'Assist with passive range of motion right-arm exercises', scheduledTime: '11:00 AM', isMandatory: true },
                                { carePlanId: carePlanRobert.id, taskName: 'Lunch & Speech Practice', description: 'Pureed meal prep & 10 min speech flashcard exercise', scheduledTime: '12:30 PM', isMandatory: false },
                            ],
                        })];
                case 31:
                    _a.sent();
                    now = new Date();
                    shiftInProgressStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
                    shiftInProgressEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);
                    return [4 /*yield*/, prisma.shift.create({
                            data: {
                                clientId: clientSarah.id,
                                caregiverId: caregiverAmara.id,
                                status: client_1.ShiftStatus.IN_PROGRESS,
                                scheduledStart: shiftInProgressStart,
                                scheduledEnd: shiftInProgressEnd,
                                actualStart: shiftInProgressStart,
                                confirmationDeadline: new Date(shiftInProgressStart.getTime() - 4 * 60 * 60 * 1000),
                                confirmedAt: new Date(shiftInProgressStart.getTime() - 5 * 60 * 60 * 1000),
                                clockInLat: 49.2826,
                                clockInLng: -123.1206,
                            },
                        })];
                case 32:
                    activeShift = _a.sent();
                    // GPS Location History for Active Shift
                    return [4 /*yield*/, prisma.caregiverLocationHistory.createMany({
                            data: [
                                { shiftId: activeShift.id, latitude: 49.2825, longitude: -123.1205, timestamp: new Date(now.getTime() - 110 * 60 * 1000) },
                                { shiftId: activeShift.id, latitude: 49.2826, longitude: -123.1206, timestamp: new Date(now.getTime() - 60 * 60 * 1000) },
                                { shiftId: activeShift.id, latitude: 49.2827, longitude: -123.1207, timestamp: new Date(now.getTime() - 15 * 60 * 1000) },
                            ],
                        })];
                case 33:
                    // GPS Location History for Active Shift
                    _a.sent();
                    // Shift Tasks for Active Shift
                    return [4 /*yield*/, prisma.shiftTask.createMany({
                            data: [
                                { shiftId: activeShift.id, taskName: 'Morning Medication', description: 'Administer Lisinopril 10mg with full glass of water', scheduledTime: '08:00 AM', isCompleted: true, completedAt: new Date(now.getTime() - 90 * 60 * 1000) },
                                { shiftId: activeShift.id, taskName: 'Nutritional Breakfast', description: 'Warm oatmeal with berries and decaf tea', scheduledTime: '08:30 AM', isCompleted: true, completedAt: new Date(now.getTime() - 60 * 60 * 1000) },
                                { shiftId: activeShift.id, taskName: 'Garden Walk', description: 'Assist with walker for 15-minute garden walk', scheduledTime: '10:30 AM', isCompleted: false },
                                { shiftId: activeShift.id, taskName: 'Hydration Check', description: 'Ensure 500ml water consumption & log mood', scheduledTime: '01:00 PM', isCompleted: false },
                            ],
                        })];
                case 34:
                    // Shift Tasks for Active Shift
                    _a.sent();
                    pastStart = new Date(now.getTime() - 28 * 60 * 60 * 1000);
                    pastEnd = new Date(now.getTime() - 22 * 60 * 60 * 1000);
                    return [4 /*yield*/, prisma.shift.create({
                            data: {
                                clientId: clientRobert.id,
                                caregiverId: caregiverBrendan.id,
                                status: client_1.ShiftStatus.COMPLETED,
                                scheduledStart: pastStart,
                                scheduledEnd: pastEnd,
                                actualStart: pastStart,
                                actualEnd: pastEnd,
                                confirmationDeadline: new Date(pastStart.getTime() - 4 * 60 * 60 * 1000),
                                confirmedAt: new Date(pastStart.getTime() - 6 * 60 * 60 * 1000),
                                clockInLat: 49.2845,
                                clockInLng: -123.1215,
                                clockOutLat: 49.2846,
                                clockOutLng: -123.1216,
                            },
                        })];
                case 35:
                    completedShift = _a.sent();
                    upcomingStart = new Date(now.getTime() + 18 * 60 * 60 * 1000);
                    upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, prisma.shift.create({
                            data: {
                                clientId: clientEleanor.id,
                                caregiverId: caregiverChloe.id,
                                status: client_1.ShiftStatus.CONFIRMED,
                                scheduledStart: upcomingStart,
                                scheduledEnd: upcomingEnd,
                                confirmationDeadline: new Date(upcomingStart.getTime() - 4 * 60 * 60 * 1000),
                                confirmedAt: new Date(),
                            },
                        })];
                case 36:
                    _a.sent();
                    unconfirmedStart = new Date(now.getTime() + 30 * 60 * 60 * 1000);
                    unconfirmedEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);
                    return [4 /*yield*/, prisma.shift.create({
                            data: {
                                clientId: clientSarah.id,
                                caregiverId: caregiverAmara.id,
                                status: client_1.ShiftStatus.UNCONFIRMED,
                                scheduledStart: unconfirmedStart,
                                scheduledEnd: unconfirmedEnd,
                                confirmationDeadline: new Date(now.getTime() - 1 * 60 * 60 * 1000), // Deadline passed 1 hour ago
                            },
                        })];
                case 37:
                    _a.sent();
                    sampleLogDetails1 = {
                        notes: 'Sarah had a wonderful morning! We completed her 15-minute garden walk in high spirits and she enjoyed her warm oatmeal.',
                        hasRedFlags: false,
                        caregiverName: 'Amara Okafor',
                        wellness: { mood: 'Cheerful', appetite: 'Good (Full Meal)', hydration: 'Optimal (750ml)', sleep: 'Restful (8h)' },
                        mediaFiles: [
                            { name: 'morning_garden_walk.jpg', type: 'image/jpeg', url: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80' },
                            { name: 'breakfast_tea.jpg', type: 'image/jpeg', url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80' },
                        ],
                    };
                    sampleLogDetails2 = {
                        notes: 'Robert performed all right-arm physical therapy exercises with great effort. Blood pressure normal at 122/80 mmHg.',
                        hasRedFlags: false,
                        caregiverName: 'Brendan Miller',
                        wellness: { mood: 'Calm & Happy', appetite: 'Moderate', hydration: 'Good', sleep: 'Restful' },
                        mediaFiles: [
                            { name: 'physical_therapy_session.mp4', type: 'video/mp4', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
                        ],
                    };
                    return [4 /*yield*/, prisma.activityLog.create({
                            data: {
                                clientId: clientSarah.id,
                                shiftId: activeShift.id,
                                encryptedLog: (0, crypto_1.cryptoEncrypt)(JSON.stringify(sampleLogDetails1)),
                                mediaUrls: JSON.stringify(['https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=800&q=80']),
                                createdAt: new Date(now.getTime() - 60 * 60 * 1000),
                            },
                        })];
                case 38:
                    _a.sent();
                    return [4 /*yield*/, prisma.activityLog.create({
                            data: {
                                clientId: clientRobert.id,
                                shiftId: completedShift.id,
                                encryptedLog: (0, crypto_1.cryptoEncrypt)(JSON.stringify(sampleLogDetails2)),
                                mediaUrls: JSON.stringify(['https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4']),
                                createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                            },
                        })];
                case 39:
                    _a.sent();
                    // 9. Create System Audit Logs
                    return [4 /*yield*/, prisma.auditLog.createMany({
                            data: [
                                { userId: caregiverAmara.id, action: 'CLOCK_IN', details: 'Caregiver Amara Okafor clocked in within 20m of client Sarah Jenkins home geofence.', outcome: 'SUCCESS', timestamp: shiftInProgressStart },
                                { userId: caregiverAmara.id, action: 'UPDATE_TASK', details: 'Shift task "Morning Medication" marked completed.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 90 * 60 * 1000) },
                                { userId: coordinator.id, action: 'CREATE_CARE_PLAN_TASK', details: 'Care coordinator Grace Taylor added PT task to Robert Montgomery care plan.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 120 * 60 * 1000) },
                                { userId: admin.id, action: 'UPDATE_GEOFENCE', details: 'Admin Elena Rostova updated Sarah Jenkins geofence radius to 150m.', outcome: 'SUCCESS', timestamp: new Date(now.getTime() - 180 * 60 * 1000) },
                            ],
                        })];
                case 40:
                    // 9. Create System Audit Logs
                    _a.sent();
                    availabilityData = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], [1, 2, 3, 4, 5].map(function (day) { return ({ caregiverId: caregiverAmara.id, dayOfWeek: day, startTime: '08:00', endTime: '17:00' }); }), true), [1, 2, 3, 4, 5].map(function (day) { return ({ caregiverId: caregiverBrendan.id, dayOfWeek: day, startTime: '08:00', endTime: '20:00' }); }), true), [0, 6].map(function (day) { return ({ caregiverId: caregiverChloe.id, dayOfWeek: day, startTime: '08:00', endTime: '22:00' }); }), true), [1, 2, 3, 4].map(function (day) { return ({ caregiverId: caregiverDerrick.id, dayOfWeek: day, startTime: '09:00', endTime: '18:00' }); }), true);
                    return [4 /*yield*/, prisma.availability.createMany({ data: availabilityData })];
                case 41:
                    _a.sent();
                    console.log('Successfully populated database with rich demo records!');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
