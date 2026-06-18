// --- AuthScreen.jsx ---
// Login / Register screen. Uses globals: db, auth, React, useState, DEFAULT_HABITS, DEFAULT_REWARDS
// No import/export — CDN Babel global scope.

function AuthScreen() {
    const [isLogin, setIsLogin] = React.useState(true);
    const [role, setRole] = React.useState('student');
    const [name, setName] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [parentCode, setParentCode] = React.useState("");
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(false);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            let userCredential;
            if (isLogin) {
                userCredential = await auth.signInWithEmailAndPassword(email, password);
            } else {
                // Veli kodu doğrulama
                if (role === 'parent') {
                    if (!parentCode.trim()) { setError('Lütfen öğrenci kodunu girin.'); setLoading(false); return; }

                    // 1. Önce hesabı oluştur (authenticated olmadan DB sorgusu yapılamaz)
                    userCredential = await auth.createUserWithEmailAndPassword(email, password);

                    // 2. Şimdi authenticated olarak kodu doğrula
                    try {
                        const snap = await db.ref('users').orderByChild('pairingCode').equalTo(parentCode.trim().toUpperCase()).once('value');
                        if (!snap.exists()) {
                            // Kod geçersiz → hesabı sil
                            await userCredential.user.delete();
                            setError('Geçersiz Öğrenci Kodu. Lütfen kodunuzu kontrol edin.');
                            setLoading(false);
                            return;
                        }
                        const linkedStudentId = Object.keys(snap.val())[0];

                        await db.ref(`users/${userCredential.user.uid}/profile`).set({
                            name: name || 'Veli',
                            email: email,
                            role: 'parent',
                            linkedStudentId: linkedStudentId
                        });
                    } catch (queryErr) {
                        // Sorgu hatası → hesabı sil
                        await userCredential.user.delete();
                        throw queryErr;
                    }
                } else {
                    userCredential = await auth.createUserWithEmailAndPassword(email, password);
                    // Check approval flags from system config
                    let finalRole = role;
                    if (role === 'student' || role === 'mentor') {
                        const sysSnap = await db.ref('system').once('value');
                        const sysData = sysSnap.val() || {};
                        if (role === 'student' && sysData.requireStudentApproval === true) finalRole = 'pending_student';
                        if (role === 'mentor' && sysData.requireMentorApproval === true) finalRole = 'pending_mentor';
                    }
                    await db.ref(`users/${userCredential.user.uid}/profile`).set({
                        name: name || 'User',
                        email: email,
                        role: finalRole
                    });
                    // Auto-seed for new students
                    if (finalRole === 'student') {
                        await db.ref(`users/${userCredential.user.uid}`).update({
                            habits: DEFAULT_HABITS,
                            rewards: DEFAULT_REWARDS,
                            gold: 0
                        });
                    }
                }
            }
        } catch (err) {
            setError(err.message.replace("Firebase:", "").trim());
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-6">
            <div className="w-full max-w-sm bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
                <h1 className="text-3xl font-thin tracking-widest text-center mb-2">ogrenciOS</h1>
                <p className="text-gray-400 dark:text-slate-400 text-center text-xs tracking-wide mb-8">CLOUD EDITION</p>

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLogin && (
                        <>
                            <div className="flex bg-gray-700 rounded-lg p-1 mb-2">
                                <button type="button" onClick={() => setRole('student')} className={`flex-1 py-1 rounded text-xs font-bold ${role === 'student' ? 'bg-indigo-600 text-white' : 'text-gray-400 dark:text-slate-400'}`}>Öğrenci</button>
                                <button type="button" onClick={() => setRole('mentor')} className={`flex-1 py-1 rounded text-xs font-bold ${role === 'mentor' ? 'bg-green-600 text-white' : 'text-gray-400 dark:text-slate-400'}`}>Mentor</button>
                                <button type="button" onClick={() => setRole('parent')} className={`flex-1 py-1 rounded text-xs font-bold ${role === 'parent' ? 'bg-amber-500 text-white' : 'text-gray-400 dark:text-slate-400'}`}>Veli</button>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 dark:text-slate-400 ml-1">İSİM</label>
                                <input type="text" required className="w-full bg-gray-700 text-white p-3 rounded-xl mt-1 focus:ring-2 ring-indigo-500 border-none" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            {role === 'parent' && (
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 ml-1">ÖĞRENCİ KODU</label>
                                    <input type="text" required maxLength={6} placeholder="6 haneli kod" className="w-full bg-gray-700 text-white p-3 rounded-xl mt-1 focus:ring-2 ring-amber-500 border-none uppercase tracking-widest text-center font-mono font-bold text-lg" value={parentCode} onChange={e => setParentCode(e.target.value.toUpperCase())} />
                                    <p className="text-gray-500 dark:text-slate-400 text-[10px] mt-1 ml-1">Öğrencinizin profilindeki 6 haneli kodu girin</p>
                                </div>
                            )}
                        </>
                    )}
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-slate-400 ml-1">E-POSTA</label>
                        <input type="email" required className="w-full bg-gray-700 text-white p-3 rounded-xl mt-1 focus:ring-2 ring-indigo-500 border-none" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-slate-400 ml-1">ŞİFRE</label>
                        <input type="password" required className="w-full bg-gray-700 text-white p-3 rounded-xl mt-1 focus:ring-2 ring-indigo-500 border-none" value={password} onChange={e => setPassword(e.target.value)} />
                    </div>

                    {error && <div className="text-red-400 text-xs bg-red-900/30 p-2 rounded">{error}</div>}

                    <button disabled={loading} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50">
                        {loading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="text-gray-400 dark:text-slate-400 text-sm hover:text-white transition">
                        {isLogin ? 'Hesabın yok mu? Kayıt Ol' : 'Zaten hesabın var mı? Giriş Yap'}
                    </button>
                </div>
            </div>
        </div>
    );
}
