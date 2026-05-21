import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, LayoutDashboard, Plus, Briefcase, Clock, DollarSign, AlertTriangle, ChevronLeft, ChevronRight, X, Edit2, Trash2, Bell, Download, Moon, Sun, Filter, TrendingUp, CalendarDays, Check } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ============== UTILS ==============
const JOB_COLORS = [
  { name: 'Amber', bg: '#D97706', light: '#FEF3C7', text: '#92400E' },
  { name: 'Teal', bg: '#0D9488', light: '#CCFBF1', text: '#115E59' },
  { name: 'Rose', bg: '#E11D48', light: '#FFE4E6', text: '#9F1239' },
  { name: 'Indigo', bg: '#4F46E5', light: '#E0E7FF', text: '#3730A3' },
  { name: 'Emerald', bg: '#059669', light: '#D1FAE5', text: '#065F46' },
  { name: 'Violet', bg: '#7C3AED', light: '#EDE9FE', text: '#5B21B6' },
  { name: 'Orange', bg: '#EA580C', light: '#FED7AA', text: '#9A3412' },
  { name: 'Sky', bg: '#0284C7', light: '#E0F2FE', text: '#075985' },
];

const STORAGE_KEY = 'shift_tracker_data_v1';
const PREFS_KEY = 'shift_tracker_prefs_v1';

const fmtDate = (d) => {
  const dt = new Date(d);
  return dt.toISOString().split('T')[0];
};

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const display = hr % 12 || 12;
  return `${display}:${m} ${ampm}`;
};

const fmtCurrency = (n) => `$${n.toFixed(2)}`;

const calculateHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return mins / 60;
};

const calculateEarnings = (shift) => calculateHours(shift.startTime, shift.endTime) * shift.hourlyRate;

const getWeekRange = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.setDate(diff));
  monday.setHours(0,0,0,0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23,59,59,999);
  return [monday, sunday];
};

const detectConflicts = (shifts) => {
  const conflicts = new Set();
  const byDate = {};
  shifts.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });
  Object.values(byDate).forEach(dayShifts => {
    for (let i = 0; i < dayShifts.length; i++) {
      for (let j = i + 1; j < dayShifts.length; j++) {
        const a = dayShifts[i], b = dayShifts[j];
        const aStart = a.startTime, aEnd = a.endTime;
        const bStart = b.startTime, bEnd = b.endTime;
        if (aStart < bEnd && bStart < aEnd) {
          conflicts.add(a.id);
          conflicts.add(b.id);
        }
      }
    }
  });
  return conflicts;
};

// ============== STORAGE ==============
const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {}
  // seed data
  const today = new Date();
  const todayStr = fmtDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const nextWk = new Date(today);
  nextWk.setDate(nextWk.getDate() + 3);
  return {
    jobs: [
      { id: 'j1', name: 'Cafe Bellini', colorIdx: 0, rate: 24.5 },
      { id: 'j2', name: 'Library Assistant', colorIdx: 1, rate: 32 },
      { id: 'j3', name: 'Freelance Design', colorIdx: 3, rate: 65 },
    ],
    shifts: [
      { id: 's1', jobId: 'j1', date: fmtDate(yesterday), startTime: '07:00', endTime: '14:00', hourlyRate: 24.5, notes: 'Morning rush' },
      { id: 's2', jobId: 'j2', date: todayStr, startTime: '15:00', endTime: '19:00', hourlyRate: 32, notes: '' },
      { id: 's3', jobId: 'j1', date: todayStr, startTime: '08:00', endTime: '13:00', hourlyRate: 24.5, notes: '' },
      { id: 's4', jobId: 'j3', date: fmtDate(tomorrow), startTime: '10:00', endTime: '15:00', hourlyRate: 65, notes: 'Client mockups' },
      { id: 's5', jobId: 'j2', date: fmtDate(nextWk), startTime: '09:00', endTime: '17:00', hourlyRate: 32, notes: '' },
    ],
  };
};

const saveData = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
};

const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { dark: false, notifications: true };
};

const savePrefs = (p) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
};

// ============== MAIN APP ==============
export default function App() {
  const [data, setData] = useState(loadData);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState('dashboard');
  const [editingShift, setEditingShift] = useState(null);
  const [detailShift, setDetailShift] = useState(null);
  const [filterJob, setFilterJob] = useState('all');
  const [toast, setToast] = useState(null);
  const notifiedRef = useRef(new Set());

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const conflicts = useMemo(() => detectConflicts(data.shifts), [data.shifts]);
  const jobMap = useMemo(() => Object.fromEntries(data.jobs.map(j => [j.id, j])), [data.jobs]);

  const filteredShifts = useMemo(() => {
    if (filterJob === 'all') return data.shifts;
    return data.shifts.filter(s => s.jobId === filterJob);
  }, [data.shifts, filterJob]);

  // Notification check
  useEffect(() => {
    if (!prefs.notifications) return;
    const check = () => {
      const now = new Date();
      data.shifts.forEach(s => {
        const shiftStart = new Date(`${s.date}T${s.startTime}`);
        const diff = shiftStart - now;
        const hrs = diff / (1000 * 60 * 60);
        const job = jobMap[s.jobId];
        if (!job) return;
        // 24hr reminder
        if (hrs > 23.9 && hrs < 24.1 && !notifiedRef.current.has(`24-${s.id}`)) {
          notifiedRef.current.add(`24-${s.id}`);
          showToast(`Reminder: ${job.name} shift tomorrow at ${fmtTime(s.startTime)}`, 'bell');
        }
        // 1hr reminder
        if (hrs > 0.9 && hrs < 1.1 && !notifiedRef.current.has(`1-${s.id}`)) {
          notifiedRef.current.add(`1-${s.id}`);
          showToast(`Starting soon: ${job.name} in 1 hour`, 'bell');
        }
      });
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [data.shifts, jobMap, prefs.notifications]);

  const showToast = (msg, icon = 'check') => {
    setToast({ msg, icon, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  };

  const saveShift = (shift) => {
    if (shift.id) {
      setData(d => ({ ...d, shifts: d.shifts.map(s => s.id === shift.id ? shift : s) }));
      showToast('Shift updated');
    } else {
      const newShift = { ...shift, id: `s${Date.now()}` };
      setData(d => ({ ...d, shifts: [...d.shifts, newShift] }));
      showToast('Shift added');
    }
    setEditingShift(null);
    setView('calendar');
  };

  const deleteShift = (id) => {
    setData(d => ({ ...d, shifts: d.shifts.filter(s => s.id !== id) }));
    setEditingShift(null);
    setDetailShift(null);
    showToast('Shift deleted');
  };

  const saveJob = (job) => {
    if (job.id) {
      setData(d => ({ ...d, jobs: d.jobs.map(j => j.id === job.id ? job : j) }));
    } else {
      const newJob = { ...job, id: `j${Date.now()}` };
      setData(d => ({ ...d, jobs: [...d.jobs, newJob] }));
    }
    showToast('Job saved');
  };

  const deleteJob = (id) => {
    if (data.shifts.some(s => s.jobId === id)) {
      showToast('Cannot delete — job has shifts', 'alert');
      return;
    }
    setData(d => ({ ...d, jobs: d.jobs.filter(j => j.id !== id) }));
    showToast('Job deleted');
  };

  const exportCSV = () => {
    const headers = ['Date', 'Job', 'Start', 'End', 'Hours', 'Rate', 'Earnings', 'Notes'];
    const rows = [...data.shifts]
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(s => {
        const job = jobMap[s.jobId];
        const hrs = calculateHours(s.startTime, s.endTime);
        const earn = hrs * s.hourlyRate;
        return [s.date, job?.name || 'Unknown', s.startTime, s.endTime, hrs.toFixed(2), s.hourlyRate, earn.toFixed(2), `"${(s.notes || '').replace(/"/g,'""')}"`].join(',');
      });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings_${fmtDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  };

  const bgClass = prefs.dark ? 'bg-stone-950 text-stone-100' : 'bg-stone-50 text-stone-900';
  const cardClass = prefs.dark ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200';
  const subtleText = prefs.dark ? 'text-stone-400' : 'text-stone-500';
  const accentText = prefs.dark ? 'text-amber-300' : 'text-stone-900';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`} style={{ fontFamily: '"Inter Tight", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .font-body { font-family: 'Inter Tight', system-ui, sans-serif; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out both; }
        .animate-slide-up { animation: slideUp 0.3s ease-out both; }
        .animate-slide-down { animation: slideDown 0.3s ease-out both; }
        .stagger > * { opacity: 0; animation: fadeIn 0.5s ease-out forwards; }
        .stagger > *:nth-child(1) { animation-delay: 0.05s; }
        .stagger > *:nth-child(2) { animation-delay: 0.1s; }
        .stagger > *:nth-child(3) { animation-delay: 0.15s; }
        .stagger > *:nth-child(4) { animation-delay: 0.2s; }
        .stagger > *:nth-child(5) { animation-delay: 0.25s; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: ${prefs.dark ? '#44403c' : '#d6d3d1'}; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Header */}
      <header className={`sticky top-0 z-30 backdrop-blur-xl ${prefs.dark ? 'bg-stone-950/80 border-stone-800' : 'bg-stone-50/80 border-stone-200'} border-b`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${prefs.dark ? 'bg-amber-300' : 'bg-stone-900'}`}>
              <Clock className={`w-5 h-5 ${prefs.dark ? 'text-stone-900' : 'text-amber-300'}`} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-xl md:text-2xl font-semibold leading-none">Tally</h1>
              <p className={`text-[10px] uppercase tracking-widest ${subtleText} mt-1`}>Shifts &amp; Earnings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conflicts.size > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflicts.size / 2} conflict{conflicts.size > 2 ? 's' : ''}
              </div>
            )}
            <button onClick={() => setPrefs(p => ({ ...p, dark: !p.dark }))} className={`p-2 rounded-lg transition-colors ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`} aria-label="Toggle dark mode">
              {prefs.dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={exportCSV} className={`p-2 rounded-lg transition-colors ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`} aria-label="Export CSV">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 pb-24 md:pb-8 pt-6">
        {view === 'dashboard' && (
          <Dashboard data={data} jobMap={jobMap} conflicts={conflicts} prefs={prefs} onViewShift={setDetailShift} onSetView={setView} cardClass={cardClass} subtleText={subtleText} />
        )}
        {view === 'calendar' && (
          <CalendarView shifts={filteredShifts} jobs={data.jobs} jobMap={jobMap} conflicts={conflicts} onViewShift={setDetailShift} onAddShift={() => setEditingShift({})} filterJob={filterJob} setFilterJob={setFilterJob} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />
        )}
        {view === 'earnings' && (
          <EarningsView shifts={data.shifts} jobs={data.jobs} jobMap={jobMap} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />
        )}
        {view === 'jobs' && (
          <JobsView jobs={data.jobs} shifts={data.shifts} onSave={saveJob} onDelete={deleteJob} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />
        )}
      </main>

      {/* Floating Add Button (Desktop) */}
      <button
        onClick={() => setEditingShift({})}
        className={`hidden md:flex fixed bottom-8 right-8 z-20 w-14 h-14 rounded-full items-center justify-center shadow-2xl transition-all hover:scale-105 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}
        aria-label="Add shift"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      {/* Bottom Nav (Mobile) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-30 ${prefs.dark ? 'bg-stone-950/95 border-stone-800' : 'bg-white/95 border-stone-200'} border-t backdrop-blur-xl`}>
        <div className="flex items-center justify-around px-2 pt-2 pb-3">
          <NavBtn icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} dark={prefs.dark} />
          <NavBtn icon={Calendar} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} dark={prefs.dark} />
          <button onClick={() => setEditingShift({})} className={`flex flex-col items-center -mt-6 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'} w-12 h-12 rounded-full shadow-lg justify-center`}>
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <NavBtn icon={TrendingUp} label="Earnings" active={view === 'earnings'} onClick={() => setView('earnings')} dark={prefs.dark} />
          <NavBtn icon={Briefcase} label="Jobs" active={view === 'jobs'} onClick={() => setView('jobs')} dark={prefs.dark} />
        </div>
      </nav>

      {/* Desktop Nav (sidebar style horizontal) */}
      <nav className={`hidden md:flex fixed left-1/2 -translate-x-1/2 bottom-6 z-30 ${prefs.dark ? 'bg-stone-900/90 border-stone-800' : 'bg-white/90 border-stone-200'} border backdrop-blur-xl rounded-full shadow-xl px-2 py-2 gap-1`}>
        <DesktopNavBtn icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} dark={prefs.dark} />
        <DesktopNavBtn icon={Calendar} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} dark={prefs.dark} />
        <DesktopNavBtn icon={TrendingUp} label="Earnings" active={view === 'earnings'} onClick={() => setView('earnings')} dark={prefs.dark} />
        <DesktopNavBtn icon={Briefcase} label="Jobs" active={view === 'jobs'} onClick={() => setView('jobs')} dark={prefs.dark} />
      </nav>

      {/* Shift Form Modal */}
      {editingShift !== null && (
        <ShiftForm
          shift={editingShift}
          jobs={data.jobs}
          onSave={saveShift}
          onDelete={editingShift.id ? () => deleteShift(editingShift.id) : null}
          onCancel={() => setEditingShift(null)}
          prefs={prefs}
        />
      )}

      {/* Shift Detail Modal */}
      {detailShift && (
        <ShiftDetail
          shift={detailShift}
          job={jobMap[detailShift.jobId]}
          isConflict={conflicts.has(detailShift.id)}
          onEdit={() => { setEditingShift(detailShift); setDetailShift(null); }}
          onDelete={() => deleteShift(detailShift.id)}
          onClose={() => setDetailShift(null)}
          prefs={prefs}
        />
      )}

      {/* Toast */}
      {toast && (
        <div key={toast.id} className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className={`${prefs.dark ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100'} px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm font-medium`}>
            {toast.icon === 'bell' ? <Bell className="w-4 h-4" /> : toast.icon === 'alert' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== NAV BUTTONS ==============
function NavBtn({ icon: Icon, label, active, onClick, dark }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${active ? (dark ? 'text-amber-300' : 'text-stone-900') : (dark ? 'text-stone-500' : 'text-stone-400')}`}>
      <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function DesktopNavBtn({ icon: Icon, label, active, onClick, dark }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium ${active ? (dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') : (dark ? 'text-stone-400 hover:bg-stone-800' : 'text-stone-600 hover:bg-stone-100')}`}>
      <Icon className="w-4 h-4" strokeWidth={2.2} />
      {label}
    </button>
  );
}

// ============== DASHBOARD ==============
function Dashboard({ data, jobMap, conflicts, prefs, onViewShift, onSetView, cardClass, subtleText }) {
  const now = new Date();
  const todayStr = fmtDate(now);
  const [weekStart, weekEnd] = getWeekRange(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const weekShifts = data.shifts.filter(s => {
    const d = new Date(`${s.date}T${s.startTime}`);
    return d >= weekStart && d <= weekEnd;
  });
  const monthShifts = data.shifts.filter(s => {
    const d = new Date(`${s.date}T${s.startTime}`);
    return d >= monthStart && d <= monthEnd;
  });
  const todayShifts = data.shifts.filter(s => s.date === todayStr).sort((a,b) => a.startTime.localeCompare(b.startTime));

  const weekEarnings = weekShifts.reduce((sum, s) => sum + calculateEarnings(s), 0);
  const monthEarnings = monthShifts.reduce((sum, s) => sum + calculateEarnings(s), 0);
  const weekHours = weekShifts.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0);

  const upcoming = data.shifts
    .filter(s => {
      const d = new Date(`${s.date}T${s.startTime}`);
      return d >= now;
    })
    .sort((a,b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, 5);

  const conflictShifts = data.shifts.filter(s => conflicts.has(s.id));

  // Weekly chart data — last 6 weeks
  const chartData = useMemo(() => {
    const weeks = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const [ws, we] = getWeekRange(ref);
      const total = data.shifts
        .filter(s => {
          const d = new Date(`${s.date}T${s.startTime}`);
          return d >= ws && d <= we;
        })
        .reduce((sum, s) => sum + calculateEarnings(s), 0);
      weeks.push({
        week: `${ws.getMonth() + 1}/${ws.getDate()}`,
        earnings: parseFloat(total.toFixed(2)),
      });
    }
    return weeks;
  }, [data.shifts]);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="pt-2">
        <p className={`text-xs uppercase tracking-[0.2em] ${subtleText} mb-2`}>{greeting}</p>
        <h2 className="font-display text-4xl md:text-5xl font-medium leading-tight">
          You've earned <span className={prefs.dark ? 'text-amber-300' : 'text-stone-900'}>{fmtCurrency(weekEarnings)}</span> this week.
        </h2>
        <p className={`mt-2 ${subtleText} text-sm`}>{weekHours.toFixed(1)} hours · {weekShifts.length} shift{weekShifts.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Conflict Alert */}
      {conflictShifts.length > 0 && (
        <div className={`rounded-2xl p-5 border-2 ${prefs.dark ? 'bg-red-950/30 border-red-900' : 'bg-red-50 border-red-200'} animate-fade-in`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${prefs.dark ? 'bg-red-900/50' : 'bg-red-100'}`}>
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold ${prefs.dark ? 'text-red-300' : 'text-red-900'}`}>
                {conflictShifts.length / 2} scheduling conflict{conflictShifts.length > 2 ? 's' : ''} detected
              </h3>
              <p className={`text-sm mt-0.5 ${prefs.dark ? 'text-red-400/80' : 'text-red-700/80'}`}>
                Some shifts overlap in time. Review them to avoid double-booking.
              </p>
              <button onClick={() => onSetView('calendar')} className={`mt-3 text-sm font-medium ${prefs.dark ? 'text-red-300 hover:text-red-200' : 'text-red-700 hover:text-red-800'} underline underline-offset-2`}>
                Review on calendar →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
        <StatCard label="This Week" value={fmtCurrency(weekEarnings)} sub={`${weekShifts.length} shifts`} cardClass={cardClass} subtleText={subtleText} />
        <StatCard label="This Month" value={fmtCurrency(monthEarnings)} sub={`${monthShifts.length} shifts`} cardClass={cardClass} subtleText={subtleText} />
        <StatCard label="Hours This Wk" value={weekHours.toFixed(1)} sub="hours worked" cardClass={cardClass} subtleText={subtleText} />
        <StatCard label="Active Jobs" value={data.jobs.length} sub="positions" cardClass={cardClass} subtleText={subtleText} />
      </div>

      {/* Chart */}
      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Earnings trend</h3>
            <p className={`text-xs ${subtleText}`}>Last 6 weeks</p>
          </div>
        </div>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={prefs.dark ? '#292524' : '#f5f5f4'} />
              <XAxis dataKey="week" stroke={prefs.dark ? '#78716c' : '#a8a29e'} fontSize={11} />
              <YAxis stroke={prefs.dark ? '#78716c' : '#a8a29e'} fontSize={11} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: prefs.dark ? '#1c1917' : '#fff', border: `1px solid ${prefs.dark ? '#44403c' : '#e7e5e4'}`, borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`$${v.toFixed(2)}`, 'Earnings']}
              />
              <Line type="monotone" dataKey="earnings" stroke={prefs.dark ? '#fcd34d' : '#1c1917'} strokeWidth={2.5} dot={{ r: 4, fill: prefs.dark ? '#fcd34d' : '#1c1917' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-column section */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Today */}
        <div className={`rounded-2xl border ${cardClass} p-5`}>
          <h3 className="font-display text-lg font-semibold mb-4">Today</h3>
          {todayShifts.length === 0 ? (
            <div className={`text-center py-8 ${subtleText} text-sm`}>
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No shifts scheduled today
            </div>
          ) : (
            <div className="space-y-2">
              {todayShifts.map(s => (
                <ShiftCard key={s.id} shift={s} job={jobMap[s.jobId]} isConflict={conflicts.has(s.id)} onClick={() => onViewShift(s)} prefs={prefs} />
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className={`rounded-2xl border ${cardClass} p-5`}>
          <h3 className="font-display text-lg font-semibold mb-4">Upcoming shifts</h3>
          {upcoming.length === 0 ? (
            <div className={`text-center py-8 ${subtleText} text-sm`}>No upcoming shifts</div>
          ) : (
            <div className="space-y-2">
              {upcoming.map(s => (
                <ShiftCard key={s.id} shift={s} job={jobMap[s.jobId]} isConflict={conflicts.has(s.id)} onClick={() => onViewShift(s)} prefs={prefs} showDate />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, cardClass, subtleText }) {
  return (
    <div className={`rounded-2xl border ${cardClass} p-4 md:p-5`}>
      <p className={`text-[10px] uppercase tracking-widest ${subtleText} font-medium`}>{label}</p>
      <p className="font-display text-2xl md:text-3xl font-semibold mt-2 leading-none">{value}</p>
      <p className={`text-xs ${subtleText} mt-1.5`}>{sub}</p>
    </div>
  );
}

function ShiftCard({ shift, job, isConflict, onClick, prefs, showDate }) {
  if (!job) return null;
  const color = JOB_COLORS[job.colorIdx];
  const hrs = calculateHours(shift.startTime, shift.endTime);
  const earnings = hrs * shift.hourlyRate;
  const date = new Date(`${shift.date}T${shift.startTime}`);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <button onClick={onClick} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-[1.01] ${prefs.dark ? 'bg-stone-800/50 hover:bg-stone-800' : 'bg-stone-50 hover:bg-stone-100'} ${isConflict ? 'ring-2 ring-red-400 dark:ring-red-500' : ''}`}>
      <div className="w-1 h-12 rounded-full" style={{ background: color.bg }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{job.name}</p>
          {isConflict && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
        </div>
        <p className={`text-xs ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mt-0.5`}>
          {showDate && `${dateLabel} · `}{fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display font-semibold">{fmtCurrency(earnings)}</p>
        <p className={`text-[10px] ${prefs.dark ? 'text-stone-500' : 'text-stone-400'}`}>{hrs.toFixed(1)}h</p>
      </div>
    </button>
  );
}

// ============== CALENDAR VIEW ==============
function CalendarView({ shifts, jobs, jobMap, conflicts, onViewShift, onAddShift, filterJob, setFilterJob, prefs, cardClass, subtleText }) {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstDay = new Date(year, monthIdx, 1);
  const lastDay = new Date(year, monthIdx + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7; // Monday start
  const daysInMonth = lastDay.getDate();
  const weeks = [];
  let week = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const monthShifts = useMemo(() => {
    const map = {};
    shifts.forEach(s => {
      const d = new Date(s.date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === monthIdx) {
        if (!map[d.getDate()]) map[d.getDate()] = [];
        map[d.getDate()].push(s);
      }
    });
    Object.values(map).forEach(arr => arr.sort((a,b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [shifts, year, monthIdx]);

  const todayD = new Date();
  const isToday = (d) => d === todayD.getDate() && monthIdx === todayD.getMonth() && year === todayD.getFullYear();

  const monthEarnings = Object.values(monthShifts).flat().reduce((sum, s) => sum + calculateEarnings(s), 0);
  const monthHours = Object.values(monthShifts).flat().reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium">
            {month.toLocaleString('default', { month: 'long' })} <span className={subtleText}>{year}</span>
          </h2>
          <p className={`text-sm ${subtleText} mt-1`}>
            {fmtCurrency(monthEarnings)} earned · {monthHours.toFixed(1)} hours
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(new Date(year, monthIdx - 1, 1))} className={`p-2 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => setMonth(new Date())} className={`px-3 py-2 rounded-lg text-sm font-medium ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`}>
            Today
          </button>
          <button onClick={() => setMonth(new Date(year, monthIdx + 1, 1))} className={`p-2 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-thin pb-1">
        <Filter className={`w-4 h-4 shrink-0 ${subtleText}`} />
        <button onClick={() => setFilterJob('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterJob === 'all' ? (prefs.dark ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100') : (prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700')}`}>
          All jobs
        </button>
        {jobs.map(j => {
          const c = JOB_COLORS[j.colorIdx];
          const active = filterJob === j.id;
          return (
            <button
              key={j.id}
              onClick={() => setFilterJob(j.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: active ? c.bg : (prefs.dark ? '#292524' : '#f5f5f4'),
                color: active ? '#fff' : (prefs.dark ? '#d6d3d1' : '#44403c'),
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: active ? '#fff' : c.bg }} />
              {j.name}
            </button>
          );
        })}
      </div>

      {/* Calendar Grid */}
      <div className={`rounded-2xl border ${cardClass} overflow-hidden`}>
        {/* Day headers */}
        <div className={`grid grid-cols-7 ${prefs.dark ? 'bg-stone-900 border-stone-800' : 'bg-stone-100/50 border-stone-200'} border-b`}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className={`px-2 py-2.5 text-[10px] uppercase tracking-widest font-medium text-center ${subtleText}`}>
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((wk, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? (prefs.dark ? 'border-b border-stone-800' : 'border-b border-stone-200') : ''}`}>
            {wk.map((day, di) => {
              const dayShifts = day ? (monthShifts[day] || []) : [];
              const hasConflict = dayShifts.some(s => conflicts.has(s.id));
              return (
                <div
                  key={di}
                  className={`min-h-[80px] md:min-h-[110px] p-1.5 md:p-2 ${di < 6 ? (prefs.dark ? 'border-r border-stone-800' : 'border-r border-stone-200') : ''} ${isToday(day) ? (prefs.dark ? 'bg-amber-300/5' : 'bg-amber-50/50') : ''}`}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold ${isToday(day) ? (prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') + ' w-5 h-5 rounded-full flex items-center justify-center' : ''}`}>
                          {day}
                        </span>
                        {hasConflict && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </div>
                      <div className="space-y-1">
                        {dayShifts.slice(0, 3).map(s => {
                          const job = jobMap[s.jobId];
                          if (!job) return null;
                          const color = JOB_COLORS[job.colorIdx];
                          const isConflict = conflicts.has(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => onViewShift(s)}
                              className={`w-full text-left text-[10px] md:text-xs px-1.5 py-1 rounded transition-all hover:scale-[1.02] truncate ${isConflict ? 'ring-1 ring-red-500' : ''}`}
                              style={{ background: prefs.dark ? color.bg + '30' : color.light, color: prefs.dark ? color.light : color.text }}
                            >
                              <span className="font-medium hidden md:inline">{fmtTime(s.startTime).replace(':00','')} </span>
                              <span className="md:hidden">●</span> {job.name}
                            </button>
                          );
                        })}
                        {dayShifts.length > 3 && (
                          <p className={`text-[10px] ${subtleText} px-1.5`}>+{dayShifts.length - 3} more</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className={`text-xs ${subtleText} mt-3 text-center`}>Tap any shift to view details · Tap any day for more</p>
    </div>
  );
}

// ============== EARNINGS VIEW ==============
function EarningsView({ shifts, jobs, jobMap, prefs, cardClass, subtleText }) {
  const [period, setPeriod] = useState('week');
  const now = new Date();

  const allEarnings = shifts.reduce((sum, s) => sum + calculateEarnings(s), 0);
  const allHours = shifts.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0);

  // Per job
  const byJob = useMemo(() => {
    return jobs.map(j => {
      const js = shifts.filter(s => s.jobId === j.id);
      const earnings = js.reduce((sum, s) => sum + calculateEarnings(s), 0);
      const hours = js.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0);
      return { ...j, earnings, hours, shifts: js.length, color: JOB_COLORS[j.colorIdx] };
    }).sort((a,b) => b.earnings - a.earnings);
  }, [shifts, jobs]);

  // Chart data based on period
  const chartData = useMemo(() => {
    if (period === 'week') {
      // last 7 days
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        const ds = fmtDate(d);
        const total = shifts.filter(s => s.date === ds).reduce((sum, s) => sum + calculateEarnings(s), 0);
        days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), earnings: parseFloat(total.toFixed(2)) });
      }
      return days;
    } else if (period === 'month') {
      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        const ref = new Date(now);
        ref.setDate(ref.getDate() - i * 7);
        const [ws, we] = getWeekRange(ref);
        const total = shifts.filter(s => {
          const d = new Date(`${s.date}T${s.startTime}`);
          return d >= ws && d <= we;
        }).reduce((sum, s) => sum + calculateEarnings(s), 0);
        weeks.push({ label: `Wk ${ws.getDate()}/${ws.getMonth()+1}`, earnings: parseFloat(total.toFixed(2)) });
      }
      return weeks;
    } else {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const me = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
        const total = shifts.filter(s => {
          const d = new Date(`${s.date}T${s.startTime}`);
          return d >= ref && d <= me;
        }).reduce((sum, s) => sum + calculateEarnings(s), 0);
        months.push({ label: ref.toLocaleString('default', { month: 'short' }), earnings: parseFloat(total.toFixed(2)) });
      }
      return months;
    }
  }, [shifts, period]);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="font-display text-3xl md:text-4xl font-medium">Earnings</h2>
        <p className={`text-sm ${subtleText} mt-1`}>Across all jobs and time</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className={`rounded-2xl border ${cardClass} p-5`}>
          <p className={`text-[10px] uppercase tracking-widest ${subtleText}`}>Lifetime earnings</p>
          <p className="font-display text-3xl md:text-4xl font-semibold mt-2">{fmtCurrency(allEarnings)}</p>
          <p className={`text-xs ${subtleText} mt-1`}>{shifts.length} shifts logged</p>
        </div>
        <div className={`rounded-2xl border ${cardClass} p-5`}>
          <p className={`text-[10px] uppercase tracking-widest ${subtleText}`}>Total hours</p>
          <p className="font-display text-3xl md:text-4xl font-semibold mt-2">{allHours.toFixed(1)}</p>
          <p className={`text-xs ${subtleText} mt-1`}>avg {allHours > 0 ? fmtCurrency(allEarnings/allHours) : '$0'}/hr</p>
        </div>
      </div>

      {/* Period switcher + chart */}
      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-display text-lg font-semibold">Breakdown</h3>
          <div className={`inline-flex rounded-full p-1 ${prefs.dark ? 'bg-stone-800' : 'bg-stone-100'}`}>
            {['week','month','year'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${period === p ? (prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') : (prefs.dark ? 'text-stone-400' : 'text-stone-600')}`}>
                {p === 'week' ? 'Last 7 days' : p === 'month' ? 'Last 4 wks' : 'Last 6 mo'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={prefs.dark ? '#292524' : '#f5f5f4'} vertical={false} />
              <XAxis dataKey="label" stroke={prefs.dark ? '#78716c' : '#a8a29e'} fontSize={11} />
              <YAxis stroke={prefs.dark ? '#78716c' : '#a8a29e'} fontSize={11} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: prefs.dark ? '#1c1917' : '#fff', border: `1px solid ${prefs.dark ? '#44403c' : '#e7e5e4'}`, borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`$${v.toFixed(2)}`, 'Earnings']}
                cursor={{ fill: prefs.dark ? '#292524' : '#f5f5f4' }}
              />
              <Bar dataKey="earnings" fill={prefs.dark ? '#fcd34d' : '#1c1917'} radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-job breakdown */}
      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <h3 className="font-display text-lg font-semibold mb-4">By job</h3>
        {byJob.length === 0 ? (
          <p className={`text-sm ${subtleText} py-4 text-center`}>No jobs yet</p>
        ) : (
          <div className="space-y-3">
            {byJob.map(j => {
              const pct = allEarnings > 0 ? (j.earnings / allEarnings) * 100 : 0;
              return (
                <div key={j.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: j.color.bg }} />
                      <span className="font-medium truncate">{j.name}</span>
                      <span className={`text-xs ${subtleText}`}>· {j.shifts} shifts</span>
                    </div>
                    <span className="font-display font-semibold">{fmtCurrency(j.earnings)}</span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${prefs.dark ? 'bg-stone-800' : 'bg-stone-100'}`}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: j.color.bg }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== JOBS VIEW ==============
function JobsView({ jobs, shifts, onSave, onDelete, prefs, cardClass, subtleText }) {
  const [editing, setEditing] = useState(null);

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium">Jobs</h2>
          <p className={`text-sm ${subtleText} mt-1`}>{jobs.length} active position{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setEditing({ name: '', colorIdx: 0, rate: 20 })} className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add job
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {jobs.map(j => {
          const color = JOB_COLORS[j.colorIdx];
          const jShifts = shifts.filter(s => s.jobId === j.id);
          const earnings = jShifts.reduce((sum, s) => sum + calculateEarnings(s), 0);
          return (
            <div key={j.id} className={`rounded-2xl border ${cardClass} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: color.bg }}>
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-lg truncate">{j.name}</h3>
                    <p className={`text-xs ${subtleText}`}>${j.rate}/hr default</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(j)} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(j.id)} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-red-950 text-red-400' : 'hover:bg-red-50 text-red-600'}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={`mt-4 pt-4 border-t ${prefs.dark ? 'border-stone-800' : 'border-stone-100'} flex justify-between text-sm`}>
                <span className={subtleText}>{jShifts.length} shifts</span>
                <span className="font-semibold">{fmtCurrency(earnings)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <JobForm job={editing} onSave={(j) => { onSave(j); setEditing(null); }} onCancel={() => setEditing(null)} prefs={prefs} />
      )}
    </div>
  );
}

function JobForm({ job, onSave, onCancel, prefs }) {
  const [name, setName] = useState(job.name || '');
  const [colorIdx, setColorIdx] = useState(job.colorIdx ?? 0);
  const [rate, setRate] = useState(job.rate ?? 20);
  const [err, setErr] = useState('');

  const submit = () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!rate || rate <= 0) { setErr('Rate must be greater than 0'); return; }
    onSave({ ...job, name: name.trim(), colorIdx, rate: parseFloat(rate) });
  };

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border ${prefs.dark ? 'bg-stone-800 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'} focus:outline-none focus:ring-2 ${prefs.dark ? 'focus:ring-amber-300' : 'focus:ring-stone-900'} text-sm`;
  const labelClass = `block text-xs font-medium uppercase tracking-wider mb-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in`} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="font-display text-2xl font-semibold mb-4">{job.id ? 'Edit job' : 'New job'}</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Job name</label>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cafe Bellini" autoFocus />
            </div>
            <div>
              <label className={labelClass}>Default hourly rate</label>
              <input type="number" step="0.01" min="0" className={inputClass} value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="grid grid-cols-8 gap-2">
                {JOB_COLORS.map((c, i) => (
                  <button key={i} onClick={() => setColorIdx(i)} className={`aspect-square rounded-lg transition-all ${colorIdx === i ? 'ring-2 ring-offset-2 scale-110 ' + (prefs.dark ? 'ring-amber-300 ring-offset-stone-900' : 'ring-stone-900 ring-offset-white') : ''}`} style={{ background: c.bg }} />
                ))}
              </div>
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={onCancel} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'}`}>Cancel</button>
            <button onClick={submit} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== SHIFT FORM ==============
function ShiftForm({ shift, jobs, onSave, onDelete, onCancel, prefs }) {
  const [jobId, setJobId] = useState(shift.jobId || jobs[0]?.id || '');
  const [date, setDate] = useState(shift.date || fmtDate(new Date()));
  const [startTime, setStartTime] = useState(shift.startTime || '09:00');
  const [endTime, setEndTime] = useState(shift.endTime || '17:00');
  const [hourlyRate, setHourlyRate] = useState(shift.hourlyRate ?? jobs.find(j => j.id === (shift.jobId || jobs[0]?.id))?.rate ?? 20);
  const [notes, setNotes] = useState(shift.notes || '');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!shift.id) {
      const j = jobs.find(j => j.id === jobId);
      if (j) setHourlyRate(j.rate);
    }
  }, [jobId]);

  const submit = () => {
    setErr('');
    if (!jobId) { setErr('Select a job'); return; }
    if (!date) { setErr('Date is required'); return; }
    if (!startTime || !endTime) { setErr('Times are required'); return; }
    if (startTime === endTime) { setErr('Start and end times cannot be identical'); return; }
    if (endTime <= startTime) { setErr('End time must be after start time'); return; }
    if (!hourlyRate || hourlyRate <= 0) { setErr('Hourly rate must be greater than 0'); return; }
    onSave({ ...shift, jobId, date, startTime, endTime, hourlyRate: parseFloat(hourlyRate), notes: notes.trim() });
  };

  const hrs = calculateHours(startTime, endTime);
  const earnings = hrs * (parseFloat(hourlyRate) || 0);

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border ${prefs.dark ? 'bg-stone-800 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'} focus:outline-none focus:ring-2 ${prefs.dark ? 'focus:ring-amber-300' : 'focus:ring-stone-900'} text-sm`;
  const labelClass = `block text-xs font-medium uppercase tracking-wider mb-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`;

  if (jobs.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
        <div className={`${cardBg} max-w-sm rounded-2xl p-6 m-4 text-center`} onClick={e => e.stopPropagation()}>
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <h3 className="font-display text-xl font-semibold mb-2">No jobs yet</h3>
          <p className={`text-sm mb-4 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`}>Create a job first to start adding shifts.</p>
          <button onClick={onCancel} className={`w-full py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className={`${cardBg} w-full md:max-w-lg md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in max-h-[92vh] overflow-y-auto scrollbar-thin`} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 backdrop-blur-xl px-6 py-4 flex items-center justify-between border-b z-10" style={{ background: prefs.dark ? 'rgba(28,25,23,0.95)' : 'rgba(255,255,255,0.95)', borderColor: prefs.dark ? '#292524' : '#e7e5e4' }}>
          <h3 className="font-display text-2xl font-semibold">{shift.id ? 'Edit shift' : 'New shift'}</h3>
          <button onClick={onCancel} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Job</label>
            <div className="grid grid-cols-2 gap-2">
              {jobs.map(j => {
                const c = JOB_COLORS[j.colorIdx];
                const active = jobId === j.id;
                return (
                  <button
                    key={j.id}
                    onClick={() => setJobId(j.id)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium text-left flex items-center gap-2 transition-all border-2`}
                    style={{
                      borderColor: active ? c.bg : (prefs.dark ? '#44403c' : '#e7e5e4'),
                      background: active ? (prefs.dark ? c.bg + '20' : c.light) : (prefs.dark ? '#292524' : '#fff'),
                      color: active ? (prefs.dark ? c.light : c.text) : (prefs.dark ? '#d6d3d1' : '#44403c'),
                    }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.bg }} />
                    <span className="truncate">{j.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start time</label>
              <input type="time" className={inputClass} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End time</label>
              <input type="time" className={inputClass} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Hourly rate</label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
              <input type="number" step="0.01" min="0" className={inputClass + ' pl-7'} value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea rows={2} className={inputClass + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to remember…" />
          </div>

          {/* Summary */}
          {hrs > 0 && (
            <div className={`rounded-xl p-4 ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-100'}`}>
              <div className="flex justify-between text-sm">
                <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Total hours</span>
                <span className="font-semibold">{hrs.toFixed(2)}h</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Earnings</span>
                <span className="font-display text-xl font-semibold">{fmtCurrency(earnings)}</span>
              </div>
            </div>
          )}

          {err && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{err}</div>}

          <div className="flex gap-2 pt-2">
            {shift.id && (
              <button onClick={onDelete} className={`p-2.5 rounded-lg ${prefs.dark ? 'bg-red-950 text-red-400 hover:bg-red-900' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onCancel} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'}`}>Cancel</button>
            <button onClick={submit} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>
              {shift.id ? 'Save changes' : 'Add shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== SHIFT DETAIL ==============
function ShiftDetail({ shift, job, isConflict, onEdit, onDelete, onClose, prefs }) {
  if (!job) return null;
  const color = JOB_COLORS[job.colorIdx];
  const hrs = calculateHours(shift.startTime, shift.endTime);
  const earnings = hrs * shift.hourlyRate;
  const date = new Date(`${shift.date}T${shift.startTime}`);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in overflow-hidden`} onClick={e => e.stopPropagation()}>
        {/* Color header */}
        <div className="p-6 relative" style={{ background: color.bg }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30">
            <X className="w-4 h-4 text-white" />
          </button>
          <p className="text-white/80 text-xs uppercase tracking-widest font-medium">{dateLabel}</p>
          <h3 className="font-display text-3xl font-semibold text-white mt-1">{job.name}</h3>
          {isConflict && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-medium">
              <AlertTriangle className="w-3 h-3" /> Scheduling conflict
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Time</p>
              <p className="font-display text-xl font-semibold mt-1">{fmtTime(shift.startTime)}</p>
              <p className={`text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>to {fmtTime(shift.endTime)}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Duration</p>
              <p className="font-display text-xl font-semibold mt-1">{hrs.toFixed(2)}h</p>
              <p className={`text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>at ${shift.hourlyRate}/hr</p>
            </div>
          </div>

          <div className={`rounded-xl p-4 ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-100'}`}>
            <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Earnings</p>
            <p className="font-display text-3xl font-semibold mt-1">{fmtCurrency(earnings)}</p>
          </div>

          {shift.notes && (
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mb-1`}>Notes</p>
              <p className="text-sm whitespace-pre-wrap">{shift.notes}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onDelete} className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${prefs.dark ? 'bg-red-950 text-red-400 hover:bg-red-900' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <button onClick={onEdit} className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
