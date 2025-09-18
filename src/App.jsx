// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  JsonRpcProvider,
  BrowserProvider,
  Contract,
  formatUnits,
  parseUnits,
} from "ethers";

// ===== EDIT THESE =====
const ARB_RPC      = "https://arb1.arbitrum.io/rpc";
const LET_ADDRESS  = "0xD47B8Fb7A323cB095Ec80BE7a704AF0e9ef5Cc72"; // <- set your LETSynthetic
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const USDC_DECIMALS = 6;

// Minimal ABIs
const LET_ABI = [
  "function price1e18() view returns (uint256)",
  // Change this if your function name or args differ:
  "function mint(uint256 usdcAmount) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

export default function App() {
  // Public price provider
  const publicProvider = useMemo(() => new JsonRpcProvider(ARB_RPC), []);

  // Wallet state
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  // On-chain state
  const [price, setPrice] = useState("—");
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [letBalance, setLetBalance] = useState(null);
  const [allowance, setAllowance] = useState(null);

  // UI state
  const [amount, setAmount] = useState(""); // USDC input
  const parsedAmount = useMemo(() => {
    try { return amount ? parseUnits(amount, USDC_DECIMALS) : 0n; }
    catch { return 0n; }
  }, [amount]);

  const [approving, setApproving] = useState(false);
  const [minting, setMinting] = useState(false);
  const [msg, setMsg] = useState("");

  // Derived step for pulse: 1 Connect → 2 Approve → 3 Mint
  const step = useMemo(() => {
    if (!account) return 1;
    if (allowance === null || allowance === undefined) return 2;
    return BigInt(allowance) >= BigInt(parsedAmount || 0n) ? 3 : 2;
  }, [account, allowance, parsedAmount]);

  // Fetch public price
  useEffect(() => {
    async function fetchPrice() {
      try {
        const c = new Contract(LET_ADDRESS, LET_ABI, publicProvider);
        const p = await c.price1e18();
        setPrice((Number(p) / 1e18).toFixed(8));
      } catch (e) { console.error(e); }
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => clearInterval(id);
  }, [publicProvider]);

  // Fetch balances & allowance after connect
  useEffect(() => {
    if (!account || !provider) return;
    (async () => {
      try {
        await Promise.all([refreshUSDC(), refreshLET(), refreshAllowance()]);
      } catch (e) { console.error(e); }
    })();
  }, [account, provider]);

  // Lightly refresh allowance when amount changes (keeps steps in sync)
  useEffect(() => {
    if (!account) return;
    const t = setTimeout(() => { refreshAllowance().catch(()=>{}); }, 150);
    return () => clearTimeout(t);
  }, [amount, account]);

  // Connect wallet
  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setMsg("Install a Web3 wallet (MetaMask, Rabby, etc.)");
        return;
      }
      const _provider = new BrowserProvider(window.ethereum);
      const _signer = await _provider.getSigner();
      const addr = await _signer.getAddress();
      setProvider(_provider);
      setSigner(_signer);
      setAccount(addr);

      // events
      window.ethereum.on?.("accountsChanged", (accs) => {
        if (accs && accs[0]) {
          setAccount(accs[0]);
          // force refresh on next render
          setAllowance(null);
          setUsdcBalance(null);
          setLetBalance(null);
        } else {
          setAccount(null);
          setSigner(null);
        }
      });
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Failed to connect wallet");
    }
  }

  async function refreshUSDC() {
    if (!provider || !account) return;
    const t = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
    setUsdcBalance(await t.balanceOf(account));
  }

  async function refreshLET() {
    if (!provider || !account) return;
    const t = new Contract(LET_ADDRESS, LET_ABI, provider);
    setLetBalance(await t.balanceOf(account));
  }

  async function refreshAllowance() {
    if (!provider || !account) return;
    const t = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
    setAllowance(await t.allowance(account, LET_ADDRESS));
  }

  async function approveUSDC() {
    if (!signer || !parsedAmount) return;
    setApproving(true); setMsg("");
    try {
      const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const tx = await usdc.approve(LET_ADDRESS, parsedAmount);
      await tx.wait();
      await refreshAllowance();
      setMsg("USDC approved ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.shortMessage || e?.message || "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  async function mintLET() {
    if (!signer || !parsedAmount) return;
    setMinting(true); setMsg("");
    try {
      const letc = new Contract(LET_ADDRESS, LET_ABI, signer);
      const tx = await letc.mint(parsedAmount);
      await tx.wait();
      await Promise.all([refreshUSDC(), refreshLET(), refreshAllowance()]);
      setAmount("");
      setMsg("Minted LET 🎉");
    } catch (e) {
      console.error(e);
      setMsg(e?.shortMessage || e?.message || "Mint failed");
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 overflow-x-hidden">
      <style>{`
        @keyframes gradientShift{0%{background-position:0% 40%}50%{background-position:100% 60%}100%{background-position:0% 40%}}
        @keyframes blobMove{0%{transform:translate(-30%,-20%) scale(1)}50%{transform:translate(20%,10%) scale(1.25)}100%{transform:translate(-30%,-20%) scale(1)}}
      `}</style>

      {/* HERO + NARRATIVE */}
      <section
        className="relative w-screen overflow-hidden text-white grid place-items-center px-6"
        style={{
          height: "100svh",
          backgroundImage: "linear-gradient(120deg,#00d1c1,#0077b6,#00d1c1)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 6s ease-in-out infinite",
        }}
      >
        <div className="relative z-10 max-w-5xl mx-auto space-y-6">
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight drop-shadow-lg text-center">
            Invest in Humanity's Time
          </h1>

          <p className="text-lg/8 opacity-95 text-center">
            <strong>Life Expectancy Token (LET)</strong> is a monetary primitive tied to a
            human-centric metric: <strong>global life expectancy</strong>. As people live
            longer, LET becomes more valuable.
          </p>

          <div className="grid md:grid-cols-2 gap-6 text-white/95 text-base leading-7 bg-white/10 backdrop-blur rounded-2xl p-5">
            <div className="space-y-3">
              <h3 className="font-semibold">How it works</h3>
              <p>
                The protocol stores the latest world life expectancy and sets the token
                price as <span className="font-semibold">Price = L (years)</span>.
                You mint LET by depositing USDC and can redeem back to USDC anytime.
              </p>
              <p>
                A small fee on mint/redeem accrues to the protocol to sustain development.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">Why it’s different</h3>
              <p>
                LET is the first currency whose value can grow as we become{" "}
                <span className="font-semibold">kinder to one another</span> — societies
                investing in health, peace and care tend to live longer. LET aligns value
                with human progress and is fully non-custodial.
              </p>
              <p className="text-sm opacity-90">
                Current price: <span className="font-semibold">{price} USDC</span>
                {LET_ADDRESS.startsWith("0xYOUR_") && (
                  <span className="ml-2">(set LET_ADDRESS)</span>
                )}
              </p>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={() =>
                document.getElementById("mint").scrollIntoView({ behavior: "smooth" })
              }
              className="inline-flex items-center gap-2 bg-white text-sky-900 font-semibold rounded-full px-5 py-3 hover:brightness-95 transition"
            >
              Get LET
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* animated blobs */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -top-24 -left-24 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-30"
            style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.6), rgba(255,255,255,0))",
              animation: "blobMove 10s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -bottom-24 -right-24 w-[55vw] h-[55vw] rounded-full blur-3xl opacity-25"
            style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0))",
              animation: "blobMove 12s ease-in-out infinite reverse",
            }}
          />
        </div>
      </section>

      {/* DETAILS (comfortable prose) */}
      <section className="bg-white py-14 px-6">
        <div className="max-w-4xl mx-auto text-neutral-800 space-y-5 leading-7">
          <h2 className="text-2xl font-semibold">Transparent pricing</h2>
          <p>
            LET doesn’t depend on market makers or hidden algorithms. The price references
            the latest global life expectancy (years). If the world adds healthy years,
            the fair price goes up — simple and auditable.
          </p>

          <h3 className="text-xl font-semibold">Fees & sustainability</h3>
          <p>
            A small fee on mint/redeem (e.g. ~0.3%) accrues to the protocol as USDC
            surplus. This helps fund data updates, audits and development of open tooling.
          </p>

          <h3 className="text-xl font-semibold">Risks</h3>
          <p className="opacity-90">
            As with any crypto protocol, smart-contract risk and oracle update cadence
            apply. Never deposit more than you can afford to hold.
          </p>
        </div>
      </section>

      {/* MINT UI */}
      <section id="mint" className="min-h-screen bg-neutral-50 py-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 px-4">
          {/* Left: guided flow */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-6">
            <h2 className="text-2xl font-semibold">Buy / Mint LET</h2>
            <p className="text-sm text-neutral-600">
              Flow: <strong>Connect</strong> → <strong>Approve</strong> USDC for the amount
              you plan to mint → <strong>Mint LET</strong>. Your funds stay in your wallet until you confirm.
            </p>

            {/* Amount input */}
            <div>
              <label className="block text-sm text-neutral-600 mb-2">Amount (USDC)</label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <div className="mt-2 text-xs text-neutral-500">
                USDC balance:{" "}
                {usdcBalance !== null
                  ? Number(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString()
                  : "—"}
              </div>
            </div>

            {/* Steps */}
            {!account && (
              <button
                onClick={connectWallet}
                className="relative w-full rounded-xl px-4 py-3 bg-black text-white font-medium flex items-center justify-center gap-2"
              >
                {step === 1 && (
                  <span className="absolute -left-3 top-1.5 h-2.5 w-2.5 rounded-full animate-ping bg-emerald-400" />
                )}
                Connect Wallet
              </button>
            )}

            <button
              onClick={approveUSDC}
              disabled={step < 2 || approving || !parsedAmount}
              className={`relative w-full rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 ${
                step >= 2
                  ? "bg-emerald-600 text-white hover:brightness-110 disabled:opacity-50"
                  : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
              }`}
            >
              {step === 2 && (
                <span className="absolute -left-3 top-1.5 h-2.5 w-2.5 rounded-full animate-ping bg-emerald-400" />
              )}
              {approving ? "Approving…" : "Approve USDC"}
            </button>

            <button
              onClick={mintLET}
              disabled={step < 3 || minting || !parsedAmount}
              className={`relative w-full rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 ${
                step >= 3
                  ? "bg-indigo-600 text-white hover:brightness-110 disabled:opacity-50"
                  : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
              }`}
            >
              {step === 3 && (
                <span className="absolute -left-3 top-1.5 h-2.5 w-2.5 rounded-full animate-ping bg-emerald-400" />
              )}
              {minting ? "Minting…" : "Mint LET"}
            </button>

            {msg && (
              <div className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
                {msg}
              </div>
            )}
          </div>

          {/* Right: friendly explainer */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-5">
            <h3 className="text-xl font-semibold">What you’ll get</h3>
            <p className="text-neutral-700 leading-7">
              For each <strong>1 USDC</strong> you deposit, the contract calculates how
              many LET correspond to today’s price (
              <strong>{price} USDC per LET</strong>). You can redeem later back to USDC.
            </p>

            <h4 className="font-semibold">Why price moves slowly</h4>
            <p className="text-neutral-700 leading-7">
              Price follows life expectancy, which changes gradually with new public
              data. This makes LET less volatile and more aligned with real-world progress.
            </p>

            <h4 className="font-semibold">Your balances</h4>
            <ul className="text-sm text-neutral-700 space-y-1">
              <li>
                LET:{" "}
                {letBalance !== null
                  ? Number(formatUnits(letBalance, 18)).toLocaleString()
                  : "—"}
              </li>
              <li>
                USDC:{" "}
                {usdcBalance !== null
                  ? Number(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString()
                  : "—"}
              </li>
              <li>
                Allowance to LET:{" "}
                {allowance !== null
                  ? Number(formatUnits(allowance, USDC_DECIMALS)).toLocaleString()
                  : "—"}{" "}
                USDC
              </li>
            </ul>

            <div className="text-xs text-neutral-500 leading-6">
              Tip: If the <strong>Mint</strong> button stays disabled, make sure your
              USDC <em>allowance</em> (above) is ≥ your entered amount. Click{" "}
              <strong>Approve</strong> again to raise it.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
