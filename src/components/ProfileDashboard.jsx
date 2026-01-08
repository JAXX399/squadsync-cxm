import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Wallet, CreditCard, Check, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { calculateSettlements } from '../utils/settlementLogic';

const ProfileDashboard = ({ user, onBack }) => {
    // 1. Independent Payments State
    const [directPayments, setDirectPayments] = useState([]);
    
    // 2. Event Debts State
    const [eventDebts, setEventDebts] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(true);

    // 3. Form State
    const [targetUserUid, setTargetUserUid] = useState(''); // Who owes me?
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [description, setDescription] = useState('');
    
    // 4. All Users State (For Lookup & Selection)
    const [availableUsers, setAvailableUsers] = useState([]);
    const [userMap, setUserMap] = useState({});

    // --- FETCH ALL USERS ---
    useEffect(() => {
        const q = query(collection(db, "users"));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAvailableUsers(list);
            
            const map = {};
            list.forEach(u => map[u.id] = u);
            setUserMap(map);
        });
        return () => unsub();
    }, []);

    // --- FETCH INDEPENDENT PAYMENTS ---
    useEffect(() => {
        // Fetch where user is payer OR payee
        const q1 = query(collection(db, "direct_payments"), where("fromUid", "==", user.uid));
        const q2 = query(collection(db, "direct_payments"), where("toUid", "==", user.uid));

        let localPayments = {};

        const merge = () => {
             const list = Object.values(localPayments);
             list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
             setDirectPayments(list);
        };

        const unsub1 = onSnapshot(q1, (snap) => {
            snap.docs.forEach(d => localPayments[d.id] = { id: d.id, ...d.data() });
            snap.docChanges().forEach(change => {
                if (change.type === "removed") delete localPayments[change.doc.id];
            });
            merge();
        });

        const unsub2 = onSnapshot(q2, (snap) => {
            snap.docs.forEach(d => localPayments[d.id] = { id: d.id, ...d.data() });
            snap.docChanges().forEach(change => {
                if (change.type === "removed") delete localPayments[change.doc.id];
            });
            merge();
        });

        return () => { unsub1(); unsub2(); };
    }, [user]);


    // --- FETCH EVENT DEBTS ---
    useEffect(() => {
        const qTrips = query(collection(db, "trips"), where("members", "array-contains", user.uid));
        
        const unsubTrips = onSnapshot(qTrips, async (snap) => {
            const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const debts = [];

            for (const trip of trips) {
                 const expSnap = await import('firebase/firestore').then(({ getDocs, collection, query, where }) => 
                     getDocs(query(collection(db, "expenses"), where("tripId", "==", trip.id)))
                 );
                 const expenses = expSnap.docs.map(d => d.data());

                 const setSnap = await import('firebase/firestore').then(({ getDocs, collection, query, where }) => 
                     getDocs(query(collection(db, "trip_settlements"), where("tripId", "==", trip.id)))
                 );
                 const settlements = setSnap.docs.map(d => d.data());

                 const detailedSettlements = calculateSettlements(
                     expenses, 
                     trip.members, 
                     trip.memberWeights, 
                     settlements, 
                     user.uid, 
                     [] 
                 );

                 detailedSettlements.forEach(tx => {
                     // Resolve User
                     // If I am paying, I owe 'toUid'.
                     // If I am receiving, 'fromUid' owes me.
                     
                     if (tx.fromUid === user.uid) {
                         const u = userMap[tx.toUid];
                         debts.push({ 
                             tripName: trip.name, 
                             otherPartyName: u ? u.name : 'Unknown',
                             otherPhoto: u?.photoURL,
                             otherUid: tx.toUid,
                             amount: -tx.amount, 
                             currency: tx.currency
                         });
                     }
                     if (tx.toUid === user.uid) {
                         const u = userMap[tx.fromUid];
                         debts.push({ 
                             tripName: trip.name, 
                             otherPartyName: u ? u.name : 'Unknown',
                             otherPhoto: u?.photoURL,
                             otherUid: tx.fromUid,
                             amount: tx.amount,
                             currency: tx.currency
                         });
                     }
                 });
            }
            setEventDebts(debts);
            setLoadingEvents(false);
        });

        return () => unsubTrips();
    }, [user, userMap]); // Re-run when userMap loads to fill in avatars


    // --- HANDLERS ---

    const handleCreatePayment = async (e) => {
        e.preventDefault();
        if (!targetUserUid || !amount) return;

        try {
            // Logic: I am creating a "They Owe Me" record.
            // Creator = Me. 
            // Direction = 'owed' (They owe me).
            // ToUid = user.uid (Me, the receiver)
            // FromUid = payToUid (Them, the payer)
            
            // Wait, previous logic used 'fromUid'/'toUid' based on money flow.
            // Money flows FROM them TO me.
            // So fromUid = payToUid, toUid = user.uid.

            const debtor = userMap[targetUserUid];

            await addDoc(collection(db, "direct_payments"), {
                fromUid: targetUserUid, 
                toUid: user.uid,
                creatorUid: user.uid,
                otherPartyName: debtor ? debtor.name : 'Unknown', // Legacy fallback
                
                amount: parseFloat(amount),
                currency: currency,
                description,
                status: 'pending',
                direction: 'owed', // I created it saying I am owed
                createdAt: new Date().toISOString()
            });

            setTargetUserUid('');
            setAmount('');
            setDescription('');
        } catch (e) {
            alert(e.message);
        }
    };

    const handleMarkDirectPaid = async (payment) => {
         // Only receiver can mark paid.
         // In direct_payments: fromUid pays toUid.
         // So current user must be toUid.
         
         if (payment.toUid !== user.uid) {
             alert("Only the receiver can mark this as paid.");
             return;
         }

         if (!window.confirm("Mark this valid payment as Settled?")) return;
         await updateDoc(doc(db, "direct_payments", payment.id), { status: 'paid' });
    };

    const handleDeleteDirect = async (payment) => {
        if (payment.status !== 'paid') {
             if (payment.creatorUid !== user.uid) {
                 alert("Only the creator can delete pending requests.");
                 return;
             }
        }
        if (!window.confirm("Delete this record permanently?")) return;
        await deleteDoc(doc(db, "direct_payments", payment.id));
    };


    // Calculations
    const totalDiff = {}; 
    
    [...eventDebts].forEach(d => {
        if (!totalDiff[d.currency]) totalDiff[d.currency] = 0;
        totalDiff[d.currency] += d.amount;
    });

    directPayments.forEach(p => {
        if (p.status === 'paid') return;
        
        // Logic:
        // if user.uid == toUid -> I am receiving (+).
        // if user.uid == fromUid -> I am paying (-).
        
        const isReceiver = p.toUid === user.uid;
        const sign = isReceiver ? 1 : -1;
        
        if (!totalDiff[p.currency]) totalDiff[p.currency] = 0;
        totalDiff[p.currency] += (p.amount * sign);
    });





    const getUserDetails = (uid) => {
        const u = userMap[uid];
        return {
            name: u ? u.name : 'Unknown',
            photo: u ? u.photoURL : `https://ui-avatars.com/api/?name=${u ? u.name : 'User'}&background=random`,
            text: u ? u.name : 'Unknown'
        };
    };

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="profile-container"
            style={{ boxSizing: 'border-box' }}
        >
            {/* Header */}
            <div className="profile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={onBack} className="btn-icon" title="Back">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Wallet size={32} color="#4ade80" />
                        My Wallet
                    </h2>
                </div>
                <div className="profile-balance-cards" style={{ display: 'flex', gap: '2rem', background: 'rgba(255,255,255,0.05)', padding: '10px 20px', borderRadius: '12px' }}>
                     {Object.entries(totalDiff).map(([curr, amt]) => (
                         <div key={curr} style={{ textAlign: 'right', minWidth: '80px' }}>
                             <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{curr} Balance</div>
                             <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: amt >= 0 ? '#4ade80' : '#ff4d4d' }}>
                                 {amt >= 0 ? '+' : ''}{amt.toFixed(2)}
                             </div>
                         </div>
                     ))}
                     {Object.keys(totalDiff).length === 0 && <span style={{ opacity: 0.5 }}>No balance yet</span>}
                </div>
            </div>

            <div className="profile-content-wrapper">
                
                {/* LEFT: Debt Summary (Events) */}
                <div className="glass-panel profile-section" style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Trip Debts</h3>
                    
                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {eventDebts.length === 0 ? (
                            <p style={{ opacity: 0.5, fontStyle: 'italic' }}>You are all square on trips!</p>
                        ) : eventDebts.map((d, i) => {
                             const u = getUserDetails(d.otherUid);
                             return (
                                <div key={i} style={{ 
                                    background: 'rgba(255,255,255,0.05)', 
                                    padding: '12px', 
                                    borderRadius: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <img src={u.photo} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} alt="" />
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{u.text}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{d.tripName}</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: d.type === 'OWE' ? '#ff4d4d' : '#4ade80' }}>
                                            {d.type === 'OWE' ? 'You owe' : 'Owes you'}
                                        </div>
                                        <div style={{ fontSize: '1.1rem' }}>{d.currency} {d.amount.toFixed(2)}</div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </div>

                {/* CENTER: Direct Payments List */}
                <div className="glass-panel profile-section" style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                     <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Direct Payments</h3>
                     
                     <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {directPayments.length === 0 ? (
                            <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No direct payments recorded.</p>
                        ) : directPayments.map(p => {
                            const isIncoming = p.toUid === user.uid; // Someone owes me
                            const isMyDebt = p.fromUid === user.uid; // I owe
                            const otherUid = isMyDebt ? p.toUid : p.fromUid;
                            const otherUser = getUserDetails(otherUid);
                            
                            const isPaid = p.status === 'paid';

                             return (
                                <div key={p.id} style={{ 
                                    background: isPaid ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.05)', 
                                    padding: '12px', 
                                    borderRadius: '12px',
                                    borderLeft: `4px solid ${isPaid ? '#4ade80' : (isMyDebt ? '#ff4d4d' : '#3b82f6')}`,
                                    position: 'relative'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <img src={otherUser.photo} style={{ width: 32, height: 32, borderRadius: '50%' }} alt="" />
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                                                    {isMyDebt ? `You owe ${otherUser.text}` : `${otherUser.text} owes YOU`}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{p.description}</div>
                                                {isPaid && (
                                                    <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 'bold', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Check size={12} strokeWidth={3} /> PAID
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 'bold' }}>{p.currency} {p.amount.toFixed(2)}</div>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px', gap: '8px' }}>
                                                {/* Actions */}
                                                {!isPaid && !isMyDebt && (
                                                     <button 
                                                        onClick={() => handleMarkDirectPaid(p)}
                                                        style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', padding: 0 }}
                                                        title="Mark Paid"
                                                     >
                                                        <Check size={18} />
                                                     </button>
                                                )}
                                                {/* Delete: If paid (anyone), or if pending (only creator) */}
                                                {(isPaid || p.creatorUid === user.uid) && (
                                                    <button 
                                                        onClick={() => handleDeleteDirect(p)}
                                                        style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: 0, opacity: 0.6 }}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                             );
                        })}
                     </div>
                </div>

                {/* RIGHT: Action Form */}
                <div className="glass-panel profile-section" style={{ width: '320px', padding: '1.5rem', height: 'fit-content' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CreditCard size={20} />
                        Ask for Payment
                    </h3>
                    <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '1rem' }}>
                        Record that someone owes you money (outside of a trip).
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                         <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Who owes you?</label>
                            <select 
                                value={targetUserUid}
                                onChange={e => setTargetUserUid(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
                            >
                                <option value="">Select User...</option>
                                {availableUsers
                                    .filter(u => u.id !== user.uid)
                                    .map(u => (
                                    <option key={u.id} value={u.id}>{u.name || (u.id ? u.id.substring(0,5) : 'Unknown')}</option>
                                ))}
                            </select>
                         </div>
                         
                         <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Amount</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input 
                                    type="number" 
                                    placeholder="0.00"
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)}
                                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
                                />
                                <select 
                                    value={currency} 
                                    onChange={e => setCurrency(e.target.value)}
                                    style={{ width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
                                >
                                    <option>USD</option>
                                    <option>EUR</option>
                                    <option>GBP</option>
                                    <option>INR</option>
                                </select>
                            </div>
                         </div>

                         <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>For what?</label>
                            <input 
                                type="text" 
                                placeholder="Lunch, Taxi..." 
                                value={description} 
                                onChange={e => setDescription(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
                            />
                         </div>

                         <button 
                            onClick={handleCreatePayment}
                            className="btn-primary" 
                            style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
                         >
                            Confirm Request
                         </button>
                    </div>
                </div>

            </div>
        </motion.div>
    );
};

export default ProfileDashboard;
