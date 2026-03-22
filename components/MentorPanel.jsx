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
                                        {radarStudents.length > 0 ? radarStudents.slice(0, 5).map(s => {
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
                                    </div>
                                </div>

                                {/* Sütun 3: Hayaletler */}
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-red-400 to-rose-500"></div>
                                    <div className="p-4">
                                        <h3 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">👻 Hayaletler</h3>
                                        {ghostStudents.length > 0 ? ghostStudents.slice(0, 5).map(s => (
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
                                    </div>
                                </div>
                            </div>
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
    const selectedDayData = (student.history && student.history[selectedDateKey]) || { tasks: [], habits: [] };
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
                        const mood = student.history && student.history[k] && student.history[k].journal ? student.history[k].journal.mood : '•';
                        return <div key={i} className="text-center text-xs opacity-50 grayscale">{mood}</div>
                    })}
                </div>

                <div className="grid grid-cols-10 gap-1 sm:gap-2">
                    {daysList.map((d, i) => {
                        const k = getDateKey(d);
                        const dayData = student.history && student.history[k];
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
                        {selectedDayData.tasks.filter(t => t.completed || (t.subItems && t.subItems.some(Boolean))).map((t, idx) => {
                            const isPartial = !t.completed && t.subItems && t.subItems.some(Boolean);
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

                            // Use Global Logic
                            const status = getStatusInfo(percent, true);

                            return (
                                <div key={idx}
                                    className="flex justify-between items-center p-3 rounded-lg transition"
                                    style={{
                                        backgroundColor: status.color,
                                        color: status.textColor
                                    }}
                                >
                                    <span className="text-sm font-medium">
                                        {t.isMentorTask && '🛡️ '}
                                        {t.title}
                                        {isPartial && <span className="text-xs font-bold opacity-75 ml-1">{progressText}</span>}
                                    </span>
                                    <span className="text-xs font-bold">{displayDuration}dk</span>
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
                        const hist = student.history && student.history[k];
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
            newTask = { id: Date.now(), title: form.title, type: 'simple', completed: false, duration: form.time || '30', startTime: form.startTime || '' };
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
                duration: String(calculatedDuration), startTime: form.startTime || ''
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
        const updatedTasks = currentDayData.tasks.map(t => t.id === taskId ? { ...t, completed: newStatus } : t);
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
            if (t.id === taskId) return { ...t, subItems: newSubItems, completed: allDone };
            return t;
        });
        updateCloud(`history/${dateKey}/tasks`, updatedTasks);
    };

    const deleteTask = (id) => {
        const tasks = currentDayData.tasks || [];
        // Mentor can always delete in simulator
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
                />
            </div>
        </div>
    );
};

const StudentDetailModal = ({ student, classes, onClose }) => {
    const [activeTab, setActiveTab] = useState('analysis');
    const [form, setForm] = useState({});

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

    const handleAssignTask = () => {
        if (!form.title) return;
        // Use selected date from input OR today if not present
        const targetK = form.assignDate ? form.assignDate : getDateKey(new Date());

        const newTask = {
            id: Date.now(),
            title: form.title,
            duration: form.duration || '30',
            type: 'simple',
            completed: false,
            isMentorTask: true,
            allowDelete: form.allowDelete === true // Explicitly save permissions
        };

        const currentTasks = (student.history && student.history[targetK] && student.history[targetK].tasks) || [];
        db.ref(`users/${student.uid}/history/${targetK}/tasks`).set([...currentTasks, newTask]);
        setForm({ ...form, title: '', duration: '' });
        alert(`${targetK} tarihine görev atandı!`);
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
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {['analysis', 'panel', 'management', 'interaction'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`px-3 sm:px-4 py-2 rounded-md text-[10px] sm:text-xs font-bold transition uppercase ${activeTab === t ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600' : 'text-gray-400 dark:text-slate-400'}`}>
                            {t === 'analysis' ? 'Analiz' : t === 'panel' ? 'Panel' : t === 'management' ? 'Yönetim' : 'Etkileşim'}
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
                                <input className="w-full bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm" placeholder="Görev Başlığı" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
                                <div className="flex gap-2">
                                    <input type="number" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm" placeholder="Süre (dk)" value={form.duration || ''} onChange={e => setForm({ ...form, duration: e.target.value })} />
                                    <input type="date" className="flex-1 bg-gray-50 dark:bg-slate-700 p-3 rounded-xl text-sm" value={form.assignDate || ''} onChange={e => setForm({ ...form, assignDate: e.target.value })} />
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
            </div>
        </div>
    );
};
