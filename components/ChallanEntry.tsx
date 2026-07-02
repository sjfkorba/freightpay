"use client";

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { 
  UserPlus, Search, Clipboard, Trash2, Edit2, Save, Printer, Plus, X, History 
} from "lucide-react";

interface VehicleOwner {
  id?: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
  vehicles: string[];
}

interface Party {
  id?: string;
  name: string;
  mobileNumber: string;
  panNumber: string;
}

interface ChallanLineItem {
  challanDate: string;
  route: string;
  challanNo: string;
  biltyNo: string;
  truckNo: string;
  challanWt: number;
  recdWt: number;
  rate: number;
  diesel: number;
  cash: number;
  advance: number;
  munsi: number;
  other: number;
  shortageRate: number;
  shortageWt: number;
  shortageAmt: number;
  freightWt: number;
  freightAmt: number;
  discountAmt: number;
  tds: number;
  payableAmt: number;
}

export default function ChallanEntry() {
  const { user, profile } = useAuth();
  
  const [voucherNo, setVoucherNo] = useState("");
  const [ownersPool, setOwnersPool] = useState<VehicleOwner[]>([]);
  const [partiesPool, setPartiesPool] = useState<Party[]>([]);
  
  const [searchOwner, setSearchOwner] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<VehicleOwner | null>(null);
  const [isOwnerDropdown, setIsOwnerDropdown] = useState(false);
  
  const [searchParty, setSearchParty] = useState("");
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [isPartyDropdown, setIsPartyDropdown] = useState(false);

  const [showAddOwner, setShowAddOwner] = useState(false);
  const [showAddParty, setShowAddParty] = useState(false);

  const [newOwner, setNewOwner] = useState({ name: "", mobile: "", pan: "" });
  const [registeredTrucks, setRegisteredTrucks] = useState<string[]>([]);
  const [truckInput, setTruckInput] = useState("");
  const [newParty, setNewParty] = useState({ name: "", mobile: "", pan: "" });

  const [truckSearch, setTruckSearch] = useState("");
  const [isTruckDropdown, setIsTruckDropdown] = useState(false);

  const [challansList, setChallansList] = useState<ChallanLineItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Voucher History Repository
  const [voucherHistory, setVoucherHistory] = useState<any[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState(0);

  const [currentChallan, setCurrentChallan] = useState<Partial<ChallanLineItem>>({
    challanDate: new Date().toISOString().split('T')[0],
    route: "", challanNo: "", biltyNo: "", truckNo: "",
    challanWt: 0, recdWt: 0, rate: 0, diesel: 0, cash: 0, advance: 0, munsi: 0, other: 0, shortageRate: 0
  });

  const [globalLoading, setGlobalLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);

  useEffect(() => {
    setVoucherNo("FPV-" + Math.floor(100000 + Math.random() * 900000));
  }, [selectedOwner]);

  // Sync Master Data & History Records
  useEffect(() => {
    const fetchMastersAndHistory = async () => {
      if (!user?.uid) return; 
      try {
        const ownerSnap = await getDocs(query(collection(db, "vehicle_owners"), where("createdBy", "==", user.uid)));
        const partySnap = await getDocs(query(collection(db, "parties"), where("createdBy", "==", user.uid)));
        setOwnersPool(ownerSnap.docs.map(d => ({ id: d.id, ...d.data() } as VehicleOwner)));
        setPartiesPool(partySnap.docs.map(d => ({ id: d.id, ...d.data() } as Party)));

        const historySnap = await getDocs(query(collection(db, "challans"), where("createdBy", "==", user.uid), orderBy("createdAt", "desc")));
        setVoucherHistory(historySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchMastersAndHistory();
  }, [user, showAddOwner, showAddParty, refreshHistoryTrigger]);

  const handleAddTruckPlate = () => {
    const cleanPlate = truckInput.trim().toUpperCase();
    if (cleanPlate && !registeredTrucks.includes(cleanPlate)) {
      setRegisteredTrucks([...registeredTrucks, cleanPlate]);
      setTruckInput("");
    }
  };

  const handleSaveOwnerMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setMasterLoading(true);
    try {
      const ownerData = {
        name: newOwner.name.trim(),
        mobileNumber: newOwner.mobile,
        panNumber: newOwner.pan.toUpperCase(),
        vehicles: registeredTrucks,
        createdBy: user.uid,
        sharedWith: [], 
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, "vehicle_owners"), ownerData);
      setSelectedOwner({ id: docRef.id, ...ownerData });
      setSearchOwner(ownerData.name);
      setNewOwner({ name: "", mobile: "", pan: "" });
      setRegisteredTrucks([]);
      setShowAddOwner(false);
    } catch (err) {
      alert("Error saving owner master");
    } finally {
      setMasterLoading(false);
    }
  };

  const calculateRowValues = (row: Partial<ChallanLineItem>): ChallanLineItem => {
    const cWt = Number(row.challanWt) || 0;
    const rWt = Number(row.recdWt) || 0;
    const rate = Number(row.rate) || 0;
    const sRate = Number(row.shortageRate) || 0;
    
    const shortageWt = cWt > rWt ? Number((cWt - rWt).toFixed(2)) : 0;
    const shortageAmt = shortageWt > 0 ? Number((shortageWt * sRate * 1000).toFixed(2)) : 0;

    const freightWt = Math.min(cWt, rWt);
    const freightAmt = freightWt * rate;
    const discountAmt = freightAmt * 0.03; // Flat 3% Margin on Gross Freight
    const tds = freightAmt * 0.01; 
    
    const deductions = (Number(row.diesel) || 0) + (Number(row.cash) || 0) + 
                       (Number(row.advance) || 0) + (Number(row.munsi) || 0) + 
                       (Number(row.other) || 0) + shortageAmt + tds + discountAmt;
                       
    const payableAmt = freightAmt - deductions;

    return {
      ...(row as ChallanLineItem),
      shortageWt,
      shortageAmt,
      freightWt: Number(freightWt.toFixed(2)),
      freightAmt: Number(freightAmt.toFixed(2)),
      discountAmt: Number(discountAmt.toFixed(2)),
      tds: Number(tds.toFixed(2)),
      payableAmt: Number(payableAmt.toFixed(2))
    };
  };

  const handleQueueRow = () => {
    if (!currentChallan.challanNo || !currentChallan.truckNo || !currentChallan.rate) {
      alert("Mandatory Fields Required: Truck No, Challan No and Rate");
      return;
    }

    const validatedRow = calculateRowValues(currentChallan);

    if (editingIndex !== null) {
      const updatedList = [...challansList];
      updatedList[editingIndex] = validatedRow;
      setChallansList(updatedList);
      setEditingIndex(null);
    } else {
      setChallansList([...challansList, validatedRow]);
    }
    
    setTruckSearch("");
    setCurrentChallan({
      ...currentChallan,
      challanNo: "", biltyNo: "", truckNo: "", challanWt: 0, recdWt: 0, diesel: 0, cash: 0, advance: 0, munsi: 0, other: 0, shortageRate: 0
    });
  };

  const handleEditRow = (index: number) => {
    setEditingIndex(index);
    setCurrentChallan(challansList[index]);
    setTruckSearch(challansList[index].truckNo);
  };

  const handleFinalVoucherSubmit = async () => {
    if (!user?.uid) return;
    if (!selectedOwner || !selectedParty || challansList.length === 0) {
      alert("Selections missing or queue empty.");
      return;
    }
    setGlobalLoading(true);

    const finalVoucherData = {
      voucherNo,
      ownerId: selectedOwner.id || "",
      ownerName: selectedOwner.name || "",
      ownerPan: selectedOwner.panNumber || "",
      ownerMobile: selectedOwner.mobileNumber || "",
      partyId: selectedParty.id || "",
      partyName: selectedParty.name || "",
      partyPan: selectedParty.panNumber || (selectedParty as any).pan || "", 
      items: challansList,
      
      totalGrossFreight: challansList.reduce((acc, curr) => acc + (Number(curr.freightAmt) || 0), 0),
      totalDiscountIncome: challansList.reduce((acc, curr) => acc + (Number(curr.discountAmt) || 0), 0),
      totalTdsDeducted: challansList.reduce((acc, curr) => acc + (Number(curr.tds) || 0), 0),
      totalShortageAmt: challansList.reduce((acc, curr) => acc + (Number(curr.shortageAmt) || 0), 0),
      totalPayableToVehicle: challansList.reduce((acc, curr) => acc + (Number(curr.payableAmt) || 0), 0),
      
      ourPaymentStatus: "pending", 
      challanSubmitToParty: "pending",
      vendorBillNo: "", 
      
      createdBy: user.uid,
      sharedWith: [], 
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "challans"), finalVoucherData);
      spoolSilentLandscapePDF(finalVoucherData);

      alert("Voucher Saved To Cloud & Receipt Sent to Spooler!");
      setChallansList([]);
      setSelectedOwner(null);
      setSelectedParty(null);
      setSearchOwner("");
      setSearchParty("");
      setRefreshHistoryTrigger(prev => prev + 1);
    } catch (err) {
      alert("Database error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const spoolSilentLandscapePDF = (voucher: any) => {
    const rowsHtml = voucher.items.map((item: any) => {
      const totalAdvance = (Number(item.diesel) || 0) + (Number(item.cash) || 0) + (Number(item.advance) || 0);
      return `
        <tr style="border-bottom: 1px solid #CBD5E1; font-size: 11px;">
          <td style="padding: 6px 8px; font-weight: bold; text-transform: uppercase;">${item.truckNo}</td>
          <td style="padding: 6px 8px;">${item.challanNo}</td>
          <td style="padding: 6px 8px;">${item.challanDate}</td>
          <td style="padding: 6px 8px; text-transform: capitalize;">${item.route || "-"}</td>
          <td style="padding: 6px 8px; text-align: right;">${item.challanWt} / ${item.recdWt}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${item.freightWt} MT</td>
          <td style="padding: 6px 8px; text-align: right;">₹${item.rate}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: bold;">₹${item.freightAmt.toLocaleString("en-IN")}</td>
          <td style="padding: 6px 8px; text-align: right; color: #DC2626;">${item.shortageWt > 0 ? `₹${item.shortageAmt}` : '-'}</td>
          <td style="padding: 6px 8px; text-align: right; color: #2563EB; font-weight: bold;">₹${totalAdvance.toLocaleString("en-IN")}</td>
          <td style="padding: 6px 8px; text-align: right; color: #D97706;">₹${item.discountAmt.toLocaleString("en-IN")}</td>
          <td style="padding: 6px 8px; text-align: right; color: #475569;">₹${item.tds.toLocaleString("en-IN")}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: 900; color: #0A192F; background: #F1F5F9;">₹${item.payableAmt.toLocaleString("en-IN")}</td>
        </tr>
      `;
    }).join("");

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
            @page { size: A4 landscape; margin: 15mm; }
            body { font-family: sans-serif; color: #0A192F; margin: 0; }
            .meta-wrapper { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            .meta-cell { width: 50%; vertical-align: top; }
            .meta-block { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-right: 10px; min-h: 90px; }
            .meta-block-right { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-left: 10px; min-h: 90px; }
            .meta-title { font-size: 10px; font-weight: bold; color: #0284C7; text-transform: uppercase; margin-bottom: 4px; }
            .data-matrix { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .data-matrix th { background: #0A192F; color: white; padding: 8px; font-size: 10px; text-transform: uppercase; }
            .summary-table { width: 280px; float: right; margin-top: 20px; border-collapse: collapse; }
            .summary-table td { padding: 4px 8px; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 15px;">
            <span style="font-size: 18px; font-weight: 900;">FREIGHT DISCOUNTING TRANSACTION ADVICE</span>
            <div style="font-size: 11px; font-weight: bold;">
              Voucher No: <span style="color: #0284C7; font-size: 12px;">${voucher.voucherNo}</span> | Dated: ${new Date(voucher.createdAt).toLocaleDateString('en-IN')}
            </div>
          </div>
          <table class="meta-wrapper">
            <tr>
              <td class="meta-cell">
                <div class="meta-block">
                  <div class="meta-title">Issued By</div>
                  <div style="font-size: 13px; font-weight: bold;">${profile?.firmName || 'Corporate Partner'}</div>
                  <div style="font-size: 11px; color: #475569; margin-top: 2px;">PAN: ${profile?.panNumber || '-'} | Mob: ${profile?.mobileNumber || '-'}</div>
                </div>
              </td>
              <td class="meta-cell">
                <div class="meta-block-right">
                  <div class="meta-title">Vehicle Owner</div>
                  <div style="font-size: 13px; font-weight: bold;">${voucher.ownerName}</div>
                  <div style="font-size: 11px; color: #475569; margin-top: 2px;">PAN: ${voucher.ownerPan} | Mob: ${voucher.ownerMobile || '-'}</div>
                </div>
              </td>
            </tr>
          </table>
          <table class="data-matrix">
            <thead>
              <tr>
                <th style="text-align: left;">Truck Plate</th><th style="text-align: left;">Challan No</th><th style="text-align: left;">Date</th><th style="text-align: left;">Route</th><th style="text-align: right;">Ch / Rec Wt</th><th style="text-align: right;">Fr Wt</th><th style="text-align: right;">Rate</th><th style="text-align: right;">Gross Freight</th><th style="text-align: right;">Shortage</th><th style="text-align: right;">Total Adv</th><th style="text-align: right;">Discount</th><th style="text-align: right;">TDS</th><th style="text-align: right; background: #0284C7;">Net Payable</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <table class="summary-table">
            <tr><td style="color:#64748B;">Gross Freight Sum:</td><td style="text-align:right;">₹${voucher.totalGrossFreight.toLocaleString("en-IN")}</td></tr>
            <tr><td style="color:#D97706;">Discount Income (3%):</td><td style="text-align:right; color:#D97706;">- ₹${voucher.totalDiscountIncome.toLocaleString("en-IN")}</td></tr>
            <tr><td style="color:#DC2626;">Shortage Claims Deducted:</td><td style="text-align:right; color:#DC2626;">- ₹${voucher.totalShortageAmt.toLocaleString("en-IN")}</td></tr>
            <tr style="border-top: 2px solid #0A192F; font-size: 13px;"><td style="padding-top:6px; color:#0A192F;">Net Remittance:</td><td style="text-align:right; padding-top:6px; font-size:14px; color:#0A192F;">₹${voucher.totalPayableToVehicle.toLocaleString("en-IN")}</td></tr>
          </table>
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
    <div className="w-full max-w-5xl mx-auto space-y-3 pb-12 text-[12px] p-4">
      
      {/* SEARCH CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative">
          <div className="flex justify-between items-center mb-1">
            <label className="font-bold text-slate-400 text-[10px] uppercase">1. Vehicle Owner (गाड़ी मालिक)</label>
            <button type="button" onClick={() => setShowAddOwner(true)} className="text-brand-blue font-bold text-[10px] flex items-center gap-0.5">+ Create Owner</button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input type="text" placeholder="Search Owner Name..." value={searchOwner} onFocus={() => setIsOwnerDropdown(true)} onChange={(e) => { setSearchOwner(e.target.value); setSelectedOwner(null); setIsOwnerDropdown(true); }} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 font-bold focus:outline-none" />
            {selectedOwner && <span className="absolute right-2 top-2 bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded font-bold">Active</span>}
            {isOwnerDropdown && searchOwner && (
              <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl z-50 max-h-36 overflow-y-auto divide-y">
                {ownersPool.filter(o => o.name.toLowerCase().includes(searchOwner.toLowerCase())).map(o => (
                  <div key={o.id} onClick={() => { setSelectedOwner(o); setSearchOwner(o.name); setIsOwnerDropdown(false); }} className="p-2 hover:bg-slate-50 cursor-pointer font-bold text-xs">{o.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative">
          <div className="flex justify-between items-center mb-1">
            <label className="font-bold text-slate-400 text-[10px] uppercase">2. Bill To Party (बिलिंग पार्टी)</label>
            <button type="button" onClick={() => setShowAddParty(true)} className="text-brand-blue font-bold text-[10px] flex items-center gap-0.5">+ Create Party</button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
            <input type="text" placeholder="Search Corporate Party..." value={searchParty} onFocus={() => setIsPartyDropdown(true)} onChange={(e) => { setSearchParty(e.target.value); setSelectedParty(null); setIsPartyDropdown(true); }} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 font-bold focus:outline-none" />
            {selectedParty && <span className="absolute right-2 top-2 bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded font-bold">Active</span>}
            {isPartyDropdown && searchParty && (
              <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl z-50 max-h-36 overflow-y-auto divide-y">
                {partiesPool.filter(p => p.name.toLowerCase().includes(searchParty.toLowerCase())).map(p => (
                  <div key={p.id} onClick={() => { setSelectedParty(p); setSearchParty(p.name); setIsPartyDropdown(false); }} className="p-2.5 hover:bg-slate-50 cursor-pointer font-bold text-xs">{p.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MATRIX FRAME GRID */}
      {selectedOwner && selectedParty && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          <div className="bg-brand-navy p-2 text-white flex justify-between items-center text-[11px]">
            <span className="font-black flex items-center gap-1"><Clipboard size={13} className="text-brand-cyan" /> {editingIndex !== null ? "Editing Row" : "Voucher Frame Grid"}</span>
            <span className="bg-white/10 px-2 py-0.5 rounded font-mono font-black text-brand-cyan">{voucherNo}</span>
          </div>

          <div className="p-3 bg-slate-50/60 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 border-b relative">
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Challan Date</label><input type="date" value={currentChallan.challanDate} onChange={(e) => setCurrentChallan({...currentChallan, challanDate: e.target.value})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Route Profile</label><input type="text" placeholder="Ksm-Kothari" value={currentChallan.route || ""} onChange={(e) => setCurrentChallan({...currentChallan, route: e.target.value})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Challan No *</label><input type="text" placeholder="257011" value={currentChallan.challanNo || ""} onChange={(e) => setCurrentChallan({...currentChallan, challanNo: e.target.value})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold text-brand-blue" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Bilty No</label><input type="text" placeholder="BL-992" value={currentChallan.biltyNo || ""} onChange={(e) => setCurrentChallan({...currentChallan, biltyNo: e.target.value})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            
            <div className="relative">
              <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Truck No *</label>
              <input type="text" placeholder="Type Plate..." value={truckSearch} onFocus={() => setIsTruckDropdown(true)} onChange={(e) => { setTruckSearch(e.target.value); setCurrentChallan({...currentChallan, truckNo: e.target.value.toUpperCase()}); setIsTruckDropdown(true); }} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-black uppercase text-slate-800" />
              {isTruckDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-white border rounded shadow-xl z-50 max-h-32 overflow-y-auto divide-y">
                  {selectedOwner.vehicles.filter(v => v.toLowerCase().includes(truckSearch.toLowerCase())).map((v, idx) => (
                    <div key={idx} onClick={() => { setTruckSearch(v); setCurrentChallan({...currentChallan, truckNo: v}); setIsTruckDropdown(false); }} className="p-1.5 hover:bg-slate-50 cursor-pointer font-black text-[10px]">{v}</div>
                  ))}
                </div>
              )}
            </div>

            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Challan Wt</label><input type="number" placeholder="37.28" value={currentChallan.challanWt || ""} onChange={(e) => setCurrentChallan({...currentChallan, challanWt: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Recd Wt</label><input type="number" placeholder="37.28" value={currentChallan.recdWt || ""} onChange={(e) => setCurrentChallan({...currentChallan, recdWt: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Rate (₹)</label><input type="number" placeholder="380" value={currentChallan.rate || ""} onChange={(e) => setCurrentChallan({...currentChallan, rate: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold text-emerald-600" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Shortage Rate</label><input type="number" placeholder="4" value={currentChallan.shortageRate || ""} onChange={(e) => setCurrentChallan({...currentChallan, shortageRate: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold text-red-500" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Diesel Adv</label><input type="number" value={currentChallan.diesel || ""} onChange={(e) => setCurrentChallan({...currentChallan, diesel: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold text-amber-600" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Cash Adv</label><input type="number" value={currentChallan.cash || ""} onChange={(e) => setCurrentChallan({...currentChallan, cash: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Office Adv</label><input type="number" value={currentChallan.advance || ""} onChange={(e) => setCurrentChallan({...currentChallan, advance: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Munsi Charge</label><input type="number" value={currentChallan.munsi || ""} onChange={(e) => setCurrentChallan({...currentChallan, munsi: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>
            <div><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Other</label><input type="number" value={currentChallan.other || ""} onChange={(e) => setCurrentChallan({...currentChallan, other: parseFloat(e.target.value) || 0})} className="w-full border rounded-md p-1 bg-white focus:outline-none text-[11px] font-bold" /></div>

            <div className="flex items-end">
              <button type="button" onClick={handleQueueRow} className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-black py-1.5 rounded-md flex items-center justify-center gap-0.5 text-[11px] shadow transition-all">
                <Plus size={12}/> {editingIndex !== null ? "Update" : "Queue"}
              </button>
            </div>
          </div>

          {/* TABLE DISPLAY */}
          <div className="hidden lg:block overflow-x-auto p-3">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-500 font-bold border-b text-[9px] uppercase">
                  <th className="p-1.5 text-center w-10">Sl No.</th>
                  <th className="p-1.5">Truck No.</th>
                  <th className="p-1.5">Challan No</th>
                  <th className="p-1.5">Ch / Rec Wt</th>
                  <th className="p-1.5 text-red-500">Shortage</th>
                  <th className="p-1.5">Fr Wt</th>
                  <th className="p-1.5">Gross Freight</th>
                  <th className="p-1.5 text-emerald-600">Margin (3%)</th>
                  <th className="p-1.5">TDS (1%)</th>
                  <th className="p-1.5 text-brand-blue">Payable Outflow</th>
                  <th className="p-1.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {challansList.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/80 font-medium text-slate-700">
                    <td className="p-1.5 text-center font-bold text-slate-400">{index + 1}</td>
                    <td className="p-1.5 font-black text-brand-navy uppercase">{item.truckNo}</td>
                    <td className="p-1.5 font-semibold">{item.challanNo}</td>
                    <td className="p-1.5 text-slate-400">{item.challanWt} / {item.recdWt}</td>
                    <td className="p-1.5">{item.shortageWt > 0 ? <span className="text-red-600 font-bold">{item.shortageWt} MT / ₹{item.shortageAmt}</span> : <span className="text-slate-400">-</span>}</td>
                    <td className="p-1.5 font-bold text-slate-900">{item.freightWt}</td>
                    <td className="p-1.5 font-bold">₹{item.freightAmt.toFixed(2)}</td>
                    <td className="p-1.5 text-emerald-600 font-bold">₹{item.discountAmt.toFixed(2)}</td>
                    <td className="p-1.5 text-amber-600">₹{item.tds.toFixed(2)}</td>
                    <td className="p-1.5 font-black text-brand-blue">₹{item.payableAmt.toFixed(2)}</td>
                    <td className="p-1.5 text-center flex items-center justify-center gap-1">
                      <button onClick={() => handleEditRow(index)} className="text-brand-blue hover:bg-slate-100 p-1 rounded"><Edit2 size={12}/></button>
                      <button onClick={() => setChallansList(challansList.filter((_, i) => i !== index))} className="text-red-500 hover:bg-slate-100 p-1 rounded"><Trash2 size={12}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PANEL FOOTER */}
          {challansList.length > 0 && (
            <div className="p-3 bg-slate-50 border-t flex items-center justify-between gap-4">
              <div className="flex gap-5 text-[11px]">
                <div><p className="font-bold text-slate-400 uppercase text-[9px]">Total Yield Margin (3% Sum)</p><p className="font-black text-emerald-600 text-sm">₹{challansList.reduce((acc, curr) => acc + curr.discountAmt, 0).toLocaleString("en-IN")}</p></div>
                <div><p className="font-bold text-slate-400 uppercase text-[9px]">Net Capital Outflow</p><p className="font-black text-brand-blue text-sm">₹{challansList.reduce((acc, curr) => acc + curr.payableAmt, 0).toLocaleString("en-IN")}</p></div>
              </div>
              <button onClick={handleFinalVoucherSubmit} disabled={globalLoading} className="bg-brand-navy hover:bg-slate-800 text-white font-bold py-1.5 px-4 rounded-lg shadow-sm flex items-center gap-1 uppercase tracking-wider text-[11px] transition-all"><Save size={13}/> {globalLoading ? "Processing..." : "Commit Full Voucher"}</button>
            </div>
          )}
        </div>
      )}

      {/* 🔥 REINSTATED HISTORICAL RECORDS VAULT (वाउचर इतिहास वापस लाइव किया गया) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-3 mb-3 gap-2">
          <h3 className="text-xs font-black text-brand-navy uppercase flex items-center gap-1.5"><History size={14} className="text-brand-blue" /> Historical Vault Records (वाउचर इतिहास)</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input type="text" placeholder="Search Voucher Code (FPV-)..." value={historySearchQuery} onChange={(e) => setHistorySearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-brand-navy font-bold focus:outline-none" />
          </div>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-none">
          {voucherHistory
            .filter(v => v.voucherNo?.toLowerCase().includes(historySearchQuery.toLowerCase()))
            .map((v) => (
              <div key={v.id} className="border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 hover:border-slate-200 transition-all">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-brand-blue bg-white border border-slate-200 px-1.5 py-0.5 rounded">{v.voucherNo}</span>
                    <p className="font-bold text-slate-800 text-xs">{v.ownerName}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Party: <span className="text-slate-600 font-bold">{v.partyName}</span> • Entries: {v.items?.length || 0} Logs • Mapped: {new Date(v.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-black text-brand-navy text-xs">₹{v.totalPayableToVehicle?.toLocaleString("en-IN")}</p>
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">Earned: ₹{v.totalDiscountIncome}</span>
                  </div>
                  <button onClick={() => spoolSilentLandscapePDF(v)} className="p-2 bg-white text-slate-600 border rounded-lg hover:bg-slate-100 flex items-center gap-1 shadow-sm font-bold text-[11px]"><Printer size={13} /> Reprint</button>
                </div>
              </div>
            ))
          }
          {voucherHistory.filter(v => v.voucherNo?.toLowerCase().includes(historySearchQuery.toLowerCase())).length === 0 && (
            <p className="text-center text-slate-400 py-6 font-medium italic">No previous voucher codes match your history search parameters.</p>
          )}
        </div>
      </div>

      {/* MASTER OWNER DIALOG OVERLAY */}
      {showAddOwner && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 animate-pulse-none">
            <div className="bg-brand-navy p-3 text-white font-bold text-xs uppercase flex items-center justify-between">
              <span className="flex items-center gap-1"><UserPlus size={14} /> Register Owner Master</span>
              <button onClick={() => { setShowAddOwner(false); setRegisteredTrucks([]); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveOwnerMaster} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Name *</label><input type="text" required placeholder="Rajesh" value={newOwner.name} onChange={(e) => setNewOwner({...newOwner, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-bold text-brand-navy focus:outline-none" /></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Mobile *</label><input type="tel" required maxLength={10} placeholder="10-digit" value={newOwner.mobile} onChange={(e) => setNewOwner({...newOwner, mobile: e.target.value.replace(/\D/g, "")})} className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-bold text-brand-navy focus:outline-none" /></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">PAN Number *</label><input type="text" required maxLength={10} placeholder="ABCDE1234F" value={newOwner.pan} onChange={(e) => setNewOwner({...newOwner, pan: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-bold text-brand-navy focus:outline-none uppercase" /></div>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <label className="text-[9px] font-bold text-slate-500 block mb-1">Add Fleet Vehicles</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="e.g., CG12BR1637" value={truckInput} onChange={(e) => setTruckInput(e.target.value)} className="bg-white border rounded p-1 text-xs font-black uppercase tracking-wider flex-1 focus:outline-none" />
                  <button type="button" onClick={handleAddTruckPlate} className="bg-brand-blue text-white px-2.5 rounded font-bold"><Plus size={14} /></button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {registeredTrucks.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-white text-brand-navy border px-1.5 py-0.5 rounded text-[9px] font-black uppercase shadow-sm">{t} <button type="button" onClick={() => setRegisteredTrucks(registeredTrucks.filter((_, idx) => idx !== i))} className="text-red-400"><X size={9} /></button></span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t">
                <button type="button" onClick={() => { setShowAddOwner(false); setRegisteredTrucks([]); }} className="bg-slate-100 text-slate-500 font-bold px-3 py-1 rounded text-xs">Cancel</button>
                <button type="submit" disabled={masterLoading} className="bg-brand-blue text-white font-bold px-4 py-1 rounded text-xs shadow-sm">{masterLoading ? "Saving..." : "Save Owner"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DYNAMIC MASTER PARTY OVERLAY */}
      {showAddParty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-4 space-y-4">
            <h3 className="font-black text-brand-navy text-xs uppercase flex items-center gap-1"><UserPlus size={14}/> Add New Business Party</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Party Name" value={newParty.name} onChange={(e) => setNewParty({...newParty, name: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none" />
              <input type="tel" maxLength={10} placeholder="Mobile" value={newParty.mobile} onChange={(e) => setNewParty({...newParty, mobile: e.target.value.replace(/\D/g, "")})} className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none" />
              <input type="text" maxLength={10} placeholder="PAN" value={newParty.pan} onChange={(e) => setNewParty({...newParty, pan: e.target.value.toUpperCase()})} className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none uppercase" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddParty(false)} className="bg-slate-100 text-slate-500 font-bold px-3 py-1.5 rounded-lg text-xs">Cancel</button>
              <button onClick={async () => {
                if(!newParty.name || newParty.pan.length !== 10) { alert("Invalid inputs"); return; }
                await addDoc(collection(db, "parties"), { ...newParty, createdBy: user?.uid, sharedWith: [] });
                setShowAddParty(false); setNewParty({name:"", mobile:"", pan:""});
              }} className="bg-brand-blue text-white font-bold px-4 py-1.5 rounded-lg text-xs">Save Party</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}