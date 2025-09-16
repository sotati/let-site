// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, Interface } from "ethers";

/** ====== EDIT THESE ====== */
const LET_ADDRESS   = "0xD47B8Fb7A323cB095Ec80BE7a704AF0e9ef5Cc72";                  // ← твоя адреса LETSynthetic на Arbitrum One
const USDC_ADDRESS  = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // USDC (Arbitrum One)
const CHAIN_ID_HEX  = "0xa4b1";                                     // Arbitrum One chainId
const ARB_RPC       = "https://arb1.arbitrum.io/rpc";               // публічний RPC для рід-онлі
const LOGO_URL      = "/LET_logo.png";

/** ====== Minimal ABIs ====== */
const LET_ABI = [
  "function price1e18() view returns (uint256)",
  "function mint(uint256 payAmt) returns (uint256)",
  "function redeem(uint256 shares) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

/** ====== Helpers ====== */
const fmt = (v, d = 18, dp = 6) => {
  try { return (Number(v) / 10 ** Number(d)).toFixed(dp); } catch { return "0"; }
};

export default function App() {
  /** Public read-only (ціна, навіть без гаманця) */
  const publicProvider = useMemo(() => new JsonRpcProvider(ARB_RPC), []);
  const letIf = useMemo(() => new Interface(LET_ABI), []);
  const ercIf = useMemo(() => new Interface(ERC20_ABI), []);
  const letReadPublic  = useMemo(() => new Contract(LET_ADDRESS, letIf, publicProvider), [publicProvider, letIf]);
  const usdcReadPublic = useMemo(() => new Contract(USDC_ADDRESS, ercIf, publicProvider), [publicProvider, ercIf]);

  /** Wallet state */
  const [providerRaw, setProviderRaw] = useState(null);
  const [signer, setSigner]           = useState(null);
  const [account, setAccount]         = useState(null);
  const [chainOk, setChainOk]         = useState(false);

  /** On-chain data */
  const [price, setPrice]         = useState("—");
  const [letBal, setLetBal]       = useState("0");
  const [usdcBal, setUsdcBal]     = useState("0");
  const [usdcOnLet, setUsdcOnLet] = useState("0");
  const [letDec, setLetDec]       = useState(18);
  const [usdcDec, setUsdcDec]     = useState(6);

  /** UI state */
  const [mintInput, setMintInput]     = useState("1.00");
  const [redeemInput, setRedeemInput] = useState("0.00");
  const [busy, setBusy]               = useState(false);
  const [toast, setToast]             = useState("");

  /** Contracts with signer/provider */
  const contracts = useMemo(() => {
    if (!providerRaw) return {};
    const p = new BrowserProvider(providerRaw);
    return {
      provider: p,
      letRead:  new Contract(LET_ADDRESS, letIf, p),
      letWrite: signer ? new Contract(LET_ADDRESS, letIf, signer) : null,
      usdcRead:  new Contract(USDC_ADDRESS, ercIf, p),
      usdcWrite: signer ? new Contract(USDC_ADDRESS, ercIf, signer) : null,
    };
  }, [providerRaw, signer, letIf, ercIf]);

  /** Connect */
  async function connect() {
    if (!window.ethereum) return alert("Please install MetaMask");
    const prov = window.ethereum;
    setProviderRaw(prov);

    const accounts = await prov.request({ method: "eth_requestAccounts" });
    setAccount(accounts[0]);

    const chainId = await prov.request({ method: "eth_chainId" });
    setChainOk(chainId === CHAIN_ID_HEX);

    const s = await new BrowserProvider(prov).getSigner();
    setSigner(s);

    prov.on?.("accountsChanged", (accs) => setAccount(accs?.[0] || null));
    prov.on?.("chainChanged", (cid) => setChainOk(cid === CHAIN_ID_HEX));
  }

  async function addArbitrumNetwork() {
    if (!window.ethereum) return alert("Install MetaMask");
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: "Arbitrum One",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [ARB_RPC],
          blockExplorerUrls: ["https://arbiscan.io"],
        }],
      });
    } catch (e) { console.error(e); }
  }

  async function addTokenToMetaMask() {
    if (!window.ethereum) return alert("Install MetaMask");
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: LET_ADDRESS, symbol: "LET", decimals: 18, image: LOGO_URL } },
      });
    } catch (e) { console.error(e); }
  }

  /** Read chain (ціна завжди з public, баланси за наявності гаманця) */
  async function refresh() {
    try {
      const [p1e18, _letDec, _usdcDec] = await Promise.all([
        letReadPublic.price1e18(),
        letReadPublic.decimals(),
        usdcReadPublic.decimals(),
      ]);
      setLetDec(Number(_letDec));
      setUsdcDec(Number(_usdcDec));
      setPrice((Number(p1e18) / 1e18).toFixed(8));

      if (account && contracts.provider) {
        const [_letBal, _usdcBal, _usdcOnLet] = await Promise.all([
          contracts.letRead.balanceOf(account),
          contracts.usdcRead.balanceOf(account),
          contracts.usdcRead.balanceOf(LET_ADDRESS),
        ]);
        setLetBal(fmt(_letBal, Number(_letDec), 8));
        setUsdcBal(fmt(_usdcBal, Number(_usdcDec), 6));
        setUsdcOnLet(fmt(_usdcOnLet, Number(_usdcDec), 6));
      }
    } catch (e) { console.error(e); }
  }
  useEffect(() => { refresh(); }, [account, contracts.provider]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, []);

  /** Actions */
  async function doApprove() {
    if (!contracts.usdcWrite) return;
    setBusy(true); setToast("Approving USDC...");
    try {
      const amount = BigInt(Math.round(parseFloat(mintInput || "0") * 10 ** usdcDec));
      const tx = await contracts.usdcWrite.approve(LET_ADDRESS, amount);
      await tx.wait();
      setToast("Approve confirmed");
      await refresh();
    } catch (e) { console.error(e); setToast(e?.shortMessage || e?.message || "Approve failed"); }
    finally { setBusy(false); }
  }

  async function doMint() {
    if (!contracts.letWrite) return;
    setBusy(true); setToast("Minting LET...");
    try {
      const pay = BigInt(Math.round(parseFloat(mintInput || "0") * 10 ** usdcDec));
      const tx = await contracts.letWrite.mint(pay);
      await tx.wait();
      setToast("Mint confirmed");
      setRedeemInput("");
      await refresh();
    } catch (e) { console.error(e); setToast(e?.shortMessage || e?.message || "Mint failed"); }
    finally { setBusy(false); }
  }

  async function doRedeem() {
    if (!contracts.letWrite) return;
    setBusy(true); setToast("Redeeming LET...");
    try {
      const shares = BigInt(Math.round(parseFloat(redeemInput || "0") * 10 ** letDec));
      const tx = await contracts.letWrite.redeem(shares);
      await tx.wait();
      setToast("Redeem confirmed");
      await refresh();
    } catch (e) { console.error(e); setToast(e?.shortMessage || e?.message || "Redeem failed"); }
    finally { setBusy(false); }
  }

  const connected = Boolean(account);
  function scrollToApp() {
    const el = document.getElementById("app");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 overflow-x-hidden">
      {/* Stronger hero animation + blobs */}
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 40% }
          50%  { background-position: 100% 60% }
          100% { background-position: 0% 40% }
        }
        @keyframes blobMove {
          0%   { transform: translate(-30%,-20%) scale(1) }
          50%  { transform: translate(20%,10%)   scale(1.25) }
          100% { transform: translate(-30%,-20%) scale(1) }
        }
      `}</style>

      {/* HERO */}
      <section
        className="relative h-[100svh] w-screen overflow-hidden text-white grid place-items-center px-6"
        style={{
          backgroundImage: "linear-gradient(120deg,#00d1c1,#0077b6,#00d1c1)",
          backgroundSize: "220% 220%",
          animation: "gradientShift 6s ease-in-out infinite"
        }}
      >
        <div className="max-w-4xl text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight drop-shadow-lg">
            Invest in Humanity&apos;s Time
          </h1>

          <p className="mt-4 text-lg/7 opacity-95">
            <strong>LET</strong> is a monetary primitive tied to a human-centric metric:
            <strong> global life expectancy</strong>. As people live longer, LET becomes more valuable.
          </p>

          <div className="mt-6 text-base/7 opacity-95 space-y-3">
            <p>
              <strong>What LET tracks.</strong> The protocol stores the latest <em>world life expectancy</em>
              (from public data), and sets token price as <strong>Price = Life Expectancy (years)</strong>.
            </p>
            <p>
              <strong>Why it’s different.</strong> LET is the first currency whose value can grow as
              <strong> we become kinder to one another</strong> — because societies that invest in peace,
              care and health tend to live <em>longer</em>.
            </p>
            <p>
              <strong>How it works.</strong> Mint LET by depositing USDC; redeem back to USDC anytime.
              A small <strong>0.3%</strong> fee on mint/redeem accrues as protocol surplus to sustain development.
            </p>
            <p>
              <strong>Why it matters.</strong> LET aligns value with human progress, is transparent
              (no black boxes), and is fully non-custodial — your funds stay in your wallet.
            </p>
          </div>

          <div className="mt-6 text-sm opacity-90">
            Current price: <span className="font-semibold">{price} USDC</span>
            {LET_ADDRESS.startsWith("0xYOUR_") ? (
              <span className="ml-2 text-xs opacity-80">(set LET_ADDRESS)</span>
            ) : null}
          </div>
        </div>

        {/* animated light blobs */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -top-24 -left-24 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-30"
            style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.6), rgba(255,255,255,0))",
              animation: "blobMove 10s ease-in-out infinite"
            }}
          />
          <div
            className="absolute -bottom-24 -right-24 w-[55vw] h-[55vw] rounded-full blur-3xl opacity-25"
            style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0))",
              animation: "blobMove 12s ease-in-out infinite reverse"
            }}
          />
        </div>

        {/* down arrow */}
        <button
          onClick={scrollToApp}
          className="absolute bottom-10 w-12 h-12 rounded-full border-2 border-white flex items-center justify-center animate-bounce"
          aria-label="Scroll to app"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* ====== DAPP SECTION ====== */}
      <section id="app" className="scroll-mt-20 border-t bg-neutral-50/50">
        <div className="max-w-6xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00D1C1] grid place-items-center text-white font-bold">LET</div>
              <div className="text-sm text-neutral-600">Price grows with humanity</div>
            </div>
            <div className="flex items-center gap-2">
              {!chainOk && (
                <button onClick={addArbitrumNetwork} className="px-3 py-1 rounded-2xl border bg-white hover:bg-neutral-50 text-sm">
                  Add/Switch Arbitrum
                </button>
              )}
              <button onClick={addTokenToMetaMask} className="px-3 py-1 rounded-2xl border bg-white hover:bg-neutral-50 text-sm">
                Add LET
              </button>
              {!connected ? (
                <button onClick={connect} className="px-4 py-2 rounded-2xl shadow-sm border bg-neutral-900 text-white hover:opacity-90">
                  Connect Wallet
                </button>
              ) : (
                <div className="px-3 py-1 rounded-2xl border text-sm bg-white">{account.slice(0,6)}…{account.slice(-4)}</div>
              )}
            </div>
          </div>

          {/* Price + Contracts */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 p-6 rounded-2xl border shadow-sm bg-white">
              <h3 className="text-xl font-semibold mb-2">Current Price</h3>
              <div className="text-4xl font-extrabold tracking-tight">{price === "—" ? "—" : `${price} USDC`}</div>
              <p className="text-sm text-neutral-500 mt-2">
                Price = Global Life Expectancy × 1.0 (USDC). Updated via on-chain oracle.
              </p>
            </div>
            <div className="p-6 rounded-2xl border shadow-sm bg-white">
              <h3 className="font-semibold mb-2">Contracts</h3>
              <div className="text-xs break-all">
                <div className="text-neutral-500">LET</div>
                <a className="underline" href={`https://arbiscan.io/address/${LET_ADDRESS}`} target="_blank" rel="noreferrer">
                  {LET_ADDRESS}
                </a>
              </div>
              <div className="text-xs break-all mt-2">
                <div className="text-neutral-500">USDC</div>
                <a className="underline" href={`https://arbiscan.io/address/${USDC_ADDRESS}`} target="_blank" rel="noreferrer">
                  {USDC_ADDRESS}
                </a>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 grid md:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl border shadow-sm bg-white">
              <h3 className="font-semibold">Balances</h3>
              <div className="mt-3 text-sm space-y-1">
                <div>USDC (you): <span className="font-medium">{usdcBal}</span></div>
                <div>LET (you): <span className="font-medium">{letBal}</span></div>
                <div>USDC (on LET): <span className="font-medium">{usdcOnLet}</span></div>
              </div>
              <button onClick={refresh} className="mt-4 w-full px-4 py-2 rounded-2xl border bg-white hover:bg-neutral-50">
                Refresh
              </button>
            </div>

            <div className="p-6 rounded-2xl border shadow-sm bg-white">
              <h3 className="font-semibold">Buy LET (Mint)</h3>
              <label className="text-sm text-neutral-600">Amount in USDC</label>
              <input
                value={mintInput}
                onChange={(e)=>setMintInput(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-[#00D1C1]"
                placeholder="1.00"
              />
              <div className="flex gap-2 mt-3">
                <button disabled={busy || !connected} onClick={doApprove} className="flex-1 px-4 py-2 rounded-2xl border bg-white hover:bg-neutral-50 disabled:opacity-50">Approve</button>
                <button disabled={busy || !connected} onClick={doMint} className="flex-1 px-4 py-2 rounded-2xl bg-[#00D1C1] text-white hover:opacity-90 disabled:opacity-50">Mint</button>
              </div>
              <p className="text-xs text-neutral-500 mt-2">Fee 0.3% is taken on mint.</p>
            </div>

            <div className="p-6 rounded-2xl border shadow-sm bg-white">
              <h3 className="font-semibold">Sell LET (Redeem)</h3>
              <label className="text-sm text-neutral-600">Amount in LET</label>
              <input
                value={redeemInput}
                onChange={(e)=>setRedeemInput(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-[#00D1C1]"
                placeholder="0.10"
              />
              <button disabled={busy || !connected} onClick={doRedeem} className="mt-3 w-full px-4 py-2 rounded-2xl bg-neutral-900 text-white hover:opacity-90 disabled:opacity-50">
                Redeem
              </button>
              <p className="text-xs text-neutral-500 mt-2">Fee 0.3% is taken on redeem.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl shadow-lg border bg-white text-sm">
          {toast}
        </div>
      )}

      <footer className="max-w-6xl mx-auto px-4 py-12 text-sm text-neutral-500">
        © 2025 LET — Life Expectancy Token.
      </footer>
    </div>
  );
}
