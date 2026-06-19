// --- SharedComponents.jsx ---
// Shared UI components and utility screens used across the app.
// Includes: ProjectAnalyticsChart, PairingCodeCard, ParentDashboard,
//           ErrorBoundary, MaintenanceScreen, SuspendedScreen
// No import/export — CDN Babel global scope.
// Depends on globals: db, auth, React, useState, useEffect, Icons

// --- ANALYTICS CHART COMPONENT ---
const ProjectAnalyticsChart = ({ student }) => {
    const canvasRef = React.useRef(null);
    const [range, setRange] = React.useState('1m'); // 1w, 1m, 3m, 6m
    const [metric, setMetric] = React.useState('cumulative'); // 'cumulative' | 'velocity'
    const [chartOffset, setChartOffset] = React.useState(0); // 0 = current, -1 = prev window
    const [activeFilter, setActiveFilter] = React.useState('ALL'); // 'ALL' | project.id
    const chartInstance = React.useRef(null);

    const colors = ['#818cf8', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];

    React.useEffect(() => { setChartOffset(0); }, [range]);

    React.useEffect(() => {
        if (!student || !student.projects || student.projects.length === 0) return;
        const ctx = canvasRef.current.getContext('2d');

        const getDateKey = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        let days = 30;
        if (range === '1w') days = 7;
        if (range === '1m') days = 30;
        if (range === '3m') days = 90;
        if (range === '6m') days = 180;
        if (range === '1y') days = 365;

        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + (chartOffset * days));
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);

        const labels = [];
        const projectData = {};

        student.projects.forEach((p, i) => {
            projectData[p.id] = {
                id: p.id,
                label: p.title,
                data: [],
                rawValues: [],
                totalUnit: Number(p.totalUnit) || 100,
                unit: p.unit || 'br',
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '20',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHitRadius: 15,
                tension: 0.4,
                currentRawTotal: 0
            };
        });

        const allDates = [];
        const iterator = new Date(startDate);
        while (iterator <= endDate) {
            allDates.push(new Date(iterator));
            iterator.setDate(iterator.getDate() + 1);
        }

        const calculateTaskGain = (task) => {
            if (task.subItems && Array.isArray(task.subItems)) {
                return task.subItems.filter(Boolean).length;
            }
            if (task.completed) return Number(task.targetAmount) || 1;
            return 0;
        };

        const projectInitialTotals = {};
        student.projects.forEach(p => projectInitialTotals[p.id] = 0);

        if (metric === 'cumulative') {
            const startKey = getDateKey(startDate);
            const historyKeys = Object.keys(student.history || {}).sort();
            historyKeys.forEach(k => {
                if (k < startKey) {
                    const dayData = student.history[k];
                    if (dayData && dayData.tasks) {
                        student.projects.forEach(p => {
                            const gained = dayData.tasks
                                .filter(t => String(t.pid).replace("ID_", "") === String(p.id).replace("ID_", ""))
                                .reduce((acc, t) => acc + calculateTaskGain(t), 0);
                            projectInitialTotals[p.id] += gained;
                        });
                    }
                }
            });
        }

        student.projects.forEach(p => {
            projectData[p.id].currentRawTotal = projectInitialTotals[p.id] + (Number(p.initialUnit) || 0);
        });

        allDates.forEach(date => {
            const k = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
            labels.push(date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
            const dayData = (student.history && student.history[k]) ? student.history[k] : { tasks: [] };
            student.projects.forEach(p => {
                const gainedToday = (dayData.tasks || [])
                    .filter(t => String(t.pid).replace("ID_", "") === String(p.id).replace("ID_", ""))
                    .reduce((acc, t) => acc + calculateTaskGain(t), 0);
                projectData[p.id].currentRawTotal += gainedToday;
                if (metric === 'cumulative') {
                    const pct = Math.min(100, (projectData[p.id].currentRawTotal / projectData[p.id].totalUnit) * 100);
                    projectData[p.id].data.push(pct);
                    projectData[p.id].rawValues.push(projectData[p.id].currentRawTotal);
                } else {
                    const dailyPct = (gainedToday / projectData[p.id].totalUnit) * 100;
                    projectData[p.id].data.push(dailyPct);
                    projectData[p.id].rawValues.push(gainedToday);
                }
            });
        });

        let filteredDatasets = Object.values(projectData);
        if (activeFilter !== 'ALL') {
            if (activeFilter.startsWith('CAT_DETAILS_')) {
                const cat = activeFilter.replace('CAT_DETAILS_', '');
                filteredDatasets = filteredDatasets.filter(ds => {
                    const p = student.projects.find(proj => proj.id === ds.id);
                    return p && p.category === cat;
                });
            } else if (activeFilter.startsWith('CAT_')) {
                const cat = activeFilter.replace('CAT_', '');
                const projsInCat = student.projects.filter(p => p.category === cat);
                const dsIds = projsInCat.map(p => p.id);
                const relatedDs = filteredDatasets.filter(ds => dsIds.includes(ds.id));
                
                if (relatedDs.length > 0) {
                    const aggData = [];
                    for (let i = 0; i < allDates.length; i++) {
                        let sum = 0;
                        relatedDs.forEach(ds => { sum += ds.data[i] || 0; });
                        aggData.push(sum / relatedDs.length);
                    }
                    
                    filteredDatasets = [{
                        id: `AGG_${cat}`,
                        label: `${cat} (Genel Ort.)`,
                        data: aggData,
                        rawValues: aggData,
                        totalUnit: 100,
                        unit: '%',
                        borderColor: '#8b5cf6',
                        backgroundColor: '#8b5cf620',
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHitRadius: 15,
                        tension: 0.4
                    }];
                } else {
                    filteredDatasets = [];
                }
            } else {
                filteredDatasets = filteredDatasets.filter(ds => String(ds.id).replace("ID_", "") === String(activeFilter).replace("ID_", ""));
            }
        }

        if (chartInstance.current) chartInstance.current.destroy();

        let yMin = 0;
        let yMax = 100;

        if (metric === 'cumulative') {
            let startValue = 100;
            let hasData = false;
            filteredDatasets.forEach(ds => {
                if (ds.data.length > 0) { const val = ds.data[0]; if (val < startValue) startValue = val; hasData = true; }
            });
            if (!hasData) startValue = 0;
            let currentMax = 0;
            filteredDatasets.forEach(ds => { const dsMax = Math.max(...ds.data); if (dsMax > currentMax) currentMax = dsMax; });
            let baseRange = 15;
            if (range === '1w') baseRange = 5;
            if (range === '1m') baseRange = 15;
            if (range === '3m') baseRange = 40;
            if (range === '6m') baseRange = 80;
            if (range === '1y') baseRange = 100;
            const actualDelta = currentMax - startValue;
            let targetRange = baseRange;
            let attempts = 0;
            while (actualDelta > targetRange && attempts < 50) { targetRange = targetRange * 1.2; attempts++; }
            yMin = startValue;
            yMax = Math.min(startValue + targetRange, 100);
        } else {
            yMax = undefined;
        }

        filteredDatasets.forEach(ds => { if (metric === 'velocity') ds.fill = true; });

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: filteredDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                scales: {
                    y: { beginAtZero: metric === 'velocity', min: yMin, max: yMax, suggestedMax: metric === 'velocity' ? 12 : undefined, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' }, border: { display: false } },
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' }, border: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937', titleColor: '#f3f4f6', bodyColor: '#d1d5db',
                        callbacks: { label: (ctx) => { const dataset = ctx.dataset; const raw = dataset.rawValues[ctx.dataIndex]; return `${dataset.label}: ${Math.round(raw)}/${dataset.totalUnit} ${dataset.unit}`; } }
                    }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [student, range, metric, chartOffset, activeFilter]);

    if (!student.projects || student.projects.length === 0) return <div className="p-8 text-center text-gray-400 text-xs">Analiz için aktif hedef bulunamadı.</div>;

    return (
        <div className="bg-gray-900 p-5 rounded-3xl shadow-2xl border border-gray-800">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        GELİSİM GRAFİKLERİ
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setMetric('cumulative')} className={`text-xs font-bold px-4 py-1.5 rounded-xl transition ${metric === 'cumulative' ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>İlerleme</button>
                        <button onClick={() => setMetric('velocity')} className={`text-xs font-bold px-4 py-1.5 rounded-xl transition ${metric === 'velocity' ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Hız</button>
                    </div>
                </div>
                <div className="flex bg-gray-800 rounded-lg p-1 items-center">
                    <button onClick={() => setChartOffset(c => c - 1)} className="px-4 py-2 text-gray-400 hover:text-white transition">←</button>
                    {['1w', '1m', '3m', '6m', '1y'].map(r => (
                        <button key={r} onClick={() => setRange(r)} className={`px-8 py-2 text-xs font-bold rounded-md transition ${range === r ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>{r.toUpperCase()}</button>
                    ))}
                    <button disabled={chartOffset === 0} onClick={() => setChartOffset(c => c + 1)} className={`px-4 py-2 transition ${chartOffset === 0 ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}>→</button>
                </div>
            </div>
            <div className="relative h-[500px] w-full mb-4"><canvas ref={canvasRef} /></div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 border-t border-gray-800/50 pt-4">
                <button onClick={() => setActiveFilter('ALL')} className={`flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                    <span className="text-lg leading-3">⌘</span> Tümü
                </button>
                
                {(() => {
                    const categories = [...new Set(student.projects.map(p => p.category).filter(Boolean))];
                    return (
                        <>
                            {categories.map((cat) => {
                                const isActive = activeFilter === `CAT_${cat}`;
                                return (
                                    <button key={`CAT_${cat}`} onClick={() => setActiveFilter(`CAT_${cat}`)}
                                        className={`flex-none px-4 py-2 rounded-lg text-xs font-bold transition border border-transparent ${isActive ? 'bg-purple-900/50 text-purple-300 ring-1 ring-purple-500/50' : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700'}`}
                                    >
                                        📁 {cat} (Genel)
                                    </button>
                                );
                            })}
                            {categories.map((cat) => {
                                const isActive = activeFilter === `CAT_DETAILS_${cat}`;
                                return (
                                    <button key={`CAT_DETAILS_${cat}`} onClick={() => setActiveFilter(`CAT_DETAILS_${cat}`)}
                                        className={`flex-none px-4 py-2 rounded-lg text-xs font-bold transition border border-transparent ${isActive ? 'bg-blue-900/50 text-blue-300 ring-1 ring-blue-500/50' : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700'}`}
                                    >
                                        📑 {cat} (İçerikli)
                                    </button>
                                );
                            })}
                        </>
                    );
                })()}

                {student.projects.map((p, i) => {
                    const color = colors[i % colors.length];
                    const isActive = activeFilter === p.id;
                    return (
                        <button key={p.id} onClick={() => setActiveFilter(p.id)}
                            className={`flex-none px-4 py-2 rounded-lg text-xs font-bold transition border border-transparent ${isActive ? 'bg-gray-800 text-white' : 'bg-gray-800/50 text-gray-500 hover:bg-gray-800'}`}
                            style={{ borderColor: isActive ? color : 'transparent', color: isActive ? color : undefined, boxShadow: isActive ? `0 0 15px ${color}10` : 'none' }}
                        >
                            <span style={{ backgroundColor: color }} className="w-1.5 h-1.5 rounded-full inline-block mr-2"></span>
                            {p.title}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// --- RADAR ÇİZELGESİ (StudentRadarChart) ---

const StudentRadarChart = ({ student, selectedItems }) => {
    const canvasRef = React.useRef(null);
    const chartInstance = React.useRef(null);

    React.useEffect(() => {
        if (!student || !student.projects || !selectedItems || selectedItems.length === 0) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        const labels = [];
        const rawTarget = [];
        const dataPerformance = [];

        // Pre-calculate category aggregates just in case
        const categories = {};
        student.projects.forEach(p => {
            const cat = p.category || 'Serbest Hedefler';
            if (!categories[cat]) categories[cat] = { totalEstTime: 0, completedEstTime: 0 };

            const pTotalUnit = Number(p.totalUnit) || 1;
            const pCurrentUnit = Number(p.currentUnit) || 0;
            const pTotalEstTime = Number(p.totalEstTime) || 0;
            const pCompletedEstTime = (pCurrentUnit / pTotalUnit) * pTotalEstTime;

            categories[cat].totalEstTime += pTotalEstTime;
            categories[cat].completedEstTime += pCompletedEstTime;
        });

        // Collect data in order of selection or just by selection existence
        selectedItems.forEach(itemId => {
            if (itemId.startsWith('c_')) {
                const catName = itemId.substring(2);
                if (categories[catName]) {
                    labels.push(catName);
                    const totalTime = categories[catName].totalEstTime;
                    const completedTime = categories[catName].completedEstTime;
                    rawTarget.push(totalTime);
                    const percent = totalTime === 0 ? 0 : Math.min(100, Math.round((completedTime / totalTime) * 100));
                    dataPerformance.push(percent);
                }
            } else if (itemId.startsWith('p_')) {
                const pId = itemId.substring(2);
                const p = student.projects.find(proj => String(proj.id) === String(pId));
                if (p) {
                    labels.push(p.title);
                    const pTotalUnit = Number(p.totalUnit) || 1;
                    const pCurrentUnit = Number(p.currentUnit) || 0;
                    const pTotalEstTime = Number(p.totalEstTime) || 0;
                    const pCompletedEstTime = (pCurrentUnit / pTotalUnit) * pTotalEstTime;

                    rawTarget.push(pTotalEstTime);
                    const percent = pTotalEstTime === 0 ? 0 : Math.min(100, Math.round((pCompletedEstTime / pTotalEstTime) * 100));
                    dataPerformance.push(percent);
                }
            }
        });

        if (labels.length < 3) {
            while (labels.length < 3) {
                labels.push('');
                rawTarget.push(0);
                dataPerformance.push(0);
            }
        }

        // --- YENİ ALGORİTMA: Göreli İş Yükü (Relative Workload) ---
        // Radardaki en yüksek süreli hedefe 100 diyip diğerlerini ona göre orantılıyoruz.
        const maxTime = Math.max(...rawTarget, 1);
        const dataTarget = rawTarget.map(t => Math.round((t / maxTime) * 100));

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        chartInstance.current = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'İş Yükü Boyutu (Süre)',
                        data: dataTarget,
                        borderColor: 'rgba(99, 102, 241, 0.4)', // border-indigo-500
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                    {
                        label: 'Başarı / Tamamlanma',
                        data: dataPerformance,
                        borderColor: 'rgba(168, 85, 247, 1)', // border-purple-500
                        backgroundColor: 'rgba(168, 85, 247, 0.4)',
                        borderWidth: 3,
                        pointBackgroundColor: '#a855f7',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#a855f7',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(156, 163, 175, 0.2)' },
                        grid: { color: 'rgba(156, 163, 175, 0.2)' },
                        pointLabels: {
                            color: '#9ca3af',
                            font: { size: 10, family: "'Inter', sans-serif", weight: 'bold' }
                        },
                        min: 0,
                        max: 100,
                        ticks: { stepSize: 20, display: false }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#9ca3af', font: { size: 11, family: "'Inter', sans-serif" }, padding: 15 }
                    },
                    tooltip: {
                        backgroundColor: '#1f2937', titleColor: '#f3f4f6', bodyColor: '#d1d5db',
                        callbacks: {
                            label: function (context) {
                                if (context.datasetIndex === 0) {
                                    // rawTarget dizisinden o öğenin ham dakikasını çekiyoruz
                                    const mins = rawTarget[context.dataIndex];
                                    return `Zaman Hacmi: ${mins} dk (Göreli: %${context.parsed.r})`;
                                } else {
                                    return `Tamamlanma Oranı: %${context.parsed.r}`;
                                }
                            }
                        }
                    }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [student, selectedItems]);

    if (!selectedItems || selectedItems.length === 0) {
        return <div className="p-8 text-center text-gray-400 text-sm">Radarda göstermek için klasör veya hedef seçin.</div>;
    }

    return (
        <div className="bg-gray-50 dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-2">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                    YETENEK RADARI
                </div>
            </div>
            <div className="relative h-72 w-full">
                <canvas ref={canvasRef} />
            </div>
        </div>
    );
};

// --- VELİ BİLEŞENLERİ ---

const PairingCodeCard = ({ userId, existingCode, updateCloud }) => {
    const [code, setCode] = React.useState(existingCode || null);
    const [generating, setGenerating] = React.useState(false);

    const generateCode = async () => {
        setGenerating(true);
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let newCode = '';
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 20) {
            newCode = '';
            for (let i = 0; i < 6; i++) { newCode += chars.charAt(Math.floor(Math.random() * chars.length)); }
            const snap = await db.ref('users').orderByChild('pairingCode').equalTo(newCode).once('value');
            isUnique = !snap.exists();
            attempts++;
        }
        if (isUnique) {
            await db.ref(`users/${userId}/pairingCode`).set(newCode);
            setCode(newCode);
        } else {
            alert('Kod üretilemedi, lütfen tekrar deneyin.');
        }
        setGenerating(false);
    };

    React.useEffect(() => { if (!code && !generating) { generateCode(); } }, []);

    if (!code) return <div className="text-amber-600 text-sm text-center py-2">{generating ? 'Kod üretiliyor...' : ''}</div>;

    return (
        <div className="text-center">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-amber-200 shadow-sm">
                <div className="text-3xl font-mono font-black tracking-[0.4em] text-amber-800 select-all">{code}</div>
            </div>
            <p className="text-amber-600/70 text-[10px] mt-3 leading-relaxed">
                Velin bu kodu kayıt ekranında "Veli" seçeneğiyle girecek.<br />
                Böylece senin ilerleme analizini takip edebilecek.
            </p>
        </div>
    );
};

const ParentDashboard = ({ currentUser }) => {
    const [student, setStudent] = React.useState(null);
    const [parentProfile, setParentProfile] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const profileRef = db.ref(`users/${currentUser.uid}/profile`);
        profileRef.on('value', (snap) => { setParentProfile(snap.val()); });
        return () => profileRef.off('value');
    }, [currentUser.uid]);

    React.useEffect(() => {
        if (!parentProfile?.linkedStudentId) return;
        const studentRef = db.ref(`users/${parentProfile.linkedStudentId}`);
        const handler = (snap) => {
            const val = snap.val();
            if (val) { setStudent({ uid: snap.key, id: snap.key, ...val, projects: val.projects || [], history: val.history || {} }); }
            setLoading(false);
        };
        studentRef.on('value', handler);
        return () => studentRef.off('value', handler);
    }, [parentProfile?.linkedStudentId]);

    if (loading) return <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400">Yükleniyor...</div>;

    if (!student) return (
        <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-700">
            <div className="text-center p-8">
                <div className="text-5xl mb-4">⚠️</div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">Öğrenci Bulunamadı</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm mb-6">Bağlı öğrenci verisi yüklenemedi.</p>
                <button onClick={() => auth.signOut()} className="text-red-500 text-sm font-bold hover:underline">Çıkış Yap</button>
            </div>
        </div>
    );

    const studentName = student.profile?.name || 'Öğrenci';

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-700">
            <div className="bg-white dark:bg-slate-800 p-6 shadow-sm border-b border-gray-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">👨‍👩‍👧</span>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{studentName}</h1>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Veli Paneli</span>
                        </div>
                        <p className="text-gray-400 dark:text-slate-400 text-xs ml-10">Anlık ilerleme takibi</p>
                    </div>
                    <button onClick={() => auth.signOut()} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition">ÇIKIŞ</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 pb-24">
                <AnalysisView student={student} />
            </div>
        </div>
    );
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) { return { hasError: true }; }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 text-red-900 h-screen overflow-auto font-mono text-sm">
                    <h1 className="text-2xl font-bold mb-4">Uygulama Hatası (Crash)</h1>
                    <p className="mb-2">Bir hata oluştu ve uygulama durduruldu.</p>
                    <div className="bg-red-100 p-4 rounded mb-4 overflow-auto border border-red-200">
                        <strong className="block mb-2">Hata Mesajı:</strong>
                        {this.state.error && this.state.error.toString()}
                    </div>
                    <div className="bg-gray-100 p-4 rounded overflow-auto border border-gray-200 dark:border-slate-700 h-96">
                        <strong className="block mb-2">Stack Trace:</strong>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </div>
                    <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                        Sayfayı Yenile
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- MAINTENANCE MODE SCREEN ---
function MaintenanceScreen() {
    return (
        <div className="h-full flex items-center justify-center p-8" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)' }}>
            <div className="text-center max-w-md">
                <div className="text-7xl mb-6 animate-pulse">🛠️</div>
                <h1 className="text-2xl font-extrabold mb-3" style={{ color: '#e5e5e5' }}>Bakım Modu Aktif</h1>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#555' }}>
                    Uygulama şu an bakımdadır. Sistem güncellemeleri yapılıyor, lütfen daha sonra tekrar deneyin.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: '#1a1a1a', color: '#444', border: '1px solid #222' }}>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Tahmini süre: Kısa süre içinde
                </div>
            </div>
        </div>
    );
}

// --- SUSPENDED SCREEN ---
function SuspendedScreen() {
    return (
        <div className="h-full flex items-center justify-center p-8" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)' }}>
            <div className="text-center max-w-md">
                <div className="text-7xl mb-6">⏸️</div>
                <h1 className="text-2xl font-extrabold mb-3" style={{ color: '#e5e5e5' }}>Hesabınız Askıya Alındı</h1>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#555' }}>
                    Hesabınız geçici olarak askıya alınmıştır. Lütfen yöneticinizle iletişime geçin.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: '#1a1a1a', color: '#444', border: '1px solid #222' }}>
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Erişim engellendi
                </div>
            </div>
        </div>
    );
}
