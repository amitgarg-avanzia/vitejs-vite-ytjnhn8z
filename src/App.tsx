import { useState, useEffect, useMemo } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { User, Phone, Activity, CalendarDays, PlusCircle, ClipboardList, Clock, CheckCircle2, Edit2, Filter, AlertTriangle } from 'lucide-react';

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCZitNB-dR4FR7lDOVKPHUWSMrCilSn7nQ",
  authDomain: "med-follow-up.firebaseapp.com",
  projectId: "med-follow-up",
  storageBucket: "med-follow-up.firebasestorage.app",
  messagingSenderId: "913010420476",
  appId: "1:913010420476:web:714fcdb543e901aa5c0579",
  measurementId: "G-HXSKX24LZL"
};

// --- HOT RELOAD FIX ---
// This prevents the blank screen crash in StackBlitz by ensuring Firebase only initializes once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- STRICT TYPESCRIPT INTERFACES ---
// These custom interfaces satisfy Vercel's strict compiler without crashing Vite
interface PatientFormData {
  name: string;
  gender: string;
  mobile: string;
  ailment: string;
  followUpDate: string;
}

interface PatientData extends PatientFormData {
  id: string;
  entryDate: string;
  timestamp: number;
}

interface LocalUser {
  uid: string;
}

interface LocalQuerySnapshot {
  docs: Array<{
    id: string;
    data: () => Record<string, unknown>;
  }>;
}

export default function App() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [activeTab, setActiveTab] = useState<string>('new'); // 'new' | 'report'
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Form State
  const todayString = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState<PatientFormData>({
    name: '',
    gender: 'Male',
    mobile: '',
    ailment: '',
    followUpDate: ''
  });

  // Edit State
  const [editPatientId, setEditPatientId] = useState<string | null>(null);

  // Report State
  const [reportFilterType, setReportFilterType] = useState<string>('followUp'); // 'followUp' | 'entry' | 'range'
  const [reportStartDate, setReportStartDate] = useState<string>(todayString);
  const [reportEndDate, setReportEndDate] = useState<string>(todayString);

  // --- 1. AUTHENTICATION ---
  useEffect(() => {
    // Authenticate the user anonymously to secure their database records
    signInAnonymously(auth).catch((err: unknown) => {
      const error = err as { code?: string; message?: string };
      console.error("Auth error:", error);
      if (error.code === 'auth/configuration-not-found' || error.message?.includes('configuration-not-found')) {
        setAuthError("ACTION REQUIRED: You need to enable 'Anonymous' sign-in in your Firebase Console. Go to Build > Authentication > Sign-in method, click 'Anonymous', and enable it.");
      } else {
        setAuthError(`Authentication failed: ${error.message || 'Unknown error'}`);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser: unknown) => {
      const authUser = currentUser as LocalUser | null;
      setUser(authUser);
      if (authUser) setAuthError(null); // Clear error if successfully logged in
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    if (!user) return;

    // Fetch patient data saved specifically under this authenticated user
    const patientsRef = collection(db, 'users', user.uid, 'patients');
    
    // Listen for real-time updates from your Firebase Firestore
    const unsubscribe = onSnapshot(patientsRef, (snapshot: unknown) => {
      const snap = snapshot as LocalQuerySnapshot;
      const data: PatientData[] = snap.docs.map((docSnap) => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          name: String(docData.name || ''),
          gender: String(docData.gender || 'Male'),
          mobile: String(docData.mobile || ''),
          ailment: String(docData.ailment || ''),
          followUpDate: String(docData.followUpDate || ''),
          entryDate: String(docData.entryDate || ''),
          timestamp: Number(docData.timestamp || 0)
        };
      });
      // Sort by latest entry descending
      data.sort((a: PatientData, b: PatientData) => b.timestamp - a.timestamp);
      setPatients(data);
    }, (err: unknown) => {
      const error = err as Error;
      console.error("Firestore error:", error);
      setAuthError(`Database Error: ${error.message} (Did you create the Firestore Database and set Rules to Test Mode?)`);
    });

    return () => unsubscribe();
  }, [user]);

  // --- 3. FORM HANDLING ---
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // keyof PatientFormData ensures Vercel knows this maps perfectly to our object
    setFormData((prev) => ({ ...prev, [name as keyof PatientFormData]: value }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    // Keep error messages on screen a bit longer so they can be read
    setTimeout(() => setToastMessage(''), msg.includes('Failed') ? 6000 : 3000);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      showToast("Authentication required to save data. Please check the error banner above.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (editPatientId) {
        // Update existing record
        const patientRef = doc(db, 'users', user.uid, 'patients', editPatientId);
        await updateDoc(patientRef, {
          name: formData.name,
          gender: formData.gender,
          mobile: formData.mobile,
          ailment: formData.ailment,
          followUpDate: formData.followUpDate,
        });
        showToast("Patient record updated successfully!");
        setEditPatientId(null);
      } else {
        // Create new record
        const patientsRef = collection(db, 'users', user.uid, 'patients');
        await addDoc(patientsRef, {
          entryDate: todayString,
          name: formData.name,
          gender: formData.gender,
          mobile: formData.mobile,
          ailment: formData.ailment,
          followUpDate: formData.followUpDate,
          timestamp: Date.now()
        });
        showToast("Patient record saved successfully!");
      }
      setFormData({ name: '', gender: 'Male', mobile: '', ailment: '', followUpDate: '' });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Error saving patient:", error);
      showToast(`Failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (patient: PatientData) => {
    setFormData({
      name: patient.name,
      gender: patient.gender,
      mobile: patient.mobile,
      ailment: patient.ailment,
      followUpDate: patient.followUpDate
    });
    setEditPatientId(patient.id);
    setActiveTab('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditPatientId(null);
    setFormData({ name: '', gender: 'Male', mobile: '', ailment: '', followUpDate: '' });
  };

  // --- 4. FILTERED REPORTS (In-Memory Filtering) ---
  const filteredPatients = useMemo(() => {
    return patients.filter((p: PatientData) => {
      if (reportFilterType === 'followUp') {
        return p.followUpDate === reportStartDate;
      } else if (reportFilterType === 'entry') {
        return p.entryDate === reportStartDate;
      } else if (reportFilterType === 'range') {
        return p.entryDate >= reportStartDate && p.entryDate <= reportEndDate;
      }
      return true;
    });
  }, [patients, reportFilterType, reportStartDate, reportEndDate]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-12">
      {/* HEADER */}
      <header className="bg-blue-600 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity size={28} className="text-white" />
            <h1 className="text-2xl font-bold tracking-tight">MedFollow</h1>
          </div>
          <div className="flex bg-blue-700 rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'new' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-100 hover:text-white'}`}
            >
              <PlusCircle size={16} /> New Entry
            </button>
            <button 
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'report' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-100 hover:text-white'}`}
            >
              <ClipboardList size={16} /> Reports
            </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER FOR FIREBASE AUTH/DB ISSUES */}
      {authError && (
        <div className="bg-red-600 text-white p-4 shadow-md flex items-start gap-3 justify-center">
          <AlertTriangle size={24} className="shrink-0 mt-0.5" />
          <p className="font-semibold text-sm md:text-base max-w-2xl">{authError}</p>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce w-[90%] max-w-md">
          <div className={`px-6 py-3 rounded-xl shadow-lg font-medium flex items-center gap-3 ${toastMessage.includes('Failed') || toastMessage.includes('required') ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
            <CheckCircle2 size={24} className="shrink-0" />
            <span className="text-sm">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="max-w-2xl mx-auto px-4 mt-6">
        
        {/* --- VIEW 1: NEW ENTRY FORM --- */}
        {activeTab === 'new' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <User size={20} className="text-blue-500"/> {editPatientId ? 'Edit Patient Record' : 'Patient Intake'}
              </h2>
              {editPatientId && (
                <button type="button" onClick={cancelEdit} className="text-sm text-red-600 hover:text-red-800 font-semibold bg-red-50 px-3 py-1 rounded-md border border-red-200">
                  Cancel Edit
                </button>
              )}
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Today's Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Today's Date</label>
                <div className="flex items-center gap-2 p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed">
                  <CalendarDays size={18} />
                  <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

              {/* Patient Name & Gender */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Patient Name</label>
                  <input 
                    required type="text" name="name" 
                    value={formData.name} onChange={handleInputChange} 
                    placeholder="Enter full name" 
                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Gender</label>
                  <select 
                    name="gender" value={formData.gender} onChange={handleInputChange} 
                    className="w-full p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Phone size={16} /> Mobile No.
                </label>
                <input 
                  required type="tel" name="mobile" 
                  value={formData.mobile} onChange={handleInputChange} 
                  placeholder="Enter 10-digit number" 
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" 
                />
              </div>

              {/* Diagnosis */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Activity size={16} /> Ailment / Diagnosis
                </label>
                <textarea 
                  required name="ailment" 
                  value={formData.ailment} onChange={handleInputChange} 
                  rows={3} placeholder="Describe the symptoms and diagnosis..." 
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition"
                ></textarea>
              </div>

              {/* Follow Up Date (Emphasized) */}
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-inner">
                <label className="block text-sm font-bold text-blue-900 mb-2 flex items-center gap-1">
                  <Clock size={18} /> Scheduled Follow-up Date
                </label>
                <input 
                  required type="date" name="followUpDate" 
                  min={todayString} value={formData.followUpDate} onChange={handleInputChange} 
                  className="w-full p-3 border-2 border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none bg-white font-medium text-slate-700 transition" 
                />
              </div>

              {/* Submit */}
              <button 
                type="submit" disabled={isSubmitting || !user} 
                className={`w-full text-white font-bold py-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2 ${!user ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isSubmitting ? 'Saving Record...' : (!user ? 'Database Not Connected' : (editPatientId ? 'Update Patient Record' : 'Save Patient Record'))}
              </button>
            </form>
          </div>
        )}

        {/* --- VIEW 2: REPORTS --- */}
        {activeTab === 'report' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-500"/> Schedule & Reports Explorer
              </h2>
            </div>

            <div className="p-6">
              {/* Report Filters */}
              <div className="mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
                  <Filter size={18} className="text-blue-500" /> Filter By:
                </div>
                <div className="flex flex-wrap gap-3 mb-4">
                  <button onClick={() => setReportFilterType('followUp')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${reportFilterType === 'followUp' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>Follow-Up Date</button>
                  <button onClick={() => setReportFilterType('entry')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${reportFilterType === 'entry' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>Entry Date</button>
                  <button onClick={() => setReportFilterType('range')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${reportFilterType === 'range' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>Entry Date Range</button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">{reportFilterType === 'range' ? 'Start Date' : 'Select Date'}</label>
                    <input 
                      type="date" 
                      value={reportStartDate} 
                      onChange={(e) => setReportStartDate(e.target.value)} 
                      className="w-full p-2.5 border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700" 
                    />
                  </div>
                  {reportFilterType === 'range' && (
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
                      <input 
                        type="date" 
                        value={reportEndDate} 
                        onChange={(e) => setReportEndDate(e.target.value)} 
                        className="w-full p-2.5 border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700" 
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-md font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span className="truncate pr-2">
                    {reportFilterType === 'followUp' && `Scheduled Follow-ups for ${new Date(reportStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    {reportFilterType === 'entry' && `Entries from ${new Date(reportStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    {reportFilterType === 'range' && `Entries: ${new Date(reportStartDate).toLocaleDateString()} to ${new Date(reportEndDate).toLocaleDateString()}`}
                  </span>
                  <span className="shrink-0 bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
                    {filteredPatients.length} Records
                  </span>
                </h3>

                {filteredPatients.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <CalendarDays size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">No records found for the selected criteria.</p>
                  </div>
                ) : (
                  filteredPatients.map((patient: PatientData) => (
                    <div key={patient.id} className="p-5 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-shadow relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                      
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-3">
                        <div>
                          <h3 className="font-bold text-slate-900 text-xl flex items-center gap-2">
                            {patient.name} 
                            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium border border-slate-200">
                              {patient.gender}
                            </span>
                          </h3>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditClick(patient)}
                            className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors"
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                          <a 
                            href={`tel:${patient.mobile}`} 
                            className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors"
                          >
                            <Phone size={14} /> {patient.mobile}
                          </a>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-slate-700 mb-2">
                        <span className="font-bold text-slate-900 block mb-1 text-sm uppercase tracking-wider">Diagnosis</span>
                        <p className="whitespace-pre-wrap">{patient.ailment}</p>
                      </div>

                      <div className="flex justify-between items-center text-xs text-slate-400 mt-3 border-t border-slate-100 pt-3">
                        <span className="flex items-center gap-1"><Clock size={12} /> Entry: {patient.entryDate}</span>
                        <span className="font-semibold text-blue-600 flex items-center gap-1"><CalendarDays size={12}/> Follow-up: {patient.followUpDate}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}