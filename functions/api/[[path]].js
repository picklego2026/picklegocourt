const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const hash=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pg:'+t)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const DEF={name:'PickleGo Court',tagline:'Stand. Fight. Overcome.',about:'',contact:'',terms:'',payment:'',open:'6',close:'23',peakStart:'17',offRate:'300',peakRate:'350',court1:'Court 1',court2:'Court 2',amenities:'parking,cafe,rental,coaching',mapq:''};
// LOCKED: only editable here in the code (GitHub). The admin page cannot change these.
const LOCK={logo:'/logo.png',cover:'/cover.jpg',footer:'© 2026 PickleGo Court. Website by Queen of Art | Developer: Almira Bagro | Contact#09774673966'};
const settings=async db=>{const r=await db.prepare('select k,v from settings').all();const s={...DEF};r.results.forEach(x=>s[x.k]=x.v);return {...s,...LOCK}};
export async function onRequest({request,env}){
 const u=new URL(request.url),p=u.pathname.replace(/^\/api\//,''),m=request.method,db=env.DB;
 try{
  if(p==='settings'&&m==='GET')return J(await settings(db));
  if(p==='follow'&&m==='GET')return J({count:(await db.prepare('select count(*) n from follows').first()).n});
  if(p==='follow'&&m==='POST'){
   const b=await request.json(),k=String(b.id||'').slice(0,64);if(k.length<8)return J({error:'Invalid'},400);
   if(b.on){const ip=request.headers.get('cf-connecting-ip')||'';
    if((await db.prepare('select count(*) n from follows where ip=?').bind(ip).first()).n>=5)return J({error:'Too many follows from this network.'},429);
    await db.prepare('insert or ignore into follows(k,ip) values(?,?)').bind(k,ip).run()}
   else await db.prepare('delete from follows where k=?').bind(k).run();
   return J({ok:true});
  }
  if(p==='bookings'&&m==='GET')return J((await db.prepare("select court,hour from bookings where date=? and status not in ('cancelled','trash')").bind(u.searchParams.get('date')||'').all()).results);
  if(p==='book'&&m==='POST'){
   const b=await request.json(),s=await settings(db);
   const sl=(Array.isArray(b.slots)?b.slots:[{court:b.court,hour:b.hour}]).map(x=>({c:+(x.c??x.court),h:+(x.h??x.hour)}));
   if(!/^\d{4}-\d\d-\d\d$/.test(b.date)||!b.name||!b.phone||!sl.length||sl.length>8||sl.some(x=>![1,2].includes(x.c)||!(x.h>=+s.open&&x.h<+s.close)))return J({error:'Invalid booking'},400);
   const ph=String(b.phone).slice(0,30);
   if((await db.prepare("select count(*) n from bookings where phone=? and status='pending'").bind(ph).first()).n+sl.length>12)return J({error:'Too many unpaid bookings. Please wait for the venue to confirm your payment.'},429);
   const pr=h=>h>=+s.peakStart?+s.peakRate:+s.offRate;
   let res;
   try{res=await db.batch(sl.map(x=>db.prepare('insert into bookings(court,date,hour,name,phone,ref,price) values(?,?,?,?,?,?,?)').bind(x.c,b.date,x.h,String(b.name).slice(0,80),ph,String(b.ref||'').slice(0,60),pr(x.h))))}
   catch(e){return J({error:'Sorry, one of those slots was just taken. Please pick again.'},409)}
   const ids=res.map(r=>r.meta.last_row_id),g=ids[0];
   if(ids.length>1)await db.prepare('update bookings set grp=? where id in ('+ids.map(()=>'?').join(',')+')').bind(g,...ids).run();
   return J({ok:true,price:sl.reduce((t,x)=>t+pr(x.h),0),code:'PG-'+(1000+g)});
  }
  if(p==='mybooking'&&m==='GET'){
   const g=parseInt((u.searchParams.get('code')||'').replace(/\D/g,''))-1000,ph=(u.searchParams.get('phone')||'').replace(/\D/g,'').slice(-10);
   const rs=g>0&&ph.length>=7?(await db.prepare("select court,date,hour,status,phone from bookings where (id=? or grp=?) and status!='trash' order by hour,court").bind(g,g).all()).results:[];
   if(!rs.length||rs[0].phone.replace(/\D/g,'').slice(-10)!==ph)return J({error:'No booking found. Check your booking code and phone number.'},404);
   return J({items:rs.map(r=>({court:r.court,date:r.date,hour:r.hour})),status:rs[0].status});
  }
  if(p==='logout'&&m==='POST')return J({ok:true},200,{'set-cookie':'adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  if(p==='login'&&m==='POST'){
   const b=await request.json();
   if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return J({error:'Wrong password'},401);
   return J({ok:true},200,{'set-cookie':'adm='+await hash(env.ADMIN_PASSWORD)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'});
  }
  if(!env.ADMIN_PASSWORD||!(request.headers.get('cookie')||'').includes('adm='+await hash(env.ADMIN_PASSWORD)))return J({error:'Unauthorized'},401);
  if(p==='admin/bookings'&&m==='GET'){
   const st=u.searchParams.get('status')||'pending',pg=Math.max(0,+u.searchParams.get('page')||0);
   const rows=(await db.prepare("select coalesce(grp,id) g,min(date) date,group_concat(court||'|'||hour,';') slots,name,phone,ref,sum(price) price,status from bookings where status=? group by g order by min(date) desc,min(hour) desc limit 25 offset ?").bind(st,pg*25).all()).results;
   const counts={};(await db.prepare('select status,count(distinct coalesce(grp,id)) n from bookings group by status').all()).results.forEach(x=>counts[x.status]=x.n);
   return J({rows,counts});
  }
  if(p==='admin/export'&&m==='GET'){
   const rs=(await db.prepare("select * from bookings where status!='trash' order by date,hour").all()).results;
   const q=v=>{v=String(v??'');if(/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
   const csv='\ufeff'+['Code,Date,Time,Court,Name,Phone,Reference,Price,Status,Booked at'].concat(rs.map(b=>['PG-'+(1000+(b.grp||b.id)),b.date,b.hour+':00','Court '+b.court,b.name,b.phone,b.ref,b.price,b.status,b.created].map(q).join(','))).join('\r\n');
   return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="picklego-bookings.csv"'}});
  }
  if(p==='admin/delete'&&m==='POST'){
   const b=await request.json();await db.prepare("delete from bookings where coalesce(grp,id)=? and status='trash'").bind(b.id).run();return J({ok:true});
  }
  if(p==='admin/booking'&&m==='POST'){
   const b=await request.json();
   if(!['pending','confirmed','cancelled','trash'].includes(b.status))return J({error:'Bad status'},400);
   try{await db.prepare('update bookings set status=? where coalesce(grp,id)=?').bind(b.status,b.id).run()}catch(e){return J({error:'That time slot is already booked by someone else.'},409)}
   return J({ok:true});
  }
  if(p==='admin/settings'&&m==='POST'){
   const b=await request.json();
   await db.batch(Object.keys(DEF).filter(k=>k in b).map(k=>db.prepare('insert into settings(k,v) values(?,?) on conflict(k) do update set v=excluded.v').bind(k,String(b[k]))));
   return J({ok:true});
  }
  return J({error:'Not found'},404);
 }catch(e){return J({error:'Server error'},500)}
}
