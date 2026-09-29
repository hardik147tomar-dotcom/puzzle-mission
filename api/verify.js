module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON payload sent to server.' });
      }
    }

    const imageBase64 = body ? body.imageBase64 : null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is missing in Vercel Environment Variables!" 
      });
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: "No valid image data payload received." });
    }

    const parts = imageBase64.split(',');
    if (parts.length < 2) {
      return res.status(400).json({ error: "Malformed image base64 data." });
    }

    const mimeMatch = parts[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = parts[1];

    const promptText = 'Analyze this image. Does this image contain a real or clearly visible flying bird? Respond strictly with a JSON object in this exact format: {"correct": true} or {"correct": false}.';

    // List of models to try in order of preference
    const modelsToTry = [
      'gemini-1.5-flash',
      'gemini-2.5-flash',
      'gemini-1.5-pro'
    ];

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        const data = await apiResponse.json();

        // If high demand or server busy, skip to next model in loop
        if (!apiResponse.ok) {
          lastError = data.error?.message || `Model ${model} returned error status ${apiResponse.status}`;
          if (apiResponse.status === 503 || apiResponse.status === 429 || lastError.includes('high demand')) {
            continue;
          }
          // If it's a critical auth/key issue, fail immediately
          return res.status(apiResponse.status || 500).json({ error: lastError });
        }

        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResult) continue;

        const cleanedText = textResult.replace(/```json|```/g, '').trim();
        const cleanJson = JSON.parse(cleanedText);

        // Success! Return the response
        return res.status(200).json(cleanJson);

      } catch (err) {
        lastError = err.message;
      }
    }

    // If all models in the fallback array failed
    return res.status(503).json({ 
      error: `All AI models are currently busy. Last error: ${lastError}` 
    });

  } catch (error) {
    return res.status(500).json({ 
      error: error.message || "Internal server error occurred." 
    });
  }
};
