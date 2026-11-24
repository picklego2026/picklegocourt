create table if not exists settings(k text primary key,v text);
create table if not exists bookings(id integer primary key autoincrement,court int,date text,hour int,name text,phone text,ref text,price int,status text default 'pending',created text default current_timestamp);
create unique index if not exists slot on bookings(court,date,hour) where status!='cancelled';
