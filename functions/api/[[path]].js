const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const hash=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pg:'+t)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const DEF={name:'PickleGo Court',tagline:'Stand. Fight. Overcome.',about:'',contact:'',terms:'',payment:'',open:'6',close:'23',peakStart:'17',offRate:'300',peakRate:'350',court1:'Court 1',court2:'Court 2',amenities:'parking,cafe,rental,coaching',mapq:'',logo:'/logo.png',cover:'/cover.jpg',footer:'Powered by Queen of Art | Developer: Almira Bagro | Contact#09774673966'};
const settings=async db=>{const r=await db.prepare('select k,v from settings').all();const s={...DEF};r.results.forEach(x=>s[x.k]=x.v);return s};
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
   if(!r||r.status==='trash'||r.phone.replace(/\D/g,'').slice(-10)!==ph)return J({error:'No booking found. Check your booking code and phone number.'},404);
   return J({court:r.court,date:r.date,hour:r.hour,status:r.status});
  }
  if(p==='login'&&m==='POST'){
   const b=await request.json();
   if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return J({error:'Wrong password'},401);
   return J({ok:true},200,{'set-cookie':'adm='+await hash(env.ADMIN_PASSWORD)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'});
  }
  if(!env.ADMIN_PASSWORD||!(request.headers.get('cookie')||'').includes('adm='+await hash(env.ADMIN_PASSWORD)))return J({error:'Unauthorized'},401);
  if(p==='admin/bookings'&&m==='GET'){
   const st=u.searchParams.get('status')||'pending',pg=Math.max(0,+u.searchParams.get('page')||0);
   const rows=(await db.prepare('select * from bookings where status=? order by date desc,hour desc limit 25 offset ?').bind(st,pg*25).all()).results;
   const counts={};(await db.prepare('select status,count(*) n from bookings group by status').all()).results.forEach(x=>counts[x.status]=x.n);
   return J({rows,counts});
  }
  if(p==='admin/export'&&m==='GET'){
   const rs=(await db.prepare("select * from bookings where status!='trash' order by date,hour").all()).results;
   const q=v=>{v=String(v??'');if(/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
   const csv='\ufeff'+['Code,Date,Time,Court,Name,Phone,Reference,Price,Status,Booked at'].concat(rs.map(b=>['PG-'+(1000+b.id),b.date,b.hour+':00','Court '+b.court,b.name,b.phone,b.ref,b.price,b.status,b.created].map(q).join(','))).join('\r\n');
   return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="picklego-bookings.csv"'}});
  }
  if(p==='admin/delete'&&m==='POST'){
   const b=await request.json();await db.prepare("delete from bookings where id=? and status='trash'").bind(b.id).run();return J({ok:true});
  }
  if(p==='admin/booking'&&m==='POST'){
   const b=await request.json();
   if(!['pending','confirmed','cancelled','trash'].includes(b.status))return J({error:'Bad status'},400);
   try{await db.prepare('update bookings set status=? where id=?').bind(b.status,b.id).run()}catch(e){return J({error:'That time slot is already booked by someone else.'},409)}
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
