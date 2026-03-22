// --- ADMIN PANEL (GOD MODE) ---
// Extracted from index.html. Uses global: db, auth, React

function AdminPanel({ user, isMaintenanceMode, setIsMaintenanceMode, onLogout, onImpersonate }) {
    const [allUsers, setAllUsers] = React.useState([]);
    const [totalFocusHours, setTotalFocusHours] = React.useState(0);
    const [deleteModal, setDeleteModal] = React.useState(null); // { user, role }
    const [reqStudentApproval, setReqStudentApproval] = React.useState(false);
    const [reqMentorApproval, setReqMentorApproval] = React.useState(false);

    // Listen to approval flags
    React.useEffect(() => {
        const sRef = db.ref('system/requireStudentApproval');
        const mRef = db.ref('system/requireMentorApproval');
        sRef.on('value', snap => setReqStudentApproval(snap.val() === true));
        mRef.on('value', snap => setReqMentorApproval(snap.val() === true));
        return () => { sRef.off(); mRef.off(); };
    }, []);

    React.useEffect(() => {
        const usersRef = db.ref('users');
        usersRef.on('value', (snap) => {
            const data = snap.val() || {};
            const userList = Object.entries(data).map(([uid, val]) => ({ uid, ...val }));
            setAllUsers(userList);

            // Calculate total focus hours from all users' history
            let totalMin = 0;
            userList.forEach(u => {
                const hist = u.history || {};
                Object.values(hist).forEach(day => {
                    (day.tasks || []).forEach(t => {
                        if (t.completed) totalMin += Number(t.duration) || 0;
                    });
                });
            });
            setTotalFocusHours((totalMin / 60).toFixed(0));
        });
        return () => usersRef.off();
    }, []);

    const studentCount = allUsers.filter(u => u.profile?.role === 'student').length;
    const mentorCount = allUsers.filter(u => u.profile?.role === 'mentor').length;
    const parentCount = allUsers.filter(u => u.profile?.role === 'parent').length;
    const mentors = allUsers.filter(u => u.profile?.role === 'mentor');

    // --- Download user data as JSON ---
    const downloadUserData = (targetUser) => {
        const data = { ...targetUser };
        delete data.uid;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(targetUser.profile?.name || 'user').replace(/\s+/g, '_')}_yedek.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // --- Orphan students (clear mentorId) ---
    const orphanStudents = (mentorUid) => {
        allUsers.forEach(u => {
            if (u.profile?.role === 'student' && u.profile?.mentorId === mentorUid) {
                db.ref(`users/${u.uid}/profile/mentorId`).set(null);
            }
        });
    };

    // --- Delete user from DB ---
    const deleteUserFromDB = (uid) => {
        db.ref(`users/${uid}`).remove();
        setDeleteModal(null);
    };

    return (
        <div className="h-full flex flex-col" style={{ background: '#0a0a0a' }}>
            {/* HEADER */}
            <div className="p-6 pb-8" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)', borderBottom: '1px solid #1f1f1f' }}>
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, #b8860b, #daa520)' }}>👑</div>
                        <div>
                            <h1 className="text-xl font-extrabold" style={{ color: '#daa520' }}>Sistem Kumanda Merkezi</h1>
                            <p className="text-xs" style={{ color: '#555' }}>God Mode • {user?.email}</p>
                        </div>
                    </div>
                    <button onClick={onLogout} className="text-xs font-bold px-4 py-2 rounded-xl transition" style={{ color: '#666', border: '1px solid #222', background: '#111' }}>ÇIKIŞ</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* KPI CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Card 1: Registered Users */}
                    <div className="rounded-2xl p-5" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>KAYITLI KULLANICILAR</div>
                                <div className="text-4xl font-black mt-2" style={{ color: '#e5e5e5' }}>{allUsers.length}</div>
                            </div>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: '#1a1a1a' }}>👥</div>
                        </div>
                        <div className="flex gap-3 text-xs font-bold">
                            <span style={{ color: '#3b82f6' }}>🎓 {studentCount} Öğrenci</span>
                            <span style={{ color: '#888' }}>•</span>
                            <span style={{ color: '#0f766e' }}>🧑‍🏫 {mentorCount} Mentor</span>
                            <span style={{ color: '#888' }}>•</span>
                            <span style={{ color: '#6366f1' }}>👨‍👩‍👧 {parentCount} Veli</span>
                        </div>
                    </div>

                    {/* Card 2: System Status / Kill Switch */}
                    <div className="rounded-2xl p-5" style={{ background: '#111', border: `1px solid ${isMaintenanceMode ? '#7f1d1d' : '#1f1f1f'}` }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>SİSTEM DURUMU</div>
                                <div className="text-lg font-bold mt-2" style={{ color: isMaintenanceMode ? '#ef4444' : '#22c55e' }}>
                                    {isMaintenanceMode ? '🔴 BAKIM MODU' : '🟢 AKTİF'}
                                </div>
                            </div>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: '#1a1a1a' }}>⚡</div>
                        </div>
                        <button
                            onClick={() => { const next = !isMaintenanceMode; setIsMaintenanceMode(next); db.ref('system/maintenanceMode').set(next); }}
                            className="w-full py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all"
                            style={{
                                background: isMaintenanceMode
                                    ? 'linear-gradient(135deg, #7f1d1d, #dc2626)'
                                    : 'linear-gradient(135deg, #1a1a1a, #222)',
                                color: isMaintenanceMode ? '#fecaca' : '#666',
                                border: `1px solid ${isMaintenanceMode ? '#991b1b' : '#333'}`,
                                boxShadow: isMaintenanceMode ? '0 0 20px rgba(220,38,38,0.3)' : 'none'
                            }}
                        >
                            {isMaintenanceMode ? '🔓 Bakım Modunu Kapat' : '🔒 Bakım Modunu Aç (Kill Switch)'}
                        </button>
                    </div>

                    {/* Card 3: Total System Hours */}
                    <div className="rounded-2xl p-5" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>TOPLAM SİSTEM SAATİ</div>
                                <div className="text-4xl font-black mt-2" style={{ color: '#e5e5e5' }}>{totalFocusHours}<span className="text-lg font-bold" style={{ color: '#555' }}> sa</span></div>
                            </div>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: '#1a1a1a' }}>⏱️</div>
                        </div>
                        <div className="text-xs font-bold" style={{ color: '#555' }}>Tüm kullanıcıların toplam tamamlanan görev süreleri</div>
                    </div>

                    {/* Card 4: Registration Approval */}
                    <div className="rounded-2xl p-5" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>KAYIT ONAY SİSTEMİ</div>
                                <div className="text-xs mt-2" style={{ color: '#666' }}>Yeni kayıtlar admin onayı beklesin</div>
                            </div>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: '#1a1a1a' }}>🛡️</div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => { const next = !reqStudentApproval; setReqStudentApproval(next); db.ref('system/requireStudentApproval').set(next); }}
                                className="w-full py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all"
                                style={{ background: reqStudentApproval ? 'linear-gradient(135deg, #854d0e, #a16207)' : '#1a1a1a', color: reqStudentApproval ? '#fef08a' : '#555', border: `1px solid ${reqStudentApproval ? '#a16207' : '#222'}` }}
                            >
                                {reqStudentApproval ? '🟡 Öğrenci Onayı AKTİF' : 'Öğrenci Onayı Kapalı'}
                            </button>
                            <button
                                onClick={() => { const next = !reqMentorApproval; setReqMentorApproval(next); db.ref('system/requireMentorApproval').set(next); }}
                                className="w-full py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all"
                                style={{ background: reqMentorApproval ? 'linear-gradient(135deg, #854d0e, #a16207)' : '#1a1a1a', color: reqMentorApproval ? '#fef08a' : '#555', border: `1px solid ${reqMentorApproval ? '#a16207' : '#222'}` }}
                            >
                                {reqMentorApproval ? '🟡 Mentor Onayı AKTİF' : 'Mentor Onayı Kapalı'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* USER TABLE */}
                <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
                    <div className="p-5 flex justify-between items-center" style={{ borderBottom: '1px solid #1f1f1f' }}>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#daa520' }}>TÜM KULLANICILAR</h3>
                            <p className="text-xs mt-1" style={{ color: '#444' }}>Sistemdeki tüm hesaplar</p>
                        </div>
                    </div>
                    <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
                        {allUsers.map((u, i) => {
                            const role = u.profile?.role || 'student';
                            const isPending = role.startsWith('pending_');
                            const roleBadge = role === 'admin' ? { label: 'ADMIN 👑', color: '#b8860b' }
                                : role === 'pending_student' ? { label: '⏳ ONAY BEKLİYOR', color: '#a16207' }
                                    : role === 'pending_mentor' ? { label: '⏳ ONAY BEKLİYOR', color: '#a16207' }
                                        : role === 'mentor' ? { label: 'MENTOR', color: '#0f766e' }
                                            : role === 'parent' ? { label: 'VELİ', color: '#6366f1' }
                                                : { label: 'ÖĞRENCİ', color: '#3b82f6' };
                            const currentMentorId = u.profile?.mentorId || '';
                            const currentMentor = mentors.find(m => m.uid === currentMentorId);
                            return (
                                <div key={u.uid || i} className="px-5 py-3 hover:bg-white/[0.02] transition" style={{ borderBottom: '1px solid #1a1a1a', opacity: u.profile?.isSuspended ? 0.5 : 1 }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: '#1a1a1a', color: u.profile?.isSuspended ? '#991b1b' : '#666' }}>
                                                {(u.profile?.name || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold" style={{ color: u.profile?.isSuspended ? '#666' : '#ccc' }}>
                                                    {u.profile?.name || 'İsimsiz'}
                                                    {u.profile?.isSuspended && <span className="ml-2 text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: '#7f1d1d', color: '#fca5a5' }}>DONDURULDU</span>}
                                                </div>
                                                <div className="text-[10px]" style={{ color: '#444' }}>{u.profile?.email || u.uid}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Impersonate */}
                                            {role !== 'admin' && (
                                                <button onClick={(e) => { e.stopPropagation(); onImpersonate && onImpersonate(u); }} title="Gözlemle" className="text-xs px-2 py-1 rounded-lg transition" style={{ background: '#1a1a1a', color: '#666', border: '1px solid #222' }}>👁️</button>
                                            )}
                                            {/* Suspend */}
                                            {role !== 'admin' && (
                                                <button onClick={(e) => { e.stopPropagation(); db.ref(`users/${u.uid}/profile/isSuspended`).set(!u.profile?.isSuspended); }} title={u.profile?.isSuspended ? 'Aç' : 'Dondur'} className="text-xs px-2 py-1 rounded-lg transition" style={{ color: u.profile?.isSuspended ? '#22c55e' : '#ef4444', background: '#1a1a1a', border: `1px solid ${u.profile?.isSuspended ? '#14532d' : '#7f1d1d'}` }}>
                                                    {u.profile?.isSuspended ? '▶️' : '⏸️'}
                                                </button>
                                            )}
                                            {/* Delete */}
                                            {role !== 'admin' && (
                                                <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ user: u, role }); }} title="Sil" className="text-xs px-2 py-1 rounded-lg transition" style={{ color: '#ef4444', background: '#1a1a1a', border: '1px solid #7f1d1d' }}>🗑️</button>
                                            )}
                                            {/* Approve pending */}
                                            {isPending && (
                                                <button onClick={(e) => { e.stopPropagation(); db.ref(`users/${u.uid}/profile/role`).set(role.replace('pending_', '')); }} title="Onayla" className="text-xs px-2 py-1 rounded-lg transition" style={{ color: '#22c55e', background: '#1a1a1a', border: '1px solid #14532d' }}>✅</button>
                                            )}
                                            <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-md" style={{ background: `${roleBadge.color}20`, color: roleBadge.color }}>{roleBadge.label}</span>
                                        </div>
                                    </div>
                                    {/* Mentor Select for Students */}
                                    {role === 'student' && (
                                        <div className="mt-2 ml-12 flex items-center gap-2">
                                            <span className="text-[10px] font-bold" style={{ color: '#444' }}>Mentorü:</span>
                                            <select
                                                value={currentMentorId}
                                                onChange={(e) => db.ref(`users/${u.uid}/profile/mentorId`).set(e.target.value || null)}
                                                className="text-[11px] font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                                                style={{ background: '#1a1a1a', color: currentMentor ? '#0f766e' : '#555', border: '1px solid #222', minWidth: 140 }}
                                            >
                                                <option value="">Mentor Seçilmedi</option>
                                                {mentors.map(m => (
                                                    <option key={m.uid} value={m.uid}>{m.profile?.name || 'Mentor'}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {allUsers.length === 0 && (
                            <div className="text-center py-8 text-sm" style={{ color: '#333' }}>Kullanıcı bulunamadı.</div>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="text-center py-4">
                    <div className="text-[10px] font-bold" style={{ color: '#222' }}>StudentLifeOS • Admin Console v1.0</div>
                </div>
            </div>

            {/* DELETE USER MODAL */}
            {deleteModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setDeleteModal(null)}>
                    <div className="rounded-2xl w-full max-w-md p-6" style={{ background: '#111', border: '1px solid #1f1f1f' }} onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-5">
                            <div className="text-4xl mb-3">{deleteModal.role === 'mentor' ? '⚠️' : '🗑️'}</div>
                            <h3 className="text-lg font-extrabold" style={{ color: '#e5e5e5' }}>
                                {deleteModal.user.profile?.name || 'İsimsiz'} silinecek
                            </h3>
                            <p className="text-xs mt-2 leading-relaxed" style={{ color: '#666' }}>
                                {deleteModal.role === 'mentor'
                                    ? 'DİKKAT! Bu mentoru silerseniz, ona bağlı öğrenciler sahipsiz kalacaktır.'
                                    : 'Bu kullanıcının tüm verisi kalıcı olarak silinecek.'}
                            </p>
                            {deleteModal.role === 'mentor' && (
                                <div className="mt-2 text-[10px] font-bold px-3 py-1.5 rounded-lg inline-block" style={{ background: '#7f1d1d20', color: '#fca5a5' }}>
                                    Bağlı öğrenci: {allUsers.filter(u => u.profile?.mentorId === deleteModal.user.uid).length} kişi
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            {deleteModal.role === 'mentor' ? (
                                <button
                                    onClick={() => { downloadUserData(deleteModal.user); orphanStudents(deleteModal.user.uid); deleteUserFromDB(deleteModal.user.uid); }}
                                    className="w-full py-3 rounded-xl text-sm font-extrabold transition"
                                    style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: '#e0e7ff', border: '1px solid #4f46e5' }}
                                >
                                    📥 İndir, Öğrencileri Boşa Çıkar ve Sil
                                </button>
                            ) : (
                                <button
                                    onClick={() => { downloadUserData(deleteModal.user); deleteUserFromDB(deleteModal.user.uid); }}
                                    className="w-full py-3 rounded-xl text-sm font-extrabold transition"
                                    style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: '#e0e7ff', border: '1px solid #4f46e5' }}
                                >
                                    📥 İndir ve Sil
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (deleteModal.role === 'mentor') orphanStudents(deleteModal.user.uid);
                                    deleteUserFromDB(deleteModal.user.uid);
                                }}
                                className="w-full py-3 rounded-xl text-sm font-extrabold transition"
                                style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fecaca', border: '1px solid #991b1b' }}
                            >
                                Sadece Sil
                            </button>
                            <button
                                onClick={() => setDeleteModal(null)}
                                className="w-full py-3 rounded-xl text-sm font-bold transition"
                                style={{ background: '#1a1a1a', color: '#666', border: '1px solid #222' }}
                            >
                                Vazgeç
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
