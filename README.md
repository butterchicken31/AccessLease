# Hackathon Starter (Next.js + AI + Vercel)

## 1. Run locally
```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
# open .env.local and paste your ANTHROPIC_API_KEY
npm run dev
```
Open http://localhost:3000 and test the AI box. Test the backend at http://localhost:3000/api/hello

## 2. Get an API key
1. Go to https://console.anthropic.com and sign up / log in.
2. Open Settings -> API Keys -> Create Key.
3. Copy it once (it is shown only once) and paste into `.env.local`.
Never put the key in frontend code and never commit it.

## 3. Push to GitHub
```bash
git init
git add .
git commit -m "Initial starter"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
(Create the empty repo on github.com first. Check `git status` to confirm `.env.local` is NOT listed.)

## 4. Deploy on Vercel
1. Go to https://vercel.com and log in with GitHub.
2. Add New -> Project -> import your repo.
3. Framework is auto-detected as Next.js.
4. Open "Environment Variables" and add:
   - `ANTHROPIC_API_KEY` = your key
   - `ANTHROPIC_MODEL` = claude-sonnet-5-5 (optional)
5. Click Deploy. Every `git push` to main redeploys automatically.
If you add or change env vars later, redeploy for them to take effect.

## Project map
- `app/page.js`          -> main page (frontend). Replace with your idea.
- `app/globals.css`      -> styles
- `app/api/hello/route.js` -> sample backend route
- `app/api/ai/route.js`  -> AI backend route (calls Claude)
- Add new pages: `app/<name>/page.js`   |   new APIs: `app/api/<name>/route.js`

## Troubleshooting
- "API key missing": check `.env.local` name is exact and restart `npm run dev`.
- Works locally but not on Vercel: env vars not added in Vercel, or you did not redeploy.
- 401 from AI: wrong or expired key.  429: rate limit or no credits on the account.
- Port busy: run `npm run dev -- -p 3001`.
