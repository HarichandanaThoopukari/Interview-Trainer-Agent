/**
 * Lightweight Retrieval-Augmented Generation (RAG) knowledge base.
 * In production you would swap this for a real vector store (e.g. watsonx.ai
 * Discovery, Milvus, or Elasticsearch) - the retrieve() function below is the
 * only thing you'd need to change. Keeping it in-memory keeps this project
 * 100% free to host on Render/Vercel with zero external services required.
 */

const KNOWLEDGE = [
  {
    id: 'dsa-roadmap',
    tags: ['dsa', 'coding', 'roadmap', 'data structures', 'algorithms', 'technical'],
    text: 'DSA roadmap order that most product companies expect: Arrays & Strings -> Hashing -> Two Pointers/Sliding Window -> Linked Lists -> Stacks & Queues -> Recursion & Backtracking -> Trees & BSTs -> Graphs (BFS/DFS, Union-Find) -> Dynamic Programming -> Greedy -> Binary Search on Answer. Spend 60% of prep time on Arrays, Trees, Graphs and DP since they appear most in interviews.',
  },
  {
    id: 'star-method',
    tags: ['behavioral', 'hr', 'star', 'leadership', 'teamwork', 'conflict'],
    text: 'STAR format for behavioral answers: Situation (set the scene in 1-2 sentences), Task (what was your specific responsibility), Action (what YOU did, use "I" not "we"), Result (quantify the outcome - %, time saved, revenue, users). Keep the whole answer to 60-90 seconds.',
  },
  {
    id: 'hr-tell-me-about-yourself',
    tags: ['hr', 'tell me about yourself', 'introduction'],
    text: 'Best structure for "Tell me about yourself": Present (current role/study + one strength) -> Past (relevant experience/projects that led here) -> Future (why this role/company is the next logical step). Keep it under 90 seconds, end by connecting to the job.',
  },
  {
    id: 'ats-keywords',
    tags: ['resume', 'ats', 'keywords', 'formatting'],
    text: 'ATS systems parse resumes as plain text, so avoid tables, images, and multi-column layouts. Use standard section headers (Experience, Education, Skills, Projects). Mirror exact keywords/tools from the job description (e.g. "React.js" not just "Frontend"). Quantify achievements with numbers wherever possible.',
  },
  {
    id: 'system-design-basics',
    tags: ['system design', 'architecture', 'senior', 'scalability'],
    text: 'For system design rounds (usually 3+ YOE), structure your answer as: Requirements clarification -> Back-of-envelope estimation -> High level design (boxes/arrows) -> Deep dive on 1-2 components -> Bottlenecks & tradeoffs -> Scaling strategy (caching, sharding, load balancing, queues).',
  },
  {
    id: 'coding-round-strategy',
    tags: ['coding', 'assessment', 'interview strategy', 'live coding'],
    text: 'In a live coding round: (1) restate the problem in your own words, (2) ask clarifying questions about edge cases and constraints, (3) state a brute-force approach and its complexity first, (4) only then optimize, (5) narrate your thinking while coding, (6) dry-run with a test case before saying "done".',
  },
  {
    id: 'company-faang-pattern',
    tags: ['faang', 'google', 'amazon', 'microsoft', 'meta', 'company specific'],
    text: 'FAANG-style companies typically run 4-6 rounds: 1-2 DSA/coding rounds, 1 system design (mid-senior+), 1-2 behavioral rounds mapped to leadership principles (especially Amazon), and a hiring manager/bar-raiser round. Amazon in particular expects every answer to map to one of its Leadership Principles using STAR.',
  },
  {
    id: 'company-service-based',
    tags: ['tcs', 'infosys', 'wipro', 'accenture', 'cognizant', 'service based', 'fresher'],
    text: 'Indian service-based companies (TCS, Infosys, Wipro, Accenture, Cognizant) typically test: aptitude (quant, logical reasoning, verbal), a coding test (easy-medium, 2-3 problems), a technical interview (CS fundamentals: OOPs, DBMS, OS, CN + your resume projects), and an HR round focused on communication and willingness to relocate/shift work.',
  },
  {
    id: 'confidence-nervousness',
    tags: ['confidence', 'nervous', 'anxiety', 'communication'],
    text: 'To reduce interview nervousness: do 2-3 timed mock interviews beforehand, prepare a 1-page "story bank" of 5-6 achievements you can adapt to any behavioral question, practice power poses/breathing for 2 minutes before, and reframe nerves as "excitement" - the physiological response is nearly identical.',
  },
  {
    id: 'salary-negotiation',
    tags: ['salary', 'negotiation', 'offer', 'compensation'],
    text: 'When negotiating: never give a number first if avoidable, give a researched range instead of a single figure, always express enthusiasm for the role before pushing back on numbers, and negotiate the full package (base + bonus + equity + joining bonus + notice period buyout) not just base salary.',
  },
];

function retrieve(query, topK = 3) {
  const q = query.toLowerCase();
  const scored = KNOWLEDGE.map((item) => {
    let score = 0;
    for (const tag of item.tags) {
      if (q.includes(tag)) score += 2;
    }
    // loose word overlap
    const words = q.split(/\W+/).filter(Boolean);
    for (const w of words) {
      if (w.length > 3 && item.text.toLowerCase().includes(w)) score += 0.3;
    }
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.item.text);
}

module.exports = { retrieve, KNOWLEDGE };
