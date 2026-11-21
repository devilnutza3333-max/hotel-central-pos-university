"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { Camera, CircleUserRound, KeyRound, LoaderCircle, LogOut, Save, Trash2, ArrowLeft } from "lucide-react";

type Member = {
  id: string; name: string; role: "instructor" | "manager" | "cashier" | "student";
  username: string; phone: string; program: string; yearLevel: string;
  memberType: string; avatarData: string;
};
const roles: Record<Member["role"], string> = {
  instructor: "อาจารย์ (สิทธิ์ควบคุมระบบทั้งหมด)", manager: "ผู้จัดการ (ฝึกปฏิบัติ)",
  cashier: "แคชเชียร์", student: "นักศึกษาฝึกปฏิบัติ",
};

async function optimizeImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 8*1024*1024) {
    throw new Error("โปรดเลือกรูปภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB");
  }
  const src = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("ไม่สามารถเปิดไฟล์ภาพนี้ได้"));
      image.src = src;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("ไฟล์รูปภาพไม่ถูกต้อง");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth-side)/2, sy = (image.naturalHeight-side)/2;
    for (const size of [240, 200, 160, 128]) {
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("อุปกรณ์นี้ไม่รองรับการย่อรูป");
      ctx.drawImage(image,sx,sy,side,side,0,0,size,size);
      for (const type of ["image/webp", "image/jpeg"]) {
        const result=canvas.toDataURL(type,0.7);
        if (result.startsWith("data:"+type+";base64,") && result.length <= 76000) return result;
      }
    }
    throw new Error("ไฟล์ยังใหญ่เกินไป กรุณาเลือกรูปอื่น");
  } finally { URL.revokeObjectURL(src); }
}

export default function MemberProfilePage() {
  const [member,setMember] = useState<Member|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  useEffect(() => {
    let mounted=true;
    (async()=>{
      try {
        const response=await fetch("/api/account/profile",{cache:"no-store"});
        if (response.status===401) { window.location.replace("/login?return_to=%2Faccount%2Fprofile"); return; }
        const data=await response.json() as Member & {error?:string};
        if(!response.ok) throw new Error(data.error || "โหลดข้อมูลโปรไฟล์ไม่ได้");
        if(mounted) setMember(data);
      } catch(cause) {if(mounted)setError(cause instanceof Error?cause.message:"โหลดโปรไฟล์ไม่สำเร็จ");}
      finally {if(mounted)setLoading(false);}
    })();
    return ()=>{mounted=false;};
  },[]);

  async function savePhoto(data:string|null) {
    if (!member) return;
    setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/account/profile",{
        method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({avatarData:data}),
      });
      const payload=await response.json() as {ok?:boolean;error?:string;avatarData?:string};
      if(!response.ok||!payload.ok) throw new Error(payload.error||"บันทึกภาพไม่สำเร็จ");
      setMember({...member,avatarData:payload.avatarData||""});
      setMessage(data?"บันทึกรูปโปรไฟล์แล้ว":"ลบรูปโปรไฟล์แล้ว");
    } catch(cause){setError(cause instanceof Error?cause.message:"อัปโหลดไม่สำเร็จ");}
    finally{setBusy(false);}
  }
  async function selectPhoto(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];event.currentTarget.value="";
    if(!file)return;
    try{setBusy(true);setError("");const data=await optimizeImage(file);await savePhoto(data);}
    catch(cause){setError(cause instanceof Error?cause.message:"ไม่สามารถอ่านรูปภาพ");}
    finally{setBusy(false);}
  }

  return <main className="pos-profile-shell">
    <section className="pos-profile-card">
      <header className="pos-profile-header"><a href="/" className="pos-profile-back"><ArrowLeft size={17}/> กลับไป POS</a><strong>Hotel Central POS</strong></header>
      {loading?<p className="pos-profile-wait"><LoaderCircle size={22}/> กำลังโหลดโปรไฟล์...</p>:member?<>
        <div className="pos-profile-hero">
          <div className="pos-profile-avatar">
            {member.avatarData?<img src={member.avatarData} alt="รูปโปรไฟล์ของฉัน"/>:<CircleUserRound size={65}/>}
          </div>
          <h1>{member.name}</h1>
          <p>{roles[member.role]}</p>
          <div className="pos-profile-buttons">
            <label className="pos-profile-upload"><Camera size={17}/> {busy?"กำลังบันทึก...":"เลือกรูปโปรไฟล์"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void selectPhoto(event)} disabled={busy}/>
            </label>
            {member.avatarData&&<button type="button" className="pos-profile-remove" onClick={()=>void savePhoto(null)} disabled={busy}><Trash2 size={16}/> ลบรูป</button>}
          </div>
          <small>เลือกรูปจากโทรศัพท์ได้ ระบบจะย่อภาพให้อัตโนมัติ</small>
        </div>
        <div className="pos-profile-details">
          <h2>ข้อมูลสมาชิก</h2>
          <div><span>ชื่อที่แสดง</span><strong>{member.name}</strong></div>
          <div><span>ID เข้าสู่ระบบ</span><strong>{member.username || "-"}</strong></div>
          {member.phone&&<div><span>เบอร์โทรศัพท์</span><strong>{member.phone}</strong></div>}
          {member.program&&<div><span>สาขาวิชา</span><strong>{member.program}</strong></div>}
          {member.yearLevel&&<div><span>ชั้นปี</span><strong>ปี {member.yearLevel}</strong></div>}
          <div><span>สิทธิ์ปัจจุบัน</span><strong>{roles[member.role]}</strong></div>
        </div>
        <div className="pos-profile-bottom">
          <a className="pos-profile-password" href="/account/password"><KeyRound size={17}/> เปลี่ยนรหัสผ่านของฉัน</a>
          <form action="/api/auth/logout" method="post"><button type="submit" className="pos-profile-logout"><LogOut size={19}/> ออกจากระบบ (Logout)</button></form>
        </div>
      </>:<p className="login-error">{error||"ไม่สามารถโหลดโปรไฟล์ได้"} <a href="/login">เข้าสู่ระบบ</a></p>}
      {member&&error&&<p className="login-error" role="alert">{error}</p>}
      {message&&<p className="pos-profile-success" role="status"><Save size={16}/>{message}</p>}
    </section>
  </main>;
}
