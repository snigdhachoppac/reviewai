import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { runReview } from "./engine.js";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null, // Required for BullMQ
});

export const reviewQueue = new Queue("pr-reviews", { connection });

// Worker picks up jobs and runs the AI review
const worker = new Worker(
  "pr-reviews",
  async (job) => {
    console.log(`⚙️  Processing review job ${job.id}: ${job.data.repoFullName}#${job.data.prNumber}`);
    const result = await runReview(job.data);
    console.log(`✅ Review complete: ${result.comments.length} comments posted`);
    return result;
  },
  {
    connection,
    concurrency: 3, // Review up to 3 PRs simultaneously
  }
);

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

export { worker };
