# PickleGo Court booking site (Cloudflare Pages + D1)

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard > Storage & Databases > D1 > Create database named `picklego`.
   Open its Console tab, paste the contents of `schema.sql`, and run it.
3. Workers & Pages > Create > Pages > Connect to Git > pick your repo.
   Build command: (leave empty). Build output directory: `public`.
4. After the first deploy, open the project > Settings:
   - Bindings > Add > D1 database: variable name `DB`, choose `picklego`.
   - Variables and Secrets > Add secret `ADMIN_PASSWORD` (your own strong password).
5. Redeploy. Visit `/admin.html`, log in, and fill in About, Contact, Terms, Payment instructions, hours, and rates.
6. Customers use `/` to book. Confirm or cancel bookings in the admin page after you verify payment.
