"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useParams, useRouter } from "next/navigation";

type SessionData = {
  id: string;
  concept_id: string;
  concepts: { title: string; prompt_text: string };
};

type GapData = {
  id: string;
  gap_sentence: string;
  follow_up_question: string;
};

type GapResultData = {
  id: string;
  closed: boolean;
};

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  // State
  const [session, setSession] = useState<SessionData | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1=explain, 2=analyzing, 3=second attempt, 4=done
  const [explanation, setExplanation] = useState("");
  const [gap, setGap] = useState<GapData | null>(null);
  const [secondAttempt, setSecondAttempt] = useState("");
  const [result, setResult] = useState<GapResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load existing session state
  useEffect(() => {
    async function load() {
      // Get session with concept
      const { data: sessionData, error: sessionErr } = await supabase
        .from("sessions")
        .select("id, concept_id, concepts(title, prompt_text)")
        .eq("id", sessionId)
        .single();

      if (sessionErr || !sessionData) {
        setError("Session not found");
        setLoading(false);
        return;
      }
      setSession(sessionData as unknown as SessionData);

      // Check if pass 1 derivation exists
      const { data: derivations } = await supabase
        .from("derivations")
        .select("*")
        .eq("session_id", sessionId)
        .order("pass_number");

      // Check if gap exists
      const { data: gaps } = await supabase
        .from("gaps")
        .select("*")
        .eq("session_id", sessionId);

      // Check if result exists
      if (gaps && gaps.length > 0) {
        const { data: results } = await supabase
          .from("gap_results")
          .select("*")
          .eq("gap_id", gaps[0].id);

        if (results && results.length > 0) {
          setResult(results[0]);
          setGap(gaps[0]);
          if (derivations && derivations.length > 0) setExplanation(derivations[0].explanation_text);
          if (derivations && derivations.length > 1) setSecondAttempt(derivations[1].explanation_text);
          setStep(4);
          setLoading(false);
          return;
        }

        // Gap exists but no result yet
        setGap(gaps[0]);
        if (derivations && derivations.length > 0) setExplanation(derivations[0].explanation_text);
        if (derivations && derivations.length > 1) {
          setSecondAttempt(derivations[1].explanation_text);
        }
        setStep(3);
        setLoading(false);
        return;
      }

      // If pass 1 exists but no gap yet
      if (derivations && derivations.length > 0) {
        setExplanation(derivations[0].explanation_text);
        setStep(1); // Let them re-analyze
      }

      setLoading(false);
    }
    load();
  }, [sessionId]);

  // Step 1: Submit explanation
  async function submitExplanation() {
    if (!explanation.trim() || explanation.trim().length < 20) {
      setError("Write at least a few sentences. Derive it, don't just define it.");
      return;
    }
    setError("");
    setAnalyzing(true);
    setStep(2);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      // Save pass 1 derivation
      await supabase.from("derivations").insert({
        session_id: sessionId,
        pass_number: 1,
        explanation_text: explanation.trim(),
      });

      // Call Claude to find the gap
      const res = await fetch("/api/analyze-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: session?.concepts?.title,
          prompt: session?.concepts?.prompt_text,
          explanation: explanation.trim(),
        }),
      });

      if (!res.ok) throw new Error("Analysis failed");
      const gapData = await res.json();

      // Save gap to DB
      const { data: savedGap, error: gapErr } = await supabase
        .from("gaps")
        .insert({
          session_id: sessionId,
          gap_sentence: gapData.gap_sentence,
          follow_up_question: gapData.follow_up_question,
        })
        .select()
        .single();

      if (gapErr) throw gapErr;
      setGap(savedGap);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Try again.");
      setStep(1);
    } finally {
      setAnalyzing(false);
    }
  }

  // Step 3: Submit second attempt and judge
  async function submitVerdict(closed: boolean) {
    if (!secondAttempt.trim() || secondAttempt.trim().length < 10) {
      setError("Write your second attempt before judging.");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      // Save pass 2 derivation
      const { data: derivation } = await supabase
        .from("derivations")
        .insert({
          session_id: sessionId,
          pass_number: 2,
          explanation_text: secondAttempt.trim(),
        })
        .select()
        .single();

      // Save gap result (THE LOAD-BEARING FK)
      const { data: savedResult } = await supabase
        .from("gap_results")
        .insert({
          gap_id: gap!.id,
          closed,
          judged_by: user.id,
          second_derivation_id: derivation?.id || null,
        })
        .select()
        .single();

      setResult(savedResult);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (error && !session) return <div className="min-h-screen flex items-center justify-center text-red-400">{error}</div>;

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <button onClick={() => router.push("/dashboard")} className="text-gray-500 hover:text-white text-sm mb-6 block">
        &larr; Back to concepts
      </button>

      <h1 className="text-xl font-bold mb-2">{session?.concepts?.title}</h1>

      {/* STEP 1: Write explanation */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-gray-300">{session?.concepts?.prompt_text}</p>
          </div>

          <p className="text-gray-400 text-sm">
            Derive it from first principles. Don't define it. Explain WHY it exists and what breaks without it.
          </p>

          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Start from scratch. Why does this thing need to exist at all..."
            rows={8}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={submitExplanation}
            disabled={!explanation.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Submit my explanation
          </button>
        </div>
      )}

      {/* STEP 2: Analyzing */}
      {step === 2 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Finding where your explanation stops being yours...</p>
        </div>
      )}

      {/* STEP 3: Show gap + follow-up + second attempt */}
      {step === 3 && gap && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="text-gray-500 text-xs uppercase tracking-wide">Your explanation</div>
            <p className="text-gray-300 text-sm">{explanation}</p>
          </div>

          <div className="bg-red-950 border border-red-800 rounded-lg p-4 space-y-3">
            <div className="text-red-400 text-xs uppercase tracking-wide">Where it became a label</div>
            <p className="text-white font-medium">&ldquo;{gap.gap_sentence}&rdquo;</p>
          </div>

          <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-4 space-y-3">
            <div className="text-yellow-400 text-xs uppercase tracking-wide">The follow-up that exposes it</div>
            <p className="text-white font-medium">{gap.follow_up_question}</p>
          </div>

          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Now try again. Answer the follow-up question. Derive it, don't reach for another memorized phrase.
            </p>

            <textarea
              value={secondAttempt}
              onChange={(e) => setSecondAttempt(e.target.value)}
              placeholder="Try to derive this from first principles..."
              rows={6}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => submitVerdict(true)}
                disabled={saving || !secondAttempt.trim()}
                className="py-3 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                {saving ? "..." : "Gap Closed"}
              </button>
              <button
                onClick={() => submitVerdict(false)}
                disabled={saving || !secondAttempt.trim()}
                className="py-3 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                {saving ? "..." : "Gap Still Open"}
              </button>
            </div>

            <p className="text-gray-600 text-xs text-center">
              The verdict is a human judgment. Did they actually derive it, or just reach for another phrase?
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === 4 && gap && result && (
        <div className="space-y-6">
          <div className={`border rounded-lg p-6 text-center ${
            result.closed
              ? "bg-green-950 border-green-800"
              : "bg-red-950 border-red-800"
          }`}>
            <div className="text-4xl mb-2">{result.closed ? "Closed" : "Still Open"}</div>
            <p className="text-gray-300">
              {result.closed
                ? "The gap was named, and the learner derived it on second attempt."
                : "The gap was named, but the learner could not derive it on second attempt."}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">First explanation</div>
              <p className="text-gray-300 text-sm">{explanation}</p>
            </div>

            <div className="bg-red-950 border border-red-900 rounded-lg p-4">
              <div className="text-red-400 text-xs uppercase tracking-wide mb-2">Gap found</div>
              <p className="text-white">&ldquo;{gap.gap_sentence}&rdquo;</p>
              <p className="text-yellow-300 mt-2">{gap.follow_up_question}</p>
            </div>

            {secondAttempt && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-gray-500 text-xs uppercase tracking-wide mb-2">Second attempt</div>
                <p className="text-gray-300 text-sm">{secondAttempt}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Try another concept
          </button>
        </div>
      )}
    </div>
  );
}
