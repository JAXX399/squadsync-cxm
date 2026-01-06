import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const Expenses = ({ currentTrip, user }) => {
    const [expenses, setExpenses] = useState([]);
    const [members, setMembers] = useState([]); // Map of uid -> name

    // Form State
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [editingId, setEditingId] = useState(null); // If set, we are editing this ID

    // Settlement State
    const [settlements, setSettlements] = useState([]);

    // 1. Fetch Expenses & Members
    useEffect(() => {
        if (!currentTrip) return;

        // Fetch Expenses
        const qExp = query(
            collection(db, "expenses"),
            where("tripId", "==", currentTrip.id)
        );

        const unsubExpenses = onSnapshot(qExp, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-sort
            fetched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setExpenses(fetched);
        }, (error) => console.error(error));

        // Fetch Members (for names)
        // Note: Firestore 'in' limit is 10. For production, batching is needed.
        if (currentTrip.members.length > 0) {
            import('firebase/firestore').then(({ documentId }) => {
                const qMem = query(
                    collection(db, "users"),
                    where(documentId(), 'in', currentTrip.members.slice(0, 10))
                );

                // We use a one-time get or snapshot. Snapshot is better for sync.
                const unsubMembers = onSnapshot(qMem, (snap) => {
                    const mems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setMembers(mems);
                });
            });
        }

        return () => unsubExpenses();
    }, [currentTrip]);

    // 2. Calculate Debts
    useEffect(() => {
        calculateSettlements();
    }, [expenses, currentTrip, members]); // Re-calc when members load

    const calculateSettlements = () => {
        if (!expenses.length || !currentTrip.members.length) {
            setSettlements([]);
            return;
        }

        const total = expenses.reduce((sum, e) => sum + e.amount, 0);
        const fairShare = total / currentTrip.members.length;

        // Calculate Balances
        const balances = {};
        currentTrip.members.forEach(uid => {
            balances[uid] = -fairShare;
        });

        expenses.forEach(e => {
            if (balances[e.payerId] !== undefined) {
                balances[e.payerId] += e.amount;
            }
        });

        let debtors = [];
        let creditors = [];

        Object.keys(balances).forEach(uid => {
            const bal = balances[uid];
            if (bal < -0.01) debtors.push({ uid, amount: bal });
            if (bal > 0.01) creditors.push({ uid, amount: bal });
        });

        debtors.sort((a, b) => a.amount - b.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const transactions = [];
        let i = 0;
        let j = 0;

        while (i < creditors.length && j < debtors.length) {
            let creditor = creditors[i];
            let debtor = debtors[j];

            let curAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

            const getName = (id) => {
                if (id === user.uid) return "You";
                // Try to find in fetched members
                const foundMem = members.find(m => m.id === id);
                if (foundMem) return foundMem.name;

                // Fallback to expense history
                const foundExp = expenses.find(e => e.payerId === id);
                return foundExp ? foundExp.payerName : id.substring(0, 5);
            };

            transactions.push({
                from: getName(debtor.uid),
                to: getName(creditor.uid),
                amount: curAmount,
                currency: expenses[0]?.currency || 'USD'
            });

            creditor.amount -= curAmount;
            debtor.amount += curAmount;

            if (creditor.amount < 0.01) i++;
            if (debtor.amount > -0.01) j++;
        }

        setSettlements(transactions);
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

    // Stats
    const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
    const splitPerPerson = currentTrip.members.length > 0 ? (totalSpent / currentTrip.members.length) : 0;

    return (
        <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
            {/* LEFT: List & Settlements */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* 1. Settlement Plan (The "Smart" Part) */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                    <h3 style={{ marginBottom: '1rem', color: '#4ade80' }}>⚖️ Settlement Plan</h3>
                    {settlements.length === 0 ? (
                        <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>We are all settled up! No debts.</p>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.8rem' }}>
                            {settlements.map((tx, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                                    <span style={{ fontWeight: 'bold' }}>{tx.from}</span>
                                    <span style={{ opacity: 0.7 }}>pays</span>
                                    <span style={{ fontWeight: 'bold' }}>{tx.to}</span>
                                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }}></div>
                                    <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{tx.currency} {tx.amount.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
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
                                    <td style={{ padding: '0.8rem 0' }}>
                                        <div style={{ fontWeight: '500' }}>{exp.description}</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Paid by {exp.payerName}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '0.8rem 0', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: '600' }}>{exp.currency} {exp.amount.toFixed(2)}</div>

                                        {/* Edit/Delete Controls */}
                                        {(exp.payerId === user.uid) && (
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                                <button onClick={() => handleEdit(exp)} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: '0.8rem', opacity: 0.6 }}>✏️</button>
                                                <button onClick={() => handleDelete(exp.id)} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: '0.8rem', opacity: 0.6, color: '#ff4d4d' }}>🗑️</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No expenses yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RIGHT: Add/Edit Form */}
            <div className="glass-panel" style={{ width: '320px', padding: '1.5rem', height: 'fit-content' }}>
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
            </div>
        </div>
    );
};

export default Expenses;
