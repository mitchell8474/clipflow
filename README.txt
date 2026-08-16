CLIPFLOW + SUPABASE + CLOUDFLARE PAGES

1. SUPABASE
Open https://supabase.com/ and create a project.

2. DATABASE
In Supabase open SQL Editor, create a new query, paste ALL of supabase.sql, and run it.

3. STORAGE
Open Storage -> New bucket.
Name: videos
For this starter, make the bucket PUBLIC.
The SQL file adds policies so signed-in users can upload only into their own folder.

4. AUTH
Open Authentication -> Providers and enable Email.
If email confirmation is enabled, new users need to confirm their email before they can sign in.

5. GET YOUR API VALUES
Open Project Settings -> API.
Copy:
- Project URL
- Publishable key (or the legacy anon key if your dashboard shows that instead)

Put them into app.js:
const SUPABASE_URL = "...";
const SUPABASE_KEY = "...";

NEVER put a secret/service_role key in app.js.

6. GITHUB
Create a new repository and upload:
index.html
style.css
app.js

7. CLOUDFLARE PAGES
Open https://pages.cloudflare.com/
Create application -> Pages -> Import an existing Git repository.
Connect GitHub and choose your repository.
For this plain HTML project:
Build command: exit 0
Build output directory: .
Production branch: main
Deploy.

Cloudflare Pages will give you a *.pages.dev URL.

8. UPDATES
After you change a file, commit/push it to GitHub. Cloudflare Pages can automatically redeploy the site.

IMPORTANT
This is a starter social platform. Before a public launch, add moderation/reporting, file-type/size checks, rate limits, stronger storage rules, and protections against spam/abuse. Also remember that video storage and bandwidth can use up your service's free quota.
