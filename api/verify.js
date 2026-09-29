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

    const promptText = 'Analyze this image carefully. Does this image contain a real or clearly visible flying bird? Respond strictly with a JSON object in this exact format: {"correct": true} or {"correct": false}.';

    // Active supported model list in order of preference
    const modelsToTry = [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro'
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

        if (!apiResponse.ok) {
          lastError = data.error?.message || `Model ${model} returned error status ${apiResponse.status}`;
          
          // If model not found, overloaded, or high demand, move to next model
          if (
            apiResponse.status === 503 || 
            apiResponse.status === 429 || 
            apiResponse.status === 404 ||
            lastError.includes('high demand') ||
            lastError.includes('not found')
          ) {
            continue;
          }
          
          return res.status(apiResponse.status || 500).json({ error: lastError });
        }

        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResult) continue;

        const cleanedText = textResult.replace(/```json|```/g, '').trim();
        const cleanJson = JSON.parse(cleanedText);

        return res.status(200).json(cleanJson);

      } catch (err) {
        lastError = err.message;
      }
    }

    return res.status(503).json({ 
      error: `All AI models are currently busy or unavailable. Last error: ${lastError}` 
    });

  } catch (error) {
    return res.status(500).json({ 
      error: error.message || "Internal server error occurred." 
    });
  }
};
