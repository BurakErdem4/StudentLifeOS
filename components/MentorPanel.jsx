// --- MENTOR PANEL (MentorDashboard + AnalysisView + StudentSimulator + StudentDetailModal) ---
// Extracted from index.html. Uses globals: db, auth, React, useState, useEffect, Icons

const MentorDashboard = ({ currentUser }) => {
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [view, setView] = useState('all'); // 'all', 'classes', or specific classId
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newClassName, setNewClassName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [dataAccordionOpen, setDataAccordionOpen] = useState(false);
    const [panelView, setPanelView] = useState('dashboard');
    const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null, type: 'info' });
    const [classDetailModal, setClassDetailModal] = useState(null); // { id, name }
    const [addStudentModal, setAddStudentModal] = useState(false);
    const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState([]);
    const [expandedList, setExpandedList] = useState(null); // 'radar' | 'ghost' | null

    const ConfirmationModal = () => {
        if (!confirmModal.open) return null;
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] animate-fade-in p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-100 dark:border-slate-700 transform transition-all scale-100">
                    <h3 className={`text-xl font-bold mb-2 ${confirmModal.type === 'danger' ? 'text-red-600' : 'text-gray-900 dark:text-slate-100'}`}>{confirmModal.title}</h3>
                    <p className="text-gray-600 mb-6 text-sm leading-relaxed whitespace-pre-line">{confirmModal.message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setConfirmModal({ ...confirmModal, open: false })}
                            className="px-4 py-2 text-gray-500 dark:text-slate-400 font-bold hover:bg-gray-100 rounded-lg transition text-sm"
                        >
                            İptal
                        </button>
                        <button
                            onClick={() => {
                                if (confirmModal.onConfirm) confirmModal.onConfirm();
                                setConfirmModal({ ...confirmModal, open: false });
                            }}
                            className={`px-4 py-2 font-bold rounded-lg transition text-sm shadow-lg ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'}`}
                        >
                            Onayla
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const usersSnap = await db.ref('users').once('value');
                const users = [];
                let totalUsers = 0;
                usersSnap.forEach(child => {
                    totalUsers++;
                    const val = child.val();
                    if (val && val.profile && val.profile.role && val.profile.role.toLowerCase() === 'student') {
                        users.push({ uid: child.key, ...val });
                    }
                });
                // Fetch Classes
                // MOVED TO users/school_metadata due to permission issues on root /classes
                const classesSnap = await db.ref('users/school_metadata/classes').once('value');
                const classesList = [];
                if (classesSnap.exists()) {
                    classesSnap.forEach(child => {
                        classesList.push({ id: child.key, ...child.val() });
                    });
                }

                console.log(`Debug: Found ${totalUsers} total users, ${users.length} students.`);
                setStudents(users);
                setClasses(classesList);
            } catch (error) {
                console.error("Fetch Error:", error);
                alert("Veri çekme hatası: " + error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const createClass = () => {
        if (!newClassName) return;
        const newRef = db.ref('users/school_metadata/classes').push();
        newRef.set({ name: newClassName, createdAt: Date.now() });
        setClasses([...classes, { id: newRef.key, name: newClassName }]);
        setNewClassName('');
    };

    const deleteClass = (cls) => {
        setConfirmModal({
            open: true,
            title: `"${cls.name}" silinsin mi?`,
            message: `Bu sınıf tamamen silinecek.\nSınıftaki tüm öğrencilerin sınıf ataması kaldırılacak.\n\nBu işlem geri alınamaz.`,
            type: 'danger',
            onConfirm: async () => {
                // 1. Orphan protection: remove classId from all students in this class
                const updates = {};
                students.forEach(s => {
                    if (s.profile.classId === cls.id) {
                        updates[`users/${s.uid}/profile/classId`] = null;
                    }
                });
                if (Object.keys(updates).length > 0) await db.ref().update(updates);
                // 2. Delete the class
                await db.ref(`users/school_metadata/classes/${cls.id}`).remove();
                setClasses(prev => prev.filter(c => c.id !== cls.id));
                setStudents(prev => prev.map(s => s.profile.classId === cls.id ? { ...s, profile: { ...s.profile, classId: null } } : s));
                if (classDetailModal?.id === cls.id) setClassDetailModal(null);
            }
        });
    };

    const renameClass = (cls) => {
        const newName = prompt(`"${cls.name}" için yeni ad gir:`, cls.name);
        if (!newName || newName.trim() === cls.name) return;
        db.ref(`users/school_metadata/classes/${cls.id}/name`).set(newName.trim());
        setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, name: newName.trim() } : c));
        if (classDetailModal?.id === cls.id) setClassDetailModal(prev => ({ ...prev, name: newName.trim() }));
    };

    const assignStudentsToClass = async () => {
        if (selectedStudentsToAdd.length === 0) return;
        const updates = {};
        selectedStudentsToAdd.forEach(uid => { updates[`users/${uid}/profile/classId`] = classDetailModal.id; });
        await db.ref().update(updates);
        setStudents(prev => prev.map(s => selectedStudentsToAdd.includes(s.uid) ? { ...s, profile: { ...s.profile, classId: classDetailModal.id } } : s));
        setSelectedStudentsToAdd([]);
        setAddStudentModal(false);
    };

    // --- Helper: timeAgo ---
    const timeAgo = (ts) => {
        if (!ts) return 'Hi\u00e7 girmedi';
        const diff = Date.now() - ts;
        const min = Math.floor(diff / 60000);
        if (min < 2) return 'Az \u00f6nce';
        if (min < 60) return `${min} dakika \u00f6nce`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} saat \u00f6nce`;
        const day = Math.floor(hr / 24);
        if (day < 30) return `${day} g\u00fcn \u00f6nce`;
        return `${Math.floor(day / 30)} ay \u00f6nce`;
    };

    // --- Helper: getStudentStreak (history-based, same logic as StudentUI) ---
    const getStudentStreak = (student) => {
        const hist = student.history || {};
        const gdk = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        };
        const isDayQualified = (dayData) => {
            if (!dayData) return false;
            if (dayData.frozen === true) return true;
            const tasks = dayData.tasks || [];
            const hasTask = tasks.some(t => t.completed || (t.subItems && t.subItems.some(Boolean)));
            const hasHabit = (dayData.habits || []).length > 0;
            return hasTask && hasHabit;
        };
        let streak = 0;
        const today = new Date();
        const todayData = hist[gdk(today)];
        let startFromToday = isDayQualified(todayData);
        if (startFromToday) streak = 1;
        const cursor = new Date(today);
        cursor.setDate(cursor.getDate() - 1);
        for (let i = 0; i < 365; i++) {
            const key = gdk(cursor);
            if (isDayQualified(hist[key])) {
                streak++;
            } else {
                if (!startFromToday && i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
                break;
            }
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    };

    const createTestStudent = async () => {
        const newRef = db.ref('users').push();
        const testData = {
            profile: { name: "Test Öğrenci", email: "test@student.com", role: "student", storeLocked: false },
            gold: 100,
            history: {}
        };
        await newRef.set(testData);
        setStudents([...students, { uid: newRef.key, ...testData }]);
    };

    const calculateRisk = (student) => {
        const todayKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
        const todayData = student.history && student.history[todayKey];
        const tasks = todayData ? (todayData.tasks || []) : [];

        if (tasks.length === 0) return { color: "border-gray-200 dark:border-slate-700", bg: "bg-gray-50 dark:bg-slate-700", text: "Veri Yok" };

        let doneCount = 0;
        tasks.forEach(t => {
            if (t.subItems && t.subItems.length) {
                doneCount += (t.subItems.filter(Boolean).length / t.subItems.length);
            } else if (t.completed) {
                doneCount += 1;
            }
        });

        const percent = (doneCount / tasks.length) * 100;
        if (percent < 40) return { color: "border-red-500", bg: "bg-red-50", text: "Riskli" };
        if (percent < 60) return { color: "border-orange-500", bg: "bg-orange-50", text: "Dikkat" };
        if (percent < 80) return { color: "border-yellow-500", bg: "bg-yellow-50", text: "İyi" };
        return { color: "border-green-500", bg: "bg-green-50", text: "Harika" };
    };

    const calculateScore = (student) => {
        const totalGoals = (student.projects || []).reduce((acc, p) => acc + (Number(p.totalUnit) || 0), 0);
        const completedGoals = (student.projects || []).reduce((acc, p) => acc + (Number(p.currentUnit) || 0), 0);
        return totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 1000) : 0;
    };

    // --- DASHBOARD HELPER FUNCTIONS ---
    const getDateKeyFor = (date) => {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    };

    const getWeeklyFocusMinutes = (student) => {
        const history = student.history || {};
        let total = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = getDateKeyFor(d);
            const dayData = history[key];
            if (dayData && dayData.tasks) {
                dayData.tasks.forEach(t => {
                    if (t.completed) total += (Number(t.duration) || 0);
                    else if (t.subItems && t.subItems.length > 0) {
                        const progress = t.subItems.filter(Boolean).length / t.subItems.length;
                        total += ((Number(t.duration) || 0) * progress);
                    }
                });
            }
        }
        return Math.round(total);
    };

    const getLastActiveDate = (student) => {
        const history = student.history || {};
        const keys = Object.keys(history).sort();
        if (keys.length === 0) return null;
        const lastKey = keys[keys.length - 1];
        const parts = lastKey.split('-');
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    };

    const isActiveInLastNDays = (student, n) => {
        const lastActive = getLastActiveDate(student);
        if (!lastActive) return false;
        const now = new Date();
        const diffDays = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
        return diffDays < n;
    };

    const getFocusMinutesForDays = (student, days) => {
        const history = student.history || {};
        let total = 0;
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = getDateKeyFor(d);
            const dayData = history[key];
            if (dayData && dayData.tasks) {
                dayData.tasks.forEach(t => {
                    if (t.completed) total += (Number(t.duration) || 0);
                    else if (t.subItems && t.subItems.length > 0) {
                        const progress = t.subItems.filter(Boolean).length / t.subItems.length;
                        total += ((Number(t.duration) || 0) * progress);
                    }
                });
            }
        }
        return Math.round(total);
    };



    // --- MOCK DATA SEEDING (FOR DEMO) ---
    const handleSeedMockData = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        setConfirmModal({
            open: true,
            title: 'Mock Data Yükle (Pro)',
            message: 'Gerçek YKS şablonları kullanılarak 3 öğrenci (Can, Zeynep, Emre) oluşturulacak.\nBu işlem mevcut mock verileri üzerine yazabilir.',
            onConfirm: async () => {
                setLoading(true);

                // 1. Bizim hazırladığımız gerçek şablonları bulalım
                const tytBundle = STUDY_TEMPLATES.find(t => t.id === 'bundle_tyt_genel');
                const aytBundle = STUDY_TEMPLATES.find(t => t.id === 'bundle_ayt_sayisal');

                // Eğer şablonlar tanımlı değilse hata vermesin
                if (!tytBundle || !aytBundle) {
                    alert("Hata: Hazır şablonlar bulunamadı. Lütfen önce STUDY_TEMPLATES verisini kontrol edin.");
                    setLoading(false);
                    return;
                }

                // Tüm derslerin listesi (Flat list)
                const allLessons = [...tytBundle.items, ...aytBundle.items];

                const mockStudents = [
                    {
                        uid: 'mock_1',
                        name: 'Can Yılmaz',
                        class: '12-A',
                        role: 'student',
                        email: 'can@mock.com',
                        strategy: 'TYT_FOCUS' // Can TYT abanmış
                    },
                    {
                        uid: 'mock_2',
                        name: 'Zeynep Demir',
                        class: '12-A',
                        role: 'student',
                        email: 'zeynep@mock.com',
                        strategy: 'BALANCED' // Zeynep dengeli gidiyor
                    },
                    {
                        uid: 'mock_3',
                        name: 'Emre Çelik',
                        class: '12-B',
                        role: 'student',
                        email: 'emre@mock.com',
                        strategy: 'JUST_STARTED' // Emre yeni başlamış
                    }
                ];

                const newUsersData = {};

                mockStudents.forEach(student => {
                    // --- A. PROJELERİ OLUŞTUR (Gerçek Ders İsimleriyle) ---
                    const studentProjects = allLessons.map((lesson, index) => {
                        // Rastgele ilerleme oranı belirle
                        let progressRate = 0;

                        if (student.strategy === 'TYT_FOCUS') {
                            // TYT dersleri %40-80 arası, AYT %0-20 arası
                            const isTYT = lesson.title.includes('TYT');
                            progressRate = isTYT ? (0.4 + Math.random() * 0.4) : (Math.random() * 0.2);
                        } else if (student.strategy === 'BALANCED') {
                            // Hepsi %30-60 arası
                            progressRate = 0.3 + Math.random() * 0.3;
                        } else {
                            // Yeni başlayan %0-15
                            progressRate = Math.random() * 0.15;
                        }

                        const current = Math.floor(lesson.totalUnit * progressRate);

                        return {
                            id: `mock_proj_${student.uid}_${index}`,
                            title: lesson.title, // "TYT Matematik", "AYT Fizik" vb.
                            totalUnit: lesson.totalUnit,
                            currentUnit: current,
                            unit: lesson.unit,
                            totalEstTime: lesson.totalEstTime,
                            notes: lesson.notes || ''
                        };
                    });

                    // --- B. GEÇMİŞ VERİSİ OLUŞTUR (Grafikler Dolu Gözüksün Diye) ---
                    // Son 90 gün (3 ay) için rastgele "tamamlanan görevler" uyduruyoruz
                    const historyData = {};
                    const today = new Date();

                    for (let i = 0; i < 90; i++) {
                        // %20 olasılıkla o gün çalışmasın (Mola günü)
                        if (Math.random() < 0.2) continue;

                        const d = new Date(today);
                        d.setDate(d.getDate() - i);
                        const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

                        // O gün kaç dakika çalışmış olsun? (0 ile 300 dk arası)
                        const workedMinutes = Math.floor(Math.random() * (student.strategy === 'JUST_STARTED' ? 60 : 300));

                        if (workedMinutes > 0) {
                            // Pick random projects from the student's list
                            const p1 = studentProjects[Math.floor(Math.random() * studentProjects.length)];
                            const p2 = studentProjects[Math.floor(Math.random() * studentProjects.length)];

                            // targetAmount strateji bazlı - günlük çalışma miktarı
                            const baseAmount = student.strategy === 'TYT_FOCUS' ? 5 :
                                student.strategy === 'BALANCED' ? 3 : 1;
                            const amt1 = Math.max(1, Math.floor(baseAmount * (0.5 + Math.random())));
                            const amt2 = Math.max(1, Math.floor(baseAmount * (0.3 + Math.random() * 0.7)));

                            historyData[dateKey] = {
                                tasks: [
                                    {
                                        id: `hist_${i}_1`,
                                        pid: p1.id,
                                        title: `${p1.title} Çalışması`,
                                        completed: true,
                                        duration: Math.floor(workedMinutes * 0.6),
                                        targetAmount: amt1
                                    },
                                    {
                                        id: `hist_${i}_2`,
                                        pid: p2.id,
                                        title: `${p2.title} Tekrarı`,
                                        completed: true,
                                        duration: Math.floor(workedMinutes * 0.4),
                                        targetAmount: amt2
                                    }
                                ]
                            };
                        }
                    }

                    // --- B2. PROJE İLERLEMELERİNİ TARİHÇEYLE SENKRONİZE ET ---
                    // Tarihçedeki tamamlanan görevlerden kümülatif ilerlemeyi hesapla
                    const cumulativeProgress = {};
                    Object.values(historyData).forEach(day => {
                        (day.tasks || []).forEach(task => {
                            if (task.pid && task.completed !== false) {
                                cumulativeProgress[task.pid] = (cumulativeProgress[task.pid] || 0) + (task.targetAmount || 0);
                            }
                        });
                    });

                    // Her projenin currentUnit'ını tarihçeyle eşitle (totalUnit'ı aşmasın)
                    studentProjects.forEach(p => {
                        const fromHistory = cumulativeProgress[p.id] || 0;
                        p.currentUnit = Math.min(p.totalUnit, fromHistory);
                    });

                    // --- C. KULLANICIYI PAKETLE ---
                    newUsersData[`users/${student.uid}`] = {
                        profile: {
                            name: student.name,
                            email: student.email,
                            role: student.role,
                            classId: student.class === '12-A' ? 'class_12a' : 'class_12b',
                            isMock: true
                        },
                        projects: studentProjects,
                        history: historyData,
                        gold: Math.floor(Math.random() * 500),
                        habits: [],
                        rewards: []
                    };
                });

                // Ensure Classes Exist too
                newUsersData['users/school_metadata/classes/class_12a'] = { name: '12-A', createdAt: Date.now() };
                newUsersData['users/school_metadata/classes/class_12b'] = { name: '12-B', createdAt: Date.now() };

                // Veritabanına Yaz
                try {
                    await db.ref().update(newUsersData);
                    alert('✅ 3 Adet YKS Öğrencisi (Can, Zeynep, Emre) başarıyla yüklendi!\nSayfayı yenileyip Mentor Paneli\'ne bakın.');
                    window.location.reload();
                } catch (error) {
                    console.error(error);
                    alert('Mock data yüklenirken hata oluştu: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    // Filter & Sort Logic
    let displayedStudents = students;

    // 1. Filter by View (Class)
    if (view !== 'all' && view !== 'classes') {
        displayedStudents = students.filter(s => s.profile.classId === view);
    }

    // 2. Filter by Search Term
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        displayedStudents = displayedStudents.filter(s =>
            (s.profile.name || '').toLowerCase().includes(lowerTerm) ||
            (s.profile.email || '').toLowerCase().includes(lowerTerm)
        );
    }

    // 3. Sort by Score (Descending)
    displayedStudents.sort((a, b) => calculateScore(b) - calculateScore(a));


    if (selectedStudent) {
        return <StudentDetailModal student={selectedStudent} classes={classes} onClose={() => setSelectedStudent(null)} />;
    }

    // --- DASHBOARD COMPUTATIONS ---
    const activeStudents = students.filter(s => isActiveInLastNDays(s, 3));
    const totalWeeklyFocus = students.reduce((acc, s) => acc + getWeeklyFocusMinutes(s), 0);
    const avgWeeklyFocusHours = students.length > 0 ? (totalWeeklyFocus / students.length / 60).toFixed(1) : '0';

    // Radardakiler: Son 3 günde aktif AMA <120dk odaklanma
    const radarStudents = students.filter(s => {
        if (!isActiveInLastNDays(s, 3)) return false;
        return getFocusMinutesForDays(s, 3) < 120;
    });

    // Zirvedekiler: Son 7 günde en yüksek odaklanma - ilk 3
    const topStudents = [...students]
        .map(s => ({ ...s, weeklyFocus: getWeeklyFocusMinutes(s) }))
        .sort((a, b) => b.weeklyFocus - a.weeklyFocus)
        .slice(0, 3);

    // Hayaletler: Son aktif tarihi 3+ gün eski
    const ghostStudents = students.filter(s => {
        const lastActive = getLastActiveDate(s);
        if (!lastActive) return true; // Hiç kaydı yok
        const diffDays = Math.floor((new Date() - lastActive) / (1000 * 60 * 60 * 24));
        return diffDays >= 3;
    }).map(s => {
        const lastActive = getLastActiveDate(s);
        const diffDays = lastActive ? Math.floor((new Date() - lastActive) / (1000 * 60 * 60 * 24)) : 999;
        return { ...s, diffDays };
    }).sort((a, b) => b.diffDays - a.diffDays);

    // --- SUB-VIEW: Mevcut Öğrenciler/Sınıflar/Veri Yönetimi ---
    if (panelView !== 'dashboard') {
        // panelView değiştiğinde uygun view'ı ayarla
        const effectiveView = panelView === 'students' ? 'all' : panelView === 'classes' ? 'classes' : view;

        // Data view ise accordion açık olsun
        const isDataView = panelView === 'data';

        // Sub-view title/description
        const subViewTitle = isDataView ? 'Veri Yönetimi' : view === 'classes' ? 'Sınıflar & Gruplar' : 'Tüm Öğrenciler';
        const subViewEmoji = isDataView ? '📊' : view === 'classes' ? '🏫' : '🎓';
        const subViewDesc = isDataView ? 'Verileri dışa aktar, yedekle veya toplu yükleme yap.' : view === 'classes' ? 'Sınıfları yönet ve öğrencileri grupla.' : `${displayedStudents.length} öğrenci listeleniyor.`;

        return (
            <div className="flex flex-col h-full bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-slate-100">
                <ConfirmationModal />

                {/* GRADIENT HEADER - Same as Dashboard */}
                <div className="p-6 pb-8" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f766e 100%)' }}>
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setPanelView('dashboard'); setView('all'); }} className="flex items-center gap-2 text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition">
                                <span>⬅️</span> Ana Panel
                            </button>
                            <DevTools openConfirm={(title, message, onConfirm, type) => setConfirmModal({ open: true, title, message, onConfirm, type })} onSeedMockData={handleSeedMockData} />
                        </div>
                        <button type="button" onClick={() => auth.signOut()} className="text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 transition">ÇIKIŞ</button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl backdrop-blur-sm">{subViewEmoji}</div>
                        <div>
                            <h2 className="text-2xl font-extrabold text-white">{subViewTitle}</h2>
                            <p className="text-sm text-white/60">{subViewDesc}</p>
                        </div>
                    </div>
                </div>

                {/* TABS & SEARCH - Floating over content */}
                <div className="px-4 sm:px-6 -mt-4">
                    {!isDataView && (
                        <div className="flex flex-col sm:flex-row gap-3 mb-4">
                            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl flex-1 shadow-lg border border-gray-100 dark:border-slate-700">
                                <button onClick={() => setView('all')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${view === 'all' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm' : 'text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200'}`}>Tüm Öğrenciler</button>
                                <button onClick={() => setView('classes')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${view === 'classes' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm' : 'text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200'}`}>Sınıflar</button>
                            </div>
                            {(view === 'all' || (view !== 'classes' && view !== 'all')) && (
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-slate-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Öğrenci ara..."
                                        className="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-800 focus:border-teal-300 transition"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
                    {loading ? <div className="text-center text-gray-400 dark:text-slate-400 py-10">Yükleniyor...</div> : (
                        <>
                            {isDataView ? (
                                <div className="space-y-4 mt-4">
                                    {/* Export/Import Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <button
                                            onClick={() => {
                                                const filtered = view !== 'all' && view !== 'classes'
                                                    ? students.filter(s => s.profile.classId === view)
                                                    : students;
                                                const label = view !== 'all' && view !== 'classes' ? view : 'Tum_Siniflar';
                                                const result = exportAllStudents(filtered, `Sinif_${label}_${new Date().toISOString().slice(0, 10)}`);
                                                alert(result.message);
                                            }}
                                            className="group bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 hover:scale-[1.02] transition-all text-left"
                                        >
                                            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">📋</div>
                                            <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Sınıf Listesini Dışa Aktar</div>
                                            <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-1">Mevcut görünümdeki öğrencileri Excel'e aktar</div>
                                        </button>
                                        <button
                                            onClick={() => {
                                                const result = exportAllStudents(students, `Kurum_Yedek_${new Date().toISOString().slice(0, 10)}`);
                                                alert(result.message);
                                            }}
                                            className="group bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:scale-[1.02] transition-all text-left"
                                        >
                                            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">🏫</div>
                                            <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Tüm Kurumu Yedekle</div>
                                            <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-1">Tüm öğrenci verisini tek dosyaya yedekle</div>
                                        </button>
                                        <label className="group bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border-2 border-dashed border-gray-200 dark:border-slate-600 hover:shadow-lg hover:border-teal-300 dark:hover:border-teal-600 hover:scale-[1.02] transition-all text-left cursor-pointer">
                                            <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">📤</div>
                                            <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Toplu Öğrenci Yükle</div>
                                            <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-1">Excel dosyasından öğrenci içe aktar</div>
                                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const data = new Uint8Array(await file.arrayBuffer());
                                                    const wb = XLSX.read(data, { type: 'array' });
                                                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                                                    if (!rows.length) return alert('Hata: Dosya boş veya formatı hatalı.');
                                                    let count = 0;
                                                    const batch = {};
                                                    rows.forEach(r => {
                                                        const name = r['Ad Soyad'] || r['name'] || r['İsim'];
                                                        const email = r['E-posta'] || r['email'] || r['Email'];
                                                        const classId = r['Sınıf'] || r['classId'] || r['class'] || '';
                                                        if (!name) return;
                                                        const uid = db.ref('users').push().key;
                                                        batch[`users/${uid}/profile`] = { name, email: email || '', role: 'student', classId };
                                                        batch[`users/${uid}/gold`] = 0;
                                                        batch[`users/${uid}/projects`] = [];
                                                        count++;
                                                    });
                                                    if (count > 0) {
                                                        await db.ref().update(batch);
                                                        alert(`✅ ${count} öğrenci başarıyla yüklendi!`);
                                                    } else {
                                                        alert('Hata: Geçerli öğrenci satırı bulunamadı. "Ad Soyad" sütunu gerekli.');
                                                    }
                                                } catch (err) {
                                                    alert('Hata: Dosya okunamadı veya formatı hatalı.');
                                                }
                                                e.target.value = '';
                                            }} />
                                        </label>
                                    </div>

                                    {/* Quick stats */}
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
                                        <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">VERİ ÖZETİ</h4>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{students.length}</div>
                                                <div className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">Toplam Öğrenci</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{classes.length}</div>
                                                <div className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">Sınıf</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{students.filter(s => (s.projects || []).length > 0).length}</div>
                                                <div className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">Aktif Projeli</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : view === 'classes' ? (
                                <div className="space-y-4">
                                    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                                        <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">YENİ SINIF OLUŞTUR</h3>
                                        <div className="flex gap-2">
                                            <input placeholder="Sınıf Adı (Örn: 12-A)" className="flex-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-800 transition" value={newClassName} onChange={e => setNewClassName(e.target.value)} />
                                            <button onClick={createClass} className="px-5 rounded-xl font-bold text-sm text-white shadow-sm hover:shadow-md transition" style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)' }}>+ Ekle</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {classes.map(c => {
                                            const classStudentCount = students.filter(s => s.profile.classId === c.id).length;
                                            return (
                                                <div key={c.id} className="group relative p-5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl hover:shadow-lg hover:border-teal-300 dark:hover:border-teal-600 transition-all">
                                                    {/* Edit/Delete icons */}
                                                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); renameClass(c); }}
                                                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                                                            title="Yeniden Adlandır"
                                                        >✏️</button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteClass(c); }}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/40 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
                                                            title="Sınıfı Sil"
                                                        >🗑️</button>
                                                    </div>
                                                    {/* Card body — click to open detail */}
                                                    <button className="w-full text-left" onClick={() => setClassDetailModal({ id: c.id, name: c.name })}>
                                                        <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-lg mb-2 group-hover:scale-110 transition-transform">🏫</div>
                                                        <div className="font-bold text-lg text-gray-800 dark:text-slate-100 pr-10">{c.name}</div>
                                                        <div className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">{classStudentCount} Öğrenci</div>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {classes.length === 0 && (
                                        <div className="text-center text-gray-400 dark:text-slate-500 py-8 text-sm">Henüz sınıf oluşturulmadı.</div>
                                    )}

                                    {/* CLASS DETAIL MODAL */}
                                    {classDetailModal && (() => {
                                        const classStudents = students.filter(s => s.profile.classId === classDetailModal.id);
                                        const unassignedStudents = students.filter(s => !s.profile.classId && s.profile.role === 'student');
                                        return (
                                            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4 animate-fade-in">
                                                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
                                                    {/* Modal Header */}
                                                    <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700">
                                                        <div>
                                                            <h3 className="text-xl font-black text-gray-900 dark:text-slate-100">🏫 {classDetailModal.name}</h3>
                                                            <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">{classStudents.length} kayıtlı öğrenci</p>
                                                        </div>
                                                        <button onClick={() => { setClassDetailModal(null); setAddStudentModal(false); setSelectedStudentsToAdd([]); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 text-xl">&times;</button>
                                                    </div>

                                                    {/* Student list */}
                                                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                                        {classStudents.length === 0 && !addStudentModal && (
                                                            <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-6">Bu sınıfta henüz öğrenci yok.</p>
                                                        )}
                                                        {classStudents.map(s => (
                                                            <div key={s.uid} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                                                                <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">{(s.profile.name || '?').charAt(0)}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                                    <div className="text-[11px] text-gray-400 dark:text-slate-400 truncate">{s.profile.email}</div>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {/* ADD STUDENT SUB-PANEL */}
                                                        {addStudentModal && (
                                                            <div className="mt-3">
                                                                <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Sınıfsız Öğrenciler</p>
                                                                {unassignedStudents.length === 0 && (
                                                                    <p className="text-center text-gray-400 dark:text-slate-500 text-sm py-4">Atanmamış öğrenci kalmadı.</p>
                                                                )}
                                                                {unassignedStudents.map(s => (
                                                                    <label key={s.uid} className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl mb-2 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="w-4 h-4 rounded accent-indigo-600"
                                                                            checked={selectedStudentsToAdd.includes(s.uid)}
                                                                            onChange={e => setSelectedStudentsToAdd(prev => e.target.checked ? [...prev, s.uid] : prev.filter(id => id !== s.uid))}
                                                                        />
                                                                        <div className="w-8 h-8 rounded-lg bg-indigo-400 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">{(s.profile.name || '?').charAt(0)}</div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                                            <div className="text-[11px] text-gray-400 dark:text-slate-400 truncate">{s.profile.email}</div>
                                                                        </div>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Footer buttons */}
                                                    <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex gap-2">
                                                        {!addStudentModal ? (
                                                            <button
                                                                onClick={() => { setAddStudentModal(true); setSelectedStudentsToAdd([]); }}
                                                                className="flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-md hover:shadow-lg transition"
                                                                style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)' }}
                                                            >+ Sınıfa Öğrenci Ekle</button>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => { setAddStudentModal(false); setSelectedStudentsToAdd([]); }} className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 transition">İptal</button>
                                                                <button
                                                                    onClick={assignStudentsToClass}
                                                                    disabled={selectedStudentsToAdd.length === 0}
                                                                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition shadow-md hover:shadow-lg"
                                                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                                                >Seçilenleri Ekle ({selectedStudentsToAdd.length})</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {view !== 'all' && <button onClick={() => setView('classes')} className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-2 hover:underline flex items-center gap-1">← Sınıflara Dön</button>}
                                    {displayedStudents.map(s => {
                                        const risk = calculateRisk(s);
                                        const sClass = classes.find(c => c.id === s.profile.classId);
                                        const score = calculateScore(s);
                                        const weeklyMin = getWeeklyFocusMinutes(s);

                                        return (
                                            <div key={s.uid} onClick={() => setSelectedStudent(s)} className={`bg-white dark:bg-slate-800 p-4 rounded-2xl border-l-[4px] shadow-sm hover:shadow-lg hover:translate-x-1 transition-all cursor-pointer flex items-center justify-between ${risk.color}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-sm ${risk.bg.replace('50', '500').replace('text', 'bg')}`}>{s.profile.name.charAt(0)}</div>
                                                    <div>
                                                        <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">{s.profile.name}</h3>
                                                        <div className="text-[10px] text-gray-400 dark:text-slate-400">{sClass ? sClass.name : 'Sınıfsız'} • {s.profile.email}</div>
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                                                            <span className="text-[10px] text-gray-400 dark:text-slate-500">👁️ {timeAgo(s.profile.lastSeen)}</span>
                                                            {getStudentStreak(s) > 0 && <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold">🔥 {getStudentStreak(s)} gün seri</span>}
                                                            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold">⏱️ {(weeklyMin/60).toFixed(1)}sa/hafta</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right mr-1 hidden sm:block">
                                                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{(weeklyMin / 60).toFixed(1)}sa/hafta</div>
                                                    </div>
                                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${risk.bg} ${risk.color.replace('border', 'text')}`}>{risk.text}</div>
                                                    <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400">{score}‰</div>
                                                    <Icons.ChevronRight />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {displayedStudents.length === 0 && (
                                        <div className="text-center text-gray-400 dark:text-slate-400 py-10 flex flex-col items-center gap-3">
                                            <span>{searchTerm ? `"${searchTerm}" için sonuç bulunamadı.` : 'Bu görünümde öğrenci yok.'}</span>
                                            {!searchTerm && <button onClick={createTestStudent} className="px-4 py-2 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl text-xs font-bold border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition">+ Test Öğrencisi Oluştur</button>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    // --- ANA DASHBOARD (KOKPİT) GÖRÜNÜMÜ ---
    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-slate-100">
            <ConfirmationModal />

            <div className="flex-1 overflow-y-auto">
                {/* HEADER */}
                <div className="p-6 pb-8" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f766e 100%)' }}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-white">Mentor Paneli</h1>
                            <DevTools openConfirm={(title, message, onConfirm, type) => setConfirmModal({ open: true, title, message, onConfirm, type })} onSeedMockData={handleSeedMockData} />
                        </div>
                        <button type="button" onClick={() => auth.signOut()} className="text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 transition">ÇIKIŞ</button>
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-white mb-1">Hoş Geldin, Mentor 👋</h2>
                        <p className="text-sm text-white/70">İşte bugünkü genel durum özetin.</p>
                    </div>
                </div>

                {/* KPI CARDS */}
                <div className="px-4 sm:px-6 -mt-5">
                    {loading ? <div className="text-center text-gray-400 dark:text-slate-400 py-10">Yükleniyor...</div> : (
                        <>
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                {/* KPI 1: Toplam Öğrenci */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-slate-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-bl-[40px] flex items-end justify-start pl-2 pb-1">
                                        <span className="text-xl">👥</span>
                                    </div>
                                    <div className="text-3xl font-extrabold text-gray-900 dark:text-slate-100">{students.length}</div>
                                    <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider mt-1">Toplam Öğrenci</div>
                                    <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold mt-2">
                                        {activeStudents.length} aktif
                                        <span className="text-gray-300 dark:text-slate-600 mx-1">•</span>
                                        {students.length - activeStudents.length} pasif
                                    </div>
                                </div>

                                {/* KPI 2: Haftalık Ort. Odaklanma */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-slate-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-bl-[40px] flex items-end justify-start pl-2 pb-1">
                                        <span className="text-xl">⏱️</span>
                                    </div>
                                    <div className="text-3xl font-extrabold text-gray-900 dark:text-slate-100">{avgWeeklyFocusHours}<span className="text-sm font-bold text-gray-400">sa</span></div>
                                    <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider mt-1">Hftlk. Ort. Odak</div>
                                    <div className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold mt-2">
                                        Son 7 gün ortalaması
                                    </div>
                                </div>

                                {/* KPI 3: Radardakiler */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-slate-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 dark:bg-orange-900/20 rounded-bl-[40px] flex items-end justify-start pl-2 pb-1">
                                        <span className="text-xl">📡</span>
                                    </div>
                                    <div className={`text-3xl font-extrabold ${radarStudents.length > 0 ? 'text-orange-500' : 'text-gray-900 dark:text-slate-100'}`}>{radarStudents.length}</div>
                                    <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider mt-1">Radardakiler</div>
                                    <div className="text-[10px] text-orange-500 dark:text-orange-400 font-bold mt-2">
                                        3 günde {'<'}2sa odak
                                    </div>
                                </div>
                            </div>

                            {/* NAVIGATION GRID */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <button
                                    onClick={() => { setPanelView('students'); setView('all'); }}
                                    className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:scale-[1.02] transition-all text-left"
                                >
                                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">🎓</div>
                                    <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Tüm Öğrenciler</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">{students.length} öğrenci kayıtlı</div>
                                </button>
                                <button
                                    onClick={() => { setPanelView('classes'); setView('classes'); }}
                                    className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-600 hover:scale-[1.02] transition-all text-left"
                                >
                                    <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">🏫</div>
                                    <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Sınıflar / Gruplar</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">{classes.length} sınıf mevcut</div>
                                </button>
                                <button
                                    disabled
                                    className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 opacity-60 cursor-not-allowed text-left relative"
                                >
                                    <div className="absolute top-3 right-3 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 text-[8px] font-bold px-2 py-0.5 rounded-full">YAKINDA</div>
                                    <div className="w-12 h-12 bg-sky-50 dark:bg-sky-900/30 rounded-xl flex items-center justify-center text-2xl mb-3">💬</div>
                                    <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Mesajlar</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">Etkileşimler & bildirimler</div>
                                </button>
                                <button
                                    onClick={() => setPanelView('data')}
                                    className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 hover:scale-[1.02] transition-all text-left"
                                >
                                    <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">📊</div>
                                    <div className="font-bold text-gray-800 dark:text-slate-100 text-sm">Veri Yönetimi</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400 mt-0.5">Dışa/İçe aktar & yedekle</div>
                                </button>
                            </div>

                            {/* 3-COLUMN EARLY WARNING SYSTEM */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                                {/* Sütun 1: Zirvedekiler */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-emerald-400 to-green-500"></div>
                                    <div className="p-4">
                                        <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">🌟 Zirvedekiler</h3>
                                        {topStudents.length > 0 ? topStudents.map((s, idx) => (
                                            <div key={s.uid} onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition mb-1">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-amber-700'}`}>
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                                        <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold">⏱️ {(s.weeklyFocus / 60).toFixed(1)}sa</span>
                                                        {getStudentStreak(s) > 0 && <span className="text-[10px] text-orange-500 font-bold">🔥 {getStudentStreak(s)}gün</span>}
                                                        <span className="text-[10px] text-gray-400 dark:text-slate-500">👁️ {timeAgo(s.profile.lastSeen)}</span>
                                                    </div>
                                                </div>
                                                <div className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                                            </div>
                                        )) : <div className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">Henüz veri yok</div>}
                                    </div>
                                </div>

                                {/* Sütun 2: Radardakiler */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-orange-400 to-amber-500"></div>
                                    <div className="p-4">
                                        <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">📉 Radardakiler</h3>
                                        {radarStudents.length > 0 ? radarStudents.slice(0, 3).map(s => {
                                            const focusMin = getFocusMinutesForDays(s, 3);
                                            return (
                                                <div key={s.uid} onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition mb-1">
                                                    <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center font-bold text-orange-600 dark:text-orange-400 text-xs">
                                                        {s.profile.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                                            <span className="text-[10px] text-orange-500 font-bold">⏱️ {focusMin}dk/3gün</span>
                                                            {getStudentStreak(s) > 0 && <span className="text-[10px] text-orange-600 font-bold">🔥 {getStudentStreak(s)}gün</span>}
                                                            <span className="text-[10px] text-gray-400 dark:text-slate-500">👁️ {timeAgo(s.profile.lastSeen)}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-orange-400 text-xs">⚠️</span>
                                                </div>
                                            );
                                        }) : <div className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">Radarda kimse yok 🎉</div>}
                                        {radarStudents.length > 3 && (
                                            <div className="flex justify-center mt-2">
                                                <button
                                                    onClick={() => setExpandedList('radar')}
                                                    className="text-[11px] font-bold text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 px-3 py-1 rounded-full transition"
                                                >
                                                    Tümünü Gör ({radarStudents.length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Sütun 3: Hayaletler */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-red-400 to-rose-500"></div>
                                    <div className="p-4">
                                        <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">👻 Hayaletler</h3>
                                        {ghostStudents.length > 0 ? ghostStudents.slice(0, 3).map(s => (
                                            <div key={s.uid} onClick={() => setSelectedStudent(s)} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition mb-1">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center font-bold text-gray-400 dark:text-slate-500 text-xs">
                                                    {s.profile.name.charAt(0)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                    <div className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">{s.diffDays >= 999 ? 'Hiç giriş yok' : `${s.diffDays} gündür kayıp`}</div>
                                                </div>
                                                <span>{s.diffDays >= 7 ? '🔴' : '🟡'}</span>
                                            </div>
                                        )) : <div className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">Kayıp öğrenci yok 🎉</div>}
                                        {ghostStudents.length > 3 && (
                                            <div className="flex justify-center mt-2">
                                                <button
                                                    onClick={() => setExpandedList('ghost')}
                                                    className="text-[11px] font-bold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 px-3 py-1 rounded-full transition"
                                                >
                                                    Tümünü Gör ({ghostStudents.length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* DRILL-DOWN MODAL */}
                            {expandedList && (
                                <div
                                    className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                                    onClick={() => setExpandedList(null)}
                                >
                                    <div
                                        className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-gray-100 dark:border-slate-700 animate-fade-in"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        {/* Modal Header */}
                                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{expandedList === 'radar' ? '📉' : '👻'}</span>
                                                <div>
                                                    <h3 className="text-base font-extrabold text-gray-900 dark:text-slate-100">
                                                        {expandedList === 'radar' ? 'Radardakiler' : 'Hayaletler'}
                                                    </h3>
                                                    <p className="text-[11px] text-gray-400 dark:text-slate-400">
                                                        {expandedList === 'radar' ? `${radarStudents.length} öğrenci` : `${ghostStudents.length} öğrenci`}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setExpandedList(null)}
                                                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 text-xl font-bold transition"
                                            >&times;</button>
                                        </div>

                                        {/* Modal List */}
                                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                                            {expandedList === 'radar' && radarStudents.map(s => {
                                                const focusMin = getFocusMinutesForDays(s, 3);
                                                return (
                                                    <div
                                                        key={s.uid}
                                                        onClick={() => { setSelectedStudent(s); setExpandedList(null); }}
                                                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-orange-50 dark:hover:bg-slate-700 cursor-pointer transition"
                                                    >
                                                        <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center font-bold text-orange-600 dark:text-orange-400 text-sm flex-shrink-0">
                                                            {s.profile.name.charAt(0)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                                                <span className="text-[10px] text-orange-500 font-bold">⏱️ {focusMin}dk/3gün</span>
                                                                {getStudentStreak(s) > 0 && <span className="text-[10px] text-orange-600 font-bold">🔥 {getStudentStreak(s)}gün</span>}
                                                                <span className="text-[10px] text-gray-400 dark:text-slate-500">👁️ {timeAgo(s.profile.lastSeen)}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-orange-400 text-xs">⚠️</span>
                                                    </div>
                                                );
                                            })}
                                            {expandedList === 'ghost' && ghostStudents.map(s => (
                                                <div
                                                    key={s.uid}
                                                    onClick={() => { setSelectedStudent(s); setExpandedList(null); }}
                                                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition"
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center font-bold text-gray-400 dark:text-slate-500 text-sm flex-shrink-0">
                                                        {s.profile.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm text-gray-800 dark:text-slate-100 truncate">{s.profile.name}</div>
                                                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-bold">{s.diffDays >= 999 ? 'Hiç giriş yok' : `${s.diffDays} gündür kayıp`}</div>
                                                    </div>
                                                    <span>{s.diffDays >= 7 ? '🔴' : '🟡'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const AnalysisView = ({ student }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [dateOffset, setDateOffset] = useState(0);
    const [liveHistory, setLiveHistory] = useState(student.history || {});

    useEffect(() => {
        const ref = db.ref(`users/${student.uid}/history`);
        ref.on('value', (snap) => {
            setLiveHistory(snap.val() || {});
        });
        return () => ref.off();
    }, [student.uid]);

    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getPaginatedDays = () => {
        return Array.from({ length: 10 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (9 - i) - (dateOffset * 10));
            return d;
        });
    };

    const selectedDateKey = getDateKey(selectedDate);
    const selectedDayData = liveHistory[selectedDateKey] || { tasks: [], habits: [] };
    // Pass liveHistory into student-derived lookups as well
    const liveStudent = { ...student, history: liveHistory };
    const daysList = getPaginatedDays();

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {/* 10 Günlük Çizelge */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">PERFORMANS AKIŞI</h3>
                    <div className="flex gap-2">
                        <button onClick={() => setDateOffset(dateOffset + 1)} className="p-1 px-2 bg-gray-50 dark:bg-slate-700 rounded text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100">← Önceki</button>
                        <button disabled={dateOffset === 0} onClick={() => setDateOffset(dateOffset - 1)} className="p-1 px-2 bg-gray-50 dark:bg-slate-700 rounded text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 disabled:opacity-30">Sonraki →</button>
                    </div>
                </div>

                {/* Mood Pulse */}
                <div className="grid grid-cols-10 gap-1 mb-2 px-1">
                    {daysList.map((d, i) => {
                        const k = getDateKey(d);
                        const mood = liveHistory[k] && liveHistory[k].journal ? liveHistory[k].journal.mood : '•';
                        return <div key={i} className="text-center text-xs opacity-50 grayscale">{mood}</div>
                    })}
                </div>

                <div className="grid grid-cols-10 gap-1 sm:gap-2">
                    {daysList.map((d, i) => {
                        const k = getDateKey(d);
                        const dayData = liveHistory[k];
                        let pct = 0;
                        let hasTasks = false;
                        if (dayData && dayData.tasks && dayData.tasks.length > 0) {
                            hasTasks = true;
                            let doneCount = 0;
                            dayData.tasks.forEach(t => {
                                if (t.subItems && t.subItems.length > 0) {
                                    doneCount += (t.subItems.filter(Boolean).length / t.subItems.length);
                                } else if (t.completed) {
                                    doneCount += 1;
                                }
                            });
                            pct = (doneCount / dayData.tasks.length) * 100;
                        }
                        const status = getStatusInfo(pct, hasTasks);
                        const isSelected = getDateKey(d) === selectedDateKey;

                        return (
                            <div key={i} onClick={() => setSelectedDate(d)}
                                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition border-2 ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                style={{
                                    backgroundColor: status.color,
                                    borderColor: status.color,
                                    color: status.textColor
                                }}
                            >
                                <span className="text-[10px] font-bold">{d.getDate()}</span>
                                <span className="text-[6px] sm:text-[8px] opacity-75">{d.toLocaleDateString('tr-TR', { month: 'short' })}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Gün Detayı */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                <h3 className="font-bold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <Icons.Calendar /> {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-slate-700 p-4 rounded-xl text-center">
                        <div className="text-2xl font-bold text-indigo-600">{selectedDayData.tasks ? selectedDayData.tasks.filter(t => t.completed).length : 0}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-bold">GÖREV</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700 p-4 rounded-xl text-center">
                        <div className="text-2xl font-bold text-indigo-600">
                            {selectedDayData.tasks ? Math.round(selectedDayData.tasks.reduce((acc, t) => {
                                if (t.completed) return acc + Number(t.duration);
                                if (t.subItems && t.subItems.length > 0) {
                                    const doneCount = t.subItems.filter(Boolean).length;
                                    const progress = doneCount / t.subItems.length;
                                    return acc + (Number(t.duration) * progress);
                                }
                                return acc;
                            }, 0)) : 0} <span className="text-sm">dk</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-bold">ODAK</div>
                    </div>
                </div>

                <h4 className="text-xs font-bold text-gray-400 dark:text-slate-400 border-b pb-2 mb-3">GÖREV GÜNLÜĞÜ</h4>
                {selectedDayData.tasks && selectedDayData.tasks.length > 0 ? (
                    <div className="space-y-2">
                        {selectedDayData.tasks.map((t, idx) => {
                            const isPartial = !t.completed && t.subItems && t.subItems.some(Boolean);
                            const isPending = !t.completed && !(t.subItems && t.subItems.some(Boolean));
                            let progressText = "";
                            let displayDuration = t.duration;
                            let percent = 0;

                            if (t.completed) {
                                percent = 100;
                            } else if (isPartial) {
                                const done = t.subItems.filter(Boolean).length;
                                const total = t.subItems.length;
                                progressText = ` (${done}/${total})`;
                                displayDuration = Math.round(Number(t.duration) * (done / total));
                                percent = (done / total) * 100;
                            }

                            // Pending (0%) tasks: use neutral gray style
                            const status = isPending
                                ? { color: '#f3f4f6', textColor: '#9ca3af' }
                                : getStatusInfo(percent, true);

                            const fmtTs = (ts) => new Date(ts).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

                            return (
                                <div key={idx}
                                    className="flex justify-between items-start p-3 rounded-lg transition"
                                    style={{
                                        backgroundColor: status.color,
                                        color: status.textColor
                                    }}
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-medium">
                                            {t.title}
                                            {isPartial && <span className="text-xs font-bold opacity-75 ml-1">{progressText}</span>}
                                            {isPending && <span className="text-[10px] font-bold opacity-50 ml-1">(bekliyor)</span>}
                                        </span>
                                        {t.isMentorTask && (
                                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 px-1.5 py-0.5 rounded self-start">
                                                👨‍🏫 MENTOR GÖREVİ
                                            </span>
                                        )}
                                        <div className="flex flex-wrap gap-2 mt-0.5">
                                            {t.createdAt && (
                                                <span className="text-[10px] opacity-60">
                                                    🕒 Eklendi: {fmtTs(t.createdAt)}
                                                </span>
                                            )}
                                            {t.createdAt && t.lastActivityAt && (
                                                <span className="text-[10px] opacity-40">|</span>
                                            )}
                                            {t.lastActivityAt && (
                                                <span className="text-[10px] opacity-60">
                                                    ✍️ Son İşlem: {fmtTs(t.lastActivityAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold flex-shrink-0">{displayDuration}dk</span>
                                </div>
                            );
                        })}
                    </div>
                ) : <div className="text-center text-sm text-gray-400 dark:text-slate-400 py-4">Kayıt yok.</div>}
            </div>

            <details className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 mb-3">
                <summary className="flex justify-between items-center font-bold text-gray-600 cursor-pointer text-sm">
                    <span>📋 Detaylı 10 Günlük Döküm</span>
                    <div className="group-open:rotate-180 transition"><Icons.ChevronRight /></div>
                </summary>
                <div className="mt-4 space-y-3 pl-4 border-l-2 border-gray-100 dark:border-slate-700">
                    {daysList.map((d, i) => {
                        const k = getDateKey(d);
                        const hist = liveHistory[k];
                        if (!hist || !hist.tasks || hist.tasks.length === 0) return null;

                        return (
                            <div key={i} className="text-xs text-gray-500 dark:text-slate-400">
                                <div className="font-bold flex justify-between mb-1">
                                    <span>{d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}:</span>
                                    <span className="text-indigo-600 font-bold">{Math.round(hist.tasks.reduce((acc, t) => {
                                        if (t.completed) return acc + Number(t.duration);
                                        if (t.subItems && t.subItems.length > 0) {
                                            const doneCount = t.subItems.filter(Boolean).length;
                                            const progress = doneCount / t.subItems.length;
                                            return acc + (Number(t.duration) * progress);
                                        }
                                        return acc;
                                    }, 0))}dk</span>
                                </div>
                                <div className="space-y-1 pl-2">
                                    {hist.tasks.filter(t => t.completed || (t.subItems && t.subItems.some(Boolean))).map((t, idx) => {
                                        const isPartial = !t.completed && t.subItems && t.subItems.some(Boolean);
                                        let progressText = "";
                                        let displayDuration = t.duration;
                                        if (isPartial) {
                                            const done = t.subItems.filter(Boolean).length;
                                            const total = t.subItems.length;
                                            progressText = ` (${done}/${total})`;
                                            displayDuration = Math.round(Number(t.duration) * (done / total));
                                        }
                                        return (
                                            <div key={idx} className="flex items-center gap-1">
                                                <span className="text-[8px] opacity-50">●</span>
                                                <span className={`${isPartial ? 'text-orange-500' : ''}`}>{t.title}{progressText} ({displayDuration}dk)</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </details>

            <details className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                <summary className="flex justify-between items-center font-bold text-gray-600 cursor-pointer text-sm">
                    <span>🎯 Aktif Büyük Hedefler</span>
                    <div className="group-open:rotate-180 transition"><Icons.ChevronRight /></div>
                </summary>
                <div className="mt-4 space-y-2">
                    {(student.projects || []).map(p => {
                        const pct = Math.min(100, Math.round((p.currentUnit / p.totalUnit) * 100));
                        return (
                            <div key={p.id} className="flex justify-between items-center text-xs">
                                <span className="font-bold text-gray-600">{p.title}</span>
                                <div className="flex items-center gap-2 w-1/2">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${pct}%` }}></div></div>
                                    <span className="text-gray-400 dark:text-slate-400 text-[10px]">%{pct}</span>
                                </div>
                            </div>
                        )
                    })}
                    {(!student.projects || student.projects.length === 0) && <div className="text-xs text-gray-300 italic">Hedef yok.</div>}
                </div>
            </details>

            <ProjectAnalyticsChart student={student} />
        </div>
    );
};


const StudentSimulator = ({ studentId }) => {
    const [student, setStudent] = useState(null);
    const [activeTab, setActiveTab] = useState('planner');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [modal, setModal] = useState({ open: false, type: null, data: null });
    const [form, setForm] = useState({});
    const [focusMode, setFocusMode] = useState({ active: false, taskId: null, taskTitle: '', timeLeft: 0, isRunning: false });
    const [flippedCards, setFlippedCards] = useState({});
    const [notificationModal, setNotificationModal] = useState(null);
    const [flippedProjects, setFlippedProjects] = useState({});

    useEffect(() => {
        if (!studentId) return;
        const ref = db.ref(`users/${studentId}`);
        const handler = (s) => {
            const val = s.val();
            if (val) setStudent({ uid: s.key, ...val });
        };
        ref.on('value', handler);
        return () => ref.off('value', handler);
    }, [studentId]);

    if (!student) return <div className="p-10 text-center text-gray-400 dark:text-slate-400">Öğrenci verisi yükleniyor...</div>;

    const updateCloud = (path, value) => {
        db.ref(`users/${student.uid}/${path}`).set(value);
    };

    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dateKey = getDateKey(selectedDate);
    const todayKey = getDateKey(new Date());
    const history = student.history || {};
    const projects = student.projects || [];
    const habits = student.habits || [];
    const rewards = student.rewards || [];
    const gold = student.gold || 0;
    const profile = student.profile || {};
    const currentDayData = history[dateKey] || { tasks: [], habits: [] };

    // --- Handlers Replicated from App ---
    const closeNotification = () => {
        setNotificationModal(null);
    };

    const handleAddProject = () => {
        if (form.title) {
            const initial = Number(form.initial) || 0;
            const newProject = {
                id: Date.now(),
                title: form.title,
                totalUnit: form.total || 100,
                unit: form.unit || 'Birim',
                currentUnit: initial,
                totalEstTime: form.estTime || 0,
                notes: ''
            };
            updateCloud('projects', [...projects, newProject]);
            if (initial > 0) {
                // Log initial progress to today
                const logId = Date.now() + 1;
                const logTask = {
                    id: logId,
                    title: `${form.title} (Başlangıç)`,
                    duration: 0,
                    type: 'project_log',
                    completed: true,
                    pid: newProject.id,
                    targetAmount: initial
                };
                updateCloud(`history/${dateKey}/tasks`, [...(currentDayData.tasks || []), logTask]);
            }
            setModal({ open: false });
        }
    };

    const handleEditProject = () => {
        if (!modal.data) return;
        const p = modal.data;
        const finalTotal = form.total !== undefined && form.total !== '' ? Number(form.total) : Number(p.totalUnit);
        const finalCurrent = form.current !== undefined && form.current !== '' ? Number(form.current) : Number(p.currentUnit);
        if (finalTotal <= 0) { if (!confirm('⚠️ Toplam birim 0 veya negatif. Yine de kaydetmek istiyor musun?')) return; }
        else if (finalCurrent > finalTotal) { if (!confirm(`⚠️ Yapılan (${finalCurrent}) toplam hedeften (${finalTotal}) büyük. Yine de kaydetmek istiyor musun?`)) return; }
        const updated = projects.map(proj => {
            if (proj.id === p.id) {
                return {
                    ...proj,
                    title: form.title !== undefined ? form.title : p.title,
                    totalUnit: form.total !== undefined && form.total !== '' ? Number(form.total) : p.totalUnit,
                    unit: form.unit !== undefined ? form.unit : p.unit,
                    currentUnit: form.current !== undefined && form.current !== '' ? Number(form.current) : p.currentUnit,
                    totalEstTime: form.estTime !== undefined && form.estTime !== '' ? Number(form.estTime) : p.totalEstTime
                };
            }
            return proj;
        });
        updateCloud('projects', updated);
        setModal({ open: false });
    };

    const handleAddTask = (type) => {
        let newTask;
        if (type === 'simple') {
            newTask = { id: Date.now(), title: form.title, type: 'simple', completed: false, duration: form.time || '30', startTime: form.startTime || '', createdAt: Date.now() };
        } else if (type === 'import') {
            const p = modal.data || projects.find(pro => String(pro.id).replace("ID_", "") === String(form.projectId).replace("ID_", ""));
            if (!p) return alert("Lütfen bir proje seçin!");
            const amount = Number(form.amount) || 1;
            let calculatedDuration = form.time;
            if (!calculatedDuration && p.totalEstTime && p.totalUnit) {
                const timePerUnitHours = p.totalEstTime / p.totalUnit;
                const totalHours = timePerUnitHours * amount;
                calculatedDuration = Math.round(totalHours * 60);
            }
            if (!calculatedDuration) calculatedDuration = '60';
            newTask = {
                id: Date.now(), title: `${p.title} (${amount} ${p.unit})`, type: 'project_slice',
                pid: p.id, targetAmount: amount, subItems: new Array(amount).fill(false), completed: false,
                duration: String(calculatedDuration), startTime: form.startTime || '', createdAt: Date.now()
            };
        }
        const newTasks = [...(currentDayData.tasks || []), newTask];
        updateCloud(`history/${dateKey}/tasks`, newTasks);
        setModal({ open: false });
    };

    const toggleTask = (taskId) => {
        const task = currentDayData.tasks.find(t => t.id === taskId);
        if (!task) return;
        const newStatus = !task.completed;
        db.ref(`users/${student.uid}/gold`).set((gold || 0) + (newStatus ? 10 : -10));
        const updatedTasks = currentDayData.tasks.map(t => t.id === taskId ? { ...t, completed: newStatus, lastActivityAt: Date.now() } : t);
        updateCloud(`history/${dateKey}/tasks`, updatedTasks);
    };

    const toggleSubItem = (taskId, index) => {
        const task = currentDayData.tasks.find(t => t.id === taskId);
        if (!task || !task.subItems) return;
        const newSubItems = [...task.subItems];
        const wasDone = newSubItems[index];
        newSubItems[index] = !wasDone;

        if (task.type === 'project_slice') {
            const targetProject = projects.find(p => String(p.id).replace("ID_", "") === String(task.pid).replace("ID_", ""));
            if (targetProject) {
                const newCurrent = Math.max(0, targetProject.currentUnit + (wasDone ? -1 : 1));
                const updatedProjects = projects.map(p => String(p.id).replace("ID_", "") === String(task.pid).replace("ID_", "") ? { ...p, currentUnit: newCurrent } : p);
                updateCloud('projects', updatedProjects);
            }
        }
        const allDone = newSubItems.every(i => i === true);
        db.ref(`users/${student.uid}/gold`).set((gold || 0) + (wasDone ? -5 : 5));
        const updatedTasks = currentDayData.tasks.map(t => {
            if (t.id === taskId) return { ...t, subItems: newSubItems, completed: allDone, lastActivityAt: Date.now() };
            return t;
        });
        updateCloud(`history/${dateKey}/tasks`, updatedTasks);
    };

    const deleteTask = (id) => {
        // Mentor mode: always allow deletion (override any lock)
        const tasks = currentDayData.tasks || [];
        updateCloud(`history/${dateKey}/tasks`, tasks.filter(t => t.id !== id));
    };

    const addHabit = () => { if (form.title) updateCloud('habits', [...habits, { id: Date.now(), title: form.title, icon: form.icon || '✨' }]); setForm({}); };
    const deleteHabit = (id) => updateCloud('habits', habits.filter(h => h.id !== id));
    const toggleHabit = (hId) => {
        const done = currentDayData.habits || [];
        const isDone = done.includes(hId);
        const newHabits = isDone ? done.filter(id => id !== hId) : [...done, hId];
        updateCloud(`history/${dateKey}/habits`, newHabits);
        // Gold update
        db.ref(`users/${student.uid}/gold`).set(gold + (isDone ? -5 : 5));
    };

    const handleBuyReward = (r) => {
        if (gold >= r.cost) {
            if (confirm(`${r.title} almak istiyor musun? (${r.cost} Altın)`)) {
                db.ref(`users/${student.uid}/gold`).set(gold - r.cost);
                alert("Afiyet olsun! 🍬");
            }
        } else {
            alert("Yetersiz Bakiye!");
        }
    };
    const handleAddReward = () => { if (form.title && form.cost) updateCloud('rewards', [...rewards, { id: Date.now(), title: form.title, cost: Number(form.cost), icon: form.icon || '🎁' }]); setForm({}); };
    const handleDeleteReward = (id) => updateCloud('rewards', rewards.filter(r => r.id !== id));


    return (
        <div className="border-4 border-gray-800 rounded-3xl overflow-hidden shadow-2xl relative bg-gray-900">
            <div className="absolute top-0 left-0 right-0 bg-gray-800 text-center text-[10px] text-gray-500 dark:text-slate-400 py-1 font-mono z-50">STUDENT SIMULATOR MODE</div>
            <div className="pt-6 h-[800px]"> {/* Fixed height container */}
                <StudentUI
                    user={{ uid: student.uid, email: profile.email }}
                    profile={profile}
                    activeTab={activeTab} setActiveTab={setActiveTab}
                    selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                    projects={projects} history={history} habits={habits} rewards={rewards}
                    gold={gold} flippedCards={flippedCards} setFlippedCards={setFlippedCards}
                    flippedProjects={flippedProjects} setFlippedProjects={setFlippedProjects}
                    focusMode={focusMode} setFocusMode={setFocusMode}
                    modal={modal}
                    openModal={(type, data) => { setModal({ open: true, type, data }); setForm({}); if (type === 'journal') setForm({ mood: currentDayData.journal?.mood || '😐', note: currentDayData.journal?.note || '' }); }}
                    closeModal={() => setModal({ open: false, type: null, data: null })}
                    form={form} setForm={setForm}
                    notificationModal={notificationModal} closeNotification={closeNotification}
                    handleAddProject={handleAddProject}
                    handleEditProject={handleEditProject}
                    handleDeleteProject={(id) => updateCloud('projects', projects.filter(p => p.id !== id))}
                    handleAddTask={handleAddTask}
                    toggleTask={toggleTask}
                    toggleSubItem={toggleSubItem}
                    deleteTask={deleteTask}
                    addHabit={addHabit}
                    deleteHabit={deleteHabit}
                    toggleHabit={toggleHabit}
                    handlePurchase={handleBuyReward}
                    handleAddReward={handleAddReward}
                    handleDeleteReward={handleDeleteReward}
                    handleStartFocus={(t) => setFocusMode({ active: true, taskId: t.id, taskTitle: t.title, timeLeft: Number(t.duration) * 60, isRunning: true })}
                    handleStopFocus={() => setFocusMode({ ...focusMode, active: false })}
                    dateKey={dateKey}
                    todayKey={todayKey}
                    currentDayData={currentDayData}
                    updateCloud={updateCloud}
                    isMentorMode={true}
                />
            </div>
        </div>
    );
};

const StudentDetailModal = ({ student, classes, onClose }) => {
    const [activeTab, setActiveTab] = useState('analysis');
    const [form, setForm] = useState({});
    const [newNote, setNewNote] = useState('');
    const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [mentorNotes, setMentorNotes] = useState([]);
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingNoteText, setEditingNoteText] = useState('');
    const [globalTags, setGlobalTags] = useState({ topics: [], sources: [], types: [] });
    const [visibleTaskCount, setVisibleTaskCount] = useState(5);

    useEffect(() => {
        const tagsRef = db.ref('globalTags');
        tagsRef.on('value', (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setGlobalTags({
                    topics: data.topics || [],
                    sources: data.sources || [],
                    types: data.types || []
                });
            } else {
                setGlobalTags({ topics: [], sources: [], types: [] });
            }
        });
        return () => tagsRef.off();
    }, []);

    useEffect(() => {
        const ref = db.ref(`users/${student.uid}/mentorNotes`);
        ref.on('value', (snap) => {
            const val = snap.val();
            if (val) {
                const arr = Object.entries(val)
                    .map(([id, n]) => ({ id, ...n }))
                    .sort((a, b) => b.date - a.date);
                setMentorNotes(arr);
            } else {
                setMentorNotes([]);
            }
        });
        return () => ref.off();
    }, [student.uid]);

    const handleSaveNote = () => {
        if (!newNote.trim()) return;
        const dateTs = noteDate ? new Date(noteDate).setHours(12, 0, 0, 0) : Date.now();
        db.ref(`users/${student.uid}/mentorNotes`).push({ date: dateTs, text: newNote.trim() });
        setNewNote('');
        setNoteDate(new Date().toISOString().split('T')[0]);
    };

    const handleDeleteNote = (id) => {
        if (confirm('Bu notu silmek istediğine emin misin?')) {
            db.ref(`users/${student.uid}/mentorNotes/${id}`).remove();
        }
    };

    const handleSaveEdit = (id) => {
        if (!editingNoteText.trim()) return;
        db.ref(`users/${student.uid}/mentorNotes/${id}/text`).set(editingNoteText.trim());
        setEditingNoteId(null);
        setEditingNoteText('');
    };

    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };



    const handleUpdateClass = (e) => {
        const newClassId = e.target.value;
        db.ref(`users/${student.uid}/profile/classId`).set(newClassId);
        student.profile.classId = newClassId; // Local update
        setForm({ ...form }); // Force render
    };

    const processGlobalTags = (topic, source, type) => {
        let newTopic = topic?.trim();
        let newSource = source?.trim();
        let newType = type?.trim();

        const updates = {};
        if (newTopic && !globalTags.topics.includes(newTopic)) updates.topics = [...globalTags.topics, newTopic];
        if (newSource && !globalTags.sources.includes(newSource)) updates.sources = [...globalTags.sources, newSource];
        if (newType && !globalTags.types.includes(newType)) updates.types = [...globalTags.types, newType];

        if (Object.keys(updates).length > 0) {
            db.ref('globalTags').set({ ...globalTags, ...updates });
        }
    };

    const handleAssignTask = () => {
        if (!form.topic && !form.title) return; // Allow either topic or title based on new format, form.title is fallback
        const targetK = form.assignDate ? form.assignDate : getDateKey(new Date());

        let finalTitle = '';
        if (form.title) {
            finalTitle = form.title;
        } else if (form.topic && form.source) {
            finalTitle = `${form.topic} - ${form.source}`;
        } else if (form.topic) {
            finalTitle = form.topic;
        } else if (form.source) {
            finalTitle = form.source;
        }

        // If amount is provided alongside unit (default to 'Birim')
        const amountSuffix = form.amount ? ` (${form.amount} ${form.unit || 'Birim'})` : '';
        const displayTitle = finalTitle + amountSuffix;

        const newTask = {
            id: Date.now(),
            title: displayTitle,
            duration: form.duration || '30',
            type: form.projectId ? 'project_slice' : 'simple',
            completed: false,
            isMentorTask: true,
            allowDelete: form.allowDelete === true,
            addedBy: 'mentor',
            topic: form.topic || null,
            source: form.source || null,
            typeStr: form.taskType || null,
            projectItemId: form.selectedProjectItemId || null
        };
        
        if (form.projectId) {
            newTask.pid = form.projectId;
            newTask.targetAmount = Number(form.amount) || 1;
            newTask.subItems = new Array(newTask.targetAmount).fill(false);
        }

        const currentTasks = (student.history && student.history[targetK] && student.history[targetK].tasks) || [];
        db.ref(`users/${student.uid}/history/${targetK}/tasks`).set([...currentTasks, newTask]);
        
        processGlobalTags(form.topic, form.source, form.taskType);

        setForm({ ...form, title: '', topic: '', source: '', taskType: '', duration: '', amount: '', unit: '', projectId: '' });
        alert(`${targetK} tarihine görev atandı!`);
    };

    const handleDeleteAssignedTask = (task) => {
        if (!confirm('Bu görevi iptal etmek istediğinize emin misiniz?')) return;
        const currentTasks = (student.history && student.history[task.assignedDateKey] && student.history[task.assignedDateKey].tasks) || [];
        const updatedTasks = currentTasks.filter(t => t.id !== task.id);
        db.ref(`users/${student.uid}/history/${task.assignedDateKey}/tasks`).set(updatedTasks);
    };

    const toggleStoreLock = () => {
        const newStatus = !student.profile.storeLocked;
        db.ref(`users/${student.uid}/profile/storeLocked`).set(newStatus);
        student.profile.storeLocked = newStatus;
        setForm({ ...form });
    };

    // INTERACTION LOGIC
    const handleInteraction = (type) => {
        let message = "";
        let goldReward = 0;
        let title = "";

        if (type === 'custom') {
            if (!form.customMsg) return;
            message = form.customMsg;
            goldReward = Number(form.goldAmount) || 0;
            title = "Mentorun Mesajı";
        } else if (type === 'celebrate') {
            message = form.msgPreset || "Harika iş çıkardın!";
            goldReward = 50;
            title = "Tebrikler! 🎉";
        } else if (type === 'motivate') {
            message = form.msgPreset || "Asla pes etme!";
            goldReward = 20;
            title = "Motivasyon 💪";
        }

        // Push notification
        const notifRef = db.ref(`users/${student.uid}/notifications`).push();
        notifRef.set({
            title,
            message,
            gold: goldReward,
            timestamp: Date.now(),
            type
        });

        // Update gold atomically
        if (goldReward > 0) {
            db.ref(`users/${student.uid}/gold`).transaction((currentGold) => {
                return (currentGold || 0) + goldReward;
            });
        }

        setForm({ ...form, customMsg: '', goldAmount: '' });
        alert('Etkileşim gönderildi!');
    };



    return (
        <div className="fixed inset-0 bg-white dark:bg-slate-800 z-50 flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 bg-gray-50 dark:bg-slate-700 rounded-full hover:bg-gray-100"><Icons.ChevronLeft /></button>
                    <div>
                        <h2 className="font-bold text-lg leading-tight flex items-center gap-2">{student.profile.name} <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 rounded-full border border-indigo-100">Öğrenci</span></h2>
                        <select className="text-xs text-gray-500 dark:text-slate-400 bg-transparent border-none outline-none p-0 cursor-pointer hover:text-indigo-600 transition" value={student.profile.classId || ''} onChange={handleUpdateClass}>
                            <option value="">Sınıf Seçilmedi</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
                    {['analysis', 'panel', 'management', 'interaction', 'notes'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`px-3 sm:px-4 py-2 rounded-md text-[10px] sm:text-xs font-bold transition uppercase whitespace-nowrap ${activeTab === t ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-gray-400 dark:text-slate-400'}`}>
                            {t === 'analysis' ? 'Analiz' : t === 'panel' ? 'Panel' : t === 'management' ? 'Yönetim' : t === 'interaction' ? 'Etkileşim' : '📝 Notlar'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-700 p-6">
                {activeTab === 'analysis' && (
                    <AnalysisView student={student} />
                )}

                {activeTab === 'panel' && (
                    <div className="max-w-md mx-auto">
                        <StudentSimulator studentId={student.uid} />
                    </div>
                )}

                {activeTab === 'management' && (
                    <div className="space-y-6 max-w-lg mx-auto">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <h3 className="font-bold text-gray-800 dark:text-slate-100 mb-1">🛡️ Zorunlu Görev Ata</h3>
                            <p className="text-xs text-gray-400 dark:text-slate-400 mb-4">Öğrencinin gününe görev ekle.</p>
                            <div className="space-y-3">
                                <div className="space-y-3">
                                    {/* Proje Seçimi */}
                                    <div className="relative">
                                        <select 
                                            className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-bold text-gray-700 dark:text-slate-200 outline-none border border-transparent appearance-none"
                                            value={form.projectId || ''} 
                                            onChange={e => {
                                                const pid = e.target.value;
                                                setForm({ ...form, projectId: pid, topic: '', source: '', taskType: '', amount: '', unit: 'Sayfa' });
                                            }}
                                        >
                                            <option value="">Öğrencinin Hedeflerinden Seç (Opsiyonel)</option>
                                            {(student.projects || []).map(p => (
                                                <option key={p.id} value={p.id}>{p.title}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                                    </div>
                                    
                                    {/* Görev Başlığı Input (Açıkça İstendi) */}
                                    <input className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm" placeholder="Görev Başlığı (Opsiyonel: Detaylı Belirtmek İstersen)" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />

                                    {/* Dinamik Konu Ağacı / Serbest Girdi */}
                                    {(() => {
                                        const selectedP = (student.projects || []).find(p => String(p.id) === String(form.projectId));
                                        const pItems = selectedP?.projectItems ? (Array.isArray(selectedP.projectItems) ? selectedP.projectItems : Object.values(selectedP.projectItems)) : [];
                                        
                                        if (selectedP && pItems.length > 0) {
                                            return (
                                                <div className="space-y-3">
                                                    <div className="relative">
                                                        <select 
                                                            className="w-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 p-3 rounded-xl text-sm font-bold outline-none border border-indigo-100 dark:border-indigo-500/30 appearance-none"
                                                            value={form.selectedProjectItemId || ''}
                                                            onChange={e => {
                                                                const idVal = e.target.value;
                                                                const item = pItems.find(i => String(i.id) === idVal);
                                                                if (item) {
                                                                    let autoTime = '';
                                                                    const remainingAmount = Math.max(0, Number(item.amount) - (Number(item.completedAmount) || 0));
                                                                    
                                                                    if (selectedP.totalEstTime && selectedP.totalUnit && remainingAmount) {
                                                                        const totalMinutes = Number(selectedP.totalEstTime) * 60;
                                                                        const timePerUnit = totalMinutes / Number(selectedP.totalUnit);
                                                                        if (!isNaN(timePerUnit) && isFinite(timePerUnit)) {
                                                                            autoTime = String(Math.round(timePerUnit * Number(remainingAmount)));
                                                                        }
                                                                    }
                                                                    setForm({ ...form, selectedProjectItemId: idVal, topic: item.topic || '', source: item.source || '', taskType: item.type || '', amount: remainingAmount > 0 ? String(remainingAmount) : '', unit: item.unit || selectedP.unit || '', duration: autoTime });
                                                                } else {
                                                                    setForm({ ...form, selectedProjectItemId: '', topic: '', source: '', taskType: '', duration: '', amount: '' });
                                                                }
                                                            }}
                                                        >
                                                            <option value="">Ağaçtan Konu / Kaynak Seçin</option>
                                                            {pItems.map(item => {
                                                                const rem = Math.max(0, Number(item.amount) - (Number(item.completedAmount) || 0));
                                                                return (
                                                                    <option key={item.id} value={item.id}>
                                                                        {[item.topic, item.source].filter(Boolean).join(' - ')} (Kalan: {rem} {item.unit || selectedP.unit})
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-xs">▼</div>
                                                    </div>
                                                    
                                                    {form.selectedProjectItemId && (
                                                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl border border-gray-100 dark:border-slate-600 focus-within:border-indigo-300 transition-colors">
                                                            <input 
                                                                type="number" 
                                                                className="flex-1 bg-transparent text-sm font-semibold outline-none text-gray-700 dark:text-slate-100" 
                                                                placeholder="Miktar (Sayfa/Soru)" 
                                                                value={form.amount || ''} 
                                                                onChange={e => {
                                                                    const reqAmt = e.target.value;
                                                                    let autoTime = form.duration;
                                                                    if (reqAmt && selectedP && selectedP.totalEstTime && selectedP.totalUnit) {
                                                                        const totalMins = Number(selectedP.totalEstTime) * 60;
                                                                        const minPerUnit = totalMins / Number(selectedP.totalUnit);
                                                                        if (!isNaN(minPerUnit) && isFinite(minPerUnit)) {
                                                                            autoTime = String(Math.round(minPerUnit * Number(reqAmt)));
                                                                        }
                                                                    }
                                                                    setForm({ ...form, amount: reqAmt, duration: autoTime });
                                                                }} 
                                                            />
                                                            {form.unit && <span className="text-xs font-bold text-gray-400 dark:text-slate-400 pl-2 border-l border-gray-200 dark:border-slate-600">{form.unit}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Serbest Girdi Tasarımı
                                        return (
                                            <div className="space-y-2">
                                                <input list="ms-topics" className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-100 outline-none border border-gray-100 dark:border-slate-600 focus:border-indigo-300" placeholder="Konu (Örn: Matematik)" value={form.topic || ''} onChange={e => setForm({ ...form, topic: e.target.value })} />
                                                <div className="flex gap-2">
                                                    <input list="ms-sources" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-100 outline-none border border-gray-100 dark:border-slate-600 focus:border-indigo-300" placeholder="Kaynak (Opsiyonel)" value={form.source || ''} onChange={e => setForm({ ...form, source: e.target.value })} />
                                                    <input list="ms-types" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-100 outline-none border border-gray-100 dark:border-slate-600 focus:border-indigo-300" placeholder="Tip (Örn: Test)" value={form.taskType || ''} onChange={e => setForm({ ...form, taskType: e.target.value })} />
                                                </div>
                                                <div className="flex gap-2">
                                                    <input type="number" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-100 outline-none border border-gray-100 dark:border-slate-600 focus:border-indigo-300" placeholder="Miktar" value={form.amount || ''} onChange={e => {
                                                        const reqAmt = e.target.value;
                                                        let autoTime = form.duration;
                                                        if (reqAmt && selectedP && selectedP.totalEstTime && selectedP.totalUnit) {
                                                            const totalMins = Number(selectedP.totalEstTime) * 60;
                                                            const minPerUnit = totalMins / Number(selectedP.totalUnit);
                                                            if (!isNaN(minPerUnit) && isFinite(minPerUnit)) {
                                                                autoTime = String(Math.round(minPerUnit * Number(reqAmt)));
                                                            }
                                                        }
                                                        setForm({ ...form, amount: reqAmt, duration: autoTime });
                                                    }} />
                                                    <input className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-100 outline-none border border-gray-100 dark:border-slate-600 focus:border-indigo-300" placeholder="Birim" value={form.unit || ''} onChange={e => setForm({ ...form, unit: e.target.value })} />
                                                </div>
                                                <datalist id="ms-topics">{(globalTags?.topics || []).map(t => <option key={t} value={t} />)}</datalist>
                                                <datalist id="ms-sources">{(globalTags?.sources || []).map(s => <option key={s} value={s} />)}</datalist>
                                                <datalist id="ms-types">{(globalTags?.types || []).map(t => <option key={t} value={t} />)}</datalist>
                                            </div>
                                        );
                                    })()}
                                    
                                </div>

                                <div className="flex gap-2 mt-3">
                                    <input type="number" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold" placeholder="Tahmini Süre (dk)" value={form.duration || ''} onChange={e => setForm({ ...form, duration: e.target.value })} />
                                    <input type="date" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm font-semibold" value={form.assignDate || ''} title="Tarih" onChange={e => setForm({ ...form, assignDate: e.target.value })} />
                                </div>

                                {/* Allow Delete Toggle */}
                                <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700 p-3 rounded-xl">
                                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400">Öğrenci Silebilir</span>
                                    <div onClick={() => setForm({ ...form, allowDelete: !form.allowDelete })} className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ${form.allowDelete ? 'bg-green-500' : 'bg-gray-300'}`}>
                                        <div className="w-4 h-4 bg-white dark:bg-slate-800 rounded-full shadow-sm transition-transform duration-300" style={{ transform: form.allowDelete ? 'translateX(16px)' : 'translateX(0)' }}></div>
                                    </div>
                                </div>

                                <button onClick={handleAssignTask} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">Görevi Kaydet</button>
                            </div>
                        </div>

                        {/* Mentor Tasks View */}
                        {(() => {
                            const allMentorTasks = [];
                            if (student.history) {
                                Object.entries(student.history).forEach(([dateKey, dayData]) => {
                                    if (dayData && dayData.tasks) {
                                        const rawTasks = Array.isArray(dayData.tasks) ? dayData.tasks : Object.values(dayData.tasks || {});
                                        const mTasks = rawTasks.filter(t => t && (t.addedBy === 'mentor' || t.isMentorTask));
                                        mTasks.forEach(t => {
                                            allMentorTasks.push({ ...t, assignedDateKey: dateKey });
                                        });
                                    }
                                });
                            }
                            
                            // Yeniden Eskiye sıralama (ID timestamp olduğu için doğrudan kullanılabilir)
                            allMentorTasks.sort((a, b) => Number(b.id) - Number(a.id));
                            
                            const displayedTasks = allMentorTasks.slice(0, visibleTaskCount);

                            return (
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                                            <span>📌</span>
                                            <span>Son Atadığım Görevler</span>
                                        </h3>
                                        <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-500/30 tracking-wider">
                                            {allMentorTasks.length} Görev Toplam
                                        </span>
                                    </div>
                                    
                                    {allMentorTasks.length === 0 ? (
                                        <div className="text-center py-8 text-xs text-gray-400 dark:text-slate-500 italic border-2 border-dashed border-gray-100 dark:border-slate-700 rounded-xl">
                                            Henüz hiçbir görev atamadınız.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {displayedTasks.map(t => (
                                                <div key={`${t.assignedDateKey}-${t.id}`} className="relative bg-gray-50 dark:bg-slate-700 p-4 rounded-xl border border-gray-100 dark:border-slate-600 flex flex-col gap-2 group transition-all hover:border-gray-200 dark:hover:border-slate-500 shadow-sm pt-5">
                                                    
                                                    {/* Okunabilir Tarih Etiketi */}
                                                    <div className="absolute top-0 right-0 bg-indigo-100/60 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl border-b border-l border-indigo-200 dark:border-indigo-500/30 tracking-wide shadow-sm">
                                                        {new Date(t.assignedDateKey).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}
                                                    </div>

                                                    <div className="flex justify-between items-start pr-8 mt-1">
                                                        <div className="flex-1">
                                                            <div className="font-bold text-sm text-gray-800 dark:text-slate-100 leading-tight pr-4">
                                                                {t.title}
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 flex items-center gap-2 font-medium">
                                                                <span>⏱️ {t.duration} dk</span>
                                                                {t.type === 'project_slice' && t.targetAmount && (
                                                                    <span>• 🎯 {t.targetAmount} adet</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 pt-0.5">
                                                            {t.completed ? (
                                                                <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-green-200 dark:border-green-500/30 flex items-center gap-1">
                                                                    ✅ Tamamlandı
                                                                </span>
                                                            ) : (
                                                                <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-200 dark:border-orange-500/30 flex items-center gap-1">
                                                                    ⏳ Bekliyor
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={() => handleDeleteAssignedTask(t)}
                                                        className="absolute top-1/2 -translate-y-1/2 right-3 p-2 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                        title="Görevi İptal Et"
                                                    >
                                                        <Icons.Trash />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Daha Fazla Göster Butonu */}
                                            {visibleTaskCount < allMentorTasks.length && (
                                                <button 
                                                    onClick={() => setVisibleTaskCount(prev => prev + 5)}
                                                    className="w-full mt-2 py-3 border-2 border-dashed border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 font-bold text-xs rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <span className="text-lg leading-none">↓</span> Daha Fazla Göster
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800 dark:text-slate-100">🛍️ Mağaza Kilidi (Detox)</h3>
                                <p className="text-xs text-gray-400 dark:text-slate-400">Aktif edilirse öğrenci mağazaya erişemez.</p>
                            </div>
                            <div onClick={toggleStoreLock} className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors duration-300 ${student.profile.storeLocked ? 'bg-red-500' : 'bg-gray-200'}`}>
                                <div className="w-6 h-6 bg-white dark:bg-slate-800 rounded-full shadow-sm transition-transform duration-300" style={{ transform: student.profile.storeLocked ? 'translateX(24px)' : 'translateX(0)' }}></div>
                            </div>
                        </div>

                    </div>
                )}

                {activeTab === 'interaction' && (
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 max-w-lg mx-auto">
                        <h3 className="font-bold text-gray-800 dark:text-slate-100 text-lg mb-6 text-center">Etkileşim Seç</h3>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <button onClick={() => setForm({ ...form, type: 'celebrate', msgPreset: "Harika iş çıkardın!" })} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition ${form.type === 'celebrate' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 dark:border-slate-700 hover:border-gray-200'}`}>
                                <div className="text-4xl">🎉</div>
                                <div className="font-bold text-sm">Kutla</div>
                                <div className="text-[10px] bg-yellow-200 px-2 py-0.5 rounded-full text-yellow-800">+50 Altın</div>
                            </button>
                            <button onClick={() => setForm({ ...form, type: 'motivate', msgPreset: "Asla pes etme!" })} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition ${form.type === 'motivate' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 dark:border-slate-700 hover:border-gray-200'}`}>
                                <div className="text-4xl">💪</div>
                                <div className="font-bold text-sm">Motive Et</div>
                                <div className="text-[10px] bg-indigo-200 px-2 py-0.5 rounded-full text-indigo-800">+20 Altın</div>
                            </button>
                        </div>

                        {form.type && (
                            <div className="animation-fade-in space-y-4">
                                <div className="text-xs font-bold text-gray-400 dark:text-slate-400 uppercase">MESAJ SEÇ</div>
                                <div className="flex flex-wrap gap-2">
                                    {(form.type === 'celebrate' ?
                                        ["Harika iş çıkardın!", "Bu azimle devam et!", "Gurur duydum!", "Efsane performans!", "Tam gaz ileri!"] :
                                        ["Asla pes etme!", "Potansiyelin çok yüksek!", "Biraz daha gayret!", "Hedefine çok yakınsın!", "Bugün senin günün!"]
                                    ).map(msg => (
                                        <button key={msg} onClick={() => setForm({ ...form, msgPreset: msg })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${form.msgPreset === msg ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-gray-300'}`}>{msg}</button>
                                    ))}
                                </div>
                                <button onClick={() => handleInteraction(form.type)} className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold shadow-lg mt-2">Gönder</button>
                            </div>
                        )}

                        <div className="relative flex py-5 items-center"><div className="flex-grow border-t border-gray-200 dark:border-slate-700"></div><span className="flex-shrink-0 mx-4 text-gray-400 dark:text-slate-400 text-xs font-bold uppercase">VEYA</span><div className="flex-grow border-t border-gray-200 dark:border-slate-700"></div></div>

                        <div className="space-y-3">
                            <input placeholder="Özel Mesajın..." className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl border border-gray-200 dark:border-slate-700" value={form.customMsg || ''} onChange={e => setForm({ ...form, customMsg: e.target.value })} />
                            <input type="number" placeholder="Altın Miktarı (Opsiyonel)" className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl border border-gray-200 dark:border-slate-700" value={form.goldAmount || ''} onChange={e => setForm({ ...form, goldAmount: e.target.value })} />
                            <button onClick={() => handleInteraction('custom')} className="w-full border-2 border-dashed border-gray-300 text-gray-400 dark:text-slate-400 py-3 rounded-xl font-bold hover:border-gray-400 hover:text-gray-600">Özel Mesaj Gönder</button>
                        </div>
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        {/* Not Ekleme Kutusu */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <h3 className="font-bold text-gray-700 dark:text-slate-200 text-sm mb-3">📝 Yeni Not Ekle</h3>
                            <textarea
                                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                                rows={4}
                                placeholder="Öğrenciyle yapılan görüşme detayları, psikolojik durumu veya hedefleri..."
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                            />
                            <div className="flex items-center gap-3 mt-3">
                                <div className="flex items-center gap-2 flex-1">
                                    <label className="text-xs font-bold text-gray-400 dark:text-slate-400 whitespace-nowrap">🗓️ Tarih:</label>
                                    <input
                                        type="date"
                                        className="flex-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                        value={noteDate}
                                        onChange={e => setNoteDate(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={handleSaveNote}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
                                >Notu Kaydet</button>
                            </div>
                        </div>

                        {/* Not Listesi */}
                        {mentorNotes.length === 0 ? (
                            <div className="text-center py-12 text-gray-300 dark:text-slate-600">
                                <div className="text-4xl mb-2">📋</div>
                                <div className="text-sm font-medium">Henüz not eklenmemiş.</div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {mentorNotes.map(note => (
                                    <div key={note.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-50 dark:border-slate-700">
                                            <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
                                                🗓️ {new Date(note.date).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}
                                                    className="p-1.5 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                                                    title="Düzenle"
                                                >📝</button>
                                                <button
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                                                    title="Sil"
                                                >🗑️</button>
                                            </div>
                                        </div>
                                        <div className="px-4 py-3">
                                            {editingNoteId === note.id ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        className="w-full bg-gray-50 dark:bg-slate-700 border border-indigo-300 dark:border-indigo-500 rounded-xl p-3 text-sm text-gray-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                                                        rows={3}
                                                        value={editingNoteText}
                                                        onChange={e => setEditingNoteText(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 rounded-lg border border-gray-200 dark:border-slate-600 transition">İptal</button>
                                                        <button onClick={() => handleSaveEdit(note.id)} className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Kaydet</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
