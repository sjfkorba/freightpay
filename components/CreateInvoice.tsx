"use client";

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, query, where, doc, writeBatch, orderBy, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { Search, FileSpreadsheet, PlusCircle, Check, Printer, FileText, History, CheckCircle, RefreshCw } from "lucide-react";

interface Party {
  id: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
}

interface BankAccount {
  id?: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
}

export default function CreateInvoice() {
  const { user, profile } = useAuth();
  
  const [partiesPool, setPartiesPool] = useState<Party[]>([]);
  const [searchParty, setSearchParty] = useState("");
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [isPartyDropdown, setIsPartyDropdown] = useState(false);

  // Unbilled & Historical States
  const [pendingChallans, setPendingChallans] = useState<any[]>([]);
  const [selectedChallanIds, setSelectedChallanIds] = useState<string[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<any[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [globalLoading, setGlobalLoading] = useState(false);
  
  const [banksPool, setBanksPool] = useState<BankAccount[]>([]);

  // 1. Initial State में ही ऑटो-जनरेटेड इनवॉइस नंबर सेट करें
  const [billNo, setBillNo] = useState(() => {
    return "SS/" + new Date().getFullYear() + "-" + Math.floor(10 + Math.random() * 90) + "/" + Math.floor(1 + Math.random() * 9);
  });

  // जब भी कोई पार्टी बदली जाए या रिफ्रेश हो, नया यूनिक बिल नंबर सेट हो
  useEffect(() => {
    setBillNo("SS/" + new Date().getFullYear() + "-" + Math.floor(10 + Math.random() * 90) + "/" + Math.floor(1 + Math.random() * 9));
  }, [selectedParty, refreshTrigger]);

  // Fetch Masters, Banks & Historical Corporate Invoices
  useEffect(() => {
    const fetchPartiesAndHistory = async () => {
      if (!user) return;
      try {
        const partySnap = await getDocs(query(collection(db, "parties"), where("createdBy", "==", user.uid)));
        setPartiesPool(partySnap.docs.map(d => ({ id: d.id, ...d.data() } as Party)));

        const bankSnap = await getDocs(query(collection(db, "bank_accounts"), where("createdBy", "==", user.uid)));
        setBanksPool(bankSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount)));

        const historySnap = await getDocs(query(
          collection(db, "challans"), 
          where("createdBy", "==", user.uid), 
          where("challanSubmitToParty", "==", "submitted"), 
          orderBy("vendorBillNo", "desc")
        ));
        
        // 🔥 FIX LOGIC: Grouping and merging all items sharing the same vendorBillNo
        const uniqueBills: Record<string, any> = {};
        historySnap.docs.forEach(d => {
          const data = d.data();
          if (data.vendorBillNo) {
            if (!uniqueBills[data.vendorBillNo]) {
              uniqueBills[data.vendorBillNo] = { 
                id: d.id, 
                ...data,
                items: [...(data.items || [])] // shallow copy arrays
              };
            } else {
              // If bill exists, aggregate and merge remaining items seamlessly
              uniqueBills[data.vendorBillNo].items = [
                ...uniqueBills[data.vendorBillNo].items,
                ...(data.items || [])
              ];
            }
          }
        });
        setInvoiceHistory(Object.values(uniqueBills));
      } catch (err) {
        console.error("History Sync Failure:", err);
      }
    };
    fetchPartiesAndHistory();
  }, [user, refreshTrigger]);

  // Fetch Unsubmitted Lines Matrix
  useEffect(() => {
    const fetchPendingChallans = async () => {
      if (!user || !selectedParty) return;
      try {
        const q = query(
          collection(db, "challans"),
          where("createdBy", "==", user.uid),
          where("partyId", "==", selectedParty.id),
          where("challanSubmitToParty", "==", "pending")
        );
        const snap = await getDocs(q);
        
        const itemsArray: any[] = [];
        snap.docs.forEach((docRef) => {
          const voucher = docRef.data();
          voucher.items.forEach((item: any, idx: number) => {
            itemsArray.push({
              docId: docRef.id,
              itemKey: `${docRef.id}-${idx}`,
              rawIndex: idx,
              ownerName: voucher.ownerName,
              ownerPan: voucher.ownerPan,
              ownerMobile: voucher.ownerMobile,
              challanNo: item.challanNo,
              challanDate: item.challanDate,
              truckNo: item.truckNo,
              route: item.route,
              challanWt: item.challanWt,
              recdWt: item.recdWt,
              rate: item.rate,
              freightWt: item.freightWt,
              freightAmt: item.freightAmt,
              diesel: item.diesel,
              cash: item.cash,
              advance: item.advance,
              munsi: item.munsi,
              tds: item.tds,
              other: item.other
            });
          });
        });
        setPendingChallans(itemsArray);
        setSelectedChallanIds([]);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPendingChallans();
  }, [selectedParty, user, refreshTrigger]);

  const handleToggleSelect = (itemKey: string) => {
    if (selectedChallanIds.includes(itemKey)) {
      setSelectedChallanIds(selectedChallanIds.filter(id => id !== itemKey));
    } else {
      setSelectedChallanIds([...selectedChallanIds, itemKey]);
    }
  };

  const selectedItems = pendingChallans.filter(c => selectedChallanIds.includes(c.itemKey));

  // Process & Lock Corporate Bill Bundle
  const handleGenerateInvoice = async () => {
    if (selectedItems.length === 0) {
      alert("Please select at least one challan to build a bill.");
      return;
    }

    let finalBillNo = billNo;
    if (!finalBillNo) {
      finalBillNo = "SS/" + new Date().getFullYear() + "-" + Math.floor(10 + Math.random() * 90) + "/" + Math.floor(1 + Math.random() * 9);
    }

    setGlobalLoading(true);

    try {
      const batch = writeBatch(db);
      const distinctDocIds = Array.from(new Set(selectedItems.map(item => item.docId)));
      
      for (const dId of distinctDocIds) {
        const docRef = doc(db, "challans", dId);
        batch.update(docRef, {
          challanSubmitToParty: "submitted",
          vendorBillNo: finalBillNo, 
          vendorBillDate: new Date().toLocaleDateString('en-IN'),
          vendorPaymentStatus: "Pending" 
        });
      }

      await batch.commit();
      
      spoolSilentPrintPDF(selectedItems, finalBillNo, new Date().toLocaleDateString('en-IN'), selectedParty?.name);
      
      alert(`Vendor Bill ${finalBillNo} Created & Locked!`);
      setSelectedParty(null);
      setSearchParty("");
      setPendingChallans([]);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert("Pipeline compilation error.");
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Toggle Collection Inflow Status From Pending To Received Paid
  const handleTogglePaymentStatus = async (docId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Paid" ? "Pending" : "Paid";
    if (!window.confirm(`Are you sure you want to change Vendor Payment status to: ${nextStatus}?`)) return;
    
    try {
      const docRef = doc(db, "challans", docId);
      await updateDoc(docRef, { vendorPaymentStatus: nextStatus });
      alert(`Status Updated to ${nextStatus}!`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert("Failed to adjust payment track flags.");
    }
  };

  // ─── NO POP-UP BLOCKER SILENT PRINT MATRIX SYSTEM ───
  const spoolSilentPrintPDF = (items: any[], currentBillNo: string, billDate: string, targetPartyName: any) => {
    const totalChWt = items.reduce((acc, c) => acc + (Number(c.challanWt) || 0), 0);
    const totalRecdWt = items.reduce((acc, c) => acc + (Number(c.recdWt) || 0), 0);
    const totalFrWt = items.reduce((acc, c) => acc + (Number(c.freightWt) || 0), 0);
    const totalFrAmt = items.reduce((acc, c) => acc + (Number(c.freightAmt) || 0), 0);
    const totalDiesel = items.reduce((acc, c) => acc + (Number(c.diesel) || 0), 0);
    const totalCash = items.reduce((acc, c) => acc + (Number(c.cash) || 0), 0);
    const totalAdv = items.reduce((acc, c) => acc + (Number(c.advance) || 0), 0);
    const totalMunsi = items.reduce((acc, c) => acc + (Number(c.munsi) || 0), 0);
    const totalTds = items.reduce((acc, c) => acc + (Number(c.tds) || 0), 0);
    const totalOther = items.reduce((acc, c) => acc + (Number(c.other) || 0), 0);
    const finalRemittanceSum = totalFrAmt - (totalDiesel + totalCash + totalAdv + totalMunsi + totalTds + totalOther);

    const rowsHtml = items.map((c, i) => `
      <tr style="font-size: 11px; font-weight: 500;">
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${c.challanDate || "-"}</td>
        <td style="border: 1px solid #000; padding: 4px; text-transform: capitalize;">${c.route || "-"}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${c.challanNo || "-"}</td>
        <td style="border: 1px solid #000; padding: 4px; text-transform: uppercase; font-weight: bold;">${c.truckNo || "-"}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${(Number(c.challanWt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${(Number(c.recdWt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${(Number(c.rate) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-weight: bold;">${(Number(c.freightWt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-weight: bold;">₹${(Number(c.freightAmt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${c.diesel > 0 ? Number(c.diesel).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${c.cash > 0 ? Number(c.cash).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${c.advance > 0 ? Number(c.advance).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">-</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">-</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${c.munsi > 0 ? Number(c.munsi).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right;">${(Number(c.tds) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">-</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-weight: bold; background: #F8FAFC;">₹${(Number(c.freightAmt) - ((Number(c.diesel)||0)+(Number(c.cash)||0)+(Number(c.advance)||0)+(Number(c.munsi)||0)+Number(c.tds)+(Number(c.other||0)))).toFixed(2)}</td>
      </tr>
    `).join("");

    // Active Linked Bank HTML Engine Setup for Invoice Footer
    const activeBankHtml = banksPool.length > 0 ? `
      <div style="margin-top: 20px; font-size: 11px; font-weight: bold; border: 1px solid #000; padding: 8px; width: 320px; border-radius: 4px;">
        <span style="text-decoration: underline; color:#333;">Our Bank Details for Remittance:</span><br/>
        Bank Name: ${banksPool[0].bankName}<br/>
        A/c No: ${banksPool[0].accountNumber}<br/>
        IFSC Code: ${banksPool[0].ifscCode}<br/>
        Branch Name: ${banksPool[0].branchName}
      </div>
    ` : '';

    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const docFrame = iframe.contentWindow?.document || iframe.contentDocument;
    if (!docFrame) return;

    docFrame.write(`
      <html>
        <head>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #000; margin: 0; background: #fff; }
            .header-layout { width: 100%; border-collapse: collapse; }
            .master-identity { font-size: 24px; font-weight: 900; text-transform: uppercase; }
            .credential-panel { text-align: right; font-size: 11px; font-weight: bold; }
            .billing-table { width: 100%; border-collapse: collapse; margin-top: 15px; border: 1px solid #000; }
            .billing-table th { border: 1px solid #000; padding: 5px; font-size: 10px; background: #fff; }
            .billing-table td { border: 1px solid #000; }
            .total-row { font-weight: bold; font-size: 11px; }
            .total-row td { border: 1px solid #000; padding: 5px; }
          </style>
        </head>
        <body>
          <table class="header-layout">
            <tr>
              <td>
                <span class="master-identity">${profile?.firmName || 'SHATRUGHAN SHARMA'}</span><br/>
                <span style="font-size: 11px; font-weight: bold;">Add - ${profile?.officeAddress || 'Korba, Chhattisgarh'}</span>
              </td>
              <td class="credential-panel">
                PAN : ${profile?.panNumber || '-'}<br/>
                Mobile # ${profile?.mobileNumber || '-'}
              </td>
            </tr>
          </table>
          <hr style="border:0; border-top:1px dashed #000; margin: 10px 0;" />
          <div style="font-size: 11px; font-weight: bold; display: flex; justify-content: space-between;">
            <div>
              <span style="text-decoration: underline;">Billed To,</span><br/>
              <span style="font-size: 13px; font-weight: 900; display: block; margin-top: 2px;">M/s ${targetPartyName}</span>
            </div>
            <div style="text-align: right;">
              Bill No: ${currentBillNo}<br/>
              Bill Date : ${billDate}
            </div>
          </div>
          <table class="billing-table">
            <thead>
              <tr>
                <th>Sl No.</th><th>Challan Date</th><th>Route</th><th>Challan No.</th><th>Truck No.</th><th>Challan Wt</th><th>Recd Wt</th><th>Rate</th><th>Freight Wt</th><th>Freight Amt</th><th>Diesel</th><th>Cash</th><th>Advance</th><th>Shortage</th><th>Shortage Amount</th><th>Munsi</th><th>TDS</th><th>Other</th><th style="background:#F1F5F9;">Payable Amt</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="5" style="text-align: center; font-weight: 900;">Total :</td>
                <td style="text-align: right;">${totalChWt.toFixed(2)}</td><td style="text-align: right;">${totalRecdWt.toFixed(2)}</td><td></td><td style="text-align: right;">${totalFrWt.toFixed(2)}</td><td style="text-align: right;">₹${totalFrAmt.toLocaleString("en-IN", {minimumFractionDigits:2})}</td><td style="text-align: right;">${totalDiesel > 0 ? totalDiesel.toFixed(2) : '-'}</td><td style="text-align: right;">${totalCash > 0 ? totalCash.toFixed(2) : '-'}</td><td style="text-align: right;">${totalAdv > 0 ? totalAdv.toFixed(2) : '-'}</td><td style="text-align: center;">-</td><td style="text-align: center;">-</td><td style="text-align: right;">${totalMunsi > 0 ? totalMunsi.toFixed(2) : '-'}</td><td style="text-align: right;">${totalTds.toFixed(2)}</td><td style="text-align: center;">-</td><td style="text-align: right; font-weight: 900; background: #E2E8F0;">₹${finalRemittanceSum.toLocaleString("en-IN", {minimumFractionDigits:2})}</td>
              </tr>
            </tbody>
          </table>
          
          <div style="display: flex; justify-content: space-between; align-items: flex-end;">
            ${activeBankHtml}
            <div style="margin-top: 40px; text-align: center; font-size: 11px; font-weight: bold; width: 120px;">
              <br/><br/>
              <hr style="border: 0; border-top: 1px solid #000; margin-bottom: 4px;"/>
              Signature
            </div>
          </div>
        </body>
      </html>
    `);
    docFrame.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      document.body.removeChild(iframe); 
    }, 500);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 text-[12px] p-4">
      
      {/* SELECTION MECHANICS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
          Step 1: Choose Party for Corporate Invoicing (बिलिंग पार्टी चुनें)
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={15} />
          <input
            type="text" placeholder="Search Party Name to pull unsubmitted logs..." value={searchParty}
            onFocus={() => setIsPartyDropdown(true)}
            onChange={(e) => { setSearchParty(e.target.value); setSelectedParty(null); setIsPartyDropdown(true); }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 font-bold text-slate-800 focus:outline-none focus:border-blue-500"
          />
          {selectedParty && <span className="absolute right-3 top-2.5 bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-bold">Active: {selectedParty.name}</span>}

          {isPartyDropdown && searchParty && (
            <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl z-50 max-h-36 overflow-y-auto divide-y">
              {partiesPool.filter(p => p.name.toLowerCase().includes(searchParty.toLowerCase())).map(p => (
                <div key={p.id} onClick={() => { setSelectedParty(p); setSearchParty(p.name); setIsPartyDropdown(false); }} className="p-2.5 hover:bg-slate-50 cursor-pointer font-bold text-slate-700 text-xs">{p.name}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* UNBILLED MANIFEST POOL */}
      {selectedParty && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden transition-all">
          <div className="bg-slate-800 p-3 text-white flex justify-between items-center">
            <span className="font-black text-xs flex items-center gap-1.5"><FileSpreadsheet size={15} className="text-cyan-400" /> Unbilled Challans Pool</span>
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded font-mono font-black text-cyan-300">Next Invoice No: {billNo}</span>
          </div>

          <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
            <p className="text-slate-500 font-semibold text-xs">Select specific rows below to bundle. ({selectedChallanIds.length} Checked)</p>
            {selectedChallanIds.length > 0 && (
              <button
                onClick={handleGenerateInvoice} disabled={globalLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow transition-all flex items-center gap-1.5 uppercase text-[11px] tracking-wider"
              >
                <Printer size={13} /> {globalLoading ? "Generating..." : "Print & Submit Bill"}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 font-bold border-b text-[10px] uppercase">
                  <th className="p-3 text-center w-12">Select</th>
                  <th className="p-3">Truck Plate</th>
                  <th className="p-3">Challan No</th>
                  <th className="p-3">Route</th>
                  <th className="p-3">Ch / Rec Wt</th>
                  <th className="p-3">Gross Freight</th>
                  <th className="p-3">Owner Account</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingChallans.map((item) => (
                  <tr key={item.itemKey} onClick={() => handleToggleSelect(item.itemKey)} className={`cursor-pointer transition-all ${selectedChallanIds.includes(item.itemKey) ? "bg-blue-50/60 font-bold" : "hover:bg-slate-50 font-medium"}`}>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedChallanIds.includes(item.itemKey)} onChange={() => handleToggleSelect(item.itemKey)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    </td>
                    <td className="p-3 font-black text-slate-700 uppercase">{item.truckNo}</td>
                    <td className="p-3 text-blue-600 font-bold">{item.challanNo}</td>
                    <td className="p-3 capitalize">{item.route || "-"}</td>
                    <td className="p-3 text-slate-500">{item.challanWt} / {item.recdWt}</td>
                    <td className="p-3 font-black text-slate-800">₹{(Number(item.freightAmt) || 0).toLocaleString("en-IN")}</td>
                    <td className="p-3 text-slate-500 text-[11px] font-bold">{item.ownerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingChallans.length === 0 && <p className="text-center text-slate-400 py-12 font-semibold italic">No unbilled logs found for this party.</p>}
          </div>
        </div>
      )}

      {/* INVOICE HISTORY VAULT & LIVE STATUS CONTROLS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-3 mb-3 gap-2">
          <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
            <History size={14} className="text-blue-600" /> Corporate Invoice Ledger History (विधेयक इतिहास)
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
            <input 
              type="text" placeholder="Search Bill No (e.g., SS/)..." value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-700 font-bold focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1 scrollbar-none">
          {invoiceHistory
            .filter(v => v.vendorBillNo?.toLowerCase().includes(historySearchQuery.toLowerCase()))
            .map((v) => (
              <div key={v.id} className="border border-slate-100 bg-slate-50/60 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-200 transition-all">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-700 bg-white border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">{v.vendorBillNo}</span>
                    <p className="font-black text-slate-800 text-xs">Party: {v.partyName}</p>
                    
                    {/* Live Dynamic Color Status Badges */}
                    <span 
                      onClick={() => handleTogglePaymentStatus(v.id, v.vendorPaymentStatus || "Pending")}
                      className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${
                        v.vendorPaymentStatus === "Paid" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                      }`}
                    >
                      {v.vendorPaymentStatus === "Paid" ? "● Paid (वसूल)" : "⏳ Pending (बाकी)"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">
                    Total Mixed Records: <span className="text-brand-blue font-black">${v.items?.length || 0} Logs</span> • Bill Date: {v.vendorBillDate || 'Today'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Gross Corporate Receivable</span>
                    <p className="font-black text-brand-blue text-xs">₹${v.items?.reduce((acc: number, curr: any) => acc + (curr.freightAmt || 0), 0).toLocaleString("en-IN")}</p>
                  </div>
                  <button 
                    onClick={() => spoolSilentPrintPDF(v.items || [], v.vendorBillNo, v.vendorBillDate || new Date().toLocaleDateString('en-IN'), v.partyName)} 
                    className="p-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-brand-light flex items-center gap-1 shadow-sm font-bold text-[11px]"
                  >
                    <Printer size={13} /> Reprint Bill
                  </button>
                </div>
              </div>
            ))
          }
          {invoiceHistory.filter(v => v.vendorBillNo?.toLowerCase().includes(historySearchQuery.toLowerCase())).length === 0 && (
            <p className="text-center text-slate-400 py-8 font-medium italic">No corresponding invoice data matches your search query.</p>
          )}
        </div>
      </div>

    </div>
  );
}