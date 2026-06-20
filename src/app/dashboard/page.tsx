"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

type Concept = {
  id: string;
  slug: string;
  title: string;
  prompt_text: string;
};

type Session = {
  id: string;
  concept_id: string;
  created_at: string;
  concepts: { title: string };
};

export default function DashboardPage() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: conceptData } = await supabase
        .from("concepts")
        .select("*")
        .order("title");

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id, concept_id, created_at, concepts(title)")
        .order("created_at", { ascending: false })
        .limit(10);

      setConcepts(conceptData || []);
      setSessions((sessionData as unknown as Session[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  async function startSession(conceptId: string) {
    setStarting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("sessions")
      .insert({ user_id: user.id, concept_id: conceptId })
      .select("id")
      .single();

    if (error) {
      alert("Error creating session: " + error.message);
      setStarting(false);
      return;
    }

    router.push(`/session/${data.id}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Concept Check</h1>
        <button onClick={handleSignOut} className="text-gray-400 hover:text-white text-sm">
          Sign out
        </button>
      </div>

      <p className="text-gray-400 mb-6">
        Pick a concept. Explain it from first principles. Find out if you truly understand it, or just recognize the words.
      </p>

      <div className="space-y-3 mb-10">
        {concepts.map((c) => (
          <button
            key={c.id}
            onClick={() => startSession(c.id)}
            disabled={starting}
            className="w-full text-left p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-blue-500 transition-colors disabled:opacity-50"
          >
            <div className="font-medium text-white">{c.title}</div>
            <div className="text-gray-500 text-sm mt-1">{c.prompt_text}</div>
          </button>
        ))}
      </div>

      {sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">Past sessions</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/session/${s.id}`)}
                className="w-full text-left p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-600 transition-colors"
              >
                <span className="text-gray-300">{s.concepts?.title}</span>
                <span className="text-gray-600 text-sm ml-2">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
