-- CONCEPT CHECK: Full database migration
-- Run this in Supabase SQL Editor

-- 1. Concepts table (fixed list, no RLS needed - public read)
CREATE TABLE concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL
);

-- Seed the concept list
INSERT INTO concepts (slug, title, prompt_text) VALUES
('why-backend', 'Why does a backend exist?', 'Explain from first principles: why does a backend exist at all? Why not run everything in the browser?'),
('what-is-api', 'What is an API, really?', 'Explain from first principles: what is an API underneath the word? Why does it need to exist?'),
('frontend-backend', 'Frontend vs Backend', 'Explain from first principles: what is a frontend, what is a backend, and why do we need both?'),
('what-is-interface', 'What is an interface?', 'Explain from first principles: what is an interface, really? Not the definition - derive why it must exist.'),
('why-database', 'Why do we need a database?', 'Explain from first principles: what are the different ways to store data, and why do we need a database?'),
('storage-choices', 'How to choose storage', 'Explain from first principles: how do you choose one storage option over another, and which factors decide it?');

-- 2. Sessions table
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  concept_id UUID REFERENCES concepts(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Derivations table (pass 1 = initial, pass 2 = after seeing gap)
CREATE TABLE derivations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) NOT NULL,
  pass_number INTEGER CHECK (pass_number IN (1, 2)) NOT NULL,
  explanation_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Gaps table (LLM output)
CREATE TABLE gaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) NOT NULL,
  gap_sentence TEXT NOT NULL,
  follow_up_question TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Gap results table (THE LOAD-BEARING FOREIGN KEY)
CREATE TABLE gap_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gap_id UUID REFERENCES gaps(id) NOT NULL,
  closed BOOLEAN NOT NULL,
  judged_by UUID REFERENCES auth.users(id) NOT NULL,
  second_derivation_id UUID REFERENCES derivations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE derivations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_results ENABLE ROW LEVEL SECURITY;

-- Concepts: everyone can read (public list)
CREATE POLICY "concepts_read" ON concepts FOR SELECT USING (true);

-- Sessions: users can only see/create their own
CREATE POLICY "sessions_select" ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert" ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Derivations: users can only see/create their own (via session ownership)
CREATE POLICY "derivations_select" ON derivations FOR SELECT
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
CREATE POLICY "derivations_insert" ON derivations FOR INSERT
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- Gaps: users can only see/create their own (via session ownership)
CREATE POLICY "gaps_select" ON gaps FOR SELECT
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
CREATE POLICY "gaps_insert" ON gaps FOR INSERT
  WITH CHECK (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- Gap results: users can only see/create their own (via gap -> session ownership)
CREATE POLICY "gap_results_select" ON gap_results FOR SELECT
  USING (gap_id IN (
    SELECT g.id FROM gaps g
    JOIN sessions s ON g.session_id = s.id
    WHERE s.user_id = auth.uid()
  ));
CREATE POLICY "gap_results_insert" ON gap_results FOR INSERT
  WITH CHECK (gap_id IN (
    SELECT g.id FROM gaps g
    JOIN sessions s ON g.session_id = s.id
    WHERE s.user_id = auth.uid()
  ));
