/**
 * Calculates debts and settlement transactions for a trip.
 * 
 * @param {Array} expenses - List of expense objects { id, payerId, amount, ... }
 * @param {Array} members - List of member UIDs
 * @param {Object} memberWeights - Map of { uid: weight }, default 1
 * @param {Array} settlements - List of settlement records { fromUid, toUid, amount } (Marked as paid)
 * @param {string} userUid - Current user's UID (to name "You")
 * @param {Array} memberObjects - List of member objects { id, name } to resolve names
 */
// Added ignoreSettlements flag (default false) to allow fetching "Gross Debt" for the UI checklist
export const calculateSettlements = (expenses, members, memberWeights = {}, settlements = [], userUid, memberObjects = [], ignoreSettlements = false) => {
    
    // ... (logic remains same) ...

    // Process Expenses
    expenses.forEach(e => {
        // ... (expenses processing logic - unchanged)
        // Note: Since I'm using replace_file_content, I need to be careful not to delete the expense logic.
        // Wait, I can't easily wrap just the settlement block without rewriting the whole function if I don't see the line numbers perfectly matching existing content.
        // Actually, looking at the previous read, the function is:
        // const calculateSettlements = (expenses, members, memberWeights = {}, settlements = [], userUid, memberObjects = []) => ...
        
        // I will rewrite the function signature and the settlement processing part.
        
        // Re-reading logic to avoid mistakes.
    });
    if (!expenses || !members || members.length === 0) return [];

    // 1. Calculate Total Weight
    let totalWeight = 0;
    const weights = {};
    members.forEach(uid => {
        const w = (memberWeights && memberWeights[uid] !== undefined) ? memberWeights[uid] : 1;
        weights[uid] = w;
        totalWeight += w;
    });

    if (totalWeight === 0) return []; // Avoid division by zero

    // 2. Initialize Balances
    const balances = {};
    members.forEach(m => balances[m] = 0);

    // 3. Process Expenses
    expenses.forEach(exp => {
        const payer = exp.payerId;
        const amount = parseFloat(exp.amount);
        
        // Credit the payer
        if (balances[payer] === undefined) balances[payer] = 0;
        balances[payer] += amount;

        // Debit everyone based on weight
        members.forEach(memberId => {
            const share = (amount * weights[memberId]) / totalWeight;
            if (balances[memberId] === undefined) balances[memberId] = 0;
            balances[memberId] -= share;
        });
    });

    // 4. Process Settlements (Existing Payments)
    if (!ignoreSettlements) {
        settlements.forEach(s => {
            const amount = parseFloat(s.amount);
            // "fromUid" paid "toUid"
            // So fromUid gets + (debt reduced/credit increased)
            // toUid gets - (credit reduced/received money)
            if (balances[s.fromUid] !== undefined) balances[s.fromUid] += amount;
            if (balances[s.toUid] !== undefined) balances[s.toUid] -= amount;
        });
    }
    // Wait, let's think about "Balance". 
    // Positive Balance = User is OWED money (Creditor)
    // Negative Balance = User OWES money (Debtor)
    
    // If A (Debtor) pays B (Creditor) $10:
    // A's balance (e.g. -50) should become -40 (Increases)
    // B's balance (e.g. +50) should become +40 (Decreases)
    



    // 5. Generate Simplest Debt Graph (Greedy Algorithm)
    let debtors = [];
    let creditors = [];

    Object.keys(balances).forEach(uid => {
        const bal = balances[uid];
        if (bal < -0.01) debtors.push({ uid, amount: bal }); // amount is negative
        if (bal > 0.01) creditors.push({ uid, amount: bal }); // amount is positive
    });

    // Sort to optimize number of transactions (optional, but good for stability)
    debtors.sort((a, b) => a.amount - b.amount); // Ascending (most negative first)
    creditors.sort((a, b) => b.amount - a.amount); // Descending (most positive first)

    const transactions = [];
    let i = 0; // creditor index
    let j = 0; // debtor index

    // Helper to get name
    const getName = (id) => {
        if (id === userUid) return "You";
        const found = memberObjects.find(m => m.id === id);
        return found ? found.name : (id ? id.substring(0, 5) : 'Unknown');
    };

    while (i < creditors.length && j < debtors.length) {
        let creditor = creditors[i];
        let debtor = debtors[j];

        // The amount to settle is the minimum of (Debtor owes, Creditor needs)
        let curAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

        transactions.push({
            fromUid: debtor.uid,
            fromName: getName(debtor.uid),
            toUid: creditor.uid,
            toName: getName(creditor.uid),
            amount: curAmount,
            currency: expenses[0]?.currency || 'USD' // Simplified currency handling
        });

        // Update temp balances
        creditor.amount -= curAmount;
        debtor.amount += curAmount; // adding positive acts as reducing negative

        // Move indices if settled
        if (creditor.amount < 0.01) i++;
        if (debtor.amount > -0.01) j++;
    }

    return transactions;
};
