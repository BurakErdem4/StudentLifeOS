// --- useStudentData.jsx ---
// Custom Hook: useStudentData
// Encapsulates ALL student data state and Firebase operations for the App component.
// Exposes state values and action handlers via a single return object.
//
// Depends on globals: db, auth, DEFAULT_HABITS, DEFAULT_REWARDS (loaded from firebase.jsx + globals.jsx)
// No import/export — CDN Babel global scope.

function useStudentData(user, profile, showToast) {
    const { useState, useEffect, useRef } = React;

    // --- STATE ---
    const [activeTab, setActiveTab] = useState('planner');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [projects, setProjects] = useState([]);
    const [history, setHistory] = useState({});
    const [habits, setHabits] = useState([]);
    const [rewards, setRewards] = useState([]);
    const [gold, setGold] = useState(0);
    const [streakFreeze, setStreakFreeze] = useState(0);
    const [flippedCards, setFlippedCards] = useState({});
    const [flippedProjects, setFlippedProjects] = useState({});
    const [focusMode, setFocusMode] = useState({ active: false, taskId: null, taskTitle: '', timeLeft: 0, isRunning: false });
    const [modal, setModal] = useState({ open: false, type: null, data: null });
    const [form, setForm] = useState({});
    const [notificationModal, setNotificationModal] = useState(null);
    const [globalTags, setGlobalTags] = useState({ topics: [], sources: [], types: [] });

    // --- DERIVED ---
    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dateKey = getDateKey(selectedDate);
    const todayKey = getDateKey(new Date());
    const getDayData = (key) => history[key] || { tasks: [], habits: [], journal: null };
    const currentDayData = getDayData(dateKey);

    // --- FIREBASE HELPERS ---
    const updateCloud = (path, value) => {
        if (!user) return;
        try {
            const cleanValue = JSON.parse(JSON.stringify(value));
            db.ref(`users/${user.uid}/${path}`).set(cleanValue);
        } catch (e) {
            console.error("Firebase Sync Error:", e);
        }
    };

    const updateGold = (amount) => {
        const newGold = Math.max(0, gold + amount);
        updateCloud('gold', newGold);
    };

    // --- EFFECTS ---

    // Global Tags Listener
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

    // Main user data listener
    useEffect(() => {
        if (!user) return;
        const userRef = db.ref('users/' + user.uid);
        userRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setProjects(data.projects || []);
                setHistory(data.history || {});
                setHabits(data.habits || DEFAULT_HABITS);
                setRewards(data.rewards || DEFAULT_REWARDS);
                setGold(data.gold || 0);
                setStreakFreeze(data.streakFreeze || 0);
            }
        });
        return () => userRef.off();
    }, [user]);

    // Notifications listener
    useEffect(() => {
        if (!user) return;
        const notifRef = db.ref(`users/${user.uid}/notifications`);
        let initialLoad = true;

        notifRef.once('value', (snapshot) => {
            const existing = snapshot.val();
            if (existing) {
                Object.keys(existing).forEach(key => {
                    db.ref(`users/${user.uid}/notifications/${key}`).remove();
                });
            }
            initialLoad = false;
        });

        notifRef.on('child_added', (snapshot) => {
            if (initialLoad) return;
            const val = snapshot.val();
            if (val) {
                setNotificationModal({ id: snapshot.key, ...val });
                if (val.type === 'celebrate' || val.gold > 0) {
                    if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                }
            }
        });
        return () => notifRef.off();
    }, [user]);

    // Focus mode timer
    useEffect(() => {
        let interval = null;
        if (focusMode.active && focusMode.isRunning && focusMode.timeLeft > 0) {
            interval = setInterval(() => setFocusMode(p => ({ ...p, timeLeft: p.timeLeft - 1 })), 1000);
        } else if (focusMode.timeLeft === 0 && focusMode.isRunning) {
            setFocusMode(p => ({ ...p, isRunning: false }));
        }
        return () => clearInterval(interval);
    }, [focusMode]);

    // Streak Freeze auto-consume
    useEffect(() => {
        if (!user || !history || Object.keys(history).length === 0 || streakFreeze <= 0) return;
        const gdk = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        };
        const isDayFailed = (dayData) => {
            if (!dayData) return true;
            if (dayData.frozen === true) return false;
            const tasks = dayData.tasks || [];
            const hasTask = tasks.some(t => t.completed || (t.subItems && t.subItems.some(Boolean)));
            const hasHabit = (dayData.habits || []).length > 0;
            return !(hasTask && hasHabit);
        };
        let freezesLeft = streakFreeze;
        for (let i = 1; i <= 3 && freezesLeft > 0; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = gdk(d);
            const dayData = history[key];
            if (isDayFailed(dayData)) {
                updateCloud(`history/${key}/frozen`, true);
                freezesLeft--;
                updateCloud('streakFreeze', freezesLeft);
            }
        }
    }, [user, history, streakFreeze]);

    // --- MODAL ---
    const closeModal = () => {
        if (modal.type === 'journal') {
            journalAutoOpened.current = true;
            localStorage.setItem('pulseShown_' + todayKey, 'true');
        }
        setModal({ open: false, type: null, data: null });
    };

    const openModal = (type, data = null) => {
        setModal({ open: true, type, data });
        let newForm = {};
        if (type === 'journal') {
            newForm = { mood: currentDayData.journal?.mood || '😐', note: currentDayData.journal?.note || '' };
        } else if (type === 'project') {
            let pItems = data?.projectItems ? (Array.isArray(data.projectItems) ? [...data.projectItems] : Object.values(data.projectItems)) : [];
            newForm = { ...data, projectItems: pItems };
        }
        setForm(newForm);
    };

    // Journal auto-open
    const journalAutoOpened = useRef(false);

    useEffect(() => {
        if (!todayKey || !user) return;
        if (journalAutoOpened.current) return;
        if (localStorage.getItem('pulseShown_' + todayKey)) {
            journalAutoOpened.current = true;
            return;
        }
        const alreadyFilled = !!(currentDayData?.journal?.mood || currentDayData?.journal?.note);
        if (alreadyFilled) {
            journalAutoOpened.current = true;
            localStorage.setItem('pulseShown_' + todayKey, 'true');
            return;
        }
        journalAutoOpened.current = true;
        const t = setTimeout(() => { openModal('journal'); }, 1500);
        return () => clearTimeout(t);
    }, [todayKey, user, currentDayData?.journal?.mood, currentDayData?.journal?.note]);

    // --- NOTIFICATION ---
    const closeNotification = () => {
        if (notificationModal) {
            const currentMessages = profile?.mentorMessages || [];
            const newMessage = {
                id: notificationModal.id,
                title: notificationModal.title || 'Mesaj',
                message: notificationModal.message || '',
                gold: notificationModal.gold || 0,
                timestamp: notificationModal.timestamp || Date.now(),
                type: notificationModal.type || 'message'
            };
            const updatedMessages = [newMessage, ...currentMessages].slice(0, 50);
            updateCloud('profile/mentorMessages', updatedMessages);
            db.ref(`users/${user.uid}/notifications/${notificationModal.id}`).remove();
            setNotificationModal(null);
        }
    };

    // --- GLOBAL TAGS ---
    const processGlobalTags = (items) => {
        const newTopics = new Set();
        const newSources = new Set();
        const newTypes = new Set();

        (items || []).forEach(item => {
            const topic = item.topic?.trim();
            const source = item.source?.trim();
            const type = item.type?.trim();

            if (topic && !globalTags.topics.includes(topic)) newTopics.add(topic);
            if (source && !globalTags.sources.includes(source)) newSources.add(source);
            if (type && !globalTags.types.includes(type)) newTypes.add(type);
        });

        if (newTopics.size > 0 || newSources.size > 0 || newTypes.size > 0) {
            const updates = {};
            if (newTopics.size > 0) updates.topics = [...globalTags.topics, ...newTopics];
            if (newSources.size > 0) updates.sources = [...globalTags.sources, ...newSources];
            if (newTypes.size > 0) updates.types = [...globalTags.types, ...newTypes];
            db.ref('globalTags').update({ ...globalTags, ...updates });
        }
    };

    // --- TASK ACTIONS ---
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

            let selectedTopic = null;
            if (form.selectedProjectItemId && p.projectItems) {
                const items = Array.isArray(p.projectItems) ? p.projectItems : Object.values(p.projectItems);
                selectedTopic = items.find(i => String(i.id) === String(form.selectedProjectItemId));
            }

            const itemUnit = selectedTopic?.unit || p.unit;
            const itemTitleSuffix = selectedTopic
                ? ` - ${[selectedTopic.topic, selectedTopic.source].filter(Boolean).join(' ')} (${amount} ${itemUnit})`
                : ` (${amount} ${itemUnit})`;

            newTask = {
                id: Date.now(), title: `${p.title}${itemTitleSuffix}`, type: 'project_slice',
                pid: p.id, targetAmount: amount, subItems: new Array(amount).fill(false), completed: false,
                duration: String(calculatedDuration), startTime: form.startTime || '', createdAt: Date.now()
            };

            if (selectedTopic) {
                newTask.topic = selectedTopic.topic || null;
                newTask.source = selectedTopic.source || null;
                newTask.typeStr = selectedTopic.type || null;
                newTask.projectItemId = selectedTopic.id || null;
            }
        }
        const tasksArr = Array.isArray(currentDayData.tasks) ? currentDayData.tasks : Object.values(currentDayData.tasks || {});
        const newTasks = [...tasksArr, newTask];
        updateCloud(`history/${dateKey}/tasks`, newTasks);
        if (typeof showToast === 'function') showToast('Görev başarıyla eklendi! 🎯', 'success');
        closeModal();
    };

    const toggleTask = (taskId) => {
        try {
            const rawTasks = Array.isArray(currentDayData.tasks)
                ? currentDayData.tasks
                : Object.values(currentDayData.tasks || {});
            const tasksArr = rawTasks.filter(t => t !== null && t !== undefined);

            const task = tasksArr.find(t => String(t.id) === String(taskId));
            if (!task) return;

            const newStatus = !task.completed;
            updateGold(newStatus ? 10 : -10);

            const updatedTasks = tasksArr.map(t => String(t.id) === String(taskId) ? { ...t, completed: newStatus, lastActivityAt: Date.now() } : t);
            updateCloud(`history/${dateKey}/tasks`, updatedTasks);

            if (task.pid && task.projectItemId) {
                const safeProjects = (projects || []).filter(p => p !== null && p !== undefined);
                const targetProject = safeProjects.find(p => String(p.id) === String(task.pid));

                if (targetProject && targetProject.projectItems) {
                    const items = Array.isArray(targetProject.projectItems) ? [...targetProject.projectItems] : { ...targetProject.projectItems };
                    const itemKey = Array.isArray(items)
                        ? items.findIndex(i => i && String(i.id) === String(task.projectItemId))
                        : Object.keys(items).find(k => items[k] && String(items[k].id) === String(task.projectItemId));

                    if (itemKey !== -1 && itemKey !== undefined) {
                        const currentCompleted = Number(items[itemKey].completedAmount) || 0;
                        const defaultAmt = Number(task.targetAmount || task.amount || 1);
                        const amountModifier = newStatus ? defaultAmt : -defaultAmt;
                        const newAmount = Math.max(0, currentCompleted + amountModifier);

                        items[itemKey] = { ...items[itemKey], completedAmount: newAmount };
                        const updatedProjects = safeProjects.map(p => String(p.id) === String(task.pid) ? { ...p, projectItems: items, lastActivityAt: Date.now() } : p);
                        updateCloud('projects', updatedProjects);
                    }
                }
            }
        } catch (err) {
            console.error("ToggleTask Error:", err);
            if (showToast) showToast('Görev güncellenirken hata oluştu!', 'error');
        }
    };

    const toggleSubItem = (taskId, index) => {
        try {
            const rawTasks = Array.isArray(currentDayData.tasks)
                ? currentDayData.tasks
                : Object.values(currentDayData.tasks || {});
            const tasksArr = rawTasks.filter(t => t !== null && t !== undefined);

            const task = tasksArr.find(t => String(t.id) === String(taskId));
            if (!task) return;

            const newSubItems = [...(task.subItems || [])];
            const wasDone = newSubItems[index];
            newSubItems[index] = !wasDone;

            const allDone = newSubItems.every(i => i === true);
            updateGold(wasDone ? -5 : 5);
            const updatedTasks = tasksArr.map(t => String(t.id) === String(taskId) ? { ...t, subItems: newSubItems, completed: allDone, lastActivityAt: Date.now() } : t);
            updateCloud(`history/${dateKey}/tasks`, updatedTasks);

            if (task.type === 'project_slice') {
                const safeProjects = (projects || []).filter(p => p !== null && p !== undefined);
                const targetProject = safeProjects.find(p => String(p.id) === String(task.pid));

                if (targetProject) {
                    const newCurrent = Math.max(0, (targetProject.currentUnit || 0) + (wasDone ? -1 : 1));
                    let items = targetProject.projectItems;
                    if (task.projectItemId && targetProject.projectItems) {
                        items = Array.isArray(targetProject.projectItems) ? [...targetProject.projectItems] : { ...targetProject.projectItems };
                        const itemKey = Array.isArray(items)
                            ? items.findIndex(i => i && String(i.id) === String(task.projectItemId))
                            : Object.keys(items).find(k => items[k] && String(items[k].id) === String(task.projectItemId));

                        if (itemKey !== -1 && itemKey !== undefined) {
                            const currentCompleted = Number(items[itemKey].completedAmount) || 0;
                            const amountModifier = wasDone ? -1 : 1;
                            const newAmount = Math.max(0, currentCompleted + amountModifier);
                            items[itemKey] = { ...items[itemKey], completedAmount: newAmount };
                        }
                    }
                    const updatedProjects = safeProjects.map(p => String(p.id) === String(task.pid) ? { ...p, currentUnit: newCurrent, projectItems: items, lastActivityAt: Date.now() } : p);
                    updateCloud('projects', updatedProjects);
                }
            }
        } catch (err) {
            console.error("ToggleSubItem Error:", err);
            if (showToast) showToast('Alt görev güncellenirken hata oluştu!', 'error');
        }
    };

    const toggleHabit = (habitId) => {
        const doneHabits = currentDayData.habits || [];
        const isDone = doneHabits.includes(habitId);
        let newHabits = isDone ? doneHabits.filter(id => id !== habitId) : [...doneHabits, habitId];
        updateGold(isDone ? -5 : 5);
        updateCloud(`history/${dateKey}/habits`, newHabits);
    };

    const deleteTask = (id) => {
        const tasksArr = Array.isArray(currentDayData.tasks) ? currentDayData.tasks : Object.values(currentDayData.tasks || {});
        const task = tasksArr.find(t => t.id === id);
        if (task?.isMentorTask && task?.allowDelete === false) {
            alert("Bu görev kilitli! Mentor onayı olmadan silemezsin.");
            return;
        }
        updateCloud(`history/${dateKey}/tasks`, tasksArr.filter(t => t.id !== id));
    };

    // --- HABIT ACTIONS ---
    const deleteHabit = (id) => updateCloud('habits', habits.filter(h => h.id !== id));
    const addHabit = () => {
        if (form.title) {
            updateCloud('habits', [...habits, { id: Date.now(), title: form.title, icon: form.icon || '✨' }]);
            setForm({ title: '', icon: '' });
        }
    };

    // --- PROJECT ACTIONS ---
    const handleAddProject = () => {
        if (form.title) {
            const initial = Number(form.initial) || 0;
            const items = form.projectItems || [];
            const mainUnit = form.unit || items[0]?.unit || 'br';

            updateCloud('projects', [...projects, {
                id: Date.now(),
                title: form.title,
                category: form.category || '',
                totalUnit: Number(form.total) || 100,
                currentUnit: initial,
                initialUnit: initial,
                unit: mainUnit,
                totalEstTime: Number(form.estTime) || 0,
                projectItems: items
            }]);
            processGlobalTags(items);
            if (typeof showToast === 'function') showToast('Proje başarıyla eklendi! 🚀', 'success');
            closeModal();
        }
    };

    const handleEditProject = () => {
        const p = modal.data;
        if (!p) return;
        const newTitle = form.title !== undefined ? form.title : p.title;
        const items = form.projectItems || p.projectItems || [];
        const newTotal = form.total !== undefined ? Number(form.total) : (Number(p.totalUnit) || 100);
        const newUnit = form.unit !== undefined ? form.unit : (p.unit || 'br');
        const newEstTime = form.estTime !== undefined && form.estTime !== '' ? Number(form.estTime) : Number(p.totalEstTime) || 0;
        const newCurrent = form.current !== undefined && form.current !== '' ? Number(form.current) : Number(p.currentUnit) || 0;

        if (newTotal <= 0) { if (!confirm('⚠️ Toplam birim 0 veya negatif. Yine de kaydetmek istiyor musun?')) return; }
        else if (newCurrent > newTotal) { if (!confirm(`⚠️ Yapılan (${newCurrent}) toplam hedeften (${newTotal}) büyük. Yine de kaydetmek istiyor musun?`)) return; }

        const oldInitial = Number(p.initialUnit) || 0;
        const oldCurrent = Number(p.currentUnit) || 0;
        const progressFromTasks = Math.max(0, oldCurrent - oldInitial);
        let newInitial = newCurrent - progressFromTasks;
        const newCategory = form.category !== undefined ? form.category : (p.category || '');

        const updatedProjects = projects.map(proj => proj.id === p.id ? {
            ...proj, title: newTitle, category: newCategory, totalUnit: newTotal,
            unit: newUnit, totalEstTime: newEstTime, currentUnit: newCurrent,
            initialUnit: newInitial, projectItems: items
        } : proj);

        updateCloud('projects', updatedProjects);
        processGlobalTags(items);
        closeModal();
    };

    const handleDeleteProject = (id) => updateCloud('projects', projects.filter(p => p.id !== id));

    // --- REWARD ACTIONS ---
    const handleBuyReward = (r) => {
        if (gold >= r.cost && confirm(`${r.icon || '🎁'} "${r.title}" — ${r.cost} altın`)) updateGold(-r.cost);
    };
    const handleAddReward = () => {
        if (form.title) {
            updateCloud('rewards', [...rewards, { id: Date.now(), title: form.title, cost: Number(form.cost), icon: form.icon || '🎁' }]);
            closeModal();
        }
    };
    const handleDeleteReward = (id) => {
        if (confirm('Silmek istediğine emin misin?')) updateCloud('rewards', rewards.filter(r => r.id !== id));
    };

    // --- FOCUS MODE ---
    const handleStartFocus = (t) => setFocusMode({ active: true, taskId: t.id, taskTitle: t.title, timeLeft: Number(t.duration) * 60, isRunning: true });
    const handleStopFocus = () => setFocusMode({ ...focusMode, active: false });

    // --- RETURN ---
    return {
        // State
        activeTab, setActiveTab,
        selectedDate, setSelectedDate,
        projects, history, habits, rewards, gold,
        streakFreeze, flippedCards, setFlippedCards,
        flippedProjects, setFlippedProjects,
        focusMode, setFocusMode,
        modal, form, setForm,
        notificationModal,
        globalTags,
        // Derived
        dateKey, todayKey, currentDayData, getDayData,
        // Helpers
        updateCloud, updateGold,
        // Actions
        openModal, closeModal,
        closeNotification,
        handleAddTask,
        toggleTask, toggleSubItem, toggleHabit, deleteTask,
        addHabit, deleteHabit,
        handleAddProject, handleEditProject, handleDeleteProject,
        handleBuyReward, handleAddReward, handleDeleteReward,
        handleStartFocus, handleStopFocus,
    };
}
