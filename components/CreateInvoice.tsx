"use client";

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, query, where, doc, writeBatch, orderBy, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { Search, FileSpreadsheet, Printer, History, Download, X, Edit3, Plus, RefreshCw, Check, AlertCircle } from "lucide-react";

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

  // 🔥 14-Field Detailed Pop-up Edit State Matrix
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeEditingItem, setActiveEditingItem] = useState<any>(null);
  const [editFormFields, setEditFormFields] = useState<any>({
    challanDate: "", route: "", challanNo: "", biltyNo: "", truckNo: "",
    challanWt: 0, recdWt: 0, rate: 0, shortageRate: 0,
    diesel: 0, cash: 0, advance: 0, munsi: 0, other: 0
  });

  const [modifyingBillNo, setModifyingBillNo] = useState<string | null>(null);

  // Initial Invoice Number Auto-Generation State
  const [billNo, setBillNo] = useState(() => {
    return "SS/" + new Date().getFullYear() + "-" + Math.floor(10 + Math.random() * 90) + "/" + Math.floor(1 + Math.random() * 9);
  });

  useEffect(() => {
    if (!modifyingBillNo) {
      setBillNo("SS/" + new Date().getFullYear() + "-" + Math.floor(10 + Math.random() * 90) + "/" + Math.floor(1 + Math.random() * 9));
    }
  }, [selectedParty, refreshTrigger, modifyingBillNo]);

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
        
        const uniqueBills: Record<string, any> = {};
        historySnap.docs.forEach(d => {
          const data = d.data();
          if (data.vendorBillNo) {
            if (!uniqueBills[data.vendorBillNo]) {
              uniqueBills[data.vendorBillNo] = { 
                id: d.id, 
                ...data,
                items: (data.items || []).map((item: any, idx: number) => ({
                  ...item,
                  docId: d.id,
                  itemKey: `${d.id}-${idx}`,
                  rawIndex: idx,
                  vendorPaymentStatus: data.vendorPaymentStatus || "Pending"
                }))
              };
            } else {
              const mergedItems = (data.items || []).map((item: any, idx: number) => ({
                ...item,
                docId: d.id,
                itemKey: `${d.id}-${idx}`,
                rawIndex: idx,
                vendorPaymentStatus: data.vendorPaymentStatus || "Pending"
              }));
              uniqueBills[data.vendorBillNo].items = [
                ...uniqueBills[data.vendorBillNo].items,
                ...mergedItems
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
              shortageRate: item.shortageRate || 0,
              shortageWt: item.shortageWt || 0,
              shortageAmt: item.shortageAmt || 0,
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

    let finalBillNo = modifyingBillNo || billNo;
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
      
      generateProfessionalInvoicePDF(selectedItems, finalBillNo, new Date().toLocaleDateString('en-IN'), selectedParty?.name);
      
      alert(`Vendor Bill ${finalBillNo} Locked & Dispatched Successfully!`);
      setSelectedParty(null);
      setSearchParty("");
      setPendingChallans([]);
      setModifyingBillNo(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert("Pipeline compilation error.");
    } finally {
      setGlobalLoading(false);
    }
  };

  // ACTIVATE INVOICE MODIFICATION MODE
  const handleActivateModification = (bill: any) => {
    const targetParty = partiesPool.find(p => p.name === bill.partyName);
    if (!targetParty) {
      alert("Billing party context configuration node missing.");
      return;
    }
    setModifyingBillNo(bill.vendorBillNo);
    setSelectedParty(targetParty);
    setSearchParty(targetParty.name);
    setPendingChallans(bill.items);
    setSelectedChallanIds(bill.items.map((i: any) => i.itemKey));
  };

  // UNLINK SINGLE CHALLAN FROM EXISTING INVOICE
  const handleUnlinkChallanFromInvoice = async (item: any) => {
    if (!window.confirm("Remove this specific challan item node from this active corporate invoice summary?")) return;
    try {
      const docRef = doc(db, "challans", item.docId);
      await updateDoc(docRef, {
        challanSubmitToParty: "pending",
        vendorBillNo: "",
        vendorBillDate: ""
      });
      alert("Challan Unlinked from Invoice successfully!");
      setRefreshTrigger(prev => prev + 1);
      if (modifyingBillNo) {
        setPendingChallans(prev => prev.filter(c => c.itemKey !== item.itemKey));
        setSelectedChallanIds(prev => prev.filter(id => id !== item.itemKey));
      }
    } catch (err) {
      alert("Purge operation failure.");
    }
  };

  // 🔥 OPEN COMPLETE POP-UP EDIT FORM PORT
  const handleOpenDetailedEditModal = (item: any) => {
    setActiveEditingItem(item);
    setEditFormFields({
      challanDate: item.challanDate || "",
      route: item.route || "",
      challanNo: item.challanNo || "",
      biltyNo: item.biltyNo || "",
      truckNo: item.truckNo || "",
      challanWt: item.challanWt || 0,
      recdWt: item.recdWt || 0,
      rate: item.rate || 0,
      shortageRate: item.shortageRate || 0,
      diesel: item.diesel || 0,
      cash: item.cash || 0,
      advance: item.advance || 0,
      munsi: item.munsi || 0,
      other: item.other || 0
    });
    setIsEditModalOpen(true);
  };

  // 🔥 SAVE COMPLETE DYNAMIC MATHEMATICAL CORRECTION FROM POP-UP FORM
  const handleSaveDetailedPopUpCorrection = async () => {
    if (!activeEditingItem) return;
    try {
      const docRef = doc(db, "challans", activeEditingItem.docId);
      
      const currentSnapshot = invoiceHistory.find(v => v.items.some((i: any) => i.itemKey === activeEditingItem.itemKey)) 
                             || { items: pendingChallans }; // Modifying or active unbilled fallbacks
      
      const rawItemsArray = [...currentSnapshot.items];
      const targetIndex = activeEditingItem.rawIndex;

      // ─── 3% FLAT LOGISTICS MATH RE-COMPUTATIONS RE-CONCILIATION ───
      const cWt = Number(editFormFields.challanWt) || 0;
      const rWt = Number(editFormFields.recdWt) || 0;
      const rate = Number(editFormFields.rate) || 0;
      const sRate = Number(editFormFields.shortageRate) || 0;

      const shortageWt = cWt > rWt ? Number((cWt - rWt).toFixed(2)) : 0;
      const shortageAmt = shortageWt > 0 ? Number((shortageWt * sRate * 1000).toFixed(2)) : 0;

      const fWt = Math.min(cWt, rWt);
      const freightAmt = fWt * rate;
      const discountAmt = freightAmt * 0.03; // Reverted Flat 3% Margin on Gross Freight
      const tds = freightAmt * 0.01; // 1% TDS on Gross

      const deductions = Number(editFormFields.diesel) + Number(editFormFields.cash) + 
                         Number(editFormFields.advance) + Number(editFormFields.munsi) + 
                         Number(editFormFields.other) + shortageAmt + tds + discountAmt;
      const payableAmt = freightAmt - deductions;

      rawItemsArray[targetIndex] = {
        ...rawItemsArray[targetIndex],
        challanDate: editFormFields.challanDate,
        route: editFormFields.route,
        challanNo: editFormFields.challanNo,
        biltyNo: editFormFields.biltyNo,
        truckNo: editFormFields.truckNo.toUpperCase(),
        challanWt: cWt,
        recdWt: rWt,
        rate: rate,
        shortageRate: sRate,
        shortageWt,
        shortageAmt,
        diesel: Number(editFormFields.diesel),
        cash: Number(editFormFields.cash),
        advance: Number(editFormFields.advance),
        munsi: Number(editFormFields.munsi),
        other: Number(editFormFields.other),
        freightWt: Number(fWt.toFixed(2)),
        freightAmt: Number(freightAmt.toFixed(2)),
        discountAmt: Number(discountAmt.toFixed(2)),
        tds: Number(tds.toFixed(2)),
        payableAmt: Number(payableAmt.toFixed(2))
      };

      // Strip extra view keys before saving back to Firestore doc array mapping
      const sanitizedForUpload = rawItemsArray.map(({ docId, itemKey, rawIndex, vendorPaymentStatus, ...rest }) => rest);

      await updateDoc(docRef, { items: sanitizedForUpload });
      alert("Invoice Node Matrix Updated & Synchronized Securely!");
      setIsEditModalOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert("Failed to adjust mathematical node parameters.");
    }
  };

  const handleTogglePaymentStatus = async (bill: any) => {
    const nextStatus = bill.vendorPaymentStatus === "Paid" ? "Pending" : "Paid";
    if (!window.confirm(`Change invoice ${bill.vendorBillNo} payment state to: ${nextStatus}?`)) return;
    
    try {
      const distinctDocIds = Array.from(new Set(bill.items.map((item: any) => item.docId))) as string[];
      const batch = writeBatch(db);
      
      distinctDocIds.forEach(dId => {
        batch.update(doc(db, "challans", dId), { vendorPaymentStatus: nextStatus });
      });
      await batch.commit();
      alert(`Invoice set to ${nextStatus}!`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      alert("Status mutation error.");
    }
  };

  // HIGH QUALITY FLUTTER STYLE LANDSCAPE PDF GENERATOR
  const generateProfessionalInvoicePDF = async (items: any[], currentBillNo: string, billDate: string, targetPartyName: any) => {
    const html2pdf = (await import("html2pdf.js")).default;

    const totalChWt = items.reduce((acc, c) => acc + (Number(c.challanWt) || 0), 0);
    const totalRecdWt = items.reduce((acc, c) => acc + (Number(c.recdWt) || 0), 0);
    const totalFrAmt = items.reduce((acc, c) => acc + (Number(c.freightAmt) || 0), 0);
    const totalDiesel = items.reduce((acc, c) => acc + (Number(c.diesel) || 0), 0);
    const totalCash = items.reduce((acc, c) => acc + (Number(c.cash) || 0), 0);
    const totalAdv = items.reduce((acc, c) => acc + (Number(c.advance) || 0), 0);
    const totalMunsi = items.reduce((acc, c) => acc + (Number(c.munsi) || 0), 0);
    const totalTds = items.reduce((acc, c) => acc + (Number(c.tds) || 0), 0);
    const totalOther = items.reduce((acc, c) => acc + (Number(c.other) || 0), 0);
    const finalRemittanceSum = totalFrAmt - (totalDiesel + totalCash + totalAdv + totalMunsi + totalTds + totalOther);

    const rowsHtml = items.map((c, i) => `
      <tr style="font-size: 11px; font-weight: 500; border-bottom: 1px solid #E2E8F0;">
        <td style="border: 1px solid #475569; padding: 6px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: center;">${c.challanDate || "-"}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-transform: capitalize;">${c.route || "-"}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold; color: #1E3A8A;">${c.challanNo || "-"}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-transform: uppercase; font-weight: 900; color: #0F172A;">${c.truckNo || "-"}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right;">${(Number(c.challanWt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right;">${(Number(c.recdWt) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; font-weight: bold; color: #047857;">₹${(Number(c.rate) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; font-weight: bold;">₹${(Number(c.freightAmt) || 0).toLocaleString("en-IN")}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; color: #B45309;">${c.diesel > 0 ? Number(c.diesel).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; color: #B45309;">${c.cash > 0 ? Number(c.cash).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; color: #B45309;">${c.advance > 0 ? Number(c.advance).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #475569; padding: 8px; text-align: right; color: #64748B;">${c.munsi > 0 ? Number(c.munsi).toFixed(2) : '-'}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; color: #EF4444;">₹${(Number(c.tds) || 0).toFixed(2)}</td>
        <td style="border: 1px solid #475569; padding: 6px; text-align: right; font-weight: 900; background: #F8FAFC; color: #1E3A8A;">₹${(Number(c.freightAmt) - ((Number(c.diesel)||0)+(Number(c.cash)||0)+(Number(c.advance)||0)+(Number(c.munsi)||0)+Number(c.tds)+(Number(c.other||0)))).toLocaleString("en-IN")}</td>
      </tr>
    `).join("");

    const activeBankHtml = banksPool.length > 0 ? `
      <div style="font-size: 11px; font-weight: bold; border: 2px solid #1E3A8A; padding: 10px; width: 340px; border-radius: 8px; background: #F8FAFC; color: #1E3A8A;">
        <span style="text-decoration: underline; text-transform: uppercase; font-size: 10px; color:#475569; display:block; margin-bottom:4px;">Our Bank Details for Remittance:</span>
        Bank Name: ${banksPool[0].bankName}<br/>
        Account Number: ${banksPool[0].accountNumber}<br/>
        IFSC Code: ${banksPool[0].ifscCode}<br/>
        Branch Name: ${banksPool[0].branchName}
      </div>
    ` : '';

    const container = document.createElement("div");
    container.innerHTML = `
      <div style="font-family: sans-serif; color: #0F172A; padding: 24px; background: #fff; width: 1060px; margin: 0 auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td>
              <span style="font-size: 26px; font-weight: 900; color: #1E3A8A; text-transform: uppercase; letter-spacing:-0.5px;">${profile?.firmName || 'Corporate Partner'}</span><br/>
              <span style="font-size: 11px; font-weight: bold; color: #64748B;">Add - ${profile?.officeAddress || 'Korba, Chhattisgarh'}</span>
            </td>
            <td style="text-align: right; font-size: 12px; font-weight: bold; color: #334155;">
              PAN : ${profile?.panNumber || '-'}<br/>
              Mobile # ${profile?.mobileNumber || '-'}
            </td>
          </tr>
        </table>
        <hr style="border:0; border-top:3px solid #1E3A8A; margin: 15px 0;" />
        <div style="font-size: 12px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 15px;">
          <div>
            <span style="text-decoration: underline; color: #64748B; text-transform: uppercase; font-size: 10px;">Billed To,</span><br/>
            <span style="font-size: 16px; font-weight: 900; color: #0F172A; display: block; margin-top: 2px;">M/s ${targetPartyName}</span>
          </div>
          <div style="text-align: right; background: #F1F5F9; padding: 8px 14px; border-radius: 8px; border: 1px solid #E2E8F0;">
            Bill No: <span style="font-family: monospace; color: #1E3A8A; font-size: 13px; font-weight:900;">${currentBillNo}</span><br/>
            Bill Date : ${billDate}
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border: 2px solid #475569;">
          <thead>
            <tr style="background: #1E3A8A; color: white; font-size: 10px; text-transform: uppercase;">
              <th style="border: 1px solid #475569; padding: 8px;">Sl No.</th>
              <th style="border: 1px solid #475569; padding: 8px;">Challan Date</th>
              <th style="border: 1px solid #475569; padding: 8px;">Route</th>
              <th style="border: 1px solid #475569; padding: 8px;">Challan No.</th>
              <th style="border: 1px solid #475569; padding: 8px;">Truck No.</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Challan Wt</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Recd Wt</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Rate</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Gross Freight</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Diesel</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Cash</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Advance</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">Munsi</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right;">TDS</th>
              <th style="border: 1px solid #475569; padding: 8px; text-align: right; background: #0284C7;">Payable Amt</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="font-weight: 900; font-size: 11px; background: #F1F5F9; border-top: 2px solid #475569;">
              <td colspan="5" style="border: 1px solid #475569; padding: 8px; text-align: center; text-transform: uppercase;">Total Matrix :</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right;">${totalChWt.toFixed(2)}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right;">${totalRecdWt.toFixed(2)}</td>
              <td style="border: 1px solid #475569; padding: 8px;"></td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#1E3A8A;">₹${totalFrAmt.toLocaleString("en-IN")}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#B45309;">${totalDiesel > 0 ? totalDiesel.toFixed(2) : '-'}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#B45309;">${totalCash > 0 ? totalCash.toFixed(2) : '-'}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#B45309;">${totalAdv > 0 ? totalAdv.toFixed(2) : '-'}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#64748B;">${totalMunsi > 0 ? totalMunsi.toFixed(2) : '-'}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; color:#EF4444;">₹${totalTds.toFixed(2)}</td>
              <td style="border: 1px solid #475569; padding: 8px; text-align: right; font-weight: 900; background: #E2E8F0; color:#1E3A8A; font-size:12px;">₹${finalRemittanceSum.toLocaleString("en-IN")}</td>
            </tr>
          </tbody>
        </table>
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px;">
          ${activeBankHtml}
          <div style="text-align: center; font-size: 11px; font-weight: bold; width: 140px;">
            <br/><br/>
            <hr style="border: 0; border-top: 1px solid #000; margin-bottom: 4px;"/>
            Authorized Signatory
          </div>
        </div>
      </div>
    `;

    const opt = {
      margin: 8,
      filename: `${currentBillNo}_Invoice.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
    };

    html2pdf().from(container).set(opt).save();
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 text-[12px] p-2 sm:p-4">
      
      {/* SELECTION MATRIX CONTROLS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative">
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Step 1: Select Corporate Party (बिलिंग पार्टी चुनें)</label>
          {modifyingBillNo && (
            <span className="text-amber-600 font-bold text-[10px] flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse">
              <AlertCircle size={12}/> Modifying Bill Mode: {modifyingBillNo}
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={15} />
          <input
            type="text" placeholder="Search Party Name to pull unsubmitted logs..." value={searchParty}
            onFocus={() => setIsPartyDropdown(true)}
            disabled={!!modifyingBillNo}
            onChange={(e) => { setSearchParty(e.target.value); setSelectedParty(null); setIsPartyDropdown(true); }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 font-bold text-slate-800 focus:outline-none focus:border-blue-500 disabled:opacity-60"
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

      {/* INVOICE MANIFEST POOL GRID */}
      {selectedParty && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden transition-all">
          <div className="bg-slate-800 p-3 text-white flex justify-between items-center">
            <span className="font-black text-xs flex items-center gap-1.5"><FileSpreadsheet size={15} className="text-cyan-400" /> Invoice Manifest Pool</span>
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded font-mono font-black text-cyan-300">
              {modifyingBillNo ? `Save Mod: ${modifyingBillNo}` : `Next Invoice: ${billNo}`}
            </span>
          </div>

          <div className="p-3 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <p className="text-slate-500 font-semibold text-xs">Select rows below to bundle. ({selectedChallanIds.length} Checked)</p>
            <div className="flex gap-2">
              {modifyingBillNo && (
                <button onClick={() => { setModifyingBillNo(null); setSelectedParty(null); setSearchParty(""); setPendingChallans([]); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-[11px] uppercase tracking-wider">Cancel</button>
              )}
              {selectedChallanIds.length > 0 && (
                <button onClick={handleGenerateInvoice} disabled={globalLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-4 rounded-lg shadow flex items-center gap-1 uppercase text-[11px] tracking-wider">
                  <Check size={13} /> {modifyingBillNo ? "Lock Modified Invoice" : "Lock & Download Bill"}
                </button>
              )}
            </div>
          </div>

          {/* MOBILE RESPONSIVE COMPACT LEDGER MATRIX */}
          <div className="block lg:hidden divide-y bg-slate-50">
            {pendingChallans.map((item, idx) => (
              <div key={item.itemKey} className={`p-3 relative font-semibold text-slate-700 text-xs ${selectedChallanIds.includes(item.itemKey) ? "bg-blue-50/40" : "bg-white"}`}>
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <input type="checkbox" checked={selectedChallanIds.includes(item.itemKey)} onChange={() => handleToggleSelect(item.itemKey)} className="h-4 w-4 rounded text-blue-600" />
                  <span className="text-[9px] font-bold text-slate-400 font-mono">Sl: #{idx + 1}</span>
                </div>
                <div className="space-y-1">
                  <p><span className="text-slate-400">Truck Fleet:</span> <span className="font-black text-brand-navy uppercase">{item.truckNo}</span></p>
                  <p><span className="text-slate-400">Challan / Date:</span> {item.challanNo} (${item.challanDate})</p>
                  <p><span className="text-slate-400">Yield Weights:</span> {item.challanWt} / {item.recdWt} MT</p>
                  <p><span className="text-slate-400">Net Freight:</span> <span className="font-black text-slate-900">₹{(item.freightAmt || 0).toLocaleString("en-IN")}</span></p>
                  <div className="flex items-center gap-1 border-t pt-1.5 mt-1">
                    <button onClick={() => handleOpenDetailedEditModal(item)} className="px-2 py-1 bg-slate-100 rounded text-brand-blue flex items-center gap-0.5"><Edit3 size={11}/> Open Full Edit Form</button>
                    <button onClick={() => handleUnlinkChallanFromInvoice(item)} className="px-2 py-1 bg-red-50 text-red-500 rounded flex items-center gap-0.5"><X size={11}/> Drop</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP CORE LEDGER GRIDS */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-500 font-bold border-b text-[9px] uppercase">
                  <th className="p-2.5 text-center w-12">Select</th>
                  <th className="p-2.5">Truck Plate</th>
                  <th className="p-2.5">Challan Code</th>
                  <th className="p-2.5">Ch / Rec Wt</th>
                  <th className="p-2.5">Rate</th>
                  <th className="p-2.5">Net Freight</th>
                  <th className="p-2.5">Advances Subtotal</th>
                  <th className="p-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingChallans.map((item) => (
                  <tr key={item.itemKey} className={`font-medium ${selectedChallanIds.includes(item.itemKey) ? "bg-blue-50/30" : "hover:bg-slate-50"}`}>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={selectedChallanIds.includes(item.itemKey)} onChange={() => handleToggleSelect(item.itemKey)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    </td>
                    <td className="p-2 font-black text-brand-navy uppercase">{item.truckNo}</td>
                    <td className="p-2 text-blue-600 font-bold">{item.challanNo}<span className="block text-[9px] text-slate-400 font-medium">{item.challanDate}</span></td>
                    <td className="p-2 text-slate-600 font-semibold">{item.challanWt} / {item.recdWt} <span className="text-[9px] text-slate-400 block font-medium">Fr: {item.freightWt || Math.min(item.challanWt, item.recdWt)} MT</span></td>
                    <td className="p-2 font-black text-slate-900">₹{item.rate}</td>
                    <td className="p-2 font-black text-slate-800">₹{(item.freightAmt || 0).toLocaleString("en-IN")}</td>
                    <td className="p-2 text-slate-400">D: {item.diesel || 0} | C: {item.cash || 0} | O: {item.advance || 0}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleOpenDetailedEditModal(item)} className="p-1.5 bg-white text-brand-blue border rounded-lg hover:bg-slate-50 font-bold flex items-center gap-0.5 shadow-sm"><Edit3 size={12}/> Edit</button>
                        <button onClick={() => handleUnlinkChallanFromInvoice(item)} className="p-1.5 bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100 flex items-center justify-center"><X size={12}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECONCILIATION HISTORICAL INVOICES LEDGERS SYSTEM */}
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
              <div key={v.vendorBillNo} className="border border-slate-100 bg-slate-50/60 p-3 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:border-slate-200 transition-all">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-700 bg-white border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">{v.vendorBillNo}</span>
                    <p className="font-black text-slate-800 text-xs">Party: {v.partyName}</p>
                    <span 
                      onClick={() => handleTogglePaymentStatus(v)}
                      className={`cursor-pointer px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${
                        v.vendorPaymentStatus === "Paid" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                      }`}
                    >
                      {v.vendorPaymentStatus === "Paid" ? "● Paid (वसूल)" : "⏳ Pending (बाकी)"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Total Coupled Logs: <span className="text-brand-blue font-black">{v.items?.length || 0} Items</span> • Date: {v.vendorBillDate || 'Today'}
                  </p>
                </div>

                <div className="flex items-center gap-3 justify-between w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0">
                  <div className="text-left md:text-right">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Net Value</span>
                    <p className="font-black text-brand-blue text-xs">₹{v.items?.reduce((acc: number, curr: any) => acc + (curr.freightAmt || 0), 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleActivateModification(v)} className="p-2 bg-white text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 font-bold text-[11px] flex items-center gap-1 shadow-sm"><RefreshCw size={12} /> Modify Bill</button>
                    <button onClick={() => generateProfessionalInvoicePDF(v.items || [], v.vendorBillNo, v.vendorBillDate || new Date().toLocaleDateString('en-IN'), v.partyName)} className="p-2 bg-white text-emerald-600 border border-emerald-200 rounded-xl hover:bg-slate-50 flex items-center gap-1 shadow-sm font-bold text-[11px]"><Download size={13} /> Save PDF</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* 🔥 =========================================================================
          14-FIELDS COMPLETE TRANSPARENT POP-UP EDIT FORM MODAL OVERLAY
          ========================================================================= */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-100 my-auto">
            <div className="bg-slate-800 p-4 text-white font-black text-xs uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5">📝 Corporate Invoice Ledger — Complete Correction Form</span>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-slate-50/50">
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Challan Date</label><input type="date" value={editFormFields.challanDate} onChange={(e) => setEditFormFields({...editFormFields, challanDate: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Route Profile</label><input type="text" value={editFormFields.route} onChange={(e) => setEditFormFields({...editFormFields, route: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Challan No *</label><input type="text" value={editFormFields.challanNo} onChange={(e) => setEditFormFields({...editFormFields, challanNo: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold text-blue-600" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Bilty No</label><input type="text" value={editFormFields.biltyNo} onChange={(e) => setEditFormFields({...editFormFields, biltyNo: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Truck No *</label><input type="text" value={editFormFields.truckNo} onChange={(e) => setEditFormFields({...editFormFields, truckNo: e.target.value.toUpperCase()})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-black uppercase text-slate-800" /></div>
              
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Challan Wt</label><input type="number" value={editFormFields.challanWt} onChange={(e) => setEditFormFields({...editFormFields, challanWt: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Recd Wt</label><input type="number" value={editFormFields.recdWt} onChange={(e) => setEditFormFields({...editFormFields, recdWt: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Rate (₹)</label><input type="number" value={editFormFields.rate} onChange={(e) => setEditFormFields({...editFormFields, rate: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold text-emerald-600" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Shortage Rate</label><input type="number" value={editFormFields.shortageRate} onChange={(e) => setEditFormFields({...editFormFields, shortageRate: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold text-red-500" /></div>
              
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Diesel Adv</label><input type="number" value={editFormFields.diesel} onChange={(e) => setEditFormFields({...editFormFields, diesel: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold text-amber-600" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Cash Adv</label><input type="number" value={editFormFields.cash} onChange={(e) => setEditFormFields({...editFormFields, cash: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold text-amber-600" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Office Adv</label><input type="number" value={editFormFields.advance} onChange={(e) => setEditFormFields({...editFormFields, advance: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Munsi Charge</label><input type="number" value={editFormFields.munsi} onChange={(e) => setEditFormFields({...editFormFields, munsi: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
              <div className="col-span-2 sm:col-span-1"><label className="text-[10px] font-bold text-slate-400 block mb-0.5">Other Charges</label><input type="number" value={editFormFields.other} onChange={(e) => setEditFormFields({...editFormFields, other: e.target.value})} className="w-full border rounded-lg p-2 bg-white focus:outline-none font-bold" /></div>
            </div>

            <div className="flex gap-2 justify-end p-4 border-t bg-white">
              <button onClick={() => setIsEditModalOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-4 py-2 rounded-xl text-xs">Cancel</button>
              <button onClick={handleSaveDetailedPopUpCorrection} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md">Recalculate & Sync Doc</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}