"use client";

import ChallanEntry from "@/components/ChallanEntry";
import CreateInvoice from "@/components/CreateInvoice";
import { useAuth } from "../../context/AuthContext";
import { auth, db } from "../../lib/firebase";
import { signOut } from "firebase/auth";
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { 
  LogOut, Truck, Building, ShieldCheck, PlusCircle, 
  FileSpreadsheet, LayoutDashboard, Wallet, Plus, 
  Filter, Search, Layers, CheckCircle2, AlertTriangle, X, Landmark, CreditCard
} from "lucide-react";
import { useState, useEffect } from "react";

interface BankAccount {
  id?: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [dateFilter, setDateFilter] = useState("this month"); 
  const [searchParty, setSearchParty] = useState("");
  
  // Capital Management & Bank States
  const [availableFund, setAvailableFund] = useState(0); 
  const [showAddFundModal, setShowAddFundModal] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  
  // New Bank Form State
  const [newBank, setNewBank] = useState({ bankName: "", accountNumber: "", ifscCode: "", branchName: "" });
  const [banksPool, setBanksPool] = useState<BankAccount[]>([]);

  // Raw and Filtered Aggregations Pools
  const [rawChallans, setRawChallans] = useState<any[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);
  const [selectedTxDetail, setSelectedTxDetail] = useState<any | null>(null);

  const [metrics, setMetrics] = useState({
    paidChallansCount: 0,
    totalOutflow: 0,
    totalDiscountIncome: 0,
    totalTdsDeducted: 0,
    submittedBillsAmt: 0,
    availableBillsAmt: 0
  });

  // 1. Fetch Master Core Documents & Bank Inflows From Firestore
  useEffect(() => {
    const fetchCoreDatabase = async () => {
      if (!user) return;
      try {
        // Fetch Associated Bank Accounts
        const bankSnap = await getDocs(query(collection(db, "bank_accounts"), where("createdBy", "==", user.uid)));
        const fetchedBanks = bankSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount));
        setBanksPool(fetchedBanks);
        if (fetchedBanks.length > 0) setSelectedAccount(fetchedBanks[0].bankName + " - " + fetchedBanks[0].accountNumber.slice(-4));

        // Fetch Total Injected Capital Inflows
        const fundSnap = await getDocs(query(collection(db, "capital_ledger"), where("createdBy", "==", user.uid)));
        const totalCredits = fundSnap.docs.reduce((acc, curr) => acc + (Number(curr.data().amount) || 0), 0);

        // Fetch All Registered Challans
        const challanSnap = await getDocs(query(collection(db, "challans"), where("createdBy", "==", user.uid)));
        const challansList = challanSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRawChallans(challansList);

        // Live Balance Formula Engine (Total Credits - Total Vehicle Debits)
        const totalDebits = challansList.reduce((acc, curr: any) => acc + (Number(curr.totalPayableToVehicle) || 0), 0);
        setAvailableFund(totalCredits - totalDebits);

      } catch (err) {
        console.error("Pipeline Synchronizer Error:", err);
      }
    };
    fetchCoreDatabase();
  }, [user, activeTab, showAddBankModal, showAddFundModal]);

  // 2. Dynamic Live Calculation & Date Filters Engine
  useEffect(() => {
    let list: any[] = [];
    const now = new Date();

    rawChallans.forEach((voucher) => {
      const vDate = new Date(voucher.createdAt);
      let matchesDate = false;

      const diffTime = Math.abs(now.getTime() - vDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (dateFilter === "today" && diffDays <= 1) matchesDate = true;
      else if (dateFilter === "yesterday" && diffDays <= 2 && diffDays > 1) matchesDate = true;
      else if (dateFilter === "last week" && diffDays <= 7) matchesDate = true;
      else if (dateFilter === "this month" && vDate.getMonth() === now.getMonth() && vDate.getFullYear() === now.getFullYear()) matchesDate = true;
      else if (dateFilter === "custom") matchesDate = true; 

      if (!matchesDate) return;

      if (voucher.items && voucher.items.length > 0) {
        voucher.items.forEach((item: any) => {
          list.push({
            id: voucher.id + item.challanNo,
            voucherNo: voucher.voucherNo,
            party: voucher.partyName,
            ownerName: voucher.ownerName,
            truck: item.truckNo,
            route: item.route,
            challanNo: item.challanNo,
            challanDate: item.challanDate,
            amt: item.freightAmt,
            payable: item.payableAmt,
            disc: item.discountAmt,
            tds: item.tds,
            shortageWt: item.shortageWt,
            shortageAmt: item.shortageAmt,
            diesel: item.diesel,
            cash: item.cash,
            advance: item.advance,
            status: voucher.challanSubmitToParty,
            time: new Date(voucher.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          });
        });
      }
    });

    const searchedList = list.filter(tx => tx.party.toLowerCase().includes(searchParty.toLowerCase()));
    setFilteredTransactions(searchedList);

    // Dynamic Live Counter Aggregator Recomputations based on active filters
    let paidCount = searchedList.length;
    let outflow = searchedList.reduce((acc, curr) => acc + curr.payable, 0);
    let income = searchedList.reduce((acc, curr) => acc + curr.disc, 0);
    let tdsPool = searchedList.reduce((acc, curr) => acc + curr.tds, 0);
    let submittedAmt = searchedList.filter(tx => tx.status === "submitted").reduce((acc, curr) => acc + curr.amt, 0);
    let availableAmt = searchedList.filter(tx => tx.status === "pending").reduce((acc, curr) => acc + curr.amt, 0);

    setMetrics({
      paidChallansCount: paidCount,
      totalOutflow: outflow,
      totalDiscountIncome: income,
      totalTdsDeducted: tdsPool,
      submittedBillsAmt: submittedAmt,
      availableBillsAmt: availableAmt
    });

  }, [rawChallans, dateFilter, searchParty]);

  // Save Capital Fund Injection directly to Firestore Pipeline Node
  const handleAddFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundAmount || !user) return;
    
    try {
      await addDoc(collection(db, "capital_ledger"), {
        amount: parseFloat(fundAmount),
        sourceAccount: selectedAccount,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });

      alert(`₹${parseFloat(fundAmount).toLocaleString("en-IN")} Credited to System Fund Node!`);
      setFundAmount("");
      setShowAddFundModal(false);
    } catch (err) {
      alert("Fund credit pipeline synchronization failure.");
    }
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, "bank_accounts"), {
        ...newBank,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
      alert("Bank Profile Synchronized Successfully!");
      setNewBank({ bankName: "", accountNumber: "", ifscCode: "", branchName: "" });
      setShowAddBankModal(false);
    } catch (err) {
      alert("Failed to map destination corporate account node.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row pb-24 md:pb-0 font-sans antialiased text-[13px]">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-60 bg-brand-navy text-white flex-col justify-between p-4 h-screen sticky top-0 shadow-2xl">
        <div>
        {/* Logo Branding */}
<div className="flex items-center gap-2 mb-6 px-1">
  <div className="p-1 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center h-9 w-9 overflow-hidden">
    {/* 🔥 Lucide Icon की जगह आपका कस्टम लोगो */}
    <img 
      src="/logo.png" 
      alt="FreightPay Logo" 
      className="object-contain h-full w-full"
    />
  </div>
  <div>
    <h2 className="font-black text-lg leading-none tracking-tight">FreightPay</h2>
    <span className="text-[9px] text-brand-cyan uppercase font-bold tracking-widest block mt-1">Coal ERP Suite</span>
  </div>
</div>

          <div className="space-y-1 bg-white/5 p-3 rounded-xl border border-white/10 mb-4">
            <span className="flex items-center gap-1 text-[9px] font-bold text-brand-cyan tracking-wider uppercase"><Building size={10} /> Active Workspace</span>
            <p className="text-xs font-bold truncate text-slate-100">{profile?.firmName || "Loading..."}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1"><ShieldCheck size={10} className="text-emerald-400" /> PAN: {profile?.panNumber}</p>
          </div>

          <nav className="space-y-1">
            <button onClick={() => setActiveTab("overview")} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-bold text-xs transition-all ${activeTab === "overview" ? "bg-brand-blue text-white shadow-md" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><LayoutDashboard size={16} /> Dashboard</button>
            <button onClick={() => setActiveTab("new-entry")} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-bold text-xs transition-all ${activeTab === "new-entry" ? "bg-brand-blue text-white shadow-md" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><PlusCircle size={16} /> Challan Entry</button>
            <button onClick={() => setActiveTab("records")} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-bold text-xs transition-all ${activeTab === "records" ? "bg-brand-blue text-white shadow-md" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><FileSpreadsheet size={16} /> Create Invoice</button>
          </nav>
        </div>
        <button onClick={() => signOut(auth)} className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 py-2 rounded-xl font-bold text-xs transition-all"><LogOut size={14} /> Logout System</button>
      </aside>

      {/* MOBILE HEADER */}
     {/* =========================================================================
    2. MOBILE TOP ACTION BAR
    ========================================================================= */}
<header className="md:hidden bg-brand-navy text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-40">
  <div className="flex items-center gap-2">
    {/* 🔥 मोबाइल हेडर में आपका कस्टम लोगो */}
    <div className="h-6 w-6 bg-white rounded-md p-0.5 flex items-center justify-center overflow-hidden">
      <img src="/logo.png" alt="Logo" className="object-contain h-full w-full" />
    </div>
    <h2 className="font-black tracking-tight text-base">FreightPay</h2>
  </div>
  <div className="flex items-center gap-2">
    <span className="text-[11px] font-bold bg-white/10 px-2.5 py-1 rounded-full border border-white/5 max-w-[100px] truncate">
      {profile?.firmName}
    </span>
    <button onClick={() => signOut(auth)} className="text-red-400 p-1">
      <LogOut size={16} />
    </button>
  </div>
</header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 p-3 md:p-6 transition-all">
        
        {activeTab === "overview" && (
          <div className="space-y-4">
            
            {/* AVAILABLE CAPITAL DISPLAY CARD */}
            <div className="bg-gradient-to-r from-brand-navy to-slate-800 rounded-2xl p-4 text-white shadow-xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-blue/20 rounded-xl text-brand-cyan border border-brand-blue/30"><Wallet size={24} /></div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">Live Available Balance</p>
                  <p className="text-2xl font-black text-white mt-1 tracking-tight">₹{availableFund.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => setShowAddBankModal(true)} className="flex-1 sm:flex-none bg-slate-700/60 hover:bg-slate-700 text-brand-cyan border border-brand-blue/20 font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"><Landmark size={14} /> Add Bank</button>
                <button onClick={() => setShowAddFundModal(true)} className="flex-1 sm:flex-none bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"><Plus size={14} /> Add Fund</button>
              </div>
            </div>

            {/* QUICK FILTERS */}
            <div className="bg-white rounded-xl p-2 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
                <div className="text-slate-400 p-1 hidden sm:block"><Filter size={14} /></div>
                {["today", "yesterday", "last week", "this month", "custom"].map((chip) => (
                  <button key={chip} onClick={() => setDateFilter(chip)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${dateFilter === chip ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{chip}</button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
                <input type="text" placeholder="Live Filter by Party Name..." value={searchParty} onChange={(e) => setSearchParty(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-brand-navy font-medium focus:outline-none focus:border-brand-blue" />
              </div>
            </div>

            {/* MATRICES DISPLAY PORTS */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
              <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Paid Challans</p>
                <div className="flex items-baseline justify-between mt-1"><p className="text-lg font-black text-brand-navy">{metrics.paidChallansCount}</p><span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">Count</span></div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Outflow</p>
                <div className="flex flex-col mt-1">
                  <p className="text-base font-black text-brand-blue truncate">₹{metrics.totalOutflow.toLocaleString("en-IN")}</p>
                  <span className="text-[9px] text-slate-400 font-medium">To Vehicles</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">Discount Income</p>
                <div className="flex flex-col mt-1">
                  <p className="text-base font-black text-emerald-600 truncate">₹{metrics.totalDiscountIncome.toLocaleString("en-IN")}</p>
                  <span className="text-[9px] text-emerald-500 font-bold">Gross 4% Cut</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">TDS Deducted</p>
                <div className="flex flex-col mt-1">
                  <p className="text-base font-black text-amber-600 truncate">₹{metrics.totalTdsDeducted.toLocaleString("en-IN")}</p>
                  <span className="text-[9px] text-slate-400 font-medium">Hold Pool Pool</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Submitted Bills</p>
                <div className="flex flex-col mt-1">
                  <p className="text-base font-black text-slate-800 truncate">₹{metrics.submittedBillsAmt.toLocaleString("en-IN")}</p>
                  <span className="text-[9px] text-blue-500 font-bold flex items-center gap-0.5"><CheckCircle2 size={10}/> At Party</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-100 bg-amber-50/10 shadow-sm flex flex-col justify-between">
                <p className="text-[10px] uppercase font-bold tracking-wider text-amber-700">Available Bills</p>
                <div className="flex flex-col mt-1">
                  <p className="text-base font-black text-amber-600 truncate">₹{metrics.availableBillsAmt.toLocaleString("en-IN")}</p>
                  <span className="text-[9px] text-amber-500 font-bold flex items-center gap-0.5"><AlertTriangle size={10}/> Unsubmitted</span>
                </div>
              </div>
            </div>

            {/* TRANSACTION GRID SYSTEM REVIEWS */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Recent Transactions Logs</h3>
              <div className="space-y-2 overflow-y-auto max-h-[350px] scrollbar-none">
                {filteredTransactions.map((tx: any) => (
                  <div key={tx.id} onClick={() => setSelectedTxDetail(tx)} className="bg-white border border-slate-200/70 p-3 rounded-xl shadow-sm flex items-center justify-between hover:border-brand-blue/40 cursor-pointer transition-all active:scale-[0.99]">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${tx.status === "pending" ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"}`}><Layers size={16} /></div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-extrabold text-slate-800 text-xs">{tx.party}</p>
                          <span className="text-[9px] font-bold px-1.5 bg-slate-100 text-slate-600 rounded">{tx.truck}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Challan No: {tx.challanNo} • Time: {tx.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-brand-navy text-xs">- ₹{tx.payable.toLocaleString("en-IN")}</p>
                      <p className="text-[9px] text-emerald-600 font-bold mt-0.5">Disc: +₹{tx.disc.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                ))}
                {filteredTransactions.length === 0 && <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400 font-semibold text-sm">No transaction records match the specified filters.</div>}
              </div>
            </div>

          </div>
        )}

        {/* COMPONENT TAB TUNNEL ROUTERS */}
        {activeTab === "new-entry" && (
          <div>
            <header className="mb-4">
              <h1 className="text-xl md:text-2xl font-black text-brand-navy">New Challan Registration</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Register dynamic logistics logs and compute discount rates.</p>
            </header>
            <ChallanEntry />
          </div>
        )}

        {activeTab === "records" && (
          <div>
            <header className="mb-4">
              <h1 className="text-xl md:text-2xl font-black text-brand-navy">Create Corporate Invoice & Reconciliation</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Bundle unsubmitted fleet accounts and dispatch gross bills to vendors.</p>
            </header>
            <CreateInvoice />
          </div>
        )}

      </main>

      {/* MOBILE NAVIGATION PORT CONTAINER */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-brand-navy text-white h-16 flex items-center justify-around z-40 border-t border-white/5">
        <button onClick={() => setActiveTab("overview")} className={`flex flex-col items-center gap-1 py-1 w-16 ${activeTab === "overview" ? "text-brand-cyan" : "text-slate-400"}`}><LayoutDashboard size={18} /><span className="text-[9px] font-bold">Home</span></button>
        <button onClick={() => setActiveTab("new-entry")} className="flex flex-col items-center justify-center -translate-y-4 bg-brand-blue text-white h-14 w-14 rounded-full border-4 border-slate-100 shadow-xl"><Plus size={22} /></button>
        <button onClick={() => setActiveTab("records")} className={`flex flex-col items-center gap-1 py-1 w-16 ${activeTab === "records" ? "text-brand-cyan" : "text-slate-400"}`}><FileSpreadsheet size={18} /><span className="text-[9px] font-bold">Invoice</span></button>
      </nav>

      {/* =========================================================================
          MODAL 1: RECENT TRANSACTION GRANULAR DETAILS OVERLAY POP-UP
          ========================================================================= */}
      {selectedTxDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white text-brand-navy rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100">
            <div className="bg-brand-navy p-4 text-white font-bold text-xs uppercase flex items-center justify-between">
              <span className="flex items-center gap-2"><CreditCard size={15} className="text-brand-cyan" /> Challan Audit Manifest</span>
              <button onClick={() => setSelectedTxDetail(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-2.5 font-semibold text-slate-600 text-xs">
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Voucher Reference:</span><span className="font-mono font-black text-brand-blue">{selectedTxDetail.voucherNo}</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Challan Date & ID:</span><span>{selectedTxDetail.challanDate} (# {selectedTxDetail.challanNo})</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Associated Party Name:</span><span className="text-brand-navy font-black">{selectedTxDetail.party}</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Vehicle Owner Node:</span><span>{selectedTxDetail.ownerName}</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Assigned Truck Fleet:</span><span className="uppercase font-black text-brand-navy">{selectedTxDetail.truck}</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Gross Freight Inflow:</span><span className="text-slate-900 font-bold">₹{selectedTxDetail.amt.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Our App Profit (4%):</span><span className="text-emerald-600 font-black">+ ₹{selectedTxDetail.disc.toLocaleString("en-IN")}</span></div>
              {selectedTxDetail.shortageAmt > 0 && <div className="flex justify-between border-b pb-1.5 text-red-500"><span className="text-red-400">Shortage Claim Charge:</span><span>- ₹{selectedTxDetail.shortageAmt} ({selectedTxDetail.shortageWt} MT)</span></div>}
              <div className="flex justify-between border-b pb-1.5"><span className="text-slate-400">Advances Subtotal (Diesel/Cash):</span><span className="text-amber-600">₹{(selectedTxDetail.diesel + selectedTxDetail.cash + selectedTxDetail.advance).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between pt-1 text-sm font-black text-brand-navy bg-slate-50 p-2 rounded-xl"><span className="text-slate-500">Net Remitted to Owner:</span><span className="text-brand-blue">₹{selectedTxDetail.payable.toLocaleString("en-IN")}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ADD FUND OVERLAY MODAL */}
      {showAddFundModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white text-brand-navy rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100">
            <div className="bg-brand-navy p-4 text-white font-bold text-sm flex items-center gap-2"><Wallet size={16} className="text-brand-cyan" /> Add Capital Inflow</div>
            <form onSubmit={handleAddFund} className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Select Destination Account</label>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-brand-navy focus:outline-none">
                  {banksPool.map((b) => <option key={b.id} value={b.bankName + " - " + b.accountNumber.slice(-4)}>{b.bankName} - {b.accountNumber.slice(-4)}</option>)}
                  {banksPool.length === 0 && <option>No linked corporate banks found</option>}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Inflow Amount (₹)</label>
                <input type="number" required placeholder="e.g., 500000" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-brand-navy focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddFundModal(false)} className="w-1/2 bg-slate-100 text-slate-500 font-bold py-2 rounded-xl text-xs">Cancel</button>
                <button type="submit" className="w-1/2 bg-brand-blue text-white font-bold py-2 rounded-xl text-xs shadow-md">Confirm Credit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD BANK MODAL */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-brand-navy p-4 text-white font-bold text-xs uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Landmark size={15} className="text-brand-cyan" /> Map Workspace Bank Account</span>
              <button onClick={() => setShowAddBankModal(false)} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveBankAccount} className="p-4 space-y-3.5">
              <input type="text" required placeholder="Bank Title Name (e.g., SBI)" value={newBank.bankName} onChange={(e) => setNewBank({...newBank, bankName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-brand-navy focus:outline-none" />
              <input type="text" required placeholder="Account Number" value={newBank.accountNumber} onChange={(e) => setNewBank({...newBank, accountNumber: e.target.value.replace(/\D/g, "")})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-brand-navy focus:outline-none" />
              <input type="text" required placeholder="IFSC Code" maxLength={11} value={newBank.ifscCode} onChange={(e) => setNewBank({...newBank, ifscCode: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-brand-navy focus:outline-none uppercase" />
              <input type="text" required placeholder="Branch Name Location" value={newBank.branchName} onChange={(e) => setNewBank({...newBank, branchName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-brand-navy focus:outline-none" />
              <div className="flex gap-2 justify-end border-t pt-2"><button type="button" onClick={() => setShowAddBankModal(false)} className="bg-slate-100 text-slate-500 font-bold px-4 py-2 rounded-xl text-xs">Cancel</button><button type="submit" className="bg-brand-blue text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md">Link Node</button></div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}