import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import { Edit2 } from 'lucide-react';

const AdminDashboard = ({ onExit }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [trips, setTrips] = useState([]);
    const [stats, setStats] = useState({ users: 0, trips: 0, statuses: 0 });
    
    // Weight Management State
    const [selectedTrip, setSelectedTrip] = useState(null);

    const handleUpdateWeight = async (trip, uid, weight) => {
        const num = parseFloat(weight);
        if (num < 0) return alert("Weight cannot be negative");
        
        const newWeights = { ...(trip.memberWeights || {}) };
        newWeights[uid] = num;

        try {
            await updateDoc(doc(db, "trips", trip.id), {
                memberWeights: newWeights
            });
            // Update local state
            setTrips(trips.map(t => t.id === trip.id ? { ...t, memberWeights: newWeights } : t));
            setSelectedTrip({ ...trip, memberWeights: newWeights });
            alert("Weight updated!");
        } catch (e) {
            alert(e.message);
        }
    };

    const handleUpdateName = async (uid, currentName) => {
        const newName = prompt("Enter new name for this user:", currentName);
        if (!newName || newName === currentName) return;

        try {
            await updateDoc(doc(db, "users", uid), { name: newName });
            // Update local state
            setUsers(users.map(u => u.id === uid ? { ...u, name: newName } : u));
            alert("Name updated successfully!");
        } catch (e) {
            alert("Error updating name: " + e.message);
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (password === 'cxm123') {
            setIsAuthenticated(true);
            fetchData();
        } else {
            alert("Access Denied");
        }
    };

    const fetchData = async () => {
        // Users
        const usersSnap = await getDocs(query(collection(db, "users")));
        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Trips
        const tripsSnap = await getDocs(query(collection(db, "trips")));
        setTrips(tripsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Statuses Count (approx)
        const statusSnap = await getDocs(collection(db, "statuses"));
        setStats({
            users: usersSnap.size,
            trips: tripsSnap.size,
            statuses: statusSnap.size
        });
    };

    const deleteUser = async (userId) => {
        if (!window.confirm("Delete this user?")) return;
        try {
            await deleteDoc(doc(db, "users", userId));
            setUsers(users.filter(u => u.id !== userId));
        } catch (e) { alert(e.message) }
    };

    const deleteTrip = async (tripId) => {
        if (!window.confirm("Delete this trip?")) return;
        try {
            await deleteDoc(doc(db, "trips", tripId));
            setTrips(trips.filter(t => t.id !== tripId));
        } catch (e) { alert(e.message) }
    };

    const avadaKedavra = async () => {
        const spell = prompt("Type 'AVADA KEDAVRA' to wipe EVERYTHING.");
        if (spell === "AVADA KEDAVRA") {
            try {
                // Wipe Statuses
                const statusSnap = await getDocs(collection(db, "statuses"));
                const statusDels = statusSnap.docs.map(d => deleteDoc(d.ref));

                // Wipe Users
                const userSnap = await getDocs(collection(db, "users"));
                const userDels = userSnap.docs.map(d => deleteDoc(d.ref));

                // Wipe Trips
                const tripSnap = await getDocs(collection(db, "trips"));
                const tripDels = tripSnap.docs.map(d => deleteDoc(d.ref));

                // Wipe Invites
                const inviteSnap = await getDocs(collection(db, "invites"));
                const inviteDels = inviteSnap.docs.map(d => deleteDoc(d.ref));

                await Promise.all([...statusDels, ...userDels, ...tripDels, ...inviteDels]);
                alert("The system has been purged.");
                auth.signOut();
                onExit();
            } catch (e) { alert("Error: " + e.message) }
        }
    };

    const resetCalendar = async () => {
        if (!window.confirm("Delete ALL Statuses?")) return;
        const statusSnap = await getDocs(collection(db, "statuses"));
        statusSnap.forEach(d => deleteDoc(d.ref));
        alert("Calendar cleared.");
        fetchData(); // Refresh stats
    };

    if (!isAuthenticated) {
        return (
            <div className="glass-panel" style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center' }}>Admin Access</h2>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="password"
                        placeholder="Enter Admin Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className="btn-primary">Unlock</button>
                </form>
                <button onClick={onExit} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1>Admin Dashboard</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>Users: {stats.users}</div>
                    <div style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>Trips: {stats.trips}</div>
                    <button onClick={onExit} className="btn-icon">Exit Admin</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                {['users', 'trips', 'system'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === tab ? 'var(--text-accent)' : 'transparent',
                            border: '1px solid var(--glass-border)',
                            color: activeTab === tab ? '#000' : '#fff',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            fontWeight: 'bold'
                        }}
                    >
                        {tab} Management
                    </button>
                ))}
            </div>

            <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                {activeTab === 'users' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid white' }}>
                                <th style={{ textAlign: 'left', padding: '1rem' }}>Name</th>
                                <th style={{ textAlign: 'left', padding: '1rem' }}>Detail</th>
                                <th style={{ textAlign: 'left', padding: '1rem' }}>ID</th>
                                <th style={{ textAlign: 'right', padding: '1rem' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <td style={{ padding: '1rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {u.name}
                                        <button 
                                            onClick={() => handleUpdateName(u.id, u.name)}
                                            style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-accent)', padding: '4px' }}
                                            title="Edit Name"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                    </td>
                                    <td style={{ padding: '1rem' }}>{u.gender}, {u.age}</td>
                                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.id}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <button onClick={() => deleteUser(u.id)} style={{ color: '#ff4d4d', background: 'transparent', border: '1px solid #ff4d4d', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === 'trips' && (
                    <>
                        {!selectedTrip ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid white' }}>
                                        <th style={{ textAlign: 'left', padding: '1rem' }}>Trip Name</th>
                                        <th style={{ textAlign: 'left', padding: '1rem' }}>Members</th>
                                        <th style={{ textAlign: 'left', padding: '1rem' }}>Host ID</th>
                                        <th style={{ textAlign: 'right', padding: '1rem' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trips.map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <td style={{ padding: '1rem' }}>{t.name}</td>
                                            <td style={{ padding: '1rem' }}>{t.members?.length || 0}</td>
                                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{t.hostId}</td>
                                            <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button onClick={() => setSelectedTrip(t)} style={{ color: '#4ade80', background: 'transparent', border: '1px solid #4ade80', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Weights</button>
                                                <button onClick={() => deleteTrip(t.id)} style={{ color: '#ff4d4d', background: 'transparent', border: '1px solid #ff4d4d', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div>
                                <button onClick={() => setSelectedTrip(null)} style={{ marginBottom: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Back to Trips</button>
                                <h2>Manage Weights: {selectedTrip.name}</h2>
                                <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Set multiplier for expense splitting (1 = Standard, 0.5 = Half Share, 2 = Double Share).</p>
                                
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {selectedTrip.members.map(uid => {
                                        const userObj = users.find(u => u.id === uid);
                                        const currentWeight = (selectedTrip.memberWeights && selectedTrip.memberWeights[uid] !== undefined) ? selectedTrip.memberWeights[uid] : 1;
                                        
                                        return (
                                            <div key={uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold' }}>{userObj ? userObj.name : 'Unknown User'}</div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>{uid}</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <input 
                                                        type="number" 
                                                        step="0.1" 
                                                        defaultValue={currentWeight} 
                                                        id={`weight-${uid}`}
                                                        style={{ width: '80px', padding: '0.5rem', borderRadius: '4px', border: 'none' }}
                                                    />
                                                    <button 
                                                        onClick={() => {
                                                            const val = document.getElementById(`weight-${uid}`).value;
                                                            handleUpdateWeight(selectedTrip, uid, val);
                                                        }}
                                                        className="btn-primary"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'system' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '600px' }}>
                        <div style={{ padding: '1.5rem', border: '1px solid #ffbd2e', borderRadius: '8px', background: 'rgba(255, 189, 46, 0.1)' }}>
                            <h3>Calendar Wipe</h3>
                            <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>Deletes all statuses from all calendars. Trips and Users remain.</p>
                            <button onClick={resetCalendar} className="btn-primary" style={{ background: '#ffbd2e', color: 'black' }}>Reset All Calendars</button>
                        </div>

                        <div style={{ padding: '1.5rem', border: '1px solid #ff4d4d', borderRadius: '8px', background: 'rgba(255, 77, 77, 0.1)' }}>
                            <h3>DANGER ZONE: Avada Kedavra</h3>
                            <p style={{ margin: '1rem 0', color: '#ff4d4d' }}>Permanently deletes ALL Data: Users, Trips, Invites, Statuses. Extremely destructive.</p>
                            <button onClick={avadaKedavra} className="btn-primary" style={{ background: '#ff4d4d', color: 'white' }}>⚡ AVADA KEDAVRA</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
