# Concept Check

Do you truly understand, or just recognize the words?

A tool that finds the exact moment a learner's explanation stops being real understanding and becomes a memorized phrase, then checks whether naming the gap lets them close it.

## Deploy in 10 minutes

### 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project
2. Go to SQL Editor, paste the contents of `supabase-migration.sql` and run it
3. Go to Settings > API, copy your **Project URL** and **anon public key**
4. Go to Authentication > Settings, make sure "Enable email confirmations" is **OFF** (for hackathon speed)

### 2. Get Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key (you need credits on your account)

### 3. Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy

### 4. Two-user RLS test (Move 4)

1. Sign up as User A, run a concept session
2. Open an incognito window, sign up as User B
3. Try to access User A's session URL from User B - should show "Session not found"
4. Screenshot both browsers showing different data

## Tech stack

- Next.js (App Router) + Supabase (auth + RLS) + Vercel + Claude API

## How it works

1. Learner picks a concept and writes an explanation from first principles
2. Claude finds the ONE sentence where understanding became a memorized label
3. Claude generates a follow-up question that exposes the gap
4. Learner tries to derive it again
5. A HUMAN (not the LLM) judges whether the gap closed
