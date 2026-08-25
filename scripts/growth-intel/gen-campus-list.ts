import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
// all non-archived campuses, paged
let from=0; const rows:any[]=[];
for(;;){ const {data}=await db.from("campuses").select("id,name,email_domain,domains,archived_at").is("archived_at",null).range(from,from+999); const d=(data??[]) as any[]; rows.push(...d); if(d.length<1000)break; from+=1000; }
const firstDomain=(d:any,e:any)=>{ const a=Array.isArray(d)?d[0]:(typeof d==='string'?d.replace(/[{}"]/g,'').split(',')[0]:''); return (a||e||'').toString().toLowerCase().replace(/^www\./,'')||null; };
const campuses = rows.filter(r=>r.name).map(r=>({ id:r.id, name:r.name, domain:firstDomain(r.domains,r.email_domain) }));
writeFileSync("scripts/growth-intel/campuses-all.json", JSON.stringify({ note:"all non-archived campuses (nationwide run)", campuses }, null, 0));
console.log("wrote", campuses.length, "campuses; with_domain:", campuses.filter(c=>c.domain).length);
