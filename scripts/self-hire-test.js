import { readFileSync } from "node:fs";
import {
  AcpAgent,
  PrivyAlchemyEvmProviderAdapter,
  SocketTransport,
  AssetToken,
} from "@virtuals-protocol/acp-node-v2";
import { base } from "viem/chains";

const ENV_PATH = "/opt/grey/wpv-agent/.env";
const GREY_WALLET = "0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f";
const CHAIN_ID = 8453;
const TOKEN_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const OFFERING_NAME = "project_legitimacy_scan";
const TIMEOUT_MS = 3 * 60 * 1000;

function loadEnv(path) {
  const text = readFileSync(path, "utf-8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function log(msg) {
  console.log(`[self-hire ${new Date().toISOString()}] ${msg}`);
}

async function main() {
  loadEnv(ENV_PATH);

  const walletAddress = process.env.ACP_AGENT_WALLET_ADDRESS;
  const walletId = process.env.ACP_PRIVY_WALLET_ID;
  const signerPrivateKey = process.env.ACP_PRIVY_SIGNER_KEY;
  if (!walletAddress || !walletId || !signerPrivateKey) {
    throw new Error("Missing ACP env vars (ACP_AGENT_WALLET_ADDRESS / ACP_PRIVY_WALLET_ID / ACP_PRIVY_SIGNER_KEY)");
  }
  log(`buyer=${walletAddress} provider=${GREY_WALLET} (same=${walletAddress.toLowerCase() === GREY_WALLET.toLowerCase()})`);

  log("Creating Privy provider...");
  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress,
    walletId,
    signerPrivateKey,
    chains: [base],
  });

  log("Creating AcpAgent...");
  const agent = await AcpAgent.create({
    provider,
    transport: new SocketTransport(),
  });

  let targetJobId = null;
  let funded = false;
  let completed = false;
  let rejected = false;
  let rejectReason = null;

  agent.on("entry", async (session, entry) => {
    try {
      if (entry.kind !== "system") return;
      if (targetJobId && entry.onChainJobId !== targetJobId.toString()) return;
      const ev = entry.event;
      log(`event: ${ev.type} job=${entry.onChainJobId}`);

      if (ev.type === "budget.set" && !funded) {
        funded = true;
        log(`budget.set amount=${ev.amount} — funding...`);
        try {
          await session.fund(AssetToken.usdc(ev.amount, CHAIN_ID));
          log("fund tx submitted");
        } catch (e) {
          log(`FUND ERROR: ${e?.message ?? e}`);
        }
      }

      if (ev.type === "job.submitted") {
        log("job.submitted — calling complete...");
        try {
          await session.complete("Self-hire test verified");
          log("complete tx submitted");
        } catch (e) {
          log(`COMPLETE ERROR: ${e?.message ?? e}`);
        }
      }

      if (ev.type === "job.completed") {
        completed = true;
        log(`job.completed reason=${ev.reason}`);
      }

      if (ev.type === "job.rejected") {
        rejected = true;
        rejectReason = ev.reason;
        log(`job.rejected reason=${ev.reason}`);
      }

      if (ev.type === "job.expired") {
        rejected = true;
        rejectReason = "expired";
        log("job.expired");
      }
    } catch (e) {
      log(`entry handler error: ${e?.message ?? e}`);
    }
  });

  log("Starting agent...");
  await agent.start();

  log(`Looking up Grey by wallet ${GREY_WALLET}...`);
  const grey = await agent.getAgentByWalletAddress(GREY_WALLET);
  if (!grey) {
    log("Grey not found via getAgentByWalletAddress — trying browseAgents...");
    const results = await agent.browseAgents("whitepaper", { topK: 10 });
    log(`browseAgents returned ${results.length}`);
    for (const r of results) log(`  - ${r.name} (${r.walletAddress})`);
    throw new Error("Grey not resolvable");
  }
  log(`Found Grey: ${grey.name} — ${grey.offerings.length} offerings`);

  const offering = grey.offerings.find((o) => o.name === OFFERING_NAME);
  if (!offering) throw new Error(`Offering "${OFFERING_NAME}" not found. Available: ${grey.offerings.map(o=>o.name).join(", ")}`);
  log(`Using offering "${offering.name}" price=${offering.priceValue}`);

  log(`Creating job buyer=${walletAddress} provider=${GREY_WALLET} token=${TOKEN_ADDRESS}...`);
  try {
    targetJobId = await agent.createJobFromOffering(
      CHAIN_ID,
      offering,
      GREY_WALLET,
      { token_address: TOKEN_ADDRESS }
    );
    log(`Job created: jobId=${targetJobId.toString()}`);
  } catch (e) {
    log(`CREATE JOB ERROR: ${e?.message ?? e}`);
    const cause = e?.cause ? ` cause=${String(e.cause?.message ?? e.cause)}` : "";
    log(`  details:${cause}`);
    if (e?.stack) console.log(e.stack.split("\n").slice(0, 10).join("\n"));
    try { await agent.stop(); } catch {}
    process.exitCode = 2;
    return;
  }

  const started = Date.now();
  while (!completed && !rejected && Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (completed) {
    log("OUTCOME: SELF-HIRE WORKS — job completed end-to-end");
    process.exitCode = 0;
  } else if (rejected) {
    log(`OUTCOME: SELF-HIRE PATH BLOCKED BY REJECT/EXPIRY — reason=${rejectReason}`);
    process.exitCode = 3;
  } else {
    log("OUTCOME: TIMEOUT (no completion or rejection within 3 min)");
    process.exitCode = 4;
  }

  try { await agent.stop(); } catch {}
}

main().catch((e) => {
  console.log(`[self-hire FATAL] ${e?.message ?? e}`);
  if (e?.stack) console.log(e.stack.split("\n").slice(0, 12).join("\n"));
  process.exit(1);
});
