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
        "\n" +
        "Stil:\n" +
        "- leicht märchenhaft, ruhig, mit kleinen Metaphern; nicht kitschig, nicht kindisch.\n" +
        "- Satz 1 darf länger sein (auch mit Komma/Nebensatz), aber bleibt ein einziger Satz.\n" +
        "- Satz 2 ist ausschließlich wörtliche Rede.\n" +
        "\n" +
        "Längenregel (wichtig):\n" +
        "- Satz 1 darf MAXIMAL 95 Zeichen haben (inklusive Leerzeichen und Satzzeichen).\n" +
        "- Wenn Satz 1 länger wäre: kürze ihn selbstständig, bis er <= 95 Zeichen ist.\n" +
        "\n" +
        "Regeln:\n" +
        "- Satz 1: Situation/Atmosphäre, ohne das Motivwort.\n" +
        "- Satz 2: nur wörtliche Rede (keine Erzählertexte davor/danach).\n" +
        "- Verwende keine Farbwörter im Text.\n" +
        "- Verwende das Motivwort NICHT, auch nicht als Teil eines zusammengesetzten Wortes.\n" +
        "- Kein Genitiv.\n" +
        "- Kein 'sagte', 'meinte', 'dachte'.\n" +
        "- Keine Namen, keine Orte mit Eigennamen.\n"
    };

    const userMessage = {
      role: "user",
      content:
        `Die unsichtbare Hauptfigur ist: "${motifNoun}".\n` +
        "Schreibe GENAU zwei Sätze.\n" +
        "Satz 2 endet mit einem abschließenden Anführungszeichen und einem Satzzeichen (. ? oder !).\n"
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [systemMessage, userMessage],
        temperature: typeof temperature === "number" ? temperature : 0.9,
        max_tokens: 220,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: "OpenAI error", details: errText });
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ text });

  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}
