import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { imageBase64 } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Analyze this image upload. 
      The user was asked to hand-draw a drawing on paper showing: "A cat wearing a wizard hat".
      Does this image contain a hand-drawn picture matching that prompt?
      Respond strictly with a JSON object in this format: {"correct": true} or {"correct": false}.
    `;

    const imagePart = {
      inlineData: {
        data: imageBase64.split(',')[1],
        mimeType: "image/jpeg"
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const cleanJson = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());

    return res.status(200).json(cleanJson);
  } catch (error) {
    return res.status(500).json({ error: "AI verification failed" });
  }
}
