import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { calculateSettlements } from '../utils/settlementLogic';
import { Trash2, Edit2, Check } from 'lucide-react';

const Expenses = ({ currentTrip, user }) => {
    const [expenses, setExpenses] = useState([]);
    const [members, setMembers] = useState([]); // Map of uid -> name

    // Form State
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [editingId, setEditingId] = useState(null); // If set, we are editing this ID

    // Settlement State
    const [settlements, setSettlements] = useState([]); // Computed Transactions
    const [paidSettlements, setPaidSettlements] = useState([]); // Db records of "Mark Paid"

    // 1. Fetch Data
    useEffect(() => {
        if (!currentTrip) return;

        // Fetch Expenses
        const qExp = query(
            collection(db, "expenses"),
            where("tripId", "==", currentTrip.id)
        );

        const unsubExpenses = onSnapshot(qExp, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setExpenses(fetched);
        }, (error) => console.error(error));

        // Fetch Existing Settlements (Marked as Paid)
        const qSet = query(
            collection(db, "trip_settlements"),
            where("tripId", "==", currentTrip.id)
        );
        const unsubSettlements = onSnapshot(qSet, (snap) => {
             const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
             setPaidSettlements(fetched);
        });

        // Fetch Members (Limit 10 hack)
        if (currentTrip.members.length > 0) {
            import('firebase/firestore').then(({ documentId }) => {
                const qMem = query(
                    collection(db, "users"),
                    where(documentId(), 'in', currentTrip.members.slice(0, 10))
                );
                const unsubMembers = onSnapshot(qMem, (snap) => {
                    const mems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setMembers(mems);
                });
            });
        }

        return () => {
             unsubExpenses();
             unsubSettlements();
        };
    }, [currentTrip]);



    const handleMarkPaid = async (tx) => {
        if (!window.confirm(`Confirm payment of ${tx.currency} ${tx.amount} received from ${tx.fromName}?`)) return;

        try {
            await addDoc(collection(db, "trip_settlements"), {
                tripId: currentTrip.id,
                fromUid: tx.fromUid,
                toUid: tx.toUid, // I am the toUid
                amount: parseFloat(tx.amount),
                currency: tx.currency,
                createdAt: new Date().toISOString()
            });
        } catch (e) {
            alert(e.message);
        }
    };

    const handleDeleteSettlement = async (settlementId) => {
        if(!window.confirm("Undo this payment markup?")) return;
        try {
            await deleteDoc(doc(db, "trip_settlements", settlementId));
        } catch(e) {
            alert(e.message);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!description || !amount) {
            alert("Please enter description and amount.");
            return;
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            alert("Invalid amount.");
            return;
        }

        try {
            if (editingId) {
                // UPDATE
                await updateDoc(doc(db, "expenses", editingId), {
                    description,
                    amount: numAmount,
                    currency
                });
                alert("Updated!");
            } else {
                // CREATE
                await addDoc(collection(db, "expenses"), {
                    tripId: currentTrip.id,
                    description,
                    amount: numAmount,
                    currency,
                    payerId: user.uid,
                    payerName: user.displayName || 'Unknown',
                    createdAt: new Date().toISOString()
                });
            }
            // Reset
            setEditingId(null);
            setDescription('');
            setAmount('');
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    const handleEdit = (exp) => {
        setEditingId(exp.id);
        setDescription(exp.description);
        setAmount(exp.amount);
        setCurrency(exp.currency);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this expense?")) return;
        try {
            await deleteDoc(doc(db, "expenses", id));
        } catch (e) {
            alert(e.message);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setDescription('');
        setAmount('');
    };

    const handleUpdatePaymentInfo = async () => {
        const currentUpi = members.find(m => m.id === user.uid)?.paymentMethods?.upi || '';
        const currentNote = members.find(m => m.id === user.uid)?.paymentMethods?.note || '';

        const newUpi = prompt("Enter your UPI ID (e.g., name@okicici):", currentUpi);
        if (newUpi === null) return; // Cancelled

        const newNote = prompt("Any payment notes? (e.g., GPay preferred)", currentNote);
        if (newNote === null) return; 

        try {
            await updateDoc(doc(db, "users", user.uid), {
                paymentMethods: {
                    upi: newUpi,
                    note: newNote
                }
            });
            alert("Payment info updated!");
        } catch (e) {
            alert("Error updating info: " + e.message);
        }
    };

    // Stats
    const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
    const splitPerPerson = currentTrip.members.length > 0 ? (totalSpent / currentTrip.members.length) : 0;

    return (
        <div className="expenses-container" style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
            {/* LEFT: List & Settlements */}
            <div className="expenses-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* SETTLEMENT PLAN (Persistent Checklist) */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Settlement Plan</h3>
                    
                    {(() => {
                        // 1. Calculate GROSS debt (ignoring what's paid) to show the full checklist
                         const grossSettlements = calculateSettlements(
                             expenses, 
                             currentTrip.members, 
                             currentTrip.memberWeights, 
                             [], // Pass empty settlements to ignore
                             user.uid, 
                             members,
                             true // ignoreSettlements flag
                         );

                         if (grossSettlements.length === 0) {
                             return <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No debts found.</p>;
                         }

                         return (
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {grossSettlements.map((tx, i) => {
                                    // 2. Check if this specific transaction is already paid
                                    const match = paidSettlements.find(s => 
                                        s.fromUid === tx.fromUid && 
                                        s.toUid === tx.toUid && 
                                        Math.abs(s.amount - tx.amount) < 0.05 // float tolerance
                                    );

                                    const isPaid = !!match;
                                    const isReceiver = tx.toUid === user.uid;
                                    
                                    // Allow toggle if I am the receiver (Confirmation)
                                    const canToggle = isReceiver; 

                                    return (
                                        <div key={i} style={{ 
                                            background: isPaid ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255,255,255,0.05)', 
                                            padding: '12px', 
                                            borderRadius: '8px',
                                            borderLeft: isPaid ? '4px solid #4ade80' : '4px solid transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            opacity: isPaid ? 0.7 : 1,
                                            transition: 'all 0.2s ease'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {canToggle ? (
                                                    <div 
                                                        onClick={() => {
                                                            if (isPaid) handleDeleteSettlement(match.id);
                                                            else handleMarkPaid(tx);
                                                        }}
                                                        style={{ 
                                                            width: 20, 
                                                            height: 20, 
                                                            borderRadius: '6px', 
                                                            border: isPaid ? '2px solid #4ade80' : '2px solid rgba(255,255,255,0.3)',
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            background: isPaid ? '#4ade80' : 'transparent',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {isPaid && <Check size={14} color="black" strokeWidth={3} />}
                                                    </div>
                                                ) : (
                                                    <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                                        {isPaid && <Check size={14} />}
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: '600', textDecoration: isPaid ? 'line-through' : 'none' }}>{tx.fromName}</span>
                                                        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>➜</span>
                                                        <span style={{ fontWeight: '600', textDecoration: isPaid ? 'line-through' : 'none' }}>{tx.toName}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', color: isPaid ? '#4ade80' : 'var(--text-accent)', textDecoration: isPaid ? 'line-through' : 'none', fontWeight: isPaid ? 600 : 400 }}>
                                                        {tx.currency} {tx.amount.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                            {isPaid && (
                                                 <span style={{ fontSize: '0.65rem', background: '#4ade80', color: '#064e3b', padding: '2px 8px', borderRadius: '10px', fontWeight: '800', letterSpacing: '0.5px' }}>PAID</span>
                                            )}
                                        </div>
                                    );
                                })}
                             </div>
                         );
                    })()}
                </div>

                {/* 2. Expense List */}
                <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3>Recent Transactions</h3>
                        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Total: {totalSpent.toFixed(0)} | Per Person: {splitPerPerson.toFixed(0)}</span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {expenses.map(exp => (
                                <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '1rem 0' }}>
                                        <div style={{ fontWeight: '500', fontSize: '1.05rem' }}>{exp.description}</div>
                                        <div style={{ fontSize: '0.85rem', opacity: 0.5, marginTop: '2px' }}>Paid by {exp.payerName}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '1rem 0', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{exp.currency} {exp.amount.toFixed(2)}</div>

                                        {/* Edit/Delete Controls */}
                                        {(exp.payerId === user.uid) && (
                                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '6px' }}>
                                                <button onClick={() => handleEdit(exp)} style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-secondary)', padding: '4px' }} title="Edit">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(exp.id)} style={{ cursor: 'pointer', border: 'none', background: 'none', color: '#ff4d4d', padding: '4px' }} title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5, fontStyle: 'italic' }}>No expenses yet. Add one!</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RIGHT: Add/Edit Form & Payment Info */}
            <div className="expenses-sidebar glass-panel" style={{ padding: '1.5rem', height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Item</label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Dinner, Tickets..."
                            autoFocus={!!editingId} // Focus on edit
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Cost</label>
                            <input
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="0.00"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                            />
                        </div>
                        <div style={{ width: '80px' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Currency</label>
                            <select
                                value={currency}
                                onChange={e => setCurrency(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                            >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="INR">INR</option>
                                <option value="JPY">JPY</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
                        {editingId ? 'Update' : '+ Add'}
                    </button>

                    {editingId && (
                        <button type="button" onClick={handleCancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            Cancel Edit
                        </button>
                    )}
                </form>

                {/* Payment Info */}
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0 }}>Payment Details</h4>
                        <button onClick={handleUpdatePaymentInfo} style={{ background: 'none', border: '1px solid var(--text-accent)', color: 'var(--text-accent)', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '0.75rem' }}>
                            Edit Mine
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                        {members.length > 0 ? members.map(m => {
                            const pm = m.paymentMethods || {};
                            const hasInfo = pm.upi || pm.note;
                            if (!hasInfo) return null;

                            return (
                                <div key={m.id} style={{ fontSize: '0.85rem', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontWeight: 'bold' }}>{m.name}</div>
                                    <div style={{ marginLeft: '4px', marginTop: '2px', opacity: 0.8 }}>
                                        {pm.upi && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                                <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>UPI:</span> 
                                                <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '4px' }}>{pm.upi}</span>
                                            </div>
                                        )}
                                        {pm.note && <div style={{ fontSize: '0.75rem', fontStyle: 'italic', opacity: 0.6 }}>"{pm.note}"</div>}
                                    </div>
                                </div>
                            );
                        }) : <div style={{ opacity: 0.5, fontSize: '0.8rem' }}>Loading members...</div>}
                        {members.length > 0 && !members.some(m => m.paymentMethods?.upi || m.paymentMethods?.note) && (
                            <div style={{ opacity: 0.5, fontSize: '0.8rem', fontStyle: 'italic' }}>No payment info added yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Expenses;
