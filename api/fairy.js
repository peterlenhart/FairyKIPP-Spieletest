export default async function handler(req, res) {
  try {
    // Token-Check: Link muss ?t=DEIN_TOKEN enthalten
    const token = req.query.t;
    if (!token || token !== process.env.FAIRYKIPP_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { motifNoun, temperature } = req.body || {};
    if (!motifNoun || typeof motifNoun !== "string") {
      return res.status(400).json({ error: "Missing motifNoun" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server not configured" });
    }

    const systemMessage = {
      role: "system",
      content:
        "Du schreibst sehr kurze, neutrale Mini-Geschichten auf Deutsch für ein Gesellschaftsspiel.\n" +
        "Du MUSST GENAU zwei Sätze liefern.\n" +
        "Regeln:\n" +
        "- Satz 1: Situation, ohne das Motivwort.\n" +
        "- Satz 2: nur wörtliche Rede.\n" +
        "- Verwende keine Farbwörter im Text.\n" +
        "- Verwende das Motivwort NICHT.\n" +
        "- Kein Genitiv.\n" +
        "- Kein 'sagte', 'meinte', 'dachte'.\n"
    };

    const userMessage = {
      role: "user",
      content:
        `Die unsichtbare Hauptfigur ist: "${motifNoun}".\n` +
        "Schreibe GENAU zwei Sätze.\n" +
        "Satz 2 endet mit einem abschließenden Anführungszeichen und einem Satzzeichen (. ? oder !).\n"
    };

    // --- Helpers: harte Regeln absichern ---
    const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();

    const splitIntoSentences = (s) => {
      // sehr robust: nimmt Sätze bis inkl. Satzzeichen
      const m = s.match(/[^.!?]+[.!?]+/g);
      if (m && m.length) return m.map(x => x.trim());
      // fallback: falls kein Satzzeichen vorkommt
      return [s.trim()].filter(Boolean);
    };

    const containsForbidden = (text) => {
      const t = text.toLowerCase();

      // Motivwort darf nicht vorkommen (case-insensitive, als Wortteil auch verboten)
      const motif = String(motifNoun).toLowerCase();
      if (motif && t.includes(motif)) return true;

      // Farbwörter sperren (falls jemals)
      const colorWords = ["grün", "grüne", "blaue", "blau", "violett", "orange", "orangefarben", "orangefarbene", "rot", "gelb"];
      if (colorWords.some(w => t.includes(w))) return true;

      // "sagte/meinte/dachte" sperren
      const speechVerbs = ["sagte", "meinte", "dachte"];
      if (speechVerbs.some(w => t.includes(w))) return true;

      return false;
    };

    // wir geben uns 2 Versuche, falls das Modell einmal ausbricht
    let finalText = "";
    const maxTries = 2;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [systemMessage, userMessage],
          temperature: typeof temperature === "number" ? temperature : 0.8,
          max_tokens: 220,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return res.status(resp.status).json({ error: "OpenAI error", details: errText });
      }

      const data = await resp.json();
      let text = normalize(data?.choices?.[0]?.message?.content);

      // exakt 2 Sätze erzwingen (falls mehr)
      const sentences = splitIntoSentences(text);
      if (sentences.length >= 2) {
        text = normalize(`${sentences[0]} ${sentences[1]}`);
      } else {
        text = normalize(text);
      }

      // harte Verbote prüfen
      if (!containsForbidden(text) && splitIntoSentences(text).length === 2) {
        finalText = text;
        break;
      }

      // wenn letzter Versuch: fallback statt Müll zurückgeben
      if (attempt === maxTries) {
        finalText = 'Etwas Unbenanntes wartete still am Rand. "Jetzt ist Bewegung drin!"';
      }
    }

    return res.status(200).json({ text: finalText });

  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}
