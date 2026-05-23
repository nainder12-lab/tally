import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, LayoutDashboard, Plus, Briefcase, Clock, DollarSign, AlertTriangle, ChevronLeft, ChevronRight, X, Edit2, Trash2, Bell, BellOff, Download, Moon, Sun, Filter, TrendingUp, CalendarDays, Check, CalendarPlus, ArrowUpRight, History, Settings as SettingsIcon, CheckCircle2, Circle, ArrowRight, Coffee, MoreHorizontal, Repeat } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ============== CONSTANTS ==============
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

// ============== TIME HELPERS ==============
const fmtDate = (d) => new Date(d).toISOString().split('T')[0];

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  return `${hr % 12 || 12}:${m} ${ampm}`;
};

const fmtCurrency = (n) => `$${n.toFixed(2)}`;

const calculateHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
};

const calculatePassiveBreakdown = (startTime, endTime, passiveStart = '21:00', passiveEnd = '08:00') => {
  const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
  const sMin = toMin(startTime);
  let eMin = toMin(endTime);
  if (eMin <= sMin) eMin += 24*60;
  const pStart = toMin(passiveStart);
  let pEnd = toMin(passiveEnd);
  if (pEnd <= pStart) pEnd += 24*60;
  const passiveIntervals = [
    [pStart, pEnd], [pStart - 1440, pEnd - 1440], [pStart + 1440, pEnd + 1440]
  ];
  let passiveOverlapMin = 0;
  passiveIntervals.forEach(([ps, pe]) => {
    const oStart = Math.max(sMin, ps);
    const oEnd = Math.min(eMin, pe);
    if (oEnd > oStart) passiveOverlapMin += (oEnd - oStart);
  });
  const totalMin = eMin - sMin;
  return {
    totalHours: totalMin / 60,
    activeHours: (totalMin - passiveOverlapMin) / 60,
    passiveHours: passiveOverlapMin / 60,
    hasPassiveOverlap: passiveOverlapMin > 0,
  };
};

const displayHours = (shift) => {
  if (shift.isPassiveNight) {
    const { activeHours } = calculatePassiveBreakdown(
      shift.startTime, shift.endTime,
      shift.passiveStart || '21:00', shift.passiveEnd || '08:00'
    );
    return 1 + activeHours;
  }
  return calculateHours(shift.startTime, shift.endTime);
};

const getRateForDate = (date, job, fallbackRate) => {
  if (!job) return fallbackRate;
  const day = date.getDay();
  if (day === 0 && job.sundayRate) return job.sundayRate;
  if (day === 6 && job.saturdayRate) return job.saturdayRate;
  return fallbackRate;
};

const calculateEarnings = (shift, job) => {
  if (shift.isPassiveNight) {
    const flatRate = shift.passiveFlatRate ?? 120;
    const breakdown = calculatePassiveBreakdown(
      shift.startTime, shift.endTime,
      shift.passiveStart || '21:00', shift.passiveEnd || '08:00'
    );
    // Split active hours by day for weekend rates
    const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
    const sMin = toMin(shift.startTime);
    let eMin = toMin(shift.endTime);
    if (eMin <= sMin) eMin += 24*60;
    const pStart = toMin(shift.passiveStart || '21:00');
    let pEnd = toMin(shift.passiveEnd || '08:00');
    if (pEnd <= pStart) pEnd += 24*60;
    const passiveIntervals = [[pStart, pEnd], [pStart - 1440, pEnd - 1440], [pStart + 1440, pEnd + 1440]];
    let activeRanges = [[sMin, eMin]];
    passiveIntervals.forEach(([ps, pe]) => {
      const newRanges = [];
      activeRanges.forEach(([rs, re]) => {
        const os = Math.max(rs, ps), oe = Math.min(re, pe);
        if (oe <= os) newRanges.push([rs, re]);
        else { if (rs < os) newRanges.push([rs, os]); if (oe < re) newRanges.push([oe, re]); }
      });
      activeRanges = newRanges;
    });
    const baseDate = new Date(shift.date + 'T00:00:00');
    const day2Date = new Date(baseDate); day2Date.setDate(day2Date.getDate() + 1);
    let day1Min = 0, day2Min = 0;
    activeRanges.forEach(([rs, re]) => {
      if (re <= 1440) day1Min += (re - rs);
      else if (rs >= 1440) day2Min += (re - rs);
      else { day1Min += (1440 - rs); day2Min += (re - 1440); }
    });
    const day1Rate = getRateForDate(baseDate, job, shift.hourlyRate);
    const day2Rate = getRateForDate(day2Date, job, shift.hourlyRate);
    const activeEarnings = (day1Min / 60) * day1Rate + (day2Min / 60) * day2Rate;
    return flatRate + activeEarnings;
  }
  // Non-passive
  const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
  const sMin = toMin(shift.startTime);
  let eMin = toMin(shift.endTime);
  if (eMin <= sMin) eMin += 24*60;
  const baseDate = new Date(shift.date + 'T00:00:00');
  const day2Date = new Date(baseDate); day2Date.setDate(day2Date.getDate() + 1);
  let day1Min = 0, day2Min = 0;
  if (eMin <= 1440) day1Min = eMin - sMin;
  else if (sMin >= 1440) day2Min = eMin - sMin;
  else { day1Min = 1440 - sMin; day2Min = eMin - 1440; }
  const day1Rate = getRateForDate(baseDate, job, shift.hourlyRate);
  const day2Rate = getRateForDate(day2Date, job, shift.hourlyRate);
  return (day1Min / 60) * day1Rate + (day2Min / 60) * day2Rate;
};

// Week starts Thursday
const getWeekRange = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const daysBack = (day - 4 + 7) % 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - daysBack);
  thursday.setHours(0,0,0,0);
  const wednesday = new Date(thursday);
  wednesday.setDate(thursday.getDate() + 6);
  wednesday.setHours(23,59,59,999);
  return [thursday, wednesday];
};

const getFortnightRange = (date, anchorISO) => {
  // Returns the fortnight range that contains `date`, where fortnights are
  // measured in 14-day blocks anchored at `anchorISO` (a date string).
  // anchorISO defaults to the Thursday of the current week.
  let anchor;
  if (anchorISO) {
    anchor = new Date(anchorISO + 'T00:00:00');
  } else {
    [anchor] = getWeekRange(new Date());
  }
  anchor.setHours(0,0,0,0);
  const target = new Date(date); target.setHours(0,0,0,0);
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((target - anchor) / dayMs);
  const periods = Math.floor(diffDays / 14);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + periods * 14);
  const end = new Date(start);
  end.setDate(start.getDate() + 13);
  end.setHours(23,59,59,999);
  return [start, end];
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
        if (dayShifts[i].startTime < dayShifts[j].endTime && dayShifts[j].startTime < dayShifts[i].endTime) {
          conflicts.add(dayShifts[i].id);
          conflicts.add(dayShifts[j].id);
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
      // Migrate: ensure all shifts have status field
      parsed.shifts = (parsed.shifts || []).map(s => ({ status: 'scheduled', ...s }));
      return parsed;
    }
  } catch (e) {}
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const nextWk = new Date(today); nextWk.setDate(nextWk.getDate() + 3);
  return {
    jobs: [
      { id: 'j1', name: 'Cafe Bellini', colorIdx: 0, rate: 24.5 },
      { id: 'j2', name: 'Library Assistant', colorIdx: 1, rate: 32 },
      { id: 'j3', name: 'Freelance Design', colorIdx: 3, rate: 65 },
    ],
    shifts: [
      { id: 's1', jobId: 'j1', date: fmtDate(yesterday), startTime: '07:00', endTime: '14:00', hourlyRate: 24.5, notes: 'Morning rush', status: 'done' },
      { id: 's2', jobId: 'j2', date: fmtDate(today), startTime: '15:00', endTime: '19:00', hourlyRate: 32, notes: '', status: 'scheduled' },
      { id: 's3', jobId: 'j1', date: fmtDate(today), startTime: '08:00', endTime: '13:00', hourlyRate: 24.5, notes: '', status: 'scheduled' },
      { id: 's4', jobId: 'j3', date: fmtDate(tomorrow), startTime: '10:00', endTime: '15:00', hourlyRate: 65, notes: 'Client mockups', status: 'scheduled' },
      { id: 's5', jobId: 'j2', date: fmtDate(nextWk), startTime: '09:00', endTime: '17:00', hourlyRate: 32, notes: '', status: 'scheduled' },
    ],
  };
};

const saveData = (data) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {} };
const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { dark: false, notifications: true, autoMarkDone: false, ...p };
    }
  } catch (e) {}
  return { dark: false, notifications: true, autoMarkDone: false };
};
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} };

// ============== PAY CYCLE HELPERS ==============
// Pay cycle on a job: { type: 'weekly'|'fortnightly'|'monthly', payday: 0-6 (day of week for weekly/fortnightly) or 1-31 for monthly, anchorDate: ISO (for fortnightly), cycleStart: 0-6 day of week the work-period begins (defaults to Thursday=4) }
const getPayCycleForDate = (job, date) => {
  if (!job?.payCycle) return null;
  const pc = job.payCycle;
  const d = new Date(date); d.setHours(0,0,0,0);
  if (pc.type === 'weekly') {
    // Work period ends on payday-1 (one day before pay). Period is 7 days ending at end of payday-1.
    const cycleStart = pc.cycleStart ?? 4; // default Thursday
    const day = d.getDay();
    const daysBack = (day - cycleStart + 7) % 7;
    const start = new Date(d); start.setDate(d.getDate() - daysBack); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    // Next payday
    const payday = pc.payday ?? 4;
    const payDaysFromStart = (payday - cycleStart + 7) % 7 || 7; // payday after period end
    const payDate = new Date(start); payDate.setDate(start.getDate() + payDaysFromStart + 6);
    return { start, end, payDate, label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` };
  }
  if (pc.type === 'fortnightly') {
    const anchor = pc.anchorDate ? new Date(pc.anchorDate + 'T00:00:00') : new Date();
    anchor.setHours(0,0,0,0);
    const dayMs = 86400000;
    const diff = Math.floor((d - anchor) / dayMs);
    const periods = Math.floor(diff / 14);
    const start = new Date(anchor); start.setDate(anchor.getDate() + periods * 14);
    const end = new Date(start); end.setDate(start.getDate() + 13); end.setHours(23,59,59,999);
    const payDate = new Date(end); payDate.setDate(end.getDate() + (pc.payOffsetDays ?? 1));
    return { start, end, payDate, label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` };
  }
  if (pc.type === 'monthly') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const dayOfMonth = Math.min(pc.payday || 15, end.getDate());
    let payDate = new Date(d.getFullYear(), d.getMonth(), dayOfMonth);
    if (payDate < new Date()) payDate = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth);
    return { start, end, payDate, label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }
  return null;
};

// ============== APP ==============
export default function App() {
  const [data, setData] = useState(loadData);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState('dashboard');
  const [editingShift, setEditingShift] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [detailShift, setDetailShift] = useState(null);
  const [dayDetailDate, setDayDetailDate] = useState(null);
  const [periodDetail, setPeriodDetail] = useState(null); // { period: 'week'|'fortnight'|'month', start, end }
  const [calendarJobFilter, setCalendarJobFilter] = useState('all');
  const [historyJobFilter, setHistoryJobFilter] = useState('all');
  const [doneShiftPrompts, setDoneShiftPrompts] = useState([]); // queue of shifts that need "done?" prompt
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const conflicts = useMemo(() => detectConflicts(data.shifts.filter(s => s.status !== 'done')), [data.shifts]);
  const jobMap = useMemo(() => Object.fromEntries(data.jobs.map(j => [j.id, j])), [data.jobs]);

  // ===== Back button handling =====
  const refs = {
    view: useRef(view),
    editingShift: useRef(editingShift),
    editingJob: useRef(editingJob),
    detailShift: useRef(detailShift),
    dayDetailDate: useRef(dayDetailDate),
    periodDetail: useRef(periodDetail),
    confirmDelete: useRef(confirmDelete),
    moreMenuOpen: useRef(moreMenuOpen),
  };
  useEffect(() => { refs.view.current = view; }, [view]);
  useEffect(() => { refs.editingShift.current = editingShift; }, [editingShift]);
  useEffect(() => { refs.editingJob.current = editingJob; }, [editingJob]);
  useEffect(() => { refs.detailShift.current = detailShift; }, [detailShift]);
  useEffect(() => { refs.dayDetailDate.current = dayDetailDate; }, [dayDetailDate]);
  useEffect(() => { refs.periodDetail.current = periodDetail; }, [periodDetail]);
  useEffect(() => { refs.confirmDelete.current = confirmDelete; }, [confirmDelete]);
  useEffect(() => { refs.moreMenuOpen.current = moreMenuOpen; }, [moreMenuOpen]);

  useEffect(() => {
    window.history.pushState({ tallyApp: true }, '');
    const handlePop = () => {
      // Close in priority order (deepest UI first)
      if (refs.confirmDelete.current !== null) { setConfirmDelete(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.moreMenuOpen.current) { setMoreMenuOpen(false); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.editingShift.current !== null) { setEditingShift(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.editingJob.current !== null) { setEditingJob(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.detailShift.current !== null) { setDetailShift(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.dayDetailDate.current !== null) { setDayDetailDate(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.periodDetail.current !== null) { setPeriodDetail(null); window.history.pushState({ tallyApp: true }, ''); }
      else if (refs.view.current !== 'dashboard') { setView('dashboard'); window.history.pushState({ tallyApp: true }, ''); }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // ===== Notification system =====
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default' && prefs.notifications) {
      const t = setTimeout(() => { try { Notification.requestPermission(); } catch {} }, 2000);
      return () => clearTimeout(t);
    }
  }, [prefs.notifications]);

  useEffect(() => {
    if (!prefs.notifications) return;
    const NOTIF_LOG_KEY = 'tally_notif_log_v1';
    let sentIds;
    try { sentIds = new Set(JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) || '[]')); }
    catch { sentIds = new Set(); }

    const sendNotification = (title, body, tag) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          // Try service worker registration for persistent notifications
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
              if (reg && reg.showNotification) {
                reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag, requireInteraction: false });
              } else {
                new Notification(title, { body, icon: '/icon-192.png', tag });
              }
            }).catch(() => {
              try { new Notification(title, { body, icon: '/icon-192.png', tag }); } catch {}
            });
          } else {
            new Notification(title, { body, icon: '/icon-192.png', tag });
          }
        } catch (e) { showToast(`${title}: ${body}`, 'bell'); }
      } else {
        showToast(`${title}: ${body}`, 'bell');
      }
    };

    const check = () => {
      const now = new Date();
      data.shifts.forEach(s => {
        if (s.status === 'done') return;
        const shiftStart = new Date(`${s.date}T${s.startTime}`);
        const shiftEnd = new Date(`${s.date}T${s.endTime}`);
        if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);
        const job = jobMap[s.jobId];
        if (!job) return;

        const hrsToStart = (shiftStart - now) / 3600000;
        const hrsSinceEnd = (now - shiftEnd) / 3600000;

        // 24hr reminder
        if (hrsToStart > 23.5 && hrsToStart < 24.5 && !sentIds.has(`24-${s.id}`)) {
          sentIds.add(`24-${s.id}`);
          sendNotification('Shift tomorrow', `${job.name} at ${fmtTime(s.startTime)}`, `24-${s.id}`);
        }
        // 1hr reminder
        if (hrsToStart > 0.5 && hrsToStart < 1.5 && !sentIds.has(`1-${s.id}`)) {
          sentIds.add(`1-${s.id}`);
          sendNotification('Starting soon', `${job.name} in 1 hour`, `1-${s.id}`);
        }
        // "Done?" prompt after shift ends
        if (hrsSinceEnd > 0 && hrsSinceEnd < 24 && !sentIds.has(`done-${s.id}`)) {
          sentIds.add(`done-${s.id}`);
          if (prefs.autoMarkDone) {
            setData(d => ({ ...d, shifts: d.shifts.map(x => x.id === s.id ? { ...x, status: 'done' } : x) }));
          } else {
            // queue in-app prompt and send notification
            setDoneShiftPrompts(q => q.some(p => p.id === s.id) ? q : [...q, s]);
            sendNotification('Shift finished?', `Did you complete ${job.name}? Tap to confirm.`, `done-${s.id}`);
          }
        }
      });
      const validIds = new Set();
      data.shifts.forEach(s => { validIds.add(`24-${s.id}`); validIds.add(`1-${s.id}`); validIds.add(`done-${s.id}`); });
      const pruned = Array.from(sentIds).filter(id => validIds.has(id));
      try { localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(pruned)); } catch {}
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [data.shifts, jobMap, prefs.notifications, prefs.autoMarkDone]);

  const showToast = (msg, icon = 'check') => {
    setToast({ msg, icon, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  };

  const saveShift = (shift) => {
    if (shift.id) {
      setData(d => ({ ...d, shifts: d.shifts.map(s => s.id === shift.id ? shift : s) }));
      showToast('Shift updated');
    } else {
      setData(d => ({ ...d, shifts: [...d.shifts, { ...shift, id: `s${Date.now()}`, status: 'scheduled' }] }));
      showToast('Shift added');
    }
    setEditingShift(null);
  };

  const saveRecurringShifts = (instances) => {
    setData(d => ({ ...d, shifts: [...d.shifts, ...instances] }));
    showToast(`${instances.length} recurring shifts added`);
    setEditingShift(null);
  };

  const handleDeleteShift = (shift, keepHistory, scope = 'this') => {
    // Determine which shifts to affect
    let targetIds;
    if (scope === 'all' && shift.recurringId) {
      targetIds = data.shifts.filter(s => s.recurringId === shift.recurringId).map(s => s.id);
    } else if (scope === 'future' && shift.recurringId) {
      const cutoff = shift.date;
      targetIds = data.shifts.filter(s => s.recurringId === shift.recurringId && s.date >= cutoff).map(s => s.id);
    } else {
      targetIds = [shift.id];
    }
    const targetSet = new Set(targetIds);

    if (keepHistory) {
      setData(d => ({ ...d, shifts: d.shifts.map(s => targetSet.has(s.id) ? { ...s, status: 'done' } : s) }));
      showToast(targetIds.length > 1 ? `${targetIds.length} shifts moved to history` : 'Shift moved to history');
    } else {
      setData(d => ({ ...d, shifts: d.shifts.filter(s => !targetSet.has(s.id)) }));
      showToast(targetIds.length > 1 ? `${targetIds.length} shifts deleted` : 'Shift deleted');
    }
    setEditingShift(null);
    setDetailShift(null);
    setConfirmDelete(null);
  };

  const markShiftDone = (shiftId, done = true) => {
    setData(d => ({ ...d, shifts: d.shifts.map(s => s.id === shiftId ? { ...s, status: done ? 'done' : 'scheduled' } : s) }));
    setDoneShiftPrompts(q => q.filter(p => p.id !== shiftId));
    showToast(done ? 'Marked as done' : 'Marked as scheduled');
  };

  const saveJob = (job) => {
    if (job.id) {
      setData(d => ({ ...d, jobs: d.jobs.map(j => j.id === job.id ? job : j) }));
    } else {
      setData(d => ({ ...d, jobs: [...d.jobs, { ...job, id: `j${Date.now()}` }] }));
    }
    setEditingJob(null);
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
    const headers = ['Date', 'Job', 'Start', 'End', 'Total Hours', 'Active Hours', 'Passive Hours', 'Rate', 'Passive Pay', 'Earnings', 'Status', 'Type', 'Notes'];
    const rows = [...data.shifts]
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(s => {
        const job = jobMap[s.jobId];
        const totalHrs = calculateHours(s.startTime, s.endTime);
        const breakdown = s.isPassiveNight ? calculatePassiveBreakdown(s.startTime, s.endTime, s.passiveStart || '21:00', s.passiveEnd || '08:00') : null;
        return [
          s.date, job?.name || 'Unknown', s.startTime, s.endTime,
          totalHrs.toFixed(2),
          breakdown ? breakdown.activeHours.toFixed(2) : totalHrs.toFixed(2),
          breakdown ? breakdown.passiveHours.toFixed(2) : '0',
          s.hourlyRate,
          s.isPassiveNight ? (s.passiveFlatRate ?? 120).toFixed(2) : '0',
          calculateEarnings(s, jobMap[s.jobId]).toFixed(2),
          s.status || 'scheduled',
          s.isPassiveNight ? 'Passive Night' : 'Regular',
          `"${(s.notes || '').replace(/"/g,'""')}"`
        ].join(',');
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

  const sharedProps = { data, prefs, jobMap, conflicts, cardClass, subtleText,
    onViewShift: setDetailShift, onEditShift: (s) => setEditingShift(s),
    onAddShift: () => setEditingShift({}), onViewDay: setDayDetailDate,
    onViewPeriod: setPeriodDetail, onSetView: setView,
    onSetCalendarFilter: (id) => { setCalendarJobFilter(id); setView('calendar'); },
    markShiftDone,
  };

  const currentDonePrompt = doneShiftPrompts[0];

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`} style={{ fontFamily: '"Inter Tight", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@300;400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
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

      <Header prefs={prefs} setPrefs={setPrefs} exportCSV={exportCSV} conflicts={conflicts} onSettings={() => setView('settings')} />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pb-24 md:pb-32 pt-6">
        {view === 'dashboard' && <Dashboard {...sharedProps} />}
        {view === 'calendar' && <CalendarView shifts={(calendarJobFilter === 'all' ? data.shifts : data.shifts.filter(s => s.jobId === calendarJobFilter))} jobs={data.jobs} jobMap={jobMap} conflicts={conflicts} onViewShift={setDetailShift} onAddShift={() => setEditingShift({})} onViewDay={setDayDetailDate} filterJob={calendarJobFilter} setFilterJob={setCalendarJobFilter} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />}
        {view === 'earnings' && <EarningsView shifts={data.shifts} jobs={data.jobs} jobMap={jobMap} onViewPeriod={setPeriodDetail} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />}
        {view === 'history' && <HistoryView shifts={data.shifts} jobs={data.jobs} jobMap={jobMap} filterJob={historyJobFilter} setFilterJob={setHistoryJobFilter} onViewShift={setDetailShift} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />}
        {view === 'jobs' && <JobsView jobs={data.jobs} shifts={data.shifts} onEdit={setEditingJob} onAdd={() => setEditingJob({})} onDelete={deleteJob} onViewShifts={(jobId) => { setCalendarJobFilter(jobId); setView('calendar'); }} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />}
        {view === 'available' && <AvailabilityView shifts={data.shifts.filter(s => s.status !== 'done')} prefs={prefs} cardClass={cardClass} subtleText={subtleText} />}
        {view === 'settings' && <SettingsView prefs={prefs} setPrefs={setPrefs} prefsCardClass={cardClass} subtleText={subtleText} />}
      </main>

      <FloatingAddBtn onClick={() => setEditingShift({})} dark={prefs.dark} />
      <BottomNav view={view} setView={setView} dark={prefs.dark} onAdd={() => setEditingShift({})} onMore={() => setMoreMenuOpen(true)} />
      <DesktopNav view={view} setView={setView} dark={prefs.dark} />
      {moreMenuOpen && <MoreMenu view={view} setView={setView} onClose={() => setMoreMenuOpen(false)} dark={prefs.dark} />}

      {/* Modals */}
      {editingShift !== null && (
        <ShiftForm shift={editingShift} jobs={data.jobs} onSave={saveShift} onSaveRecurring={saveRecurringShifts} onDelete={editingShift.id ? () => setConfirmDelete({ shift: editingShift }) : null} onCancel={() => setEditingShift(null)} prefs={prefs} />
      )}
      {editingJob !== null && (
        <JobForm job={editingJob} onSave={saveJob} onCancel={() => setEditingJob(null)} prefs={prefs} />
      )}
      {detailShift && (
        <ShiftDetail shift={detailShift} job={jobMap[detailShift.jobId]} isConflict={conflicts.has(detailShift.id)} onEdit={() => { setEditingShift(detailShift); setDetailShift(null); }} onDelete={() => setConfirmDelete({ shift: detailShift })} onClose={() => setDetailShift(null)} onMarkDone={() => { markShiftDone(detailShift.id, detailShift.status !== 'done'); setDetailShift(null); }} prefs={prefs} />
      )}
      {dayDetailDate && (
        <DayDetail date={dayDetailDate} shifts={data.shifts.filter(s => s.date === dayDetailDate)} jobMap={jobMap} conflicts={conflicts} onViewShift={(s) => { setDayDetailDate(null); setDetailShift(s); }} onAddShift={() => { setDayDetailDate(null); setEditingShift({ date: dayDetailDate }); }} onClose={() => setDayDetailDate(null)} prefs={prefs} />
      )}
      {periodDetail && (
        <PeriodDetail period={periodDetail} shifts={data.shifts} jobs={data.jobs} jobMap={jobMap} onViewShift={(s) => { setPeriodDetail(null); setDetailShift(s); }} onClose={() => setPeriodDetail(null)} prefs={prefs} />
      )}
      {confirmDelete && (
        <DeleteConfirm shift={confirmDelete.shift} job={jobMap[confirmDelete.shift.jobId]} onCancel={() => setConfirmDelete(null)} onConfirm={(keepHistory, scope) => handleDeleteShift(confirmDelete.shift, keepHistory, scope)} prefs={prefs} />
      )}

      {/* Done-prompt overlay */}
      {currentDonePrompt && (
        <DonePrompt
          shift={currentDonePrompt}
          job={jobMap[currentDonePrompt.jobId]}
          onYes={() => markShiftDone(currentDonePrompt.id, true)}
          onNo={() => setDoneShiftPrompts(q => q.slice(1))}
          prefs={prefs}
        />
      )}

      {/* Toast */}
      {toast && (
        <div key={toast.id} className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-slide-down pointer-events-none">
          <div className={`${prefs.dark ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100'} px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm font-medium`}>
            {toast.icon === 'bell' ? <Bell className="w-4 h-4" /> : toast.icon === 'alert' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== HEADER ==============
function Header({ prefs, setPrefs, exportCSV, conflicts, onSettings }) {
  return (
    <header className={`sticky top-0 z-30 backdrop-blur-xl ${prefs.dark ? 'bg-stone-950/80 border-stone-800' : 'bg-stone-50/80 border-stone-200'} border-b`}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${prefs.dark ? 'bg-amber-300' : 'bg-stone-900'}`}>
            <Clock className={`w-5 h-5 ${prefs.dark ? 'text-stone-900' : 'text-amber-300'}`} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-xl md:text-2xl font-semibold leading-none">Tally</h1>
            <p className={`text-[10px] uppercase tracking-widest ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mt-1`}>Shifts &amp; Earnings</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conflicts.size > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {conflicts.size / 2} conflict{conflicts.size > 2 ? 's' : ''}
            </div>
          )}
          <IconBtn onClick={() => setPrefs(p => ({ ...p, dark: !p.dark }))} dark={prefs.dark} label="Toggle dark mode">
            {prefs.dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </IconBtn>
          <IconBtn onClick={exportCSV} dark={prefs.dark} label="Export CSV"><Download className="w-4 h-4" /></IconBtn>
          <IconBtn onClick={onSettings} dark={prefs.dark} label="Settings"><SettingsIcon className="w-4 h-4" /></IconBtn>
        </div>
      </div>
    </header>
  );
}

function IconBtn({ onClick, dark, children, label }) {
  return (
    <button onClick={onClick} className={`p-2 rounded-lg transition-colors ${dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`} aria-label={label}>
      {children}
    </button>
  );
}

// ============== NAVIGATION ==============
function FloatingAddBtn({ onClick, dark }) {
  return (
    <button onClick={onClick} className={`hidden md:flex fixed bottom-24 right-8 z-20 w-14 h-14 rounded-full items-center justify-center shadow-2xl transition-all hover:scale-105 ${dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`} aria-label="Add shift">
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </button>
  );
}

function BottomNav({ view, setView, dark, onAdd, onMore }) {
  return (
    <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-30 ${dark ? 'bg-stone-950/95 border-stone-800' : 'bg-white/95 border-stone-200'} border-t backdrop-blur-xl`}>
      <div className="flex items-center justify-around px-2 pt-2 pb-3">
        <NavBtn icon={LayoutDashboard} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} dark={dark} />
        <NavBtn icon={Calendar} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} dark={dark} />
        <button onClick={onAdd} className={`flex flex-col items-center -mt-6 ${dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'} w-12 h-12 rounded-full shadow-lg justify-center`}>
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <NavBtn icon={Coffee} label="Free time" active={view === 'available'} onClick={() => setView('available')} dark={dark} />
        <NavBtn icon={MoreHorizontal} label="More" active={['history','jobs','earnings','settings'].includes(view)} onClick={onMore} dark={dark} />
      </div>
    </nav>
  );
}

function MoreMenu({ view, setView, onClose, dark }) {
  const items = [
    { id: 'history', icon: History, label: 'History', desc: 'Past completed shifts' },
    { id: 'earnings', icon: TrendingUp, label: 'Earnings', desc: 'Charts and breakdowns' },
    { id: 'jobs', icon: Briefcase, label: 'Jobs', desc: 'Manage positions and pay' },
    { id: 'settings', icon: SettingsIcon, label: 'Settings', desc: 'Notifications, theme, more' },
  ];
  const cardBg = dark ? 'bg-stone-900' : 'bg-white';
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in md:hidden" onClick={onClose}>
      <div className={`${cardBg} w-full rounded-t-3xl shadow-2xl animate-slide-up pb-8`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className={`w-12 h-1 rounded-full ${dark ? 'bg-stone-700' : 'bg-stone-300'}`} />
        </div>
        <div className="px-6 py-4">
          <h3 className="font-display text-2xl font-semibold mb-4">More</h3>
          <div className="space-y-1">
            {items.map(it => {
              const Icon = it.icon;
              const active = view === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => { setView(it.id); onClose(); }}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-colors ${active ? (dark ? 'bg-stone-800' : 'bg-stone-100') : (dark ? 'hover:bg-stone-800/50' : 'hover:bg-stone-50')}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{it.label}</p>
                    <p className={`text-xs mt-0.5 ${dark ? 'text-stone-400' : 'text-stone-500'}`}>{it.desc}</p>
                  </div>
                  <ArrowRight className={`w-4 h-4 ${dark ? 'text-stone-500' : 'text-stone-400'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopNav({ view, setView, dark }) {
  return (
    <nav className={`hidden md:flex fixed left-1/2 -translate-x-1/2 bottom-6 z-30 ${dark ? 'bg-stone-900/90 border-stone-800' : 'bg-white/90 border-stone-200'} border backdrop-blur-xl rounded-full shadow-xl px-2 py-2 gap-1`}>
      <DesktopNavBtn icon={LayoutDashboard} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} dark={dark} />
      <DesktopNavBtn icon={Calendar} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} dark={dark} />
      <DesktopNavBtn icon={TrendingUp} label="Earnings" active={view === 'earnings'} onClick={() => setView('earnings')} dark={dark} />
      <DesktopNavBtn icon={History} label="History" active={view === 'history'} onClick={() => setView('history')} dark={dark} />
      <DesktopNavBtn icon={Coffee} label="Free time" active={view === 'available'} onClick={() => setView('available')} dark={dark} />
      <DesktopNavBtn icon={Briefcase} label="Jobs" active={view === 'jobs'} onClick={() => setView('jobs')} dark={dark} />
    </nav>
  );
}

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
function Dashboard({ data, jobMap, conflicts, prefs, onViewShift, onSetView, onViewPeriod, cardClass, subtleText }) {
  const now = new Date();
  const todayStr = fmtDate(now);
  const [weekStart, weekEnd] = getWeekRange(now);
  const [fortStart, fortEnd] = getFortnightRange(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const inRange = (s, start, end) => {
    const d = new Date(`${s.date}T${s.startTime}`);
    return d >= start && d <= end;
  };

  const weekShifts = data.shifts.filter(s => inRange(s, weekStart, weekEnd));
  const fortShifts = data.shifts.filter(s => inRange(s, fortStart, fortEnd));
  const monthShifts = data.shifts.filter(s => inRange(s, monthStart, monthEnd));
  const todayShifts = data.shifts.filter(s => s.date === todayStr).sort((a,b) => a.startTime.localeCompare(b.startTime));

  const weekEarnings = weekShifts.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const fortEarnings = fortShifts.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const monthEarnings = monthShifts.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const weekHours = weekShifts.reduce((sum, s) => sum + displayHours(s), 0);

  const upcoming = data.shifts
    .filter(s => s.status !== 'done')
    .filter(s => {
      const d = new Date(`${s.date}T${s.startTime}`);
      return d >= now;
    })
    .sort((a,b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, 5);

  const conflictShifts = data.shifts.filter(s => conflicts.has(s.id));

  const chartData = useMemo(() => {
    const weeks = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const [ws, we] = getWeekRange(ref);
      const total = data.shifts
        .filter(s => inRange(s, ws, we))
        .reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
      weeks.push({ week: `${ws.getMonth() + 1}/${ws.getDate()}`, earnings: parseFloat(total.toFixed(2)) });
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
      <div className="pt-2">
        <p className={`text-xs uppercase tracking-[0.2em] ${subtleText} mb-2`}>{greeting}</p>
        <h2 className="font-display text-4xl md:text-5xl font-medium leading-tight">
          You've earned <span className={prefs.dark ? 'text-amber-300' : 'text-stone-900'}>{fmtCurrency(weekEarnings)}</span> this week.
        </h2>
        <p className={`mt-2 ${subtleText} text-sm`}>{weekHours.toFixed(1)} hours · {weekShifts.length} shift{weekShifts.length !== 1 ? 's' : ''}</p>
      </div>

      {conflictShifts.length > 0 && (
        <div className={`rounded-2xl p-5 border-2 ${prefs.dark ? 'bg-red-950/30 border-red-900' : 'bg-red-50 border-red-200'}`}>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
        <ClickableStatCard label="This Week" value={fmtCurrency(weekEarnings)} sub={`${weekShifts.length} shifts`} onClick={() => onViewPeriod({ period: 'week', start: weekStart, end: weekEnd })} cardClass={cardClass} subtleText={subtleText} dark={prefs.dark} />
        <ClickableStatCard label="This Fortnight" value={fmtCurrency(fortEarnings)} sub={`${fortShifts.length} shifts`} onClick={() => onViewPeriod({ period: 'fortnight', start: fortStart, end: fortEnd })} cardClass={cardClass} subtleText={subtleText} dark={prefs.dark} />
        <ClickableStatCard label="This Month" value={fmtCurrency(monthEarnings)} sub={`${monthShifts.length} shifts`} onClick={() => onViewPeriod({ period: 'month', start: monthStart, end: monthEnd })} cardClass={cardClass} subtleText={subtleText} dark={prefs.dark} />
        <ClickableStatCard label="Active Jobs" value={data.jobs.length} sub="positions" onClick={() => onSetView('jobs')} cardClass={cardClass} subtleText={subtleText} dark={prefs.dark} />
      </div>

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
              <Tooltip contentStyle={{ background: prefs.dark ? '#1c1917' : '#fff', border: `1px solid ${prefs.dark ? '#44403c' : '#e7e5e4'}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toFixed(2)}`, 'Earnings']} />
              <Line type="monotone" dataKey="earnings" stroke={prefs.dark ? '#fcd34d' : '#1c1917'} strokeWidth={2.5} dot={{ r: 4, fill: prefs.dark ? '#fcd34d' : '#1c1917' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
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

function ClickableStatCard({ label, value, sub, onClick, cardClass, subtleText, dark }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border ${cardClass} p-4 md:p-5 transition-all hover:scale-[1.02] hover:shadow-lg ${dark ? 'hover:border-stone-700' : 'hover:border-stone-300'}`}>
      <p className={`text-[10px] uppercase tracking-widest ${subtleText} font-medium flex items-center gap-1`}>
        {label}
        <ArrowRight className="w-3 h-3 opacity-40" />
      </p>
      <p className="font-display text-2xl md:text-3xl font-semibold mt-2 leading-none">{value}</p>
      <p className={`text-xs ${subtleText} mt-1.5`}>{sub}</p>
    </button>
  );
}

// ============== SHIFT CARD ==============
function ShiftCard({ shift, job, isConflict, onClick, prefs, showDate, showStatus }) {
  if (!job) return null;
  const color = JOB_COLORS[job.colorIdx];
  const hrs = calculateHours(shift.startTime, shift.endTime);
  const earnings = calculateEarnings(shift, job);
  const date = new Date(`${shift.date}T${shift.startTime}`);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const isDone = shift.status === 'done';

  return (
    <button onClick={onClick} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-[1.01] ${prefs.dark ? 'bg-stone-800/50 hover:bg-stone-800' : 'bg-stone-50 hover:bg-stone-100'} ${isConflict ? 'ring-2 ring-red-400 dark:ring-red-500' : ''} ${isDone ? 'opacity-60' : ''}`}>
      <div className="w-1 h-12 rounded-full" style={{ background: color.bg }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium truncate ${isDone ? 'line-through' : ''}`}>{job.name}</p>
          {shift.isPassiveNight && <Moon className="w-3.5 h-3.5 shrink-0 opacity-60" />}
          {isDone && showStatus && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
          {isConflict && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
        </div>
        <p className={`text-xs ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mt-0.5`}>
          {showDate && `${dateLabel} · `}{fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display font-semibold">{fmtCurrency(earnings)}</p>
        <p className={`text-[10px] ${prefs.dark ? 'text-stone-500' : 'text-stone-400'}`}>{displayHours(shift).toFixed(1)}h</p>
      </div>
    </button>
  );
}

// ============== CALENDAR ==============
function CalendarView({ shifts, jobs, jobMap, conflicts, onViewShift, onAddShift, onViewDay, filterJob, setFilterJob, prefs, cardClass, subtleText }) {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstDay = new Date(year, monthIdx, 1);
  const lastDay = new Date(year, monthIdx + 1, 0);
  const startDay = (firstDay.getDay() - 4 + 7) % 7; // Thursday start
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

  const monthEarnings = Object.values(monthShifts).flat().reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const monthHours = Object.values(monthShifts).flat().reduce((sum, s) => sum + displayHours(s), 0);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium">
            {month.toLocaleString('default', { month: 'long' })} <span className={subtleText}>{year}</span>
          </h2>
          <p className={`text-sm ${subtleText} mt-1`}>
            {fmtCurrency(monthEarnings)} · {monthHours.toFixed(1)}h
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={() => setMonth(new Date(year, monthIdx - 1, 1))} dark={prefs.dark} label="Previous"><ChevronLeft className="w-5 h-5" /></IconBtn>
          <button onClick={() => setMonth(new Date())} className={`px-3 py-2 rounded-lg text-sm font-medium ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-200'}`}>Today</button>
          <IconBtn onClick={() => setMonth(new Date(year, monthIdx + 1, 1))} dark={prefs.dark} label="Next"><ChevronRight className="w-5 h-5" /></IconBtn>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-thin pb-1">
        <Filter className={`w-4 h-4 shrink-0 ${subtleText}`} />
        <button onClick={() => setFilterJob('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterJob === 'all' ? (prefs.dark ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100') : (prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700')}`}>
          All jobs
        </button>
        {jobs.map(j => {
          const c = JOB_COLORS[j.colorIdx];
          const active = filterJob === j.id;
          return (
            <button key={j.id} onClick={() => setFilterJob(j.id)} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all" style={{ background: active ? c.bg : (prefs.dark ? '#292524' : '#f5f5f4'), color: active ? '#fff' : (prefs.dark ? '#d6d3d1' : '#44403c') }}>
              <span className="w-2 h-2 rounded-full" style={{ background: active ? '#fff' : c.bg }} />
              {j.name}
            </button>
          );
        })}
      </div>

      <div className={`rounded-2xl border ${cardClass} overflow-hidden`}>
        <div className={`grid grid-cols-7 ${prefs.dark ? 'bg-stone-900 border-stone-800' : 'bg-stone-100/50 border-stone-200'} border-b`}>
          {['Thu','Fri','Sat','Sun','Mon','Tue','Wed'].map(d => (
            <div key={d} className={`px-2 py-2.5 text-[10px] uppercase tracking-widest font-medium text-center ${subtleText}`}>
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        {weeks.map((wk, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? (prefs.dark ? 'border-b border-stone-800' : 'border-b border-stone-200') : ''}`}>
            {wk.map((day, di) => {
              const dayShifts = day ? (monthShifts[day] || []) : [];
              const hasConflict = dayShifts.some(s => conflicts.has(s.id));
              const dateStr = day ? `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null;
              return (
                <button
                  key={di}
                  onClick={() => dateStr && onViewDay(dateStr)}
                  disabled={!day}
                  className={`text-left min-h-[80px] md:min-h-[110px] p-1.5 md:p-2 transition-colors ${di < 6 ? (prefs.dark ? 'border-r border-stone-800' : 'border-r border-stone-200') : ''} ${isToday(day) ? (prefs.dark ? 'bg-amber-300/5' : 'bg-amber-50/50') : ''} ${day ? (prefs.dark ? 'hover:bg-stone-800/30' : 'hover:bg-stone-100/50') : ''}`}
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
                          const isDone = s.status === 'done';
                          return (
                            <div key={s.id} className={`text-[10px] md:text-xs px-1.5 py-1 rounded truncate ${isConflict ? 'ring-1 ring-red-500' : ''} ${isDone ? 'opacity-50' : ''}`} style={{ background: prefs.dark ? color.bg + '30' : color.light, color: prefs.dark ? color.light : color.text }}>
                              <span className="font-medium hidden md:inline">{fmtTime(s.startTime).replace(':00','')} </span>
                              <span className="md:hidden">●</span> {job.name}
                            </div>
                          );
                        })}
                        {dayShifts.length > 3 && (
                          <p className={`text-[10px] ${subtleText} px-1.5 font-medium`}>+{dayShifts.length - 3} more</p>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className={`text-xs ${subtleText} mt-3 text-center`}>Tap any day to see all shifts and add new ones</p>
    </div>
  );
}

// ============== DAY DETAIL ==============
function DayDetail({ date, shifts, jobMap, conflicts, onViewShift, onAddShift, onClose, prefs }) {
  const d = new Date(date + 'T00:00:00');
  const sorted = [...shifts].sort((a,b) => a.startTime.localeCompare(b.startTime));
  const totalEarnings = sorted.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in max-h-[90vh] overflow-hidden flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className={`p-6 pb-4 border-b ${prefs.dark ? 'border-stone-800' : 'border-stone-200'} flex items-start justify-between gap-3`}>
          <div>
            <p className={`text-xs uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>
              {d.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
            <h2 className="font-display text-2xl font-semibold mt-1">
              {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </h2>
            <p className={`text-xs mt-1 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>
              {sorted.length} shift{sorted.length !== 1 ? 's' : ''} · {fmtCurrency(totalEarnings)}
            </p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto scrollbar-thin flex-1 space-y-2">
          {sorted.length === 0 ? (
            <div className={`text-center py-8 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} text-sm`}>
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No shifts on this day
            </div>
          ) : sorted.map(s => (
            <ShiftCard key={s.id} shift={s} job={jobMap[s.jobId]} isConflict={conflicts.has(s.id)} onClick={() => onViewShift(s)} prefs={prefs} showStatus />
          ))}
        </div>

        <div className={`p-4 border-t ${prefs.dark ? 'border-stone-800' : 'border-stone-200'}`}>
          <button onClick={onAddShift} className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Add shift on this day
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== PERIOD DETAIL ==============
function PeriodDetail({ period, shifts, jobs, jobMap, onViewShift, onClose, prefs }) {
  const { period: type, start, end } = period;
  const inRange = shifts.filter(s => {
    const d = new Date(`${s.date}T${s.startTime}`);
    return d >= start && d <= end;
  }).sort((a,b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const total = inRange.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const totalHours = inRange.reduce((sum, s) => sum + displayHours(s), 0);

  const title = type === 'week' ? 'This Week' : type === 'fortnight' ? 'This Fortnight' : 'This Month';
  const dateRange = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // Per-job breakdown
  const byJob = jobs.map(j => {
    const js = inRange.filter(s => s.jobId === j.id);
    return {
      ...j,
      shifts: js,
      earnings: js.reduce((sum, s) => sum + calculateEarnings(s, j), 0),
      hours: js.reduce((sum, s) => sum + displayHours(s), 0),
      color: JOB_COLORS[j.colorIdx],
    };
  }).filter(j => j.shifts.length > 0).sort((a,b) => b.earnings - a.earnings);

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className={`${cardBg} w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in max-h-[92vh] overflow-hidden flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className={`p-6 pb-4 border-b ${prefs.dark ? 'border-stone-800' : 'border-stone-200'} flex items-start justify-between gap-3`}>
          <div>
            <p className={`text-xs uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>{dateRange}</p>
            <h2 className="font-display text-2xl font-semibold mt-1">{title}</h2>
            <p className="font-display text-3xl font-semibold mt-2">{fmtCurrency(total)}</p>
            <p className={`text-xs mt-1 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>
              {totalHours.toFixed(1)}h · {inRange.length} shift{inRange.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto scrollbar-thin flex-1 space-y-5">
          {byJob.length > 0 && (
            <div>
              <h3 className={`text-xs uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mb-3`}>By job</h3>
              <div className="space-y-2">
                {byJob.map(j => (
                  <div key={j.id} className={`p-3 rounded-xl ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: j.color.bg }} />
                      <span className="font-medium text-sm">{j.name}</span>
                      <span className={`text-xs ml-auto ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>{j.shifts.length} shifts · {j.hours.toFixed(1)}h</span>
                      <span className="font-display font-semibold text-sm">{fmtCurrency(j.earnings)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className={`text-xs uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mb-3`}>All shifts</h3>
            {inRange.length === 0 ? (
              <p className={`text-sm text-center py-6 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>No shifts in this period</p>
            ) : (
              <div className="space-y-2">
                {inRange.map(s => (
                  <ShiftCard key={s.id} shift={s} job={jobMap[s.jobId]} isConflict={false} onClick={() => onViewShift(s)} prefs={prefs} showDate showStatus />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== EARNINGS VIEW ==============
function EarningsView({ shifts, jobs, jobMap, onViewPeriod, prefs, cardClass, subtleText }) {
  const [period, setPeriod] = useState('week');
  const now = new Date();

  const allEarnings = shifts.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const allHours = shifts.reduce((sum, s) => sum + displayHours(s), 0);

  const byJob = useMemo(() => jobs.map(j => {
    const js = shifts.filter(s => s.jobId === j.id);
    return {
      ...j,
      earnings: js.reduce((sum, s) => sum + calculateEarnings(s, j), 0),
      hours: js.reduce((sum, s) => sum + displayHours(s), 0),
      shifts: js.length,
      color: JOB_COLORS[j.colorIdx],
      payCycleInfo: j.payCycle ? getPayCycleForDate(j, new Date()) : null,
    };
  }).sort((a,b) => b.earnings - a.earnings), [shifts, jobs]);

  const chartData = useMemo(() => {
    if (period === 'week') {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const ds = fmtDate(d);
        const total = shifts.filter(s => s.date === ds).reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
        days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), earnings: parseFloat(total.toFixed(2)) });
      }
      return days;
    } else if (period === 'month') {
      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        const ref = new Date(now); ref.setDate(ref.getDate() - i * 7);
        const [ws, we] = getWeekRange(ref);
        const total = shifts.filter(s => { const d = new Date(`${s.date}T${s.startTime}`); return d >= ws && d <= we; }).reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
        weeks.push({ label: `Wk ${ws.getDate()}/${ws.getMonth()+1}`, earnings: parseFloat(total.toFixed(2)) });
      }
      return weeks;
    } else {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const me = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
        const total = shifts.filter(s => { const d = new Date(`${s.date}T${s.startTime}`); return d >= ref && d <= me; }).reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
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

      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-display text-lg font-semibold">Breakdown</h3>
          <div className={`inline-flex rounded-full p-1 ${prefs.dark ? 'bg-stone-800' : 'bg-stone-100'}`}>
            {['week','month','year'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${period === p ? (prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') : (prefs.dark ? 'text-stone-400' : 'text-stone-600')}`}>
                {p === 'week' ? '7 days' : p === 'month' ? '4 wks' : '6 mo'}
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
              <Tooltip contentStyle={{ background: prefs.dark ? '#1c1917' : '#fff', border: `1px solid ${prefs.dark ? '#44403c' : '#e7e5e4'}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toFixed(2)}`, 'Earnings']} cursor={{ fill: prefs.dark ? '#292524' : '#f5f5f4' }} />
              <Bar dataKey="earnings" fill={prefs.dark ? '#fcd34d' : '#1c1917'} radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <h3 className="font-display text-lg font-semibold mb-4">By job</h3>
        {byJob.length === 0 ? <p className={`text-sm ${subtleText} py-4 text-center`}>No jobs yet</p> : (
          <div className="space-y-4">
            {byJob.map(j => {
              const pct = allEarnings > 0 ? (j.earnings / allEarnings) * 100 : 0;
              const cyclePeriod = j.payCycle ? getPayCycleForDate(j, new Date()) : null;
              const cycleEarnings = cyclePeriod ? shifts.filter(s => s.jobId === j.id && new Date(`${s.date}T${s.startTime}`) >= cyclePeriod.start && new Date(`${s.date}T${s.startTime}`) <= cyclePeriod.end).reduce((sum, s) => sum + calculateEarnings(s, j), 0) : 0;
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
                  {cyclePeriod && (
                    <div className={`mt-1.5 text-xs flex items-center justify-between ${subtleText}`}>
                      <span>Current pay cycle ({cyclePeriod.label})</span>
                      <span className="font-medium">{fmtCurrency(cycleEarnings)}</span>
                    </div>
                  )}
                  {j.payCycle && cyclePeriod && (
                    <p className={`text-[10px] mt-0.5 ${subtleText}`}>
                      Next payday: {cyclePeriod.payDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== HISTORY VIEW ==============
function HistoryView({ shifts, jobs, jobMap, filterJob, setFilterJob, onViewShift, prefs, cardClass, subtleText }) {
  const completed = shifts.filter(s => s.status === 'done');
  const filtered = filterJob === 'all' ? completed : completed.filter(s => s.jobId === filterJob);
  const sorted = [...filtered].sort((a,b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));

  const totalEarnings = sorted.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
  const totalHours = sorted.reduce((sum, s) => sum + displayHours(s), 0);

  // Group by month
  const grouped = useMemo(() => {
    const map = new Map();
    sorted.forEach(s => {
      const d = new Date(s.date + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!map.has(key)) map.set(key, { label, shifts: [] });
      map.get(key).shifts.push(s);
    });
    return Array.from(map.values());
  }, [sorted]);

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="font-display text-3xl md:text-4xl font-medium">History</h2>
        <p className={`text-sm ${subtleText} mt-1`}>{sorted.length} completed shift{sorted.length !== 1 ? 's' : ''} · {fmtCurrency(totalEarnings)} · {totalHours.toFixed(1)}h</p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
        <Filter className={`w-4 h-4 shrink-0 ${subtleText}`} />
        <button onClick={() => setFilterJob('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterJob === 'all' ? (prefs.dark ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100') : (prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700')}`}>
          All jobs
        </button>
        {jobs.map(j => {
          const c = JOB_COLORS[j.colorIdx];
          const active = filterJob === j.id;
          return (
            <button key={j.id} onClick={() => setFilterJob(j.id)} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: active ? c.bg : (prefs.dark ? '#292524' : '#f5f5f4'), color: active ? '#fff' : (prefs.dark ? '#d6d3d1' : '#44403c') }}>
              <span className="w-2 h-2 rounded-full" style={{ background: active ? '#fff' : c.bg }} />
              {j.name}
            </button>
          );
        })}
      </div>

      {grouped.length === 0 ? (
        <div className={`rounded-2xl border ${cardClass} p-12 text-center`}>
          <CheckCircle2 className={`w-10 h-10 mx-auto mb-3 opacity-30`} />
          <h3 className="font-display font-semibold">No completed shifts yet</h3>
          <p className={`text-sm mt-1 ${subtleText}`}>Mark shifts as done to see them here.</p>
        </div>
      ) : grouped.map(group => {
        const groupEarnings = group.shifts.reduce((sum, s) => sum + calculateEarnings(s, jobMap[s.jobId]), 0);
        return (
          <div key={group.label} className={`rounded-2xl border ${cardClass} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold">{group.label}</h3>
              <span className={`text-sm ${subtleText}`}>{fmtCurrency(groupEarnings)}</span>
            </div>
            <div className="space-y-2">
              {group.shifts.map(s => (
                <ShiftCard key={s.id} shift={s} job={jobMap[s.jobId]} isConflict={false} onClick={() => onViewShift(s)} prefs={prefs} showDate showStatus />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============== AVAILABILITY VIEW ==============
function AvailabilityView({ shifts, prefs, cardClass, subtleText }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = fmtDate(d);
    const dayShifts = shifts.filter(s => s.date === ds).sort((a,b) => a.startTime.localeCompare(b.startTime));

    // Compute free windows assuming "day" runs 7am to 11pm
    const dayStart = 7 * 60; // 7:00
    const dayEnd = 23 * 60; // 23:00
    const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
    const busy = dayShifts.map(s => {
      let st = toMin(s.startTime), en = toMin(s.endTime);
      if (en <= st) en = dayEnd; // treat overnight as till end of day for availability
      return [Math.max(dayStart, st), Math.min(dayEnd, en)];
    }).filter(([s,e]) => e > s).sort((a,b) => a[0]-b[0]);

    // Merge overlapping busy windows
    const merged = [];
    busy.forEach(([s,e]) => {
      if (merged.length && s <= merged[merged.length-1][1]) {
        merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], e);
      } else {
        merged.push([s,e]);
      }
    });

    const free = [];
    let cursor = dayStart;
    merged.forEach(([s,e]) => {
      if (s > cursor) free.push([cursor, s]);
      cursor = Math.max(cursor, e);
    });
    if (cursor < dayEnd) free.push([cursor, dayEnd]);

    const fmtMin = (m) => {
      const h = Math.floor(m / 60), mm = m % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}:${String(mm).padStart(2,'0')} ${ampm}`;
    };

    days.push({
      date: d,
      dateStr: ds,
      free: free.map(([s,e]) => ({ start: s, end: e, label: `${fmtMin(s)} – ${fmtMin(e)}` })),
      busyCount: dayShifts.length,
    });
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="font-display text-3xl md:text-4xl font-medium">Free time</h2>
        <p className={`text-sm ${subtleText} mt-1`}>Your available windows for the next 14 days (7 AM – 11 PM)</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {days.map(({ date, dateStr, free, busyCount }) => {
          const isToday = dateStr === fmtDate(today);
          const isTomorrow = dateStr === fmtDate(new Date(today.getTime() + 86400000));
          const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' });
          return (
            <div key={dateStr} className={`rounded-2xl border ${cardClass} p-4`}>
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <p className="font-display font-semibold">{label}</p>
                  <p className={`text-xs ${subtleText}`}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-widest ${subtleText}`}>
                  {busyCount} shift{busyCount !== 1 ? 's' : ''}
                </span>
              </div>
              {free.length === 0 ? (
                <p className={`text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Fully booked</p>
              ) : (
                <div className="space-y-1.5">
                  {free.map((w, i) => (
                    <div key={i} className={`text-sm px-2.5 py-1.5 rounded-lg ${prefs.dark ? 'bg-emerald-950/30 text-emerald-300' : 'bg-emerald-50 text-emerald-800'} font-medium`}>
                      {w.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== JOBS VIEW ==============
function JobsView({ jobs, shifts, onEdit, onAdd, onDelete, onViewShifts, prefs, cardClass, subtleText }) {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium">Jobs</h2>
          <p className={`text-sm ${subtleText} mt-1`}>{jobs.length} active position{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onAdd} className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 ${prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300'}`}>
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Add job
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {jobs.map(j => {
          const color = JOB_COLORS[j.colorIdx];
          const jShifts = shifts.filter(s => s.jobId === j.id);
          const earnings = jShifts.reduce((sum, s) => sum + calculateEarnings(s, j), 0);
          const cyclePeriod = j.payCycle ? getPayCycleForDate(j, new Date()) : null;
          const cycleEarnings = cyclePeriod ? shifts.filter(s => s.jobId === j.id && new Date(`${s.date}T${s.startTime}`) >= cyclePeriod.start && new Date(`${s.date}T${s.startTime}`) <= cyclePeriod.end).reduce((sum, s) => sum + calculateEarnings(s, j), 0) : 0;

          return (
            <div key={j.id} className={`rounded-2xl border ${cardClass} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => onViewShifts(j.id)} className="flex items-center gap-3 min-w-0 text-left flex-1">
                  <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: color.bg }}>
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-lg truncate">{j.name}</h3>
                    <p className={`text-xs ${subtleText}`}>
                      ${j.rate}/hr
                      {(j.saturdayRate || j.sundayRate) && <span> · Sat ${j.saturdayRate ?? j.rate} · Sun ${j.sundayRate ?? j.rate}</span>}
                    </p>
                  </div>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => onEdit(j)} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(j.id)} className={`p-1.5 rounded-lg ${prefs.dark ? 'hover:bg-red-950 text-red-400' : 'hover:bg-red-50 text-red-600'}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className={`mt-4 pt-4 border-t ${prefs.dark ? 'border-stone-800' : 'border-stone-100'} space-y-2`}>
                <div className="flex justify-between text-sm">
                  <span className={subtleText}>{jShifts.length} shifts total</span>
                  <span className="font-semibold">{fmtCurrency(earnings)}</span>
                </div>
                {cyclePeriod && (
                  <>
                    <div className={`flex justify-between text-xs ${subtleText}`}>
                      <span>This pay cycle</span>
                      <span className="font-medium">{fmtCurrency(cycleEarnings)}</span>
                    </div>
                    <div className={`flex justify-between text-xs ${subtleText}`}>
                      <span>Next payday</span>
                      <span className="font-medium">{cyclePeriod.payDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </>
                )}
                <button onClick={() => onViewShifts(j.id)} className={`w-full text-xs flex items-center justify-center gap-1 mt-2 py-1.5 rounded-lg ${prefs.dark ? 'bg-stone-800 hover:bg-stone-700 text-stone-300' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}>
                  View shifts <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== JOB FORM ==============
function JobForm({ job, onSave, onCancel, prefs }) {
  const [name, setName] = useState(job.name || '');
  const [colorIdx, setColorIdx] = useState(job.colorIdx ?? 0);
  const [rate, setRate] = useState(job.rate ?? 20);
  const [hasWeekendRates, setHasWeekendRates] = useState(!!(job.saturdayRate || job.sundayRate));
  const [saturdayRate, setSaturdayRate] = useState(job.saturdayRate ?? (job.rate ?? 20));
  const [sundayRate, setSundayRate] = useState(job.sundayRate ?? (job.rate ?? 20));
  const [hasPayCycle, setHasPayCycle] = useState(!!job.payCycle);
  const [cycleType, setCycleType] = useState(job.payCycle?.type || 'fortnightly');
  const [cycleAnchor, setCycleAnchor] = useState(job.payCycle?.anchorDate || fmtDate(new Date()));
  const [weeklyPayday, setWeeklyPayday] = useState(job.payCycle?.payday ?? 4);
  const [monthlyPayday, setMonthlyPayday] = useState(job.payCycle?.payday ?? 15);
  const [err, setErr] = useState('');

  const submit = () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!rate || rate <= 0) { setErr('Rate must be greater than 0'); return; }
    if (hasWeekendRates) {
      if (!saturdayRate || saturdayRate <= 0) { setErr('Saturday rate must be greater than 0'); return; }
      if (!sundayRate || sundayRate <= 0) { setErr('Sunday rate must be greater than 0'); return; }
    }
    const payCycle = hasPayCycle ? (
      cycleType === 'weekly' ? { type: 'weekly', payday: weeklyPayday, cycleStart: (weeklyPayday + 1) % 7 } :
      cycleType === 'fortnightly' ? { type: 'fortnightly', anchorDate: cycleAnchor, payOffsetDays: 1 } :
      { type: 'monthly', payday: monthlyPayday }
    ) : undefined;

    onSave({
      ...job,
      name: name.trim(),
      colorIdx,
      rate: parseFloat(rate),
      saturdayRate: hasWeekendRates ? parseFloat(saturdayRate) : undefined,
      sundayRate: hasWeekendRates ? parseFloat(sundayRate) : undefined,
      payCycle,
    });
  };

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border ${prefs.dark ? 'bg-stone-800 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'} focus:outline-none focus:ring-2 ${prefs.dark ? 'focus:ring-amber-300' : 'focus:ring-stone-900'} text-sm`;
  const labelClass = `block text-xs font-medium uppercase tracking-wider mb-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`;

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in max-h-[92vh] overflow-y-auto scrollbar-thin`} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="font-display text-2xl font-semibold mb-4">{job.id ? 'Edit job' : 'New job'}</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Job name</label>
              <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cafe Bellini" autoFocus />
            </div>
            <div>
              <label className={labelClass}>Default hourly rate (weekdays)</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
                <input type="number" step="0.01" min="0" className={inputClass + ' pl-7'} value={rate} onChange={e => setRate(e.target.value)} />
              </div>
            </div>

            <ToggleSection
              checked={hasWeekendRates} onChange={setHasWeekendRates}
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              title="Weekend rates" description="Different pay rates for Saturday and Sunday"
              prefs={prefs}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Saturday</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
                    <input type="number" step="0.01" min="0" className={inputClass + ' pl-7'} value={saturdayRate} onChange={e => setSaturdayRate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Sunday</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
                    <input type="number" step="0.01" min="0" className={inputClass + ' pl-7'} value={sundayRate} onChange={e => setSundayRate(e.target.value)} />
                  </div>
                </div>
              </div>
            </ToggleSection>

            <ToggleSection
              checked={hasPayCycle} onChange={setHasPayCycle}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              title="Pay cycle" description="Track when you get paid and group earnings by cycle"
              prefs={prefs}
            >
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Pay frequency</label>
                  <div className={`inline-flex rounded-lg p-1 w-full ${prefs.dark ? 'bg-stone-800' : 'bg-stone-100'}`}>
                    {['weekly','fortnightly','monthly'].map(t => (
                      <button key={t} type="button" onClick={() => setCycleType(t)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${cycleType === t ? (prefs.dark ? 'bg-stone-900 text-amber-300' : 'bg-white text-stone-900 shadow-sm') : (prefs.dark ? 'text-stone-400' : 'text-stone-600')}`}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {cycleType === 'weekly' && (
                  <div>
                    <label className={labelClass}>Payday (day of week)</label>
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((d, i) => (
                        <button key={i} type="button" onClick={() => setWeeklyPayday(i)} className={`py-2 rounded-md text-xs font-medium ${weeklyPayday === i ? (prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') : (prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700')}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {cycleType === 'fortnightly' && (
                  <div>
                    <label className={labelClass}>Last payday (or any past payday)</label>
                    <input type="date" className={inputClass} value={cycleAnchor} onChange={e => setCycleAnchor(e.target.value)} />
                    <p className={`text-[10px] mt-1 ${prefs.dark ? 'text-stone-500' : 'text-stone-400'}`}>The app counts forward in 14-day cycles from this date.</p>
                  </div>
                )}
                {cycleType === 'monthly' && (
                  <div>
                    <label className={labelClass}>Day of month</label>
                    <input type="number" min="1" max="31" className={inputClass} value={monthlyPayday} onChange={e => setMonthlyPayday(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))} />
                  </div>
                )}
              </div>
            </ToggleSection>

            <div>
              <label className={labelClass}>Color</label>
              <div className="grid grid-cols-8 gap-2">
                {JOB_COLORS.map((c, i) => (
                  <button key={i} type="button" onClick={() => setColorIdx(i)} className={`aspect-square rounded-lg transition-all ${colorIdx === i ? 'ring-2 ring-offset-2 scale-110 ' + (prefs.dark ? 'ring-amber-300 ring-offset-stone-900' : 'ring-stone-900 ring-offset-white') : ''}`} style={{ background: c.bg }} />
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

function ToggleSection({ checked, onChange, icon, title, description, prefs, children }) {
  return (
    <div className={`rounded-xl border ${prefs.dark ? 'border-stone-800 bg-stone-800/30' : 'border-stone-200 bg-stone-50'} p-4`}>
      <label className="flex items-start gap-3 cursor-pointer">
        <div className="relative pt-0.5">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
          <div className={`w-10 h-6 rounded-full transition-colors ${checked ? (prefs.dark ? 'bg-amber-300' : 'bg-stone-900') : (prefs.dark ? 'bg-stone-700' : 'bg-stone-300')}`}>
            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="font-medium text-sm">{title}</span>
          </div>
          <p className={`text-xs mt-0.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>{description}</p>
        </div>
      </label>
      {checked && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ============== SHIFT FORM ==============
function ShiftForm({ shift, jobs, onSave, onSaveRecurring, onDelete, onCancel, prefs }) {
  const [jobId, setJobId] = useState(shift.jobId || jobs[0]?.id || '');
  const [date, setDate] = useState(shift.date || fmtDate(new Date()));
  const [startTime, setStartTime] = useState(shift.startTime || '09:00');
  const [endTime, setEndTime] = useState(shift.endTime || '17:00');
  const [hourlyRate, setHourlyRate] = useState(shift.hourlyRate ?? jobs.find(j => j.id === (shift.jobId || jobs[0]?.id))?.rate ?? 20);
  const [notes, setNotes] = useState(shift.notes || '');
  const [isPassiveNight, setIsPassiveNight] = useState(shift.isPassiveNight || false);
  const [passiveFlatRate, setPassiveFlatRate] = useState(shift.passiveFlatRate ?? 120);
  const [passiveStart, setPassiveStart] = useState(shift.passiveStart || '21:00');
  const [passiveEnd, setPassiveEnd] = useState(shift.passiveEnd || '08:00');
  // Recurring state — only when creating new
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurFrequency, setRecurFrequency] = useState('weekly'); // weekly | fortnightly
  const [recurDays, setRecurDays] = useState([]); // array of 0-6 (Sun-Sat)
  const [recurUntil, setRecurUntil] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 2);
    return fmtDate(d);
  });
  const [err, setErr] = useState('');

  const isEditing = !!shift.id;

  useEffect(() => {
    if (!shift.id) {
      const j = jobs.find(j => j.id === jobId);
      if (j) {
        const d = new Date(date + 'T00:00:00');
        const dow = d.getDay();
        if (dow === 6 && j.saturdayRate) setHourlyRate(j.saturdayRate);
        else if (dow === 0 && j.sundayRate) setHourlyRate(j.sundayRate);
        else setHourlyRate(j.rate);
      }
    }
  }, [jobId, date]);

  // Pre-select the day of the start date when recurring is toggled on
  useEffect(() => {
    if (isRecurring && recurDays.length === 0) {
      const d = new Date(date + 'T00:00:00');
      setRecurDays([d.getDay()]);
    }
  }, [isRecurring]);

  const toggleRecurDay = (dayIdx) => {
    setRecurDays(prev => prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort());
  };

  const generateRecurringInstances = () => {
    const base = {
      jobId, startTime, endTime,
      hourlyRate: parseFloat(hourlyRate),
      notes: notes.trim(),
      isPassiveNight,
      passiveFlatRate: isPassiveNight ? parseFloat(passiveFlatRate) : undefined,
      passiveStart: isPassiveNight ? passiveStart : undefined,
      passiveEnd: isPassiveNight ? passiveEnd : undefined,
    };
    const start = new Date(date + 'T00:00:00');
    const until = new Date(recurUntil + 'T23:59:59');
    const instances = [];
    const recurringGroupId = `rec${Date.now()}`;
    let cursor = new Date(start);
    let weekNum = 0;
    const stepDays = recurFrequency === 'fortnightly' ? 14 : 7;

    // For fortnightly, only emit on the start week + every 2 weeks
    // For weekly, every week
    // Within each "active" week, emit every selected day
    while (cursor <= until) {
      const includeThisWeek = recurFrequency === 'weekly' || weekNum % 2 === 0;
      if (includeThisWeek) {
        // Get the start of this week (Sunday)
        const weekStart = new Date(cursor);
        weekStart.setDate(cursor.getDate() - cursor.getDay());
        for (const dow of recurDays) {
          const inst = new Date(weekStart);
          inst.setDate(weekStart.getDate() + dow);
          if (inst >= start && inst <= until) {
            const job = jobs.find(j => j.id === jobId);
            // Re-evaluate rate per day for weekend rates
            let rate = parseFloat(hourlyRate);
            if (job) {
              if (inst.getDay() === 6 && job.saturdayRate) rate = job.saturdayRate;
              else if (inst.getDay() === 0 && job.sundayRate) rate = job.sundayRate;
              else rate = job.rate;
            }
            instances.push({
              ...base,
              id: `s${Date.now()}_${instances.length}`,
              date: fmtDate(inst),
              hourlyRate: rate,
              status: 'scheduled',
              recurringId: recurringGroupId,
            });
          }
        }
      }
      cursor.setDate(cursor.getDate() + 7); // step forward one week
      weekNum++;
      if (instances.length > 365) break; // safety cap
    }
    // Dedupe by date (in case start day happens to match a selected dow)
    const seen = new Set();
    return instances.filter(i => {
      const k = i.date;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const submit = () => {
    setErr('');
    if (!jobId) { setErr('Select a job'); return; }
    if (!date) { setErr('Date is required'); return; }
    if (!startTime || !endTime) { setErr('Times are required'); return; }
    if (startTime === endTime) { setErr('Start and end times cannot be identical'); return; }
    if (!isPassiveNight && endTime <= startTime) { setErr('End time must be after start time'); return; }
    if (!hourlyRate || hourlyRate <= 0) { setErr('Hourly rate must be greater than 0'); return; }
    if (isPassiveNight && (!passiveFlatRate || passiveFlatRate <= 0)) { setErr('Passive flat rate must be greater than 0'); return; }
    if (isRecurring) {
      if (recurDays.length === 0) { setErr('Pick at least one day of the week'); return; }
      if (!recurUntil) { setErr('Choose an end date for the recurrence'); return; }
      if (new Date(recurUntil) < new Date(date)) { setErr('End date must be after start date'); return; }
      const instances = generateRecurringInstances();
      if (instances.length === 0) { setErr('No shifts generated. Check days and dates.'); return; }
      onSaveRecurring(instances);
    } else {
      onSave({
        ...shift,
        jobId, date, startTime, endTime,
        hourlyRate: parseFloat(hourlyRate),
        notes: notes.trim(),
        isPassiveNight,
        passiveFlatRate: isPassiveNight ? parseFloat(passiveFlatRate) : undefined,
        passiveStart: isPassiveNight ? passiveStart : undefined,
        passiveEnd: isPassiveNight ? passiveEnd : undefined,
      });
    }
  };

  const selectedJob = jobs.find(j => j.id === jobId);
  const breakdown = isPassiveNight ? calculatePassiveBreakdown(startTime, endTime, passiveStart, passiveEnd) : null;
  const hrs = breakdown ? breakdown.totalHours : calculateHours(startTime, endTime);
  const previewShift = { jobId, date, startTime, endTime, hourlyRate: parseFloat(hourlyRate) || 0, isPassiveNight, passiveFlatRate: parseFloat(passiveFlatRate) || 0, passiveStart, passiveEnd };
  const earnings = (startTime && endTime && hourlyRate) ? calculateEarnings(previewShift, selectedJob) : 0;

  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border ${prefs.dark ? 'bg-stone-800 border-stone-700 text-stone-100' : 'bg-white border-stone-300 text-stone-900'} focus:outline-none focus:ring-2 ${prefs.dark ? 'focus:ring-amber-300' : 'focus:ring-stone-900'} text-sm`;
  const labelClass = `block text-xs font-medium uppercase tracking-wider mb-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`;

  if (jobs.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
        <div className={`${cardBg} max-w-sm rounded-2xl p-6 m-4 text-center`} onClick={e => e.stopPropagation()}>
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <h3 className="font-display text-xl font-semibold mb-2">No jobs yet</h3>
          <p className={`text-sm mb-4 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`}>Create a job first to add shifts.</p>
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
                  <button key={j.id} onClick={() => setJobId(j.id)} className="px-3 py-2.5 rounded-lg text-sm font-medium text-left flex items-center gap-2 transition-all border-2" style={{ borderColor: active ? c.bg : (prefs.dark ? '#44403c' : '#e7e5e4'), background: active ? (prefs.dark ? c.bg + '20' : c.light) : (prefs.dark ? '#292524' : '#fff'), color: active ? (prefs.dark ? c.light : c.text) : (prefs.dark ? '#d6d3d1' : '#44403c') }}>
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
            {selectedJob && (selectedJob.saturdayRate || selectedJob.sundayRate) && (
              <p className={`text-xs mt-1.5 ${prefs.dark ? 'text-stone-500' : 'text-stone-400'}`}>
                This job uses weekend rates. Saturday: ${selectedJob.saturdayRate ?? selectedJob.rate}, Sunday: ${selectedJob.sundayRate ?? selectedJob.rate}.
              </p>
            )}
          </div>

          <ToggleSection
            checked={isPassiveNight} onChange={setIsPassiveNight}
            icon={<Moon className="w-3.5 h-3.5" />}
            title="Passive night" description="Flat pay during passive hours, hourly rate for active hours"
            prefs={prefs}
          >
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Passive flat pay</label>
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>$</span>
                  <input type="number" step="0.01" min="0" className={inputClass + ' pl-7'} value={passiveFlatRate} onChange={e => setPassiveFlatRate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Passive starts</label>
                  <input type="time" className={inputClass} value={passiveStart} onChange={e => setPassiveStart(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Passive ends</label>
                  <input type="time" className={inputClass} value={passiveEnd} onChange={e => setPassiveEnd(e.target.value)} />
                </div>
              </div>
            </div>
          </ToggleSection>

          {!isEditing && (
            <ToggleSection
              checked={isRecurring} onChange={setIsRecurring}
              icon={<Repeat className="w-3.5 h-3.5" />}
              title="Recurring shift" description="Create multiple shifts that repeat on a schedule"
              prefs={prefs}
            >
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Repeats</label>
                  <div className={`inline-flex rounded-lg p-1 w-full ${prefs.dark ? 'bg-stone-800' : 'bg-stone-100'}`}>
                    {[{ k: 'weekly', l: 'Every week' }, { k: 'fortnightly', l: 'Every 2 weeks' }].map(({k, l}) => (
                      <button key={k} type="button" onClick={() => setRecurFrequency(k)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${recurFrequency === k ? (prefs.dark ? 'bg-stone-900 text-amber-300' : 'bg-white text-stone-900 shadow-sm') : (prefs.dark ? 'text-stone-400' : 'text-stone-600')}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>On these days</label>
                  <div className="grid grid-cols-7 gap-1">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => {
                      const active = recurDays.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleRecurDay(i)}
                          className={`py-2 rounded-md text-xs font-medium transition-colors ${active ? (prefs.dark ? 'bg-amber-300 text-stone-900' : 'bg-stone-900 text-amber-300') : (prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700')}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Repeat until</label>
                  <input type="date" className={inputClass} value={recurUntil} onChange={e => setRecurUntil(e.target.value)} />
                </div>
                {recurDays.length > 0 && (
                  <p className={`text-xs ${prefs.dark ? 'text-stone-500' : 'text-stone-400'}`}>
                    Will create approximately {(() => {
                      try {
                        const start = new Date(date + 'T00:00:00');
                        const end = new Date(recurUntil + 'T00:00:00');
                        const weeks = Math.max(1, Math.ceil((end - start) / (1000*60*60*24*7)));
                        const cycles = recurFrequency === 'fortnightly' ? Math.ceil(weeks / 2) : weeks;
                        return cycles * recurDays.length;
                      } catch { return '?'; }
                    })()} shifts. Each is independently editable.
                  </p>
                )}
              </div>
            </ToggleSection>
          )}

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea rows={2} className={inputClass + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to remember…" />
          </div>

          {hrs > 0 && (
            <div className={`rounded-xl p-4 ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-100'}`}>
              {isPassiveNight && breakdown ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Passive (counts as 1h)</span>
                    <span className="font-medium">{breakdown.passiveHours.toFixed(1)}h worked · {fmtCurrency(parseFloat(passiveFlatRate) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Active hours</span>
                    <span className="font-medium">{breakdown.activeHours.toFixed(2)}h</span>
                  </div>
                  <div className={`flex justify-between mt-2 pt-2 border-t ${prefs.dark ? 'border-stone-700' : 'border-stone-200'}`}>
                    <span className="font-medium">Total earnings</span>
                    <span className="font-display text-xl font-semibold">{fmtCurrency(earnings)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Total hours</span>
                    <span className="font-semibold">{hrs.toFixed(2)}h</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className={prefs.dark ? 'text-stone-400' : 'text-stone-600'}>Earnings</span>
                    <span className="font-display text-xl font-semibold">{fmtCurrency(earnings)}</span>
                  </div>
                </>
              )}
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
function ShiftDetail({ shift, job, isConflict, onEdit, onDelete, onClose, onMarkDone, prefs }) {
  if (!job) return null;
  const color = JOB_COLORS[job.colorIdx];
  const hrs = calculateHours(shift.startTime, shift.endTime);
  const earnings = calculateEarnings(shift, job);
  const breakdown = shift.isPassiveNight ? calculatePassiveBreakdown(shift.startTime, shift.endTime, shift.passiveStart || '21:00', shift.passiveEnd || '08:00') : null;
  const date = new Date(`${shift.date}T${shift.startTime}`);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const isDone = shift.status === 'done';
  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';

  const openGCal = () => {
    const toGCalDate = (dateStr, timeStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [h, min] = timeStr.split(':').map(Number);
      const dt = new Date(y, m - 1, d, h, min);
      const pad = (n) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    };
    const startStr = toGCalDate(shift.date, shift.startTime);
    const [sy, sm, sd] = shift.date.split('-').map(Number);
    const [sh, smin] = shift.startTime.split(':').map(Number);
    const [eh, emin] = shift.endTime.split(':').map(Number);
    const sDt = new Date(sy, sm - 1, sd, sh, smin);
    let eDt = new Date(sy, sm - 1, sd, eh, emin);
    if (eDt <= sDt) eDt.setDate(eDt.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const endStr = `${eDt.getFullYear()}${pad(eDt.getMonth()+1)}${pad(eDt.getDate())}T${pad(eDt.getHours())}${pad(eDt.getMinutes())}00`;
    const details = [`Earnings: ${fmtCurrency(earnings)}`, shift.isPassiveNight ? 'Passive night shift' : '', shift.notes ? `Notes: ${shift.notes}` : ''].filter(Boolean).join('\n');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(job.name + (shift.isPassiveNight ? ' (passive)' : ''))}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in overflow-hidden max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="p-6 relative" style={{ background: color.bg }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30">
            <X className="w-4 h-4 text-white" />
          </button>
          <p className="text-white/80 text-xs uppercase tracking-widest font-medium">{dateLabel}</p>
          <h3 className="font-display text-3xl font-semibold text-white mt-1">{job.name}</h3>
          <div className="flex flex-wrap gap-2 mt-3">
            {isDone && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" /> Done
              </div>
            )}
            {shift.isPassiveNight && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-medium">
                <Moon className="w-3 h-3" /> Passive night
              </div>
            )}
            {shift.recurringId && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-medium">
                <Repeat className="w-3 h-3" /> Recurring
              </div>
            )}
            {isConflict && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-medium">
                <AlertTriangle className="w-3 h-3" /> Conflict
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Time</p>
              <p className="font-display text-xl font-semibold mt-1">{fmtTime(shift.startTime)}</p>
              <p className={`text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>to {fmtTime(shift.endTime)}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Duration</p>
              <p className="font-display text-xl font-semibold mt-1">{displayHours(shift).toFixed(2)}h</p>
              <p className={`text-sm ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>
                {shift.isPassiveNight ? `${hrs.toFixed(1)}h worked` : `at $${shift.hourlyRate}/hr`}
              </p>
            </div>
          </div>

          {shift.isPassiveNight && breakdown && (
            <div className={`rounded-xl p-4 ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-100'} space-y-2`}>
              <div className="flex justify-between text-sm">
                <span className={`flex items-center gap-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`}>
                  <Moon className="w-3.5 h-3.5" /> Passive (1h · {breakdown.passiveHours.toFixed(1)}h worked)
                </span>
                <span className="font-medium">{fmtCurrency(shift.passiveFlatRate ?? 120)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`flex items-center gap-1.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`}>
                  <Clock className="w-3.5 h-3.5" /> Active ({breakdown.activeHours.toFixed(2)}h × ${shift.hourlyRate})
                </span>
                <span className="font-medium">{fmtCurrency(breakdown.activeHours * shift.hourlyRate)}</span>
              </div>
            </div>
          )}

          <div className={`rounded-xl p-4 ${prefs.dark ? 'bg-stone-800/50' : 'bg-stone-100'}`}>
            <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>Total earnings</p>
            <p className="font-display text-3xl font-semibold mt-1">{fmtCurrency(earnings)}</p>
          </div>

          {shift.notes && (
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'} mb-1`}>Notes</p>
              <p className="text-sm whitespace-pre-wrap">{shift.notes}</p>
            </div>
          )}

          <button onClick={onMarkDone} className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${isDone ? (prefs.dark ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200') : (prefs.dark ? 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700')}`}>
            {isDone ? <><Circle className="w-4 h-4" /> Mark as scheduled</> : <><CheckCircle2 className="w-4 h-4" /> Mark as done</>}
          </button>

          <button onClick={openGCal} className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${prefs.dark ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
            <CalendarPlus className="w-4 h-4" /> Add to Google Calendar
            <ArrowUpRight className="w-3 h-3 opacity-50" />
          </button>

          <div className="flex gap-2">
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

// ============== DELETE CONFIRM ==============
function DeleteConfirm({ shift, job, onCancel, onConfirm, prefs }) {
  const [scope, setScope] = useState(shift.recurringId ? null : 'this'); // null = needs choice, 'this' | 'future' | 'all'
  if (!job) return null;
  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  const earnings = calculateEarnings(shift, job);

  // Step 1: pick recurring scope
  if (shift.recurringId && scope === null) {
    return (
      <div className="fixed inset-0 z-[55] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
        <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in`} onClick={e => e.stopPropagation()}>
          <div className="p-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center mx-auto mb-3">
              <Repeat className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-display text-2xl font-semibold text-center">Recurring shift</h3>
            <p className={`text-sm text-center mt-2 mb-5 ${prefs.dark ? 'text-stone-300' : 'text-stone-700'}`}>
              Which shifts should this affect?
            </p>
            <div className="space-y-2">
              <button onClick={() => setScope('this')} className={`w-full py-3 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}>
                Only this shift
              </button>
              <button onClick={() => setScope('future')} className={`w-full py-3 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}>
                This and all future occurrences
              </button>
              <button onClick={() => setScope('all')} className={`w-full py-3 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200 hover:bg-stone-700' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}>
                All occurrences (past and future)
              </button>
              <button onClick={onCancel} className={`w-full py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800/50 text-stone-400' : 'bg-stone-50 text-stone-500'}`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: keep earnings or not
  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className={`${cardBg} w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in`} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="font-display text-2xl font-semibold text-center">
            {scope === 'this' ? 'Delete this shift?' : scope === 'future' ? 'Delete this and future?' : 'Delete all occurrences?'}
          </h3>
          <p className={`text-sm text-center mt-2 ${prefs.dark ? 'text-stone-400' : 'text-stone-600'}`}>
            {job.name}{scope === 'this' ? ` · ${fmtCurrency(earnings)}` : ''}
          </p>
          <p className={`text-sm text-center mt-3 mb-5 ${prefs.dark ? 'text-stone-300' : 'text-stone-700'}`}>
            Do you want to keep the earnings in your history?
          </p>
          <div className="space-y-2">
            <button onClick={() => onConfirm(true, scope)} className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${prefs.dark ? 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              <CheckCircle2 className="w-4 h-4" /> Keep earnings (move to history)
            </button>
            <button onClick={() => onConfirm(false, scope)} className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${prefs.dark ? 'bg-red-950 text-red-400 hover:bg-red-900' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
              <Trash2 className="w-4 h-4" /> Delete permanently (lose earnings)
            </button>
            {shift.recurringId && (
              <button onClick={() => setScope(null)} className={`w-full py-2 rounded-lg text-xs font-medium ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>
                ← Back to scope
              </button>
            )}
            <button onClick={onCancel} className={`w-full py-2.5 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'}`}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== DONE PROMPT ==============
function DonePrompt({ shift, job, onYes, onNo, prefs }) {
  if (!job) return null;
  const color = JOB_COLORS[job.colorIdx];
  const cardBg = prefs.dark ? 'bg-stone-900' : 'bg-white';
  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className={`${cardBg} w-full md:max-w-sm md:rounded-2xl rounded-t-3xl shadow-2xl animate-slide-up md:animate-fade-in overflow-hidden`}>
        <div className="p-5" style={{ background: color.bg }}>
          <div className="flex items-center gap-2 text-white/80 text-xs uppercase tracking-widest font-medium">
            <Bell className="w-3.5 h-3.5" /> Shift finished?
          </div>
          <h3 className="font-display text-2xl font-semibold text-white mt-2">{job.name}</h3>
          <p className="text-white/80 text-sm mt-1">
            {new Date(`${shift.date}T${shift.startTime}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
          </p>
        </div>
        <div className="p-5 space-y-2">
          <p className={`text-sm text-center ${prefs.dark ? 'text-stone-300' : 'text-stone-700'} mb-3`}>
            Did you complete this shift?
          </p>
          <button onClick={onYes} className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${prefs.dark ? 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
            <CheckCircle2 className="w-4 h-4" /> Yes, mark as done
          </button>
          <button onClick={onNo} className={`w-full py-3 rounded-lg text-sm font-medium ${prefs.dark ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-700'}`}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== SETTINGS ==============
function SettingsView({ prefs, setPrefs, prefsCardClass, subtleText }) {
  const cardClass = prefsCardClass;
  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="font-display text-3xl md:text-4xl font-medium">Settings</h2>
        <p className={`text-sm ${subtleText} mt-1`}>Customize how Tally works</p>
      </div>

      <div className={`rounded-2xl border ${cardClass} divide-y ${prefs.dark ? 'divide-stone-800' : 'divide-stone-200'}`}>
        <SettingRow
          icon={<Bell className="w-4 h-4" />}
          title="Notifications"
          description="24hr and 1hr reminders before shifts, plus done prompts after"
          checked={prefs.notifications}
          onChange={(v) => setPrefs(p => ({ ...p, notifications: v }))}
          prefs={prefs}
        />
        <SettingRow
          icon={<CheckCircle2 className="w-4 h-4" />}
          title="Auto-mark past shifts as done"
          description="If off, you'll be asked to confirm each shift after it ends"
          checked={prefs.autoMarkDone}
          onChange={(v) => setPrefs(p => ({ ...p, autoMarkDone: v }))}
          prefs={prefs}
        />
        <SettingRow
          icon={prefs.dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          title="Dark mode"
          description="Lower contrast for night use"
          checked={prefs.dark}
          onChange={(v) => setPrefs(p => ({ ...p, dark: v }))}
          prefs={prefs}
        />
      </div>

      <div className={`rounded-2xl border ${cardClass} p-5`}>
        <h3 className="font-display text-lg font-semibold mb-2">About reminders</h3>
        <p className={`text-sm ${subtleText} mb-3`}>
          Tally sends reminders 24 hours and 1 hour before each shift, and asks if you finished after the end time. For best results on Android: install the app to your home screen and allow notifications when prompted.
        </p>
        <button onClick={() => {
          if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'default') {
              Notification.requestPermission();
            } else if (Notification.permission === 'granted') {
              new Notification('Tally test', { body: 'Notifications are working ✓', icon: '/icon-192.png' });
            } else {
              alert('Notifications are blocked. Enable them in your browser settings.');
            }
          }
        }} className={`text-sm font-medium ${prefs.dark ? 'text-amber-300' : 'text-stone-900'} underline underline-offset-2`}>
          Test notification
        </button>
      </div>
    </div>
  );
}

function SettingRow({ icon, title, description, checked, onChange, prefs }) {
  return (
    <label className="flex items-center gap-4 p-5 cursor-pointer">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${prefs.dark ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-700'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className={`text-xs mt-0.5 ${prefs.dark ? 'text-stone-400' : 'text-stone-500'}`}>{description}</p>
      </div>
      <div className="relative shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? (prefs.dark ? 'bg-amber-300' : 'bg-stone-900') : (prefs.dark ? 'bg-stone-700' : 'bg-stone-300')}`}>
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
        </div>
      </div>
    </label>
  );
}
