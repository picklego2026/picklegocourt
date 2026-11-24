const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const hash=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pg:'+t)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const DEF={name:'PickleGo Court',tagline:'Stand. Fight. Overcome.',about:'',contact:'',terms:'',payment:'',open:'6',close:'23',peakStart:'17',offRate:'300',peakRate:'350',court1:'Court 1',court2:'Court 2'};
const settings=async db=>{const r=await db.prepare('select k,v from settings').all();const s={...DEF};r.results.forEach(x=>s[x.k]=x.v);return s};
export async function onRequest({request,env}){
 const u=new URL(request.url),p=u.pathname.replace(/^\/api\//,''),m=request.method,db=env.DB;
 try{
  if(p==='settings'&&m==='GET')return J(await settings(db));
  if(p==='bookings'&&m==='GET')return J((await db.prepare("select court,hour from bookings where date=? and status!='cancelled'").bind(u.searchParams.get('date')||'').all()).results);
  if(p==='book'&&m==='POST'){
   const b=await request.json(),s=await settings(db),h=+b.hour,c=+b.court;
   if(!/^\d{4}-\d\d-\d\d$/.test(b.date)||![1,2].includes(c)||!(h>=+s.open&&h<+s.close)||!b.name||!b.phone)return J({error:'Invalid booking'},400);
   const price=h>=+s.peakStart?+s.peakRate:+s.offRate;
   let id;
   try{id=(await db.prepare('insert into bookings(court,date,hour,name,phone,ref,price) values(?,?,?,?,?,?,?)').bind(c,b.date,h,String(b.name).slice(0,80),String(b.phone).slice(0,30),String(b.ref||'').slice(0,60),price).run()).meta.last_row_id}
   catch(e){return J({error:'Sorry, that slot was just taken.'},409)}
   return J({ok:true,price,code:'PG-'+(1000+id)});
  }
  if(p==='mybooking'&&m==='GET'){
   const id=parseInt((u.searchParams.get('code')||'').replace(/\D/g,''))-1000,ph=(u.searchParams.get('phone')||'').replace(/\D/g,'').slice(-10);
   const r=id>0&&ph.length>=7?await db.prepare('select court,date,hour,status,phone from bookings where id=?').bind(id).first():null;
   if(!r||r.phone.replace(/\D/g,'').slice(-10)!==ph)return J({error:'No booking found. Check your booking code and phone number.'},404);
   return J({court:r.court,date:r.date,hour:r.hour,status:r.status});
  }
  if(p==='login'&&m==='POST'){
   const b=await request.json();
   if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return J({error:'Wrong password'},401);
   return J({ok:true},200,{'set-cookie':'adm='+await hash(env.ADMIN_PASSWORD)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'});
  }
  if(!env.ADMIN_PASSWORD||!(request.headers.get('cookie')||'').includes('adm='+await hash(env.ADMIN_PASSWORD)))return J({error:'Unauthorized'},401);
  if(p==='admin/bookings'&&m==='GET')return J((await db.prepare('select * from bookings order by date desc,hour desc limit 200').all()).results);
  if(p==='admin/booking'&&m==='POST'){
   const b=await request.json();
   if(!['pending','confirmed','cancelled'].includes(b.status))return J({error:'Bad status'},400);
   await db.prepare('update bookings set status=? where id=?').bind(b.status,b.id).run();return J({ok:true});
  }
  if(p==='admin/settings'&&m==='POST'){
   const b=await request.json();
   await db.batch(Object.keys(DEF).filter(k=>k in b).map(k=>db.prepare('insert into settings(k,v) values(?,?) on conflict(k) do update set v=excluded.v').bind(k,String(b[k]))));
   return J({ok:true});
  }
  return J({error:'Not found'},404);
 }catch(e){return J({error:'Server error'},500)}
}
