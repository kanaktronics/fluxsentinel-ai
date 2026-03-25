import dotenv from 'dotenv';
dotenv.config();

import { sendMRBrief } from './src/tools/emailer.js';

async function test() {
  const result = await sendMRBrief({
    mr: { iid: 852, title: "GitLab Hackathon Live Email Demo", author: { name: "FluxSentinel Engineer" }, source_branch: "production-deploy" },
    project: { name: "fluxsentinel-ai" },
    audit: { findings: [] },
    risk: { score: 0, label: "LOW", reasoning: "All checks passed brilliantly." },
    green: { pipelinesSaved: 42, co2Saved: 1050, impact: "Saved 42 pipelines" },
    user: { email: "kdproductions.help@gmail.com" } // <--- Testing the newly added per-tenant custom email parameter
  });
  console.log("Result:", result);
}

test();
