"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";

type Request = { userId: string; name: string; phone: string; createdAt: string; memberType: string };
export default function RegistrationReview() {
  const [items,setItems] = useState<Request[]>([]);
  const [error,setError] = useState("");
  const [working,setWorking] = useState("");
  const [loading,setLoading] = useState(true);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try {
      const res=await fetch("/api/auth/registrations",{cache:"no-store"});
      const data=await res.json() as {requests?:Request[];error?:string};
      if(!res.ok) throw new Error(data.error || "ไม่สามารถโหลดคำขออาจารย์");
      setItems(data.requests || []);setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"โหลดคำขอไม่สำเร็จ");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function decide(userId:string,decision:"approve"|"reject"){
    const selected=items.find(item=>item.userId===userId);
    if(!selected) return;
    if(!window.confirm(decision==="approve"?`ยืนยันว่า ${selected.name} เป็นอาจารย์จริง และอนุมัติสิทธิ์ทุกอย่างใน POS?`:`ปฏิเสธคำขอของ ${selected.name}?`))return;
    setWorking(userId);
    try{
      const res=await fetch("/api/auth/registrations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId,decision})});
      const data=await res.json() as {error?:string};
      if(!res.ok)throw new Error(data.error||"บันทึกไม่สำเร็จ");
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"ไม่สามารถอนุมัติได้");}
    finally{setWorking("");}
  }
  return <article className="panel pos-approval-panel">
    <div className="panel-title"><div><p className="eyebrow">TEACHER ACCESS</p><h3><ShieldCheck size={18}/> คำขอสิทธิ์อาจารย์</h3></div><button type="button" className="secondary" onClick={()=>void refresh()} disabled={loading||!!working}><RefreshCw size={15}/> ตรวจคำขอ</button></div>
    <p>ตรวจสอบตัวบุคคลก่อนอนุมัติ ผู้ได้รับอนุมัติมีสิทธิ์ควบคุม POS ทุกส่วน</p>
    {error&&<p className="login-error" role="alert">{error}</p>}
    {loading?<p>กำลังโหลดคำขอ...</p>:items.length===0?<p>ไม่มีคำขออาจารย์ที่รออนุมัติ</p>:
      <div className="pos-approval-list">{items.map(item=><div key={item.userId} className="pos-approval-item">
        <div><b>{item.name}</b><small>เบอร์ {item.phone}</small></div>
        <div><button disabled={!!working} type="button" className="secondary" onClick={()=>void decide(item.userId,"reject")}>ไม่อนุมัติ</button><button disabled={!!working} type="button" className="primary" onClick={()=>void decide(item.userId,"approve")}>อนุมัติอาจารย์</button></div>
      </div>)}</div>}
  </article>;
}
